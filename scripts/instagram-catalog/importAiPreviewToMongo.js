import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";

import Product from "../../models/Product.js";

// ==========================================
// CONFIG
// ==========================================

const PROJECT_ROOT = process.cwd();

dotenv.config({
  path: path.join(PROJECT_ROOT, ".env"),
});

const PREVIEW_FILE = path.join(
  PROJECT_ROOT,
  "data",
  "instagram-ai-preview.json"
);

// ==========================================
// HELPERS
// ==========================================

function normalizeCategory(category) {
  const value = String(category || "").trim();

  const map = {
    "Jewellery-Sets": "Jewellery Sets",
    "Jewellery Sets": "Jewellery Sets",
    Necklaces: "Necklaces",
    Earrings: "Earrings",
    Rings: "Rings",
    Bracelets: "Bracelets",
    Bangles: "Bangles",
    Pendants: "Pendants",
    Chains: "Chains",
    Anklets: "Anklets",
    "Maang Tikka": "Maang Tikka",
    Other: "Other",
  };

  return map[value] || value || "Other";
}

function cleanString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function loadPreview() {
  if (!fs.existsSync(PREVIEW_FILE)) {
    throw new Error(
      `AI preview file not found:\n${PREVIEW_FILE}`
    );
  }

  const raw = fs.readFileSync(
    PREVIEW_FILE,
    "utf8"
  );

  const preview = JSON.parse(raw);

  if (!Array.isArray(preview.results)) {
    throw new Error(
      "AI preview does not contain a valid results array."
    );
  }

  return preview;
}

// ==========================================
// BUILD PRODUCT
// ==========================================

function buildProduct(item) {
  const ai = item.product || {};

  const name =
    cleanString(ai.name) ||
    "Instagram Imported Product";

  const category = normalizeCategory(
    ai.category || item.category
  );

  /*
   * IMPORTANT:
   * We are NOT inventing product prices.
   *
   * AI preview currently does not contain
   * reliable pricing information.
   *
   * Therefore imported products start at 0
   * and can be edited from Admin Dashboard.
   */

  const price =
    typeof ai.price === "number"
      ? ai.price
      : 0;

  const discountPrice =
    typeof ai.discountPrice === "number"
      ? ai.discountPrice
      : 0;

  return {
    name,

    description:
      cleanString(ai.description),

    category,

    collections: [],

    price,

    discountPrice,

    images: [],

    video: "",

    colors:
      cleanArray(ai.colors),

    sizes:
      cleanArray(ai.sizes),

    specifications: {
      material:
        cleanString(ai.material),

      jewelleryType:
        cleanString(ai.jewelleryType),

      metalPlating:
        cleanString(ai.metalPlating),

      stone:
        cleanString(ai.stone),

      weight:
        cleanString(ai.weight),

      occasion:
        cleanString(ai.occasion),

      countryOfOrigin:
        cleanString(
          ai.countryOfOrigin
        ) || "India",
    },

    stock:
      typeof ai.stock === "number"
        ? ai.stock
        : 0,

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
      cleanString(ai.instagramLink),

    reviews: [],

    numReviews: 0,

    averageRating: 0,
  };
}

// ==========================================
// MAIN IMPORT
// ==========================================

async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" Instagram AI → MongoDB Import");
  console.log("==========================================");
  console.log("");

  // ----------------------------------------
  // Check MongoDB configuration
  // ----------------------------------------

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MongoDB connection string not found in .env.\nExpected MONGO_URI or MONGODB_URI."
    );
  }

  // ----------------------------------------
  // Load preview
  // ----------------------------------------

  const preview = loadPreview();

  const successfulResults =
    preview.results.filter(
      (item) =>
        item.success === true &&
        item.product
    );

  console.log(
    "Preview file:",
    PREVIEW_FILE
  );

  console.log(
    "Successful AI products:",
    successfulResults.length
  );

  console.log("");

  if (successfulResults.length === 0) {
    console.log(
      "No successful products available for import."
    );

    return;
  }

  // ----------------------------------------
  // Connect MongoDB
  // ----------------------------------------

  console.log(
    "Connecting to MongoDB..."
  );

  await mongoose.connect(
    mongoUri
  );

  console.log(
    "MongoDB connected."
  );

  console.log("");

  // ----------------------------------------
  // Import
  // ----------------------------------------

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (
    let index = 0;
    index < successfulResults.length;
    index++
  ) {
    const item =
      successfulResults[index];

    const mediaId =
      cleanString(item.mediaId);

    console.log(
      "------------------------------------------"
    );

    console.log(
      `Product ${index + 1}/${successfulResults.length}`
    );

    console.log(
      "Media ID:",
      mediaId
    );

    try {
      const productData =
        buildProduct(item);

      /*
       * Current Product schema does not yet
       * have instagramMediaId.
       *
       * For now we use a combination of
       * name + collection to reduce the
       * possibility of accidental duplicates.
       *
       * We will add a permanent mediaId field
       * after this first import is verified.
       */

      const existing =
  await Product.findOne({
    name: productData.name,
    collections: {
      $exists: true,
    },
  });

      if (existing) {
        console.log(
          "SKIPPED — product already exists"
        );

        console.log(
          "MongoDB ID:",
          existing._id.toString()
        );

        skipped++;

        continue;
      }

      const product =
        await Product.create(
          productData
        );

      created++;

      console.log(
        "CREATED"
      );

      console.log(
        "MongoDB ID:",
        product._id.toString()
      );

      console.log(
        "Name:",
        product.name
      );

      console.log(
        "Category:",
        product.category
      );

      console.log(
        "Price:",
        product.price
      );
    } catch (error) {
      failed++;

      console.error(
        "FAILED"
      );

      console.error(
        error.message
      );
    }
  }

  // ----------------------------------------
  // Final summary
  // ----------------------------------------

  console.log("");
  console.log("==========================================");
  console.log(" IMPORT COMPLETE");
  console.log("==========================================");
  console.log("");

  console.log(
    "Successful AI products:",
    successfulResults.length
  );

  console.log(
    "Created:",
    created
  );

  console.log(
    "Skipped:",
    skipped
  );

  console.log(
    "Failed:",
    failed
  );

  console.log("");

  console.log(
    "Images uploaded:",
    0
  );

  console.log(
    "Videos uploaded:",
    0
  );

  console.log("");

  console.log(
    "Products are now available for Admin Dashboard verification."
  );

  console.log("");

  await mongoose.disconnect();

  console.log(
    "MongoDB connection closed."
  );
}

main().catch(
  async (error) => {
    console.error("");
    console.error(
      "IMPORT ERROR"
    );
    console.error(
      error.message
    );
    console.error("");

    try {
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);