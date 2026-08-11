import Settings from "../models/Settings.js";

// ===================================
// Get Store Settings
// ===================================
export const getSettings = async (req, res) => {
  try {

    let settings = await Settings.findOne();

    // Create default settings if none exist
    if (!settings) {
      settings = await Settings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ===================================
// Update Store Settings
// ===================================
export const updateSettings = async (req, res) => {
  try {

    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create(req.body);
    } else {
      settings = await Settings.findByIdAndUpdate(
        settings._id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );
    }

    res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};