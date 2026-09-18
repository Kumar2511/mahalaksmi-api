import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import { performClipShadowSearch } from "../controllers/clipVisualSearchController.js";
import mongoose from "mongoose";

function mockReqRes(filePath) {
  const req = {
    file: {
      path: filePath,
    },
  };

  let responseData = null;
  let statusCode = 200;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  return { req, res, getResult: () => ({ statusCode, ...responseData }) };
}

async function downloadUrlToBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
  return Buffer.from(res.data);
}

async function runSingleDiagnostic(filePath, inputName, expectedProductId, expectedProductName) {
  // Make a temporary copy because controller unlinks the file in finally block
  const tempCopy = `${filePath}.eval.png`;
  fs.copyFileSync(filePath, tempCopy);

  const mock = mockReqRes(tempCopy);
  await performClipShadowSearch(mock.req, mock.res);
  const result = mock.getResult();

  if (!result.success) {
    throw new Error(`Search failed for ${inputName}: ${result.message}`);
  }

  const candidates = result.candidates || [];
  const top1 = candidates[0] || null;
  const top2 = candidates[1] || null;

  let expectedRank = "N/A";
  let expectedScore = 0;
  let expectedWinningRegion = "N/A";

  if (expectedProductId) {
    const idx = candidates.findIndex((c) => c.productId.toString() === expectedProductId.toString());
    if (idx !== -1) {
      expectedRank = `#${idx + 1}`;
      expectedScore = candidates[idx].bestScore;
      expectedWinningRegion = candidates[idx].winningRegion;
    } else {
      expectedRank = "Not in candidates";
    }
  }

  const gap = top1 && top2 ? Number((top1.bestScore - top2.bestScore).toFixed(4)) : 0;

  return {
    inputName,
    expectedProduct: expectedProductName,
    expectedProductId: expectedProductId ? expectedProductId.toString() : "N/A",
    expectedRank,
    expectedScore,
    expectedWinningRegion,
    top1Product: top1 ? top1.name : "None",
    top1ProductId: top1 ? top1.productId.toString() : "None",
    top1Score: top1 ? top1.bestScore : 0,
    top1WinningRegion: top1 ? top1.winningRegion : "None",
    scoreGapTop1Top2: gap,
    top5Candidates: candidates.slice(0, 5).map((c) => ({
      name: c.name,
      score: c.bestScore,
      winningRegion: c.winningRegion,
      productId: c.productId.toString(),
    })),
  };
}

