import mongoose from "mongoose";

const stockNotificationSchema = new mongoose.Schema(
  {
    // ======================================
    // Product
    // ======================================

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // ======================================
    // Customer
    // ======================================

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // Optional user account reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ======================================
    // Notification Status
    // ======================================

    notified: {
      type: Boolean,
      default: false,
    },

    notifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ======================================
// Prevent Duplicate Requests
// ======================================

stockNotificationSchema.index(
  {
    product: 1,
    email: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model(
  "StockNotification",
  stockNotificationSchema
);