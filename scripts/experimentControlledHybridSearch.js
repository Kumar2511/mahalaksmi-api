import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import {
  extractEmbeddingFromBuffer,
  computeCosineSimilarity,
} from "../services/clipVisualSearchService.js";
import { proposeSalientCandidateRegions } from "../services/salientRegionService.js";
import mongoose from "mongoose";

async function downloadUrlToBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
  return Buffer.from(res.data);
}

async function evaluateInputRegions(inputBuffer, candidateRegions, catalogueVectors, productMap, expectedProductId) {
  const regionReports = [];
  const productGlobalBestMap = new Map();
  const productRegionWins = new Map(); // productId -> count of regions where this product is top 1

  for (const region of candidateRegions) {
    const regEmbedding = await extractEmbeddingFromBuffer(region.buffer);

    // Group catalogue scores by product for this region
    const productScoresInRegion = new Map();

    for (const v of catalogueVectors) {
      const s = computeCosineSimilarity(regEmbedding, v.embedding);
      const pid = v.productId.toString();
      if (!productScoresInRegion.has(pid) || s > productScoresInRegion.get(pid)) {
        productScoresInRegion.set(pid, s);
      }
    }

    const sortedProducts = Array.from(productScoresInRegion.entries())
      .map(([pid, score]) => ({
        productId: pid,
        name: productMap.get(pid)?.name || "Unknown",
        score: Number(score.toFixed(4)),
      }))
      .sort((a, b) => b.score - a.score);

    const top1 = sortedProducts[0];
    const top2 = sortedProducts[1];
    const margin = top1 && top2 ? Number((top1.score - top2.score).toFixed(4)) : 0;

    // Track which product won this region
    if (top1) {
      productRegionWins.set(top1.productId, (productRegionWins.get(top1.productId) || 0) + 1);
    }

    // Track overall best score per product across all regions
    for (const p of sortedProducts) {
      if (!productGlobalBestMap.has(p.productId) || p.score > productGlobalBestMap.get(p.productId).score) {
        productGlobalBestMap.set(p.productId, {
          productId: p.productId,
          name: p.name,
          score: p.score,
          winningRegion: region.name,
        });
      }
    }

    let expRankInRegion = null;
    let expScoreInRegion = null;
    if (expectedProductId) {
      const idx = sortedProducts.findIndex((p) => p.productId === expectedProductId.toString());
      if (idx !== -1) {
        expRankInRegion = idx + 1;
        expScoreInRegion = sortedProducts[idx].score;
      }
    }

    regionReports.push({
      regionName: region.name,
      coordinates: { left: region.left, top: region.top, width: region.width, height: region.height },
      top1Product: top1 ? top1.name : "None",
      top1ProductId: top1 ? top1.productId : "None",
      top1Score: top1 ? top1.score : 0,
      top2Score: top2 ? top2.score : 0,
      margin,
      expectedRank: expRankInRegion,
      expectedScore: expScoreInRegion,
      top5: sortedProducts.slice(0, 5),
    });
  }

  // Rank products across all regions
  const globalRanked = Array.from(productGlobalBestMap.values()).sort((a, b) => b.score - a.score);
  const globalTop1 = globalRanked[0];
  const globalTop2 = globalRanked[1];
  const globalMargin = globalTop1 && globalTop2 ? Number((globalTop1.score - globalTop2.score).toFixed(4)) : 0;

  // Full image specific report
  const fullReport = regionReports.find((r) => r.regionName === "full");
  const bestRegionReport = regionReports.reduce((best, cur) => (cur.top1Score > best.top1Score ? cur : best), regionReports[0]);

  let fullRankOfExpected = null;
  let fullScoreOfExpected = null;
  let bestRankOfExpected = null;
  let bestScoreOfExpected = null;
  let expectedWinningRegion = null;

  if (expectedProductId) {
    const fullExp = fullReport ? fullReport.top5.find((p) => p.productId === expectedProductId.toString()) : null;
    fullRankOfExpected = fullReport ? fullReport.expectedRank : null;
    fullScoreOfExpected = fullReport ? fullReport.expectedScore : null;

    const gIdx = globalRanked.findIndex((p) => p.productId === expectedProductId.toString());
    if (gIdx !== -1) {
      bestRankOfExpected = gIdx + 1;
      bestScoreOfExpected = globalRanked[gIdx].score;
      expectedWinningRegion = globalRanked[gIdx].winningRegion;
    }
  }

  // Count how many regions agreed on the winning product
  const top1RegionAgreementCount = globalTop1 ? (productRegionWins.get(globalTop1.productId) || 0) : 0;
  const totalRegions = candidateRegions.length;

  return {
    globalTop1: globalTop1 ? globalTop1.name : "None",
    globalTop1ProductId: globalTop1 ? globalTop1.productId : "None",
    globalTop1Score: globalTop1 ? globalTop1.score : 0,
    globalTop2Score: globalTop2 ? globalTop2.score : 0,
    globalMargin,
    globalWinningRegion: globalTop1 ? globalTop1.winningRegion : "None",
    top1RegionAgreementCount,
    totalRegions,
    regionAgreementRatio: Number((top1RegionAgreementCount / totalRegions).toFixed(2)),
    fullRankOfExpected,
    fullScoreOfExpected,
    bestRankOfExpected,
    bestScoreOfExpected,
    expectedWinningRegion,
    scoreImprovement: (expectedProductId && bestScoreOfExpected && fullScoreOfExpected)
      ? Number((bestScoreOfExpected - fullScoreOfExpected).toFixed(4))
      : 0,
    expectedBecameTop1: expectedProductId && bestRankOfExpected === 1,
    regionReports,
    globalRankedTop5: globalRanked.slice(0, 5),
  };
}

