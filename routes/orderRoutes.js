import express from "express";

import {
  createOrder,
  getMyOrders,
  getMyOrder,
  cancelMyOrder,
  adminCancelOrder,
  submitCancellationFeedback,

  // UPI Payment
  submitUPIPaymentProof,
  approveUPIPayment,
  rejectUPIPayment,

  // Admin Orders
  getOrders,
  getOrder,
  updateOrder,
  deleteOrder,
} from "../controllers/orderController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================
// CUSTOMER ROUTES
// ======================================

// Place Order
router.post(
  "/",
  protect,
  createOrder
);

// Get Logged-in User Orders
router.get(
  "/my-orders",
  protect,
  getMyOrders
);

// Get Single Order - Customer
router.get(
  "/my-orders/:id",
  protect,
  getMyOrder
);

// Cancel Order - Customer
router.put(
  "/my-orders/:id/cancel",
  protect,
  cancelMyOrder
);

// ======================================
// Cancellation Feedback
// ======================================

router.post(
  "/my-orders/:id/cancellation-feedback",
  protect,
  submitCancellationFeedback
);

// ======================================
// UPI PAYMENT
// ======================================

// Customer submits UPI screenshot
router.post(
  "/my-orders/:id/upi-proof",
  protect,
  submitUPIPaymentProof
);

// ======================================
// ADMIN ROUTES
// ======================================

// Get All Orders
router.get(
  "/",
  protect,
  admin,
  getOrders
);

// Admin Cancel Order
router.post(
  "/:id/cancel",
  protect,
  admin,
  adminCancelOrder
);

// Get Single Order - Admin
router.get(
  "/:id",
  protect,
  admin,
  getOrder
);

// Update Order
router.put(
  "/:id",
  protect,
  admin,
  updateOrder
);

// Delete Order
router.delete(
  "/:id",
  protect,
  admin,
  deleteOrder
);
// ======================================
// ADMIN UPI PAYMENT VERIFICATION
// ======================================

// Approve UPI payment
router.put(
  "/:id/upi/approve",
  protect,
  admin,
  approveUPIPayment
);

// Reject UPI payment
router.put(
  "/:id/upi/reject",
  protect,
  admin,
  rejectUPIPayment
);

export default router;