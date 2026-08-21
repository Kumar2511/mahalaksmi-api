import express from "express";

import {
  subscribeEmail,
  getSubscribers,
  deleteSubscriber,
} from "../controllers/subscriberController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ======================================
// CUSTOMER
// ======================================

// Subscribe to newsletter
router.post(
  "/",
  subscribeEmail
);


// ======================================
// ADMIN
// ======================================

// Get all subscribers
router.get(
  "/",
  protect,
  admin,
  getSubscribers
);


// Delete subscriber
router.delete(
  "/:id",
  protect,
  admin,
  deleteSubscriber
);

export default router;