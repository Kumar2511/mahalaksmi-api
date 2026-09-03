import mongoose from "mongoose";

const upiSettingsSchema = new mongoose.Schema(
  {
    // ======================================
    // UPI Account Details
    // ======================================

    upiId: {
      type: String,
      default: "",
      trim: true,
    },

    accountName: {
      type: String,
      default: "",
      trim: true,
    },

    // ======================================
    // QR Code
    // ======================================

    qrCode: {
      type: String,
      default: "",
      trim: true,
    },

    // ======================================
    // Customer Instructions
    // ======================================

    paymentInstructions: {
      type: String,
      default:
        "Scan the QR code using any UPI app and pay the exact order amount.",
      trim: true,
    },

    // ======================================
    // Enable / Disable UPI
    // ======================================

    // Keep UPI disabled until the admin configures the account.
    enabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "UPISettings",
  upiSettingsSchema
);
