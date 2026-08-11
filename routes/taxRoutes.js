import express from "express";

import {
  getTaxSettings,
  updateTaxSettings,
} from "../controllers/taxController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.get("/", getTaxSettings);

// Admin
router.put("/", protect, admin, updateTaxSettings);

export default router;