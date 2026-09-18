import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { runHybridFallback, shouldPromoteHybridFallback } from "../services/hybridFallbackService.js";
import { proposeSalientCandidateRegions } from "../services/salientRegionService.js";
import { extractEmbeddingFromBuffer, computeCosineSimilarity } from "../services/clipVisualSearchService.js";
import {
  createScreenshotFingerprints,
  createCatalogueFingerprints,
  compareScreenshotToCatalogue,
} from "../utils/imageHash.js";

async function run() {
  await connectDB();
  const products = await Product.find({}).lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));
  const vectors = await ProductVisualVector.find({}).lean();

  const p1Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1279).png";
  const p2Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot 2026-09-08 140156.png";

  console.log("==================================================");
  console.log("IDENTIFYING REQUEST 2 EXACT PRODUCT");
  console.log("==================================================");
  const p2Buf = fs.readFileSync(p2Path);
  const p2Emb = await extractEmbeddingFromBuffer(p2Buf);
  
  const p2Scores = [];
  for (const prod of products) {
    const pVectors = vectors.filter(v => v.productId.toString() === prod._id.toString());
    let maxSim = -1;
    for (const pv of pVectors) {
      const sim = computeCosineSimilarity(p2Emb, pv.embedding);
      if (sim > maxSim) maxSim = sim;
    }
    p2Scores.push({ id: prod._id.toString(), name: prod.name, category: prod.category, image: prod.images?.[0] || prod.image, score: maxSim });
  }
  p2Scores.sort((a, b) => b.score - a.score);
  console.log("Top 10 Catalogue Products for Request 2:");
  p2Scores.slice(0, 10).forEach((p, idx) => {
    console.log(`  #${idx + 1}: ${p.id} | score: ${p.score.toFixed(4)} | "${p.name}" | image: ${p.image}`);
  });

  console.log("\nTesting Perceptual Hash on Top 3 for Request 2:");
  const p2Fp = await createScreenshotFingerprints(p2Buf);
  for (let i = 0; i < 3; i++) {
    const cand = p2Scores[i];
    const prodDoc = productMap.get(cand.id);
    let imgBuf;
    const imgUrl = prodDoc.images?.[0] || prodDoc.image;
    if (imgUrl.startsWith("http")) {
      imgBuf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
    } else {
      imgBuf = fs.readFileSync(path.resolve("public", imgUrl.replace(/^\//, "")));
    }
    const catFp = await createCatalogueFingerprints(imgBuf);
    const hashRes = compareScreenshotToCatalogue(p2Fp, catFp);
    console.log(`  Product #${i + 1} (${cand.id}): overall=${hashRes?.similarity?.toFixed(4)}, gray=${hashRes?.grayscaleSimilarity?.toFixed(4)}, edge=${hashRes?.edgeSimilarity?.toFixed(4)}`);
  }

  console.log("\n==================================================");
  console.log("REQUEST 1: BOUNDING BOX & COVERAGE ANALYSIS");
  console.log("==================================================");
  const p1Buf = fs.readFileSync(p1Path);
  const p1Meta = await sharp(p1Buf).metadata();
  console.log(`Request 1 Dimensions: ${p1Meta.width}x${p1Meta.height}`);

  const rawP1 = await sharp(p1Buf).raw().toBuffer();
  let minX = p1Meta.width, maxX = 0, minY = p1Meta.height, maxY = 0;
  for (let y = 100; y < 700; y++) {
    for (let x = 300; x < 1050; x++) {
      const idx = (y * p1Meta.width + x) * 4;
      const r = rawP1[idx];
      const g = rawP1[idx + 1];
      const b = rawP1[idx + 2];
      if (r > 45 || g > 45 || b > 45) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const modalBox = { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  const modalArea = modalBox.width * modalBox.height;
  const totalArea1 = p1Meta.width * p1Meta.height;
  console.log("Detected product card image box in Request 1:", modalBox);
  console.log(`Product image area: ${modalArea} px² (${((modalArea / totalArea1) * 100).toFixed(2)}% of viewport)`);

  const p1Regions = await proposeSalientCandidateRegions(p1Buf);
  console.log("\nCandidate regions vs True Product Card Box in Request 1:");
  p1Regions.forEach((r, idx) => {
    const interW = Math.max(0, Math.min(r.left + r.width, modalBox.left + modalBox.width) - Math.max(r.left, modalBox.left));
    const interH = Math.max(0, Math.min(r.top + r.height, modalBox.top + modalBox.height) - Math.max(r.top, modalBox.top));
    const interArea = interW * interH;
    const unionArea = r.width * r.height + modalArea - interArea;
    const iou = unionArea > 0 ? (interArea / unionArea).toFixed(4) : 0;
    const overlap = modalArea > 0 ? (interArea / modalArea).toFixed(4) : 0;
    console.log(`  Cand #${idx} (${r.name}): [${r.left}, ${r.top}, ${r.width}, ${r.height}], IoU: ${iou}, Target Overlap: ${(overlap * 100).toFixed(1)}%`);
  });

  const fb1 = await runHybridFallback(p1Buf, { requestId: "req1-audit" });
  console.log("\nHybrid Fallback on Request 1:");
  console.log("  Confidence:", fb1.confidence);
  console.log("  Exact candidate:", fb1.exactCandidate);
  console.log("  Similar candidates:");
  fb1.similarCandidates?.forEach((c, i) => {
    console.log(`    #${i+1}: ${c._id} (${c.score.toFixed(4)}) - "${c.name}" | region: ${JSON.stringify(c.winningRegion?.box || c.winningRegion)}`);
  });
  const allCandidates1 = [fb1.exactCandidate, ...(fb1.similarCandidates || [])].filter(Boolean);
  const trueProdInFb1 = allCandidates1.findIndex(c => c._id === "6a8983a638c8c89855e8514a");
  console.log(`  True Product 6a8983a638c8c89855e8514a rank in hybrid: ${trueProdInFb1 !== -1 ? (trueProdInFb1 + 1) : 'Not in top candidates'}`);

  console.log("\n==================================================");
  console.log("REQUEST 2: BOUNDING BOX & COVERAGE ANALYSIS");
  console.log("==================================================");
  const p2Meta = await sharp(p2Buf).metadata();
  console.log(`Request 2 Dimensions: ${p2Meta.width}x${p2Meta.height}`);
  const totalArea2 = p2Meta.width * p2Meta.height;
  console.log(`Request 2 total viewport area: ${totalArea2} px²`);
  console.log("Bust + jewellery occupies approx 85-90% of image.");
  
  const fb2 = await runHybridFallback(p2Buf, { requestId: "req2-audit" });
  console.log("\nHybrid Fallback on Request 2:");
  console.log("  Confidence:", fb2.confidence);
  console.log("  Exact candidate:", fb2.exactCandidate);
  console.log("  Similar candidates:");
  fb2.similarCandidates?.forEach((c, i) => {
    console.log(`    #${i+1}: ${c._id} (${c.score.toFixed(4)}) - "${c.name}" | region: ${JSON.stringify(c.winningRegion?.box || c.winningRegion)}`);
  });

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
