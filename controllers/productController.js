import mongoose from "mongoose";
import Product from "../models/Product.js";
import defaultProducts from "../data/defaultProducts.js";

// ==============================
// Create Product
// ==============================
// Import Default Products
// ==============================
export const importDefaultProducts = async (req, res) => {
  try {
    let imported = 0;
    let skipped = 0;

    for (const item of defaultProducts) {
      // Skip if product already exists
      const exists = await Product.findOne({
        name: item.name,
      });

      if (exists) {
        skipped++;
        continue;
      }

      // Convert old structure → new schema
      const product = {
        name: item.name,

        description:
          item.description || "Premium Artificial Jewellery",

        category: item.category,

        collection: item.collection || "General",

        price: item.price,

        discountPrice:
          item.discountPrice ??
          item.originalPrice ??
          item.price,

        images: item.images
          ? item.images
          : item.image
          ? [item.image]
          : [],

        stock: item.stock || 0,

        featured: item.featured || false,
        bestSeller: item.bestSeller || false,
        newArrival: item.newArrival || false,
        trending: item.trending || false,

        instagramLink: item.instagramLink || "",

// ======================================
// Product Specifications
// ======================================
specifications: {
  material: item.specifications?.material || "",
  jewelleryType: item.specifications?.jewelleryType || "",
  metalPlating: item.specifications?.metalPlating || "",
  stone: item.specifications?.stone || "",
  weight: item.specifications?.weight || "",
  occasion: item.specifications?.occasion || "",
  countryOfOrigin:
    item.specifications?.countryOfOrigin || "India",
},

reviews: [],

        numReviews:
          item.numReviews ??
          item.reviews ??
          0,

        averageRating:
          item.averageRating ??
          item.rating ??
          0,
      };

      await Product.create(product);

      imported++;
    }

    res.status(200).json({
      success: true,
      imported,
      skipped,
      total: defaultProducts.length,
      message: `${imported} products imported successfully.`,
    });
  } catch (error) {
    console.error("Import Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};// ==============================
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
    const { search, category, sort } = req.query;

    const filter = {};

    // Search
    if (search) {
      filter.name = {
        $regex: search,
        $options: "i",
      };
    }

    // Category
    if (category && category !== "All") {
      filter.category = category;
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

    const product = await Product.findByIdAndUpdate(
      id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

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