import express from "express";

import {
  importExistingCatalog,
} from "../controllers/catalogImportController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// =====================================================
// IMPORT EXISTING CATALOG
// =====================================================

router.post(
  "/",
  protect,
  admin,
  importExistingCatalog
);

export default router;