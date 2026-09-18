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

async function runAudit() {
  await connectDB();
  console.log("Connected to DB.");

  const p1Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1279).png";
  const p2Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot 2026-09-08 140156.png";
  
  const p3Candidates = [
    "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1307).png",
    "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1308).png",
    "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1309).png",
  ];

  const products = await Product.find({}).select("name category images image price").lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));
  console.log(`Loaded ${products.length} products from DB.`);

  const vectors = await ProductVisualVector.find({}).lean();
  console.log(`Loaded ${vectors.length} visual vectors from DB.`);

  const fairyId = "6a8983a438c8c89855e85110";

  console.log("\n=======================================================");
  console.log("ANALYSIS: Request 1 (Screenshot (1279).png)");
  console.log("=======================================================");
  await analyzeImage(p1Path, "Request 1: Screenshot (1279).png", vectors, productMap);

  console.log("\n=======================================================");
  console.log("ANALYSIS: Request 2 (Screenshot 2026-09-08 140156.png)");
  console.log("=======================================================");
  await analyzeImage(p2Path, "Request 2: Screenshot 2026-09-08 140156.png", vectors, productMap);

  console.log("\n=======================================================");
  console.log("ANALYSIS: Request 3 Candidates (Which one matched 6a8983a438c8c89855e85110 with hash 0.861?)");
  console.log("=======================================================");
  for (const cPath of p3Candidates) {
    if (fs.existsSync(cPath)) {
      await testHashMatch(cPath, fairyId, productMap);
    }
  }

  process.exit(0);
}

async function analyzeImage(filePath, label, vectors, productMap) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const meta = await sharp(buffer).metadata();
  console.log(`\n--- Metadata for ${label} ---`);
  console.log(`Dimensions: ${meta.width}x${meta.height}, format: ${meta.format}, channels: ${meta.channels}`);
  const totalPixels = meta.width * meta.height;

  // 1. Run Hybrid Fallback as production calls it
  console.log(`\n--- Production Hybrid Fallback Execution ---`);
  const hybridResult = await runHybridFallback(buffer, { requestId: "forensic-audit" });
  console.log("Hybrid result confidence:", hybridResult.confidence);
  console.log("Hybrid result candidate count:", hybridResult.candidates?.length || 0);
  console.log("Can promote?:", shouldPromoteHybridFallback(hybridResult));

  // Top candidates
  if (hybridResult.candidates) {
    console.log("\nTop candidates from runHybridFallback:");
    hybridResult.candidates.slice(0, 6).forEach((c, i) => {
      console.log(`  [Rank ${i + 1}] ID: ${c._id} | Score: ${c.score?.toFixed(4)} | Name: "${c.name}" | Region: ${JSON.stringify(c.winningRegion?.box || c.winningRegion)}`);
    });
  }

  // 2. Extract photometric candidates and inspect candidate generation
  console.log(`\n--- Photometric Candidate Regions Inspection ---`);
  const photoCandidates = await proposeSalientCandidateRegions(buffer);
  console.log(`Generated ${photoCandidates.length} candidate regions.`);
  photoCandidates.forEach((c, i) => {
    const box = { left: c.left, top: c.top, width: c.width, height: c.height };
    const area = box.width * box.height;
    const pct = ((area / totalPixels) * 100).toFixed(2);
    console.log(`  Cand #${i}: name=${c.name} [left=${box.left}, top=${box.top}, w=${box.width}, h=${box.height}] -> Area: ${area}px² (${pct}% of viewport)`);
  });

  // 3. Full catalog similarity breakdown on Full Image vs winning candidate
  console.log(`\n--- Full Image CLIP Vector Query ---`);
  const fullImgEmb = await extractEmbeddingFromBuffer(buffer);
  const fullScores = [];
  for (const v of vectors) {
    const sim = computeCosineSimilarity(fullImgEmb, v.embedding);
    fullScores.push({ id: v.productId.toString(), score: sim, name: productMap.get(v.productId.toString())?.name });
  }
  const fullMap = new Map();
  for (const s of fullScores) {
    if (!fullMap.has(s.id) || fullMap.get(s.id).score < s.score) {
      fullMap.set(s.id, s);
    }
  }
  const fullRanked = Array.from(fullMap.values()).sort((a, b) => b.score - a.score);
  console.log("Top 5 against FULL IMAGE:");
  fullRanked.slice(0, 5).forEach((r, idx) => {
    console.log(`  #${idx + 1}: ${r.id} (${r.score.toFixed(4)}) - "${r.name}"`);
  });

  // 4. Save debug crops to inspect
  const debugDir = path.resolve("D:/THE GIRL HOUSE/mahalaksmi-api/uploads/forensic_debug");
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const baseName = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9]/g, "_");
  
  fs.copyFileSync(filePath, path.join(debugDir, `${baseName}_orig.png`));
  
  for (let i = 0; i < Math.min(5, photoCandidates.length); i++) {
    const c = photoCandidates[i];
    if (c.box) {
      const cropBuf = await sharp(buffer).extract(c.box).png().toBuffer();
      fs.writeFileSync(path.join(debugDir, `${baseName}_cand_${i}.png`), cropBuf);
    }
  }
  console.log(`Saved debug crops to uploads/forensic_debug/${baseName}_*`);
}

async function testHashMatch(filePath, targetId, productMap) {
  const buffer = fs.readFileSync(filePath);
  const meta = await sharp(buffer).metadata();
  console.log(`\nChecking candidate for request 3: ${path.basename(filePath)} (${meta.width}x${meta.height})...`);
  
  const targetProd = productMap.get(targetId);
  if (!targetProd) return;

  const prodImg = targetProd.images[0];
  let prodBuf;
  if (prodImg.startsWith("http")) {
    const res = await fetch(prodImg);
    prodBuf = Buffer.from(await res.arrayBuffer());
  } else {
    prodBuf = fs.readFileSync(path.resolve("D:/THE GIRL HOUSE/mahalaksmi-api/public", prodImg.replace(/^\//, "")));
  }

  const screenshotFp = await createScreenshotFingerprints(buffer);
  const prodFingerprints = await createCatalogueFingerprints(prodBuf);
  const match = compareScreenshotToCatalogue(screenshotFp, prodFingerprints);
  console.log(`  Hash comparison against Fairy (${targetId}): overallSimilarity=${match?.similarity?.toFixed(4)}, grayscale=${match?.grayscaleSimilarity?.toFixed(4)}, edge=${match?.edgeSimilarity?.toFixed(4)}`);
}

runAudit().catch(err => {
  console.error("Audit error:", err);
  process.exit(1);
});
