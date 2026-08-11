import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    // ==========================
    // Store Information
    // ==========================
    storeName: {
      type: String,
      default: "The Girl Ho Se",
    },

    logo: {
      type: String,
      default: "",
    },

    favicon: {
      type: String,
      default: "",
    },

    // ==========================
    // Contact
    // ==========================
    phone: {
      type: String,
      default: "",
    },

    whatsapp: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    // ==========================
    // Social Media
    // ==========================
    instagram: {
      type: String,
      default: "",
    },

    facebook: {
      type: String,
      default: "",
    },

    youtube: {
      type: String,
      default: "",
    },

    twitter: {
      type: String,
      default: "",
    },

    // ==========================
    // Theme
    // ==========================
    primaryColor: {
      type: String,
      default: "#C78B7B",
    },

    secondaryColor: {
      type: String,
      default: "#2E2E2E",
    },

    // ==========================
    // Shipping
    // ==========================
    shippingCharge: {
      type: Number,
      default: 0,
    },

    freeShippingLimit: {
      type: Number,
      default: 0,
    },

    // ==========================
    // Tax
    // ==========================
    gst: {
      type: Number,
      default: 0,
    },

    // ==========================
    // Payment
    // ==========================
    razorpayKey: {
      type: String,
      default: "",
    },

    razorpaySecret: {
      type: String,
      default: "",
    },

    // ==========================
    // Email
    // ==========================
    smtpEmail: {
      type: String,
      default: "",
    },

    smtpPassword: {
      type: String,
      default: "",
    },

    // ==========================
    // Store
    // ==========================
    maintenanceMode: {
      type: Boolean,
      default: false,
    },

    lowStockAlert: {
      type: Number,
      default: 5,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Settings", settingsSchema);