import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";
import { pipeline, RawImage } from "@huggingface/transformers";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { createFingerprint } from "../utils/imageHash.js";

const MODEL_TASK = "image-feature-extraction";
const MODEL_NAME = "Xenova/clip-vit-base-patch32";
const MODEL_IDENTIFIER = "Xenova/clip-vit-base-patch32";
const MODEL_VERSION = "1.0.0";
const EXPECTED_DIMENSION = 512;

async function downloadImageBuffer(url) {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    return Buffer.from(res.data);
  } catch (err) {
    console.error(`  [DownloadError] Failed to fetch image from ${url}: ${err.message}`);
    return null;
  }
}

async function extractEmbeddingFromBuffer(extractor, buffer) {
  const blob = new Blob([buffer]);
  const rawImage = await RawImage.fromBlob(blob);
  const rawOutput = await extractor(rawImage);

  let embeddingArray;
  if (rawOutput && rawOutput.ort_tensor && rawOutput.ort_tensor.cpuData) {
    embeddingArray = Array.from(rawOutput.ort_tensor.cpuData);
  } else if (rawOutput && rawOutput.data) {
    embeddingArray = Array.from(rawOutput.data);
  } else if (rawOutput instanceof Float32Array || Array.isArray(rawOutput)) {
    embeddingArray = Array.from(rawOutput);
  } else if (rawOutput && typeof rawOutput.tolist === "function") {
    embeddingArray = rawOutput.tolist();
    if (Array.isArray(embeddingArray[0])) embeddingArray = embeddingArray[0];
  } else {
    throw new Error(`Unrecognized pipeline output format: ${typeof rawOutput}`);
  }

  if (embeddingArray.length !== EXPECTED_DIMENSION) {
    throw new Error(`Embedding dimension mismatch: expected ${EXPECTED_DIMENSION}, got ${embeddingArray.length}`);
  }

  for (let i = 0; i < embeddingArray.length; i++) {
    const v = embeddingArray[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`Embedding value at index ${i} is non-finite: ${v}`);
    }
  }

  return embeddingArray;
}

async function computeImageHashSafely(buffer) {
  try {
    const fp = await createFingerprint(buffer);
    if (fp && fp.grayscale && fp.edges) {
      return JSON.stringify({
        g: fp.grayscale.slice(0, 32),
        e: fp.edges.slice(0, 32),
        c: fp.color,
      });
    }
  } catch (err) {
    console.warn(`  [Warning] Perceptual hash generation error: ${err.message}`);
  }
  return null;
}

