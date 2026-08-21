import Settings from "../models/Settings.js";

// ===================================
// Get Store Settings
// ===================================

export const getSettings = async (
  req,
  res
) => {
  try {
    let settings =
      await Settings.findOne().lean();

    // Create default settings if none exist
    if (!settings) {
      settings =
        await Settings.create({});
      settings =
        settings.toObject();
    }

    // ===================================
    // NEVER SEND SECRETS TO THE BROWSER
    // ===================================

    delete settings.razorpaySecret;
    delete settings.smtpPassword;

    return res.status(200).json({
      success: true,
      settings,
    });

  } catch (error) {
    console.error(
      "Get Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load settings.",
    });
  }
};


// ===================================
// Update Store Settings
// ===================================

export const updateSettings = async (
  req,
  res
) => {
  try {
    let settings =
      await Settings.findOne();

    // ===================================
    // Create Settings
    // ===================================

    if (!settings) {
      settings =
        await Settings.create(req.body);
    } else {
      // ===================================
      // Separate Secret Fields
      // ===================================

      const updateData = {
        ...req.body,
      };

      // ===================================
      // DO NOT overwrite existing secrets
      // with empty values.
      // ===================================

      if (
        !updateData.razorpaySecret ||
        !String(
          updateData.razorpaySecret
        ).trim()
      ) {
        delete updateData.razorpaySecret;
      }

      if (
        !updateData.smtpPassword ||
        !String(
          updateData.smtpPassword
        ).trim()
      ) {
        delete updateData.smtpPassword;
      }

      // ===================================
      // Update Settings
      // ===================================

      settings =
        await Settings.findByIdAndUpdate(
          settings._id,
          updateData,
          {
            new: true,
            runValidators: true,
          }
        );
    }

    // ===================================
    // NEVER RETURN SECRETS
    // ===================================

    const safeSettings =
      settings.toObject();

    delete safeSettings.razorpaySecret;
    delete safeSettings.smtpPassword;

    return res.status(200).json({
      success: true,
      message:
        "Settings updated successfully.",
      settings: safeSettings,
    });

  } catch (error) {
    console.error(
      "Update Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update settings.",
    });
  }
};