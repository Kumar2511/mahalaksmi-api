import express from "express";
import {
  createCoupon,
  getCoupons,
  getCoupon,
  updateCoupon,
  deleteCoupon,
  applyCoupon,
} from "../controllers/couponController.js";

import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();
router.post("/apply", applyCoupon);

// =============================
// Admin Routes
// =============================

// Create Coupon
router.post("/", protect, admin, createCoupon);

// Get All Coupons
router.get("/", protect, admin, getCoupons);

// Get Single Coupon
router.get("/:id", protect, admin, getCoupon);

// Update Coupon
router.put("/:id", protect, admin, updateCoupon);

// Delete Coupon
router.delete("/:id", protect, admin, deleteCoupon);

export default router;