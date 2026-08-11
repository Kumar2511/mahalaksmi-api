import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    // ===============================
    // Customer
    // ===============================
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ===============================
    // Order
    // ===============================
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // ===============================
    // Product
    // ===============================
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // ===============================
    // Customer Name
    // ===============================
    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    // ===============================
    // Rating
    // ===============================
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    // ===============================
    // Review
    // ===============================
    comment: {
      type: String,
      required: true,
      trim: true,
    },

    // ===============================
    // Admin Approval
    // ===============================
    approved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "Review",
  reviewSchema
);