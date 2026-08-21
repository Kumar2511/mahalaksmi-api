import mongoose from "mongoose";

const taxSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },

    gstEnabled: {
      type: Boolean,
      default: true,
    },

    gstRate: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },

    cgstRate: {
      type: Number,
      default: 9,
      min: 0,
      max: 100,
    },

    sgstRate: {
      type: Number,
      default: 9,
      min: 0,
      max: 100,
    },

    igstRate: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },

    inclusive: {
      type: Boolean,
      default: false,
    },

    taxName: {
      type: String,
      default: "GST",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "TaxSettings",
  taxSettingsSchema
);