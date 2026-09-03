import express from "express";

import {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  importAiPreviewProducts,
  getFeaturedProducts,
  getBestSellerProducts,
  getNewArrivalProducts,
  getTrendingProducts,
  getRelatedProducts,
} from "../controllers/productController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ========================================
// Public Product Routes
// ========================================

router.get("/", getProducts);

router.get("/featured", getFeaturedProducts);

router.get("/best-sellers", getBestSellerProducts);

router.get("/new-arrivals", getNewArrivalProducts);

router.get("/trending", getTrendingProducts);

router.get("/related/:id", getRelatedProducts);

router.get("/:id", getProduct);

// ========================================
// Admin Product Routes
// ========================================

// Create Product
router.post(
  "/",
  protect,
  admin,
  createProduct
);


// ========================================
// Import AI Preview Products
// ========================================

router.post(
  "/import-ai-preview",
  protect,
  admin,
  importAiPreviewProducts
);

// Update Product
router.put(
  "/:id",
  protect,
  admin,
  updateProduct
);

// Delete Product
router.delete(
  "/:id",
  protect,
  admin,
  deleteProduct
);

export default router;