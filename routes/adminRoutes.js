import express from "express";

import {
  login,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  sendAdminEmailOtp,
  verifyAdminEmailOtp,
} from "../controllers/adminController.js";

import {
  protect,
  admin,
} from "../middleware/authMiddleware.js";

const router =
  express.Router();

// ======================================
// Public
// ======================================

router.post(
  "/login",
  login
);

// ======================================
// Protected Admin Routes
// ======================================

router.get(
  "/profile",
  protect,
  admin,
  getAdminProfile
);

router.put(
  "/profile",
  protect,
  admin,
  updateAdminProfile
);

router.put(
  "/password",
  protect,
  admin,
  changeAdminPassword
);

router.post(
  "/email/send-otp",
  protect,
  admin,
  sendAdminEmailOtp
);

router.post(
  "/email/verify-otp",
  protect,
  admin,
  verifyAdminEmailOtp
);

export default router;