async function main() {
  await connectDB();

  console.log("\n==================================================");
  console.log("PHASE C.5: HYBRID SEARCH CONTROLLED EXPERIMENT");
  console.log("==================================================\n");

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();

  const products = await Product.find({}).select("name category images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // Test set:
  // A. Exact catalogue product image (Fairy)
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const fairyBuf = await downloadUrlToBuffer(fairyProduct.images[0]);

  // B. Customer screenshot where product is clearly visible (Necklace on display)
  const necklaceProd = await Product.findById("6a883d48b479512538b2bbb1").lean();
  const necklaceBuf = await downloadUrlToBuffer(necklaceProd.images[0]);

  // C. Customer screenshot where product is small (media_1788945719909.png - Fairy in modal)
  const userScreenshotFairy = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png");

  // D. Instagram-style screenshot (Fairy in dark frame)
  const instaFairyBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([{ input: await sharp(fairyBuf).resize(720, 960, { fit: "cover" }).toBuffer(), top: 400, left: 180 }])
    .jpeg()
    .toBuffer();

  // E. Direct cropped product image (60% crop of Fairy)
  const fairyMeta = await sharp(fairyBuf).metadata();
  const cropW = Math.round(fairyMeta.width * 0.6);
  const cropH = Math.round(fairyMeta.height * 0.6);
  const croppedFairyBuf = await sharp(fairyBuf)
    .extract({
      left: Math.round((fairyMeta.width - cropW) / 2),
      top: Math.round((fairyMeta.height - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .jpeg()
    .toBuffer();

  // F. Random unrelated image (Color gradient/noise)
  const randomBuf = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 40, g: 130, b: 220 } },
  })
    .jpeg()
    .toBuffer();

  // G. Brand / UI screenshot (The Girl House logo & frame 1)
  const brandLogoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");
  const silhouetteBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png");

  // H. Two genuinely similar-but-different jewellery products
  // Product H1: Traditional Antique Gold Temple Long Necklace Set (6a8983a438c8c89855e85107)
  // Product H2: Antique Gold Temple Lakshmi Necklace Set with Jhumkas (6a8983a638c8c89855e85144)
  const prodH1 = await Product.findById("6a8983a438c8c89855e85107").lean();
  const prodH2 = await Product.findById("6a8983a638c8c89855e85144").lean();
  const bufH1 = await downloadUrlToBuffer(prodH1.images[0]);
  const bufH2 = await downloadUrlToBuffer(prodH2.images[0]);

  const testMatrix = [
    {
      category: "A. Exact Catalogue Image",
      name: "Exact Fairy Necklace",
      buffer: fairyBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
    },
    {
      category: "B. Customer Screenshot (Clearly Visible)",
      name: "Delicate Necklace Full Display",
      buffer: necklaceBuf,
      expectedProductId: necklaceProd._id.toString(),
      expectedName: necklaceProd.name,
      isJewellery: true,
    },
    {
      category: "C. Customer Screenshot (Product is Small)",
      name: "Fairy Necklace in Desktop Modal",
      buffer: userScreenshotFairy,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
    },
    {
      category: "D. Instagram-Style Screenshot",
      name: "Fairy Necklace in Mobile Frame",
      buffer: instaFairyBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
    },
    {
      category: "E. Direct Cropped Product Image",
      name: "60% Center Crop of Fairy Necklace",
      buffer: croppedFairyBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
      isJewellery: true,
    },
    {
      category: "F. Random Unrelated Image",
      name: "Solid Color/Gradient Block",
      buffer: randomBuf,
      expectedProductId: null,
      expectedName: "None (Random Image)",
      isJewellery: false,
    },
    {
      category: "G1. Brand/UI Screenshot",
      name: "Brand Logo (the-girl-who-she-logo.png)",
      buffer: brandLogoBuf,
      expectedProductId: null,
      expectedName: "None (Brand Logo)",
      isJewellery: false,
    },
    {
      category: "G2. Brand/UI Screenshot",
      name: "Graphic Silhouette Frame 1",
      buffer: silhouetteBuf,
      expectedProductId: null,
      expectedName: "None (Silhouette)",
      isJewellery: false,
    },
    {
      category: "H1. Similar-But-Different Product 1",
      name: "Temple Long Necklace Set (Query = H1)",
      buffer: bufH1,
      expectedProductId: prodH1._id.toString(),
      expectedName: prodH1.name,
      counterpartProductId: prodH2._id.toString(),
      counterpartName: prodH2.name,
      isJewellery: true,
    },
    {
      category: "H2. Similar-But-Different Product 2",
      name: "Temple Lakshmi Necklace Set (Query = H2)",
      buffer: bufH2,
      expectedProductId: prodH2._id.toString(),
      expectedName: prodH2.name,
      counterpartProductId: prodH1._id.toString(),
      counterpartName: prodH1.name,
      isJewellery: true,
    },
  ];

  const experimentResults = [];

  for (const item of testMatrix) {
    console.log(`Running Experiment on: ${item.category} - ${item.name}...`);
    const candidateRegions = await proposeSalientCandidateRegions(item.buffer);
    const evaluation = await evaluateInputRegions(
      item.buffer,
      candidateRegions,
      catalogueVectors,
      productMap,
      item.expectedProductId
    );

    let counterpartRank = null;
    let counterpartScore = null;
    let counterpartMargin = null;

    if (item.counterpartProductId) {
      const cpIdx = evaluation.globalRankedTop5.findIndex((p) => p.productId === item.counterpartProductId);
      if (cpIdx !== -1) {
        counterpartRank = `#${cpIdx + 1}`;
        counterpartScore = evaluation.globalRankedTop5[cpIdx].score;
        counterpartMargin = Number((evaluation.globalTop1Score - counterpartScore).toFixed(4));
      } else {
        counterpartRank = "Outside Top 5";
      }
    }

    experimentResults.push({
      category: item.category,
      name: item.name,
      isJewellery: item.isJewellery,
      expectedProduct: item.expectedName,
      globalTop1: evaluation.globalTop1,
      globalTop1Score: evaluation.globalTop1Score,
      globalTop2Score: evaluation.globalTop2Score,
      globalMargin: evaluation.globalMargin,
      winningRegion: evaluation.globalWinningRegion,
      regionAgreement: `${evaluation.top1RegionAgreementCount}/${evaluation.totalRegions} (${(evaluation.regionAgreementRatio * 100).toFixed(0)}%)`,
      fullRank: evaluation.fullRankOfExpected ? `#${evaluation.fullRankOfExpected}` : "N/A",
      fullScore: evaluation.fullScoreOfExpected || "N/A",
      bestRegionRank: evaluation.bestRankOfExpected ? `#${evaluation.bestRankOfExpected}` : "N/A",
      bestRegionScore: evaluation.bestScoreOfExpected || "N/A",
      scoreImprovement: evaluation.scoreImprovement,
      expectedBecameTop1: evaluation.expectedBecameTop1 ? "YES" : (item.expectedProductId ? "NO" : "N/A"),
      counterpartRank,
      counterpartScore,
      counterpartMargin,
      top5Candidates: evaluation.globalRankedTop5.map((p) => `${p.name} [${p.score}] (${p.winningRegion})`),
      regionsEvaluated: evaluation.regionReports.map((r) => ({
        region: r.regionName,
        coords: `[${r.coordinates.left},${r.coordinates.top} ${r.coordinates.width}x${r.coordinates.height}]`,
        top1: `${r.top1Product} (${r.top1Score})`,
        margin: r.margin,
        expectedRank: r.expectedRank ? `#${r.expectedRank}` : "N/A",
      })),
    });
  }

  console.log("\n==================================================");
  console.log("CONTROLLED EXPERIMENT SUMMARY TABLE");
  console.log("==================================================");
  console.table(
    experimentResults.map((r) => ({
      Category: r.category.slice(0, 24),
      "Top 1 Candidate": r.globalTop1.slice(0, 24),
      "Top 1 Score": r.globalTop1Score,
      "Top1-Top2 Margin": r.globalMargin,
      "Winning Region": r.winningRegion,
      "Region Agreement": r.regionAgreement,
      "Full Rank": r.fullRank,
      "Best Rank": r.bestRegionRank,
      "Best Score": r.bestRegionScore,
      "Expected #1": r.expectedBecameTop1,
    }))
  );

  console.log("\n==================================================");
  console.log("FULL RAW DIAGNOSTIC DATA:");
  console.log(JSON.stringify(experimentResults, null, 2));
  console.log("==================================================\n");

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("FATAL ERROR IN EXPERIMENT:", err);
  process.exit(1);
});
