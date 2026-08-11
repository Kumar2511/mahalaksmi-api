import express from "express";

import {
  createReview,
  getProductReviews,
  getAllReviews,
  approveReview,
  deleteReview,
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