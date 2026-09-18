import sharp from "sharp";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { extractEmbeddingFromBuffer, computeCosineSimilarity } from "./clipVisualSearchService.js";

const MODEL_IDENTIFIER = "Xenova/clip-vit-base-patch32";
const EXPECTED_DIMENSION = 512;

let cachedCatalogueVectors = null;
let cachedVectorsTimestamp = 0;
let cachedProductDocs = null;
let cachedProductsTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function computeIoU(boxA, boxB) {
  const xA = Math.max(boxA.left, boxB.left);
  const yA = Math.max(boxA.top, boxB.top);
  const xB = Math.min(boxA.left + boxA.width, boxB.left + boxB.width);
  const yB = Math.min(boxA.top + boxA.height, boxB.top + boxB.height);

  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  const interArea = interW * interH;
  if (interArea === 0) return 0;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  return interArea / (areaA + areaB - interArea);
}

/**
 * Propose multi-scale photometric candidate regions up to maxK
 */
export async function generateCandidateRegions(imageBuffer, maxK = 20, nmsIouThreshold = 0.35) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  const candidates = [];

  // 1. Always include full image
  candidates.push({
    type: "full",
    box: { left: 0, top: 0, width, height },
    photoScore: 1.0,
  });

  // 2. 1:1 Aspect ratio square center
  const minDim = Math.min(width, height);
  candidates.push({
    type: "central_square",
    box: {
      left: Math.round((width - minDim) / 2),
      top: Math.round((height - minDim) / 2),
      width: minDim,
      height: minDim,
    },
    photoScore: 0.95,
  });

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

  return candidates.slice(0, maxK);
}

/**
 * Evaluate a slice of candidate regions against catalogue vectors
 */
