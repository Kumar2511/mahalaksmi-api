import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import axios from "axios";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { extractEmbeddingFromBuffer, computeCosineSimilarity } from "../services/clipVisualSearchService.js";

const CACHE_DIR = path.resolve(process.cwd(), ".image_cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

async function getCachedBuffer(url) {
  const filename = path.basename(new URL(url).pathname);
  const cachePath = path.join(CACHE_DIR, filename);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 25000 });
  const buf = Buffer.from(res.data);
  try {
    fs.writeFileSync(cachePath, buf);
  } catch {}
  return buf;
}

/**
 * Generate 3 representations for a catalogue image:
 * 1. Original
 * 2. Central Product Focus (65% center area)
 * 3. Photometric / Salient Crop
 */
async function generateCatalogueRepresentations(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width;
  const height = meta.height;

  // 1. Central crop (65% width and height)
  const cW = Math.round(width * 0.65);
  const cH = Math.round(height * 0.65);
  const cLeft = Math.round((width - cW) / 2);
  const cTop = Math.round((height - cH) / 2);
  const centerBuf = await sharp(buffer)
    .extract({ left: cLeft, top: cTop, width: cW, height: cH })
    .toBuffer();

  // 2. Photometric / Salient Foreground Box (via fast energy grid)
  const sw = 80;
  const sh = Math.max(10, Math.round((height / width) * 80));
  const scaleX = width / sw;
  const scaleY = height / sh;

  const rgbData = await sharp(buffer)
    .resize(sw, sh, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // Compute energy map
  const energy = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;
      const cR = rgbData[idx * 3], cG = rgbData[idx * 3 + 1], cB = rgbData[idx * 3 + 2];
      const rR = rgbData[(idx + 1) * 3], rG = rgbData[(idx + 1) * 3 + 1], rB = rgbData[(idx + 1) * 3 + 2];
      const bR = rgbData[(idx + sw) * 3], bG = rgbData[(idx + sw) * 3 + 1], bB = rgbData[(idx + sw) * 3 + 2];
      const diffX = Math.abs(cR - rR) + Math.abs(cG - rG) + Math.abs(cB - rB);
      const diffY = Math.abs(cR - bR) + Math.abs(cG - bG) + Math.abs(cB - bB);
      energy[idx] = diffX + diffY;
    }
  }

  // Find center-weighted energy bounding box
  let minX = sw, maxX = 0, minY = sh, maxY = 0;
  let totalEnergy = 0;
  for (let i = 0; i < sw * sh; i++) totalEnergy += energy[i];
  const thresh = (totalEnergy / (sw * sh)) * 1.25;

  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      if (energy[y * sw + x] > thresh) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    minX = Math.round(sw * 0.15);
    maxX = Math.round(sw * 0.85);
    minY = Math.round(sh * 0.15);
    maxY = Math.round(sh * 0.85);
  }

  const fgLeft = Math.max(0, Math.round(minX * scaleX));
  const fgTop = Math.max(0, Math.round(minY * scaleY));
  const fgWidth = Math.min(width - fgLeft, Math.round((maxX - minX) * scaleX));
  const fgHeight = Math.min(height - fgTop, Math.round((maxY - minY) * scaleY));

  const fgBuf = await sharp(buffer)
    .extract({ left: fgLeft, top: fgTop, width: fgWidth, height: fgHeight })
    .toBuffer();

  const fgAreaPct = ((fgWidth * fgHeight) / (width * height)) * 100;

  return {
    origBuf: buffer,
    centerBuf,
    fgBuf,
    fgBox: { left: fgLeft, top: fgTop, width: fgWidth, height: fgHeight },
    fgAreaPct: Number(fgAreaPct.toFixed(1)),
    centerAreaPct: 42.25, // 0.65 * 0.65
  };
}

