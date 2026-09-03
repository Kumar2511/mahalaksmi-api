import fs from "fs";
import path from "path";
import dotenv from "dotenv";

import connectDB from "../../config/db.js";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Collection from "../../models/Collection.js";

dotenv.config();

// ==========================================
// CONFIG
// ==========================================

const PROJECT_ROOT = process.cwd();

const MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  "instagram-catalog-manifest.json"
);

const CATEGORY_FOLDERS = [
  "Necklaces",
  "Jewellery-Sets",
  "Chains",
  "Bracelets",
  "Earrings",
  "Rings",
  "Pendants",
  "Accessories",
];

// ==========================================
// CATEGORY NORMALIZATION
// ==========================================

const CATEGORY_MAP = {
  "Necklaces": "Necklaces",
  "Jewellery-Sets": "Jewellery Sets",
  "Chains": "Chains",
  "Bracelets": "Bracelets",
  "Earrings": "Earrings",
  "Rings": "Rings",
  "Pendants": "Pendants",
  "Accessories": "Accessories",
};

// ==========================================
// HELPERS
// ==========================================

function getAllFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const results = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      results.push(
        ...getAllFiles(fullPath)
      );
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Manifest not found:\n${MANIFEST_PATH}`
    );
  }

  const content = fs.readFileSync(
    MANIFEST_PATH,
    "utf8"
  );

  const manifest = JSON.parse(content);

  if (!Array.isArray(manifest)) {
    throw new Error(
      "Instagram catalog manifest must be an array."
    );
  }

  return manifest;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ==========================================
// BUILD CATALOG
// ==========================================

function buildCatalog() {
  const manifest = loadManifest();

  const catalog = [];

  for (const categoryFolder of CATEGORY_FOLDERS) {
    const categoryPath = path.join(
      PROJECT_ROOT,
      categoryFolder
    );

    if (!fs.existsSync(categoryPath)) {
      console.warn(
        `Category folder missing: ${categoryFolder}`
      );
      continue;
    }

    const groupDirectories = fs
      .readdirSync(categoryPath, {
        withFileTypes: true,
      })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith("group_")
      );

    for (const groupDirectory of groupDirectories) {
      const groupPath = path.join(
        categoryPath,
        groupDirectory.name
      );

      const files = getAllFiles(groupPath);

      const mediaId =
        groupDirectory.name.replace(
          /^group_/,
          ""
        );

      const manifestEntry = manifest.find(
        (item) =>
          String(item.media_id) ===
          String(mediaId)
      );

      catalog.push({
        mediaId,

        sourceCategory:
          categoryFolder,

        category:
          CATEGORY_MAP[categoryFolder] ||
          categoryFolder,

        groupDirectory:
          groupDirectory.name,

        groupPath,

        files,

        caption:
          manifestEntry?.caption ||
          manifestEntry?.caption_prefix ||
          "",

        manifestGroupNumber:
          manifestEntry?.group_number ??
          null,
      });
    }
  }

  return catalog;
}

// ==========================================
// CATEGORY IMPORT
// ==========================================

async function ensureCategories(catalog) {
  const uniqueCategories = [
    ...new Set(
      catalog.map(
        (item) => item.category
      )
    ),
  ];

  let created = 0;
  let existing = 0;

  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    " Categories"
  );
  console.log(
    "=========================================="
  );

  for (const name of uniqueCategories) {
    const slug = slugify(name);

    const found =
      await Category.findOne({
        slug,
      });

    if (found) {
      existing++;

      console.log(
        `Already exists: ${name}`
      );

      continue;
    }

    await Category.create({
      name,
      slug,
      description: "",
      image: "",
      isActive: true,
    });

    created++;

    console.log(
      `Created category: ${name}`
    );
  }

  return {
    created,
    existing,
  };
}

// ==========================================
// COLLECTION
// ==========================================

async function ensureCollection() {
  const name = "Instagram Import";
  const slug = "instagram-import";

  let collection =
    await Collection.findOne({
      slug,
    });

  if (collection) {
    return collection;
  }

  collection =
    await Collection.create({
      name,
      slug,
      description:
        "Products imported from the Instagram catalog.",
      image: "",
      isActive: true,
    });

  console.log(
    `Created collection: ${name}`
  );

  return collection;
}

// ==========================================
// PRODUCT NAME
// ==========================================

function createProductName(item) {
  if (item.caption) {
    const cleanCaption =
      String(item.caption)
        .replace(/\s+/g, " ")
        .trim();

    if (cleanCaption.length > 0) {
      return cleanCaption.slice(
        0,
        150
      );
    }
  }

  return `${item.category} Product ${item.mediaId}`;
}

// ==========================================
// PRODUCT IMPORT
// ==========================================

async function importProducts(catalog) {
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  const collection =
    await ensureCollection();

  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    " Importing Products"
  );
  console.log(
    "=========================================="
  );

  for (
    let index = 0;
    index < catalog.length;
    index++
  ) {
    const item = catalog[index];

    try {
      const productName =
        createProductName(item);

      // Prevent duplicate import
      const existing =
        await Product.findOne({
          instagramLink:
            `instagram-import:${item.mediaId}`,
        });

      if (existing) {
        skipped++;

        console.log(
          `[${index + 1}/${catalog.length}] SKIPPED | ${productName}`
        );

        continue;
      }

      const product = {
        name: productName,

        description:
          item.caption ||
          `Product imported from Instagram catalog under ${item.category}.`,

        category:
          item.category,

        collections: [collection.name],

        price: 0,

        discountPrice: 0,

        images: [],

        stock: 0,

        featured: false,

        bestSeller: false,

        newArrival: true,

        trending: false,

        instagramLink:
          `instagram-import:${item.mediaId}`,

        specifications: {
          material: "",
          jewelleryType: "",
          metalPlating: "",
          stone: "",
          weight: "",
          occasion: "",
          countryOfOrigin: "India",
        },

        reviews: [],

        numReviews: 0,

        averageRating: 0,
      };

      await Product.create(product);

      imported++;

      console.log(
        `[${index + 1}/${catalog.length}] IMPORTED | ${item.category} | ${productName}`
      );
    } catch (error) {
      failed++;

      console.error(
        `[${index + 1}/${catalog.length}] FAILED | ${item.mediaId}`,
        error.message
      );
    }
  }

  return {
    imported,
    skipped,
    failed,
  };
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    " Instagram Catalog Import"
  );
  console.log(
    "=========================================="
  );

  console.log("");
  console.log(
    "âš ï¸ PRODUCT DATA ONLY"
  );
  console.log(
    "âš ï¸ Images and videos are NOT uploaded."
  );

  console.log("");

  try {
    const catalog =
      buildCatalog();

    if (catalog.length === 0) {
      throw new Error(
        "No Instagram product groups were found."
      );
    }

    console.log(
      `Product groups found: ${catalog.length}`
    );

    // --------------------------------------
    // DATABASE
    // --------------------------------------

    await connectDB();

    console.log(
      "Connected to MongoDB"
    );

    // --------------------------------------
    // CATEGORIES
    // --------------------------------------

    const categoryResult =
      await ensureCategories(
        catalog
      );

    // --------------------------------------
    // PRODUCTS
    // --------------------------------------

    const productResult =
      await importProducts(
        catalog
      );

    // --------------------------------------
    // FINAL SUMMARY
    // --------------------------------------

    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      " IMPORT COMPLETED"
    );
    console.log(
      "=========================================="
    );

    console.log("");

    console.log(
      `Categories created : ${categoryResult.created}`
    );

    console.log(
      `Categories existing: ${categoryResult.existing}`
    );

    console.log(
      `Products imported   : ${productResult.imported}`
    );

    console.log(
      `Products skipped    : ${productResult.skipped}`
    );

    console.log(
      `Products failed     : ${productResult.failed}`
    );

    console.log("");

    console.log(
      "Images uploaded     : 0"
    );

    console.log(
      "Videos uploaded     : 0"
    );

    console.log("");

    console.log(
      "Admin can now verify/edit the imported products."
    );

    console.log("");
  } catch (error) {
    console.error("");
    console.error(
      "IMPORT FAILED:"
    );
    console.error(
      error
    );

    process.exitCode = 1;
  }
}

main();
