import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Collection from "../models/Collection.js";

// =====================================================
// IMPORT EXISTING PRODUCT CATEGORIES & COLLECTIONS
// =====================================================

export const importExistingCatalog = async (req, res) => {
  try {
    // Get existing products
    // IMPORTANT:
    // Product collections are now stored in `collections` array.
    const products = await Product.find({})
      .select("category collections")
      .lean();

    const categoryNames = new Set();
    const collectionNames = new Set();

    // =================================================
    // COLLECT EXISTING CATEGORY / COLLECTION VALUES
    // =================================================

    products.forEach((product) => {
      // Category
      if (
        typeof product.category === "string" &&
        product.category.trim()
      ) {
        categoryNames.add(product.category.trim());
      }

      // Collections
      if (Array.isArray(product.collections)) {
        product.collections.forEach((collection) => {
          if (
            typeof collection === "string" &&
            collection.trim()
          ) {
            collectionNames.add(collection.trim());
          }
        });
      }
    });

    let importedCategories = 0;
    let existingCategories = 0;

    let importedCollections = 0;
    let existingCollections = 0;

    // =================================================
    // IMPORT CATEGORIES
    // =================================================

    for (const name of categoryNames) {
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const existing = await Category.findOne({
        $or: [{ slug }, { name }],
      });

      if (existing) {
        existingCategories++;
        continue;
      }

      await Category.create({
        name,
        slug,
        description: "",
        image: "",
        isActive: true,
      });

      importedCategories++;
    }

    // =================================================
    // IMPORT COLLECTIONS
    // =================================================

    for (const name of collectionNames) {
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const existing = await Collection.findOne({
        $or: [{ slug }, { name }],
      });

      if (existing) {
        existingCollections++;
        continue;
      }

      await Collection.create({
        name,
        slug,
        description: "",
        image: "",
        isActive: true,
      });

      importedCollections++;
    }

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      success: true,

      message: "Existing catalog imported successfully.",

      productsScanned: products.length,

      categories: {
        found: categoryNames.size,
        imported: importedCategories,
        alreadyExists: existingCategories,
      },

      collections: {
        found: collectionNames.size,
        imported: importedCollections,
        alreadyExists: existingCollections,
      },
    });
  } catch (error) {
    console.error("Catalog Import Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to import existing catalog.",
      error: error.message,
    });
  }
};