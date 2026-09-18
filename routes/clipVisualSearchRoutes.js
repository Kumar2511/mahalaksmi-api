import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { performClipShadowSearch } from "../controllers/clipVisualSearchController.js";

const router = express.Router();

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ];
  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".avif",
  ];

  const extension = path.extname(file.originalname || "").toLowerCase();
  const validMime = allowedMimeTypes.includes(file.mimetype);
  const validExtension = allowedExtensions.includes(extension);

  if (!validMime || !validExtension) {
    return cb(new Error("Only JPG, PNG, WEBP, GIF, or AVIF image files are allowed."));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter,
});

// POST /api/image-search/shadow
router.post(
  "/shadow",
  upload.single("media"),
  performClipShadowSearch
);

router.use((error, _req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "Image file size must be smaller than 10MB.",
    });
  }
  return res.status(400).json({
    success: false,
    message: error.message || "Invalid image upload.",
  });
});

export default router;