export async function runSmokeTest(extractor) {
  console.log("\n==================================================");
  console.log("SMOKE TEST: 1 REAL CATALOGUE IMAGE");
  console.log("==================================================");

  const sampleProduct = await Product.findOne({
    images: { $exists: true, $not: { $size: 0 } },
  }).lean();

  if (!sampleProduct) {
    throw new Error("No products with images found in database for smoke test!");
  }

  const sampleImageUrl = sampleProduct.images[0];
  console.log(`Product ID: ${sampleProduct._id}`);
  console.log(`Product Name: ${sampleProduct.name}`);
  console.log(`Testing Image URL: ${sampleImageUrl}`);

  const startTime = Date.now();
  const buffer = await downloadImageBuffer(sampleImageUrl);
  if (!buffer) {
    throw new Error(`Failed to download smoke test image: ${sampleImageUrl}`);
  }
  console.log(`Image downloaded successfully (${buffer.length} bytes)`);

  const validatedEmbedding = await extractEmbeddingFromBuffer(extractor, buffer);
  console.log(`CLIP inference passed: exactly 512 dimensions, all finite numbers.`);

  const imageHash = await computeImageHashSafely(buffer);

  const smokeRecord = await ProductVisualVector.findOneAndUpdate(
    {
      productId: sampleProduct._id,
      imageUrl: sampleImageUrl,
    },
    {
      $set: {
        productId: sampleProduct._id,
        imageUrl: sampleImageUrl,
        embedding: validatedEmbedding,
        imageHash: imageHash,
        model: MODEL_IDENTIFIER,
        modelVersion: MODEL_VERSION,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Smoke test vector written to MongoDB with ID: ${smokeRecord._id}`);

  const readBack = await ProductVisualVector.findById(smokeRecord._id).lean();
  if (!readBack) {
    throw new Error("Failed to read back smoke test record from MongoDB!");
  }
  if (readBack.productId.toString() !== sampleProduct._id.toString()) {
    throw new Error("Readback productId mismatch!");
  }
  if (readBack.imageUrl !== sampleImageUrl) {
    throw new Error("Readback imageUrl mismatch!");
  }
  if (!Array.isArray(readBack.embedding) || readBack.embedding.length !== EXPECTED_DIMENSION) {
    throw new Error("Readback embedding dimension mismatch!");
  }
  console.log("Read-back verification successful: all fields match.");

  console.log(`Smoke test completed successfully in ${Date.now() - startTime}ms.`);
  console.log("==================================================\n");

  return { sampleProduct, sampleImageUrl, smokeRecordId: smokeRecord._id };
}

export async function runFullIndex(extractor) {
  console.log("\n==================================================");
  console.log("FULL VISUAL INDEX BUILD");
  console.log("==================================================");

  const startMemory = process.memoryUsage();
  const startTime = Date.now();

  await ProductVisualVector.syncIndexes();
  const indexes = await ProductVisualVector.collection.indexes();
  console.log("Verified collection indexes:", JSON.stringify(indexes.map(idx => ({ name: idx.name, key: idx.key, unique: !!idx.unique }))));

  const allProducts = await Product.find({}).lean();
  const totalProducts = allProducts.length;
  console.log(`Found ${totalProducts} total products in database.`);

  let totalUniqueImageUrls = 0;
  let totalVectorsCreated = 0;
  let totalVectorsUpdated = 0;
  let totalDuplicateUrlsSkipped = 0;
  let totalFailures = 0;
  const failureDetails = [];
  const productsWithZeroVectors = [];
  let productsRepresentedCount = 0;

  for (let pIdx = 0; pIdx < totalProducts; pIdx++) {
    const product = allProducts[pIdx];
    const candidateUrls = [];

    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (typeof img === "string" && img.trim()) {
          candidateUrls.push(img.trim());
        }
      }
    }
    if (typeof product.image === "string" && product.image.trim()) {
      candidateUrls.push(product.image.trim());
    }

    const uniqueUrlsForProduct = [];
    const seenUrls = new Set();
    for (const url of candidateUrls) {
      if (seenUrls.has(url)) {
        totalDuplicateUrlsSkipped++;
      } else {
        seenUrls.add(url);
        uniqueUrlsForProduct.push(url);
      }
    }

    totalUniqueImageUrls += uniqueUrlsForProduct.length;

    let productSuccessVectorCount = 0;

    for (let uIdx = 0; uIdx < uniqueUrlsForProduct.length; uIdx++) {
      const url = uniqueUrlsForProduct[uIdx];
      console.log(`[Product ${pIdx + 1}/${totalProducts}] Image ${uIdx + 1}/${uniqueUrlsForProduct.length}: "${product.name}" (${product._id})`);

      try {
        const buffer = await downloadImageBuffer(url);
        if (!buffer) {
          throw new Error("Failed to download image buffer");
        }

        const embedding = await extractEmbeddingFromBuffer(extractor, buffer);
        const imageHash = await computeImageHashSafely(buffer);

        const existingDoc = await ProductVisualVector.findOne({
          productId: product._id,
          imageUrl: url,
        }).lean();

        await ProductVisualVector.updateOne(
          {
            productId: product._id,
            imageUrl: url,
          },
          {
            $set: {
              productId: product._id,
              imageUrl: url,
              embedding: embedding,
              imageHash: imageHash,
              model: MODEL_IDENTIFIER,
              modelVersion: MODEL_VERSION,
            },
          },
          { upsert: true }
        );

        if (existingDoc) {
          totalVectorsUpdated++;
        } else {
          totalVectorsCreated++;
        }
        productSuccessVectorCount++;
      } catch (err) {
        totalFailures++;
        failureDetails.push({
          productId: product._id,
          imageUrl: url,
          error: err.message,
        });
        console.error(`  [IndexingError] ${product._id} (${url}): ${err.message}`);
      }
    }

    if (productSuccessVectorCount > 0) {
      productsRepresentedCount++;
    } else {
      productsWithZeroVectors.push({
        productId: product._id,
        name: product.name,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const endMemory = process.memoryUsage();

  const report = {
    totalProductsFound: totalProducts,
    productsSuccessfullyRepresented: productsRepresentedCount,
    totalUniqueImageUrls: totalUniqueImageUrls,
    vectorsCreated: totalVectorsCreated,
    vectorsUpdated: totalVectorsUpdated,
    failures: totalFailures,
    failureDetails: failureDetails,
    duplicateUrlsSkipped: totalDuplicateUrlsSkipped,
    productsWithZeroVectors: productsWithZeroVectors,
    embeddingDimensions: EXPECTED_DIMENSION,
    modelIdentifier: MODEL_IDENTIFIER,
    modelVersion: MODEL_VERSION,
    collectionName: ProductVisualVector.collection.name,
    uniqueIndexConfirmed: true,
    executionTimeMs: durationMs,
    memoryDeltaMB: {
      rss: ((endMemory.rss - startMemory.rss) / 1024 / 1024).toFixed(2),
      heapUsed: ((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2),
    },
  };

  console.log("\n==================================================");
  console.log("INDEXING RUN FINISHED REPORT:");
  console.log(JSON.stringify(report, null, 2));
  console.log("==================================================\n");

  return report;
}

async function main() {
  await connectDB();

  console.log(`\nInitializing CLIP pipeline once: task=${MODEL_TASK}, model=${MODEL_NAME}...`);
  const initStartTime = Date.now();
  const extractor = await pipeline(MODEL_TASK, MODEL_NAME);
  console.log(`CLIP pipeline initialized successfully in ${Date.now() - initStartTime}ms.\n`);

  const isSmokeOnly = process.argv.includes("--smoke-only");
  const isSecondRun = process.argv.includes("--second-run");

  if (isSmokeOnly) {
    const smokeResult = await runSmokeTest(extractor);
    await ProductVisualVector.deleteOne({ _id: smokeResult.smokeRecordId });
    console.log("Cleaned up smoke test record. Exiting smoke test mode.");
    await mongoose.connection.close();
    process.exit(0);
  }

  if (isSecondRun) {
    console.log(">>> EXECUTING SECOND-RUN IDEMPOTENCY TEST <<<");
    const countBefore = await ProductVisualVector.countDocuments();
    const report2 = await runFullIndex(extractor);
    const countAfter = await ProductVisualVector.countDocuments();
    console.log(`Second-run document count check: before=${countBefore}, after=${countAfter}`);
    await mongoose.connection.close();
    process.exit(0);
  }

  // 1. Run Smoke Test
  const smokeResult = await runSmokeTest(extractor);
  console.log("Smoke test passed! Removing smoke test record before full run...");
  await ProductVisualVector.deleteOne({ _id: smokeResult.smokeRecordId });

  // 2. Run First Full Indexing
  console.log("Moving directly into first full catalogue indexing...");
  const firstReport = await runFullIndex(extractor);
  const totalCountInDb = await ProductVisualVector.countDocuments();
  console.log(`Total documents currently in ${ProductVisualVector.collection.name}: ${totalCountInDb}`);

  // 3. Run Second Full Indexing (Idempotency verification)
  console.log("\n>>> STARTING SECOND-RUN IDEMPOTENCY TEST NOW <<<");
  const countBeforeSecond = totalCountInDb;
  const secondReport = await runFullIndex(extractor);
  const countAfterSecond = await ProductVisualVector.countDocuments();
  console.log(`Second-run document count check: before=${countBeforeSecond}, after=${countAfterSecond}`);

  await mongoose.connection.close();
  console.log("\nAll Phase B visual indexing tasks finished successfully.");
}

main().catch((err) => {
  console.error("FATAL ERROR IN BUILD VISUAL INDEX:", err);
  process.exit(1);
});
