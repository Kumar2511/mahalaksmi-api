import crypto from "crypto";

import razorpay from "../config/razorpay.js";
import Product from "../models/Product.js";
import Coupon from "../models/Coupon.js";
import ShippingSettings from "../models/ShippingSettings.js";

// ======================================
// Create Razorpay Order
// ======================================
export const createOrder = async (req, res) => {
  try {
    const {
      products,
      couponCode,
    } = req.body;

    // ======================================
    // Validate Products
    // ======================================

    if (
      !Array.isArray(products) ||
      products.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Products are required.",
      });
    }

    // ======================================
    // Get Shipping Settings
    // ======================================

    let shippingSettings =
      await ShippingSettings.findOne();

    if (!shippingSettings) {
      shippingSettings =
        await ShippingSettings.create({});
    }

    // ======================================
    // Calculate Subtotal From Database
    // ======================================

    let subtotal = 0;

    for (const item of products) {
      if (!item.productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required.",
        });
      }

      const quantity =
        Number(item.quantity) || 0;

      if (quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid product quantity.",
        });
      }

      const product =
        await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      // Check current stock
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} has only ${product.stock} item(s) available.`,
        });
      }

      const price =
        Number(
          product.discountPrice > 0
            ? product.discountPrice
            : product.price
        ) || 0;

      subtotal += price * quantity;
    }

    subtotal =
      Math.round(subtotal * 100) / 100;

    // ======================================
    // Calculate Shipping
    // ======================================

    let shippingAmount = 0;

    if (
      shippingSettings.freeShippingEnabled &&
      subtotal >=
        Number(
          shippingSettings.freeShippingMinimum || 0
        )
    ) {
      shippingAmount = 0;
    } else {
      shippingAmount =
        Number(
          shippingSettings.shippingCharge || 0
        );
    }

    // ======================================
    // Coupon
    // ======================================

    let discountAmount = 0;
    let appliedCoupon = null;

    const normalizedCouponCode =
      couponCode?.trim().toUpperCase();

    if (normalizedCouponCode) {
      appliedCoupon =
        await Coupon.findOne({
          code: normalizedCouponCode,
          isActive: true,
        });

      if (!appliedCoupon) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid or inactive coupon code.",
        });
      }

      // Expiry
      if (
        appliedCoupon.expiresAt &&
        new Date() >
          new Date(
            appliedCoupon.expiresAt
          )
      ) {
        return res.status(400).json({
          success: false,
          message: "This coupon has expired.",
        });
      }

      // Usage limit
      if (
        appliedCoupon.usageLimit !== null &&
        appliedCoupon.usedCount >=
          appliedCoupon.usageLimit
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Coupon usage limit has been reached.",
        });
      }

      // Minimum order
      if (
        subtotal <
        Number(
          appliedCoupon.minOrderAmount || 0
        )
      ) {
        return res.status(400).json({
          success: false,
          message: `Minimum order value is ₹${Number(
            appliedCoupon.minOrderAmount || 0
          ).toLocaleString("en-IN")}.`,
        });
      }

      // Calculate discount
      if (
        appliedCoupon.type ===
        "percentage"
      ) {
        discountAmount =
          (subtotal *
            Number(appliedCoupon.value)) /
          100;

        if (
          appliedCoupon.maxDiscount !== null &&
          appliedCoupon.maxDiscount !==
            undefined
        ) {
          discountAmount = Math.min(
            discountAmount,
            Number(
              appliedCoupon.maxDiscount
            )
          );
        }
      } else if (
        appliedCoupon.type === "fixed"
      ) {
        discountAmount =
          Number(appliedCoupon.value);
      }

      discountAmount = Math.min(
        discountAmount,
        subtotal
      );

      discountAmount =
        Math.round(
          discountAmount * 100
        ) / 100;
    }

    // ======================================
    // Final Amount
    // ======================================

    const totalAmount =
      Math.max(
        subtotal -
          discountAmount +
          shippingAmount,
        0
      );

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment amount.",
      });
    }

    // ======================================
    // Create Razorpay Order
    // ======================================

    if (!razorpay) {
      return res.status(503).json({
        success: false,
        message: "Razorpay payment integration is coming soon. Please use manual UPI payment.",
      });
    }

    const options = {
      amount: Math.round(
        totalAmount * 100
      ),
      currency: "INR",
      receipt:
        "receipt_" +
        Date.now(),
      notes: {
        subtotal: String(subtotal),
        discount: String(
          discountAmount
        ),
        shipping: String(
          shippingAmount
        ),
        couponCode:
          appliedCoupon?.code || "",
      },
    };

    const order =
      await razorpay.orders.create(
        options
      );

    // ======================================
    // Response
    // ======================================

    res.status(200).json({
      success: true,

      order,

      calculation: {
        subtotal,
        discountAmount,
        shippingAmount,
        totalAmount,
        couponCode:
          appliedCoupon?.code || "",
      },
    });
  } catch (error) {
    console.error(
      "Razorpay Create Order Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Verify Razorpay Payment
// ======================================
export const verifyPayment = async (
  req,
  res
) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing Razorpay payment details",
      });
    }

    // ======================================
    // Generate Expected Signature
    // ======================================

    const body =
      razorpay_order_id +
      "|" +
      razorpay_payment_id;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env
            .RAZORPAY_KEY_SECRET
        )
        .update(body)
        .digest("hex");

    // ======================================
    // Compare Signature
    // ======================================

    const isValid =
      crypto.timingSafeEqual(
        Buffer.from(
          expectedSignature,
          "utf8"
        ),
        Buffer.from(
          razorpay_signature,
          "utf8"
        )
      );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment signature",
      });
    }

    // ======================================
    // Success
    // ======================================

    res.status(200).json({
      success: true,
      message:
        "Payment verified successfully",

      payment: {
        razorpay_order_id,
        razorpay_payment_id,
      },
    });
  } catch (error) {
    console.error(
      "Razorpay Payment Verification Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};