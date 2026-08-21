import express from "express";
import multer from "multer";

import {
  analyzeInstagramZipUpload,
  identifyInstagramProductController,
  importInstagramProductController,
} from "../controllers/instagramImportController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ==========================================
// MULTER
// ==========================================

const upload = multer({
  dest: "uploads/instagram-import-temp/",

  limits: {
    fileSize:
      500 * 1024 * 1024,
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {
    const isZip =
      file.mimetype ===
        "application/zip" ||
      file.mimetype ===
        "application/x-zip-compressed" ||
      file.originalname
        .toLowerCase()
        .endsWith(".zip");

    if (!isZip) {
      return cb(
        new Error(
          "Only ZIP files are allowed"
        )
      );
    }

    cb(null, true);
  },
});

// ==========================================
// ANALYZE INSTAGRAM ZIP
// ==========================================

router.post(
  "/analyze",
  protect,
  admin,
  upload.single("zip"),
  analyzeInstagramZipUpload
);

// ==========================================
// IDENTIFY INSTAGRAM PRODUCT
// ==========================================

router.post(
  "/identify",
  protect,
  admin,
  identifyInstagramProductController
);

// ==========================================
// IMPORT IDENTIFIED INSTAGRAM PRODUCT
// ==========================================

router.post(
  "/import-product",
  protect,
  admin,
  importInstagramProductController
);
export default router;