async function evaluateCandidateSlice(
  imageBuffer,
  candidatesSlice,
  catalogueVectors,
  imgWidth,
  imgHeight,
  productBestMap,
  regionTop1Count
) {
  for (const cand of candidatesSlice) {
    let cropBuf;
    if (
      cand.box.left === 0 &&
      cand.box.top === 0 &&
      cand.box.width === imgWidth &&
      cand.box.height === imgHeight
    ) {
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
      regionTop1Count.set(
        regionWinner.productId,
        (regionTop1Count.get(regionWinner.productId) || 0) + 1
      );
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

    // Clean reference
    cropBuf = null;
  }
}

/**
 * Determine whether image is a direct/clean photo or a cluttered screenshot
 */
function analyzeImageCharacteristics(productBestMap, candidatesEvaluated) {
  const fullCand = candidatesEvaluated.find((c) => c.type === "full");
  const sortedGlobal = Array.from(productBestMap.values()).sort((a, b) => b.bestScore - a.bestScore);
  const top1 = sortedGlobal[0] || null;

  if (!top1) {
    return "UNKNOWN";
  }

  // If winning region is full or central_square and score is high
  if (top1.winningRegion === "full" || top1.winningRegion === "central_square") {
    return "DIRECT_CLEAN";
  }

  // If a small crop won and scored substantially higher than full frame
  return "SCREENSHOT_CLUTTERED";
}

/**
 * Main Fallback Pipeline:
 * Existing perceptual hash (invoked by caller) -> If none, runHybridFallback(buffer)
 */
export async function runHybridFallback(imageBuffer, options = {}) {
  const startTime = Date.now();

  // 1. Buffer validation (in-memory only)
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("Invalid or empty image buffer provided to runHybridFallback");
  }

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  if (width < 20 || height < 20) {
    throw new Error(`Image dimensions too small for visual search (${width}x${height})`);
  }

  // 2. Fetch catalogue vectors & product lookup (leveraging memory cache / options)
  let catalogueVectors = options.catalogueVectors;
  if (!catalogueVectors || catalogueVectors.length === 0) {
    if (cachedCatalogueVectors && Date.now() - cachedVectorsTimestamp < CACHE_TTL_MS) {
      catalogueVectors = cachedCatalogueVectors;
    } else {
      catalogueVectors = await ProductVisualVector.find({
        model: MODEL_IDENTIFIER,
      }).lean();
      if (catalogueVectors.length > 0) {
        cachedCatalogueVectors = catalogueVectors;
        cachedVectorsTimestamp = Date.now();
      }
    }
  }

  if (!catalogueVectors || catalogueVectors.length === 0) {
    return {
      success: false,
      source: "hybrid_clip",
      confidence: {
        level: "NO_MATCH",
        score: 0,
        margin: 0,
        regionAgreement: "0/0 (0%)",
        candidateBudget: 0,
        expandedToK20: false,
        imageType: "UNKNOWN",
      },
      exactCandidate: null,
      similarCandidates: [],
      needsCrop: false,
      message: "No catalogue visual vectors available.",
      latencyMs: Date.now() - startTime,
    };
  }

  let allProductDocs = options.allProductDocs;
  if (!allProductDocs || allProductDocs.length === 0) {
    if (cachedProductDocs && Date.now() - cachedProductsTimestamp < CACHE_TTL_MS) {
      allProductDocs = cachedProductDocs;
    } else {
      allProductDocs = await Product.find({})
        .select("name category price discountPrice images image")
        .lean();
      if (allProductDocs.length > 0) {
        cachedProductDocs = allProductDocs;
        cachedProductsTimestamp = Date.now();
      }
    }
  }
  const productMap = options.productMap || new Map((allProductDocs || []).map((p) => [p._id.toString(), p]));

  // 3. Propose candidate regions (up to K=20)
  const allCandidates = await generateCandidateRegions(imageBuffer, 20, 0.35);

  const productBestMap = new Map();
  const regionTop1Count = new Map();

  // 4. Evaluate K=10 first
  const k10Candidates = allCandidates.slice(0, 10);
  await evaluateCandidateSlice(
    imageBuffer,
    k10Candidates,
    catalogueVectors,
    width,
    height,
    productBestMap,
    regionTop1Count
  );

  let sortedGlobal = Array.from(productBestMap.values()).sort((a, b) => b.bestScore - a.bestScore);
  let top1 = sortedGlobal[0] || null;
  let top2 = sortedGlobal[1] || null;
  let top1Score = top1 ? top1.bestScore : 0;
  let top2Score = top2 ? top2.bestScore : 0;
  let margin = Number((top1Score - top2Score).toFixed(4));

  // 5. Adaptive K Decision:
  // Can K=10 resolve with high certainty?
  // Stop early ONLY if:
  // - Top1 score is very strong (>= 0.88) AND margin is decisive (>= 0.050)
  // - AND winning region is clean (full or central square)
  const isK10Decisive = top1Score >= 0.88 && margin >= 0.050 && (top1.winningRegion === "full" || top1.winningRegion === "central_square");

  let expandedToK20 = false;
  let candidateBudget = 10;

  if (!isK10Decisive && allCandidates.length > 10) {
    // Expand to K=20
    expandedToK20 = true;
    candidateBudget = Math.min(20, allCandidates.length);
    const k20AdditionalSlice = allCandidates.slice(10, candidateBudget);

    await evaluateCandidateSlice(
      imageBuffer,
      k20AdditionalSlice,
      catalogueVectors,
      width,
      height,
      productBestMap,
      regionTop1Count
    );

    // Recalculate global scores
    sortedGlobal = Array.from(productBestMap.values()).sort((a, b) => b.bestScore - a.bestScore);
    top1 = sortedGlobal[0] || null;
    top2 = sortedGlobal[1] || null;
    top1Score = top1 ? top1.bestScore : 0;
    top2Score = top2 ? top2.bestScore : 0;
    margin = Number((top1Score - top2Score).toFixed(4));
  }

  const evaluatedCandidates = allCandidates.slice(0, candidateBudget);
  const top1Agreement = top1 ? (regionTop1Count.get(top1.productId) || 0) : 0;
  const agreementRatio = evaluatedCandidates.length > 0 ? top1Agreement / evaluatedCandidates.length : 0;
  const regionAgreementStr = `${top1Agreement}/${evaluatedCandidates.length} (${(agreementRatio * 100).toFixed(0)}%)`;

  const imageType = analyzeImageCharacteristics(productBestMap, evaluatedCandidates);

  // 6. Confidence Tier Classification (Step 3 & Step 8 rules)
  // Strict rule: DO NOT equate score >= 0.85 or 0.90 to guaranteed exact match.
  let confidenceLevel = "NO_MATCH";
  let needsCrop = false;
  let message = "";
  let exactCandidate = null;
  const similarCandidates = [];

  const top1ProductDoc = top1 ? productMap.get(top1.productId) : null;
  const top1Name = top1ProductDoc ? top1ProductDoc.name : "Unknown";

  // Check for AMBIGUOUS / FALSE POSITIVE conditions first:
  // - Unrelated noise scoring > 0.60 with small margin (< 0.020)
  // - Similar products scoring > 0.85 with tight margin (< 0.020)
  // - Cluttered screenshots with weak signal (< 0.630 or margin < 0.015)
  if (top1Score < 0.630) {
    if (top1Score >= 0.580 && margin < 0.020) {
      confidenceLevel = "NO_MATCH";
      message = "No matching product found in catalogue.";
    } else if (imageType === "SCREENSHOT_CLUTTERED" && top1Score >= 0.600) {
      confidenceLevel = "AMBIGUOUS";
      needsCrop = true;
      message = "Image contains multiple elements or low resolution. Please crop directly around the jewellery.";
    } else {
      confidenceLevel = "NO_MATCH";
      message = "No matching product found in catalogue.";
    }
  } else if (top1Score >= 0.880 && margin >= 0.050 && imageType === "DIRECT_CLEAN") {
    // High confidence clean image
    confidenceLevel = "HIGH_CONFIDENCE";
    message = "High confidence visual match identified.";
    exactCandidate = {
      _id: top1.productId,
      name: top1Name,
      category: top1ProductDoc?.category || "",
      price: top1ProductDoc?.price || 0,
      score: top1Score,
      margin,
      winningRegion: top1.winningRegion,
      product: top1ProductDoc || null,
    };
  } else if (top1Score >= 0.850 && margin < 0.035) {
    // Overlap zone: High score but close sister product!
    confidenceLevel = "AMBIGUOUS";
    message = "Multiple visually similar jewellery items found with comparable match scores.";
  } else if (top1Score >= 0.720 && margin >= 0.025) {
    // Meaningful similarity or clean post crop
    confidenceLevel = "MEDIUM_CONFIDENCE";
    message = "Visually similar products identified in catalogue.";
  } else if (top1Score >= 0.630 && margin >= 0.020) {
    // Screenshot candidate recovered or moderate similarity
    confidenceLevel = "LOW_CONFIDENCE";
    needsCrop = true;
    message = "Potential match detected from screenshot. Cropping closer may improve accuracy.";
  } else {
    confidenceLevel = "AMBIGUOUS";
    needsCrop = true;
    message = "Match confidence is ambiguous due to competing catalogue scores.";
  }

  // Populate candidate list (up to 5 similar items)
  for (let i = (exactCandidate ? 1 : 0); i < Math.min(6, sortedGlobal.length); i++) {
    const item = sortedGlobal[i];
    const doc = productMap.get(item.productId);
    const nextItem = sortedGlobal[i + 1];
    const itemMargin = nextItem ? Number((item.bestScore - nextItem.bestScore).toFixed(4)) : 0;

    similarCandidates.push({
      _id: item.productId,
      name: doc ? doc.name : "Unknown",
      category: doc?.category || "",
      price: doc?.price || 0,
      score: item.bestScore,
      margin: itemMargin,
      winningRegion: item.winningRegion,
    });
  }

  const durationMs = Date.now() - startTime;

  return {
    success: confidenceLevel !== "NO_MATCH",
    source: "hybrid_clip",
    confidence: {
      level: confidenceLevel,
      score: top1Score,
      margin,
      regionAgreement: regionAgreementStr,
      candidateBudget,
      expandedToK20,
      imageType,
    },
    exactCandidate,
    similarCandidates,
    needsCrop,
    message,
    latencyMs: durationMs,
    winningRegion: top1 ? top1.winningRegion : "none",
  };
}

