import AdminAppSettings from "../models/AdminAppSettings.js";

// ============================================================
// GET ADMIN APP SETTINGS
// ============================================================

export const getAdminAppSettings = async (req, res) => {
  try {
    let settings =
      await AdminAppSettings.findOne().lean();

    // Create default settings automatically
    // if this is the first time the API is accessed.
    if (!settings) {
      const created =
        await AdminAppSettings.create({});

      settings = created.toObject();
    }

    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error(
      "Get Admin App Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load admin app settings.",
    });
  }
};

// ============================================================
// UPDATE ADMIN APP SETTINGS
// ============================================================

export const updateAdminAppSettings = async (
  req,
  res
) => {
  try {
    let settings =
      await AdminAppSettings.findOne();

    // ----------------------------------------------------------
    // Create settings if they don't exist
    // ----------------------------------------------------------

    if (!settings) {
      settings =
        await AdminAppSettings.create(req.body);
    } else {
      // --------------------------------------------------------
      // Update existing settings
      // --------------------------------------------------------

      settings =
        await AdminAppSettings.findByIdAndUpdate(
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
        "Admin app settings updated successfully.",
      settings,
    });
  } catch (error) {
    console.error(
      "Update Admin App Settings Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update admin app settings.",
    });
  }
};