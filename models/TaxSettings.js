import mongoose from "mongoose";

const taxSettingsSchema = new mongoose.Schema(
  {
    taxEnabled: {
      type: Boolean,
      default: true,
    },

    taxType: {
      type: String,
      enum: ["inclusive", "exclusive"],
      default: "inclusive",
    },

    gstPercentage: {
      type: Number,
      default: 18,
    },

    cgst: {
      type: Number,
      default: 9,
    },

    sgst: {
      type: Number,
      default: 9,
    },

    igst: {
      type: Number,
      default: 18,
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