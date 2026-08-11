import TaxSettings from "../models/TaxSettings.js";

// ===================================
// Get Tax Settings
// ===================================
export const getTaxSettings = async (req, res) => {
  try {

    let settings = await TaxSettings.findOne();

    if (!settings) {
      settings = await TaxSettings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};

// ===================================
// Update Tax Settings
// ===================================
export const updateTaxSettings = async (req, res) => {
  try {

    let settings = await TaxSettings.findOne();

    if (!settings) {
      settings = await TaxSettings.create(req.body);
    } else {
      settings = await TaxSettings.findByIdAndUpdate(
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
      message: "Tax settings updated successfully",
      settings,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};