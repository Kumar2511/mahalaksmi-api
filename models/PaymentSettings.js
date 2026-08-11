import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    codEnabled: {
      type: Boolean,
      default: true,
    },

    razorpayEnabled: {
      type: Boolean,
      default: false,
    },

    phonePeEnabled: {
      type: Boolean,
      default: false,
    },

    upiEnabled: {
      type: Boolean,
      default: false,
    },

    bankTransferEnabled: {
      type: Boolean,
      default: false,
    },

    razorpayKeyId: {
      type: String,
      default: "",
    },

    razorpaySecret: {
      type: String,
      default: "",
    },

    upiId: {
      type: String,
      default: "",
    },

    paymentSuccessMessage: {
      type: String,
      default: "Payment Successful",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "PaymentSettings",
  paymentSettingsSchema
);