import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Collection from "../../models/Collection.js";

const PROJECT_ROOT = process.cwd();

dotenv.config({
  path: path.join(PROJECT_ROOT, ".env"),
});

// ==========================================
// CUSTOMER-FACING CATEGORIES
// ==========================================

const CATEGORIES = [
  {
    name: "Necklaces",
    description: "Elegant necklaces for everyday, traditional and special occasions.",
  },
  {
    name: "Jewellery Sets",
    description: "Matching jewellery sets featuring coordinated pieces.",
  },
  {
    name: "Earrings",
    description: "Elegant earrings for everyday and special occasions.",
  },
  {
    name: "Rings",
    description: "Stylish rings for everyday and special occasions.",
  },
  {
    name: "Chains",
    description: "Elegant chains in a variety of styles.",
  },
  {
    name: "Bracelets",
    description: "Stylish bracelets for everyday and festive looks.",
  },
  {
    name: "Bangles",
    description: "Traditional and contemporary bangles.",
  },
  {
    name: "Pendants",
    description: "Elegant pendants and pendant designs.",
  },
  {
    name: "Anklets",
    description: "Traditional and contemporary anklets.",
  },
  {
    name: "Maang Tikka",
    description: "Traditional maang tikka jewellery for festive and bridal looks.",
  },
  {
    name: "Accessories",
    description: "Jewellery accessories and complementary pieces.",
  },
];

// ==========================================
// CUSTOMER-FACING COLLECTIONS
// ==========================================

const COLLECTIONS = [
  {
    name: "New Arrivals",
    description: "Our latest jewellery additions.",
  },
  {
    name: "Best Sellers",
    description: "Popular jewellery loved by our customers.",
  },
  {
    name: "Bridal Collection",
    description: "Elegant jewellery for bridal and wedding occasions.",
  },
  {
    name: "Temple Jewellery",
    description: "Traditional temple-inspired jewellery designs.",
  },
  {
    name: "Traditional Collection",
    description: "Classic Indian-inspired jewellery designs.",
  },
  {
    name: "Festive Collection",
    description: "Jewellery perfect for festive occasions and celebrations.",
  },
  {
    name: "Daily Wear",
    description: "Elegant jewellery suitable for everyday styling.",
  },
  {
    name: "Party Wear",
    description: "Statement jewellery for parties and special occasions.",
  },
  {
    name: "Minimalist Collection",
    description: "Simple and elegant jewellery designs.",
  },
  {
    name: "Pearl Collection",
    description: "Jewellery featuring elegant pearl designs.",
  },
  {
    name: "Kundan Collection",
    description: "Jewellery featuring Kundan-inspired designs.",
  },
  {
    name: "CZ Collection",
    description: "Jewellery featuring sparkling CZ stone designs.",
  },
];

// ==========================================
// HELPERS
// ==========================================

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(value) {
  const category = String(value || "").trim();

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
    Accessories: "Accessories",
  };

  return map[category] || category;
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" Jewellery Catalog Organizer");
  console.log("==========================================");
  console.log("");

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGO_URI or MONGODB_URI not found in .env"
    );
  }

  console.log("Connecting to MongoDB...");

  await mongoose.connect(mongoUri);

  console.log("MongoDB connected.");
  console.log("");

  // ========================================
  // PRODUCTS
  // ========================================

  const products = await Product.find({});

  console.log(
    "Total products:",
    products.length
  );

  console.log("");

  // ========================================
  // CATEGORY ANALYSIS
  // ========================================

  const categoryCounts = {};

  for (const product of products) {
    const category =
      normalizeCategory(product.category);

    categoryCounts[category] =
      (categoryCounts[category] || 0) + 1;
  }

  console.log("==========================================");
  console.log(" Category Analysis");
  console.log("==========================================");
  console.log("");

  console.table(categoryCounts);

  // ========================================
  // COLLECTION ANALYSIS
  // ========================================

  const collectionCounts = {};

  for (const product of products) {
    const collection =
      String(product.collection || "").trim();

    collectionCounts[collection || "EMPTY"] =
      (collectionCounts[collection || "EMPTY"] || 0) + 1;
  }

  console.log("");
  console.log("==========================================");
  console.log(" Existing Collection Values");
  console.log("==========================================");
  console.log("");

  console.table(collectionCounts);

  // ========================================
  // PREVIEW CATEGORY CHANGES
  // ========================================

  let categoryChanges = 0;

  console.log("");
  console.log("==========================================");
  console.log(" Category Normalization Preview");
  console.log("==========================================");
  console.log("");

  for (const product of products) {
    const oldCategory =
      String(product.category || "").trim();

    const newCategory =
      normalizeCategory(oldCategory);

    if (oldCategory !== newCategory) {
      categoryChanges++;

      console.log(
        `${product.name}`
      );

      console.log(
        `  ${oldCategory} → ${newCategory}`
      );

      console.log("");
    }
  }

  if (categoryChanges === 0) {
    console.log(
      "No category normalization required."
    );
  }

  // ========================================
  // AVAILABLE CATEGORIES
  // ========================================

  console.log("");
  console.log("==========================================");
  console.log(" Customer Categories");
  console.log("==========================================");
  console.log("");

  for (const category of CATEGORIES) {
    console.log(
      `${category.name} → ${slugify(category.name)}`
    );
  }

  // ========================================
  // AVAILABLE COLLECTIONS
  // ========================================

  console.log("");
  console.log("==========================================");
  console.log(" Customer Collections");
  console.log("==========================================");
  console.log("");

  for (const collection of COLLECTIONS) {
    console.log(
      `${collection.name} → ${slugify(collection.name)}`
    );
  }

  // ========================================
  // IMPORTANT
  // ========================================

  console.log("");
  console.log("==========================================");
  console.log(" DRY RUN");
  console.log("==========================================");
  console.log("");

  console.log(
    "No products were modified."
  );

  console.log(
    "No categories were created."
  );

  console.log(
    "No collections were created."
  );

  console.log(
    "No existing data was deleted."
  );

  console.log("");

  await mongoose.disconnect();

  console.log(
    "MongoDB connection closed."
  );
}

main().catch(async (error) => {
  console.error("");
  console.error("CATALOG ORGANIZER ERROR");
  console.error(error.message);

  try {
    await mongoose.disconnect();
  } catch {}

  process.exit(1);
});