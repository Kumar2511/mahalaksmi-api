import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import axios from "axios";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { runHybridFallback } from "../services/hybridFallbackService.js";

async function downloadUrlToBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(res.data);
}

async function main() {
  await connectDB();

  console.log("\n========================================================");
  console.log("PHASE D: SAFE HYBRID FALLBACK INTEGRATION VERIFICATION");
  console.log("Shadow Pipeline & Calibration Test Suite (13 Conditions)");
  console.log("========================================================\n");

  const products = await Product.find({}).select("name category price images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // Find key product anchors
  const fairyDoc = products.find((p) => p._id.toString() === "6a8983a438c8c89855e85110") || products.find((p) => p.name.includes("Fairy"));
  const czWaveDoc = products.find((p) => p._id.toString() === "6a8983a538c8c89855e85123") || products.find((p) => p.name.includes("Wave"));
  const czGreenDoc = products.find((p) => p._id.toString() === "6a8983a538c8c89855e85126") || products.find((p) => p.name.includes("Green Stone"));
  const templeHaramDoc = products.find((p) => p._id.toString() === "6a8983a438c8c89855e85107") || products.find((p) => p.name.includes("Temple Long"));
  const templeChokerDoc = products.find((p) => p._id.toString() === "6a8983a638c8c89855e85144") || products.find((p) => p.name.includes("Temple Lakshmi"));

  console.log(`Fairy Product: ${fairyDoc?.name} (${fairyDoc?._id})`);
  console.log(`CZ Wave Product: ${czWaveDoc?.name} (${czWaveDoc?._id})`);
  console.log(`CZ Green Product: ${czGreenDoc?.name} (${czGreenDoc?._id})`);
  console.log(`Temple Haram: ${templeHaramDoc?.name} (${templeHaramDoc?._id})`);
  console.log(`Temple Choker: ${templeChokerDoc?.name} (${templeChokerDoc?._id})`);

  // Download direct catalogue image for Fairy
  const fairyUrl = fairyDoc.images?.[0];
  console.log(`Fetching Fairy catalogue image: ${fairyUrl}`);
  const fairyDirectBuf = await downloadUrlToBuffer(fairyUrl);

  // Download Temple Choker image for similar-but-different test
  const chokerUrl = templeChokerDoc.images?.[0];
  console.log(`Fetching Temple Choker catalogue image: ${chokerUrl}`);
  const chokerDirectBuf = await downloadUrlToBuffer(chokerUrl);

  // Prepare Transformations
  // 1. JPEG Compressed (Q=40)
  const fairyCompressedBuf = await sharp(fairyDirectBuf)
    .jpeg({ quality: 40 })
    .toBuffer();

  // 2. Resized (width=380px)
  const fairyResizedBuf = await sharp(fairyDirectBuf)
    .resize(380)
    .jpeg()
    .toBuffer();

  // 3. Lighting Shifted (+15% brightness, 85% crop)
  const fairyMeta = await sharp(fairyDirectBuf).metadata();
  const cropW = Math.round(fairyMeta.width * 0.85);
  const cropH = Math.round(fairyMeta.height * 0.85);
  const fairyLightingBuf = await sharp(fairyDirectBuf)
    .extract({
      left: Math.round((fairyMeta.width - cropW) / 2),
      top: Math.round((fairyMeta.height - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .modulate({ brightness: 1.15, saturation: 1.05 })
    .jpeg()
    .toBuffer();

  // 4. Instagram Screenshot (1080x1920 phone UI frame)
  const fairyInstaBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([
      {
        input: await sharp(fairyDirectBuf).resize(720, 960, { fit: "cover" }).toBuffer(),
        top: 400,
        left: 180,
      },
    ])
    .jpeg()
    .toBuffer();

  // 5. Clean Desktop Product Card Screenshot (1024x768 desktop viewport)
  const fairyDesktopCardBuf = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .composite([
      {
        input: await sharp(fairyDirectBuf).resize(300, 320, { fit: "cover" }).toBuffer(),
        top: 120,
        left: 362,
      },
    ])
    .jpeg()
    .toBuffer();

  // 6. Tiny Desktop Modal Screenshot (real customer asset)
  const fairyTinyModalBuf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png"
  );

  // 7. Customer Screenshot 2 (CZ Wave)
  const customer2Buf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png"
  );

  // 8. Customer Screenshot 3 (CZ Green)
  const customer3Buf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png"
  );

  // 9. Random Unrelated Image (Landscape Blue Sky)
  const randomUnrelatedBuf = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 70, g: 140, b: 220 } },
  })
    .jpeg()
    .toBuffer();

  // 10. Brand Logo
  const logoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");

  // 11. UI Screenshot (Frame 1 Intro)
  const uiScreenshotBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png");

  // 12. Similar-but-Different Jewellery Product (Temple Choker queried, Haram is counterpart)
  // Expected product for this query: Temple Lakshmi Choker (NOT Haram)

  // Construct Test Matrix
  const testMatrix = [
    {
      id: 1,
      caseName: "1. Direct catalogue image",
      buffer: fairyDirectBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 2,
      caseName: "2. JPEG compressed product image",
      buffer: fairyCompressedBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 3,
      caseName: "3. Resized product image",
      buffer: fairyResizedBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 4,
      caseName: "4. Lighting-shifted product image",
      buffer: fairyLightingBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 5,
      caseName: "5. Instagram screenshot",
      buffer: fairyInstaBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 6,
      caseName: "6. Clean product-card screenshot",
      buffer: fairyDesktopCardBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 7,
      caseName: "7. Tiny desktop modal screenshot",
      buffer: fairyTinyModalBuf,
      expectedProductId: fairyDoc._id.toString(),
      expectedProductName: fairyDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 8,
      caseName: "8. Customer screenshot 2",
      buffer: customer2Buf,
      expectedProductId: czWaveDoc._id.toString(),
      expectedProductName: czWaveDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 9,
      caseName: "9. Customer screenshot 3",
      buffer: customer3Buf,
      expectedProductId: czGreenDoc._id.toString(),
      expectedProductName: czGreenDoc.name,
      shouldBeRejected: false,
    },
    {
      id: 10,
      caseName: "10. Random unrelated image",
      buffer: randomUnrelatedBuf,
      expectedProductId: null,
      expectedProductName: "None / Reject",
      shouldBeRejected: true,
    },
    {
      id: 11,
      caseName: "11. Brand logo",
      buffer: logoBuf,
      expectedProductId: null,
      expectedProductName: "None / Reject",
      shouldBeRejected: true,
    },
    {
      id: 12,
      caseName: "12. UI screenshot",
      buffer: uiScreenshotBuf,
      expectedProductId: null,
      expectedProductName: "None / Reject",
      shouldBeRejected: true,
    },
    {
      id: 13,
      caseName: "13. Similar-but-different jewellery product",
      buffer: chokerDirectBuf,
      expectedProductId: templeChokerDoc._id.toString(),
      expectedProductName: templeChokerDoc.name,
      counterpartProductId: templeHaramDoc._id.toString(),
      counterpartProductName: templeHaramDoc.name,
      shouldBeRejected: false,
    },
  ];

  console.log(`Starting evaluation of ${testMatrix.length} test cases...\n`);

  const results = [];

  for (const test of testMatrix) {
    process.stdout.write(`Evaluating Case ${test.id}: ${test.caseName}... `);
    const t0 = Date.now();

    const fallbackRes = await runHybridFallback(test.buffer);
    const latency = Date.now() - t0;

    const top1Candidate = fallbackRes.exactCandidate || fallbackRes.similarCandidates[0] || null;
    const top2Candidate = fallbackRes.exactCandidate
      ? fallbackRes.similarCandidates[0] || null
      : fallbackRes.similarCandidates[1] || null;

    const top1ProductId = top1Candidate ? top1Candidate._id.toString() : null;
    const top1ProductName = top1Candidate ? top1Candidate.name : "None";
    const top1Score = fallbackRes.confidence.score;
    const top2Score = top2Candidate ? top2Candidate.score : 0;
    const margin = fallbackRes.confidence.margin;
    const confidenceLevel = fallbackRes.confidence.level;
    const kBudget = fallbackRes.confidence.candidateBudget;
    const expandedToK20 = fallbackRes.confidence.expandedToK20;

    const isExpectedNumberOne = test.expectedProductId
      ? top1ProductId === test.expectedProductId
      : false;

    const wasRejected = confidenceLevel === "NO_MATCH";

    const reportItem = {
      caseId: test.id,
      caseName: test.caseName,
      expectedProduct: test.expectedProductName,
      expectedProductId: test.expectedProductId,
      top1Product: top1ProductName,
      top1ProductId,
      top1Score,
      top2Product: top2Candidate ? top2Candidate.name : "None",
      top2Score,
      margin,
      confidence: confidenceLevel,
      kUsed: kBudget,
      expandedToK20,
      imageType: fallbackRes.confidence.imageType,
      winningRegion: fallbackRes.winningRegion,
      regionAgreement: fallbackRes.confidence.regionAgreement,
      needsCrop: fallbackRes.needsCrop,
      latencyMs: latency,
      isExpectedNumberOne,
      shouldBeRejected: test.shouldBeRejected,
      wasRejected,
      success: fallbackRes.success,
    };

    results.push(reportItem);

    console.log(
      `Done (${latency}ms). Top1: "${top1ProductName.slice(0, 25)}" (Score: ${top1Score.toFixed(
        4
      )}, Conf: ${confidenceLevel}, K: ${kBudget})`
    );
  }

  // Persist full report
  const reportPath = path.resolve(process.cwd(), "uploads", "phase_d_verification_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nVerification report saved to: ${reportPath}`);

  // Print Summary Table
  console.log("\n========================================================================================================================");
  console.log("PHASE D SHADOW TEST RESULTS SUMMARY TABLE");
  console.log("========================================================================================================================");
  console.log(
    "ID".padEnd(4) +
      "Test Condition".padEnd(36) +
      "Expected Top-1".padEnd(26) +
      "Actual Top-1".padEnd(26) +
      "Score".padEnd(8) +
      "Margin".padEnd(8) +
      "Conf".padEnd(16) +
      "K".padEnd(4) +
      "Rank#1".padEnd(8) +
      "Latency"
  );
  console.log("-".repeat(140));

  for (const r of results) {
    console.log(
      String(r.caseId).padEnd(4) +
        r.caseName.slice(0, 34).padEnd(36) +
        r.expectedProduct.slice(0, 24).padEnd(26) +
        r.top1Product.slice(0, 24).padEnd(26) +
        r.top1Score.toFixed(4).padEnd(8) +
        r.margin.toFixed(4).padEnd(8) +
        r.confidence.padEnd(16) +
        String(r.kUsed).padEnd(4) +
        (r.shouldBeRejected ? (r.wasRejected ? "REJECTED" : "FLAGGED") : (r.isExpectedNumberOne ? "YES" : "NO")).padEnd(8) +
        `${r.latencyMs}ms`
    );
  }
  console.log("========================================================================================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
