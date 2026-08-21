import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: false,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    reviewTitle: {
      type: String,
      default: "",
      trim: true,
      maxlength: 150,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    images: {
      type: [String],
      default: [],
    },

    videos: {
      type: [String],
      default: [],
    },

    source: {
      type: String,
      default: "website",
      trim: true,
    },

    approved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Review", reviewSchema);