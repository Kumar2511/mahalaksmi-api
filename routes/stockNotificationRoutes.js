import express from "express";

import {
  subscribeStockNotification,
  checkStockNotification,
  getStockNotifications,
} from "../controllers/stockNotificationController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================
// Customer
// ======================================

// Subscribe for back-in-stock notification
router.post(
  "/",
  subscribeStockNotification
);

// Check whether customer is already subscribed
router.get(
  "/check",
  checkStockNotification
);

// ======================================
// Admin
// ======================================

// Get all pending notification requests
router.get(
  "/admin",
  protect,
  admin,
  getStockNotifications
);

export default router;