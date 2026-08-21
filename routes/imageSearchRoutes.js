import express from "express";
import multer from "multer";

import {
  findProductByImage,
} from "../controllers/imageSearchController.js";

const router = express.Router();

// ==========================================
// Multer
// ==========================================

const upload = multer({
  dest: "uploads/",
});

// ==========================================
// Find Product By Screenshot
// ==========================================

router.post(
  "/",
  upload.single("media"),
  findProductByImage
);

export default router;