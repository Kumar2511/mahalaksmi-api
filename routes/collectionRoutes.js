import express from "express";

import {
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
} from "../controllers/collectionController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Public
router.get(
  "/",
  getCollections
);

router.get(
  "/:id",
  getCollection
);

// Admin
router.post(
  "/",
  protect,
  admin,
  createCollection
);

router.put(
  "/:id",
  protect,
  admin,
  updateCollection
);

router.delete(
  "/:id",
  protect,
  admin,
  deleteCollection
);

export default router;