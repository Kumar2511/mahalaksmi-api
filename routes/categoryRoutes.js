import express from "express";

import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.get(
  "/",
  getCategories
);

router.get(
  "/:id",
  getCategory
);

// Admin
router.post(
  "/",
  protect,
  admin,
  createCategory
);

router.put(
  "/:id",
  protect,
  admin,
  updateCategory
);

router.delete(
  "/:id",
  protect,
  admin,
  deleteCategory
);

export default router;