import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";

import {
  sendOtpEmail,
} from "../utils/sendEmail.js";

// ======================================
// Admin Login
// ======================================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({
      email: email?.toLowerCase().trim(),
      role: "admin",
    }).select("+password");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin email",
      });
    }

    const isMatch =
      await admin.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        id: admin._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        emailVerified: admin.emailVerified,
        avatar: admin.avatar,
      },
    });
  } catch (error) {
    console.error(
      "Admin Login Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to login.",
    });
  }
};

// ======================================
// Get Current Admin Profile
// ======================================
export const getAdminProfile = async (
  req,
  res
) => {
  try {
    const admin = await User.findById(
      req.user._id
    ).select("-password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only.",
      });
    }

    return res.status(200).json({
      success: true,
      user: admin,
    });
  } catch (error) {
    console.error(
      "Get Admin Profile Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load admin profile.",
    });
  }
};

// ======================================
// Update Admin Profile
// ======================================
export const updateAdminProfile = async (
  req,
  res
) => {
  try {
    const { name, email, phone } =
      req.body;

    const admin = await User.findById(
      req.user._id
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only.",
      });
    }

    // ------------------------------
    // Name
    // ------------------------------

    if (
      typeof name === "string" &&
      name.trim()
    ) {
      admin.name = name.trim();
    }

    // ------------------------------
    // Phone
    // ------------------------------

    if (
      typeof phone === "string"
    ) {
      admin.phone = phone.trim();
    }

    // ------------------------------
    // Email
    // ------------------------------

    if (
      typeof email === "string" &&
      email.trim()
    ) {
      const normalizedEmail =
        email.toLowerCase().trim();

      if (
        normalizedEmail !==
        admin.email
      ) {
        const existingUser =
          await User.findOne({
            email: normalizedEmail,
            _id: {
              $ne: admin._id,
            },
          });

        if (existingUser) {
          return res.status(409).json({
            success: false,
            message:
              "This email is already in use.",
          });
        }

        admin.email =
          normalizedEmail;

        // Email needs verification
        admin.emailVerified = false;
      }
    }

    await admin.save();

    return res.status(200).json({
      success: true,
      message:
        "Admin profile updated successfully.",
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        emailVerified:
          admin.emailVerified,
        avatar: admin.avatar,
      },
    });
  } catch (error) {
    console.error(
      "Update Admin Profile Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update admin profile.",
    });
  }
};

// ======================================
// Change Admin Password
// ======================================
export const changeAdminPassword =
  async (req, res) => {
    try {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Current password and new password are required.",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "New password must contain at least 6 characters.",
        });
      }

      const admin =
        await User.findById(
          req.user._id
        ).select("+password");

      if (!admin) {
        return res.status(404).json({
          success: false,
          message:
            "Admin account not found.",
        });
      }

      if (admin.role !== "admin") {
        return res.status(403).json({
          success: false,
          message:
            "Admin access only.",
        });
      }

      const isMatch =
        await admin.matchPassword(
          currentPassword
        );

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message:
            "Current password is incorrect.",
        });
      }

      admin.password =
        newPassword;

      await admin.save();

      return res.status(200).json({
        success: true,
        message:
          "Password changed successfully.",
      });
    } catch (error) {
      console.error(
        "Change Admin Password Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to change password.",
      });
    }
  };
  // ======================================
// Send Admin Email Change OTP
// ======================================

