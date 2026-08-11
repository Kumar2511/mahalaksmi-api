import mongoose from "mongoose";

const customerLookSchema = new mongoose.Schema(
  {
    // ===========================
    // Customer
    // ===========================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    instagramUsername: {
      type: String,
      default: "",
      trim: true,
    },

    // ===========================
    // Order Reference
    // ===========================

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // ===========================
    // Product Reference
    // ===========================

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    productName: {
      type: String,
      default: "",
      trim: true,
    },

    // ===========================
    // Customer Photo
    // ===========================

    image: {
      type: String,
      required: true,
    },

    // ===========================
    // Feedback
    // ===========================

    feedback: {
      type: String,
      default: "",
      trim: true,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },

    // ===========================
    // Admin Approval
    // ===========================

    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
      ],
      default: "Pending",
    },

    adminNote: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "CustomerLook",
  customerLookSchema
);