import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import Product from "../models/Product.js";
import { identifyInstagramProduct } from "../services/instagramProductIdentifier.js";

const SESSION_ID =
  "7990d3b2-c103-44e7-a02b-67aa28dfbc97";

const SESSION_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "instagram-import",
  SESSION_ID
);

const ANALYSIS_FILE = path.join(
  SESSION_DIRECTORY,
  "analysis.json"
);

// =====================================================
// ONLY THESE 10 GROUPS
// =====================================================

const GROUP_IDS = [
  "3822326582888071119",
  "3878068218586303541",
  "3843158658377669808",
  "3858491083299319243",
  "3863565208321648835",
  "3858243303616097728",
  "3839671547124576733",
  "3837972253598903751",
  "3818521054562814590",
  "3911037588429236754",
];

// =====================================================
// HELPERS
// =====================================================

function buildImageUrl(imagePath) {
  const relativePath = path
    .relative(
      path.resolve(
        process.cwd(),
        "uploads",
        "instagram-import"
      ),
      imagePath
    )
    .replace(/\\/g, "/");

  return `/uploads/instagram-import/${relativePath}`;
}

function getImagePaths(group) {
  const imagePaths = [];

  for (const media of group.files || []) {
    if (media.type !== "image") {
      continue;
    }

    const safeRelativePath = String(
      media.zipPath || ""
    )
      .replace(/^[/\\]+/, "")
      .replace(/\.\.(\/|\\)/g, "");

    const imagePath = path.resolve(
      SESSION_DIRECTORY,
      safeRelativePath
    );

    if (
      !imagePath.startsWith(
        SESSION_DIRECTORY + path.sep
      )
    ) {
      continue;
    }

    if (!fs.existsSync(imagePath)) {
      console.warn(
        "⚠️ Image not found:",
        imagePath
      );
      continue;
    }

    imagePaths.push(imagePath);
  }

  return imagePaths;
}