export const sendAdminEmailOtp = async (
  req,
  res
) => {
  try {
    const { newEmail } = req.body;

    // ------------------------------
    // Validate email
    // ------------------------------

    if (
      !newEmail ||
      typeof newEmail !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "New email is required.",
      });
    }

    const normalizedEmail =
      newEmail.toLowerCase().trim();

    // Basic email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // ------------------------------
    // Find current admin
    // ------------------------------

    const admin =
      await User.findById(req.user._id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only.",
      });
    }

    // ------------------------------
    // Same email?
    // ------------------------------

    if (
      normalizedEmail ===
      admin.email.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This is already your current email address.",
      });
    }

    // ------------------------------
    // Check existing account
    // ------------------------------

    const existingUser =
      await User.findOne({
        email: normalizedEmail,
      });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          "This email address is already registered.",
      });
    }

    // ------------------------------
    // Generate secure OTP
    // ------------------------------

    const otp = crypto
      .randomInt(100000, 1000000)
      .toString();

    // Store HASH instead of plain OTP
    const hashedOtp =
      crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");

    // 10 minutes
    const expiry =
      new Date(
        Date.now() + 10 * 60 * 1000
      );

    // ------------------------------
    // Store pending email
    // ------------------------------

    admin.emailOtp = hashedOtp;
    admin.emailOtpExpiry = expiry;

    // Temporarily store the email
    admin.pendingEmail =
      normalizedEmail;

    await admin.save();

    // ------------------------------
    // Send email
    // ------------------------------

    const sent =
      await sendOtpEmail({
        email: normalizedEmail,
        otp,
        purpose:
          "admin-email-change",
      });

    if (!sent) {
      // Clear OTP if email failed
      admin.emailOtp = "";
      admin.emailOtpExpiry = undefined;
      admin.pendingEmail = "";
      

      await admin.save();

      return res.status(500).json({
        success: false,
        message:
          "Unable to send verification email.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Verification OTP sent to your new email address.",
      expiresIn: 600,
    });

  } catch (error) {
    console.error(
      "Send Admin Email OTP Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to send email verification OTP.",
    });
  }
};
// ======================================
// Verify Admin Email Change OTP
// ======================================

export const verifyAdminEmailOtp = async (
  req,
  res
) => {
  try {
    const { otp } = req.body;

    if (
      !otp ||
      typeof otp !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "OTP is required.",
      });
    }

    const cleanOtp = otp.trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message:
          "OTP must contain exactly 6 digits.",
      });
    }

    // ------------------------------
    // Find admin
    // ------------------------------

    const admin =
      await User.findById(req.user._id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message:
          "Admin account not found.",
      });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Admin access only.",
      });
    }

    // ------------------------------
    // Check OTP exists
    // ------------------------------

    if (
      !admin.emailOtp ||
      !admin.emailOtpExpiry ||
      !admin.pendingEmail
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No active email verification request.",
      });
    }

    // ------------------------------
    // Check expiry
    // ------------------------------

    if (
      new Date() >
      new Date(admin.emailOtpExpiry)
    ) {
      admin.emailOtp = "";
      admin.emailOtpExpiry = undefined;
      admin.pendingEmail = "";

      await admin.save();

      return res.status(400).json({
        success: false,
        message:
          "OTP has expired. Please request a new one.",
      });
    }

    // ------------------------------
    // Hash entered OTP
    // ------------------------------

    const hashedOtp =
      crypto
        .createHash("sha256")
        .update(cleanOtp)
        .digest("hex");

    // ------------------------------
    // Compare OTP
    // ------------------------------

    if (
      hashedOtp !== admin.emailOtp
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid verification code.",
      });
    }

    // ------------------------------
    // Verify email still available
    // ------------------------------

    const existingUser =
      await User.findOne({
        email: admin.pendingEmail,
        _id: {
          $ne: admin._id,
        },
      });

    if (existingUser) {
      admin.emailOtp = "";
      admin.emailOtpExpiry = undefined;
      admin.pendingEmail = "";

      await admin.save();

      return res.status(409).json({
        success: false,
        message:
          "This email address is no longer available.",
      });
    }

    // ------------------------------
    // Apply new email
    // ------------------------------

    admin.email =
      admin.pendingEmail;

    admin.emailVerified = true;

    // ------------------------------
    // Clear OTP data
    // ------------------------------

    admin.emailOtp = "";
    admin.emailOtpExpiry = undefined;
    admin.pendingEmail = "";

    await admin.save();

    return res.status(200).json({
      success: true,
      message:
        "Admin email updated successfully.",
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        emailVerified:
          admin.emailVerified,
      },
    });

  } catch (error) {
    console.error(
      "Verify Admin Email OTP Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to verify email OTP.",
    });
  }
};