import express from "express";

import {
  createReview,
  getProductReviews,
  getAllReviews,
  approveReview,
  deleteReview,
  importReviews,
} from "../controllers/reviewController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================
// Customer
// ======================================

// Create Review
router.post(
  "/",
  protect,
  createReview
);

// ======================================
// Public Product Reviews
// ======================================

// Get approved reviews for a product
router.get(
  "/product/:productId",
  getProductReviews
);

// ======================================
// Admin
// ======================================

// Get All Reviews
router.get(
  "/",
  protect,
  admin,
  getAllReviews
);

// Import Historical Reviews
router.post(
  "/import",
  protect,
  admin,
  importReviews
);

// Approve Review
router.put(
  "/:id/approve",
  protect,
  admin,
  approveReview
);

// Delete Review
router.delete(
  "/:id",
  protect,
  admin,
  deleteReview
);

export default router;