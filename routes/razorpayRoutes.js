import express from "express";

import {
  createOrder,
  verifyPayment,
} from "../controllers/razorpayController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create Razorpay order
router.post(
  "/create-order",
  protect,
  createOrder
);

// Verify completed Razorpay payment
router.post(
  "/verify-payment",
  protect,
  verifyPayment
);

export default router;