import UPISettings from "../models/UPISettings.js";

// ======================================
// Get UPI Settings
// Public - Customer Payment Page
// ======================================
export const getUPISettings = async (
  req,
  res
) => {
  try {
    let settings =
      await UPISettings.findOne();

    if (!settings) {
      settings =
        await UPISettings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error(
      "Get UPI Settings Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Update UPI Settings
// Admin Only
// ======================================
export const updateUPISettings = async (
  req,
  res
) => {
  try {
    const {
      upiId,
      accountName,
      qrCode,
      paymentInstructions,
      enabled,
    } = req.body;

    let settings =
      await UPISettings.findOne();

    if (!settings) {
      settings =
        await UPISettings.create({
          upiId,
          accountName,
          qrCode,
          paymentInstructions,
          enabled,
        });
    } else {
      settings.upiId =
        upiId ?? settings.upiId;

      settings.accountName =
        accountName ??
        settings.accountName;

      settings.qrCode =
        qrCode ?? settings.qrCode;

      settings.paymentInstructions =
        paymentInstructions ??
        settings.paymentInstructions;

      if (typeof enabled === "boolean") {
        settings.enabled = enabled;
      }

      await settings.save();
    }

    res.status(200).json({
      success: true,
      message:
        "UPI settings updated successfully.",
      settings,
    });
  } catch (error) {
    console.error(
      "Update UPI Settings Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};