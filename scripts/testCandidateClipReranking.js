import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import {
  extractEmbeddingFromBuffer,
  computeCosineSimilarity,
} from "../services/clipVisualSearchService.js";

const screenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";
const groundTruth = { left: 330, top: 395, width: 62, height: 62 };
const fairyProductId = "6a8983a438c8c89855e85110";

function computeOverlap(candidate, target) {
  const x1 = Math.max(candidate.left, target.left);
  const y1 = Math.max(candidate.top, target.top);
  const x2 = Math.min(candidate.left + candidate.width, target.left + target.width);
  const y2 = Math.min(candidate.top + candidate.height, target.top + target.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const targetArea = target.width * target.height;

  return targetArea === 0 ? 0 : interArea / targetArea;
}

function computeIoU(b1, b2) {
  const x1 = Math.max(b1.left, b2.left);
  const y1 = Math.max(b1.top, b2.top);
  const x2 = Math.min(b1.left + b1.width, b2.left + b2.width);
  const y2 = Math.min(b1.top + b1.height, b2.top + b2.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const unionArea = b1.width * b1.height + b2.width * b2.height - interArea;
  return unionArea === 0 ? 0 : interArea / unionArea;
}

async function proposeImageLikeCandidates(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;

  const sw = 160;
  const sh = Math.max(20, Math.round((height / width) * 160));
  const scaleX = width / sw;
  const scaleY = height / sh;

  const { data } = await sharp(imageBuffer)
    .resize(sw, sh, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = sw * sh;
  const cellColorVar = new Float32Array(pixelCount);
  const cellSat = new Float32Array(pixelCount);
  const cellBimodal = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    cellSat[i] = max === 0 ? 0 : (max - min) / max;

    const mean = (r + g + b) / 3;
    cellColorVar[i] = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    cellBimodal[i] = (lum < 30 || lum > 225) ? 1.0 : 0.0;
  }

  const windowScales = [
    { w: Math.round(sw * 0.10), h: Math.round(sw * 0.10), name: "tiny_thumbnail" },
    { w: Math.round(sw * 0.15), h: Math.round(sw * 0.15), name: "small_thumbnail" },
    { w: Math.round(sw * 0.25), h: Math.round(sw * 0.25), name: "medium_card" },
    { w: Math.round(sw * 0.40), h: Math.round(sw * 0.40), name: "large_card" },
  ];

  const rawCandidates = [];

  for (const wdef of windowScales) {
    const winW = wdef.w;
    const winH = wdef.h;
    const step = Math.max(2, Math.floor(winW / 3));

    for (let y = 0; y <= sh - winH; y += step) {
      for (let x = 0; x <= sw - winW; x += step) {
        let satSum = 0;
        let colorVarSum = 0;
        let bimodalSum = 0;
        const total = winW * winH;

        for (let wy = 0; wy < winH; wy++) {
          for (let wx = 0; wx < winW; wx++) {
            const idx = (y + wy) * sw + (x + wx);
            satSum += cellSat[idx];
            colorVarSum += cellColorVar[idx];
            bimodalSum += cellBimodal[idx];
          }
        }

        const meanSat = satSum / total;
        const meanColorVar = colorVarSum / total;
        const meanBimodal = bimodalSum / total;

        if (meanBimodal > 0.70) continue;
        if (meanSat < 0.08) continue;

        const photoScore = (meanColorVar * 0.1) * (1.0 + meanSat * 5.0) * (1.0 - meanBimodal * 0.9);

        const origX = Math.max(0, Math.round(x * scaleX));
        const origY = Math.max(0, Math.round(y * scaleY));
        const origW = Math.min(width - origX, Math.round(winW * scaleX));
        const origH = Math.min(height - origY, Math.round(winH * scaleY));

        rawCandidates.push({
          scaleName: wdef.name,
          box: { left: origX, top: origY, width: origW, height: origH },
          photoScore,
          meanSat: Number(meanSat.toFixed(3)),
          meanBimodal: Number(meanBimodal.toFixed(3)),
        });
      }
    }
  }

  rawCandidates.sort((a, b) => b.photoScore - a.photoScore);

  const selectedCandidates = [];
  for (const cand of rawCandidates) {
    let tooClose = false;
    for (const sel of selectedCandidates) {
      if (computeIoU(cand.box, sel.box) > 0.35) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selectedCandidates.push(cand);
      if (selectedCandidates.length >= 5) break;
    }
  }

  // Always include full image as baseline candidate 0
  return [
    {
      scaleName: "full_image",
      box: { left: 0, top: 0, width, height },
      photoScore: 0,
      meanSat: 0,
      meanBimodal: 0,
    },
    ...selectedCandidates,
  ];
}

async function run() {
  await connectDB();
  const buf = fs.readFileSync(screenshotPath);

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();

  const products = await Product.find({}).select("name category images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const candidates = await proposeImageLikeCandidates(buf);
  console.log(`Evaluating ${candidates.length} candidates with CLIP...`);

  // Also evaluate manual ground truth crop for comparison
  const manualCropBuf = await sharp(buf).extract(groundTruth).png().toBuffer();
  const manualEmb = await extractEmbeddingFromBuffer(manualCropBuf);
  const manualScores = new Map();
  for (const v of catalogueVectors) {
    const s = computeCosineSimilarity(manualEmb, v.embedding);
    const pid = v.productId.toString();
    if (!manualScores.has(pid) || s > manualScores.get(pid)) manualScores.set(pid, s);
  }
  const manualSorted = Array.from(manualScores.entries())
    .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
    .sort((a, b) => b.score - a.score);
  const fairyManualRank = manualSorted.findIndex((p) => p.productId === fairyProductId) + 1;
  const fairyManualScore = manualSorted.find((p) => p.productId === fairyProductId)?.score;

  console.log("\n========================================================");
  console.log("BASELINE: MANUALLY ISOLATED GROUND TRUTH CROP [330, 395, 62, 62]");
  console.log(`Top 1: ${manualSorted[0].name} (Score: ${manualSorted[0].score})`);
  console.log(`Expected Fairy Rank: #${fairyManualRank} (Score: ${fairyManualScore})`);
  console.log("========================================================\n");

  const candidateResults = [];
  const productWinCounts = new Map();
  const productTop3Counts = new Map();
  const productScoresAcrossCandidates = new Map(); // pid -> array of scores

  for (let idx = 0; idx < candidates.length; idx++) {
    const cand = candidates[idx];
    const cropBuf = (cand.box.left === 0 && cand.box.top === 0 && cand.box.width === 1024 && cand.box.height === 575)
      ? buf
      : await sharp(buf).extract(cand.box).png().toBuffer();

    const emb = await extractEmbeddingFromBuffer(cropBuf);

    const scores = new Map();
    for (const v of catalogueVectors) {
      const s = computeCosineSimilarity(emb, v.embedding);
      const pid = v.productId.toString();
      if (!scores.has(pid) || s > scores.get(pid)) scores.set(pid, s);
    }

    const sorted = Array.from(scores.entries())
      .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
      .sort((a, b) => b.score - a.score);

    const top1 = sorted[0];
    const top2 = sorted[1];
    const margin = Number((top1.score - top2.score).toFixed(4));

    const fairyIdx = sorted.findIndex((p) => p.productId === fairyProductId);
    const fairyRank = fairyIdx !== -1 ? fairyIdx + 1 : null;
    const fairyScore = fairyIdx !== -1 ? sorted[fairyIdx].score : null;

    // Consistency tracking
    productWinCounts.set(top1.productId, (productWinCounts.get(top1.productId) || 0) + 1);
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      const p = sorted[i];
      productTop3Counts.set(p.productId, (productTop3Counts.get(p.productId) || 0) + 1);
    }
    for (const p of sorted) {
      if (!productScoresAcrossCandidates.has(p.productId)) productScoresAcrossCandidates.set(p.productId, []);
      productScoresAcrossCandidates.get(p.productId).push(p.score);
    }

    const iou = computeIoU(cand.box, groundTruth);
    const overlap = computeOverlap(cand.box, groundTruth);

    candidateResults.push({
      idx,
      name: cand.scaleName,
      box: cand.box,
      iou: Number(iou.toFixed(3)),
      overlap: Number((overlap * 100).toFixed(1)),
      containsProduct: overlap >= 0.75,
      top1Product: top1.name,
      top1Score: top1.score,
      top2Score: top2.score,
      margin,
      fairyRank,
      fairyScore,
    });
  }

  console.log("CANDIDATE EVALUATION MATRIX:");
  console.table(candidateResults.map((c) => ({
    Index: c.idx,
    Scale: c.name,
    Box: `${c.box.left},${c.box.top} (${c.box.width}x${c.box.height})`,
    Overlap: `${c.overlap}%`,
    Contains: c.containsProduct ? "YES" : "NO",
    Top1: c.top1Product.slice(0, 30),
    Top1Score: c.top1Score,
    Margin: c.margin,
    FairyRank: `#${c.fairyRank}`,
    FairyScore: c.fairyScore,
  })));

  // EXPERIMENT 4: Multi-region consistency aggregation
  console.log("\n========================================================");
  console.log("EXPERIMENT 4: MULTI-REGION CONSISTENCY AGGREGATION");
  console.log("========================================================");

  const aggregateProductRanking = Array.from(productScoresAcrossCandidates.entries()).map(([pid, scoreArr]) => {
    const pdoc = productMap.get(pid);
    const maxScore = Math.max(...scoreArr);
    // Sort descending and take top 2 average
    const sortedScores = [...scoreArr].sort((a, b) => b - a);
    const top2Avg = (sortedScores[0] + (sortedScores[1] || sortedScores[0])) / 2;
    const wins = productWinCounts.get(pid) || 0;
    const top3Count = productTop3Counts.get(pid) || 0;

    // Consistency score = top2Avg * (1 + 0.15 * wins + 0.08 * top3Count)
    const combinedScore = top2Avg * (1 + 0.15 * wins + 0.08 * top3Count);

    return {
      productId: pid,
      name: pdoc?.name || "Unknown",
      maxScore: Number(maxScore.toFixed(4)),
      top2Avg: Number(top2Avg.toFixed(4)),
      wins,
      top3Count,
      combinedScore: Number(combinedScore.toFixed(4)),
    };
  }).sort((a, b) => b.combinedScore - a.combinedScore);

  console.table(aggregateProductRanking.slice(0, 6));

  process.exit(0);
}

run().catch(console.error);
