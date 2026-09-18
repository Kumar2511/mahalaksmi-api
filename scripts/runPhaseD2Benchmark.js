import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { runHybridFallback } from "../services/hybridFallbackService.js";
import {
  createScreenshotFingerprints,
  createCatalogueFingerprints,
  compareScreenshotToCatalogue,
} from "../utils/imageHash.js";

function getFilename(url) {
  if (!url || typeof url !== "string") return "";
  try {
    return decodeURIComponent(url.split("?")[0].split("/").pop() || "").toLowerCase();
  } catch {
    return (url.split("?")[0].split("/").pop() || "").toLowerCase();
  }
}

// In-memory perceptual hash runner
async function evaluatePerceptualHash(imageBuffer, catalogueProducts, catalogueCache) {
  try {
    const screenshotFingerprints = await createScreenshotFingerprints(imageBuffer);
    if (!screenshotFingerprints || screenshotFingerprints.length === 0) {
      return { matchType: "none", exactMatch: null, bestScore: 0 };
    }

    const scored = [];
    for (const product of catalogueProducts) {
      const imageUrls = [product.image, ...(product.images || [])].filter(Boolean);
      let bestForProduct = null;

      for (const url of imageUrls) {
        const catFps = catalogueCache.get(url);
        if (!catFps || catFps.length === 0) continue;

        const comp = compareScreenshotToCatalogue(screenshotFingerprints, catFps);
        if (comp && (!bestForProduct || comp.similarity > bestForProduct.comparison.similarity)) {
          bestForProduct = { product, comparison: comp };
        }
      }
      if (bestForProduct) scored.push(bestForProduct);
    }

    if (scored.length === 0) {
      return { matchType: "none", exactMatch: null, bestScore: 0 };
    }

    scored.sort((a, b) => b.comparison.similarity - a.comparison.similarity);
    const best = scored[0];
    const second = scored[1] || null;
    const bestSim = Number(best.comparison.similarity);
    const secondSim = second ? Number(second.comparison.similarity) : 0;
    const margin = bestSim - secondSim;

    const strongStructure = best.comparison.grayscaleSimilarity >= 0.83;
    const strongEdges = best.comparison.edgeSimilarity >= 0.48;
    const normalExact = bestSim >= 0.80 && strongStructure && strongEdges && margin >= 0.008;
    const veryStrongExact = bestSim >= 0.86 && best.comparison.grayscaleSimilarity >= 0.88;

    if (normalExact || veryStrongExact) {
      return { matchType: "exact", exactMatch: best.product._id.toString(), bestScore: bestSim };
    }

    const similar = scored.filter(
      (item) =>
        Number(item.comparison.similarity) >= 0.72 &&
        Number(item.comparison.grayscaleSimilarity) >= 0.76 &&
        Number(item.comparison.edgeSimilarity) >= 0.56
    );

    if (similar.length > 0) {
      return { matchType: "category", exactMatch: null, bestScore: bestSim };
    }

    return { matchType: "none", exactMatch: null, bestScore: bestSim };
  } catch (err) {
    return { matchType: "none", exactMatch: null, bestScore: 0, error: err.message };
  }
}

