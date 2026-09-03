import mongoose from "mongoose";
import Product from "../models/Product.js";
import { processProductRestockNotifications } from "./stockNotificationController.js";

// ==============================
// Create Product
// ==============================
// Import Default Products
// ==============================
// ==============================
// ===========================
// Featured Products
// ===========================
export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({
      featured: true,
    });

    res.json({
      success: true,
      products,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ===========================
// Best Sellers
// ===========================
export const getBestSellerProducts = async (req, res) => {
  try {
    const products = await Product.find({
      bestSeller: true,
    });

    res.json({
      success: true,
      products,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ===========================
// New Arrivals
// ===========================
export const getNewArrivalProducts = async (req, res) => {
  try {
    const products = await Product.find({
      newArrival: true,
    });

    res.json({
      success: true,
      products,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ===========================
// Trending Products
// ===========================
export const getTrendingProducts = async (req, res) => {
  try {
    const products = await Product.find({
      trending: true,
    });

    res.json({
      success: true,
      products,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};
export const createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Create Product Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// Get All Products
// ==============================
export const getProducts = async (req, res) => {
  try {
    const { search, category, collection, sort } = req.query;

    const filter = {};

    // Search
    if (search) {
      filter.name = {
        $regex: search,
        $options: "i",
      };
    }

    // Category
    if (category && category !== "All" && category !== "All Products") {
      const escCategory = category.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      filter.category = { $regex: new RegExp(`^${escCategory}$`, "i") };
    }

    // Collection
    if (collection && collection !== "All") {
      const escCollection = collection.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      filter.collections = { $in: [new RegExp(`^${escCollection}$`, "i")] };
    }

    let query = Product.find(filter);

    // Sorting
    switch (sort) {
      case "low-high":
        query = query.sort({ discountPrice: 1 });
        break;

      case "high-low":
        query = query.sort({ discountPrice: -1 });
        break;

      case "featured":
        query = query.sort({ featured: -1 });
        break;

      default:
        query = query.sort({ createdAt: -1 });
    }

    const products = await query;

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// Get Single Product
// ==============================
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get Product Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// ==============================
// Update Product
// ==============================
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    // Fetch existing product to inspect previous stock level
    const existingProduct = await Product.findById(id);

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const oldStock = Number(existingProduct.stock || 0);

    const product = await Product.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    const newStock = Number(product.stock || 0);

    // Detect actual restock transition: oldStock <= 0 -> newStock > 0
    if (oldStock <= 0 && newStock > 0) {
      processProductRestockNotifications(product._id, product).catch((err) => {
        console.error("Restock Notification Dispatch Error:", err);
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Update Product Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// Delete Product
// ==============================
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete Product Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ==============================
// Get Related Products
// ==============================
export const getRelatedProducts = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Product ID",
      });
    }

    // Current Product
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Related Products (Same Category)
    const relatedProducts = await Product.find({
      _id: { $ne: id },
      category: product.category,
    })
      .limit(4)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      products: relatedProducts,
    });
  } catch (error) {
    console.error("Related Products Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==============================
// Import AI Preview Products
// ==============================
export const importAiPreviewProducts = async (req, res) => {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    const previewPath = path.resolve(
      process.cwd(),
      "data",
      "instagram-ai-preview.json"
    );

    const previewRaw =
      await fs.readFile(previewPath, "utf8");

    const preview = JSON.parse(previewRaw);

    const results = Array.isArray(preview.results)
      ? preview.results
      : [];

    // ==========================================
    // TEST MODE
    // Import ONLY the first successful product
    // ==========================================

    const result = results.find(
      (item) =>
        item?.success === true &&
        item?.imported === false
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message:
          "No successful AI preview product is available for import.",
      });
    }

    const ai = result.product || {};

    if (!ai.name || !ai.category) {
      return res.status(400).json({
        success: false,
        message:
          "AI product is missing required name or category.",
      });
    }

    // ==========================================
    // Duplicate Protection
    // ==========================================

    const existingProduct =
      await Product.findOne({
        name: ai.name,
      });

    if (existingProduct) {
      return res.status(409).json({
        success: false,
        message:
          "A product with this name already exists.",
        product: existingProduct,
      });
    }

    // ==========================================
    // Convert AI image path
    // ==========================================

    const images = [];

    const mediaUploadPrefix =
      "uploads/instagram-import/";

    for (const imagePath of result.images || []) {
      const normalized =
        String(imagePath)
          .replace(/\\/g, "/")
          .replace(/^\/+/, "");

      /*
       * The preview JSON contains the catalog-relative
       * path. Locate the matching file inside the
       * instagram-import uploads directory.
       */

      const uploadsRoot = path.resolve(
        process.cwd(),
        "uploads",
        "instagram-import"
      );

      let foundImage = null;

      async function findFile(
        directory
      ) {
        let entries;

        try {
          entries =
            await fs.readdir(
              directory,
              {
                withFileTypes: true,
              }
            );
        } catch {
          return null;
        }

        for (const entry of entries) {
          const fullPath =
            path.join(
              directory,
              entry.name
            );

          if (entry.isDirectory()) {
            const found =
              await findFile(
                fullPath
              );

            if (found) {
              return found;
            }
          }

          if (
            entry.isFile() &&
            entry.name ===
              path.basename(
                normalized
              )
          ) {
            return fullPath;
          }
        }

        return null;
      }

      foundImage =
        await findFile(
          uploadsRoot
        );

      if (foundImage) {
        const relativeUpload =
          path
            .relative(
              path.resolve(
                process.cwd()
              ),
              foundImage
            )
            .replace(/\\/g, "/");

        images.push(
          `/${relativeUpload}`
        );
      }
    }

    // ==========================================
    // Create Product
    // ==========================================

    const productData = {
      name: ai.name,

      description:
        ai.description || "",

      category:
        ai.category ||
        result.category ||
        "Jewellery",

      collections: [],

      // Admin-controlled values
      price: 0,

      discountPrice: 0,

      images,

      video: "",

      colors: [],

      sizes: [],

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

      stock: 0,

      featured: false,

      bestSeller: false,

      newArrival: true,

      trending: false,

      instagramLink: "",

      reviews: [],

      numReviews: 0,

      averageRating: 0,
    };

    const createdProduct =
      await Product.create(
        productData
      );

    // ==========================================
    // Mark AI result as imported
    // ==========================================

    const resultIndex =
      results.findIndex(
        (item) =>
          String(
            item.mediaId
          ) ===
          String(
            result.mediaId
          )
      );

    if (resultIndex >= 0) {
      results[
        resultIndex
      ].imported = true;

      results[
        resultIndex
      ].productId =
        String(
          createdProduct._id
        );
    }

    await fs.writeFile(
      previewPath,
      JSON.stringify(
        {
          ...preview,
          results,
        },
        null,
        2
      ),
      "utf8"
    );

    return res.status(201).json({
      success: true,

      message:
        "AI product imported successfully.",

      product:
        createdProduct,

      aiConfidence:
        ai.confidence ?? null,

      mediaId:
        result.mediaId,
    });
  } catch (error) {
    console.error(
      "AI Preview Import Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Failed to import AI preview product.",
    });
  }
};