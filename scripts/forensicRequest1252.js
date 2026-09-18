import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { runHybridFallback } from "../services/hybridFallbackService.js";
import { extractEmbeddingFromBuffer, computeCosineSimilarity } from "../services/clipVisualSearchService.js";
import { createScreenshotFingerprints, createCatalogueFingerprints, compareScreenshotToCatalogue } from "../utils/imageHash.js";

async function runForensic() {
  await connectDB();
  console.log("Connected to MongoDB.");

  const pPath = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1252).png";
  if (!fs.existsSync(pPath)) {
    console.error("File not found:", pPath);
    process.exit(1);
  }

  const queryBuf = fs.readFileSync(pPath);
  const queryMeta = await sharp(queryBuf).metadata();
  console.log(`Query Dimensions: ${queryMeta.width}x${queryMeta.height}`);

  // 1. Run Production Hybrid Fallback
  console.log("\n=======================================================");
  console.log("RUNNING PRODUCTION HYBRID FALLBACK");
  console.log("=======================================================");
  const fb = await runHybridFallback(queryBuf, { requestId: "a4dfcd81-5dc2-4f1b-bf7b-2c31a4e939b5" });

  console.log("Hybrid Fallback Result:");
  console.log("  Confidence Level:    ", fb.confidence?.level);
  console.log("  Top Score:           ", fb.confidence?.score);
  console.log("  Top Margin:          ", fb.confidence?.margin);
  console.log("  Region Agreement:    ", fb.confidence?.regionAgreement);
  console.log("  Image Type / Framing:", fb.confidence?.imageType);
  console.log("  Winning Region:      ", fb.winningRegion);

  const products = await Product.find({}).lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  console.log("\nTop Candidates from Hybrid Fallback:");
  fb.similarCandidates?.slice(0, 5).forEach((c, idx) => {
    console.log(`  Rank #${idx + 1}: ID: ${c._id} | Score: ${c.score?.toFixed(4)} | Margin: ${c.margin?.toFixed(4)} | Name: "${c.name}" | Region: ${JSON.stringify(c.winningRegion)}`);
  });

  // 2. Extract Candidate Coordinates from Multi-Candidate Proposal
  console.log("\n=======================================================");
  console.log("PROPOSED CANDIDATE COORDINATES");
  console.log("=======================================================");
  // Let's inspect the photometric / multi-scale candidate generator used inside hybridFallbackService
  const { generatePhotometricCandidates } = await import("../services/salientRegionService.js").catch(() => ({}));
  // Or import directly from salientRegionService
  const { proposeSalientCandidateRegions } = await import("../services/salientRegionService.js");
  const candidates = await proposeSalientCandidateRegions(queryBuf);
  candidates.forEach((c, idx) => {
    console.log(`  Candidate #${idx} (${c.name}): left=${c.left}, top=${c.top}, width=${c.width}, height=${c.height}`);
  });

  // 3. Expected Product Details
  console.log("\n=======================================================");
  console.log("EXPECTED / TRUE PRODUCT IDENTIFICATION");
  console.log("=======================================================");
  // The screenshot URL is: the-girl-ho-se.vercel.app/products/necklace-1.png
  // In DB, necklace-1.png corresponds to:
  // 6a883d48b479512538b2bbb1: "Traditional Gold Plated Delicate Pendant Necklace"
  // and duplicate 6a8983a338c8c89855e850f2: "Traditional Gold Plated Minimalist Pendant Necklace"
  const expectedProd1 = productMap.get("6a883d48b479512538b2bbb1");
  const expectedProd2 = productMap.get("6a8983a338c8c89855e850f2");
  console.log(`Expected Product 1: ID: ${expectedProd1?._id} | Name: "${expectedProd1?.name}"`);
  console.log(`Expected Product 2 (Twin): ID: ${expectedProd2?._id} | Name: "${expectedProd2?.name}"`);

  // 4. Compare Query against Expected Product Representations
  console.log("\n=======================================================");
  console.log("CATALOGUE REPRESENTATION COMPARISONS");
  console.log("=======================================================");
  const qEmb = await extractEmbeddingFromBuffer(queryBuf);

  // Load expected product catalogue image
  const catPath = path.resolve("..", "mahalaksmi", "public", "products", "necklace-1.png");
  const catBuf = fs.readFileSync(catPath);
  const catMeta = await sharp(catBuf).metadata();

  // A. Original full image
  const catEmbOrig = await extractEmbeddingFromBuffer(catBuf);
  const scoreOrig = computeCosineSimilarity(qEmb, catEmbOrig);

  // B. Central 65% crop
  const cW = Math.round(catMeta.width * 0.65);
  const cH = Math.round(catMeta.height * 0.65);
  const centerCropBuf = await sharp(catBuf).extract({
    left: Math.round((catMeta.width - cW) / 2),
    top: Math.round((catMeta.height - cH) / 2),
    width: cW,
    height: cH,
  }).toBuffer();
  const catEmbCenter = await extractEmbeddingFromBuffer(centerCropBuf);
  const scoreCenter = computeCosineSimilarity(qEmb, catEmbCenter);

  // C. Photometric crop (jewellery focus)
  const fgW = Math.round(catMeta.width * 0.50);
  const fgH = Math.round(catMeta.height * 0.50);
  const fgCropBuf = await sharp(catBuf).extract({
    left: Math.round((catMeta.width - fgW) / 2),
    top: Math.round((catMeta.height - fgH) / 2) + Math.round(catMeta.height * 0.05),
    width: fgW,
    height: fgH,
  }).toBuffer();
  const catEmbFg = await extractEmbeddingFromBuffer(fgCropBuf);
  const scoreFg = computeCosineSimilarity(qEmb, catEmbFg);

  // D. Dual max score
  const scoreDual = Math.max(scoreOrig, scoreCenter);

  console.log(`Expected Product Representation Scores:`);
  console.log(`  - Original Catalogue Score:     ${scoreOrig.toFixed(4)}`);
  console.log(`  - Central 65% Catalogue Score:  ${scoreCenter.toFixed(4)}`);
  console.log(`  - Photometric Catalogue Score:  ${scoreFg.toFixed(4)}`);
  console.log(`  - Dual Max Score (Orig+Center): ${scoreDual.toFixed(4)}`);

  // 5. Old Perceptual Hash Diagnostic
  console.log("\n=======================================================");
  console.log("PERCEPTUAL HASH DIAGNOSTIC");
  console.log("=======================================================");
  const qFp = await createScreenshotFingerprints(queryBuf);
  const cFp = await createCatalogueFingerprints(catBuf);
  const hashMatch = compareScreenshotToCatalogue(qFp, cFp);
  console.log(`Hash Similarity to Catalogue: ${hashMatch?.similarity?.toFixed(4) || 'N/A'}`);
  console.log(`Hash Grayscale:              ${hashMatch?.grayscaleSimilarity?.toFixed(4) || 'N/A'}`);
  console.log(`Hash Edge:                   ${hashMatch?.edgeSimilarity?.toFixed(4) || 'N/A'}`);

  process.exit(0);
}

runForensic().catch(err => {
  console.error("Forensic Error:", err);
  process.exit(1);
});
