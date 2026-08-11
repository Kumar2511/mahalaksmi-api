import ShippingSettings from "../models/ShippingSettings.js";
import csv from "csv-parser";
import { Readable } from "stream";

// ===================================
// Get Shipping Settings
// ===================================
export const getShippingSettings = async (req, res) => {
  try {
    let settings = await ShippingSettings.findOne();

    if (!settings) {
      settings = await ShippingSettings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get Shipping Settings Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// Update Shipping Settings
// ===================================
export const updateShippingSettings = async (req, res) => {
  try {
    let settings = await ShippingSettings.findOne();

    if (!settings) {
      settings = await ShippingSettings.create(req.body);
    } else {
      settings = await ShippingSettings.findByIdAndUpdate(
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
      message: "Shipping settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update Shipping Settings Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// Check Pincode
// ===================================
export const checkPincode = async (req, res) => {
  try {
    const { pincode } = req.params;

    // -------------------------------
    // Basic pincode validation
    // -------------------------------

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        serviceable: false,
        message: "Please enter a valid 6-digit pincode.",
      });
    }

    // -------------------------------
    // Get shipping settings
    // -------------------------------

    const settings = await ShippingSettings.findOne();

    if (!settings) {
      return res.status(404).json({
        success: false,
        serviceable: false,
        message: "Shipping settings are not configured.",
      });
    }

    // -------------------------------
    // Find matching delivery rule
    // -------------------------------

    const rule = settings.deliveryRules.find(
      (item) =>
        item.pincode === pincode &&
        item.active === true
    );

    // -------------------------------
    // Pincode not serviceable
    // -------------------------------

    if (!rule) {
      return res.status(404).json({
        success: true,
        serviceable: false,
        message:
          "Sorry, delivery is not available to this pincode.",
      });
    }

    // -------------------------------
    // Calculate estimated date
    // -------------------------------

    const estimatedDate = new Date();

    estimatedDate.setDate(
      estimatedDate.getDate() + rule.deliveryDays
    );

    const formattedDate =
      estimatedDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    // -------------------------------
    // Success
    // -------------------------------

    res.status(200).json({
      success: true,
      serviceable: true,

      delivery: {
        state: rule.state,
        district: rule.district,
        pincode: rule.pincode,
        deliveryDays: rule.deliveryDays,
        estimatedDate: formattedDate,
      },

      message: `Delivery available in ${rule.deliveryDays} days.`,
    });
  } catch (error) {
    console.error("Check Pincode Error:", error);

    res.status(500).json({
      success: false,
      serviceable: false,
      message:
        "Unable to check delivery availability.",
    });
  }
};

// ===================================
// Add Delivery Rule
// ===================================
export const addDeliveryRule = async (req, res) => {
  try {
    const {
      state,
      district,
      pincode,
      deliveryDays,
      active = true,
    } = req.body;

    // -------------------------------
    // Validation
    // -------------------------------

    if (
      !state ||
      !district ||
      !pincode ||
      deliveryDays === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "State, district, pincode and delivery days are required.",
      });
    }

    if (!/^\d{6}$/.test(String(pincode))) {
      return res.status(400).json({
        success: false,
        message: "Pincode must contain exactly 6 digits.",
      });
    }

    if (
      Number(deliveryDays) < 1 ||
      Number(deliveryDays) > 30
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Delivery days must be between 1 and 30.",
      });
    }

    // -------------------------------
    // Get settings
    // -------------------------------

    let settings = await ShippingSettings.findOne();

    if (!settings) {
      settings = await ShippingSettings.create({});
    }

    // -------------------------------
    // Prevent duplicate pincode
    // -------------------------------

    const existingRule =
      settings.deliveryRules.find(
        (item) => item.pincode === String(pincode)
      );

    if (existingRule) {
      return res.status(409).json({
        success: false,
        message:
          "A delivery rule already exists for this pincode.",
      });
    }

    // -------------------------------
    // Add rule
    // -------------------------------

    settings.deliveryRules.push({
      state: String(state).trim(),
      district: String(district).trim(),
      pincode: String(pincode),
      deliveryDays: Number(deliveryDays),
      active: Boolean(active),
    });

    await settings.save();

    res.status(201).json({
      success: true,
      message: "Delivery rule added successfully.",
      settings,
    });
  } catch (error) {
    console.error("Add Delivery Rule Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// Update Delivery Rule
// ===================================
export const updateDeliveryRule = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      state,
      district,
      pincode,
      deliveryDays,
      active,
    } = req.body;

    const settings = await ShippingSettings.findOne();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Shipping settings not found.",
      });
    }

    const rule = settings.deliveryRules.id(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Delivery rule not found.",
      });
    }

    // -------------------------------
    // Validate pincode
    // -------------------------------

    if (pincode !== undefined) {
      if (!/^\d{6}$/.test(String(pincode))) {
        return res.status(400).json({
          success: false,
          message:
            "Pincode must contain exactly 6 digits.",
        });
      }

      const duplicate =
        settings.deliveryRules.find(
          (item) =>
            item._id.toString() !== id &&
            item.pincode === String(pincode)
        );

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "Another delivery rule already uses this pincode.",
        });
      }

      rule.pincode = String(pincode);
    }

    // -------------------------------
    // Update fields
    // -------------------------------

    if (state !== undefined) {
      rule.state = String(state).trim();
    }

    if (district !== undefined) {
      rule.district = String(district).trim();
    }

    if (deliveryDays !== undefined) {
      if (
        Number(deliveryDays) < 1 ||
        Number(deliveryDays) > 30
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Delivery days must be between 1 and 30.",
        });
      }

      rule.deliveryDays = Number(deliveryDays);
    }

    if (active !== undefined) {
      rule.active = Boolean(active);
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Delivery rule updated successfully.",
      rule,
    });
  } catch (error) {
    console.error(
      "Update Delivery Rule Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// Delete Delivery Rule
// ===================================
export const deleteDeliveryRule = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await ShippingSettings.findOne();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Shipping settings not found.",
      });
    }

    const rule = settings.deliveryRules.id(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Delivery rule not found.",
      });
    }

    rule.deleteOne();

    await settings.save();

    res.status(200).json({
      success: true,
      message: "Delivery rule deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Delivery Rule Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ===================================
// Import Delivery Rules from CSV
// ===================================
export const importDeliveryRules = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a CSV file.",
      });
    }

    let settings = await ShippingSettings.findOne();

    if (!settings) {
      settings = await ShippingSettings.create({});
    }

    const rows = [];

    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer)
        .pipe(csv())
        .on("data", (row) => {
          rows.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "The CSV file is empty.",
      });
    }

    let added = 0;
    let skipped = 0;

    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const state = String(
        row.State || ""
      ).trim();

      const district = String(
        row.District || ""
      ).trim();

      const pincode = String(
        row.Pincode || ""
      ).trim();

      const deliveryDays = Number(
        row.DeliveryDays
      );

      const activeValue = String(
        row.Active || "true"
      )
        .trim()
        .toLowerCase();

      const active =
        activeValue === "true" ||
        activeValue === "1" ||
        activeValue === "yes";

      // -------------------------------
      // Validate row
      // -------------------------------

      if (
        !state ||
        !district ||
        !pincode ||
        !Number.isInteger(deliveryDays)
      ) {
        skipped++;

        errors.push(
          `Row ${i + 2}: Missing or invalid data.`
        );

        continue;
      }

      if (!/^\d{6}$/.test(pincode)) {
        skipped++;

        errors.push(
          `Row ${i + 2}: Invalid pincode ${pincode}.`
        );

        continue;
      }

      if (
        deliveryDays < 1 ||
        deliveryDays > 30
      ) {
        skipped++;

        errors.push(
          `Row ${i + 2}: Delivery days must be between 1 and 30.`
        );

        continue;
      }

      // -------------------------------
      // Check duplicate
      // -------------------------------

      const existing =
        settings.deliveryRules.find(
          (rule) =>
            rule.pincode === pincode
        );

      if (existing) {
        skipped++;

        errors.push(
          `Row ${i + 2}: Pincode ${pincode} already exists.`
        );

        continue;
      }

      // -------------------------------
      // Add rule
      // -------------------------------

      settings.deliveryRules.push({
        state,
        district,
        pincode,
        deliveryDays,
        active,
      });

      added++;
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message:
        "Delivery CSV imported successfully.",
      summary: {
        total: rows.length,
        added,
        skipped,
      },
      errors,
      settings,
    });
  } catch (error) {
    console.error(
      "Import Delivery CSV Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to import delivery CSV.",
    });
  }
};