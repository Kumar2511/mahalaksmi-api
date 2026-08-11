import Coupon from "../models/Coupon.js";

// ======================================
// Create Coupon - Admin
// ======================================
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minOrderAmount,
      maxDiscount,
      expiresAt,
      usageLimit,
      isActive,
    } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required.",
      });
    }

    if (!type || !["percentage", "fixed"].includes(type)) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon type must be percentage or fixed.",
      });
    }

    if (
      value === undefined ||
      Number(value) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid coupon value is required.",
      });
    }

    const normalizedCode =
      code.trim().toUpperCase();

    // Prevent duplicate coupon codes
    const existingCoupon =
      await Coupon.findOne({
        code: normalizedCode,
      });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message:
          "A coupon with this code already exists.",
      });
    }

    // Percentage validation
    if (
      type === "percentage" &&
      Number(value) > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Percentage discount cannot exceed 100%.",
      });
    }

    const coupon = await Coupon.create({
      code: normalizedCode,
      type,
      value: Number(value),
      minOrderAmount:
        Number(minOrderAmount) || 0,
      maxDiscount:
        maxDiscount === null ||
        maxDiscount === undefined ||
        maxDiscount === ""
          ? null
          : Number(maxDiscount),
      expiresAt:
        expiresAt || null,
      usageLimit:
        usageLimit === null ||
        usageLimit === undefined ||
        usageLimit === ""
          ? null
          : Number(usageLimit),
      isActive:
        isActive !== undefined
          ? Boolean(isActive)
          : true,
    });

    res.status(201).json({
      success: true,
      message: "Coupon created successfully.",
      coupon,
    });
  } catch (error) {
    console.error(
      "Create Coupon Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Get All Coupons - Admin
// ======================================
export const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      count: coupons.length,
      coupons,
    });
  } catch (error) {
    console.error(
      "Get Coupons Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Get Single Coupon - Admin
// ======================================
export const getCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(
      req.params.id
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found.",
      });
    }

    res.status(200).json({
      success: true,
      coupon,
    });
  } catch (error) {
    console.error(
      "Get Coupon Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Update Coupon - Admin
// ======================================
export const updateCoupon = async (
  req,
  res
) => {
  try {
    const updates = {
      ...req.body,
    };

    // Normalize coupon code
    if (updates.code) {
      updates.code =
        updates.code.trim().toUpperCase();
    }

    // Convert numeric values
    if (
      updates.value !== undefined
    ) {
      updates.value =
        Number(updates.value);
    }

    if (
      updates.minOrderAmount !== undefined
    ) {
      updates.minOrderAmount =
        Number(updates.minOrderAmount);
    }

    if (
      updates.maxDiscount !== undefined &&
      updates.maxDiscount !== null &&
      updates.maxDiscount !== ""
    ) {
      updates.maxDiscount =
        Number(updates.maxDiscount);
    }

    if (
      updates.usageLimit !== undefined &&
      updates.usageLimit !== null &&
      updates.usageLimit !== ""
    ) {
      updates.usageLimit =
        Number(updates.usageLimit);
    }

    const coupon =
      await Coupon.findByIdAndUpdate(
        req.params.id,
        updates,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Coupon updated successfully.",
      coupon,
    });
  } catch (error) {
    console.error(
      "Update Coupon Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Delete Coupon - Admin
// ======================================
export const deleteCoupon = async (
  req,
  res
) => {
  try {
    const coupon =
      await Coupon.findById(
        req.params.id
      );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found.",
      });
    }

    await coupon.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "Coupon deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Coupon Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Apply Coupon - Customer
// ======================================
export const applyCoupon = async (
  req,
  res
) => {
  try {
    const { code, totalAmount } =
      req.body;

    const subtotal =
      Number(totalAmount);

    // ==================================
    // Validation
    // ==================================

    if (!code) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon code is required.",
      });
    }

    if (
      !Number.isFinite(subtotal) ||
      subtotal <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid order amount.",
      });
    }

    // ==================================
    // Find Coupon
    // ==================================

    const coupon =
      await Coupon.findOne({
        code: code
          .trim()
          .toUpperCase(),
        isActive: true,
      });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message:
          "Invalid or inactive coupon code.",
      });
    }

    // ==================================
    // Expiry
    // ==================================

    if (
      coupon.expiresAt &&
      new Date() >
        new Date(coupon.expiresAt)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This coupon has expired.",
      });
    }

    // ==================================
    // Usage Limit
    // ==================================

    if (
      coupon.usageLimit !== null &&
      coupon.usedCount >=
        coupon.usageLimit
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon usage limit has been reached.",
      });
    }

    // ==================================
    // Minimum Order Amount
    // ==================================

    if (
      subtotal <
      Number(
        coupon.minOrderAmount || 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value is ₹${Number(
          coupon.minOrderAmount || 0
        ).toLocaleString("en-IN")}.`,
      });
    }

    // ==================================
    // Calculate Discount
    // ==================================

    let discount = 0;

    if (
      coupon.type ===
      "percentage"
    ) {
      discount =
        (subtotal *
          Number(coupon.value)) /
        100;

      if (
        coupon.maxDiscount !==
          null &&
        coupon.maxDiscount !==
          undefined
      ) {
        discount = Math.min(
          discount,
          Number(
            coupon.maxDiscount
          )
        );
      }
    }

    if (
      coupon.type === "fixed"
    ) {
      discount =
        Number(coupon.value);
    }

    // Never allow discount above subtotal
    discount = Math.min(
      discount,
      subtotal
    );

    discount =
      Math.round(discount);

    // ==================================
    // Shipping
    // ==================================

    const FREE_SHIPPING_LIMIT =
      499;

    const shipping =
      subtotal >=
      FREE_SHIPPING_LIMIT
        ? 0
        : 49;

    // ==================================
    // Final Amount
    // ==================================

    const finalAmount =
      Math.max(
        subtotal - discount,
        0
      ) + shipping;

    // ==================================
    // Response
    // ==================================

    res.status(200).json({
      success: true,

      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
      },

      subtotal,

      discount,

      shipping,

      finalAmount,
    });
  } catch (error) {
    console.error(
      "Apply Coupon Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};