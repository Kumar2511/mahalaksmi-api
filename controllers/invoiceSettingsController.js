import InvoiceSettings from "../models/InvoiceSettings.js";

// =====================================================
// GET INVOICE SETTINGS
// =====================================================

export const getInvoiceSettings = async (req, res) => {
  try {
    let settings = await InvoiceSettings.findOne().lean();

    // Create default settings automatically
    // if admin has never configured invoice settings.
    if (!settings) {
      const created = await InvoiceSettings.create({});

      settings = created.toObject();
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error(
      "Get invoice settings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load invoice settings.",
    });
  }
};

// =====================================================
// UPDATE INVOICE SETTINGS
// =====================================================

export const updateInvoiceSettings = async (
  req,
  res
) => {
  try {
    const {
      businessName,
      businessAddress,
      businessPhone,
      businessEmail,
      businessWebsite,

      gstEnabled,
      gstin,
      taxType,
      cgstRate,
      sgstRate,
      igstRate,

      invoicePrefix,
      invoiceFooter,

      bankDetailsEnabled,
      accountName,
      bankName,
      accountNumber,
      ifscCode,

      termsAndConditions,
    } = req.body;

    // ---------------------------------------------------
    // Basic GST validation
    // ---------------------------------------------------

    const safeGstEnabled =
      Boolean(gstEnabled);

    let finalTaxType =
      taxType || "NONE";

    let finalCgstRate =
      Number(cgstRate || 0);

    let finalSgstRate =
      Number(sgstRate || 0);

    let finalIgstRate =
      Number(igstRate || 0);

    // If GST is disabled, do not accidentally calculate tax.
    if (!safeGstEnabled) {
      finalTaxType = "NONE";
      finalCgstRate = 0;
      finalSgstRate = 0;
      finalIgstRate = 0;
    }

    // ---------------------------------------------------
    // Find existing singleton settings
    // ---------------------------------------------------

    let settings =
      await InvoiceSettings.findOne();

    if (!settings) {
      settings =
        new InvoiceSettings();
    }

    // ---------------------------------------------------
    // Business
    // ---------------------------------------------------

    settings.businessName =
      businessName ?? settings.businessName;

    settings.businessAddress =
      businessAddress ?? settings.businessAddress;

    settings.businessPhone =
      businessPhone ?? settings.businessPhone;

    settings.businessEmail =
      businessEmail ?? settings.businessEmail;

    settings.businessWebsite =
      businessWebsite ?? settings.businessWebsite;

    // ---------------------------------------------------
    // GST / TAX
    // ---------------------------------------------------

    settings.gstEnabled =
      safeGstEnabled;

    settings.gstin =
      safeGstEnabled
        ? String(gstin || "").trim().toUpperCase()
        : "";

    settings.taxType =
      finalTaxType;

    settings.cgstRate =
      finalCgstRate;

    settings.sgstRate =
      finalSgstRate;

    settings.igstRate =
      finalIgstRate;

    // ---------------------------------------------------
    // Invoice
    // ---------------------------------------------------

    settings.invoicePrefix =
      String(
        invoicePrefix ||
          settings.invoicePrefix ||
          "MH"
      )
        .trim()
        .toUpperCase();

    settings.invoiceFooter =
      invoiceFooter ??
      settings.invoiceFooter;

    // ---------------------------------------------------
    // Bank
    // ---------------------------------------------------

    settings.bankDetailsEnabled =
      Boolean(bankDetailsEnabled);

    settings.accountName =
      accountName ?? settings.accountName;

    settings.bankName =
      bankName ?? settings.bankName;

    settings.accountNumber =
      accountNumber ?? settings.accountNumber;

    settings.ifscCode =
      String(
        ifscCode ||
          settings.ifscCode ||
          ""
      )
        .trim()
        .toUpperCase();

    // ---------------------------------------------------
    // Terms
    // ---------------------------------------------------

    settings.termsAndConditions =
      termsAndConditions ??
      settings.termsAndConditions;

    await settings.save();

    return res.status(200).json({
      success: true,
      message:
        "Invoice settings updated successfully.",
      data: settings,
    });
  } catch (error) {
    console.error(
      "Update invoice settings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update invoice settings.",
    });
  }
};