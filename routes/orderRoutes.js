import express from "express";
import multer from "multer";

import {
  createOrder,
  getMyOrders,
  getMyOrder,
  getOrderPaymentStatus,
  cancelMyOrder,
  submitCancellationFeedback,

  // UPI
  submitUPIPaymentProof,
  submitUPIOrderAndProof,
  validateUPIPaymentProof,
  expireUPIPaymentSession,

  // Admin UPI
  approveUPIPayment,
  rejectUPIPayment,

  // Admin
  getOrders,
  getOrder,
  updateOrder,
  adminCancelOrder,
  deleteOrder,
} from "../controllers/orderController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================================
// CUSTOMER - GET ORDER PAYMENT STATUS
// ======================================================

router.get(
  "/my-orders/:id/payment-status",
  protect,
  getOrderPaymentStatus
);

// ======================================================
// MULTER CONFIGURATION
// ======================================================

const storage = multer.memoryStorage();

// ======================================================
// FILE FILTER
// ======================================================

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid image format. Please upload a JPG, PNG, or WEBP payment screenshot."
      ),
      false
    );
  }
};

// ======================================================
// UPLOAD CONFIGURATION
// ======================================================

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter,
});

// ======================================================
// CUSTOMER - CREATE ORDER
// ======================================================
//
// COD / Razorpay:
//     Creates order.
//
// UPI:
//     Starts payment session only.
//     DOES NOT create MongoDB order.
// ======================================================

router.post(
  "/",
  protect,
  createOrder
);

// ======================================================
// CUSTOMER - GET MY ORDERS
// ======================================================

router.get(
  "/my-orders",
  protect,
  getMyOrders
);

// ======================================================
// CUSTOMER - GET SINGLE ORDER
// ======================================================

router.get(
  "/my-orders/:id",
  protect,
  getMyOrder
);

// ======================================================
// CUSTOMER - CANCEL ORDER
// ======================================================

router.put(
  "/my-orders/:id/cancel",
  protect,
  cancelMyOrder
);

// ======================================================
// CUSTOMER - CANCELLATION FEEDBACK
// ======================================================

router.post(
  "/my-orders/:id/cancellation-feedback",
  protect,
  submitCancellationFeedback
);

// ======================================================
// CUSTOMER - PRE-VALIDATE UPI PAYMENT PROOF
// ======================================================
//
// IMPORTANT:
// This route ONLY checks the screenshot.
//
// It DOES NOT:
// - create order
// - reduce stock
// - use coupon
//
// ======================================================

router.post(
  "/upi/validate-proof",
  protect,
  upload.single("screenshot"),
  validateUPIPaymentProof
);

// ======================================================
// CUSTOMER - FINAL UPI ORDER + PAYMENT PROOF
// ======================================================
//
// THIS IS THE NEW MAIN UPI ROUTE.
//
// Flow:
//
// Payment screenshot
//        ↓
// Server validation
//        ↓
// Amount validation
//        ↓
// Stock validation
//        ↓
// Create final order
//        ↓
// Reduce stock
//
// ======================================================

router.post(
  "/upi/submit-proof",
  protect,
  upload.single("screenshot"),
  submitUPIOrderAndProof
);

// ======================================================
// LEGACY CUSTOMER - SUBMIT UPI PAYMENT PROOF
// ======================================================
//
// IMPORTANT:
// This route is retained for OLD UPI orders
// that were already created using the previous flow.
//
// NEW PAYMENT PAGE SHOULD NOT USE THIS ROUTE.
//
// ======================================================

router.post(
  "/my-orders/:id/upi-proof",
  protect,
  upload.single("screenshot"),
  submitUPIPaymentProof
);

// ======================================================
// CUSTOMER - EXPIRE OLD UPI PAYMENT SESSION
// ======================================================
//
// The NEW payment page will redirect to checkout
// locally after 5 minutes.
//
// This endpoint remains for old orders.
//
// ======================================================

router.put(
  "/my-orders/:id/payment-expire",
  protect,
  expireUPIPaymentSession
);

// ======================================================
// ADMIN - GET ALL ORDERS
// ======================================================

router.get(
  "/admin",
  protect,
  getOrders
);

// ======================================================
// ADMIN - GET SINGLE ORDER
// ======================================================

router.get(
  "/admin/:id",
  protect,
  getOrder
);

// ======================================================
// ADMIN - APPROVE UPI PAYMENT
// ======================================================
//
// Pending → Paid
// Pending → Confirmed
//
// ======================================================

router.put(
  "/admin/:id/upi/approve",
  protect,
  approveUPIPayment
);

// ======================================================
// ADMIN - REJECT UPI PAYMENT
// ======================================================
//
// Rejected proof:
// - Payment remains Pending
// - Order becomes Cancelled
// - Stock restored
//
// ======================================================

router.put(
  "/admin/:id/upi/reject",
  protect,
  rejectUPIPayment
);

// ======================================================
// ADMIN - CANCEL ORDER
// ======================================================

router.put(
  "/admin/:id/cancel",
  protect,
  adminCancelOrder
);

// ======================================================
// ADMIN - UPDATE ORDER
// ======================================================

router.put(
  "/admin/:id",
  protect,
  updateOrder
);

// ======================================================
// ADMIN - DELETE ORDER
// ======================================================

router.delete(
  "/admin/:id",
  protect,
  deleteOrder
);

// ======================================================
// MULTER ERROR HANDLER
// ======================================================

router.use(
  (error, req, res, next) => {
    // ------------------------------------------
    // Multer error
    // ------------------------------------------

    if (error instanceof multer.MulterError) {
      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Payment screenshot is too large. Maximum allowed size is 5 MB.",
        });
      }

      return res.status(400).json({
        success: false,

        message:
          error.message ||
          "Unable to upload payment screenshot.",
      });
    }

    // ------------------------------------------
    // Invalid image format
    // ------------------------------------------

    if (
      error?.message?.includes(
        "Invalid image format"
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          error.message,
      });
    }

    // ------------------------------------------
    // Other errors
    // ------------------------------------------

    next(error);
  }
);

export default router;