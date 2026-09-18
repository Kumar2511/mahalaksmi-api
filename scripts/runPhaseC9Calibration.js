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

/**
 * Photometric Candidate Region Proposal with configurable budget K
 */
async function generateCandidates(imageBuffer, maxK = 10, nmsIouThreshold = 0.35) {
  const t0 = Date.now();
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;

  const candidates = [
    { type: "full_image", box: { left: 0, top: 0, width, height } },
  ];

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
    });
  }

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

    const scales = [
      { w: Math.round(sw * 0.10), h: Math.round(sw * 0.10), type: "tiny_thumb" },
      { w: Math.round(sw * 0.16), h: Math.round(sw * 0.16), type: "small_thumb" },
      { w: Math.round(sw * 0.28), h: Math.round(sw * 0.28), type: "medium_card" },
    ];

    const rawPool = [];
    for (const s of scales) {
      const winW = s.w;
      const winH = s.h;
      const step = Math.max(2, Math.floor(winW / 3));

      for (let y = 0; y <= sh - winH; y += step) {
        for (let x = 0; x <= sw - winW; x += step) {
          let satSum = 0, varSum = 0, bimodalSum = 0;
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

          if (meanBimodal > 0.70 || meanSat < 0.08) continue;

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

  const genTimeMs = Date.now() - t0;
  return { candidates: candidates.slice(0, maxK), genTimeMs };
}

/**
 * Evaluate candidates with CLIP against productVisualVectors
 */
async function evaluateQuery(imageBuffer, candidates, catalogueVectors, productMap, expectedProductId) {
  const meta = await sharp(imageBuffer).metadata();
  const t0 = Date.now();

  const productBestMap = new Map(); // pid -> { bestScore, winningRegion, winCount }
  const regionTop1Count = new Map(); // pid -> count of regions where this product is top 1

  for (const cand of candidates) {
    let cropBuf;
    if (cand.box.left === 0 && cand.box.top === 0 && cand.box.width === meta.width && cand.box.height === meta.height) {
      cropBuf = imageBuffer;
    } else {
      cropBuf = await sharp(imageBuffer).extract(cand.box).png().toBuffer();
    }

    const emb = await extractEmbeddingFromBuffer(cropBuf);

    // Group catalogue scores by product for this region
    const scoresInRegion = new Map();
    for (const v of catalogueVectors) {
      const s = computeCosineSimilarity(emb, v.embedding);
      const pid = v.productId.toString();
      if (!scoresInRegion.has(pid) || s > scoresInRegion.get(pid)) {
        scoresInRegion.set(pid, s);
      }
    }

    const sortedRegion = Array.from(scoresInRegion.entries())
      .map(([pid, s]) => ({ productId: pid, score: s }))
      .sort((a, b) => b.score - a.score);

    const regionWinner = sortedRegion[0];
    if (regionWinner) {
      regionTop1Count.set(regionWinner.productId, (regionTop1Count.get(regionWinner.productId) || 0) + 1);
    }

    for (const [pid, s] of scoresInRegion.entries()) {
      if (!productBestMap.has(pid) || s > productBestMap.get(pid).bestScore) {
        productBestMap.set(pid, {
          productId: pid,
          bestScore: Number(s.toFixed(4)),
          winningRegion: cand.type,
          winningBox: cand.box,
        });
      }
    }
  }

  const sortedGlobal = Array.from(productBestMap.values()).sort((a, b) => b.bestScore - a.bestScore);
  const top1 = sortedGlobal[0] || null;
  const top2 = sortedGlobal[1] || null;

  const top1Score = top1 ? top1.bestScore : 0;
  const top2Score = top2 ? top2.bestScore : 0;
  const margin = Number((top1Score - top2Score).toFixed(4));

  const top1ProductDoc = top1 ? productMap.get(top1.productId) : null;
  const top1Agreement = top1 ? (regionTop1Count.get(top1.productId) || 0) : 0;
  const agreementRatio = candidates.length > 0 ? Number((top1Agreement / candidates.length).toFixed(3)) : 0;

  let expectedRank = null;
  let expectedScore = null;
  if (expectedProductId) {
    const idx = sortedGlobal.findIndex((p) => p.productId === expectedProductId.toString());
    if (idx !== -1) {
      expectedRank = idx + 1;
      expectedScore = sortedGlobal[idx].bestScore;
    }
  }

  const durationMs = Date.now() - t0;

  return {
    top1ProductId: top1 ? top1.productId : null,
    top1Name: top1ProductDoc?.name || "Unknown",
    top1Score,
    top2Score,
    margin,
    winningRegion: top1 ? top1.winningRegion : "none",
    regionAgreement: `${top1Agreement}/${candidates.length} (${(agreementRatio * 100).toFixed(0)}%)`,
    agreementRatio,
    expectedRank,
    expectedScore,
    isCorrectTop1: expectedProductId ? (expectedRank === 1) : false,
    durationMs,
  };
}

function calcPercentiles(arr) {
  if (arr.length === 0) return { min: 0, p10: 0, p25: 0, median: 0, p75: 0, p90: 0, max: 0, mean: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (p) => sorted[Math.min(n - 1, Math.max(0, Math.floor((p / 100) * n)))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: Number(sorted[0].toFixed(4)),
    p10: Number(pick(10).toFixed(4)),
    p25: Number(pick(25).toFixed(4)),
    median: Number(pick(50).toFixed(4)),
    p75: Number(pick(75).toFixed(4)),
    p90: Number(pick(90).toFixed(4)),
    max: Number(sorted[n - 1].toFixed(4)),
    mean: Number((sum / n).toFixed(4)),
  };
}

async function main() {
  await connectDB();

  console.log("\n========================================================");
  console.log("PHASE C.9: FINAL VISUAL SEARCH CONFIDENCE CALIBRATION");
  console.log("Offline Empirical Score Distributions & Threshold Analysis");
  console.log("========================================================\n");

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();
  const products = await Product.find({}).select("name category price images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  console.log(`Catalogue Loaded: ${products.length} products, ${catalogueVectors.length} visual vectors.`);

  // ----------------------------------------------------
  // DATASET PREPARATION
  // ----------------------------------------------------

  // 1. Download unique product images (cache in memory)
  const imageCache = new Map();
  console.log("Fetching representative catalogue images...");
  for (const p of products.slice(0, 20)) { // 20 distinct products for calibration
    const url = p.images?.[0];
    if (url && !imageCache.has(url)) {
      try {
        const buf = await downloadUrlToBuffer(url);
        imageCache.set(url, { productId: p._id.toString(), name: p.name, buffer: buf });
      } catch (err) {
        console.warn(`Failed fetching image for ${p.name}: ${err.message}`);
      }
    }
  }

  const cachedItems = Array.from(imageCache.values());
  console.log(`Cached ${cachedItems.length} unique catalogue images.`);

  // ----------------------------------------------------
  // A. EXACT MATCH TESTS
  // ----------------------------------------------------
  console.log("\nRunning Part A: EXACT MATCH Tests (Direct + Realistic Transformations)...");
  const exactResults = [];

  for (const item of cachedItems) {
    // 1. Clean Direct Catalogue Image
    const { candidates } = await generateCandidates(item.buffer, 10);
    const evalRes = await evaluateQuery(item.buffer, candidates, catalogueVectors, productMap, item.productId);
    exactResults.push({
      type: "exact_direct",
      name: item.name,
      productId: item.productId,
      ...evalRes,
    });

    // 2. Realistic Transformation: JPEG Recompression (Quality 40%) + Slight Resize (80%)
    const compressedBuf = await sharp(item.buffer)
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 40 })
      .toBuffer();
    const { candidates: candsComp } = await generateCandidates(compressedBuf, 10);
    const evalComp = await evaluateQuery(compressedBuf, candsComp, catalogueVectors, productMap, item.productId);
    exactResults.push({
      type: "exact_compressed",
      name: `${item.name} (Compressed/Resized)`,
      productId: item.productId,
      ...evalComp,
    });

    // 3. Realistic Transformation: Brightness shift (+15%) + Central 85% Crop
    const meta = await sharp(item.buffer).metadata();
    const cropW = Math.round(meta.width * 0.85);
    const cropH = Math.round(meta.height * 0.85);
    const croppedModBuf = await sharp(item.buffer)
      .extract({
        left: Math.round((meta.width - cropW) / 2),
        top: Math.round((meta.height - cropH) / 2),
        width: cropW,
        height: cropH,
      })
      .modulate({ brightness: 1.12, saturation: 1.05 })
      .jpeg()
      .toBuffer();
    const { candidates: candsCrop } = await generateCandidates(croppedModBuf, 10);
    const evalCrop = await evaluateQuery(croppedModBuf, candsCrop, catalogueVectors, productMap, item.productId);
    exactResults.push({
      type: "exact_cropped_lighting",
      name: `${item.name} (Cropped+Lighting)`,
      productId: item.productId,
      ...evalCrop,
    });
  }

  console.log(`Executed ${exactResults.length} Exact Match queries.`);

  // ----------------------------------------------------
  // B. SIMILAR PRODUCT TESTS
  // ----------------------------------------------------
  console.log("\nRunning Part B: SIMILAR PRODUCT Tests (Genuine distinct cross-matches)...");
  const similarResults = [];

  // Define pairs of distinct products in same categories/styles:
  // e.g. Temple Long vs Temple Lakshmi, Fairy vs Teardrop CZ, CZ Wave vs CZ Green, etc.
  const similarPairs = [
    { p1: "6a8983a438c8c89855e85107", p2: "6a8983a638c8c89855e85144", desc: "Temple Long Haram vs Temple Lakshmi Choker" },
    { p1: "6a8983a638c8c89855e85144", p2: "6a8983a438c8c89855e85107", desc: "Temple Lakshmi Choker vs Temple Long Haram" },
    { p1: "6a8983a438c8c89855e85110", p2: "6a8983a338c8c89855e850fb", desc: "Fairy Pendant vs Teardrop CZ Pendant" },
    { p1: "6a8983a338c8c89855e850fb", p2: "6a8983a438c8c89855e85110", desc: "Teardrop CZ Pendant vs Fairy Pendant" },
    { p1: "6a8983a538c8c89855e85123", p2: "6a8983a538c8c89855e85126", desc: "CZ Wave Set vs CZ Green Stone Set" },
    { p1: "6a8983a538c8c89855e85126", p2: "6a8983a538c8c89855e85123", desc: "CZ Green Stone Set vs CZ Wave Set" },
    { p1: "6a883d48b479512538b2bbb1", p2: "6a8983a438c8c89855e8510a", desc: "Delicate Pendant vs Dual Layer Minimalist" },
    { p1: "6a8983a438c8c89855e8510a", p2: "6a883d48b479512538b2bbb1", desc: "Dual Layer Minimalist vs Delicate Pendant" },
    { p1: "6a8983a338c8c89855e850ef", p2: "6a8983a438c8c89855e85116", desc: "Elephant Motif Set vs Temple Pendant Set" },
    { p1: "6a8983a438c8c89855e85116", p2: "6a8983a338c8c89855e850ef", desc: "Temple Pendant Set vs Elephant Motif Set" },
    { p1: "6a8983a338c8c89855e850f8", p2: "6a8983a338c8c89855e85104", desc: "Cushion Cut Green Set vs Layered Green Stone Set" },
    { p1: "6a8983a338c8c89855e85104", p2: "6a8983a338c8c89855e850f8", desc: "Layered Green Stone Set vs Cushion Cut Green Set" },
  ];

  for (const pair of similarPairs) {
    const p1Doc = productMap.get(pair.p1);
    const p2Doc = productMap.get(pair.p2);
    if (!p1Doc || !p2Doc || !p1Doc.images?.[0]) continue;

    let p1Buf = imageCache.get(p1Doc.images[0])?.buffer;
    if (!p1Buf) {
      try { p1Buf = await downloadUrlToBuffer(p1Doc.images[0]); } catch { continue; }
    }

    const { candidates } = await generateCandidates(p1Buf, 10);
    // Query with P1 image, but track P2 score and relative ranking!
    const evalRes = await evaluateQuery(p1Buf, candidates, catalogueVectors, productMap, pair.p2);

    similarResults.push({
      queryProduct: p1Doc.name,
      counterpartProduct: p2Doc.name,
      pairDesc: pair.desc,
      queryTop1: evalRes.top1Name,
      queryTop1Score: evalRes.top1Score,
      counterpartRank: evalRes.expectedRank,
      counterpartScore: evalRes.expectedScore,
      margin: evalRes.margin,
      agreementRatio: evalRes.agreementRatio,
    });
  }

  console.log(`Executed ${similarResults.length} Similar Product cross-queries.`);

  // ----------------------------------------------------
  // C. NO-MATCH TESTS (Unrelated Images)
  // ----------------------------------------------------
  console.log("\nRunning Part C: NO-MATCH Tests (Logos, UI, Footers, Landscapes, Graphics)...");
  const noMatchResults = [];

  const logoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");
  const uiFrameBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png");
  const footerBuf = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media__1788836749477.png");

  // Synthetic diverse unrelated images:
  // 1. Natural Landscape / Sky gradient
  const landscapeBuf = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 70, g: 140, b: 220 } },
  }).jpeg().toBuffer();

  // 2. High-contrast Text Document / Code screenshot
  const textDocBuf = await sharp({
    create: { width: 900, height: 700, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .composite([
      { input: Buffer.from('<svg width="700" height="500"><text x="40" y="80" font-size="28" fill="#111">CONFIDENTIAL INVOICE</text><text x="40" y="140" font-size="20" fill="#333">Item 1: Software Subscription - $120.00</text><text x="40" y="190" font-size="20" fill="#333">Item 2: Cloud Infrastructure - $450.00</text><text x="40" y="240" font-size="20" fill="#333">Total Amount Due: $570.00</text></svg>'), top: 50, left: 100 },
    ])
    .jpeg()
    .toBuffer();

  // 3. Dark Graphic Silhouette
  const darkGraphicBuf = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 15, g: 15, b: 18 } },
  })
    .composite([
      { input: Buffer.from('<svg width="400" height="400"><circle cx="200" cy="200" r="120" fill="#2a2a35"/></svg>'), top: 100, left: 100 },
    ])
    .jpeg()
    .toBuffer();

  // 4. Human Portrait simulation (flesh tones)
  const portraitBuf = await sharp({
    create: { width: 600, height: 800, channels: 3, background: { r: 215, g: 170, b: 140 } },
  }).jpeg().toBuffer();

  // 5. Unrelated Household Product (Coffee Mug simulation)
  const mugBuf = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .composite([
      { input: Buffer.from('<svg width="300" height="300"><rect x="50" y="50" width="160" height="200" rx="15" fill="#3b82f6"/><path d="M 210 90 C 260 90 260 190 210 190" stroke="#3b82f6" stroke-width="25" fill="none"/></svg>'), top: 150, left: 150 },
    ])
    .jpeg()
    .toBuffer();

  const unrelatedQueries = [
    { name: "Brand Logo Graphic", buffer: logoBuf },
    { name: "Website UI Intro Frame", buffer: uiFrameBuf },
    { name: "Website Footer Screenshot", buffer: footerBuf },
    { name: "Natural Landscape Blue Sky", buffer: landscapeBuf },
    { name: "Text Document / Invoice Screenshot", buffer: textDocBuf },
    { name: "Dark Graphic Silhouette", buffer: darkGraphicBuf },
    { name: "Human Face / Skin Tone Portrait", buffer: portraitBuf },
    { name: "Coffee Mug / Household Product", buffer: mugBuf },
  ];

  for (const uq of unrelatedQueries) {
    const { candidates } = await generateCandidates(uq.buffer, 10);
    const evalRes = await evaluateQuery(uq.buffer, candidates, catalogueVectors, productMap, null);
    noMatchResults.push({
      name: uq.name,
      top1Product: evalRes.top1Name,
      top1Score: evalRes.top1Score,
      top2Score: evalRes.top2Score,
      margin: evalRes.margin,
      agreementRatio: evalRes.agreementRatio,
      winningRegion: evalRes.winningRegion,
    });
  }

  console.log(`Executed ${noMatchResults.length} No-Match unrelated queries.`);

  // ----------------------------------------------------
  // D. REAL CUSTOMER SCREENSHOT TESTS
  // ----------------------------------------------------
  console.log("\nRunning Part D: Real Customer Screenshot Tests...");
  const fairySmallModalBuf = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png");
  const customer2Buf = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png");
  const customer3Buf = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png");

  const fairyDesktopCardBuf = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .composite([
      { input: await sharp(imageCache.get(products.find(p => p.name.includes("Fairy")).images[0]).buffer).resize(300, 320, { fit: "cover" }).toBuffer(), top: 120, left: 362 },
    ])
    .jpeg()
    .toBuffer();

  const instaScreenshotBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([
      { input: await sharp(imageCache.get(products.find(p => p.name.includes("Fairy")).images[0]).buffer).resize(720, 960, { fit: "cover" }).toBuffer(), top: 400, left: 180 },
    ])
    .jpeg()
    .toBuffer();

  const screenshotCases = [
    {
      name: "Fairy Desktop Tiny Modal (media_1788945719909.png)",
      buffer: fairySmallModalBuf,
      expectedProductId: "6a8983a438c8c89855e85110",
    },
    {
      name: "Customer Screenshot 2 (media_1788945712892.png)",
      buffer: customer2Buf,
      expectedProductId: "6a8983a538c8c89855e85123",
    },
    {
      name: "Customer Screenshot 3 (media_1788945723732.png)",
      buffer: customer3Buf,
      expectedProductId: "6a8983a538c8c89855e85126",
    },
    {
      name: "Fairy Desktop Product Card",
      buffer: fairyDesktopCardBuf,
      expectedProductId: "6a8983a438c8c89855e85110",
    },
    {
      name: "Instagram Mobile Viewport",
      buffer: instaScreenshotBuf,
      expectedProductId: "6a8983a438c8c89855e85110",
    },
  ];

  const screenshotReports = [];
  for (const sc of screenshotCases) {
    // 1. Full Image Only
    const metaSc = await sharp(sc.buffer).metadata();
    const evalFull = await evaluateQuery(sc.buffer, [{ type: "full_image", box: { left: 0, top: 0, width: metaSc.width, height: metaSc.height } }], catalogueVectors, productMap, sc.expectedProductId);

    // 2. K=10 Candidates
    const { candidates: cands10 } = await generateCandidates(sc.buffer, 10);
    const evalK10 = await evaluateQuery(sc.buffer, cands10, catalogueVectors, productMap, sc.expectedProductId);

    // 3. K=20 Candidates
    const { candidates: cands20 } = await generateCandidates(sc.buffer, 20);
    const evalK20 = await evaluateQuery(sc.buffer, cands20, catalogueVectors, productMap, sc.expectedProductId);

    screenshotReports.push({
      name: sc.name,
      fullImageRank: evalFull.expectedRank,
      fullImageScore: evalFull.expectedScore,
      k10Rank: evalK10.expectedRank,
      k10Score: evalK10.expectedScore,
      k10Top1: evalK10.top1Name,
      k10Top1Score: evalK10.top1Score,
      k10Margin: evalK10.margin,
      k20Rank: evalK20.expectedRank,
      k20Score: evalK20.expectedScore,
      k20Top1: evalK20.top1Name,
      k20Top1Score: evalK20.top1Score,
      k20Margin: evalK20.margin,
      k20WinningRegion: evalK20.winningRegion,
    });
  }

  // ----------------------------------------------------
  // E. ADAPTIVE K EXPERIMENT
  // ----------------------------------------------------
  console.log("\nRunning Part E: Adaptive K Experiment (K=10 first, expand to K=20 if unconfident)...");
  // Test adaptive logic across: 20 Exacts + 8 Unrelated + 5 Screenshots = 33 test items
  const adaptivePool = [
    ...exactResults.slice(0, 15).map(e => ({ name: e.name, buffer: cachedItems.find(c => c.productId === e.productId).buffer, expectedId: e.productId, isJewellery: true })),
    ...unrelatedQueries.map(u => ({ name: u.name, buffer: u.buffer, expectedId: null, isJewellery: false })),
    ...screenshotCases.map(s => ({ name: s.name, buffer: s.buffer, expectedId: s.expectedProductId, isJewellery: true })),
  ];

  let resolvedAtK10 = 0;
  let requiredK20 = 0;
  let correctAtK10 = 0;
  let correctAfterK20 = 0;
  const latencies = [];

  for (const item of adaptivePool) {
    const t0 = Date.now();
    // Step 1: Run K=10
    const { candidates: cands10 } = await generateCandidates(item.buffer, 10);
    const eval10 = await evaluateQuery(item.buffer, cands10, catalogueVectors, productMap, item.expectedId);

    // Confidence heuristic for Step 1:
    // Confident if score >= 0.78 AND margin >= 0.03 (clearly identified direct match or clean card)
    const isConfident10 = (eval10.top1Score >= 0.78 && eval10.margin >= 0.03);

    let finalEval = eval10;
    if (isConfident10) {
      resolvedAtK10++;
      if (item.isJewellery && eval10.isCorrectTop1) correctAtK10++;
      if (!item.isJewellery && eval10.top1Score < 0.65) correctAtK10++;
    } else {
      requiredK20++;
      // Step 2: Expand to K=20
      const { candidates: cands20 } = await generateCandidates(item.buffer, 20);
      const eval20 = await evaluateQuery(item.buffer, cands20, catalogueVectors, productMap, item.expectedId);
      finalEval = eval20;
    }

    const elapsed = Date.now() - t0;
    latencies.push(elapsed);

    if (item.isJewellery && finalEval.isCorrectTop1) correctAfterK20++;
    if (!item.isJewellery && finalEval.top1Score < 0.65) correctAfterK20++;
  }

  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const maxLatency = Math.max(...latencies);

  // ----------------------------------------------------
  // F. DISTRIBUTION CALCULATION
  // ----------------------------------------------------
  const exactScores = exactResults.map(r => r.top1Score);
  const exactMargins = exactResults.map(r => r.margin);
  const exactAgreements = exactResults.map(r => r.agreementRatio);

  const similarScores = similarResults.map(r => r.counterpartScore).filter(s => s !== null && s !== undefined);
  const similarTop1Scores = similarResults.map(r => r.queryTop1Score);
  const similarMargins = similarResults.map(r => r.margin);

  const noMatchScores = noMatchResults.map(r => r.top1Score);
  const noMatchMargins = noMatchResults.map(r => r.margin);
  const noMatchAgreements = noMatchResults.map(r => r.agreementRatio);

  const exactDist = {
    score: calcPercentiles(exactScores),
    margin: calcPercentiles(exactMargins),
    agreement: calcPercentiles(exactAgreements),
  };

  const similarDist = {
    counterpartScore: calcPercentiles(similarScores),
    top1Score: calcPercentiles(similarTop1Scores),
    margin: calcPercentiles(similarMargins),
  };

  const noMatchDist = {
    score: calcPercentiles(noMatchScores),
    margin: calcPercentiles(noMatchMargins),
    agreement: calcPercentiles(noMatchAgreements),
  };

  // Compile Final Output Object
  const finalOutput = {
    summary: {
      catalogueProducts: products.length,
      visualVectors: catalogueVectors.length,
      exactTestCount: exactResults.length,
      similarTestCount: similarResults.length,
      noMatchTestCount: noMatchResults.length,
      screenshotTestCount: screenshotCases.length,
    },
    distributions: {
      exact: exactDist,
      similar: similarDist,
      noMatch: noMatchDist,
    },
    adaptiveK: {
      totalEvaluated: adaptivePool.length,
      resolvedAtK10,
      percentResolvedK10: `${((resolvedAtK10 / adaptivePool.length) * 100).toFixed(1)}%`,
      requiredK20,
      percentRequiredK20: `${((requiredK20 / adaptivePool.length) * 100).toFixed(1)}%`,
      accuracyAtK10: `${((correctAtK10 / adaptivePool.length) * 100).toFixed(1)}%`,
      accuracyAfterK20: `${((correctAfterK20 / adaptivePool.length) * 100).toFixed(1)}%`,
      avgLatencyMs: avgLatency,
      maxLatencyMs: maxLatency,
    },
    screenshotReports,
    sampleExactResults: exactResults.slice(0, 10),
    sampleSimilarResults: similarResults,
    sampleNoMatchResults: noMatchResults,
  };

  fs.writeFileSync(
    path.resolve(process.cwd(), "uploads", "c9_calibration_report.json"),
    JSON.stringify(finalOutput, null, 2)
  );

  console.log("\n========================================================");
  console.log("CALIBRATION DISTRIBUTIONS SUMMARY");
  console.log("========================================================");
  console.log("1. EXACT MATCH SCORES:", exactDist.score);
  console.log("2. SIMILAR PRODUCT COUNTERPART SCORES:", similarDist.counterpartScore);
  console.log("3. NO-MATCH / UNRELATED TOP SCORES:", noMatchDist.score);

  console.log("\n========================================================");
  console.log("MARGIN DISTRIBUTIONS SUMMARY");
  console.log("========================================================");
  console.log("1. EXACT MARGINS:", exactDist.margin);
  console.log("2. NO-MATCH MARGINS:", noMatchDist.margin);

  console.log("\n========================================================");
  console.log("ADAPTIVE K RESULTS");
  console.log("========================================================");
  console.log(`Resolved at K=10 : ${finalOutput.adaptiveK.resolvedAtK10} / ${finalOutput.adaptiveK.totalEvaluated} (${finalOutput.adaptiveK.percentResolvedK10})`);
  console.log(`Expanded to K=20 : ${finalOutput.adaptiveK.requiredK20} / ${finalOutput.adaptiveK.totalEvaluated} (${finalOutput.adaptiveK.percentRequiredK20})`);
  console.log(`Accuracy Final   : ${finalOutput.adaptiveK.accuracyAfterK20}`);
  console.log(`Average Latency  : ${finalOutput.adaptiveK.avgLatencyMs}ms`);
  console.log(`Max Latency      : ${finalOutput.adaptiveK.maxLatencyMs}ms`);

  console.log("\nSaved calibration dataset report to uploads/c9_calibration_report.json");
  process.exit(0);
}

main().catch((err) => {
  console.error("C.9 Error:", err);
  process.exit(1);
});
