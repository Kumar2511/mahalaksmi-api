import express from "express";
import multer from "multer";
import {
  getShippingSettings,
  updateShippingSettings,
  checkPincode,
  addDeliveryRule,
  updateDeliveryRule,
  deleteDeliveryRule,
  importDeliveryRules,
} from "../controllers/shippingController.js";

import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ===================================
// PUBLIC
// ===================================

// Get general shipping settings
router.get("/", getShippingSettings);

// Check whether a pincode is serviceable
router.get("/check/:pincode", checkPincode);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// ===================================
// ADMIN ONLY
// ===================================

// Update general shipping settings
router.post(
  "/rules/import",
  protect,
  admin,
  upload.single("file"),
  importDeliveryRules
);
router.put(
  "/",
  protect,
  admin,
  updateShippingSettings
);

// Add delivery rule
router.post(
  "/rules",
  protect,
  admin,
  addDeliveryRule
);

// Update delivery rule
router.put(
  "/rules/:id",
  protect,
  admin,
  updateDeliveryRule
);

// Delete delivery rule
router.delete(
  "/rules/:id",
  protect,
  admin,
  deleteDeliveryRule
);

export default router;