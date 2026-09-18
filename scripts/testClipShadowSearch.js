import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import { performClipShadowSearch } from "../controllers/clipVisualSearchController.js";
import mongoose from "mongoose";

// Mock Express req & res objects to test controller directly
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
  console.log("PHASE C: CLIP SHADOW SEARCH DIAGNOSTIC TEST SUITE");
  console.log("==================================================\n");

  const tempDir = path.resolve(process.cwd(), "uploads", "test-shadow");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Load target products
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const delicateNecklace = await Product.findById("6a883d48b479512538b2bbb1").lean();
  const elephantNecklace = await Product.findById("6a8983a338c8c89855e850ef").lean();

  const fairyImgBuffer = await downloadUrlToBuffer(fairyProduct.images[0]);
  const delicateImgBuffer = await downloadUrlToBuffer(delicateNecklace.images[0]);
  const elephantImgBuffer = await downloadUrlToBuffer(elephantNecklace.images[0]);

  const testCases = [];

  // 1. Exact original catalogue image (Fairy Motif Pendant)
  const file1 = path.join(tempDir, "test1_exact_catalogue.jpg");
  fs.writeFileSync(file1, fairyImgBuffer);
  testCases.push({
    name: "1. Exact Original Catalogue Image",
    file: file1,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
  });

  // 2. Customer website screenshot containing the product
  // Use real user-uploaded screenshot containing fairy motif necklace
  const userScreenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";
  const file2 = path.join(tempDir, "test2_customer_site_screenshot.png");
  fs.copyFileSync(userScreenshotPath, file2);
  testCases.push({
    name: "2. Customer Website Screenshot (with UI & Modal)",
    file: file2,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
  });

  // 3. Instagram / mobile screenshot containing the product
  // Composite fairy image inside an Instagram/mobile framed background
  const file3 = path.join(tempDir, "test3_instagram_screenshot.jpg");
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
  });

  // 4. Cropped product image (centre 60% crop of Fairy necklace)
  const file4 = path.join(tempDir, "test4_cropped_product.jpg");
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
    name: "4. Cropped Product Image (Center 60%)",
    file: file4,
    expectedProductId: fairyProduct._id.toString(),
    expectedName: fairyProduct.name,
  });

  // 5. Resized / Thumbnail version (120x180 thumbnail)
  const file5 = path.join(tempDir, "test5_thumbnail_product.jpg");
  await sharp(delicateImgBuffer).resize(120, 180, { fit: "cover" }).jpeg().toFile(file5);
  testCases.push({
    name: "5. Resized / Thumbnail Image (120x180)",
    file: file5,
    expectedProductId: delicateNecklace._id.toString(),
    expectedName: delicateNecklace.name,
  });

  // 6. Same product presented differently (color temperature & contrast shift)
  const file6 = path.join(tempDir, "test6_variant_presentation.jpg");
  await sharp(delicateImgBuffer)
    .modulate({ brightness: 1.1, saturation: 1.25 })
    .jpeg()
    .toFile(file6);
  testCases.push({
    name: "6. Same Product Presented Differently (Lighting/Warmth)",
    file: file6,
    expectedProductId: delicateNecklace._id.toString(),
    expectedName: delicateNecklace.name,
  });

  // 7. Visually similar jewellery from another product (Elephant Motif Necklace)
  const file7 = path.join(tempDir, "test7_similar_jewellery.jpg");
  fs.writeFileSync(file7, elephantImgBuffer);
  testCases.push({
    name: "7. Visually Similar Jewellery (Elephant Motif)",
    file: file7,
    expectedProductId: elephantNecklace._id.toString(),
    expectedName: elephantNecklace.name,
  });

  // 8. Completely unrelated / random image (nature / colored gradient)
  const file8 = path.join(tempDir, "test8_unrelated_random.jpg");
  await sharp({
    create: {
      width: 500,
      height: 500,
      channels: 3,
      background: { r: 30, g: 140, b: 230 },
    },
  })
    .jpeg()
    .toFile(file8);
  testCases.push({
    name: "8. Completely Unrelated Random Image",
    file: file8,
    expectedProductId: null,
    expectedName: "None (Unrelated)",
  });

  const diagnosticResults = [];

  for (const tc of testCases) {
    console.log(`Executing test: ${tc.name}...`);
    // Create copy for mock upload because controller unlinks file
    const uploadCopy = `${tc.file}.upload.jpg`;
    fs.copyFileSync(tc.file, uploadCopy);

    const mock = mockReqRes(uploadCopy);
    await performClipShadowSearch(mock.req, mock.res);
    const res = mock.getResult();

    if (!res.success) {
      console.error(`  Failed test ${tc.name}:`, res.message);
      continue;
    }

    const candidates = res.candidates || [];
    const top1 = candidates[0] || null;
    const top3 = candidates.slice(0, 3);
    const top5 = candidates.slice(0, 5);

    let rankOfExpected = -1;
    let appearedInTop10 = false;

    if (tc.expectedProductId) {
      const idx = candidates.findIndex((c) => c.productId.toString() === tc.expectedProductId);
      if (idx !== -1) {
        rankOfExpected = idx + 1;
        appearedInTop10 = rankOfExpected <= 10;
      }
    }

    diagnosticResults.push({
      inputIdentifier: tc.name,
      expectedProductId: tc.expectedProductId || "N/A",
      expectedName: tc.expectedName,
      top1ProductId: top1 ? top1.productId.toString() : "None",
      top1Name: top1 ? top1.name : "None",
      top1Score: top1 ? top1.score : 0,
      rankOfExpected: rankOfExpected > 0 ? `#${rankOfExpected}` : "Not in candidates",
      appearedInTop10: tc.expectedProductId ? (appearedInTop10 ? "YES" : "NO") : "N/A",
      top3Candidates: top3.map((c) => `${c.name} (${c.score})`),
      top5Candidates: top5.map((c) => `${c.name} (${c.score})`),
    });

    // Cleanup source file
    if (fs.existsSync(tc.file)) try { fs.unlinkSync(tc.file); } catch {}
  }

  // Cleanup test folder
  if (fs.existsSync(tempDir)) {
    try { fs.rmdirSync(tempDir, { recursive: true }); } catch {}
  }

  console.log("\n==================================================");
  console.log("DIAGNOSTIC TEST RESULTS SUMMARY TABLE");
  console.log("==================================================");
  console.table(
    diagnosticResults.map((r) => ({
      Test: r.inputIdentifier,
      Expected: r.expectedName.slice(0, 25),
      "Top 1 Candidate": r.top1Name.slice(0, 25),
      "Top 1 Score": r.top1Score,
      "Rank Expected": r.rankOfExpected,
      "In Top 10": r.appearedInTop10,
    }))
  );

  console.log("\n==================================================");
  console.log("FULL DIAGNOSTIC DETAIL REPORT:");
  console.log(JSON.stringify(diagnosticResults, null, 2));
  console.log("==================================================\n");

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
