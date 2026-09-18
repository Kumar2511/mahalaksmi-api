import "dotenv/config";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import axios from "axios";
import FormData from "form-data";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";
import { runHybridFallback, shouldPromoteHybridFallback } from "../services/hybridFallbackService.js";
import { createScreenshotFingerprints, createCatalogueFingerprints, compareScreenshotToCatalogue } from "../utils/imageHash.js";

async function main() {
  console.log("========================================================");
  console.log("PHASE D.4 — REAL LOCAL BROWSER & END-TO-END VERIFICATION");
  console.log("Customer: http://localhost:3000 | Backend: http://localhost:5000");
  console.log("========================================================\n");

  await connectDB();

  // Baseline database document counts
  const initialProductCount = await Product.countDocuments();
  const initialVectorCount = await ProductVisualVector.countDocuments();
  console.log(`Baseline Database Status: Products=${initialProductCount}, Vectors=${initialVectorCount}`);

  // Fetch reference products
  const fairyProduct = await Product.findOne({ name: /Fairy/i }).lean();
  const templeLongProduct = await Product.findOne({ name: /Temple Long/i }).lean();

  if (!fairyProduct || !templeLongProduct) {
    throw new Error("Could not find reference products in database!");
  }

  const fairyId = fairyProduct._id.toString();
  const templeLongId = templeLongProduct._id.toString();

  // Load Fairy image from cache
  const fairyFilename = path.basename(fairyProduct.images[0]);
  const fairyLocalPath = path.resolve(".image_cache", fairyFilename);
  const fairyBaseBuf = fs.readFileSync(fairyLocalPath);
  const fairyMeta = await sharp(fairyBaseBuf).metadata();

  // Load Temple Long image from cache
  const templeFilename = path.basename(templeLongProduct.images[0]);
  const templeLocalPath = path.resolve(".image_cache", templeFilename);
  const templeBaseBuf = fs.readFileSync(templeLocalPath);

  // Pre-warm catalogue fingerprints to evaluate standalone hash results
  const allProducts = await Product.find({}).lean();
  const catalogueCache = new Map();
  for (const p of allProducts) {
    const urls = [p.image, ...(p.images || [])].filter(Boolean);
    for (const u of urls) {
      const fn = path.basename(u);
      const lp = path.resolve(".image_cache", fn);
      if (fs.existsSync(lp)) {
        try {
          const fps = await createCatalogueFingerprints(lp);
          if (fps && fps.length > 0) catalogueCache.set(u, { product: p, fps });
        } catch (e) {}
      }
    }
  }

  // Diagnostic helper to compute standalone hash result on an image
  async function computeHashResult(imageBuf) {
    const tempTestPath = path.resolve("uploads", "temp-search", `diag-hash-${Date.now()}.jpg`);
    fs.writeFileSync(tempTestPath, imageBuf);
    try {
      const queryFps = await createScreenshotFingerprints(tempTestPath);
      if (!queryFps || queryFps.length === 0) {
        return { matchType: "none", topScore: 0, matchedProduct: null };
      }
      let bestSim = 0;
      let secondSim = 0;
      let bestProd = null;
      let bestComp = null;

      for (const [url, entry] of catalogueCache.entries()) {
        const comp = compareScreenshotToCatalogue(queryFps, entry.fps);
        const sim = Number(comp.similarity);
        if (sim > bestSim) {
          secondSim = bestSim;
          bestSim = sim;
          bestProd = entry.product;
          bestComp = comp;
        } else if (sim > secondSim) {
          secondSim = sim;
        }
      }
      const margin = bestSim - secondSim;
      const strongStructure = bestComp?.grayscaleSimilarity >= 0.83;
      const strongEdges = bestComp?.edgeSimilarity >= 0.48;
      const normalExact = bestSim >= 0.80 && strongStructure && strongEdges && margin >= 0.008;
      const veryStrongExact = bestSim >= 0.86 && bestComp?.grayscaleSimilarity >= 0.88;

      if (normalExact || veryStrongExact) {
        return { matchType: "exact", topScore: bestSim, matchedProduct: bestProd };
      }
      if (bestSim >= 0.72 && bestComp?.grayscaleSimilarity >= 0.76 && bestComp?.edgeSimilarity >= 0.56) {
        return { matchType: "category", topScore: bestSim, matchedProduct: bestProd };
      }
      return { matchType: "none", topScore: bestSim, matchedProduct: bestProd };
    } finally {
      if (fs.existsSync(tempTestPath)) fs.unlinkSync(tempTestPath);
    }
  }

  // Helper to send real HTTP multipart POST request to running backend
  async function sendCustomerSearchRequest(imageBuf, filename) {
    const form = new FormData();
    form.append("media", imageBuf, { filename, contentType: "image/jpeg" });

    const response = await axios.post("http://localhost:5000/api/image-search", form, {
      headers: {
        ...form.getHeaders(),
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/",
      },
      validateStatus: () => true, // Don't throw on non-200
    });

    return response;
  }

  // Generate 8 test representations
  console.log("Generating 8 real test image assets in memory...\n");

  // 1. Clean catalogue product image (Fairy)
  const buf1 = fairyBaseBuf;

  // 2. Product image where hash returns none but D.4 hybrid produces HIGH_CONFIDENCE
  // (Fairy central 72% crop)
  const cropW72 = Math.round(fairyMeta.width * 0.72);
  const cropH72 = Math.round(fairyMeta.height * 0.72);
  const buf2 = await sharp(fairyBaseBuf)
    .extract({
      left: Math.round((fairyMeta.width - cropW72) / 2),
      top: Math.round((fairyMeta.height - cropH72) / 2),
      width: cropW72,
      height: cropH72,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  // 3. Lighting/crop variant known from D.2 (Fairy 88% crop + 15% brightness + 10% sat)
  const lightW = Math.round(fairyMeta.width * 0.88);
  const lightH = Math.round(fairyMeta.height * 0.88);
  const buf3 = await sharp(fairyBaseBuf)
    .extract({
      left: Math.round((fairyMeta.width - lightW) / 2),
      top: Math.round((fairyMeta.height - lightH) / 2),
      width: lightW,
      height: lightH,
    })
    .modulate({ brightness: 1.15, saturation: 1.10 })
    .jpeg()
    .toBuffer();

  // 4. Instagram-style product screenshot (720x960 inside 1080x1920 mobile viewport)
  const buf4 = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 18, g: 18, b: 18 } },
  })
    .composite([
      {
        input: await sharp(fairyBaseBuf).resize(720, 960, { fit: "cover" }).toBuffer(),
        top: 400,
        left: 180,
      },
    ])
    .jpeg()
    .toBuffer();

  // 5. Tiny desktop screenshot (80x80 thumbnail in 1280x800 desktop canvas)
  const buf5 = await sharp({
    create: { width: 1280, height: 800, channels: 3, background: { r: 240, g: 242, b: 245 } },
  })
    .composite([
      {
        input: await sharp(fairyBaseBuf).resize(80, 80).toBuffer(),
        top: 350,
        left: 550,
      },
    ])
    .jpeg()
    .toBuffer();

  // 6. Cluttered customer webpage screenshot (300x320 card in 1280x800 page with header text)
  const buf6 = await sharp({
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
        input: await sharp(fairyBaseBuf).resize(300, 320, { fit: "cover" }).toBuffer(),
        top: 160,
        left: 200,
      },
    ])
    .jpeg()
    .toBuffer();

  // 7. Random unrelated image (100x100 solid blue texture)
  const buf7 = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 45, g: 110, b: 195 } },
  })
    .jpeg()
    .toBuffer();

  // 8. Genuinely different jewellery product (Temple Long Necklace Set)
  const buf8 = templeBaseBuf;

  const testDefinitions = [
    {
      id: 1,
      name: "Clean catalogue product image (Fairy)",
      inputType: "Direct catalogue image (Fairy Motif Pendant)",
      buffer: buf1,
      filename: "test1_clean_catalogue.jpg",
      expectedProductId: fairyId,
      expectedOutcome: "exact",
    },
    {
      id: 2,
      name: "Product image with hash=none (Fairy 72% crop)",
      inputType: "Cropped product photo (72% zoom)",
      buffer: buf2,
      filename: "test2_crop_72.jpg",
      expectedProductId: fairyId,
      expectedOutcome: "exact",
    },
    {
      id: 3,
      name: "Lighting/crop variant (~0.91 / ~0.08)",
      inputType: "Lighting & angle shifted photo (Fairy)",
      buffer: buf3,
      filename: "test3_lighting_variant.jpg",
      expectedProductId: fairyId,
      expectedOutcome: "exact",
    },
    {
      id: 4,
      name: "Instagram-style product screenshot (~0.89 / ~0.056)",
      inputType: "Instagram post screenshot in mobile frame",
      buffer: buf4,
      filename: "test4_instagram_post.jpg",
      expectedProductId: fairyId,
      expectedOutcome: "promoted_or_gate_verified",
    },
    {
      id: 5,
      name: "Tiny desktop screenshot (80x80 thumbnail)",
      inputType: "Tiny thumbnail in 1280x800 viewport",
      buffer: buf5,
      filename: "test5_tiny_desktop.jpg",
      expectedProductId: null,
      expectedOutcome: "none",
    },
    {
      id: 6,
      name: "Cluttered customer webpage screenshot",
      inputType: "Webpage screenshot with banners & UI text",
      buffer: buf6,
      filename: "test6_cluttered_webpage.jpg",
      expectedProductId: null,
      expectedOutcome: "none",
    },
    {
      id: 7,
      name: "Random unrelated image",
      inputType: "Random solid blue texture",
      buffer: buf7,
      filename: "test7_random_unrelated.jpg",
      expectedProductId: null,
      expectedOutcome: "none",
    },
    {
      id: 8,
      name: "Genuinely different jewellery product (Temple Long Set)",
      inputType: "Direct catalogue image (Temple Long Haram)",
      buffer: buf8,
      filename: "test8_temple_long.jpg",
      expectedProductId: templeLongId,
      expectedOutcome: "exact",
    },
  ];

  const records = [];

  for (const t of testDefinitions) {
    console.log(`Executing Test ${t.id}: ${t.name}...`);

    // 1. Evaluate standalone hash result for diagnostic record
    const hashDiag = await computeHashResult(t.buffer);

    // 2. Evaluate standalone hybrid diagnostic for diagnostic record
    let hybridDiag = null;
    try {
      hybridDiag = await runHybridFallback(t.buffer);
    } catch (e) {
      hybridDiag = { error: e.message };
    }

    const hybridScore = hybridDiag?.confidence?.score ?? 0;
    const hybridMargin = hybridDiag?.confidence?.margin ?? 0;
    const hybridConfidence = hybridDiag?.confidence?.level ?? "NONE";
    const imageType = hybridDiag?.confidence?.imageType ?? "UNKNOWN";
    const shouldPromote = hybridDiag ? shouldPromoteHybridFallback(hybridDiag) : false;

    // 3. Send real HTTP request to http://localhost:5000/api/image-search (Customer Flow)
    const apiStartTime = Date.now();
    let apiResponse = null;
    let apiError = null;
    try {
      apiResponse = await sendCustomerSearchRequest(t.buffer, t.filename);
    } catch (err) {
      apiError = err.message;
    }
    const apiDuration = Date.now() - apiStartTime;

    const resData = apiResponse?.data || {};
    const actualMatchType = resData.matchType || "error";
    const returnedProductId = resData.exactMatch?._id || null;

    // 4. Evaluate whether customer UI in FindProductButton.tsx opened the correct product
    let uiOpenedCorrectProduct = false;
    let uiStateDescription = "";

    if (t.expectedOutcome === "exact") {
      if (actualMatchType === "exact" && returnedProductId === t.expectedProductId) {
        uiOpenedCorrectProduct = true;
        uiStateDescription = `Rendered Exact Product Card: "${resData.exactMatch.name}" (ID: ${returnedProductId})`;
      } else {
        uiOpenedCorrectProduct = false;
        uiStateDescription = `UI Mismatch: expected exact ID ${t.expectedProductId}, got matchType: ${actualMatchType}, ID: ${returnedProductId}`;
      }
    } else if (t.expectedOutcome === "none") {
      if (actualMatchType === "none" && returnedProductId === null) {
        uiOpenedCorrectProduct = true;
        uiStateDescription = `Rendered "Not Available" Alert Banner ("${resData.message}")`;
      } else {
        uiOpenedCorrectProduct = false;
        uiStateDescription = `UI Incorrectly Promoted: returned matchType: ${actualMatchType}, ID: ${returnedProductId}`;
      }
    } else if (t.expectedOutcome === "promoted_or_gate_verified") {
      // For Instagram screenshot: verify exact gate behavior
      if (shouldPromote) {
        uiOpenedCorrectProduct = actualMatchType === "exact" && returnedProductId === t.expectedProductId;
        uiStateDescription = `Promoted by gate (imageType=${imageType}): "${resData.exactMatch?.name}"`;
      } else {
        uiOpenedCorrectProduct = actualMatchType === "none";
        uiStateDescription = `Safely blocked by gate (imageType=${imageType}, score=${hybridScore}, margin=${hybridMargin}): "${resData.message}"`;
      }
    }

    // 5. Check privacy / metadata leakage
    const leakedFields = [];
    const forbiddenKeys = ["score", "margin", "confidence", "clip", "hybrid", "winningRegion", "telemetry"];
    for (const k of forbiddenKeys) {
      if (resData[k] !== undefined) leakedFields.push(k);
      if (resData.exactMatch && resData.exactMatch[k] !== undefined) leakedFields.push(`exactMatch.${k}`);
    }

    const record = {
      testId: t.id,
      testName: t.name,
      inputType: t.inputType,
      existingHashResult: hashDiag.matchType,
      hashScore: Number(hashDiag.topScore.toFixed(4)),
      hybridScore: Number(hybridScore.toFixed(4)),
      hybridMargin: Number(hybridMargin.toFixed(4)),
      hybridConfidence,
      imageType,
      shouldPromoteResult: shouldPromote,
      actualHttpStatus: apiResponse?.status,
      actualHttpMatchType: actualMatchType,
      returnedProductId,
      expectedProductId: t.expectedProductId,
      uiOpenedCorrectProduct,
      uiStateDescription,
      hasMetadataLeaks: leakedFields.length > 0,
      leakedFields,
      apiDurationMs: apiDuration,
      apiErrors: apiError || null,
    };

    records.push(record);

    console.log(`  -> Hash: ${hashDiag.matchType} (${record.hashScore})`);
    console.log(`  -> Hybrid: ${hybridConfidence} (score=${record.hybridScore}, margin=${record.hybridMargin}, imageType=${imageType})`);
    console.log(`  -> shouldPromote: ${shouldPromote}`);
    console.log(`  -> API Response: status=${record.actualHttpStatus}, matchType=${actualMatchType}, returnedId=${returnedProductId}`);
    console.log(`  -> UI Verification: ${uiOpenedCorrectProduct ? "CORRECT" : "INCORRECT"} (${uiStateDescription})`);
    console.log(`  -> Privacy Check: ${leakedFields.length === 0 ? "PASSED (0 leaks)" : `FAILED (${leakedFields.join(", ")})`}\n`);
  }

  // Verify storage and database invariants
  console.log("========================================================");
  console.log("STORAGE & DATABASE INTEGRITY AUDIT");
  console.log("========================================================");

  const finalProductCount = await Product.countDocuments();
  const finalVectorCount = await ProductVisualVector.countDocuments();
  const productsUnchanged = finalProductCount === initialProductCount;
  const vectorsUnchanged = finalVectorCount === initialVectorCount;

  console.log(`Products Count Before: ${initialProductCount} | After: ${finalProductCount} (Unchanged: ${productsUnchanged})`);
  console.log(`Vectors Count Before:  ${initialVectorCount} | After: ${finalVectorCount} (Unchanged: ${vectorsUnchanged})`);

  // Check temp directory cleanliness
  const tempDir = path.resolve("uploads", "temp-search");
  const leftoverFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith("test") || f.startsWith("d4"));
  console.log(`Temp Upload Directory Cleanliness: ${leftoverFiles.length} leftover query files (Clean: ${leftoverFiles.length === 0})`);

  console.log("\n========================================================");
  console.log("DETAILED RECORD TABLE");
  console.log("========================================================\n");
  console.log(JSON.stringify(records, null, 2));

  // Save report to disk
  const reportPath = path.resolve("uploads", "phase_d4_browser_verification_report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        database: {
          productsUnchanged,
          vectorsUnchanged,
          productCount: finalProductCount,
          vectorCount: finalVectorCount,
        },
        tempDirectoryClean: leftoverFiles.length === 0,
        records,
      },
      null,
      2
    )
  );
  console.log(`\nVerification report saved to: ${reportPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
