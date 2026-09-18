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
 * Principled Photographic Region Proposal
 */
async function proposePrincipledCandidates(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;

  const candidates = [];

  // 1. Full Image
  candidates.push({
    type: "full_image",
    box: { left: 0, top: 0, width, height },
    features: "Complete image baseline",
  });

  // 2. Central Square Crop (for mobile frames & centered subjects)
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
      features: "1:1 aspect ratio centered crop",
    });
  }

  // 3. Multi-scale Photographic Color-Variance Analysis
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

    const windowScales = [
      { w: Math.round(sw * 0.10), h: Math.round(sw * 0.10), name: "photo_tiny_thumbnail" },
      { w: Math.round(sw * 0.16), h: Math.round(sw * 0.16), name: "photo_small_thumbnail" },
      { w: Math.round(sw * 0.28), h: Math.round(sw * 0.28), name: "photo_medium_card" },
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

          // Reject non-photographic text & high-contrast UI borders
          if (meanBimodal > 0.70) continue;
          if (meanSat < 0.08) continue;

          const photoScore = (meanColorVar * 0.1) * (1.0 + meanSat * 5.0) * (1.0 - meanBimodal * 0.9);

          const origX = Math.max(0, Math.round(x * scaleX));
          const origY = Math.max(0, Math.round(y * scaleY));
          const origW = Math.min(width - origX, Math.round(winW * scaleX));
          const origH = Math.min(height - origY, Math.round(winH * scaleY));

          rawCandidates.push({
            type: wdef.name,
            box: { left: origX, top: origY, width: origW, height: origH },
            photoScore,
            features: `Sat: ${meanSat.toFixed(2)}, Bimodal: ${meanBimodal.toFixed(2)}, Var: ${meanColorVar.toFixed(0)}`,
          });
        }
      }
    }

    rawCandidates.sort((a, b) => b.photoScore - a.photoScore);

    // NMS to keep top 3 diverse photographic candidates
    const photoSelected = [];
    for (const cand of rawCandidates) {
      let tooClose = false;
      for (const sel of photoSelected) {
        if (computeIoU(cand.box, sel.box) > 0.35) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        photoSelected.push(cand);
        if (photoSelected.length >= 3) break;
      }
    }

    candidates.push(...photoSelected);
  }

  return candidates;
}

