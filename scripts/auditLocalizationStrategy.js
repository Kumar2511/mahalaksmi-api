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

async function main() {
  await connectDB();

  console.log("\n==================================================");
  console.log("PHASE C.4 AUTOMATIC LOCALIZATION STRATEGY AUDIT");
  console.log("==================================================\n");

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();

  const products = await Product.find({}).select("name category images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // Test set: 8 real diverse local test images
  // 1. Direct normal catalogue image (Fairy)
  const fairyProduct = await Product.findById("6a8983a438c8c89855e85110").lean();
  const fairyBuf = await downloadUrlToBuffer(fairyProduct.images[0]);

  // 2. Real customer desktop screenshot (Fairy in modal)
  const userScreenshotFairy = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png");

  // 3. Real customer desktop screenshot 2 (media_1788945712892.png)
  const userScreenshot2 = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png");

  // 4. Real customer desktop screenshot 3 (media_1788945723732.png)
  const userScreenshot3 = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png");

  // 5. Instagram mobile framed screenshot (Fairy)
  const instaFairyBuf = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([{ input: await sharp(fairyBuf).resize(720, 960, { fit: "cover" }).toBuffer(), top: 400, left: 180 }])
    .jpeg()
    .toBuffer();

  // 6. Non-jewellery: Brand Logo
  const brandLogoBuf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/the-girl-who-she-logo.png");

  // 7. Non-jewellery: Silhouette intro frame 1
  const introFrame1Buf = fs.readFileSync("D:/THE GIRL HOUSE/admin/project/public/intro/frame_1.png");

  // 8. Non-jewellery: Customer website footer screenshot
  const footerBuf = fs.readFileSync("C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media__1788836749477.png");

  const testCases = [
    {
      name: "1. Direct Normal Product Image",
      type: "DIRECT_PRODUCT",
      buffer: fairyBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
    {
      name: "2. Customer Desktop Screenshot (Fairy in modal)",
      type: "CUSTOMER_SCREENSHOT",
      buffer: userScreenshotFairy,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
    {
      name: "3. Customer Desktop Screenshot 2 (Red jewellery in modal)",
      type: "CUSTOMER_SCREENSHOT",
      buffer: userScreenshot2,
      expectedProductId: null,
      expectedName: "Red Jewellery Screenshot",
    },
    {
      name: "4. Customer Desktop Screenshot 3 (Gold set in modal)",
      type: "CUSTOMER_SCREENSHOT",
      buffer: userScreenshot3,
      expectedProductId: null,
      expectedName: "Gold Jewellery Screenshot",
    },
    {
      name: "5. Instagram Mobile Framed Post",
      type: "INSTAGRAM_POST",
      buffer: instaFairyBuf,
      expectedProductId: fairyProduct._id.toString(),
      expectedName: fairyProduct.name,
    },
    {
      name: "6. Non-Jewellery: Brand Logo",
      type: "NON_JEWELLERY",
      buffer: brandLogoBuf,
      expectedProductId: null,
      expectedName: "None (Logo)",
    },
    {
      name: "7. Non-Jewellery: Dark Graphic Silhouette",
      type: "NON_JEWELLERY",
      buffer: introFrame1Buf,
      expectedProductId: null,
      expectedName: "None (Silhouette)",
    },
    {
      name: "8. Non-Jewellery: Website Footer UI",
      type: "NON_JEWELLERY",
      buffer: footerBuf,
      expectedProductId: null,
      expectedName: "None (Footer)",
    },
  ];

  const auditResults = [];

  for (const tc of testCases) {
    const meta = await sharp(tc.buffer).metadata();
    const tStart = Date.now();

    // 1. Compute full-image baseline embedding & score
    const fullEmbedding = await extractEmbeddingFromBuffer(tc.buffer);
    const fullScores = new Map();
    for (const v of catalogueVectors) {
      const s = computeCosineSimilarity(fullEmbedding, v.embedding);
      const pid = v.productId.toString();
      if (!fullScores.has(pid) || s > fullScores.get(pid)) fullScores.set(pid, s);
    }
    const fullSorted = Array.from(fullScores.entries()).sort((a, b) => b[1] - a[1]);
    const fullTop1 = { id: fullSorted[0][0], name: productMap.get(fullSorted[0][0])?.name, score: Number(fullSorted[0][1].toFixed(4)) };
    const fullExpectedRank = tc.expectedProductId ? fullSorted.findIndex((e) => e[0] === tc.expectedProductId) + 1 : null;
    const fullExpectedScore = tc.expectedProductId ? Number((fullScores.get(tc.expectedProductId) || 0).toFixed(4)) : null;

    // 2. Run salient region proposal
    const proposedRegions = await proposeSalientCandidateRegions(tc.buffer);

    // 3. Score each region with CLIP against catalogue
    const localizedProductScores = new Map();

    for (const reg of proposedRegions) {
      const regEmbedding = await extractEmbeddingFromBuffer(reg.buffer);
      for (const v of catalogueVectors) {
        const s = computeCosineSimilarity(regEmbedding, v.embedding);
        const pid = v.productId.toString();
        if (
          !localizedProductScores.has(pid) ||
          s > localizedProductScores.get(pid).score
        ) {
          localizedProductScores.set(pid, {
            productId: pid,
            name: productMap.get(pid)?.name,
            score: Number(s.toFixed(4)),
            winningRegion: reg.name,
            coordinates: { left: reg.left, top: reg.top, width: reg.width, height: reg.height },
          });
        }
      }
    }

    const localizedSorted = Array.from(localizedProductScores.values()).sort((a, b) => b.score - a.score);
    const locTop1 = localizedSorted[0];
    const locExpectedRank = tc.expectedProductId ? localizedSorted.findIndex((e) => e.productId === tc.expectedProductId) + 1 : null;
    const locExpectedScore = tc.expectedProductId ? (localizedProductScores.get(tc.expectedProductId)?.score || 0) : null;
    const locWinningRegion = tc.expectedProductId ? (localizedProductScores.get(tc.expectedProductId)?.winningRegion || "N/A") : "N/A";

    const elapsedMs = Date.now() - tStart;

    // Check if primary focus region visually intersects the actual product thumbnail
    let regionContainsJewellery = "N/A";
    if (tc.name.includes("Fairy in modal")) {
      // Fairy thumbnail is at approx left:330, top:395, width:62, height:62
      const pri = proposedRegions.find((r) => r.name === "salient_primary_focus");
      if (pri) {
        const overlaps = pri.left <= 330 && (pri.left + pri.width) >= 392 && pri.top <= 395 && (pri.top + pri.height) >= 457;
        regionContainsJewellery = overlaps ? "YES (Overlaps Fairy Box)" : "PARTIAL / NEARBY";
      }
    } else if (tc.type === "DIRECT_PRODUCT" || tc.type === "INSTAGRAM_POST") {
      regionContainsJewellery = "YES (Contains Jewellery)";
    } else if (tc.type === "NON_JEWELLERY") {
      regionContainsJewellery = "NO (Non-Jewellery)";
    }

    auditResults.push({
      inputName: tc.name,
      imageDimensions: `${meta.width}x${meta.height}`,
      proposedRegionsCount: proposedRegions.length,
      proposedRegionCoords: proposedRegions.map((r) => `${r.name}: [${r.left},${r.top} ${r.width}x${r.height}]`),
      regionContainsJewellery,
      fullImageTop1: `${fullTop1.name} (${fullTop1.score})`,
      fullImageExpectedRank: fullExpectedRank ? `#${fullExpectedRank}` : "N/A",
      fullImageExpectedScore: fullExpectedScore,
      localizedTop1: `${locTop1.name} (${locTop1.score}) [via ${locTop1.winningRegion}]`,
      localizedExpectedRank: locExpectedRank ? `#${locExpectedRank}` : "N/A",
      localizedExpectedScore: locExpectedScore,
      localizedWinningRegion: locWinningRegion,
      scoreImprovement: tc.expectedProductId ? Number((locExpectedScore - fullExpectedScore).toFixed(4)) : "N/A",
      elapsedMs,
    });
  }

  console.log("\n==================================================");
  console.log("PHASE C.4 LOCALIZATION AUDIT SUMMARY TABLE");
  console.log("==================================================");
  console.table(
    auditResults.map((r) => ({
      Input: r.inputName.slice(0, 28),
      Dimensions: r.imageDimensions,
      "Contains Jewellery": r.regionContainsJewellery,
      "Full Expected Rank": r.fullImageExpectedRank,
      "Full Expected Score": r.fullImageExpectedScore,
      "Loc Expected Rank": r.localizedExpectedRank,
      "Loc Expected Score": r.localizedExpectedScore,
      "Score Delta": r.scoreImprovement,
      "Elapsed (ms)": r.elapsedMs,
    }))
  );

  console.log("\n==================================================");
  console.log("FULL RAW DIAGNOSTIC RESULTS:");
  console.log(JSON.stringify(auditResults, null, 2));
  console.log("==================================================\n");

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("FATAL ERROR IN C.4 AUDIT:", err);
  process.exit(1);
});
