import UPISettings from "../models/UPISettings.js";

// ======================================
// Get UPI Settings
// ======================================

export const getUPISettings = async (req, res) => {
  try {
    let settings =
      await UPISettings.findOne();

    if (!settings) {
      settings =
        await UPISettings.create({});
    }

    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error(
      "Get UPI Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Update UPI Settings
// ======================================

export const updateUPISettings = async (
  req,
  res
) => {
  try {
    let settings =
      await UPISettings.findOne();

    if (!settings) {
      settings =
        await UPISettings.create(
          req.body
        );
    } else {
      settings =
        await UPISettings.findByIdAndUpdate(
          settings._id,
          req.body,
          {
            new: true,
            runValidators: true,
          }
        );
    }

    return res.status(200).json({
      success: true,
      message:
        "UPI settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error(
      "Update UPI Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};