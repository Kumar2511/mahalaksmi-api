import mongoose from "mongoose";

const invoiceSettingsSchema = new mongoose.Schema(
  {
    // =====================================================
    // BUSINESS INFORMATION
    // =====================================================

    businessName: {
      type: String,
      default: "Mahalaksmi Jewellery",
      trim: true,
    },

    businessAddress: {
      type: String,
      default: "",
      trim: true,
    },

    businessPhone: {
      type: String,
      default: "",
      trim: true,
    },

    businessEmail: {
      type: String,
      default: "",
      trim: true,
    },

    businessWebsite: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // GST / TAX
    // =====================================================

    gstEnabled: {
      type: Boolean,
      default: false,
    },

    gstin: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    taxType: {
      type: String,
      enum: ["GST", "IGST", "NONE"],
      default: "NONE",
    },

    cgstRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    sgstRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    igstRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // INVOICE
    // =====================================================

    invoicePrefix: {
      type: String,
      default: "MH",
      trim: true,
      uppercase: true,
    },

    invoiceFooter: {
      type: String,
      default:
        "This is a computer-generated invoice and does not require a signature.",
      trim: true,
    },

    // =====================================================
    // PAYMENT / BANK DETAILS
    // =====================================================

    bankDetailsEnabled: {
      type: Boolean,
      default: false,
    },

    accountName: {
      type: String,
      default: "",
      trim: true,
    },

    bankName: {
      type: String,
      default: "",
      trim: true,
    },

    accountNumber: {
      type: String,
      default: "",
      trim: true,
    },

    ifscCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    // =====================================================
    // TERMS
    // =====================================================

    termsAndConditions: {
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
  "InvoiceSettings",
  invoiceSettingsSchema
);