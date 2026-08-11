import express from "express";

import {
  getUPISettings,
  updateUPISettings,
} from "../controllers/upiController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================
// Customer
// ======================================

router.get(
  "/",
  getUPISettings
);

// ======================================
// Admin
// ======================================

router.put(
  "/",
  protect,
  admin,
  updateUPISettings
);

export default router;