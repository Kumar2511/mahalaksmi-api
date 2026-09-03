import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Coupon from "../models/Coupon.js";
import ShippingSettings from "../models/ShippingSettings.js";
import { validateUPIPaymentScreenshot } from "../utils/upiScreenshotValidator.js";

// ======================================
// Allowed Payment Methods
// ======================================

const ALLOWED_PAYMENT_METHODS = [
  "COD",
  "UPI",
  "Razorpay",
];
const UPI_PAYMENT_SESSION_MINUTES = 5;
const UPI_PAYMENT_SESSION_MS =
  UPI_PAYMENT_SESSION_MINUTES * 60 * 1000;

const expireUPIOrderIfNeeded = async (order) => {
  if (
    !order ||
    order.paymentMethod !== "UPI" ||
    order.paymentSessionStatus !== "Active"
  ) {
    return false;
  }

  const expiresAt = order.paymentSessionExpiresAt
    ? new Date(order.paymentSessionExpiresAt)
    : null;

  if (!expiresAt || expiresAt.getTime() > Date.now()) {
    return false;
  }

  // Prevent double stock restoration.
  order.paymentSessionStatus = "Expired";
  order.orderStatus = "Cancelled";
  order.paymentStatus = "Pending";
  order.upiPaymentProof = {
    submitted: false,
    screenshot: "",
    status: "Not Submitted",
    submittedAt: null,
    verifiedAt: null,
    adminNote: "UPI payment session expired after 5 minutes.",
  };

  for (const item of order.products || []) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stock: item.quantity },
    });
  }

  await order.save();
  return true;
};


// ======================================
// Create Order
// ======================================

