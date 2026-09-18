import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import axios from "axios";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import {
  extractEmbeddingFromBuffer,
  computeCosineSimilarity,
} from "../services/clipVisualSearchService.js";

async function downloadUrlToBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(res.data);
}

function computeIoU(b1, b2) {
  if (!b1 || !b2) return 0;
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

function computeOverlap(candidate, target) {
  if (!candidate || !target) return 0;
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

/**
 * Generate candidate regions ranked by photometric features, with configurable maxK and NMS IoU threshold
 */
async function generatePhotometricCandidates(imageBuffer, maxK = 20, nmsIouThreshold = 0.35) {
  const t0 = Date.now();
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;

  const candidates = [];

  // Always include candidate 0: Full Image baseline
  candidates.push({
    type: "full_image",
    box: { left: 0, top: 0, width, height },
    photoScore: 10000, // guaranteed slot
  });

  // Candidate 1: Central Square (if not 1:1)
  const minDim = Math.min(width, height);
  if (width !== height && minDim >= 60) {
    candidates.push({
      type: "central_square",
      box: {
        left: Math.round((width - minDim) / 2),
        top: Math.round((height - minDim) / 2),
        width: minDim,
        height: minDim,
      },
      photoScore: 9000,
    });
  }

  // Multi-scale photometric feature scanning
  if (width >= 80 && height >= 80) {
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

    // 4 scales: tiny thumbnail, small card, medium card, large modal
    const scales = [
      { w: Math.round(sw * 0.10), h: Math.round(sw * 0.10), type: "tiny_thumb" },
      { w: Math.round(sw * 0.16), h: Math.round(sw * 0.16), type: "small_thumb" },
      { w: Math.round(sw * 0.28), h: Math.round(sw * 0.28), type: "medium_card" },
      { w: Math.round(sw * 0.45), h: Math.round(sw * 0.45), type: "large_card" },
    ];

    const rawPool = [];

    for (const s of scales) {
      const winW = s.w;
      const winH = s.h;
      const step = Math.max(2, Math.floor(winW / 3));

      for (let y = 0; y <= sh - winH; y += step) {
        for (let x = 0; x <= sw - winW; x += step) {
          let satSum = 0;
          let varSum = 0;
          let bimodalSum = 0;
          const total = winW * winH;

          for (let wy = 0; wy < winH; wy++) {
            for (let wx = 0; wx < winW; wx++) {
              const idx = (y + wy) * sw + (x + wx);
              satSum += cellSat[idx];
              varSum += cellColorVar[idx];
              bimodalSum += cellBimodal[idx];
            }
          }

          const meanSat = satSum / total;
          const meanVar = varSum / total;
          const meanBimodal = bimodalSum / total;

          // Reject non-photographic text & high-contrast UI borders
          if (meanBimodal > 0.70) continue;
          if (meanSat < 0.08) continue;

          const photoScore = (meanVar * 0.1) * (1.0 + meanSat * 5.0) * (1.0 - meanBimodal * 0.9);

          const origX = Math.max(0, Math.round(x * scaleX));
          const origY = Math.max(0, Math.round(y * scaleY));
          const origW = Math.min(width - origX, Math.round(winW * scaleX));
          const origH = Math.min(height - origY, Math.round(winH * scaleY));

          rawPool.push({
            type: s.type,
            box: { left: origX, top: origY, width: origW, height: origH },
            photoScore,
          });
        }
      }
    }

    rawPool.sort((a, b) => b.photoScore - a.photoScore);

    // NMS spatial deduplication
    const selectedPhotometric = [];
    for (const cand of rawPool) {
      let suppressed = false;
      for (const sel of selectedPhotometric) {
        if (computeIoU(cand.box, sel.box) > nmsIouThreshold) {
          suppressed = true;
          break;
        }
      }
      if (!suppressed) {
        selectedPhotometric.push(cand);
        if (candidates.length + selectedPhotometric.length >= maxK) break;
      }
    }

    candidates.push(...selectedPhotometric);
  }

  const generationTimeMs = Date.now() - t0;
  return { candidates: candidates.slice(0, maxK), generationTimeMs };
}

async function evaluateCandidatesWithClip(imageBuffer, candidates, catalogueVectors, productMap, expectedProductId) {
  const meta = await sharp(imageBuffer).metadata();
  const t0 = Date.now();

  const candidateResults = [];

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    let cropBuf;
    if (cand.box.left === 0 && cand.box.top === 0 && cand.box.width === meta.width && cand.box.height === meta.height) {
      cropBuf = imageBuffer;
    } else {
      cropBuf = await sharp(imageBuffer).extract(cand.box).png().toBuffer();
    }

    const tEmb0 = Date.now();
    const emb = await extractEmbeddingFromBuffer(cropBuf);
    const embTime = Date.now() - tEmb0;

    const tCmp0 = Date.now();
    const scores = new Map();
    for (const v of catalogueVectors) {
      const s = computeCosineSimilarity(emb, v.embedding);
      const pid = v.productId.toString();
      if (!scores.has(pid) || s > scores.get(pid)) scores.set(pid, s);
    }
    const cmpTime = Date.now() - tCmp0;

    const sorted = Array.from(scores.entries())
      .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
      .sort((a, b) => b.score - a.score);

    const top1 = sorted[0];
    const top2 = sorted[1];
    const margin = Number((top1.score - (top2?.score || 0)).toFixed(4));

    let expRank = null;
    let expScore = null;
    if (expectedProductId) {
      const idx = sorted.findIndex((p) => p.productId === expectedProductId);
      if (idx !== -1) {
        expRank = idx + 1;
        expScore = sorted[idx].score;
      }
    }

    candidateResults.push({
      index: i + 1,
      type: cand.type,
      box: cand.box,
      top1Product: top1 ? top1.name : "None",
      top1ProductId: top1 ? top1.productId : "None",
      top1Score: top1 ? top1.score : 0,
      top2Score: top2 ? top2.score : 0,
      margin,
      expRank,
      expScore,
      embTime,
      cmpTime,
    });
  }

  const clipTotalTimeMs = Date.now() - t0;
  return { candidateResults, clipTotalTimeMs };
}

async function main() {
  await connectDB();

  console.log("\n========================================================");
  console.log("PHASE C.8: CANDIDATE RECALL & LOCALIZATION OPTIMIZATION");
  console.log("Evaluating Candidate Budgets K = [5, 10, 15, 20]");
  console.log("========================================================\n");

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();
  const products = await Product.find({}).select("name category images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // Reference Products & Images
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const fairyImgBuf = await downloadUrlToBuffer(fairyProduct.images[0]);

  const waveProduct = await Product.findById("6a8983a538c8c89855e85123").lean();
  const czGreenProduct = await Product.findById("6a8983a538c8c89855e85126").lean();

  const fairySmallModalBuf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png"
  );
  const customer2Buf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png"
  );
  const customer3Buf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png"
  );

  const fairyDesktopCardBuf = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .composite([
      { input: await sharp(fairyImgBuf).resize(300, 320, { fit: "cover" }).toBuffer(), top: 120, left: 362 },
    ])
    .jpeg()
    .toBuffer();

  const instaScreenshotBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([
      { input: await sharp(fairyImgBuf).resize(720, 960, { fit: "cover" }).toBuffer(), top: 400, left: 180 },
    ])
    .jpeg()
    .toBuffer();

  // Test Datasets with verified ground-truth locations:
  const groundTruthDatasets = [
    {
      id: 1,
      name: "Fairy Tiny Desktop Modal",
      buffer: fairySmallModalBuf,
      groundTruth: { left: 330, top: 395, width: 62, height: 62 },
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
    {
      id: 2,
      name: "Customer Screenshot 2",
      buffer: customer2Buf,
      groundTruth: { left: 330, top: 395, width: 62, height: 62 },
      expectedProductId: waveProduct._id.toString(),
      expectedName: waveProduct.name,
    },
    {
      id: 3,
      name: "Customer Screenshot 3",
      buffer: customer3Buf,
      groundTruth: { left: 330, top: 395, width: 62, height: 62 },
      expectedProductId: czGreenProduct._id.toString(),
      expectedName: czGreenProduct.name,
    },
    {
      id: 4,
      name: "Fairy Desktop Product Card",
      buffer: fairyDesktopCardBuf,
      groundTruth: { left: 362, top: 120, width: 300, height: 320 },
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
    {
      id: 5,
      name: "Instagram Screenshot",
      buffer: instaScreenshotBuf,
      groundTruth: { left: 180, top: 400, width: 720, height: 960 },
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
    {
      id: 6,
      name: "Direct Product Image",
      buffer: fairyImgBuf,
      groundTruth: { left: 0, top: 0, width: 1440, height: 1525 },
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
  ];

  const K_BUDGETS = [5, 10, 15, 20];
  const finalSummaryRows = [];

  for (const ds of groundTruthDatasets) {
    console.log(`\n--------------------------------------------------------`);
    console.log(`EVALUATING: ${ds.name}`);
    console.log(`Expected Product: ${ds.expectedName} (${ds.expectedProductId})`);
    console.log(`Ground Truth Box:`, ds.groundTruth);

    for (const K of K_BUDGETS) {
      const { candidates, generationTimeMs } = await generatePhotometricCandidates(ds.buffer, K, 0.35);

      // Check recall against ground truth:
      // Recall criterion: overlap >= 70% of ground truth
      let groundTruthFound = false;
      let bestOverlap = 0;
      let bestIoU = 0;
      let firstMatchCandidateIndex = null;
      let matchingCandidate = null;

      candidates.forEach((cand, idx) => {
        const overlap = computeOverlap(cand.box, ds.groundTruth);
        const iou = computeIoU(cand.box, ds.groundTruth);

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestIoU = iou;
        }

        if (overlap >= 0.70 && !groundTruthFound) {
          groundTruthFound = true;
          firstMatchCandidateIndex = idx + 1;
          matchingCandidate = cand;
        }
      });

      // Run CLIP on these K candidates
      const { candidateResults, clipTotalTimeMs } = await evaluateCandidatesWithClip(
        ds.buffer,
        candidates,
        catalogueVectors,
        productMap,
        ds.expectedProductId
      );

      // Identify the best scoring candidate for the expected product
      const matchingEval = firstMatchCandidateIndex
        ? candidateResults[firstMatchCandidateIndex - 1]
        : null;

      // Also identify the global best candidate across all K candidates
      const bestCandidateOverall = candidateResults.reduce(
        (best, cur) => (cur.top1Score > best.top1Score ? cur : best),
        candidateResults[0]
      );

      // Candidate that produced best rank for expected product
      const bestExpCandidate = candidateResults.reduce((best, cur) => {
        if (cur.expRank === null) return best;
        if (!best || cur.expRank < best.expRank || (cur.expRank === best.expRank && cur.expScore > best.expScore)) {
          return cur;
        }
        return best;
      }, null);

      const totalTimeMs = generationTimeMs + clipTotalTimeMs;

      console.log(`  K=${K} (Generated ${candidates.length} cands in ${generationTimeMs}ms, CLIP in ${clipTotalTimeMs}ms | Total: ${totalTimeMs}ms):`);
      console.log(`    GT Found? ${groundTruthFound ? `YES (Candidate #${firstMatchCandidateIndex})` : "NO"} | Best Overlap: ${(bestOverlap * 100).toFixed(1)}% | Best IoU: ${bestIoU.toFixed(3)}`);
      if (bestExpCandidate) {
        console.log(`    Best Expected Rank: #${bestExpCandidate.expRank} (Score: ${bestExpCandidate.expScore}, Margin: ${bestExpCandidate.margin}, Candidate #${bestExpCandidate.index} [${bestExpCandidate.type}])`);
      } else {
        console.log(`    Expected product not in Top 10`);
      }

      finalSummaryRows.push({
        screenshot: ds.name,
        K,
        candidates: candidates.length,
        groundTruthFound: groundTruthFound ? "YES" : "NO",
        bestIoU: Number(bestIoU.toFixed(3)),
        bestOverlap: `${(bestOverlap * 100).toFixed(1)}%`,
        candIndex: firstMatchCandidateIndex ?? "None",
        expectedRank: bestExpCandidate ? `#${bestExpCandidate.expRank}` : "N/A",
        score: bestExpCandidate ? bestExpCandidate.expScore : "N/A",
        margin: bestExpCandidate ? bestExpCandidate.margin : "N/A",
        genTime: `${generationTimeMs}ms`,
        clipTime: `${clipTotalTimeMs}ms`,
        totalTime: `${totalTimeMs}ms`,
      });
    }
  }

  // EXPERIMENT: NMS ABLATION TEST ON FAIRY SMALL MODAL
  console.log("\n========================================================");
  console.log("NMS ABLATION EXPERIMENT: FAIRY SMALL MODAL SCREENSHOT");
  console.log("========================================================");

  const nmsThresholds = [0.15, 0.25, 0.35, 0.50, 0.70];
  const nmsResults = [];

  for (const iouThresh of nmsThresholds) {
    const { candidates } = await generatePhotometricCandidates(fairySmallModalBuf, 20, iouThresh);
    let gtFound = false;
    let firstIdx = null;
    let maxOverlap = 0;
    let maxIoU = 0;

    candidates.forEach((cand, idx) => {
      const overlap = computeOverlap(cand.box, groundTruthDatasets[0].groundTruth);
      const iou = computeIoU(cand.box, groundTruthDatasets[0].groundTruth);
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        maxIoU = iou;
      }
      if (overlap >= 0.70 && !gtFound) {
        gtFound = true;
        firstIdx = idx + 1;
      }
    });

    nmsResults.push({
      nmsIouThreshold: iouThresh,
      candidateCount: candidates.length,
      groundTruthFound: gtFound ? "YES" : "NO",
      firstMatchCandidateIndex: firstIdx ?? "None",
      bestOverlap: `${(maxOverlap * 100).toFixed(1)}%`,
      bestIoU: Number(maxIoU.toFixed(3)),
    });
  }

  console.table(nmsResults);

  // CRITICAL FAIRY BENCHMARK COMPARISON
  console.log("\n========================================================");
  console.log("CRITICAL FAIRY SCREENSHOT BENCHMARK");
  console.log("Comparing Full Image vs C.6 vs K=5/10/15/20 vs Manual GT");
  console.log("========================================================");

  // 1. Full image
  const embFull = await extractEmbeddingFromBuffer(fairySmallModalBuf);
  const scoresFull = new Map();
  for (const v of catalogueVectors) {
    const s = computeCosineSimilarity(embFull, v.embedding);
    const pid = v.productId.toString();
    if (!scoresFull.has(pid) || s > scoresFull.get(pid)) scoresFull.set(pid, s);
  }
  const sortedFull = Array.from(scoresFull.entries())
    .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
    .sort((a, b) => b.score - a.score);
  const fairyRankFull = sortedFull.findIndex((p) => p.productId === fairyProduct._id.toString()) + 1;
  const fairyScoreFull = sortedFull.find((p) => p.productId === fairyProduct._id.toString())?.score;
  const top1ScoreFull = sortedFull[0].score;
  const marginFull = Number((top1ScoreFull - sortedFull[1].score).toFixed(4));

  // 2. Manual Ground Truth Crop
  const manualCropBuf = await sharp(fairySmallModalBuf)
    .extract(groundTruthDatasets[0].groundTruth)
    .png()
    .toBuffer();
  const embManual = await extractEmbeddingFromBuffer(manualCropBuf);
  const scoresManual = new Map();
  for (const v of catalogueVectors) {
    const s = computeCosineSimilarity(embManual, v.embedding);
    const pid = v.productId.toString();
    if (!scoresManual.has(pid) || s > scoresManual.get(pid)) scoresManual.set(pid, s);
  }
  const sortedManual = Array.from(scoresManual.entries())
    .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
    .sort((a, b) => b.score - a.score);
  const fairyRankManual = sortedManual.findIndex((p) => p.productId === fairyProduct._id.toString()) + 1;
  const fairyScoreManual = sortedManual.find((p) => p.productId === fairyProduct._id.toString())?.score;
  const top1ScoreManual = sortedManual[0].score;
  const marginManual = Number((top1ScoreManual - sortedManual[1].score).toFixed(4));

  // Filter summary rows for Fairy screenshot across K
  const fairyRows = finalSummaryRows.filter((r) => r.screenshot === "Fairy Tiny Desktop Modal");

  console.log("Summary of all tests across K budgets:");
  console.table(finalSummaryRows);

  // Save report JSON
  fs.writeFileSync(
    path.resolve(process.cwd(), "uploads", "c8_candidate_recall_report.json"),
    JSON.stringify({ finalSummaryRows, nmsResults }, null, 2)
  );
  console.log("\nSaved C.8 report to uploads/c8_candidate_recall_report.json");

  process.exit(0);
}

main().catch((err) => {
  console.error("C.8 execution error:", err);
  process.exit(1);
});
