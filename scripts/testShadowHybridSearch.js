import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { performClipShadowSearch } from "../controllers/clipVisualSearchController.js";
import { findProductByImage } from "../controllers/imageSearchController.js";

// Mock Express req & res for memory buffer (pure in-memory test)
function mockMemoryReqRes(buffer, query = {}, body = {}) {
  const req = {
    file: {
      buffer,
      originalname: "query_image.jpg",
      mimetype: "image/jpeg",
      size: buffer.length,
    },
    query,
    body,
    headers: { origin: "http://localhost:3000" },
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
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
  return Buffer.from(res.data);
}

async function main() {
  await connectDB();

  console.log("\n========================================================");
  console.log("PHASE C.6: SHADOW HYBRID VISUAL SEARCH TEST SUITE");
  console.log("Memory Storage | Diagnostic Shadow Endpoint Validation");
  console.log("========================================================\n");

  // Load target reference products
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const fairyImgBuf = await downloadUrlToBuffer(fairyProduct.images[0]);

  // Two similar but different products (Temple Long vs Temple Lakshmi)
  const prodH1 = await Product.findById("6a8983a438c8c89855e85107").lean(); // Temple Long
  const prodH2 = await Product.findById("6a8983a638c8c89855e85144").lean(); // Temple Lakshmi
  const h1Buf = await downloadUrlToBuffer(prodH1.images[0]);

  // Customer website screenshot (product visible)
  const visibleScreenshotBuf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png"
  );

  // Small product screenshot (Fairy in desktop modal)
  const smallProductScreenshotBuf = fs.readFileSync(
    "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png"
  );

  // Instagram mobile screenshot
  const instaScreenshotBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([
      { input: await sharp(fairyImgBuf).resize(720, 960, { fit: "cover" }).toBuffer(), top: 420, left: 180 },
    ])
    .jpeg()
    .toBuffer();

  // Random unrelated image (gradient)
  const randomBuf = await sharp({
    create: { width: 600, height: 600, channels: 3, background: { r: 40, g: 130, b: 220 } },
  })
    .jpeg()
    .toBuffer();

  // Brand / logo image
  const brandLogoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");

  // 7 Test Scenarios required by Phase C.6:
  const testScenarios = [
    {
      id: 1,
      name: "Direct catalogue image",
      buffer: fairyImgBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedProductName: fairyProduct.name,
      isJewellery: true,
      description: "Direct Cloudinary image of Fairy Pendant",
    },
    {
      id: 2,
      name: "Instagram product screenshot",
      buffer: instaScreenshotBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedProductName: fairyProduct.name,
      isJewellery: true,
      description: "Mobile Instagram feed viewport containing Fairy Pendant",
    },
    {
      id: 3,
      name: "Customer website screenshot",
      buffer: visibleScreenshotBuf,
      expectedProductId: "6a883d48b479512538b2bbb1",
      expectedProductName: "Delicate Necklace / Pendant",
      isJewellery: true,
      description: "Real customer upload media_1788945712892.png with visible product",
    },
    {
      id: 4,
      name: "Small product screenshot",
      buffer: smallProductScreenshotBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedProductName: fairyProduct.name,
      isJewellery: true,
      description: "Real customer desktop screenshot media_1788945719909.png (~62x62px in modal)",
    },
    {
      id: 5,
      name: "Random unrelated image",
      buffer: randomBuf,
      expectedProductId: null,
      expectedProductName: "None (Rejection expected)",
      isJewellery: false,
      description: "Synthetic blue gradient without jewellery",
    },
    {
      id: 6,
      name: "Brand / logo image",
      buffer: brandLogoBuf,
      expectedProductId: null,
      expectedProductName: "None (Rejection expected)",
      isJewellery: false,
      description: "Official The Girl House logo symbol",
    },
    {
      id: 7,
      name: "Similar-but-different jewellery product",
      buffer: h1Buf,
      expectedProductId: prodH1._id.toString(),
      expectedProductName: prodH1.name,
      counterpartProductId: prodH2._id.toString(),
      counterpartProductName: prodH2.name,
      isJewellery: true,
      description: "Query Temple Long Haram; test discrimination against Temple Lakshmi Choker",
    },
  ];

  const testReports = [];

  for (const tc of testScenarios) {
    console.log(`\n--------------------------------------------------------`);
    console.log(`TEST ${tc.id}: ${tc.name}`);
    console.log(`Input: ${tc.description}`);
    console.log(`Expected: ${tc.expectedProductName} (${tc.expectedProductId || "None"})`);

    const { req, res, getResult } = mockMemoryReqRes(
      tc.buffer,
      {},
      { expectedProductId: tc.expectedProductId }
    );

    await performClipShadowSearch(req, res);
    const result = getResult();

    const topCandidate = result.candidates?.[0] || null;
    const top5 = (result.candidates || []).slice(0, 5);
    const expInfo = result.expectedProduct;

    console.log(`HTTP status       : ${result.statusCode}`);
    console.log(`Processing time   : ${result.processingTimeMs}ms`);
    console.log(`Top 1 candidate   : ${topCandidate?.name} (score: ${topCandidate?.score}, margin: ${topCandidate?.margin}, region: ${topCandidate?.winningRegion})`);
    console.log(`Region agreement  : ${result.confidence?.regionAgreement}`);
    console.log(`Confidence label  : ${result.confidence?.label}`);
    console.log(`Expected rank     : ${expInfo?.rank !== null && expInfo?.rank !== undefined ? `#${expInfo.rank}` : "N/A"}`);
    console.log(`Expected score    : ${expInfo?.score !== null && expInfo?.score !== undefined ? expInfo.score : "N/A"}`);

    if (tc.id === 7) {
      const counterpartInTop = top5.find((c) => c.productId.toString() === tc.counterpartProductId);
      console.log(`Counterpart rank  : ${counterpartInTop ? top5.indexOf(counterpartInTop) + 1 : "> 5"} (score: ${counterpartInTop?.score || "N/A"})`);
    }

    testReports.push({
      testId: tc.id,
      name: tc.name,
      description: tc.description,
      expectedName: tc.expectedProductName,
      expectedId: tc.expectedProductId,
      isJewellery: tc.isJewellery,
      httpStatus: result.statusCode,
      processingTimeMs: result.processingTimeMs,
      queryDimensions: result.query,
      topCandidate: topCandidate ? { name: topCandidate.name, score: topCandidate.score, margin: topCandidate.margin, winningRegion: topCandidate.winningRegion } : null,
      top5: top5.map((c) => ({ productId: c.productId, name: c.name, score: c.score, margin: c.margin, winningRegion: c.winningRegion })),
      score: result.confidence?.score,
      margin: result.confidence?.margin,
      winningRegion: topCandidate?.winningRegion,
      regionAgreement: result.confidence?.regionAgreement,
      confidenceLabel: result.confidence?.label,
      expectedRank: expInfo?.rank ?? null,
      expectedScore: expInfo?.score ?? null,
      expectedBecameTop1: expInfo?.becameNumberOne ?? false,
    });
  }

  // Verification A: Test existing production search endpoint /api/image-search (findProductByImage)
  console.log("\n========================================================");
  console.log("VERIFICATION A: PRODUCTION SEARCH ENDPOINT ISOLATION");
  console.log("========================================================");

  // Write a temporary file for findProductByImage since it uses disk Multer in production
  const testOldPath = path.resolve(process.cwd(), "uploads", "test-prod-verify.jpg");
  if (!fs.existsSync(path.dirname(testOldPath))) {
    fs.mkdirSync(path.dirname(testOldPath), { recursive: true });
  }
  fs.writeFileSync(testOldPath, fairyImgBuf);

  const reqOld = {
    file: { path: testOldPath, originalname: "verify.jpg" },
    headers: { origin: "http://localhost:3000" },
  };
  let oldStatusCode = 200;
  let oldData = null;
  const resOld = {
    status(c) { oldStatusCode = c; return this; },
    json(d) { oldData = d; return this; },
  };

  await findProductByImage(reqOld, resOld);
  console.log(`Production /api/image-search response status: ${oldStatusCode}`);
  console.log(`Production matchType: ${oldData?.matchType}`);
  console.log(`Production exactMatch: ${oldData?.exactMatch?.name || "None"} (${oldData?.exactMatch?.similarity || "N/A"})`);
  console.log(`Production perceptual-hash search intact: ${oldData?.matchType === "exact" ? "YES" : "NO"}`);

  // Save report to JSON for inspection
  const reportSavePath = path.resolve(process.cwd(), "uploads", "c6_shadow_test_results.json");
  fs.writeFileSync(reportSavePath, JSON.stringify(testReports, null, 2));
  console.log(`\nAll 7 test results saved to: ${reportSavePath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
