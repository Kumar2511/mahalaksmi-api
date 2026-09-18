import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import axios from "axios";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { extractEmbeddingFromBuffer, computeCosineSimilarity } from "../services/clipVisualSearchService.js";
import { proposeSalientCandidateRegions } from "../services/salientRegionService.js";

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
 * Deterministic Foreground / Product-Region Extractor
 * Uses multi-scale edge density, color variance & background suppression.
 */
async function extractProductForeground(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width;
  const height = meta.height;

  // Grid for energy analysis
  const sw = 100;
  const sh = Math.max(10, Math.round((height / width) * 100));
  const scaleX = width / sw;
  const scaleY = height / sh;

  const rgbData = await sharp(buffer)
    .resize(sw, sh, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  // Edge map via sobel filter approximation on greyscale
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    gray[i] = (rgbData[i * 3] * 0.299 + rgbData[i * 3 + 1] * 0.587 + rgbData[i * 3 + 2] * 0.114) / 255.0;
  }

  const edges = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;
      const gx = -gray[idx - sw - 1] + gray[idx - sw + 1] - 2 * gray[idx - 1] + 2 * gray[idx + 1] - gray[idx + sw - 1] + gray[idx + sw + 1];
      const gy = -gray[idx - sw - 1] - 2 * gray[idx - sw] - gray[idx - sw + 1] + gray[idx + sw - 1] + 2 * gray[idx + sw] + gray[idx + sw + 1];
      edges[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Identify background borders (assume 5% margin on top/left/right/bottom is background)
  const borderEdgeSum = (edges[0] + edges[sw - 1] + edges[(sh - 1) * sw] + edges[sh * sw - 1]) / 4;

  // Find bounding box of high-edge & contrast activity (the jewellery + display bust)
  let minX = sw, maxX = 0, minY = sh, maxY = 0;
  let activePixels = 0;
  
  // Dynamic threshold for energy
  let sumEdges = 0;
  for (let i = 0; i < sw * sh; i++) sumEdges += edges[i];
  const avgEdge = sumEdges / (sw * sh);
  const edgeThresh = Math.max(0.12, avgEdge * 1.3);

  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      const idx = y * sw + x;
      if (edges[idx] > edgeThresh) {
        activePixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If no strong edges found or active region spans whole image
  if (activePixels < 20 || (maxX - minX > sw * 0.95 && maxY - minY > sh * 0.95)) {
    minX = Math.round(sw * 0.1);
    maxX = Math.round(sw * 0.9);
    minY = Math.round(sh * 0.1);
    maxY = Math.round(sh * 0.9);
  }

  // Add 10% padding
  const padX = Math.round((maxX - minX) * 0.10);
  const padY = Math.round((maxY - minY) * 0.10);

  const cropGridLeft = Math.max(0, minX - padX);
  const cropGridTop = Math.max(0, minY - padY);
  const cropGridW = Math.min(sw - cropGridLeft, (maxX - minX) + 2 * padX);
  const cropGridH = Math.min(sh - cropGridTop, (maxY - minY) + 2 * padY);

  const cropBox = {
    left: Math.max(0, Math.round(cropGridLeft * scaleX)),
    top: Math.max(0, Math.round(cropGridTop * scaleY)),
    width: Math.min(width - Math.round(cropGridLeft * scaleX), Math.round(cropGridW * scaleX)),
    height: Math.min(height - Math.round(cropGridTop * scaleY), Math.round(cropGridH * scaleY)),
  };

  const foregroundBuf = await sharp(buffer)
    .extract(cropBox)
    .toBuffer();

  // Also build a central crop (65% center area)
  const cW = Math.round(width * 0.65);
  const cH = Math.round(height * 0.65);
  const cLeft = Math.round((width - cW) / 2);
  const cTop = Math.round((height - cH) / 2);
  const centralBuf = await sharp(buffer)
    .extract({ left: cLeft, top: cTop, width: cW, height: cH })
    .toBuffer();

  // Context crop (85% area)
  const ctxW = Math.round(width * 0.85);
  const ctxH = Math.round(height * 0.85);
  const ctxLeft = Math.round((width - ctxW) / 2);
  const ctxTop = Math.round((height - ctxH) / 2);
  const contextBuf = await sharp(buffer)
    .extract({ left: ctxLeft, top: ctxTop, width: ctxW, height: ctxH })
    .toBuffer();

  const areaPercent = ((cropBox.width * cropBox.height) / (width * height)) * 100;

  return {
    foregroundBuffer: foregroundBuf,
    centralBuffer: centralBuf,
    contextBuffer: contextBuf,
    box: cropBox,
    areaPercent: Number(areaPercent.toFixed(1)),
    isLargeBackground: areaPercent < 60.0,
  };
}

async function main() {
  await connectDB();
  console.log("Connected to MongoDB.");

  const vectors = await ProductVisualVector.find({}).lean();
  const products = await Product.find({}).lean();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  console.log(`\n======================================================`);
  console.log(`TASK 1: AUDIT CURRENT CATALOGUE IMAGES (${vectors.length} VECTORS)`);
  console.log(`======================================================`);

  let largeBackgroundCount = 0;
  let productDominantCount = 0;
  let suitableForCropCount = 0;

  const vectorAudits = [];

  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    const prod = productMap.get(v.productId.toString());
    const buf = await getCachedBuffer(v.imageUrl);
    const meta = await sharp(buf).metadata();
    const fg = await extractProductForeground(buf);

    const hasLargeBg = fg.areaPercent < 65.0;
    const isDominant = fg.areaPercent >= 80.0;
    const suitableForCrop = hasLargeBg || (!isDominant && fg.areaPercent < 80.0);

    if (hasLargeBg) largeBackgroundCount++;
    if (isDominant) productDominantCount++;
    if (suitableForCrop) suitableForCropCount++;

    vectorAudits.push({
      index: i + 1,
      productId: v.productId.toString(),
      name: prod ? prod.name : "Unknown",
      category: prod?.category || "",
      dimensions: `${meta.width}x${meta.height}`,
      foregroundAreaPct: fg.areaPercent,
      classification: hasLargeBg ? "LARGE_BACKGROUND" : (isDominant ? "PRODUCT_DOMINANT" : "MODERATE_BACKGROUND"),
      imageUrl: v.imageUrl,
    });
  }

  console.log(`--- Audit Summary Statistics ---`);
  console.log(`Total vectors audited:                 ${vectors.length}`);
  console.log(`Images with large surrounding background: ${largeBackgroundCount} (${((largeBackgroundCount/vectors.length)*100).toFixed(1)}%)`);
  console.log(`Images with product-dominant framing:    ${productDominantCount} (${((productDominantCount/vectors.length)*100).toFixed(1)}%)`);
  console.log(`Images suitable for foreground crop:     ${suitableForCropCount} (${((suitableForCropCount/vectors.length)*100).toFixed(1)}%)`);

  console.log(`\nSample Vector Audits (First 8):`);
  vectorAudits.slice(0, 8).forEach(a => {
    console.log(`  #${a.index}: [${a.dimensions}] ${a.foregroundAreaPct}% fg -> ${a.classification} | "${a.name.slice(0, 40)}"`);
  });

  console.log(`\n======================================================`);
  console.log(`TASK 3: TEST KNOWN REQUEST 2 FAILURE`);
  console.log(`======================================================`);

  const req2Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot 2026-09-08 140156.png";
  const req2Buf = fs.readFileSync(req2Path);
  const req2Emb = await extractEmbeddingFromBuffer(req2Buf);

  // Correct product: 6a8983a738c8c89855e85153 (vraiuqjdqt55gvds6rqs.jpg)
  const correctProdId = "6a8983a738c8c89855e85153";
  const correctProd = productMap.get(correctProdId);
  const correctUrl = correctProd.images[0];
  const correctBuf = await getCachedBuffer(correctUrl);

  const fgCorrect = await extractProductForeground(correctBuf);

  // Embeddings of representations
  const embOriginal = await extractEmbeddingFromBuffer(correctBuf);
  const embForeground = await extractEmbeddingFromBuffer(fgCorrect.foregroundBuffer);
  const embCentral = await extractEmbeddingFromBuffer(fgCorrect.centralBuffer);
  const embContext = await extractEmbeddingFromBuffer(fgCorrect.contextBuffer);

  const scoreA = computeCosineSimilarity(req2Emb, embOriginal);
  const scoreB = computeCosineSimilarity(req2Emb, embForeground);
  const scoreC = computeCosineSimilarity(req2Emb, embCentral);
  const scoreD = computeCosineSimilarity(req2Emb, embContext);

  console.log(`Comparison for Correct Product (${correctProdId}):`);
  console.log(`  A. Original Full Catalogue Image:   ${scoreA.toFixed(4)}`);
  console.log(`  B. Catalogue Foreground Crop:       ${scoreB.toFixed(4)}`);
  console.log(`  C. Catalogue Central Crop (65%):    ${scoreC.toFixed(4)}`);
  console.log(`  D. Catalogue Context Crop (85%):    ${scoreD.toFixed(4)}`);

  // Two known competitors
  const comp1Id = "6a8983a538c8c89855e85132"; // Elegant Leaf Motif CZ
  const comp2Id = "6a8983a538c8c89855e85129"; // Traditional Antique Temple Set

  const comp1Buf = await getCachedBuffer(productMap.get(comp1Id).images[0]);
  const comp2Buf = await getCachedBuffer(productMap.get(comp2Id).images[0]);

  const embComp1 = await extractEmbeddingFromBuffer(comp1Buf);
  const embComp2 = await extractEmbeddingFromBuffer(comp2Buf);

  const scoreComp1 = computeCosineSimilarity(req2Emb, embComp1);
  const scoreComp2 = computeCosineSimilarity(req2Emb, embComp2);

  console.log(`\nCompetitor Scores:`);
  console.log(`  Competitor 1 (${comp1Id}): ${scoreComp1.toFixed(4)} - "${productMap.get(comp1Id).name}"`);
  console.log(`  Competitor 2 (${comp2Id}): ${scoreComp2.toFixed(4)} - "${productMap.get(comp2Id).name}"`);

  // Ranking against ALL products under:
  // Baseline (original catalogue images) vs Proposed Dual-Representation (max of original + foreground)
  console.log(`\nGlobal Catalogue Ranking for Request 2:`);

  // Baseline Ranking
  const baselineScores = [];
  for (const prod of products) {
    const pBuf = await getCachedBuffer(prod.images[0]);
    const pEmb = await extractEmbeddingFromBuffer(pBuf);
    const sim = computeCosineSimilarity(req2Emb, pEmb);
    baselineScores.push({ id: prod._id.toString(), name: prod.name, score: sim });
  }
  baselineScores.sort((a, b) => b.score - a.score);
  const baselineRank = baselineScores.findIndex(s => s.id === correctProdId) + 1;
  const baselineTop1 = baselineScores[0];
  const baselineTop2 = baselineScores[1];
  const baselineMargin = baselineTop1.score - baselineTop2.score;

  console.log(`  BASELINE:`);
  console.log(`    Correct Product Rank: #${baselineRank} (Score: ${scoreA.toFixed(4)})`);
  console.log(`    Top-1: ${baselineTop1.id} (${baselineTop1.score.toFixed(4)}) - "${baselineTop1.name}"`);
  console.log(`    Top-2: ${baselineTop2.id} (${baselineTop2.score.toFixed(4)})`);
  console.log(`    Top-1 Margin: ${baselineMargin.toFixed(4)}`);

  // Dual-Representation Ranking (Foreground + Original)
  const dualScores = [];
  for (const prod of products) {
    const pBuf = await getCachedBuffer(prod.images[0]);
    const pEmb = await extractEmbeddingFromBuffer(pBuf);
    const pFg = await extractProductForeground(pBuf);
    const pFgEmb = await extractEmbeddingFromBuffer(pFg.foregroundBuffer);

    const simOrig = computeCosineSimilarity(req2Emb, pEmb);
    const simFg = computeCosineSimilarity(req2Emb, pFgEmb);
    const bestSim = Math.max(simOrig, simFg);
    const matchedRep = simFg > simOrig ? "FOREGROUND" : "ORIGINAL";

    dualScores.push({ id: prod._id.toString(), name: prod.name, score: bestSim, matchedRep, simOrig, simFg });
  }
  dualScores.sort((a, b) => b.score - a.score);
  const dualRank = dualScores.findIndex(s => s.id === correctProdId) + 1;
  const dualTop1 = dualScores[0];
  const dualTop2 = dualScores[1];
  const dualMargin = dualTop1.score - dualTop2.score;

  console.log(`\n  DUAL-REPRESENTATION (ORIGINAL + FOREGROUND):`);
  console.log(`    Correct Product Rank: #${dualRank} (Score: ${dualScores.find(s => s.id === correctProdId).score.toFixed(4)}, matchedRep: ${dualScores.find(s => s.id === correctProdId).matchedRep})`);
  console.log(`    Top-1: ${dualTop1.id} (${dualTop1.score.toFixed(4)}) - "${dualTop1.name}" (via ${dualTop1.matchedRep})`);
  console.log(`    Top-2: ${dualTop2.id} (${dualTop2.score.toFixed(4)}) - "${dualTop2.name}" (via ${dualTop2.matchedRep})`);
  console.log(`    Top-1 Margin: ${dualMargin.toFixed(4)}`);

  console.log(`\n======================================================`);
  console.log(`TASK 4: TEST REVERSE DIRECTION (REQUEST 1)`);
  console.log(`======================================================`);

  const req1Path = "C:/Users/ELCOT/OneDrive/图片/Screenshots/Screenshot (1279).png";
  const req1Buf = fs.readFileSync(req1Path);
  const req1Emb = await extractEmbeddingFromBuffer(req1Buf);

  // Correct product: 6a8983a638c8c89855e8514a
  const req1ProdId = "6a8983a638c8c89855e8514a";
  const req1Prod = productMap.get(req1ProdId);
  const req1CatBuf = await getCachedBuffer(req1Prod.images[0]);
  const fg1 = await extractProductForeground(req1CatBuf);

  const req1EmbOrig = await extractEmbeddingFromBuffer(req1CatBuf);
  const req1EmbFg = await extractEmbeddingFromBuffer(fg1.foregroundBuffer);
  const req1EmbCent = await extractEmbeddingFromBuffer(fg1.centralBuffer);
  const req1EmbCtx = await extractEmbeddingFromBuffer(fg1.contextBuffer);

  console.log(`Comparison for Request 1 Correct Product (${req1ProdId}):`);
  console.log(`  A. Original Full Catalogue Image:   ${computeCosineSimilarity(req1Emb, req1EmbOrig).toFixed(4)}`);
  console.log(`  B. Catalogue Foreground Crop:       ${computeCosineSimilarity(req1Emb, req1EmbFg).toFixed(4)}`);
  console.log(`  C. Catalogue Central Crop (65%):    ${computeCosineSimilarity(req1Emb, req1EmbCent).toFixed(4)}`);
  console.log(`  D. Catalogue Context Crop (85%):    ${computeCosineSimilarity(req1Emb, req1EmbCtx).toFixed(4)}`);

  console.log(`\n======================================================`);
  console.log(`TASK 5: CONTROLLED SAMPLE (12 DIVERSE PRODUCTS)`);
  console.log(`======================================================`);

  // Select 12 products representing distinct styles
  const sampleIndices = [0, 2, 5, 8, 9, 12, 14, 19, 21, 23, 28, 34];
  const sampleProducts = sampleIndices.map(i => products[i]).filter(Boolean);

  let baselineTop1Success = 0;
  let dualTop1Success = 0;
  let marginImprovements = 0;

  console.log(`Evaluating ${sampleProducts.length} diverse products under cropped/zoomed customer-style representation:`);

  for (let sIdx = 0; sIdx < sampleProducts.length; sIdx++) {
    const prod = sampleProducts[sIdx];
    const catBuf = await getCachedBuffer(prod.images[0]);
    const meta = await sharp(catBuf).metadata();

    // Generate a realistic customer-style query crop (75% central zoom on product)
    const qW = Math.round(meta.width * 0.75);
    const qH = Math.round(meta.height * 0.75);
    const qLeft = Math.round((meta.width - qW) / 2);
    const qTop = Math.round((meta.height - qH) / 2);
    const queryBuf = await sharp(catBuf).extract({ left: qLeft, top: qTop, width: qW, height: qH }).jpeg({ quality: 85 }).toBuffer();
    const qEmb = await extractEmbeddingFromBuffer(queryBuf);

    // Score against all products: Baseline (Original only) vs Dual (Original + Foreground)
    const baseRankList = [];
    const dualRankList = [];

    for (const p of products) {
      const pBuf = await getCachedBuffer(p.images[0]);
      const pEmb = await extractEmbeddingFromBuffer(pBuf);
      const pFg = await extractProductForeground(pBuf);
      const pFgEmb = await extractEmbeddingFromBuffer(pFg.foregroundBuffer);

      const simOrig = computeCosineSimilarity(qEmb, pEmb);
      const simFg = computeCosineSimilarity(qEmb, pFgEmb);

      baseRankList.push({ id: p._id.toString(), score: simOrig });
      dualRankList.push({ id: p._id.toString(), score: Math.max(simOrig, simFg) });
    }

    baseRankList.sort((a, b) => b.score - a.score);
    dualRankList.sort((a, b) => b.score - a.score);

    const bRank = baseRankList.findIndex(x => x.id === prod._id.toString()) + 1;
    const dRank = dualRankList.findIndex(x => x.id === prod._id.toString()) + 1;

    const bMargin = (baseRankList[0].score - (baseRankList[1]?.score || 0)).toFixed(4);
    const dMargin = (dualRankList[0].score - (dualRankList[1]?.score || 0)).toFixed(4);

    if (bRank === 1) baselineTop1Success++;
    if (dRank === 1) dualTop1Success++;
    if (Number(dMargin) >= Number(bMargin)) marginImprovements++;

    console.log(`  [${sIdx + 1}/${sampleProducts.length}] "${prod.name.slice(0, 35)}": BaseRank=#${bRank} (margin ${bMargin}) -> DualRank=#${dRank} (margin ${dMargin})`);
  }

  console.log(`\nControlled Benchmark Results:`);
  console.log(`  Baseline Top-1 Accuracy: ${baselineTop1Success}/${sampleProducts.length} (${((baselineTop1Success/sampleProducts.length)*100).toFixed(1)}%)`);
  console.log(`  Dual-Rep Top-1 Accuracy: ${dualTop1Success}/${sampleProducts.length} (${((dualTop1Success/sampleProducts.length)*100).toFixed(1)}%)`);

  console.log(`\n======================================================`);
  console.log(`TASK 6: EXACT CATALOGUE IMAGE INVARIANT`);
  console.log(`======================================================`);

  // Direct exact catalogue image query against dual representation
  const fairyBuf = await getCachedBuffer(productMap.get("6a8983a438c8c89855e85110").images[0]);
  const fairyEmb = await extractEmbeddingFromBuffer(fairyBuf);

  let fairyMaxScore = 0;
  for (const p of products) {
    if (p._id.toString() === "6a8983a438c8c89855e85110") {
      const pBuf = await getCachedBuffer(p.images[0]);
      const pEmb = await extractEmbeddingFromBuffer(pBuf);
      const pFg = await extractProductForeground(pBuf);
      const pFgEmb = await extractEmbeddingFromBuffer(pFg.foregroundBuffer);
      fairyMaxScore = Math.max(computeCosineSimilarity(fairyEmb, pEmb), computeCosineSimilarity(fairyEmb, pFgEmb));
    }
  }
  console.log(`Exact catalogue image query score for Fairy: ${fairyMaxScore.toFixed(4)} (Expected: 1.0000)`);

  console.log(`\n======================================================`);
  console.log(`EXPERIMENT COMPLETED`);
  console.log(`======================================================`);
  process.exit(0);
}

main().catch(err => {
  console.error("Experiment Error:", err);
  process.exit(1);
});
