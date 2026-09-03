  import User from "../models/User.js";
  import generateToken from "../utils/generateToken.js";
  import generateOTP from "../utils/generateOTP.js";
  import sendEmail from "../utils/sendEmail.js";

  // ======================================================
  // Register User - Email OTP
  // ======================================================

  export const registerUser = async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        password,
      } = req.body;

      // ==========================================
      // Basic Validation
      // ==========================================

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Please fill all required fields",
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters",
        });
      }

      // ==========================================
      // Normalize Email
      // ==========================================

      const normalizedEmail = String(email)
        .trim()
        .toLowerCase();

      // ==========================================
      // Find Existing User
      // ==========================================

      let user = await User.findOne({
        email: normalizedEmail,
      });

      // Already verified
      if (user && user.emailVerified) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      // ==========================================
      // Generate OTP
      // ==========================================

      const otp = generateOTP();

      const expiry = new Date(
        Date.now() + 10 * 60 * 1000
      );

      // ==========================================
      // Create / Update User
      // ==========================================

      if (!user) {
        user = await User.create({
          name,
          email: normalizedEmail,
          phone: phone || "",
          password,
          emailVerified: false,
          emailOtp: otp,
          emailOtpExpiry: expiry,
        });
      } else {
        user.name = name;
        user.phone = phone || "";
        user.password = password;
        user.emailOtp = otp;
        user.emailOtpExpiry = expiry;
        user.emailVerified = false;

        await user.save();
      }

      // ==========================================
      // Send OTP Email
      // ==========================================

      const emailSent = await sendEmail(
        normalizedEmail,
        otp
      );

      if (!emailSent) {
        return res.status(500).json({
          success: false,
          message:
            "Failed to send OTP email. Please try again.",
        });
      }

      // ==========================================
      // Success
      // ==========================================

      return res.status(200).json({
        success: true,
        message:
          "OTP sent successfully to your email.",
        email: normalizedEmail,
      });
    } catch (error) {
      console.error(
        "Register Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Registration failed",
      });
    }
  };

  // ======================================================
  // Login User
  // ======================================================

  export const loginUser = async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();

      // ==================================================
      // Identify which frontend is making the request
      // ==================================================

      const origin = req.headers.origin || "";

      const isAdminApp =
        origin.includes("localhost:3001");

      const isCustomerApp =
        origin.includes("localhost:3000");

      console.log(
        "\n========== LOGIN REQUEST =========="
      );

      console.log("Origin:", origin);
      console.log("Email:", normalizedEmail);
      console.log(
        "Application:",
        isAdminApp
          ? "ADMIN"
          : isCustomerApp
          ? "CUSTOMER"
          : "UNKNOWN"
      );

      // ==================================================
      // Find User
      // ==================================================

      const user = await User.findOne({
        email: normalizedEmail,
      }).select("+password");

      if (!user) {
        console.log("❌ USER NOT FOUND");

        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      console.log("✅ USER FOUND");
      console.log(
        "User ID:",
        user._id.toString()
      );
      console.log(
        "User Email:",
        user.email
      );
      console.log(
        "User Role:",
        user.role
      );

      // ==================================================
      // Verify Email
      // ==================================================

      if (!user.emailVerified) {
        console.log(
          "❌ EMAIL NOT VERIFIED"
        );

        return res.status(403).json({
          success: false,
          message:
            "Please verify your email before logging in.",
        });
      }

      // ==================================================
      // Compare Password
      // ==================================================

      const isMatch =
        await user.matchPassword(
          password
        );

      if (!isMatch) {
        console.log(
          "❌ PASSWORD DOES NOT MATCH"
        );

        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password",
        });
      }

      // ==================================================
      // APPLICATION / ROLE PROTECTION
      // ==================================================

      // Customer website cannot login as admin
      if (
        isCustomerApp &&
        user.role === "admin"
      ) {
        console.log(
          "❌ ADMIN LOGIN ATTEMPT FROM CUSTOMER APP"
        );

        return res.status(403).json({
          success: false,
          message:
            "Admin accounts can only be used in the admin portal.",
        });
      }

      // Admin website cannot login as customer
      if (
        isAdminApp &&
        user.role !== "admin"
      ) {
        console.log(
          "❌ CUSTOMER LOGIN ATTEMPT FROM ADMIN APP"
        );

        return res.status(403).json({
          success: false,
          message:
            "Only administrators can access the admin portal.",
        });
      }

      // ==================================================
      // Generate JWT
      // ==================================================

      const token =
        generateToken(user._id);

      // ==================================================
      // Choose separate cookie
      // ==================================================

      const cookieName =
        user.role === "admin"
          ? "mahalaksmi_admin_token"
          : "mahalaksmi_customer_token";

      // ==================================================
      // Set Authentication Cookie
      // ==================================================

      res.cookie(
        cookieName,
        token,
        {
          httpOnly: true,

          secure:
            process.env.NODE_ENV ===
            "production",

          sameSite:
            process.env.NODE_ENV ===
            "production"
              ? "none"
              : "lax",

          maxAge:
            7 * 24 * 60 * 60 * 1000,

          path: "/",
        }
      );

      console.log(
        "✅ Login Successful"
      );

      console.log(
        "Cookie:",
        cookieName
      );

      // ==================================================
      // Response
      // ==================================================

      return res.status(200).json({
        success: true,

        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      });

    } catch (error) {
      console.error(
        "Login Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Login failed",
      });
    }
  };

  // ======================================================
  // Get Profile
  // ======================================================

  export const getProfile = async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.user.id
        ).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        user,
      });

    } catch (error) {
      console.error(
        "Get Profile Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to load profile",
      });
    }
  };

  // ======================================================
  // Update Profile
  // ======================================================

  export const updateProfile = async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.name =
        req.body.name ||
        user.name;

      user.phone =
        req.body.phone ||
        user.phone;

      const updatedUser =
        await user.save();

      return res.status(200).json({
        success: true,
        user: updatedUser,
      });
    } catch (error) {
      console.error(
        "Update Profile Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Change Password
  // ======================================================

  export const changePassword = async (
    req,
    res
  ) => {
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
            "Current password and new password are required",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "New password must be at least 6 characters",
        });
      }

      const user =
        await User.findById(
          req.user.id
        ).select("+password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const isMatch =
        await user.matchPassword(
          currentPassword
        );

      console.log(
        "Current Password Match:",
        isMatch
      );

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message:
            "Current password is incorrect",
        });
      }

      // User model pre-save hook
      // will hash this password.
      user.password =
        newPassword;

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Password updated successfully",
      });
    } catch (error) {
      console.error(
        "Change Password Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to change password",
      });
    }
  };

  // ======================================================
  // DELETE MY ACCOUNT
  // ======================================================

  export const deleteAccount = async (
    req,
    res
  ) => {
    try {
      const { password } =
        req.body;

      // ==========================================
      // Password Required
      // ==========================================

      if (!password) {
        return res.status(400).json({
          success: false,
          message:
            "Password is required to delete your account.",
        });
      }

      // ==========================================
      // IMPORTANT
      //
      // Always identify the account using
      // authenticated user's MongoDB ID.
      //
      // DO NOT use:
      // name
      // email
      // phone
      //
      // This prevents two customers with the
      // same name from affecting each other.
      // ==========================================

      const user =
        await User.findById(
          req.user.id
        ).select("+password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "Account not found.",
        });
      }

      // ==========================================
      // Verify Current Password
      // ==========================================

      const isMatch =
        await user.matchPassword(
          password
        );

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message:
            "Incorrect password.",
        });
      }

      // ==========================================
      // Delete ONLY This Account
      // ==========================================

      await User.findByIdAndDelete(
        user._id
      );

      console.log(
        "🗑️ Account deleted:",
        user.email
      );

      // ==========================================
      // Clear Authentication Cookie
      // ==========================================

      res.clearCookie(
    "mahalaksmi_customer_token",
        {
          httpOnly: true,

          secure:
            process.env.NODE_ENV ===
            "production",

          sameSite:
            process.env.NODE_ENV ===
            "production"
              ? "none"
              : "lax",

          path: "/",
        }
      );

      // ==========================================
      // Success
      // ==========================================

      return res.status(200).json({
        success: true,
        message:
          "Your account has been deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Delete Account Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to delete account.",
      });
    }
  };

  // ======================================================
  // Add Address
  // ======================================================

  export const addAddress = async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.addresses.push({
        fullName:
          req.body.fullName,
        phone:
          req.body.phone,
        address:
          req.body.address,
        city:
          req.body.city,
        state:
          req.body.state,
        pincode:
          req.body.pincode,
        country:
          req.body.country ||
          "India",
      });

      await user.save();

      return res.status(201).json({
        success: true,
        message:
          "Address added successfully",
        addresses:
          user.addresses,
      });
    } catch (error) {
      console.error(
        "Add Address Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Get All Addresses
  // ======================================================

  export const getAddresses = async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        addresses:
          user.addresses,
      });
    } catch (error) {
      console.error(
        "Get Addresses Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Update Address
  // ======================================================

  export const updateAddress = async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const address =
        user.addresses.id(
          req.params.id
        );

      if (!address) {
        return res.status(404).json({
          success: false,
          message:
            "Address not found",
        });
      }

      address.fullName =
        req.body.fullName;

      address.phone =
        req.body.phone;

      address.address =
        req.body.address;

      address.city =
        req.body.city;

      address.state =
        req.body.state;

      address.pincode =
        req.body.pincode;

      address.country =
        req.body.country ||
        "India";

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Address updated successfully",
        addresses:
          user.addresses,
      });
    } catch (error) {
      console.error(
        "Update Address Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Delete Address
  // ======================================================

  export const deleteAddress = async (
    req,
    res
  ) => {
    try {
      const user =
        await User.findById(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.addresses =
        user.addresses.filter(
          (address) =>
            address._id.toString() !==
            req.params.id
        );

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Address deleted successfully",
        addresses:
          user.addresses,
      });
    } catch (error) {
      console.error(
        "Delete Address Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Logout User
  // ======================================================

 // ======================================================
// Logout User
// ======================================================

export const logoutUser = async (req, res) => {
  try {
    console.log("\n========== LOGOUT ==========");

    const origin = req.headers.origin || "";
    const referer = req.headers.referer || "";

    console.log("Origin:", origin);
    console.log("Referer:", referer);

    const isAdminApp =
      origin.includes("localhost:3001") ||
      referer.includes("localhost:3001");

    console.log(
      "Application:",
      isAdminApp ? "ADMIN" : "CUSTOMER"
    );

    // ==================================================
    // Cookie options must match login cookie options
    // ==================================================

    const cookieOptions = {
      httpOnly: true,

      secure:
        process.env.NODE_ENV === "production",

      sameSite:
        process.env.NODE_ENV === "production"
          ? "none"
          : "lax",

      path: "/",
    };

    // ==================================================
    // Clear BOTH cookies
    //
    // This makes logout reliable even if the request
    // does not contain Origin/Referer as expected.
    // ==================================================

    res.clearCookie(
      "mahalaksmi_admin_token",
      cookieOptions
    );

    res.clearCookie(
      "mahalaksmi_customer_token",
      cookieOptions
    );

    console.log(
      "✅ Admin token cleared"
    );

    console.log(
      "✅ Customer token cleared"
    );

    // ==================================================
    // Response
    // ==================================================

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (error) {
    console.error(
      "Logout Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Logout failed",
    });
  }
};

  // ======================================================
  // Verify Email OTP
  // ======================================================

  export const verifyEmailOTP = async (
    req,
    res
  ) => {
    try {
      const {
        email,
        otp,
      } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message:
            "Email and OTP are required",
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          message:
            "Email already verified",
        });
      }

      if (user.emailOtp !== otp) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid OTP",
        });
      }

      if (
        !user.emailOtpExpiry ||
        user.emailOtpExpiry <
          new Date()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP has expired",
        });
      }

      // ==========================================
      // Verify Email
      // ==========================================

      user.emailVerified = true;
      user.emailOtp = "";
      user.emailOtpExpiry = null;

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Email verified successfully",

        token:
          generateToken(user._id),

        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      });
    } catch (error) {
      console.error(
        "Verify OTP Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Resend Email OTP
  // ======================================================

  export const resendEmailOTP = async (
    req,
    res
  ) => {
    try {
      const { email } =
        req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message:
            "Email is required",
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          message:
            "Email already verified",
        });
      }

      const otp =
        generateOTP();

      user.emailOtp = otp;

      user.emailOtpExpiry =
        new Date(
          Date.now() +
            10 * 60 * 1000
        );

      await user.save();

      const emailSent =
        await sendEmail(
          normalizedEmail,
          otp
        );

      if (!emailSent) {
        return res.status(500).json({
          success: false,
          message:
            "Failed to send OTP email.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "OTP sent successfully",
      });
    } catch (error) {
      console.error(
        "Resend OTP Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Forgot Password - Send OTP
  // ======================================================

  export const forgotPassword = async (
    req,
    res
  ) => {
    try {
      const { email } =
        req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message:
            "Email is required",
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "No account found with this email",
        });
      }

      // ==========================================
      // Generate OTP
      // ==========================================

      const otp =
        generateOTP();

      const expiry =
        new Date(
          Date.now() +
            10 * 60 * 1000
        );

      // ==========================================
      // Save OTP
      // ==========================================

      user.emailOtp = otp;
      user.emailOtpExpiry =
        expiry;

      await user.save();

      // ==========================================
      // Send OTP
      // ==========================================

      const emailSent =
        await sendEmail(
          normalizedEmail,
          otp
        );

      if (!emailSent) {
        user.emailOtp = "";
        user.emailOtpExpiry = null;

        await user.save();

        return res.status(500).json({
          success: false,
          message:
            "Failed to send password reset OTP. Please try again.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Password reset OTP sent successfully to your email.",
        email:
          normalizedEmail,
      });
    } catch (error) {
      console.error(
        "Forgot Password Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to send password reset OTP",
      });
    }
  };

  // ======================================================
  // Verify Password Reset OTP
  // ======================================================

  export const verifyResetOTP = async (
    req,
    res
  ) => {
    try {
      const {
        email,
        otp,
      } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message:
            "Email and OTP are required",
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      if (
        user.emailOtp !== otp
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid OTP",
        });
      }

      if (
        !user.emailOtpExpiry ||
        user.emailOtpExpiry <
          new Date()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP has expired",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "OTP verified successfully",
      });
    } catch (error) {
      console.error(
        "Verify Reset OTP Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

  // ======================================================
  // Reset Password
  // ======================================================

  export const resetPassword = async (
    req,
    res
  ) => {
    try {
      const {
        email,
        newPassword,
      } = req.body;

      if (
        !email ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email and new password are required",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters",
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      // ==========================================
      // IMPORTANT:
      // Only reset when the OTP is still valid.
      // ==========================================

      if (
        !user.emailOtp ||
        !user.emailOtpExpiry ||
        user.emailOtpExpiry <
          new Date()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Password reset OTP is invalid or expired.",
        });
      }

      // ==========================================
      // Update Password
      //
      // User model pre-save hook hashes it.
      // ==========================================

      user.password =
        newPassword;

      user.emailOtp = "";
      user.emailOtpExpiry = null;

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          "Password reset successfully",
      });
    } catch (error) {
      console.error(
        "Reset Password Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to reset password",
      });
    }
  };