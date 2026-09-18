import "dotenv/config";
import sharp from "sharp";
import fs from "fs";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import {
  extractEmbeddingFromBuffer,
  computeCosineSimilarity,
} from "../services/clipVisualSearchService.js";

const screenshot2Path = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png";
const screenshot3Path = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png";

async function inspectScreenshot(filePath, name) {
  console.log(`\n=========================================`);
  console.log(`Inspecting: ${name} (${filePath})`);
  const meta = await sharp(filePath).metadata();
  console.log(`Dimensions: ${meta.width}x${meta.height}`);

  // Look for the product card/thumbnail in the modal
  // In the customer modal (which is identical layout to Fairy modal), the product card thumbnail is typically at left ~330, top ~395, width ~62, height ~62, or let's scan rows
  // Let's test a few plausible crops around the modal content area:
  // [330, 395, 62, 62] (same modal position as Fairy!)
  const testCrops = [
    { name: "Standard Modal Thumbnail Box", box: { left: 330, top: 395, width: 62, height: 62 } },
    { name: "Expanded Thumbnail Box", box: { left: 320, top: 385, width: 80, height: 80 } },
    { name: "Modal Header Area", box: { left: 330, top: 290, width: 350, height: 50 } },
    { name: "Modal Content Area", box: { left: 320, top: 370, width: 380, height: 110 } },
  ];

  const catalogueVectors = await ProductVisualVector.find({
    model: "Xenova/clip-vit-base-patch32",
  }).lean();
  const products = await Product.find({}).select("name category images").lean();
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  for (const tc of testCrops) {
    const cropBuf = await sharp(filePath).extract(tc.box).png().toBuffer();
    const emb = await extractEmbeddingFromBuffer(cropBuf);

    const scores = new Map();
    for (const v of catalogueVectors) {
      const s = computeCosineSimilarity(emb, v.embedding);
      const pid = v.productId.toString();
      if (!scores.has(pid) || s > scores.get(pid)) scores.set(pid, s);
    }

    const sorted = Array.from(scores.entries())
      .map(([pid, s]) => ({ productId: pid, name: productMap.get(pid)?.name || "Unknown", score: Number(s.toFixed(4)) }))
      .sort((a, b) => b.score - a.score);

    console.log(`  Crop [${tc.name}] (${tc.box.left},${tc.box.top} ${tc.box.width}x${tc.box.height}):`);
    console.log(`    Top 1: ${sorted[0].name} (${sorted[0].score}) [ID: ${sorted[0].productId}]`);
    console.log(`    Top 2: ${sorted[1].name} (${sorted[1].score}) [ID: ${sorted[1].productId}]`);
    console.log(`    Margin: ${(sorted[0].score - sorted[1].score).toFixed(4)}`);
  }
}

async function run() {
  await connectDB();
  await inspectScreenshot(screenshot2Path, "Customer Screenshot 2");
  await inspectScreenshot(screenshot3Path, "Customer Screenshot 3");
  process.exit(0);
}

run().catch(console.error);
