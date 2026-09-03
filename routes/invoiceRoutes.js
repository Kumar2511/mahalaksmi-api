import express from "express";

import {
  downloadMyInvoice,
  downloadAdminInvoice,
} from "../controllers/invoiceController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";
const router = express.Router();

// ======================================
// CUSTOMER — Download Own Invoice
// ======================================

router.get(
  "/my/:orderId",
  protect,
  downloadMyInvoice
);

// ======================================
// ADMIN — Download Any Order Invoice
// ======================================

router.get(
  "/admin/:orderId",
  protect,
  downloadAdminInvoice
);

export default router;