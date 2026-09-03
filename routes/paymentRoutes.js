import express from "express";

import {
  getPaymentSettings,
  updatePaymentSettings,
  getPayments,
  getPayment,
  handlePaymentWebhook,
} from "../controllers/paymentController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ===================================
// PUBLIC WEBHOOK
// ===================================
router.post(
  "/webhook",
  handlePaymentWebhook
);

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