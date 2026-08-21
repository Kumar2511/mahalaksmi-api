import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import {
  verifyEmailTransporter,
} from "./utils/sendEmail.js";

import connectDB from "./config/db.js";

import customerLookRoutes from "./routes/customerRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import collectionRoutes from "./routes/collectionRoutes.js";
import catalogImportRoutes from "./routes/catalogImportRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import stockNotificationRoutes from "./routes/stockNotificationRoutes.js";
import upiRoutes from "./routes/upiRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import imageSearchRoutes from "./routes/imageSearchRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import adminAppSettingsRoutes from "./routes/adminAppSettingsRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import shippingRoutes from "./routes/shippingRoutes.js";
import taxRoutes from "./routes/taxRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import razorpayRoutes from "./routes/razorpayRoutes.js";
import subscriberRoutes from "./routes/subscriberRoutes.js";
import instagramImportRoutes from "./routes/instagramImportRoutes.js";
// ==========================================
// ENVIRONMENT CONFIGURATION
// ==========================================

dotenv.config();

console.log(
  "EMAIL_USER:",
  process.env.EMAIL_USER
    ? "✅ SET"
    : "❌ MISSING"
);

console.log(
  "EMAIL_PASS:",
  process.env.EMAIL_PASS
    ? "✅ SET"
    : "❌ MISSING"
);

// ==========================================
// VERIFY EMAIL TRANSPORTER
// ==========================================

console.log(
  "📧 Checking Gmail email transporter..."
);

verifyEmailTransporter()
  .then((ready) => {
    if (ready) {
      console.log(
        "📧 Gmail email authentication is ready"
      );
    } else {
      console.error(
        "❌ Gmail email authentication failed"
      );
    }
  })
  .catch((error) => {
    console.error(
      "❌ Email transporter startup error:",
      error
    );
  });

// ==========================================
// CONNECT DATABASE
// ==========================================

connectDB();

// ==========================================
// CREATE EXPRESS APP
// ==========================================

const app = express();
// ==========================================
// STATIC UPLOADS
// ==========================================

app.use(
  "/uploads",
  express.static(
    path.resolve(
      process.cwd(),
      "uploads"
    )
  )
);
// ==========================================
// CORS
// ==========================================

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      // such as Postman/server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Not allowed by CORS")
      );
    },

    credentials: true,
  })
);

// ==========================================
// BODY / COOKIE MIDDLEWARE
// ==========================================

app.use(cookieParser());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ==========================================
// API ROUTES
// ==========================================

// Authentication
app.use(
  "/api/auth",
  authRoutes
);

// Products
app.use(
  "/api/products",
  productRoutes
);

// Categories
app.use(
  "/api/categories",
  categoryRoutes
);

// Collections
app.use(
  "/api/collections",
  collectionRoutes
);

// Catalog Import
app.use(
  "/api/catalog-import",
  catalogImportRoutes
);

// Orders
app.use(
  "/api/orders",
  orderRoutes
);

// Stock Notifications
app.use(
  "/api/stock-notifications",
  stockNotificationRoutes
);

// Reviews
app.use(
  "/api/reviews",
  reviewRoutes
);

// Image Search
app.use(
  "/api/image-search",
  imageSearchRoutes
);

// Dashboard
app.use(
  "/api/dashboard",
  dashboardRoutes
);

// Admin
app.use(
  "/api/admin",
  adminRoutes
);

// Upload
app.use(
  "/api/upload",
  uploadRoutes
);

// Customers
app.use(
  "/api/customers",
  customerRoutes
);

// Search
app.use(
  "/api/search",
  searchRoutes
);

// Notifications
app.use(
  "/api/notifications",
  notificationRoutes
);

// Settings
app.use(
  "/api/settings",
  settingsRoutes
);

// Admin App Settings
app.use(
  "/api/admin-app-settings",
  adminAppSettingsRoutes
);

// Banners
app.use(
  "/api/banners",
  bannerRoutes
);

// Analytics
app.use(
  "/api/analytics",
  analyticsRoutes
);

// Coupons
app.use(
  "/api/coupons",
  couponRoutes
);

// Shipping
app.use(
  "/api/shipping",
  shippingRoutes
);

// Tax
app.use(
  "/api/tax",
  taxRoutes
);

// Payment
app.use(
  "/api/payment",
  paymentRoutes
);

// UPI
app.use(
  "/api/upi",
  upiRoutes
);

// Razorpay
app.use(
  "/api/razorpay",
  razorpayRoutes
);

// Subscribers
app.use(
  "/api/subscribers",
  subscriberRoutes
);

// Customer Looks
app.use(
  "/api/customer-looks",
  customerLookRoutes
);

// Instagram Bulk Import
app.use(
  "/api/instagram-import",
  instagramImportRoutes
);

// ==========================================
// HOME / HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message:
      "Mahalaksmi Jewelry API is Running 🚀",
  });
});

// ==========================================
// 404 ROUTE
// ==========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API Route Not Found",
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    "--------------------------------------"
  );

  console.log(
    "🚀 Server Running"
  );

  console.log(
    `🌐 http://localhost:${PORT}`
  );

  console.log(
    "--------------------------------------"
  );
});