async function main() {
  await connectDB();

  console.log("\n==================================================");
  console.log("PHASE C.3: VISUAL SEARCH LOCALIZATION DIAGNOSTIC");
  console.log("==================================================\n");

  const tempDir = path.resolve(process.cwd(), "uploads", "test-c3");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Target Fairy Product
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const fairyCatalogueBuf = await downloadUrlToBuffer(fairyProduct.images[0]);
  const userScreenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";

  // PART 1: Localization Tests for Fairy Product
  // Input 1: Exact catalogue image
  const file1 = path.join(tempDir, "1_exact_catalogue.jpg");
  fs.writeFileSync(file1, fairyCatalogueBuf);

  // Input 2: Full customer screenshot
  const file2 = path.join(tempDir, "2_full_screenshot.png");
  fs.copyFileSync(userScreenshotPath, file2);

  // Input 3: Manually isolated crop containing ONLY the actual Fairy product image
  const file3 = path.join(tempDir, "3_isolated_product_only.png");
  await sharp(userScreenshotPath)
    .extract({ left: 330, top: 395, width: 62, height: 62 })
    .png()
    .toFile(file3);

  // Input 4: Slightly larger crop with small surrounding UI (thumbnail + product title)
  const file4 = path.join(tempDir, "4_product_with_small_ui.png");
  await sharp(userScreenshotPath)
    .extract({ left: 320, top: 385, width: 120, height: 85 })
    .png()
    .toFile(file4);

  // Input 5: Product card area (entire modal result card)
  const file5 = path.join(tempDir, "5_product_card_area.png");
  await sharp(userScreenshotPath)
    .extract({ left: 315, top: 380, width: 390, height: 90 })
    .png()
    .toFile(file5);

  const localizationInputs = [
    { file: file1, name: "1. Exact Catalogue Image" },
    { file: file2, name: "2. Full Customer Screenshot" },
    { file: file3, name: "3. Isolated Product ONLY Crop (62x62)" },
    { file: file4, name: "4. Product with Small UI (120x85)" },
    { file: file5, name: "5. Product Card Area (390x90)" },
  ];

  const localizationResults = [];
  for (const input of localizationInputs) {
    console.log(`Testing Localization Input: ${input.name}...`);
    const diag = await runSingleDiagnostic(
      input.file,
      input.name,
      fairyProduct._id,
      fairyProduct.name
    );
    localizationResults.push(diag);
  }

  // PART 2: Valid Discrimination Test Between Two Visually Similar Products
  // Product A: Traditional Antique Gold Temple Long Necklace Set (6a8983a438c8c89855e85107)
  // Product B: Antique Gold Temple Lakshmi Necklace Set with Jhumkas (6a8983a638c8c89855e85144)
  const prodA = await Product.findById("6a8983a438c8c89855e85107").lean();
  const prodB = await Product.findById("6a8983a638c8c89855e85144").lean();

  const imgBufA = await downloadUrlToBuffer(prodA.images[0]);
  const imgBufB = await downloadUrlToBuffer(prodB.images[0]);

  const fileProdA = path.join(tempDir, "discrim_product_A.jpg");
  const fileProdB = path.join(tempDir, "discrim_product_B.jpg");
  fs.writeFileSync(fileProdA, imgBufA);
  fs.writeFileSync(fileProdB, imgBufB);

  console.log("\nTesting Discrimination: Query = Product A (Temple Long Necklace Set)...");
  const diagA = await runSingleDiagnostic(
    fileProdA,
    "Discrimination: Query = Product A",
    prodA._id,
    prodA.name
  );

  console.log("Testing Discrimination: Query = Product B (Temple Lakshmi Necklace Set)...");
  const diagB = await runSingleDiagnostic(
    fileProdB,
    "Discrimination: Query = Product B",
    prodB._id,
    prodB.name
  );

  // Extract cross-metrics
  const rankBInQueryA = diagA.top5Candidates.findIndex((c) => c.productId === prodB._id.toString()) + 1;
  const scoreBInQueryA = rankBInQueryA > 0 ? diagA.top5Candidates[rankBInQueryA - 1].score : "Outside top 5";

  const rankAInQueryB = diagB.top5Candidates.findIndex((c) => c.productId === prodA._id.toString()) + 1;
  const scoreAInQueryB = rankAInQueryB > 0 ? diagB.top5Candidates[rankAInQueryB - 1].score : "Outside top 5";

  const discriminationReport = {
    productA: {
      id: prodA._id.toString(),
      name: prodA.name,
      whenQueryIsA: {
        rank: diagA.expectedRank,
        score: diagA.top1Score,
        winningRegion: diagA.top1WinningRegion,
        top1Product: diagA.top1Product,
      },
      whenQueryIsB: {
        rank: rankAInQueryB > 0 ? `#${rankAInQueryB}` : "Outside top 5",
        score: scoreAInQueryB,
      },
    },
    productB: {
      id: prodB._id.toString(),
      name: prodB.name,
      whenQueryIsB: {
        rank: diagB.expectedRank,
        score: diagB.top1Score,
        winningRegion: diagB.top1WinningRegion,
        top1Product: diagB.top1Product,
      },
      whenQueryIsA: {
        rank: rankBInQueryA > 0 ? `#${rankBInQueryA}` : "Outside top 5",
        score: scoreBInQueryA,
      },
    },
  };

  // Cleanup temp files
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  console.log("\n==================================================");
  console.log("LOCALIZATION DIAGNOSTIC SUMMARY TABLE");
  console.log("==================================================");
  console.table(
    localizationResults.map((r) => ({
      "Input Crop": r.inputName.slice(0, 32),
      "Top 1 Product": r.top1Product.slice(0, 24),
      "Top 1 Score": r.top1Score,
      "Expected Rank": r.expectedRank,
      "Expected Score": r.expectedScore,
      "Winning Region": r.top1WinningRegion,
      "Top1-Top2 Gap": r.scoreGapTop1Top2,
    }))
  );

  console.log("\n==================================================");
  console.log("DISCRIMINATION TEST SUMMARY TABLE");
  console.log("==================================================");
  console.table([
    {
      "Query Tested": "Product A (Temple Long Necklace)",
      "Target Expected (#1)": "Product A",
      "Actual #1": diagA.top1Product.slice(0, 25),
      "Score #1": diagA.top1Score,
      "Product B Rank": rankBInQueryA > 0 ? `#${rankBInQueryA}` : "Outside top 5",
      "Product B Score": scoreBInQueryA,
      Margin: Number((diagA.top1Score - (typeof scoreBInQueryA === "number" ? scoreBInQueryA : 0)).toFixed(4)),
    },
    {
      "Query Tested": "Product B (Temple Lakshmi Necklace)",
      "Target Expected (#1)": "Product B",
      "Actual #1": diagB.top1Product.slice(0, 25),
      "Score #1": diagB.top1Score,
      "Product A Rank": rankAInQueryB > 0 ? `#${rankAInQueryB}` : "Outside top 5",
      "Product A Score": scoreAInQueryB,
      Margin: Number((diagB.top1Score - (typeof scoreAInQueryB === "number" ? scoreAInQueryB : 0)).toFixed(4)),
    },
  ]);

  console.log("\n==================================================");
  console.log("FULL RAW DIAGNOSTIC DATA (LOCALIZATION):");
  console.log(JSON.stringify(localizationResults, null, 2));

  console.log("\nFULL RAW DIAGNOSTIC DATA (DISCRIMINATION):");
  console.log(JSON.stringify(discriminationReport, null, 2));
  console.log("==================================================\n");

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("FATAL ERROR IN C.3 DIAGNOSTIC:", err);
  process.exit(1);
});
