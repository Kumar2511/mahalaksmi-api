import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["order", "payment", "review", "stock_request", "stock", "subscriber"],
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      default: "",
    },
    relatedEntityId: {
      type: String,
      default: "",
    },
    relatedEntityType: {
      type: String,
      default: "",
    },
    read: {
      type: Boolean,
      default: false,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("AdminNotification", adminNotificationSchema);
