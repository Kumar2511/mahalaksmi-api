import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ======================================================
// Get Token Based On Application
// ======================================================

const getAuthToken = (req) => {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";

  // ==================================================
  // ADMIN APPLICATION
  // localhost:3001
  // ==================================================

  if (
    origin.includes("localhost:3001") ||
    referer.includes("localhost:3001")
  ) {
    return {
      token:
        req.cookies?.mahalaksmi_admin_token,
      app: "admin",
    };
  }

  // ==================================================
  // CUSTOMER APPLICATION
  // localhost:3000
  // ==================================================

  if (
    origin.includes("localhost:3000") ||
    referer.includes("localhost:3000")
  ) {
    return {
      token:
        req.cookies?.mahalaksmi_customer_token,
      app: "customer",
    };
  }

  // ==================================================
  // Fallback
  // ==================================================

  return {
    token:
      req.cookies?.mahalaksmi_admin_token ||
      req.cookies?.mahalaksmi_customer_token,
    app: "unknown",
  };
};

// ======================================================
// Protect Routes
// ======================================================

export const protect = async (
  req,
  res,
  next
) => {
  try {
    const {
      token,
      app,
    } = getAuthToken(req);

    console.log(
      "\n========== AUTH CHECK =========="
    );

    console.log(
      "Origin:",
      req.headers.origin || "none"
    );

    console.log(
      "Referer:",
      req.headers.referer || "none"
    );

    console.log(
      "Application:",
      app
    );

    console.log(
      "Admin cookie:",
      Boolean(
        req.cookies?.mahalaksmi_admin_token
      )
    );

    console.log(
      "Customer cookie:",
      Boolean(
        req.cookies?.mahalaksmi_customer_token
      )
    );

    // ==================================================
    // Authorization Header Fallback
    // ==================================================

    let finalToken = token;

    if (
      !finalToken &&
      req.headers.authorization &&
      req.headers.authorization.startsWith(
        "Bearer "
      )
    ) {
      finalToken =
        req.headers.authorization.split(
          " "
        )[1];
    }

    // ==================================================
    // No Token
    // ==================================================

    if (!finalToken) {
      console.log(
        "❌ No authentication token found"
      );

      return res.status(401).json({
        success: false,
        message:
          "Not authorized. No token found.",
      });
    }

    // ==================================================
    // Verify JWT
    // ==================================================

    const decoded = jwt.verify(
      finalToken,
      process.env.JWT_SECRET
    );

    // ==================================================
    // Find User
    // ==================================================

    const user =
      await User.findById(
        decoded.id
      ).select("-password");

    if (!user) {
      console.log(
        "❌ User not found"
      );

      return res.status(401).json({
        success: false,
        message:
          "User not found",
      });
    }

    // ==================================================
    // Application / Role Protection
    // ==================================================

    if (
      app === "customer" &&
      user.role === "admin"
    ) {
      console.log(
        "❌ Admin token cannot be used on customer app"
      );

      return res.status(403).json({
        success: false,
        message:
          "Admin account cannot access the customer application.",
      });
    }

    if (
      app === "admin" &&
      user.role !== "admin"
    ) {
      console.log(
        "❌ Customer token cannot be used on admin app"
      );

      return res.status(403).json({
        success: false,
        message:
          "Only administrators can access the admin application.",
      });
    }

    // ==================================================
    // Attach User
    // ==================================================

    req.user = user;

    console.log(
      "✅ Authenticated:",
      user.email
    );

    console.log(
      "✅ Role:",
      user.role
    );

    next();

  } catch (error) {
    console.error(
      "❌ Authentication Error:",
      error.message
    );

    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired token",
    });
  }
};

// ======================================================
// Admin Only
// ======================================================

export const admin = (
  req,
  res,
  next
) => {
  console.log(
    "\n===== ADMIN MIDDLEWARE ====="
  );

  console.log(
    "User:",
    req.user?.email
  );

  console.log(
    "Role:",
    req.user?.role
  );

  if (
    req.user &&
    req.user.role === "admin"
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message:
      "Admin access only",
  });
};


// ======================================================
// Admin Protected Route
// ======================================================

export const protectAdmin = async (
  req,
  res,
  next
) => {
  await protect(req, res, () => {
    return admin(req, res, next);
  });
};