export const createOrder = async (req, res) => {
  try {
    const {
      customerName,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      products,
      paymentMethod,
      couponCode,
    } = req.body;

    // ======================================
    // Basic Customer Validation
    // ======================================

    if (
      !customerName ||
      !phone ||
      !address ||
      !city ||
      !state ||
      !pincode
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please fill all required customer details.",
      });
    }

    // ======================================
    // Payment Method Validation
    // ======================================

    const selectedPaymentMethod =
      paymentMethod || "COD";

    if (
      !ALLOWED_PAYMENT_METHODS.includes(
        selectedPaymentMethod
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method.",
      });
    }

    // ======================================
    // Products Validation
    // ======================================

    if (
      !Array.isArray(products) ||
      products.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order must contain at least one product.",
      });
    }

    // ======================================
    // Prepare Products From Database
    // ======================================

    const orderProducts = [];

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
          message:
            "Invalid product quantity.",
        });
      }

      // ======================================
      // Get Actual Product
      // ======================================

      const product =
        await Product.findById(
          item.productId
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      // ======================================
      // Stock Validation
      // ======================================

      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} has only ${product.stock} item(s) available.`,
        });
      }

      // ======================================
      // Database Price
      // ======================================

      const price =
        Number(
          product.discountPrice > 0
            ? product.discountPrice
            : product.price
        ) || 0;

      const itemTotal =
        price * quantity;

      subtotal += itemTotal;

      // ======================================
      // Preserve Variants
      // ======================================

      orderProducts.push({
        productId: product._id,

        name: product.name,

        image:
          product.images?.[0] || "",

        price,

        quantity,

        color:
          item.color || "",

        size:
          item.size || "",
      });
    }

    // ======================================
    // Round Subtotal
    // ======================================

    subtotal =
      Math.round(subtotal * 100) /
      100;

    // ======================================
    // Shipping Settings
    // ======================================

    let shippingSettings =
      await ShippingSettings.findOne();

    if (!shippingSettings) {
      shippingSettings =
        await ShippingSettings.create({});
    }

    // ======================================
    // Calculate Shipping
    // ======================================

    let shippingAmount = 0;

    if (
      shippingSettings.freeShippingEnabled &&
      subtotal >=
        Number(
          shippingSettings.freeShippingMinimum ||
            0
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
    // Pincode Delivery Rule
    // ======================================

    const normalizedPincode =
      String(pincode).trim();

    const deliveryRule =
      shippingSettings.deliveryRules?.find(
        (rule) =>
          rule.active &&
          String(rule.pincode).trim() ===
            normalizedPincode
      );

    // ======================================
    // Delivery Days
    // ======================================

    const deliveryDays =
      deliveryRule?.deliveryDays ||
      null;

    // ======================================
    // Estimated Delivery
    // ======================================

    let estimatedDelivery = null;

    if (deliveryDays) {
      estimatedDelivery = new Date();

      estimatedDelivery.setDate(
        estimatedDelivery.getDate() +
          Number(deliveryDays)
      );
    }

    // ======================================
    // COD Charge
    // ======================================

    if (
      selectedPaymentMethod === "COD"
    ) {
      shippingAmount +=
        Number(
          shippingSettings.codCharge || 0
        );
    }

    // ======================================
    // Coupon
    // ======================================

    let discountAmount = 0;

    let appliedCoupon = null;

    const normalizedCouponCode =
      couponCode
        ?.trim()
        .toUpperCase();

    if (normalizedCouponCode) {
      appliedCoupon =
        await Coupon.findOne({
          code: normalizedCouponCode,
          isActive: true,
        });

      // ======================================
      // Coupon Exists
      // ======================================

      if (!appliedCoupon) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid or inactive coupon code.",
        });
      }

      // ======================================
      // Expiry
      // ======================================

      if (
        appliedCoupon.expiresAt &&
        new Date() >
          new Date(
            appliedCoupon.expiresAt
          )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This coupon has expired.",
        });
      }

      // ======================================
      // Usage Limit
      // ======================================

      if (
        appliedCoupon.usageLimit !==
          null &&
        appliedCoupon.usedCount >=
          appliedCoupon.usageLimit
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Coupon usage limit has been reached.",
        });
      }

      // ======================================
      // Minimum Order
      // ======================================

      if (
        subtotal <
        Number(
          appliedCoupon.minOrderAmount ||
            0
        )
      ) {
        return res.status(400).json({
          success: false,
          message: `Minimum order value is ₹${Number(
            appliedCoupon.minOrderAmount || 0
          ).toLocaleString("en-IN")}.`,
        });
      }

      // ======================================
      // Calculate Discount
      // ======================================

      if (
        appliedCoupon.type ===
        "percentage"
      ) {
        discountAmount =
          (subtotal *
            Number(
              appliedCoupon.value
            )) /
          100;

        // Maximum Discount
        if (
          appliedCoupon.maxDiscount !==
            null &&
          appliedCoupon.maxDiscount !==
            undefined
        ) {
          discountAmount =
            Math.min(
              discountAmount,
              Number(
                appliedCoupon.maxDiscount
              )
            );
        }
      } else if (
        appliedCoupon.type ===
        "fixed"
      ) {
        discountAmount =
          Number(
            appliedCoupon.value
          );
      }

      // Discount cannot exceed subtotal
      discountAmount =
        Math.min(
          discountAmount,
          subtotal
        );

      discountAmount =
        Math.round(
          discountAmount * 100
        ) / 100;
    }

    // ======================================
    // Final Total
    // ======================================

    const totalAmount =
      Math.max(
        subtotal -
          discountAmount +
          shippingAmount,
        0
      );

    // ======================================
    // Payment Status
    // ======================================

    let paymentStatus = "Pending";

    if (
      selectedPaymentMethod ===
      "Razorpay"
    ) {
      paymentStatus = "Paid";
    }

    // ======================================
    // Reduce Stock
    // ======================================

    const stockReducedItems = [];

    try {
      for (const item of orderProducts) {
        const updatedProduct =
          await Product.findOneAndUpdate(
            {
              _id: item.productId,
              stock: {
                $gte: item.quantity,
              },
            },
            {
              $inc: {
                stock:
                  -item.quantity,
              },
            },
            {
              new: true,
            }
          );

        if (!updatedProduct) {
          throw new Error(
            `${item.name} is no longer available in the requested quantity.`
          );
        }

        stockReducedItems.push({
          productId:
            item.productId,
          quantity:
            item.quantity,
        });
      }

      // ======================================
      // Create Order
      // ======================================

      const order =
        await Order.create({
          user: req.user._id,

          customerName,

          phone,

          email:
            email || "",

          address,

          city,

          state,

          pincode,

          products:
            orderProducts,

          subtotal,

          discountAmount,

          shippingAmount,

          couponCode:
            appliedCoupon
              ? appliedCoupon.code
              : "",

          totalAmount,

          paymentMethod:
            selectedPaymentMethod,

          paymentSessionStartedAt:
            selectedPaymentMethod === "UPI"
              ? new Date()
              : null,

          paymentSessionExpiresAt:
            selectedPaymentMethod === "UPI"
              ? new Date(
                  Date.now() +
                    UPI_PAYMENT_SESSION_MS
                )
              : null,

          paymentSessionStatus:
            selectedPaymentMethod === "UPI"
              ? "Active"
              : "Not Started",

          paymentStatus,

          upiPaymentProof:
            selectedPaymentMethod ===
            "UPI"
              ? {
                  submitted: false,
                  screenshot: "",
                  status:
                    "Not Submitted",
                  submittedAt:
                    null,
                  verifiedAt:
                    null,
                  adminNote: "",
                }
              : undefined,

          estimatedDelivery,
        });

      // ======================================
      // Increment Coupon Usage
      // ======================================

      if (appliedCoupon) {
        await Coupon.findByIdAndUpdate(
          appliedCoupon._id,
          {
            $inc: {
              usedCount: 1,
            },
          }
        );
      }

      // ======================================
      // Response
      // ======================================

      return res.status(201).json({
        success: true,

        message:
          selectedPaymentMethod ===
          "UPI"
            ? "UPI order created. Please submit your payment proof."
            : "Order placed successfully.",

        order,
      });
    } catch (orderError) {
      // ======================================
      // Rollback Stock
      // ======================================

      for (
        const item of stockReducedItems
      ) {
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: {
              stock: item.quantity,
            },
          }
        );
      }

      throw orderError;
    }
  } catch (error) {
    console.error(
      "Create Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Customer - My Orders
// ======================================

export const getMyOrders = async (
  req,
  res
) => {
  try {
    const orders =
      await Order.find({
        user: req.user._id,
      }).sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error(
      "Get My Orders Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Customer - Get Single Order
// ======================================

export const getMyOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findOne({
        _id: req.params.id,
        user: req.user._id,
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const expired =
      await expireUPIOrderIfNeeded(order);

    return res.status(200).json({
      success: true,
      order,
      paymentSessionExpired:
        expired ||
        order.paymentSessionStatus === "Expired",
      paymentSessionExpiresAt:
        order.paymentSessionExpiresAt || null,
    });
  } catch (error) {
    console.error(
      "Get My Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Customer - Cancel Order
// ======================================

export const cancelMyOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findOne({
        _id: req.params.id,
        user: req.user._id,
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // ======================================
    // Already Cancelled
    // ======================================

    if (
      order.orderStatus ===
      "Cancelled"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order is already cancelled.",
      });
    }

    // ======================================
    // Cancellable Status
    // ======================================

    const cancellableStatuses = [
      "Pending",
      "Confirmed",
    ];

    if (
      !cancellableStatuses.includes(
        order.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This order can no longer be cancelled.",
      });
    }

    // ======================================
    // Restore Product Stock
    // ======================================

    for (
      const item of order.products
    ) {
      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            stock: item.quantity,
          },
        }
      );
    }

    // ======================================
    // Cancel Order
    // ======================================

    order.orderStatus =
      "Cancelled";

    if (order.paymentMethod === "UPI") {
      order.paymentSessionStatus =
        order.paymentSessionStatus === "Completed"
          ? "Completed"
          : "Expired";
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message:
        "Order cancelled successfully.",
      order,
    });
  } catch (error) {
    console.error(
      "Cancel Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Cancel Order
// ======================================

export const adminCancelOrder = async (
  req,
  res
) => {
  try {
    const order = await Order.findById(
      req.params.id
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // ======================================
    // Already Cancelled
    // ======================================

    if (
      order.orderStatus === "Cancelled"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order is already cancelled.",
      });
    }

    // ======================================
    // Cancellable Status
    // ======================================

    const cancellableStatuses = [
      "Pending",
      "Confirmed",
    ];

    if (
      !cancellableStatuses.includes(
        order.orderStatus
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This order can no longer be cancelled.",
      });
    }

    // ======================================
    // Cancellation Reason
    // ======================================

    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "";

    if (!reason) {
      return res.status(400).json({
        success: false,
        message:
          "Cancellation reason is required.",
      });
    }

    // ======================================
    // Restore Product Stock
    // ======================================

    for (
      const item of order.products
    ) {
      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            stock: item.quantity,
          },
        }
      );
    }

    // ======================================
    // Cancel Order
    // ======================================

    order.orderStatus =
      "Cancelled";

    // Save admin cancellation reason
    order.cancellationFeedback = {
      submitted: true,
      reason,
      comment:
        "Cancelled by admin.",
      submittedAt: new Date(),
    };

    await order.save();

    return res.status(200).json({
      success: true,
      message:
        "Order cancelled successfully.",
      order,
    });
  } catch (error) {
    console.error(
      "Admin cancel order error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to cancel order.",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

// ======================================
// Customer - Submit Cancellation Feedback
// ======================================

export const submitCancellationFeedback =
  async (req, res) => {
    try {
      const {
        reason,
        comment,
      } = req.body;

      // ======================================
      // Find Customer Order
      // ======================================

      const order =
        await Order.findOne({
          _id: req.params.id,
          user: req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found.",
        });
      }

      // ======================================
      // Must Be Cancelled
      // ======================================

      if (
        order.orderStatus !==
        "Cancelled"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Cancellation feedback can only be submitted for cancelled orders.",
        });
      }

      // ======================================
      // Validate Reason
      // ======================================

      if (
        !reason ||
        !reason.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please select a cancellation reason.",
        });
      }

      // ======================================
      // Prevent Duplicate Feedback
      // ======================================

      if (
        order.cancellationFeedback
          ?.submitted
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Cancellation feedback has already been submitted.",
        });
      }

      // ======================================
      // Save Feedback
      // ======================================

      order.cancellationFeedback = {
        submitted: true,

        reason:
          reason.trim(),

        comment:
          comment?.trim() || "",

        submittedAt:
          new Date(),
      };

      await order.save();

      return res.status(200).json({
        success: true,
        message:
          "Thank you for your feedback. It helps us improve our service.",
        order,
      });
    } catch (error) {
      console.error(
        "Cancellation Feedback Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// ======================================
// Customer - Submit UPI Payment Proof
// ======================================

export const submitUPIPaymentProof =
  async (req, res) => {
    try {
      const order =
        await Order.findOne({
          _id: req.params.id,
          user: req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,
          validScreenshot: false,
          orderCreated: false,
          message: "Order not found.",
        });
      }

      // ======================================
      // UPI ONLY
      // ======================================
      if (order.paymentMethod !== "UPI") {
        return res.status(400).json({
          success: false,
          validScreenshot: false,
          orderCreated: true,
          message:
            "This order does not use UPI payment.",
        });
      }

      // ======================================
      // 5-MINUTE SESSION CHECK
      // ======================================
      const expired =
        await expireUPIOrderIfNeeded(order);

      if (
        expired ||
        order.paymentSessionStatus !== "Active" ||
        !order.paymentSessionExpiresAt ||
        new Date(order.paymentSessionExpiresAt).getTime() <=
          Date.now()
      ) {
        return res.status(410).json({
          success: false,
          validScreenshot: false,
          orderCreated: false,
          paymentSessionExpired: true,
          message:
            "Payment session expired. The order was moved back to your cart.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          validScreenshot: false,
          orderCreated: true,
          message:
            "Please upload your UPI payment screenshot.",
        });
      }

      // ======================================
      // AUTOMATIC UPI SCREENSHOT FINDER
      // ======================================
      const validation =
        await validateUPIPaymentScreenshot({
          buffer: req.file.buffer,
          expectedAmount: order.totalAmount,
          expectedUPIId: "",
        });

      if (!validation.validScreenshot) {
        return res.status(400).json({
          success: false,
          validScreenshot: false,
          orderCreated: true,
          paymentSessionExpired: false,
          qrFound:
            validation.qrFound || false,
          transactionIdFound:
            validation.transactionIdFound || false,
          amountMatches:
            validation.amountMatches || false,
          message:
            validation.reason ||
            "Invalid UPI payment screenshot.",
        });
      }

      // ======================================
      // SAVE ONLY AFTER VALIDATION
      // ======================================
      // Store a data URL so this flow does not depend
      // on a second /upload call.
      const screenshotDataUrl =
        `data:${req.file.mimetype};base64,` +
        req.file.buffer.toString("base64");

      order.upiPaymentProof = {
        submitted: true,
        screenshot: screenshotDataUrl,
        status: "Pending Verification",
        submittedAt: new Date(),
        verifiedAt: null,
        adminNote:
          `Automatic validation passed. ` +
          `Transaction ID: ${validation.transactionId || "detected"}. ` +
          `Amount matched: ₹${Number(order.totalAmount).toFixed(2)}.`,
      };

      order.paymentStatus = "Pending";
      order.paymentSessionStatus = "Completed";

      await order.save();

      return res.status(200).json({
        success: true,
        validScreenshot: true,
        orderCreated: true,
        paymentSessionExpired: false,
        qrFound: validation.qrFound,
        transactionIdFound:
          validation.transactionIdFound,
        transactionId:
          validation.transactionId || "",
        amountMatches:
          validation.amountMatches,
        message:
          "UPI payment screenshot validated successfully. Payment is pending admin verification.",
        order,
      });
    } catch (error) {
      console.error(
        "Submit UPI Payment Proof Error:",
        error
      );

      return res.status(500).json({
        success: false,
        validScreenshot: false,
        orderCreated: false,
        message: error.message,
      });
    }
  };


// ======================================
// CUSTOMER - PRE-VALIDATE UPI PAYMENT PROOF
// IMPORTANT: This endpoint NEVER creates an order.
// It only analyzes the uploaded screenshot.
// ======================================

export const validateUPIPaymentProof = async (
  req,
  res
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        validScreenshot: false,
        message: "Please upload a payment screenshot.",
      });
    }

    const expectedAmount = Number(
      req.body.expectedAmount
    );

    const expectedUPIId = String(
      req.body.expectedUPIId || ""
    ).trim();

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      return res.status(400).json({
        success: false,
        validScreenshot: false,
        message: "Invalid payment amount.",
      });
    }

    if (!expectedUPIId) {
      return res.status(400).json({
        success: false,
        validScreenshot: false,
        message: "UPI payment ID is not configured.",
      });
    }

    const validation =
      await validateUPIPaymentScreenshot({
        buffer: req.file.buffer,
        expectedAmount,
        expectedUPIId,
      });

    if (!validation?.validScreenshot) {
      return res.status(422).json({
        success: false,
        validScreenshot: false,
        orderCreated: false,
        qrFound: Boolean(validation?.qrFound),
        transactionIdFound: Boolean(
          validation?.transactionIdFound ||
          validation?.transactionId
        ),
        transactionId: validation?.transactionId || "",
        amountMatches: Boolean(
          validation?.amountMatches
        ),
        message:
          validation?.reason ||
          "Invalid UPI payment screenshot. Please upload the actual successful payment receipt.",
      });
    }

    return res.status(200).json({
      success: true,
      validScreenshot: true,
      orderCreated: false,
      qrFound: Boolean(validation.qrFound),
      transactionIdFound: Boolean(
        validation.transactionIdFound ||
        validation.transactionId
      ),
      transactionId: validation.transactionId || "",
      amountMatches: Boolean(validation.amountMatches),
      message:
        "Payment screenshot verified successfully. You may now submit the payment proof.",
    });
  } catch (error) {
    console.error(
      "Pre-Validate UPI Payment Proof Error:",
      error
    );

    return res.status(422).json({
      success: false,
      validScreenshot: false,
      orderCreated: false,
      message:
        "Unable to analyze this screenshot. Please upload a clear successful UPI payment screenshot.",
    });
  }
};

// ======================================
// Customer - Expire UPI Payment Session
// ======================================

export const expireUPIPaymentSession =
  async (req, res) => {
    try {
      const order =
        await Order.findOne({
          _id: req.params.id,
          user: req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      const expired =
        await expireUPIOrderIfNeeded(order);

      if (
        !expired &&
        order.paymentSessionStatus === "Active"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This payment session has not expired yet.",
          expiresAt:
            order.paymentSessionExpiresAt,
        });
      }

      return res.status(200).json({
        success: true,
        paymentSessionExpired: true,
        message:
          "Payment session expired. The order was moved back to your cart.",
        order,
      });
    } catch (error) {
      console.error(
        "Expire UPI Payment Session Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// ======================================
// Admin - Approve UPI Payment
// ======================================

export const approveUPIPayment =
  async (req, res) => {
    try {
      const order =
        await Order.findById(
          req.params.id
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found.",
        });
      }

      // ======================================
      // Must Be UPI
      // ======================================

      if (
        order.paymentMethod !==
        "UPI"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This order does not use UPI payment.",
        });
      }

      // ======================================
      // Proof Required
      // ======================================

      if (
        !order.upiPaymentProof
          ?.submitted ||
        !order.upiPaymentProof
          ?.screenshot
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment proof has not been submitted.",
        });
      }

      // ======================================
      // Already Approved
      // ======================================

      if (
        order.upiPaymentProof
          .status === "Approved"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment is already approved.",
        });
      }

      // ======================================
      // Approve Payment
      // ======================================

      order.upiPaymentProof.status =
        "Approved";

      order.upiPaymentProof.verifiedAt =
        new Date();

      order.upiPaymentProof.adminNote =
        req.body.adminNote?.trim() ||
        "";

      order.paymentStatus =
        "Paid";

      order.orderStatus =
        "Confirmed";

      await order.save();

      return res.status(200).json({
        success: true,
        message:
          "UPI payment approved successfully.",
        order,
      });
    } catch (error) {
      console.error(
        "Approve UPI Payment Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// ======================================
// Admin - Reject UPI Payment
// ======================================

export const rejectUPIPayment =
  async (req, res) => {
    try {
      const order =
        await Order.findById(
          req.params.id
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found.",
        });
      }

      // ======================================
      // Must Be UPI
      // ======================================

      if (
        order.paymentMethod !==
        "UPI"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This order does not use UPI payment.",
        });
      }

      // ======================================
      // Proof Required
      // ======================================

      if (
        !order.upiPaymentProof
          ?.submitted
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No payment proof was submitted.",
        });
      }

      // ======================================
      // Already Rejected
      // ======================================

      if (
        order.upiPaymentProof
          .status === "Rejected" &&
        order.orderStatus ===
          "Cancelled"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This payment has already been rejected.",
        });
      }

      // ======================================
      // Restore Stock
      // ======================================

      for (
        const item of order.products
      ) {
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: {
              stock: item.quantity,
            },
          }
        );
      }

      // ======================================
      // Reject Payment
      // ======================================

      order.upiPaymentProof.status =
        "Rejected";

      order.upiPaymentProof.verifiedAt =
        new Date();

      order.upiPaymentProof.adminNote =
        req.body.adminNote?.trim() ||
        "UPI payment proof was rejected.";

      order.paymentStatus =
        "Pending";

      // Since stock is released,
      // cancel the order so the same
      // reserved stock isn't reused.
      order.orderStatus =
        "Cancelled";

      await order.save();

      return res.status(200).json({
        success: true,
        message:
          "UPI payment rejected and order cancelled. Stock has been restored.",
        order,
      });
    } catch (error) {
      console.error(
        "Reject UPI Payment Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// ======================================
// Admin - Get All Orders
// ======================================

export const getOrders = async (
  req,
  res
) => {
  try {
    const orders =
      await Order.find()
        .populate(
          "user",
          "name email"
        )
        .sort({
          createdAt: -1,
        });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error(
      "Get Orders Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Get Single Order
// ======================================

export const getOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findById(
        req.params.id
      ).populate(
        "user",
        "name email"
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error(
      "Get Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Update Order
// ======================================

export const updateOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findById(
        req.params.id
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }

    // ======================================
    // Order Status
    // ======================================

    if (
      req.body.orderStatus
    ) {
      order.orderStatus =
        req.body.orderStatus;
    }

    // ======================================
    // Payment Status
    // ======================================

    if (
      req.body.paymentStatus
    ) {
      order.paymentStatus =
        req.body.paymentStatus;
    }

    // ======================================
    // Tracking Number
    // ======================================

    if (
      req.body.trackingNumber !==
      undefined
    ) {
      order.trackingNumber =
        req.body.trackingNumber;
    }

    // ======================================
    // Courier Name
    // ======================================

    if (
      req.body.courierName !==
      undefined
    ) {
      order.courierName =
        req.body.courierName;
    }

    // ======================================
    // Estimated Delivery
    // ======================================

    if (
      req.body.estimatedDelivery !==
      undefined
    ) {
      order.estimatedDelivery =
        req.body.estimatedDelivery;
    }

    // ======================================
    // Admin Notes
    // ======================================

    if (
      req.body.adminNotes !==
      undefined
    ) {
      order.adminNotes =
        req.body.adminNotes;
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message:
        "Order updated successfully.",
      order,
    });
  } catch (error) {
    console.error(
      "Update Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Delete Order
// ======================================

export const deleteOrder = async (
  req,
  res
) => {
  try {
    const order =
      await Order.findById(
        req.params.id
      );

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }

    await order.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Order deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Order Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};