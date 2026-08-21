import express from "express";

import {
  getAdminAppSettings,
  updateAdminAppSettings,
} from "../controllers/adminAppSettingsController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ============================================================
// GET
// ============================================================
// Read admin application configuration.

router.get(
  "/",
  protect,
  admin,
  getAdminAppSettings
);

// ============================================================
// UPDATE
// ============================================================
// Only authenticated administrators can modify it.

router.put(
  "/",
  protect,
  admin,
  updateAdminAppSettings
);

export default router;