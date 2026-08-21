import express from "express";

import {
  getPaymentSettings,
  updatePaymentSettings,
  getPayments,
  getPayment,
} from "../controllers/paymentController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ===================================
// PAYMENT SETTINGS
// ===================================

// Public
router.get(
  "/",
  getPaymentSettings
);

// Admin
router.put(
  "/",
  protect,
  admin,
  updatePaymentSettings
);

// ===================================
// PAYMENT TRANSACTIONS
// ===================================

// Admin - all payments
router.get(
  "/transactions",
  protect,
  admin,
  getPayments
);

// Admin - single payment
router.get(
  "/transactions/:id",
  protect,
  admin,
  getPayment
);

export default router;