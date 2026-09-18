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

async function main() {
  await connectDB();

  console.log("\n==================================================");
  console.log("PHASE C.2: REGION-AWARE CLIP SHADOW SEARCH TEST SUITE");
  console.log("==================================================\n");

  const tempDir = path.resolve(process.cwd(), "uploads", "test-c2");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Load target products
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean(); // Target for 1, 2, 3, 4
  const delicateNecklace = await Product.findById("6a883d48b479512538b2bbb1").lean(); // Target for 5, 6
  // Visually similar necklace for Test 7:
  // Target: Traditional Antique Gold Plated Elephant Motif Necklace Set (6a8983a338c8c89855e850ef)
  // Input: Traditional Antique Gold Temple Long Necklace Set (6a8983a438c8c89855e85107)
  const elephantNecklace = await Product.findById("6a8983a338c8c89855e850ef").lean();
  const templeLongNecklace = await Product.findById("6a8983a438c8c89855e85107").lean();

  const fairyImgBuffer = await downloadUrlToBuffer(fairyProduct.images[0]);
  const delicateImgBuffer = await downloadUrlToBuffer(delicateNecklace.images[0]);
  const templeLongImgBuffer = await downloadUrlToBuffer(templeLongNecklace.images[0]);

  const testCases = [];

  // 1. Exact original catalogue image (Fairy Motif Pendant)
  const file1 = path.join(tempDir, "tc1_exact.jpg");
  fs.writeFileSync(file1, fairyImgBuffer);
  testCases.push({
    name: "1. Exact Original Catalogue Image",
    file: file1,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
    category: "POSITIVE",
  });

  // 2. Customer website screenshot with small product
  const userScreenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";
  const file2 = path.join(tempDir, "tc2_customer_screenshot.png");
  fs.copyFileSync(userScreenshotPath, file2);
  testCases.push({
    name: "2. Customer Website Screenshot with Small Product",
    file: file2,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
    category: "POSITIVE",
  });

  // 3. Instagram / mobile post screenshot
  const file3 = path.join(tempDir, "tc3_instagram_mobile.jpg");
  await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: { r: 18, g: 18, b: 18 },
    },
  })
    .composite([
      {
        input: await sharp(fairyImgBuffer).resize(720, 960, { fit: "cover" }).toBuffer(),
        top: 400,
        left: 180,
      },
    ])
    .jpeg()
    .toFile(file3);
  testCases.push({
    name: "3. Instagram / Mobile Post Screenshot",
    file: file3,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
    category: "POSITIVE",
  });

  // 4. Cropped product image (60% center crop)
  const file4 = path.join(tempDir, "tc4_crop60.jpg");
  const fairyMeta = await sharp(fairyImgBuffer).metadata();
  const cropW = Math.round(fairyMeta.width * 0.6);
  const cropH = Math.round(fairyMeta.height * 0.6);
  const cropLeft = Math.round((fairyMeta.width - cropW) / 2);
  const cropTop = Math.round((fairyMeta.height - cropH) / 2);
  await sharp(fairyImgBuffer)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .jpeg()
    .toFile(file4);
  testCases.push({
    name: "4. Cropped Product Image (60% Center Crop)",
    file: file4,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
    category: "POSITIVE",
  });

  // 5. Resized / Thumbnail version (120x180)
  const file5 = path.join(tempDir, "tc5_thumbnail.jpg");
  await sharp(delicateImgBuffer).resize(120, 180, { fit: "cover" }).jpeg().toFile(file5);
  testCases.push({
    name: "5. Resized Thumbnail (120x180)",
    file: file5,
    expectedProductId: delicateNecklace._id.toString(),
    expectedName: delicateNecklace.name,
    category: "POSITIVE",
  });

  // 6. Same product presented differently (lighting & saturation shift)
  const file6 = path.join(tempDir, "tc6_lighting_variant.jpg");
  await sharp(delicateImgBuffer)
    .modulate({ brightness: 1.15, saturation: 1.3 })
    .jpeg()
    .toFile(file6);
  testCases.push({
    name: "6. Lighting & Saturation Shift Variant",
    file: file6,
    expectedProductId: delicateNecklace._id.toString(),
    expectedName: delicateNecklace.name,
    category: "POSITIVE",
  });

  // 7. Visually similar BUT DIFFERENT catalogue product
  // Input image is Temple Long Necklace, expected comparison against Elephant Necklace
  const file7 = path.join(tempDir, "tc7_similar_different_product.jpg");
  fs.writeFileSync(file7, templeLongImgBuffer);
  testCases.push({
    name: "7. Visually Similar But Different Catalogue Product",
    file: file7,
    expectedProductId: elephantNecklace._id.toString(),
    expectedName: `${elephantNecklace.name} (Negative target)`,
    inputIdentity: templeLongNecklace.name,
    category: "SIMILARITY_DISCRIMINATION",
  });

  // 8. Negative Tests: 5 real local non-jewellery images
  // Neg 1: Admin The Girl House Logo
  const neg1Path = "D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png";
  const fileNeg1 = path.join(tempDir, "neg1_logo.png");
  fs.copyFileSync(neg1Path, fileNeg1);
  testCases.push({
    name: "8a. Negative: Brand Logo (the-girl-who-she-logo.png)",
    file: fileNeg1,
    expectedProductId: null,
    expectedName: "None (Brand Logo)",
    category: "NEGATIVE",
  });

  // Neg 2: Admin Intro Frame 1
  const neg2Path = "D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png";
  const fileNeg2 = path.join(tempDir, "neg2_frame1.png");
  fs.copyFileSync(neg2Path, fileNeg2);
  testCases.push({
    name: "8b. Negative: Admin Intro Frame 1 (Silhouette)",
    file: fileNeg2,
    expectedProductId: null,
    expectedName: "None (Silhouette)",
    category: "NEGATIVE",
  });

  // Neg 3: Admin Intro Frame 2
  const neg3Path = "D:/THE GIRL HOUSE/admin/project/public/intro/frame_2.png";
  const fileNeg3 = path.join(tempDir, "neg3_frame2.png");
  fs.copyFileSync(neg3Path, fileNeg3);
  testCases.push({
    name: "8c. Negative: Admin Intro Frame 2 (Crown Silhouette)",
    file: fileNeg3,
    expectedProductId: null,
    expectedName: "None (Crown Silhouette)",
    category: "NEGATIVE",
  });

  // Neg 4: Customer Website Empty Footer Screenshot
  const neg4Path = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media__1788836749477.png";
  const fileNeg4 = path.join(tempDir, "neg4_footer.png");
  fs.copyFileSync(neg4Path, fileNeg4);
  testCases.push({
    name: "8d. Negative: Website Text/Footer Screenshot",
    file: fileNeg4,
    expectedProductId: null,
    expectedName: "None (Footer Screenshot)",
    category: "NEGATIVE",
  });

  // Neg 5: Mobile Browser Console Screenshot
  const neg5Path = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media__1788835771148.png";
  const fileNeg5 = path.join(tempDir, "neg5_console.png");
  fs.copyFileSync(neg5Path, fileNeg5);
  testCases.push({
    name: "8e. Negative: Mobile Browser Console Screenshot",
    file: fileNeg5,
    expectedProductId: null,
    expectedName: "None (Console Screenshot)",
    category: "NEGATIVE",
  });

  const diagnosticResults = [];

  for (const tc of testCases) {
    console.log(`Executing test: ${tc.name}...`);
    const uploadCopy = `${tc.file}.upload.jpg`;
    fs.copyFileSync(tc.file, uploadCopy);

    const mock = mockReqRes(uploadCopy);
    await performClipShadowSearch(mock.req, mock.res);
    const res = mock.getResult();

    if (!res.success) {
      console.error(`  Failed test ${tc.name}:`, res.message, res.error);
      continue;
    }

    const candidates = res.candidates || [];
    const top1 = candidates[0] || null;
    const top2 = candidates[1] || null;
    const top3 = candidates.slice(0, 3);
    const top5 = candidates.slice(0, 5);

    let rankOfExpected = -1;
    let scoreOfExpected = 0;
    let winningRegionOfExpected = "N/A";

    if (tc.expectedProductId) {
      const idx = candidates.findIndex((c) => c.productId.toString() === tc.expectedProductId);
      if (idx !== -1) {
        rankOfExpected = idx + 1;
        scoreOfExpected = candidates[idx].bestScore;
        winningRegionOfExpected = candidates[idx].winningRegion;
      }
    }

    const gapTop1Top2 = top1 && top2 ? Number((top1.bestScore - top2.bestScore).toFixed(4)) : 0;

    diagnosticResults.push({
      testName: tc.name,
      category: tc.category,
      expectedProductId: tc.expectedProductId || "N/A",
      expectedName: tc.expectedName,
      inputIdentity: tc.inputIdentity || null,
      top1ProductId: top1 ? top1.productId.toString() : "None",
      top1Name: top1 ? top1.name : "None",
      top1Score: top1 ? top1.bestScore : 0,
      top1WinningRegion: top1 ? top1.winningRegion : "None",
      gapTop1Top2: gapTop1Top2,
      expectedRank: rankOfExpected > 0 ? `#${rankOfExpected}` : "N/A",
      expectedScore: scoreOfExpected,
      expectedWinningRegion: winningRegionOfExpected,
      top3Candidates: top3.map((c) => `${c.name} [${c.bestScore}] (via ${c.winningRegion})`),
      top5Candidates: top5.map((c) => `${c.name} [${c.bestScore}] (via ${c.winningRegion})`),
    });

    if (fs.existsSync(tc.file)) try { fs.unlinkSync(tc.file); } catch {}
  }

  // Cleanup test folder
  if (fs.existsSync(tempDir)) {
    try { fs.rmdirSync(tempDir, { recursive: true }); } catch {}
  }

  console.log("\n==================================================");
  console.log("PHASE C.2 REGION-AWARE DIAGNOSTIC RESULTS TABLE");
  console.log("==================================================");
  console.table(
    diagnosticResults.map((r) => ({
      Test: r.testName.slice(0, 35),
      Expected: r.expectedName.slice(0, 25),
      "Top 1 Candidate": r.top1Name.slice(0, 25),
      "Top 1 Score": r.top1Score,
      "Top 1 Region": r.top1WinningRegion,
      "Top1-Top2 Gap": r.gapTop1Top2,
      "Expected Rank": r.expectedRank,
    }))
  );

  console.log("\n==================================================");
  console.log("FULL RAW DIAGNOSTIC DATA:");
  console.log(JSON.stringify(diagnosticResults, null, 2));
  console.log("==================================================\n");

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
