import PaymentSettings from "../models/PaymentSettings.js";

// ===================================
// Get Payment Settings
// ===================================
export const getPaymentSettings = async (req, res) => {
  try {

    let settings = await PaymentSettings.findOne();

    if (!settings) {
      settings = await PaymentSettings.create({});
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
// Update Payment Settings
// ===================================
export const updatePaymentSettings = async (req, res) => {
  try {

    let settings = await PaymentSettings.findOne();

    if (!settings) {

      settings = await PaymentSettings.create(req.body);

    } else {

      settings = await PaymentSettings.findByIdAndUpdate(
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
      message: "Payment settings updated successfully",
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