import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ======================================
// Admin Login
// ======================================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find only admin user
    const admin = await User.findOne({
      email,
      role: "admin",
    }).select("+password");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin email",
      });
    }

    // Compare password
    const isMatch = await admin.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: admin._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};