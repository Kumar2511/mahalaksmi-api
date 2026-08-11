import express from "express";
import { verifyEmailOTP } from "../controllers/authController.js";
import { resendEmailOTP } from "../controllers/authController.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  getProfile,
  updateProfile,
  changePassword,

 forgotPassword,
  verifyResetOTP,
  resetPassword,

  // Address APIs
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ============================
// ============================
// Public Routes
// ============================

router.post("/register", registerUser);

router.post(
  "/verify-email",
  verifyEmailOTP
);

router.post(
  "/resend-otp",
  resendEmailOTP
);

router.post("/login", loginUser);

router.post("/logout", logoutUser);

// ============================
// Forgot Password
// ============================

router.post(
  "/forgot-password",
  forgotPassword
);

router.post(
  "/verify-reset-otp",
  verifyResetOTP
);

router.post(
  "/reset-password",
  resetPassword
);
// ============================
// Protected Routes
// ============================

// Profile
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);

// Change Password
router.put("/change-password", protect, changePassword);

// ============================
// Address Management
// ============================

// Add New Address
router.put("/address", protect, addAddress);

// Get All Addresses
router.get("/addresses", protect, getAddresses);

// Update Address
router.put("/address/:id", protect, updateAddress);

// Delete Address
router.delete("/address/:id", protect, deleteAddress);

export default router;