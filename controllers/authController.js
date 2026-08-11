import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";
import generateOTP from "../utils/generateOTP.js";
import sendEmail from "../utils/sendEmail.js";
import crypto from "crypto";  
// =============================
// =============================
// =============================
// Register User (Email OTP)
// =============================
export const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
    } = req.body;

    // =============================
    // Basic Validation
    // =============================

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Please fill all required fields",
      });
    }

    // =============================
    // Find Existing User
    // =============================

    let user = await User.findOne({
      email,
    });

    // Already verified
    if (user && user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // =============================
    // Generate OTP
    // =============================

    const otp = generateOTP();

    const expiry = new Date(
      Date.now() + 10 * 60 * 1000
    );

    // =============================
    // Create / Update User
    // =============================

    if (!user) {
      user = await User.create({
        name,
        email,
        phone,
        password,
        emailVerified: false,
        emailOtp: otp,
        emailOtpExpiry: expiry,
      });
    } else {
      user.name = name;
      user.phone = phone;
      user.password = password;
      user.emailOtp = otp;
      user.emailOtpExpiry = expiry;
      user.emailVerified = false;

      await user.save();
    }

    // =============================
    // Send OTP Email
    // =============================

    const emailSent = await sendEmail(
      email,
      otp
    );

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to send OTP email. Please try again.",
      });
    }

    // =============================
    // Success
    // =============================

    return res.status(200).json({
      success: true,
      message:
        "OTP sent successfully to your email.",
      email,
    });

  } catch (error) {
    console.error(
      "Register Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// =============================
// Login User
// =============================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("\n========== LOGIN REQUEST ==========");
    console.log("Email:", email);

    // Find User
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Verify Email
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before logging in.",
      });
    }

    // Compare Password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    console.log("✅ Login Successful");

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });

  } catch (error) {
    console.error("Login Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =============================
// Get Profile
// =============================
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get Profile Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =============================
// Update Profile
// =============================
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.name = req.body.name || user.name;
    user.phone = req.body.phone || user.phone;

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update Profile Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =============================
// Change Password
// =============================
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await user.matchPassword(currentPassword);

    console.log("Current Password Match:", isMatch);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// =============================
// Add Address
// =============================
export const addAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.addresses.push({
      fullName: req.body.fullName,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      pincode: req.body.pincode,
      country: req.body.country || "India",
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "Address added successfully",
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Add Address Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =============================
// Get All Addresses
// =============================
export const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Get Addresses Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =============================
// Update Address
// =============================
export const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const address = user.addresses.id(req.params.id);

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    address.fullName = req.body.fullName;
    address.phone = req.body.phone;
    address.address = req.body.address;
    address.city = req.body.city;
    address.state = req.body.state;
    address.pincode = req.body.pincode;
    address.country = req.body.country || "India";

    await user.save();

    res.status(200).json({
      success: true,
      message: "Address updated successfully",
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Update Address Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// =============================
// Delete Address
// =============================
export const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    user.addresses = user.addresses.filter(
      (address) => address._id.toString() !== req.params.id
    );

    await user.save();

    res.status(200).json({
      success: true,
      message: "Address deleted successfully",
      addresses: user.addresses,
    });
  } catch (error) {
    console.error("Delete Address Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// =============================
// Logout User
// =============================
export const logoutUser = async (req, res) => {
  console.log("User Logged Out");

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};
// =============================
// Verify Email OTP
// =============================
export const verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    if (user.emailOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (user.emailOtpExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    user.emailVerified = true;
    user.emailOtp = "";
    user.emailOtpExpiry = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      token: generateToken(user._id),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });

  } catch (error) {
    console.error("Verify OTP Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// =============================
// Resend Email OTP
// =============================
export const resendEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    const otp = generateOTP();

    user.emailOtp = otp;
    user.emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    await sendEmail(email, otp);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};
// =============================
// Forgot Password - Send OTP
// =============================

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    const otp = generateOTP();

    user.emailOtp = otp;
    user.emailOtpExpiry = new Date(
      Date.now() + 10 * 60 * 1000
    );

    await user.save();

    console.log("================================");
    console.log("PASSWORD RESET OTP:", otp);
    console.log("================================");

    // Enable this after Gmail App Password is configured
    // await sendEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: "Password reset OTP sent successfully",
    });
  } catch (error) {
    console.error(
      "Forgot Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// =============================
// Verify Password Reset OTP
// =============================

export const verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.emailOtp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (
      !user.emailOtpExpiry ||
      user.emailOtpExpiry < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
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
// =============================
// Reset Password
// =============================

export const resetPassword = async (req, res) => {
  try {
    const {
      email,
      newPassword,
    } = req.body;

    if (!email || !newPassword) {
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

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.password = newPassword;

    user.emailOtp = "";
    user.emailOtpExpiry = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error(
      "Reset Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};