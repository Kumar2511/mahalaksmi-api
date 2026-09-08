import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

import {
  findProductByImage,
  searchProductByUrl,
} from "../controllers/imageSearchController.js";

const router = express.Router();


// ============================================================
// TEMPORARY VISUAL SEARCH UPLOAD DIRECTORY
// ============================================================

const uploadDirectory = path.resolve(
  process.cwd(),
  "uploads",
  "temp-search"
);


// Make sure the directory exists before Multer receives a file.
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}


// ============================================================
// MULTER STORAGE
// ============================================================
//
// Customer screenshots are stored temporarily.
//
// They are NOT catalogue images.
// They are NOT saved permanently.
//
// imageSearchController.js deletes the uploaded file after
// processing.
//
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(
      file.originalname || ""
    ).toLowerCase();

    const safeExtension =
      /^[a-z0-9.]+$/i.test(extension)
        ? extension
        : ".jpg";

    const uniqueName =
      `visual-search-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}${safeExtension}`;

    cb(null, uniqueName);
  },
});


// ============================================================
// FILE VALIDATION
// ============================================================

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

  const extension = path
    .extname(file.originalname || "")
    .toLowerCase();

  const validMime =
    allowedMimeTypes.includes(
      file.mimetype
    );

  const validExtension =
    allowedExtensions.includes(
      extension
    );

  if (!validMime || !validExtension) {
    return cb(
      new Error(
        "Only JPG, PNG, WEBP, GIF, or AVIF image files are allowed."
      )
    );
  }

  cb(null, true);
};


// ============================================================
// UPLOAD CONFIGURATION
// ============================================================

const upload = multer({
  storage,

  limits: {
    // Maximum 10MB.
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter,
});


// ============================================================
// SCREENSHOT / VISUAL SEARCH
// ============================================================

router.post(
  "/",
  upload.single("media"),
  findProductByImage
);


// ============================================================
// INSTAGRAM URL SEARCH
// ============================================================

router.post(
  "/url",
  searchProductByUrl
);


// ============================================================
// MULTER ERROR HANDLER
// ============================================================
//
// Converts upload errors into a clean response instead of
// exposing an Express/Multer stack trace to the customer.
//
router.use((error, _req, res, next) => {
  if (!error) {
    return next();
  }

  if (
    error instanceof multer.MulterError
  ) {
    if (
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        exactMatch: null,
        matches: [],
        message:
          "Image file size must be smaller than 10MB.",
      });
    }

    return res.status(400).json({
      success: false,
      matchType: "none",
      exactMatch: null,
      matches: [],
      message:
        "Please upload a valid product screenshot.",
    });
  }

  if (
    error.message &&
    error.message.includes(
      "Only JPG"
    )
  ) {
    return res.status(400).json({
      success: false,
      matchType: "none",
      exactMatch: null,
      matches: [],
      message:
        "Please upload a valid product screenshot (JPG, PNG, WEBP, GIF, or AVIF).",
    });
  }

  console.error(
    "Visual search upload error:",
    error
  );

  return res.status(400).json({
    success: false,
    matchType: "none",
    exactMatch: null,
    matches: [],
    message:
      "Please upload the actual product image or screenshot.",
  });
});


export default router;