async function main() {
  await connectDB();

  console.log("\n========================================================");
  console.log("PHASE C.7: PRODUCT-REGION LOCALIZATION EXPERIMENT");
  console.log("Principled Hybrid Candidates & Ground Truth IoU Audit");
  console.log("========================================================\n");

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();

  const products = await Product.find({}).select("name category images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // Reference Products
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const fairyImgBuf = await downloadUrlToBuffer(fairyProduct.images[0]);

  const prodH1 = await Product.findById("6a8983a438c8c89855e85107").lean(); // Temple Long
  const prodH2 = await Product.findById("6a8983a638c8c89855e85144").lean(); // Temple Lakshmi
  const h1Buf = await downloadUrlToBuffer(prodH1.images[0]);

  // Image buffers
  const fairyDesktopSmallBuf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png"
  );
  const groundTruthFairyModal = { left: 330, top: 395, width: 62, height: 62 };

  const customerScreenshot2Buf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png"
  );
  const customerScreenshot3Buf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png"
  );

  const instaScreenshotBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([
      { input: await sharp(fairyImgBuf).resize(720, 960, { fit: "cover" }).toBuffer(), top: 400, left: 180 },
    ])
    .jpeg()
    .toBuffer();

  const fairyDesktopCardBuf = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .composite([
      { input: await sharp(fairyImgBuf).resize(300, 320, { fit: "cover" }).toBuffer(), top: 120, left: 362 },
    ])
    .jpeg()
    .toBuffer();

  const randomBuf = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 40, g: 130, b: 220 } },
  })
    .jpeg()
    .toBuffer();

  const brandLogoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");
  const uiScreenshotBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png");

  // 10 Test Cases required:
  const testMatrix = [
    {
      id: 1,
      name: "Fairy direct catalogue image",
      buffer: fairyImgBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
      groundTruth: null,
    },
    {
      id: 2,
      name: "Fairy Instagram screenshot",
      buffer: instaScreenshotBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
      groundTruth: { left: 180, top: 400, width: 720, height: 960 },
    },
    {
      id: 3,
      name: "Fairy desktop screenshot (product card)",
      buffer: fairyDesktopCardBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
      groundTruth: { left: 362, top: 120, width: 300, height: 320 },
    },
    {
      id: 4,
      name: "Tiny Fairy desktop modal screenshot",
      buffer: fairyDesktopSmallBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
      groundTruth: groundTruthFairyModal,
    },
    {
      id: 5,
      name: "Another customer desktop screenshot (Red set)",
      buffer: customerScreenshot2Buf,
      expectedProductId: "6a883d48b479512538b2bbb1",
      expectedName: "Delicate Necklace / Pendant",
      isJewellery: true,
      groundTruth: null,
    },
    {
      id: 6,
      name: "Another jewellery screenshot (Gold set)",
      buffer: customerScreenshot3Buf,
      expectedProductId: null,
      expectedName: "Gold Jewellery Modal",
      isJewellery: true,
      groundTruth: null,
    },
    {
      id: 7,
      name: "Random image (color gradient)",
      buffer: randomBuf,
      expectedProductId: null,
      expectedName: "None (Rejection expected)",
      isJewellery: false,
      groundTruth: null,
    },
    {
      id: 8,
      name: "Brand / logo image",
      buffer: brandLogoBuf,
      expectedProductId: null,
      expectedName: "None (Rejection expected)",
      isJewellery: false,
      groundTruth: null,
    },
    {
      id: 9,
      name: "UI / intro frame screenshot",
      buffer: uiScreenshotBuf,
      expectedProductId: null,
      expectedName: "None (Rejection expected)",
      isJewellery: false,
      groundTruth: null,
    },
    {
      id: 10,
      name: "Similar-but-different jewellery product",
      buffer: h1Buf,
      expectedProductId: prodH1._id.toString(),
      expectedName: prodH1.name,
      isJewellery: true,
      groundTruth: null,
    },
  ];

  const allReports = [];

  for (const tc of testMatrix) {
    const startTime = Date.now();
    const meta = await sharp(tc.buffer).metadata();
    const candidates = await proposePrincipledCandidates(tc.buffer);

    // Evaluate each candidate with CLIP
    const candidateEvals = [];
    for (const cand of candidates) {
      let cropBuf;
      if (cand.box.left === 0 && cand.box.top === 0 && cand.box.width === meta.width && cand.box.height === meta.height) {
        cropBuf = tc.buffer;
      } else {
        cropBuf = await sharp(tc.buffer).extract(cand.box).png().toBuffer();
      }

      const emb = await extractEmbeddingFromBuffer(cropBuf);

      const productScores = new Map();
      for (const v of catalogueVectors) {
        const s = computeCosineSimilarity(emb, v.embedding);
        const pid = v.productId.toString();
        if (!productScores.has(pid) || s > productScores.get(pid)) productScores.set(pid, s);
      }

      const sorted = Array.from(productScores.entries())
        .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
        .sort((a, b) => b.score - a.score);

      const top1 = sorted[0];
      const top2 = sorted[1];
      const margin = Number((top1.score - (top2?.score || 0)).toFixed(4));

      let expectedRank = null;
      let expectedScore = null;
      if (tc.expectedProductId) {
        const idx = sorted.findIndex((p) => p.productId === tc.expectedProductId);
        if (idx !== -1) {
          expectedRank = idx + 1;
          expectedScore = sorted[idx].score;
        }
      }

      const iou = tc.groundTruth ? computeIoU(cand.box, tc.groundTruth) : null;
      const overlap = tc.groundTruth ? computeOverlap(cand.box, tc.groundTruth) : null;
      const containsActualProduct = overlap !== null ? overlap >= 0.70 : null;

      candidateEvals.push({
        type: cand.type,
        box: cand.box,
        features: cand.features,
        top1Product: top1 ? top1.name : "None",
        top1Score: top1 ? top1.score : 0,
        margin,
        expectedRank,
        expectedScore,
        iou: iou !== null ? Number(iou.toFixed(3)) : null,
        overlap: overlap !== null ? Number((overlap * 100).toFixed(1)) : null,
        containsActualProduct,
      });
    }

    const duration = Date.now() - startTime;

    // Pick winning candidate (highest score among valid candidates)
    const winningEval = candidateEvals.reduce((best, cur) => (cur.top1Score > best.top1Score ? cur : best), candidateEvals[0]);

    allReports.push({
      testId: tc.id,
      name: tc.name,
      dimensions: `${meta.width}x${meta.height}`,
      numCandidates: candidates.length,
      candidateEvals,
      winningCandidate: winningEval,
      processingTimeMs: duration,
    });
  }

  // Print summary tables
  console.log("\n========================================================");
  console.log("PHASE C.7 EXPERIMENT TEST RESULTS SUMMARY");
  console.log("========================================================");

  console.table(allReports.map((r) => ({
    Test: `#${r.testId}: ${r.name.slice(0, 25)}`,
    Dims: r.dimensions,
    Cands: r.numCandidates,
    WinType: r.winningCandidate.type,
    TopProduct: r.winningCandidate.top1Product.slice(0, 28),
    Score: r.winningCandidate.top1Score,
    Margin: r.winningCandidate.margin,
    ExpRank: r.winningCandidate.expectedRank !== null ? `#${r.winningCandidate.expectedRank}` : "N/A",
    ExpScore: r.winningCandidate.expectedScore !== null ? r.winningCandidate.expectedScore : "N/A",
    ContainsProd: r.winningCandidate.containsActualProduct !== null ? (r.winningCandidate.containsActualProduct ? "YES" : "NO") : "N/A",
    Time: `${r.processingTimeMs}ms`,
  })));

  // Detailed Analysis for Test 4: Fairy Desktop Screenshot
  console.log("\n========================================================");
  console.log("CRITICAL TEST 4: FAIRY DESKTOP MODAL SCREENSHOT IN-DEPTH");
  console.log("========================================================");
  const t4 = allReports.find((r) => r.testId === 4);
  console.log("Ground Truth Target Box:", groundTruthFairyModal);
  t4.candidateEvals.forEach((c, idx) => {
    console.log(`Candidate #${idx + 1} [${c.type}]:`);
    console.log(`  Coordinates    : left=${c.box.left}, top=${c.box.top}, width=${c.box.width}, height=${c.box.height}`);
    console.log(`  Features       : ${c.features}`);
    console.log(`  Top 1 Product  : ${c.top1Product} (Score: ${c.top1Score}, Margin: ${c.margin})`);
    console.log(`  Expected Fairy : Rank #${c.expectedRank}, Score: ${c.expectedScore}`);
    console.log(`  IoU with Target: ${c.iou} | Overlap: ${c.overlap}% | Contains Product: ${c.containsActualProduct ? "YES" : "NO"}`);
    console.log("");
  });

  // Save report
  fs.writeFileSync(
    path.resolve(process.cwd(), "uploads", "c7_localization_report.json"),
    JSON.stringify(allReports, null, 2)
  );
  console.log("Report saved to uploads/c7_localization_report.json");

  process.exit(0);
}

main().catch((err) => {
  console.error("C.7 run error:", err);
  process.exit(1);
});