function numberOrZero(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function buildProductData(ai, group, images) {
  return {
    name: ai.name,

    description:
      ai.description || "",

    category:
      ai.category ||
      group.category ||
      "Jewellery",

    collection:
      ai.collection ||
      "AI Imported",

    price:
      numberOrZero(ai.price),

    discountPrice:
      numberOrZero(ai.discountPrice),

    images,

    video:
      ai.video || "",

    colors:
      Array.isArray(ai.colors)
        ? ai.colors
        : [],

    sizes:
      Array.isArray(ai.sizes)
        ? ai.sizes
        : [],

    specifications: {
      material:
        ai.material || "",

      jewelleryType:
        ai.jewelleryType || "",

      metalPlating:
        ai.metalPlating || "",

      stone:
        ai.stone || "",

      weight:
        ai.weight || "",

      occasion:
        ai.occasion || "",

      countryOfOrigin:
        ai.countryOfOrigin ||
        "India",
    },

    stock:
      numberOrZero(ai.stock),

    featured:
      Boolean(ai.featured),

    bestSeller:
      Boolean(ai.bestSeller),

    newArrival:
      ai.newArrival !== undefined
        ? Boolean(ai.newArrival)
        : true,

    trending:
      Boolean(ai.trending),

    instagramLink:
      ai.instagramLink || "",

    reviews: [],

    numReviews: 0,

    averageRating: 0,
  };
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log("");
  console.log(
    "================================================="
  );
  console.log(
    "🚀 BATCH INSTAGRAM → GEMINI → PRODUCT IMPORT"
  );
  console.log(
    "================================================="
  );
  console.log(
    "Session:",
    SESSION_ID
  );
  console.log(
    "Groups:",
    GROUP_IDS.length
  );
  console.log("");

  if (!fs.existsSync(ANALYSIS_FILE)) {
    throw new Error(
      `analysis.json not found:\n${ANALYSIS_FILE}`
    );
  }

  // -----------------------------------------------
  // MongoDB
  // -----------------------------------------------

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGO_URI / MONGODB_URI is missing from .env"
    );
  }

  console.log(
    "🔌 Connecting to MongoDB..."
  );

  await mongoose.connect(mongoUri);

  console.log(
    "✅ MongoDB connected."
  );
  console.log("");

  // -----------------------------------------------
  // Load analysis
  // -----------------------------------------------

  const analysis = JSON.parse(
    fs.readFileSync(
      ANALYSIS_FILE,
      "utf8"
    )
  );

  if (
    !Array.isArray(
      analysis.groups
    )
  ) {
    throw new Error(
      "analysis.json does not contain a groups array."
    );
  }

  // -----------------------------------------------
  // Process groups
  // -----------------------------------------------

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (
    let index = 0;
    index < GROUP_IDS.length;
    index++
  ) {
    const groupId =
      GROUP_IDS[index];

    console.log("");
    console.log(
      "================================================="
    );
    console.log(
      `📦 GROUP ${index + 1}/${GROUP_IDS.length}`
    );
    console.log(
      `🆔 ${groupId}`
    );
    console.log(
      "================================================="
    );

    const group =
      analysis.groups.find(
        (item) =>
          String(item.groupId) ===
          String(groupId)
      );

    if (!group) {
      console.log(
        "⚠️ Group not found in analysis.json. Skipping."
      );

      skipped++;
      continue;
    }

    // ---------------------------------------------
    // Already imported?
    // ---------------------------------------------

    if (group.importedProductId) {
      console.log(
        "⏭️ Already imported:",
        group.importedProductId
      );

      skipped++;
      continue;
    }

    // ---------------------------------------------
    // Get images
    // ---------------------------------------------

    const imagePaths =
      getImagePaths(group);

    console.log(
      "🖼️ Images:",
      imagePaths.length
    );

    if (imagePaths.length === 0) {
      console.log(
        "⏭️ No usable images. Skipping."
      );

      skipped++;
      continue;
    }

    // ---------------------------------------------
    // Gemini identification
    // ---------------------------------------------

    try {
      console.log(
        "🤖 Sending images to Gemini..."
      );

      const ai =
        await identifyInstagramProduct(
          imagePaths
        );

      console.log(
        "✅ Gemini identified:"
      );

      console.log(
        "   Name:",
        ai.name
      );

      console.log(
        "   Category:",
        ai.category
      );

      console.log(
        "   Material:",
        ai.material
      );

      console.log(
        "   Jewellery Type:",
        ai.jewelleryType
      );

      console.log(
        "   Metal Plating:",
        ai.metalPlating
      );

      console.log(
        "   Stone:",
        ai.stone
      );

      // ---------------------------------------------
      // Validate name
      // ---------------------------------------------

      if (!ai.name) {
        throw new Error(
          "Gemini returned no product name."
        );
      }

      // ---------------------------------------------
      // Save AI result into analysis
      // ---------------------------------------------

      group.identifiedProduct =
        ai;

      // ---------------------------------------------
      // Build image URLs
      // ---------------------------------------------

      const images =
        imagePaths.map(
          buildImageUrl
        );

      console.log(
        "🖼️ Product image URLs:",
        images
      );

      // ---------------------------------------------
      // Duplicate by name
      // ---------------------------------------------

      const existingProduct =
        await Product.findOne({
          name: ai.name,
        });

      if (existingProduct) {
        console.log(
          "⚠️ Product already exists:"
        );

        console.log(
          "   Product ID:",
          existingProduct._id
        );

        group.importedProductId =
          String(
            existingProduct._id
          );

        fs.writeFileSync(
          ANALYSIS_FILE,
          JSON.stringify(
            analysis,
            null,
            2
          ),
          "utf8"
        );

        skipped++;
        continue;
      }

      // ---------------------------------------------
      // Create product
      // ---------------------------------------------

      const productData =
        buildProductData(
          ai,
          group,
          images
        );

      console.log(
        "🚀 Creating MongoDB product..."
      );

      console.log(
        "   Name:",
        productData.name
      );

      console.log(
        "   Price:",
        productData.price
      );

      console.log(
        "   Discount Price:",
        productData.discountPrice
      );

      console.log(
        "   Stock:",
        productData.stock
      );

      const createdProduct =
        await Product.create(
          productData
        );

      console.log(
        "🎉 PRODUCT CREATED:"
      );

      console.log(
        "   ID:",
        createdProduct._id
      );

      // ---------------------------------------------
      // Save imported product ID
      // ---------------------------------------------

      group.importedProductId =
        String(
          createdProduct._id
        );

      group.identifiedProduct =
        ai;

      fs.writeFileSync(
        ANALYSIS_FILE,
        JSON.stringify(
          analysis,
          null,
          2
        ),
        "utf8"
      );

      console.log(
        "💾 analysis.json updated."
      );

      imported++;

    } catch (error) {
      failed++;

      console.error("");
      console.error(
        "❌ GROUP FAILED:",
        groupId
      );

      console.error(
        error?.message ||
          error
      );

      console.error(
        "➡️ Continuing with next group..."
      );
    }
  }

  // -----------------------------------------------
  // Summary
  // -----------------------------------------------

  console.log("");
  console.log(
    "================================================="
  );
  console.log(
    "🏁 BATCH IMPORT COMPLETE"
  );
  console.log(
    "================================================="
  );

  console.log(
    "✅ Imported:",
    imported
  );

  console.log(
    "⏭️ Skipped:",
    skipped
  );

  console.log(
    "❌ Failed:",
    failed
  );

  console.log(
    "📦 Total:",
    GROUP_IDS.length
  );

  console.log(
    "================================================="
  );

  await mongoose.disconnect();

  console.log(
    "🔌 MongoDB disconnected."
  );
}

main().catch(
  async (error) => {
    console.error("");
    console.error(
      "💥 BATCH IMPORTER FAILED"
    );

    console.error(
      error?.message ||
        error
    );

    try {
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);