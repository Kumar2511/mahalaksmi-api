import express from "express";
import multer from "multer";

import { uploadMedia } from "../controllers/uploadController.js";
import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ============================================================
// MULTER
// ============================================================

const upload = multer({
  dest: "uploads/",
});

// ============================================================
// EXISTING GENERAL UPLOAD
// ============================================================
// DO NOT CHANGE THIS.
// Existing product/image functionality continues working.

router.post(
  "/",
  upload.single("media"),
  uploadMedia
);

// ============================================================
// ADMIN APP MEDIA UPLOAD
// ============================================================
// Used only for:
// - Admin App Logo
// - Admin App Icon
// - Splash Background
// - Story 1
// - Story 2
// - Story 3
//
// Authentication required.

router.post(
  "/admin",
  protect,
  admin,
  upload.single("media"),
  uploadMedia
);

export default router;