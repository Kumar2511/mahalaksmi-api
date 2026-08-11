import mongoose from "mongoose";

const deliveryRuleSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: true,
      trim: true,
    },

    district: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{6}$/,
    },

    deliveryDays: {
      type: Number,
      required: true,
      min: 1,
      max: 30,
      default: 3,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const shippingSettingsSchema = new mongoose.Schema(
  {
    // ===================================
    // GLOBAL SHIPPING SETTINGS
    // ===================================

    freeShippingEnabled: {
      type: Boolean,
      default: true,
    },

    freeShippingMinimum: {
      type: Number,
      default: 999,
    },

    shippingCharge: {
      type: Number,
      default: 80,
    },

    codCharge: {
      type: Number,
      default: 0,
    },

    estimatedDelivery: {
      type: String,
      default: "3-7 Business Days",
    },

    deliveryMessage: {
      type: String,
      default:
        "Orders are delivered within 3-7 business days.",
    },

    // ===================================
    // PINCODE DELIVERY RULES
    // ===================================

    deliveryRules: {
      type: [deliveryRuleSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "ShippingSettings",
  shippingSettingsSchema
);