/**
 * PHASE D.3: CONTROLLED HIGH-CONFIDENCE DECISION GATE
 * Evaluates whether a hybrid fallback result is safe and eligible
 * for production promotion.
 *
 * Strict Promotion Invariants:
 * 1. Must contain a valid exact candidate object with an _id.
 * 2. Confidence level must be strictly "HIGH_CONFIDENCE".
 * 3. Fallback visual score must be >= 0.880.
 * 4. Fallback discrimination margin must be >= 0.050.
 * 5. Image framing must be verified as "DIRECT_CLEAN" (uncluttered).
 *
 * Returns: boolean (deterministic)
 */
export function shouldPromoteHybridFallback(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  // 1. Must contain valid exactCandidate with _id
  if (!result.exactCandidate || typeof result.exactCandidate !== "object" || !result.exactCandidate._id) {
    return false;
  }

  // 2. Must contain valid confidence object
  if (!result.confidence || typeof result.confidence !== "object") {
    return false;
  }

  const { level, score, margin, imageType } = result.confidence;

  // 3. Level must be strictly HIGH_CONFIDENCE
  if (level !== "HIGH_CONFIDENCE") {
    return false;
  }

  // 4. Numeric validity
  if (typeof score !== "number" || !Number.isFinite(score) ||
      typeof margin !== "number" || !Number.isFinite(margin)) {
    return false;
  }

  // 5. Calibrated threshold: score >= 0.880
  if (score < 0.880) {
    return false;
  }

  // 6. Calibrated threshold: margin >= 0.050
  if (margin < 0.050) {
    return false;
  }

  // 7. Framing / imageType requirement: must be DIRECT_CLEAN
  if (imageType !== "DIRECT_CLEAN") {
    return false;
  }

  return true;
}

