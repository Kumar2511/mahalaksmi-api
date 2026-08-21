import express from "express";

import {
  getCustomers,
  getCustomer,
  deleteCustomer,
} from "../controllers/customerController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================================
// ADMIN CUSTOMER ROUTES
// ======================================================

// Get all customers
router.get(
  "/",
  protect,
  admin,
  getCustomers
);

// Get single customer by phone
router.get(
  "/:phone",
  protect,
  admin,
  getCustomer
);

// ======================================================
// TEMPORARY — DELETE CUSTOMER
// ======================================================

// Delete customer + all their orders
router.delete(
  "/:id",
  protect,
  admin,
  deleteCustomer
);

export default router;