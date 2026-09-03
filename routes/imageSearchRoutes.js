import express from "express";
import multer from "multer";

import {
  findProductByImage,
  searchProductByUrl,
} from "../controllers/imageSearchController.js";

const router = express.Router();

// Temporary upload directory for temporary visual processing
const upload = multer({
  dest: "uploads/temp-search/",
});

// Find product by screenshot
router.post(
  "/",
  upload.single("media"),
  findProductByImage
);

// Find product by Instagram URL
router.post(
  "/url",
  searchProductByUrl
);

export default router;