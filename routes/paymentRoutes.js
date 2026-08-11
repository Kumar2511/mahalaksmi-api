import express from "express";

import {
  getPaymentSettings,
  updatePaymentSettings,
} from "../controllers/paymentController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.get("/", getPaymentSettings);

// Admin Only
router.put("/", protect, admin, updatePaymentSettings);

export default router;