async function main() {
  await connectDB();

  console.log("\n========================================================");
  console.log("PHASE D.2: LABELLED SHADOW ACCURACY BENCHMARK");
  console.log("Measuring real hybrid fallback accuracy on hash='none' cases");
  console.log("========================================================\n");

  const allProducts = await Product.find({}).select("name category price images image").lean();
  const productMap = new Map(allProducts.map((p) => [p._id.toString(), p]));
  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();
  console.log(`Loaded ${catalogueVectors.length} catalogue vectors in memory.`);

  // Select 10 representative ground-truth products across diverse styles
  const targetProducts = [
    allProducts.find((p) => p.name.includes("Fairy")),
    allProducts.find((p) => p.name.includes("Temple Long")),
    allProducts.find((p) => p.name.includes("Temple Lakshmi")),
    allProducts.find((p) => p.name.includes("Wave")),
    allProducts.find((p) => p.name.includes("Green and White CZ")),
    allProducts.find((p) => p.name.includes("Teardrop CZ")),
    allProducts.find((p) => p.name.includes("Delicate Pendant")),
    allProducts.find((p) => p.name.includes("Dual Layer")),
    allProducts.find((p) => p.name.includes("Elephant")),
    allProducts.find((p) => p.name.includes("Temple Pendant")),
  ].filter(Boolean);

  console.log(`Selected ${targetProducts.length} representative ground-truth products:`);
  targetProducts.forEach((p, idx) => console.log(`  ${idx + 1}. ${p.name} (${p._id})`));

  // Load product images from local .image_cache into memory
  console.log("\nLoading product images from local .image_cache into memory cache...");
  const imageCache = new Map();
  for (const p of targetProducts) {
    const url = p.images?.[0] || p.image;
    const filename = getFilename(url);
    const localPath = path.resolve(process.cwd(), ".image_cache", filename);
    if (fs.existsSync(localPath)) {
      const buf = fs.readFileSync(localPath);
      imageCache.set(p._id.toString(), { url, buffer: buf, name: p.name });
    } else {
      console.warn(`Local file missing for ${p.name}: ${filename}`);
    }
  }
  console.log(`Loaded ${imageCache.size}/${targetProducts.length} target images into memory.`);

  // Pre-warm catalogue fingerprints from .image_cache
  console.log("Pre-warming perceptual-hash catalogue cache from local .image_cache...");
  const catalogueCache = new Map();
  const tWarmStart = Date.now();
  for (const p of allProducts) {
    const urls = [p.image, ...(p.images || [])].filter(Boolean);
    for (const url of urls) {
      const filename = getFilename(url);
      const localPath = path.resolve(process.cwd(), ".image_cache", filename);
      if (fs.existsSync(localPath)) {
        try {
          const fps = await createCatalogueFingerprints(localPath);
          if (fps && fps.length > 0) {
            catalogueCache.set(url, fps);
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }
  console.log(
    `Catalogue cache warmed with ${catalogueCache.size} fingerprints in ${Date.now() - tWarmStart}ms.\n`
  );

  // Synthesize Dataset Queries
  console.log("Generating multi-representation labelled query dataset in memory...");
  const queries = [];

  for (const p of targetProducts) {
    const cached = imageCache.get(p._id.toString());
    if (!cached) continue;
    const baseBuf = cached.buffer;
    const meta = await sharp(baseBuf).metadata();
    const pid = p._id.toString();
    const pname = p.name;

    // 1. Original catalogue image
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "original_catalogue",
      buffer: baseBuf,
    });

    // 2. JPEG compressed (Q=35)
    const compBuf = await sharp(baseBuf).jpeg({ quality: 35 }).toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "jpeg_compressed",
      buffer: compBuf,
    });

    // 3. Resized (380px)
    const resizeBuf = await sharp(baseBuf).resize(380).jpeg().toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "resized",
      buffer: resizeBuf,
    });

    // 4. Moderate crop (central 75%)
    const cropW = Math.round(meta.width * 0.75);
    const cropH = Math.round(meta.height * 0.75);
    const cropBuf = await sharp(baseBuf)
      .extract({
        left: Math.round((meta.width - cropW) / 2),
        top: Math.round((meta.height - cropH) / 2),
        width: cropW,
        height: cropH,
      })
      .jpeg()
      .toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "moderate_crop",
      buffer: cropBuf,
    });

    // 5. Lighting / brightness variation (+15% brightness, +10% sat, 88% crop)
    const lightW = Math.round(meta.width * 0.88);
    const lightH = Math.round(meta.height * 0.88);
    const lightBuf = await sharp(baseBuf)
      .extract({
        left: Math.round((meta.width - lightW) / 2),
        top: Math.round((meta.height - lightH) / 2),
        width: lightW,
        height: lightH,
      })
      .modulate({ brightness: 1.15, saturation: 1.10 })
      .jpeg()
      .toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "lighting_shifted",
      buffer: lightBuf,
    });

    // 6. Product-card screenshot (300x320 inside 1024x768 desktop viewport)
    const cardBuf = await sharp({
      create: { width: 1024, height: 768, channels: 3, background: { r: 245, g: 245, b: 245 } },
    })
      .composite([
        {
          input: await sharp(baseBuf).resize(300, 320, { fit: "cover" }).toBuffer(),
          top: 120,
          left: 362,
        },
      ])
      .jpeg()
      .toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "product_card_screenshot",
      buffer: cardBuf,
    });

    // 7. Instagram-style screenshot (720x960 inside 1080x1920 mobile viewport)
    const instaBuf = await sharp({
      create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
    })
      .composite([
        {
          input: await sharp(baseBuf).resize(720, 960, { fit: "cover" }).toBuffer(),
          top: 400,
          left: 180,
        },
      ])
      .jpeg()
      .toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "instagram_screenshot",
      buffer: instaBuf,
    });

    // 8. Cluttered customer webpage screenshot (300x320 card in 1280x800 page with header simulation)
    const pageBuf = await sharp({
      create: { width: 1280, height: 800, channels: 3, background: { r: 240, g: 242, b: 245 } },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="1280" height="70"><rect width="1280" height="70" fill="#ffffff"/><text x="40" y="42" font-size="22" font-weight="bold" fill="#111">THE GIRL HOUSE</text><text x="400" y="42" font-size="16" fill="#666">Necklaces  •  Chokers  •  Earrings  •  Sale</text></svg>'
          ),
          top: 0,
          left: 0,
        },
        {
          input: await sharp(baseBuf).resize(300, 320, { fit: "cover" }).toBuffer(),
          top: 160,
          left: 200,
        },
      ])
      .jpeg()
      .toBuffer();
    queries.push({
      expectedProductId: pid,
      expectedProductName: pname,
      repType: "customer_webpage_screenshot",
      buffer: pageBuf,
    });
  }

  // 9. Genuine Cross-Product Similar Queries (6 pairs)
  const similarPairs = [
    { p1: targetProducts[1], p2: targetProducts[2], desc: "Temple Long Haram vs Temple Lakshmi Choker" },
    { p1: targetProducts[2], p2: targetProducts[1], desc: "Temple Lakshmi Choker vs Temple Long Haram" },
    { p1: targetProducts[0], p2: targetProducts[5], desc: "Fairy Pendant vs Teardrop CZ Pendant" },
    { p1: targetProducts[5], p2: targetProducts[0], desc: "Teardrop CZ Pendant vs Fairy Pendant" },
    { p1: targetProducts[3], p2: targetProducts[4], desc: "CZ Wave Set vs CZ Green Stone Set" },
    { p1: targetProducts[4], p2: targetProducts[3], desc: "CZ Green Stone Set vs CZ Wave Set" },
  ];

  for (const pair of similarPairs) {
    if (!pair.p1 || !pair.p2) continue;
    const p1Cached = imageCache.get(pair.p1._id.toString());
    if (!p1Cached) continue;
    queries.push({
      expectedProductId: pair.p1._id.toString(),
      expectedProductName: pair.p1.name,
      counterpartProductId: pair.p2._id.toString(),
      counterpartProductName: pair.p2.name,
      repType: "cross_product_similar",
      buffer: p1Cached.buffer,
      desc: pair.desc,
    });
  }

  // 10. Unrelated / Noise Queries (6 images, expectedProductId: null)
  const logoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");
  const uiFrameBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png");
  const footerBuf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media__1788836749477.png"
  );
  const landscapeBuf = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 70, g: 140, b: 220 } },
  }).jpeg().toBuffer();
  const textDocBuf = await sharp({
    create: { width: 900, height: 700, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="700" height="500"><text x="40" y="80" font-size="28" fill="#111">CONFIDENTIAL INVOICE</text><text x="40" y="140" font-size="20" fill="#333">Item 1: Software - $120.00</text><text x="40" y="240" font-size="20" fill="#333">Total: $120.00</text></svg>'
        ),
        top: 50,
        left: 100,
      },
    ])
    .jpeg()
    .toBuffer();
  const darkGraphicBuf = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 15, g: 15, b: 18 } },
  })
    .composite([
      { input: Buffer.from('<svg width="400" height="400"><circle cx="200" cy="200" r="120" fill="#2a2a35"/></svg>'), top: 100, left: 100 },
    ])
    .jpeg()
    .toBuffer();

  const unrelatedQueries = [
    { repType: "unrelated_brand_logo", buffer: logoBuf },
    { repType: "unrelated_ui_frame", buffer: uiFrameBuf },
    { repType: "unrelated_footer", buffer: footerBuf },
    { repType: "unrelated_landscape", buffer: landscapeBuf },
    { repType: "unrelated_text_invoice", buffer: textDocBuf },
    { repType: "unrelated_dark_silhouette", buffer: darkGraphicBuf },
  ];

  for (const uq of unrelatedQueries) {
    queries.push({
      expectedProductId: null,
      expectedProductName: "None (Unrelated)",
      repType: uq.repType,
      buffer: uq.buffer,
    });
  }

  console.log(`Generated total of ${queries.length} queries:`);
  console.log(`- Labelled Product Queries: ${queries.filter((q) => q.expectedProductId !== null).length}`);
  console.log(`- Unrelated Queries: ${queries.filter((q) => q.expectedProductId === null).length}\n`);

  // Run Benchmark Suite
  console.log("Executing benchmark evaluation across all queries...");
  const benchmarkResults = [];
  let index = 0;

  for (const q of queries) {
    index++;
    const t0 = Date.now();

    // 1. Existing perceptual hash
    const hashRes = await evaluatePerceptualHash(q.buffer, allProducts, catalogueCache);
    const existingHashMatchType = hashRes.matchType;

    // 2. Hybrid fallback (100% in-memory vectors and docs)
    const fallbackRes = await runHybridFallback(q.buffer, {
      catalogueVectors,
      allProductDocs: allProducts,
      productMap,
    });
    const duration = Date.now() - t0;

    const top1Candidate = fallbackRes.exactCandidate || fallbackRes.similarCandidates[0] || null;
    const hybridTopProductId = top1Candidate ? top1Candidate._id.toString() : null;
    const hybridTopProductName = top1Candidate ? top1Candidate.name : "None";
    const hybridScore = fallbackRes.confidence.score;
    const hybridMargin = fallbackRes.confidence.margin;
    const confidenceLevel = fallbackRes.confidence.level;
    const candidateBudget = fallbackRes.confidence.candidateBudget;
    const expandedToK20 = fallbackRes.confidence.expandedToK20;

    const top6ProductIds = [];
    if (fallbackRes.exactCandidate) top6ProductIds.push(fallbackRes.exactCandidate._id.toString());
    for (const c of fallbackRes.similarCandidates) {
      if (top6ProductIds.length < 6 && !top6ProductIds.includes(c._id.toString())) {
        top6ProductIds.push(c._id.toString());
      }
    }

    const whetherHybridRan = existingHashMatchType === "none";
    const isLabelled = q.expectedProductId !== null;
    const correctTop1 = isLabelled ? hybridTopProductId === q.expectedProductId : false;
    const correctWithinTop6 = isLabelled ? top6ProductIds.includes(q.expectedProductId) : false;
    const wasRejected = confidenceLevel === "NO_MATCH";

    benchmarkResults.push({
      queryIndex: index,
      repType: q.repType,
      expectedProductId: q.expectedProductId,
      expectedProductName: q.expectedProductName,
      existingHashMatchType,
      whetherHybridRan,
      hybridTopProductId,
      hybridTopProductName,
      hybridScore,
      hybridMargin,
      confidence: confidenceLevel,
      candidateBudget,
      expandedToK20,
      correctTop1,
      correctWithinTop6,
      wasRejected,
      processingTimeMs: duration,
    });

    console.log(
      `[Query ${String(index).padStart(2)}/${queries.length}] (${duration}ms) ${q.repType.padEnd(28)} | Hash: ${existingHashMatchType.padEnd(6)} | Hyb: ${(hybridTopProductName || 'None').slice(0, 20).padEnd(20)} | Top1: ${isLabelled ? (correctTop1 ? 'YES' : 'NO') : 'N/A'} | Conf: ${confidenceLevel}`
    );
  }

  console.log(`\nAll ${queries.length} queries evaluated successfully.\n`);

  // Calculate Critical Metrics
  const labelledQueries = benchmarkResults.filter((r) => r.expectedProductId !== null);
  const hashNoneQueries = labelledQueries.filter((r) => r.existingHashMatchType === "none");
  const unrelatedQueriesRes = benchmarkResults.filter((r) => r.expectedProductId === null);

  // A) Overall hybrid Top-1 accuracy
  const overallTop1Correct = labelledQueries.filter((r) => r.correctTop1).length;
  const overallTop1Accuracy = overallTop1Correct / labelledQueries.length;

  // B) Top-6 recall
  const overallTop6Correct = labelledQueries.filter((r) => r.correctWithinTop6).length;
  const overallTop6Recall = overallTop6Correct / labelledQueries.length;

  // C) Accuracy only on hash="none" cases
  const hashNoneTop1Correct = hashNoneQueries.filter((r) => r.correctTop1).length;
  const hashNoneTop1Accuracy = hashNoneQueries.length > 0 ? hashNoneTop1Correct / hashNoneQueries.length : 0;
  const hashNoneTop6Correct = hashNoneQueries.filter((r) => r.correctWithinTop6).length;
  const hashNoneTop6Recall = hashNoneQueries.length > 0 ? hashNoneTop6Correct / hashNoneQueries.length : 0;

  // D) HIGH_CONFIDENCE precision
  const highConfTotal = labelledQueries.filter((r) => r.confidence === "HIGH_CONFIDENCE").length;
  const highConfCorrect = labelledQueries.filter((r) => r.confidence === "HIGH_CONFIDENCE" && r.correctTop1).length;
  const highConfIncorrect = highConfTotal - highConfCorrect;
  const highConfPrecision = highConfTotal > 0 ? highConfCorrect / highConfTotal : 0;

  // E) MEDIUM_CONFIDENCE precision
  const medConfTotal = labelledQueries.filter((r) => r.confidence === "MEDIUM_CONFIDENCE").length;
  const medConfCorrect = labelledQueries.filter((r) => r.confidence === "MEDIUM_CONFIDENCE" && r.correctTop1).length;
  const medConfIncorrect = medConfTotal - medConfCorrect;
  const medConfPrecision = medConfTotal > 0 ? medConfCorrect / medConfTotal : 0;

  // F) LOW_CONFIDENCE precision
  const lowConfTotal = labelledQueries.filter((r) => r.confidence === "LOW_CONFIDENCE").length;
  const lowConfCorrect = labelledQueries.filter((r) => r.confidence === "LOW_CONFIDENCE" && r.correctTop1).length;
  const lowConfPrecision = lowConfTotal > 0 ? lowConfCorrect / lowConfTotal : 0;

  // AMBIGUOUS breakdown
  const ambigTotal = labelledQueries.filter((r) => r.confidence === "AMBIGUOUS").length;
  const ambigTop1Correct = labelledQueries.filter((r) => r.confidence === "AMBIGUOUS" && r.correctTop1).length;
  const ambigTop6Correct = labelledQueries.filter((r) => r.confidence === "AMBIGUOUS" && r.correctWithinTop6).length;

  // G) Unrelated rejection rate
  const unrelatedTotal = unrelatedQueriesRes.length;
  const unrelatedRejected = unrelatedQueriesRes.filter((r) => r.wasRejected).length;
  const unrelatedRejectionRate = unrelatedTotal > 0 ? unrelatedRejected / unrelatedTotal : 0;

  // Latency percentiles
  const latencies = benchmarkResults.map((r) => r.processingTimeMs).sort((a, b) => a - b);
  const medianLatency = latencies[Math.floor(latencies.length * 0.5)];
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

  // Accuracy by Representation Type
  const repStats = {};
  for (const r of labelledQueries) {
    if (!repStats[r.repType]) {
      repStats[r.repType] = { total: 0, top1Correct: 0, top6Correct: 0, hashExact: 0, hashNone: 0, hashCategory: 0 };
    }
    repStats[r.repType].total++;
    if (r.correctTop1) repStats[r.repType].top1Correct++;
    if (r.correctWithinTop6) repStats[r.repType].top6Correct++;
    if (r.existingHashMatchType === "exact") repStats[r.repType].hashExact++;
    if (r.existingHashMatchType === "none") repStats[r.repType].hashNone++;
    if (r.existingHashMatchType === "category") repStats[r.repType].hashCategory++;
  }

  // Summary Object
  const summary = {
    totalProductsTested: targetProducts.length,
    totalValidLabelledQueries: labelledQueries.length,
    hashNoneQueryCount: hashNoneQueries.length,
    hashExactQueryCount: labelledQueries.filter((r) => r.existingHashMatchType === "exact").length,
    hashCategoryQueryCount: labelledQueries.filter((r) => r.existingHashMatchType === "category").length,
    overallHybridTop1Accuracy: Number((overallTop1Accuracy * 100).toFixed(2)),
    overallHybridTop6Recall: Number((overallTop6Recall * 100).toFixed(2)),
    hashNoneTop1Accuracy: Number((hashNoneTop1Accuracy * 100).toFixed(2)),
    hashNoneTop6Recall: Number((hashNoneTop6Recall * 100).toFixed(2)),
    highConfidence: {
      total: highConfTotal,
      correct: highConfCorrect,
      incorrect: highConfIncorrect,
      precision: Number((highConfPrecision * 100).toFixed(2)),
    },
    mediumConfidence: {
      total: medConfTotal,
      correct: medConfCorrect,
      incorrect: medConfIncorrect,
      precision: Number((medConfPrecision * 100).toFixed(2)),
    },
    lowConfidence: {
      total: lowConfTotal,
      correct: lowConfCorrect,
      incorrect: lowConfTotal - lowConfCorrect,
      precision: Number((lowConfPrecision * 100).toFixed(2)),
    },
    ambiguousConfidence: {
      total: ambigTotal,
      top1Correct: ambigTop1Correct,
      top6Correct: ambigTop6Correct,
    },
    unrelatedRejectionRate: Number((unrelatedRejectionRate * 100).toFixed(2)),
    unrelatedQueries: {
      total: unrelatedTotal,
      rejected: unrelatedRejected,
    },
    latency: {
      medianMs: medianLatency,
      p95Ms: p95Latency,
    },
    representationBreakdown: repStats,
  };

  // Save report to JSON
  const reportPath = path.resolve(process.cwd(), "uploads", "phase_d2_benchmark_report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ summary, details: benchmarkResults }, null, 2), "utf8");
  console.log(`Benchmark report saved to: ${reportPath}\n`);

  // Console Output
  console.log("========================================================================================================================");
  console.log("PHASE D.2 BENCHMARK EXECUTIVE SUMMARY");
  console.log("========================================================================================================================");
  console.log(`Products Tested:                       ${summary.totalProductsTested}`);
  console.log(`Labelled Ground-Truth Queries:         ${summary.totalValidLabelledQueries}`);
  console.log(`Existing Hash 'None' Queries:          ${summary.hashNoneQueryCount} (${((summary.hashNoneQueryCount / summary.totalValidLabelledQueries) * 100).toFixed(1)}%)`);
  console.log(`Existing Hash 'Exact' Queries:         ${summary.hashExactQueryCount} (${((summary.hashExactQueryCount / summary.totalValidLabelledQueries) * 100).toFixed(1)}%)`);
  console.log(`Existing Hash 'Category' Queries:      ${summary.hashCategoryQueryCount} (${((summary.hashCategoryQueryCount / summary.totalValidLabelledQueries) * 100).toFixed(1)}%)`);
  console.log("------------------------------------------------------------------------------------------------------------------------");
  console.log(`Overall Hybrid Top-1 Accuracy:         ${summary.overallHybridTop1Accuracy}% (${overallTop1Correct}/${labelledQueries.length})`);
  console.log(`Overall Hybrid Top-6 Recall:           ${summary.overallHybridTop6Recall}% (${overallTop6Correct}/${labelledQueries.length})`);
  console.log(`Accuracy on Hash 'None' Fallback:      ${summary.hashNoneTop1Accuracy}% (${hashNoneTop1Correct}/${hashNoneQueries.length})`);
  console.log(`Top-6 Recall on Hash 'None' Fallback:  ${summary.hashNoneTop6Recall}% (${hashNoneTop6Correct}/${hashNoneQueries.length})`);
  console.log("------------------------------------------------------------------------------------------------------------------------");
  console.log(`HIGH_CONFIDENCE Precision:             ${summary.highConfidence.precision}% (${summary.highConfidence.correct}/${summary.highConfidence.total})  [Incorrect: ${summary.highConfidence.incorrect}]`);
  console.log(`MEDIUM_CONFIDENCE Precision:           ${summary.mediumConfidence.precision}% (${summary.mediumConfidence.correct}/${summary.mediumConfidence.total})`);
  console.log(`LOW_CONFIDENCE Precision:              ${summary.lowConfidence.precision}% (${summary.lowConfidence.correct}/${summary.lowConfidence.total})`);
  console.log(`AMBIGUOUS Queries Flagged:             ${summary.ambiguousConfidence.total} (Top-6 Recall: ${summary.ambiguousConfidence.top6Correct}/${summary.ambiguousConfidence.total})`);
  console.log(`Unrelated Image Rejection Rate:        ${summary.unrelatedRejectionRate}% (${summary.unrelatedQueries.rejected}/${summary.unrelatedQueries.total})`);
  console.log(`Latency:                               Median = ${summary.latency.medianMs}ms, p95 = ${summary.latency.p95Ms}ms`);
  console.log("========================================================================================================================\n");

  console.log("ACCURACY BY REPRESENTATION TYPE:");
  console.log(
    "Representation Type".padEnd(32) +
      "Total".padEnd(8) +
      "Top-1 Acc".padEnd(14) +
      "Top-6 Recall".padEnd(14) +
      "Hash None".padEnd(12) +
      "Hash Exact"
  );
  console.log("-".repeat(90));
  for (const [rep, s] of Object.entries(repStats)) {
    const acc = ((s.top1Correct / s.total) * 100).toFixed(1) + "%";
    const rec = ((s.top6Correct / s.total) * 100).toFixed(1) + "%";
    console.log(
      rep.padEnd(32) +
        String(s.total).padEnd(8) +
        acc.padEnd(14) +
        rec.padEnd(14) +
        String(s.hashNone).padEnd(12) +
        String(s.hashExact)
    );
  }
  console.log("========================================================================================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