async function run() {
  await connectDB();
  console.log("Connected to MongoDB.");

  const vectors = await ProductVisualVector.find({}).lean();
  const products = await Product.find({}).lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  // ========================================================
  // TASK 1: AUDIT 48 CATALOGUE VECTORS
  // ========================================================
  console.log(`\n======================================================`);
  console.log(`TASK 1: AUDITING 48 CATALOGUE VECTORS`);
  console.log(`======================================================`);

  let largeBgCount = 0;
  let dominantCount = 0;
  let moderateCount = 0;
  const auditDetails = [];

  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    const prod = productMap.get(v.productId.toString());
    const buf = await getCachedBuffer(v.imageUrl);
    const meta = await sharp(buf).metadata();
    const reps = await generateCatalogueRepresentations(buf);

    let classification = "MODERATE_BACKGROUND";
    if (reps.fgAreaPct < 60.0) {
      classification = "LARGE_BACKGROUND";
      largeBgCount++;
    } else if (reps.fgAreaPct >= 80.0) {
      classification = "PRODUCT_DOMINANT";
      dominantCount++;
    } else {
      moderateCount++;
    }

    auditDetails.push({
      id: v.productId.toString(),
      name: prod?.name || "Unknown",
      dimensions: `${meta.width}x${meta.height}`,
      fgAreaPct: reps.fgAreaPct,
      classification,
    });
  }

  console.log(`Audited ${vectors.length} vectors:`);
  console.log(`  - Large Background (>40% background):   ${largeBgCount} (${((largeBgCount/vectors.length)*100).toFixed(1)}%)`);
  console.log(`  - Moderate Background (20-40% bg):     ${moderateCount} (${((moderateCount/vectors.length)*100).toFixed(1)}%)`);
  console.log(`  - Product Dominant (>80% product):     ${dominantCount} (${((dominantCount/vectors.length)*100).toFixed(1)}%)`);
  console.log(`  - Suitable for Foreground/Crop Rep:    ${largeBgCount + moderateCount} (${(((largeBgCount + moderateCount)/vectors.length)*100).toFixed(1)}%)`);

  // ========================================================
  // PRECOMPUTE CATALOGUE EMBEDDINGS (1 PASS)
  // ========================================================
  console.log(`\nPrecomputing catalogue embeddings for all 36 products...`);
  const tPre = Date.now();
  const catalogueEmbeddings = [];

  for (const prod of products) {
    const buf = await getCachedBuffer(prod.images[0]);
    const reps = await generateCatalogueRepresentations(buf);
    const embOrig = await extractEmbeddingFromBuffer(reps.origBuf);
    const embCenter = await extractEmbeddingFromBuffer(reps.centerBuf);
    const embFg = await extractEmbeddingFromBuffer(reps.fgBuf);

    catalogueEmbeddings.push({
      productId: prod._id.toString(),
      name: prod.name,
      category: prod.category,
      embOrig,
      embCenter,
      embFg,
    });
  }
  console.log(`Precomputed ${catalogueEmbeddings.length * 3} embeddings in ${((Date.now() - tPre)/1000).toFixed(1)}s.`);

  // ========================================================
  // TASK 3: TEST KNOWN REQUEST 2 FAILURE
  // ========================================================
  console.log(`\n======================================================`);
  console.log(`TASK 3: TEST KNOWN REQUEST 2 FAILURE`);
  console.log(`======================================================`);

  const req2Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot 2026-09-08 140156.png";
  const req2Buf = fs.readFileSync(req2Path);
  const req2Emb = await extractEmbeddingFromBuffer(req2Buf);

  const req2TargetId = "6a8983a738c8c89855e85153";
  const comp1Id = "6a8983a538c8c89855e85132"; // Leaf Motif
  const comp2Id = "6a8983a538c8c89855e85129"; // Antique Temple

  // Compare against target product representations
  const targetProdEntry = catalogueEmbeddings.find(e => e.productId === req2TargetId);
  const scoreA_Orig = computeCosineSimilarity(req2Emb, targetProdEntry.embOrig);
  const scoreB_Center = computeCosineSimilarity(req2Emb, targetProdEntry.embCenter);
  const scoreC_Fg = computeCosineSimilarity(req2Emb, targetProdEntry.embFg);

  console.log(`Request 2 Scores against Correct Product (${req2TargetId}):`);
  console.log(`  A. Original Full Catalogue Image:   ${scoreA_Orig.toFixed(4)}`);
  console.log(`  B. Catalogue Central Crop (65%):    ${scoreB_Center.toFixed(4)}`);
  console.log(`  C. Catalogue Photometric Crop:      ${scoreC_Fg.toFixed(4)}`);

  // Competitor scores
  const comp1Entry = catalogueEmbeddings.find(e => e.productId === comp1Id);
  const comp2Entry = catalogueEmbeddings.find(e => e.productId === comp2Id);

  console.log(`\nCompetitor Baseline Scores (against Original):`);
  console.log(`  Competitor 1 (${comp1Id}): ${computeCosineSimilarity(req2Emb, comp1Entry.embOrig).toFixed(4)} - "${comp1Entry.name}"`);
  console.log(`  Competitor 2 (${comp2Id}): ${computeCosineSimilarity(req2Emb, comp2Entry.embOrig).toFixed(4)} - "${comp2Entry.name}"`);

  // Evaluate across ALL 36 products under 3 regimes:
  // Regime 1: Baseline (Original only)
  // Regime 2: Dual-Representation (Original + Central Crop)
  // Regime 3: Tri-Representation (Original + Central + Photometric)

  function evaluateRanking(regimeName, scoreFn) {
    const scored = catalogueEmbeddings.map(e => ({
      productId: e.productId,
      name: e.name,
      score: scoreFn(e),
    })).sort((a, b) => b.score - a.score);

    const rank = scored.findIndex(s => s.productId === req2TargetId) + 1;
    const targetScore = scored.find(s => s.productId === req2TargetId).score;
    const top1 = scored[0];
    const top2 = scored[1];
    const margin = top1.score - top2.score;

    console.log(`\n--- Regime: ${regimeName} ---`);
    console.log(`  Correct Product Rank:  #${rank} (Score: ${targetScore.toFixed(4)})`);
    console.log(`  Top-1 Product:         ${top1.productId} (${top1.score.toFixed(4)}) - "${top1.name}"`);
    console.log(`  Top-2 Product:         ${top2.productId} (${top2.score.toFixed(4)}) - "${top2.name}"`);
    console.log(`  Top-1 Margin:          ${margin.toFixed(4)}`);
    return { rank, targetScore, top1, top2, margin };
  }

  const resBase = evaluateRanking("1. BASELINE (Original Only)", e => computeCosineSimilarity(req2Emb, e.embOrig));
  const resDual = evaluateRanking("2. DUAL-REP (Original + Central 65% Crop)", e => Math.max(computeCosineSimilarity(req2Emb, e.embOrig), computeCosineSimilarity(req2Emb, e.embCenter)));
  const resTri = evaluateRanking("3. TRI-REP (Original + Central + Photometric)", e => Math.max(computeCosineSimilarity(req2Emb, e.embOrig), computeCosineSimilarity(req2Emb, e.embCenter), computeCosineSimilarity(req2Emb, e.embFg)));

  // ========================================================
  // TASK 4: TEST REVERSE DIRECTION (REQUEST 1)
  // ========================================================
  console.log(`\n======================================================`);
  console.log(`TASK 4: TEST REVERSE DIRECTION (REQUEST 1)`);
  console.log(`======================================================`);

  const req1Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1279).png";
  const req1Buf = fs.readFileSync(req1Path);
  const req1Emb = await extractEmbeddingFromBuffer(req1Buf);
  const req1TargetId = "6a8983a638c8c89855e8514a";

  const req1Entry = catalogueEmbeddings.find(e => e.productId === req1TargetId);
  const req1_A = computeCosineSimilarity(req1Emb, req1Entry.embOrig);
  const req1_B = computeCosineSimilarity(req1Emb, req1Entry.embCenter);
  const req1_C = computeCosineSimilarity(req1Emb, req1Entry.embFg);

  console.log(`Request 1 Scores against Correct Product (${req1TargetId}):`);
  console.log(`  A. Original Full Catalogue Image:   ${req1_A.toFixed(4)}`);
  console.log(`  B. Catalogue Central Crop (65%):    ${req1_B.toFixed(4)}`);
  console.log(`  C. Catalogue Photometric Crop:      ${req1_C.toFixed(4)}`);
  console.log(`  Max Dual-Rep Score:                 ${Math.max(req1_A, req1_B).toFixed(4)}`);

  // ========================================================
  // TASK 5: 12-PRODUCT CONTROLLED SAMPLE
  // ========================================================
  console.log(`\n======================================================`);
  console.log(`TASK 5: CONTROLLED SAMPLE (12 DIVERSE PRODUCTS)`);
  console.log(`======================================================`);

  const sampleIndices = [0, 2, 5, 8, 9, 12, 14, 19, 21, 23, 28, 34];
  const sampleProducts = sampleIndices.map(i => products[i]).filter(Boolean);

  let baselineTop1 = 0;
  let dualTop1 = 0;
  let totalMarginImprovement = 0;

  console.log(`Evaluating 12 products under cropped customer queries:`);

  for (let i = 0; i < sampleProducts.length; i++) {
    const prod = sampleProducts[i];
    const catBuf = await getCachedBuffer(prod.images[0]);
    const meta = await sharp(catBuf).metadata();

    // 75% center zoom crop (simulating customer screenshot)
    const qW = Math.round(meta.width * 0.75);
    const qH = Math.round(meta.height * 0.75);
    const qBuf = await sharp(catBuf).extract({
      left: Math.round((meta.width - qW) / 2),
      top: Math.round((meta.height - qH) / 2),
      width: qW,
      height: qH,
    }).jpeg({ quality: 85 }).toBuffer();

    const qEmb = await extractEmbeddingFromBuffer(qBuf);

    // Score against all 36 products
    const bScores = catalogueEmbeddings.map(e => ({ id: e.productId, score: computeCosineSimilarity(qEmb, e.embOrig) })).sort((a, b) => b.score - a.score);
    const dScores = catalogueEmbeddings.map(e => ({ id: e.productId, score: Math.max(computeCosineSimilarity(qEmb, e.embOrig), computeCosineSimilarity(qEmb, e.embCenter)) })).sort((a, b) => b.score - a.score);

    const bRank = bScores.findIndex(s => s.id === prod._id.toString()) + 1;
    const dRank = dScores.findIndex(s => s.id === prod._id.toString()) + 1;

    const bTargetScore = bScores.find(s => s.id === prod._id.toString()).score;
    const dTargetScore = dScores.find(s => s.id === prod._id.toString()).score;

    const bMargin = bRank === 1 ? (bScores[0].score - bScores[1].score).toFixed(4) : "N/A";
    const dMargin = dRank === 1 ? (dScores[0].score - dScores[1].score).toFixed(4) : "N/A";

    if (bRank === 1) baselineTop1++;
    if (dRank === 1) dualTop1++;

    console.log(`  [${i+1}/12] "${prod.name.slice(0, 32)}": BaseRank=#${bRank} (${bTargetScore.toFixed(3)}, margin=${bMargin}) -> DualRank=#${dRank} (${dTargetScore.toFixed(3)}, margin=${dMargin})`);
  }

  console.log(`\nControlled Sample Results:`);
  console.log(`  Baseline Top-1 Accuracy: ${baselineTop1}/12 (${((baselineTop1/12)*100).toFixed(1)}%)`);
  console.log(`  Dual-Rep Top-1 Accuracy: ${dualTop1}/12 (${((dualTop1/12)*100).toFixed(1)}%)`);

  // ========================================================
  // TASK 6: EXACT CATALOGUE IMAGE INVARIANT
  // ========================================================
  console.log(`\n======================================================`);
  console.log(`TASK 6: EXACT CATALOGUE IMAGE INVARIANT`);
  console.log(`======================================================`);

  const fairyBuf = await getCachedBuffer(productMap.get("6a8983a438c8c89855e85110").images[0]);
  const fairyEmb = await extractEmbeddingFromBuffer(fairyBuf);
  const fairyEntry = catalogueEmbeddings.find(e => e.productId === "6a8983a438c8c89855e85110");

  const fairyExactScore = Math.max(
    computeCosineSimilarity(fairyEmb, fairyEntry.embOrig),
    computeCosineSimilarity(fairyEmb, fairyEntry.embCenter)
  );
  console.log(`Direct upload exact catalogue image score for Fairy: ${fairyExactScore.toFixed(4)} (Invariant: must be 1.0000)`);

  // ========================================================
  // TASK 7: LATENCY & MEMORY IMPACT
  // ========================================================
  console.log(`\n======================================================`);
  console.log(`TASK 7: LATENCY & MEMORY BENCHMARK`);
  console.log(`======================================================`);

  const memUsage = process.memoryUsage();
  console.log(`Memory Usage:`);
  console.log(`  RSS:          ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Heap Used:    ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`);

  // Cosine comparison speed test (1000 comparisons)
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) {
    computeCosineSimilarity(req2Emb, targetProdEntry.embOrig);
  }
  const tCosine1k = Date.now() - t0;
  console.log(`Cosine Similarity Compute Latency: ${(tCosine1k / 1000).toFixed(4)} ms per vector pair`);
  console.log(`Querying 48 vectors vs 96 vectors (Dual-Rep) adds: ~${((tCosine1k / 1000) * 48).toFixed(3)} ms (sub-millisecond!)`);

  const report = {
    task1: { total: vectors.length, largeBgCount, moderateCount, dominantCount },
    task3: { resBase, resDual, resTri, scoreA_Orig, scoreB_Center, scoreC_Fg },
    task4: { req1_A, req1_B, req1_C },
    task5: { baselineTop1, dualTop1, total: 12 },
    task6: { fairyExactScore },
  };

  fs.writeFileSync("uploads/phase_d6_experiment_report.json", JSON.stringify(report, null, 2));
  console.log(`\nReport saved to uploads/phase_d6_experiment_report.json`);
  process.exit(0);
}

run().catch(err => {
  console.error("Experiment failure:", err);
  process.exit(1);
});
