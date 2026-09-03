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

// ======================================
// Legacy UPI Order Expiry
// IMPORTANT:
// This is kept only for old UPI orders that
// already exist in MongoDB.
// New UPI checkout does NOT create an order.
// ======================================

const expireUPIOrderIfNeeded = async (order) => {
  if (
    !order ||
    order.paymentMethod !== "UPI" ||
    order.paymentSessionStatus !== "Active"
  ) {
    return false;
  }

  const expiresAt =
    order.paymentSessionExpiresAt
      ? new Date(order.paymentSessionExpiresAt)
      : null;

  if (
    !expiresAt ||
    expiresAt.getTime() > Date.now()
  ) {
    return false;
  }

  order.paymentSessionStatus =
    "Expired";

  order.orderStatus =
    "Cancelled";

  order.paymentStatus =
    "Pending";

  order.upiPaymentProof = {
    submitted: false,
    screenshot: "",
    status: "Not Submitted",
    submittedAt: null,
    verifiedAt: null,
    adminNote:
      "UPI payment session expired after 5 minutes.",
  };

  for (
    const item of order.products || []
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

  await order.save();

  return true;
};

// ======================================
// BUILD ORDER DATA
//
// IMPORTANT:
// Prices are always read from MongoDB.
// The frontend total is NOT trusted.
//
// This function does NOT create an order.
// It does NOT reduce stock.
// ======================================

const buildOrderData = async (
  body,
  paymentMethod
) => {
  const {
    customerName,
    phone,
    email,
    address,
    city,
    state,
    pincode,
    products,
    couponCode,
  } = body;

  // ======================================
  // Customer Validation
  // ======================================

  if (
    !customerName ||
    !phone ||
    !address ||
    !city ||
    !state ||
    !pincode
  ) {
    throw new Error(
      "Please fill all required customer details."
    );
  }

  // ======================================
  // Products Validation
  // ======================================

  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    throw new Error(
      "Order must contain at least one product."
    );
  }

  const orderProducts = [];

  let subtotal = 0;

  // ======================================
  // Read Products From MongoDB
  // ======================================

  for (
    const item of products
  ) {
    if (!item.productId) {
      throw new Error(
        "Product ID is required."
      );
    }

    const quantity =
      Number(item.quantity) || 0;

    if (quantity < 1) {
      throw new Error(
        "Invalid product quantity."
      );
    }

    const product =
      await Product.findById(
        item.productId
      );

    if (!product) {
      throw new Error(
        "Product not found."
      );
    }

    if (
      product.stock <
      quantity
    ) {
      throw new Error(
        `${product.name} has only ${product.stock} item(s) available.`
      );
    }

    // ======================================
    // TRUST DATABASE PRICE
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

    orderProducts.push({
      productId:
        product._id,

      name:
        product.name,

      image:
        product.images?.[0] ||
        "",

      price,

      quantity,

      color:
        item.color || "",

      size:
        item.size || "",
    });
  }

  subtotal =
    Math.round(
      subtotal * 100
    ) / 100;

  // ======================================
  // SHIPPING SETTINGS
  // ======================================

  let shippingSettings =
    await ShippingSettings.findOne();

  if (!shippingSettings) {
    shippingSettings =
      await ShippingSettings.create(
        {}
      );
  }

  // ======================================
  // SHIPPING
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
        shippingSettings.shippingCharge ||
          0
      );
  }

  // ======================================
  // PINCODE DELIVERY RULE
  // ======================================

  const normalizedPincode =
    String(pincode).trim();

  const deliveryRule =
    shippingSettings.deliveryRules?.find(
      (rule) =>
        rule.active &&
        String(
          rule.pincode
        ).trim() ===
          normalizedPincode
    );

  // ======================================
  // DELIVERY DAYS
  // ======================================

  const deliveryDays =
    deliveryRule?.deliveryDays ||
    null;

  let estimatedDelivery =
    null;

  if (deliveryDays) {
    estimatedDelivery =
      new Date();

    estimatedDelivery.setDate(
      estimatedDelivery.getDate() +
        Number(deliveryDays)
    );
  }

  // ======================================
  // COD CHARGE
  //
  // UPI does NOT receive COD charge.
  // ======================================

  if (
    paymentMethod ===
    "COD"
  ) {
    shippingAmount +=
      Number(
        shippingSettings.codCharge ||
          0
      );
  }

  // ======================================
  // COUPON
  // ======================================

  let discountAmount = 0;

  let appliedCoupon =
    null;

  const normalizedCouponCode =
    couponCode
      ?.trim()
      .toUpperCase();

  if (normalizedCouponCode) {
    appliedCoupon =
      await Coupon.findOne({
        code:
          normalizedCouponCode,

        isActive:
          true,
      });

    if (!appliedCoupon) {
      throw new Error(
        "Invalid or inactive coupon code."
      );
    }

    // ======================================
    // EXPIRY
    // ======================================

    if (
      appliedCoupon.expiresAt &&
      new Date() >
        new Date(
          appliedCoupon.expiresAt
        )
    ) {
      throw new Error(
        "This coupon has expired."
      );
    }

    // ======================================
    // USAGE LIMIT
    // ======================================

    if (
      appliedCoupon.usageLimit !==
        null &&
      appliedCoupon.usedCount >=
        appliedCoupon.usageLimit
    ) {
      throw new Error(
        "Coupon usage limit has been reached."
      );
    }

    // ======================================
    // MINIMUM ORDER
    // ======================================

    if (
      subtotal <
      Number(
        appliedCoupon.minOrderAmount ||
          0
      )
    ) {
      throw new Error(
        `Minimum order value is ₹${Number(
          appliedCoupon.minOrderAmount ||
            0
        ).toLocaleString(
          "en-IN"
        )}.`
      );
    }

    // ======================================
    // PERCENTAGE COUPON
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
    }

    // ======================================
    // FIXED COUPON
    // ======================================

    else if (
      appliedCoupon.type ===
      "fixed"
    ) {
      discountAmount =
        Number(
          appliedCoupon.value
        );
    }

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
  // FINAL SERVER-CALCULATED TOTAL
  // ======================================

  const totalAmount =
    Math.max(
      subtotal -
        discountAmount +
        shippingAmount,
      0
    );

  return {
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

    estimatedDelivery,

    appliedCoupon,
  };
};

// ======================================
// CREATE ORDER
// ======================================
//
// COD:
//   creates order immediately.
//
// Razorpay:
//   existing flow remains.
//
// UPI:
//   NEVER creates an Order here.
// ======================================

export const createOrder =
  async (req, res) => {
    try {
      const selectedPaymentMethod =
        req.body.paymentMethod ||
        "COD";

      if (
        !ALLOWED_PAYMENT_METHODS.includes(
          selectedPaymentMethod
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment method.",
        });
      }

      // ======================================
      // UPI
      //
      // IMPORTANT:
      // NO MongoDB Order.
      // NO stock reduction.
      // ======================================

      if (
        selectedPaymentMethod ===
        "UPI"
      ) {
        const data =
          await buildOrderData(
            req.body,
            "UPI"
          );

        const startedAt =
          new Date();

        const expiresAt =
          new Date(
            startedAt.getTime() +
              UPI_PAYMENT_SESSION_MS
          );

        return res.status(200).json({
          success: true,

          orderCreated:
            false,

          paymentSessionStartedAt:
            startedAt,

          paymentSessionExpiresAt:
            expiresAt,

          paymentSessionStatus:
            "Active",

          paymentMethod:
            "UPI",

          checkout: {
            subtotal:
              data.subtotal,

            discountAmount:
              data.discountAmount,

            shippingAmount:
              data.shippingAmount,

            totalAmount:
              data.totalAmount,
          },

          message:
            "UPI payment session started. No order has been created.",
        });
      }

      // ======================================
      // COD / RAZORPAY
      // ======================================

      const data =
        await buildOrderData(
          req.body,
          selectedPaymentMethod
        );

      const paymentStatus =
        selectedPaymentMethod ===
        "Razorpay"
          ? "Paid"
          : "Pending";

      const stockReducedItems =
        [];

      try {
        // ======================================
        // REDUCE STOCK
        // ======================================

        for (
          const item of
            data.products
        ) {
          const updatedProduct =
            await Product.findOneAndUpdate(
              {
                _id:
                  item.productId,

                stock: {
                  $gte:
                    item.quantity,
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
        // CREATE FINAL ORDER
        // ======================================

        const order =
          await Order.create({
            user:
              req.user._id,

            customerName:
              data.customerName,

            phone:
              data.phone,

            email:
              data.email,

            address:
              data.address,

            city:
              data.city,

            state:
              data.state,

            pincode:
              data.pincode,

            products:
              data.products,

            subtotal:
              data.subtotal,

            discountAmount:
              data.discountAmount,

            shippingAmount:
              data.shippingAmount,

            couponCode:
              data.couponCode,

            totalAmount:
              data.totalAmount,

            paymentMethod:
              selectedPaymentMethod,

            paymentStatus,

            razorpayOrderId:
              req.body
                .razorpayOrderId ||
              "",

            razorpayPaymentId:
              req.body
                .razorpayPaymentId ||
              "",

            estimatedDelivery:
              data.estimatedDelivery,
          });

        // ======================================
        // COUPON USAGE
        // ======================================

        if (
          data.appliedCoupon
        ) {
          await Coupon.findByIdAndUpdate(
            data.appliedCoupon._id,

            {
              $inc: {
                usedCount: 1,
              },
            }
          );
        }

        return res.status(201).json({
          success: true,

          orderCreated:
            true,

          message:
            "Order placed successfully.",

          order,
        });
      } catch (
        orderError
      ) {
        // ======================================
        // STOCK ROLLBACK
        // ======================================

        for (
          const item of
            stockReducedItems
        ) {
          await Product.findByIdAndUpdate(
            item.productId,
            {
              $inc: {
                stock:
                  item.quantity,
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

      return res.status(400).json({
        success: false,

        orderCreated:
          false,

        message:
          error.message,
      });
    }
  };

// ======================================
// Customer - My Orders
// ======================================

export const getMyOrders =
  async (
    req,
    res
  ) => {
    try {
      const orders =
        await Order.find({
          user:
            req.user._id,
        }).sort({
          createdAt:
            -1,
        });

      return res.status(200).json({
        success: true,

        count:
          orders.length,

        orders,
      });
    } catch (error) {
      console.error(
        "Get My Orders Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };

// ======================================
// Customer - Get Single Order
// ======================================

export const getMyOrder =
  async (
    req,
    res
  ) => {
    try {
      const order =
        await Order.findOne({
          _id:
            req.params.id,

          user:
            req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

      const expired =
        await expireUPIOrderIfNeeded(
          order
        );

      return res.status(200).json({
        success: true,

        order,

        paymentSessionExpired:
          expired ||
          order.paymentSessionStatus ===
            "Expired",

        paymentSessionExpiresAt:
          order.paymentSessionExpiresAt ||
          null,
      });
    } catch (error) {
      console.error(
        "Get My Order Error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message,
      });
    }
  };

// ======================================
// Customer - Cancel Order
// ======================================

export const cancelMyOrder =
  async (
    req,
    res
  ) => {
    try {
      const order =
        await Order.findOne({
          _id:
            req.params.id,

          user:
            req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

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

      // Check Admin-configured Cancellation Window
      const shippingSettings = await ShippingSettings.findOne();
      const cancellationWindowHours = Number(
        shippingSettings?.cancellationWindowHours ?? 24
      );

      const orderTime = new Date(order.createdAt).getTime();
      const hoursElapsed = (Date.now() - orderTime) / (1000 * 60 * 60);

      if (hoursElapsed > cancellationWindowHours) {
        return res.status(400).json({
          success: false,
          message: `The allowed cancellation window (${cancellationWindowHours} hours) for this order has expired.`,
        });
      }

      for (
        const item of
          order.products
      ) {
        await Product.findByIdAndUpdate(
          item.productId,

          {
            $inc: {
              stock:
                item.quantity,
            },
          }
        );
      }

      order.orderStatus =
        "Cancelled";

      if (
        order.paymentMethod ===
        "UPI"
      ) {
        order.paymentSessionStatus =
          order.paymentSessionStatus ===
          "Completed"
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

        message:
          error.message,
      });
    }
  };

// ======================================
// Admin - Cancel Order
// ======================================

export const adminCancelOrder =
  async (
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

      const cancellableStatuses =
        [
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

      const reason =
        typeof req.body?.reason ===
        "string"
          ? req.body.reason.trim()
          : "";

      if (!reason) {
        return res.status(400).json({
          success: false,

          message:
            "Cancellation reason is required.",
        });
      }

      for (
        const item of
          order.products
      ) {
        await Product.findByIdAndUpdate(
          item.productId,

          {
            $inc: {
              stock:
                item.quantity,
            },
          }
        );
      }

      order.orderStatus =
        "Cancelled";

      order.cancellationFeedback =
        {
          submitted:
            true,

          reason,

          comment:
            "Cancelled by admin.",

          submittedAt:
            new Date(),
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
  async (
    req,
    res
  ) => {
    try {
      const {
        reason,
        comment,
      } = req.body;

      const order =
        await Order.findOne({
          _id:
            req.params.id,

          user:
            req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

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

      order.cancellationFeedback =
        {
          submitted:
            true,

          reason:
            reason.trim(),

          comment:
            comment?.trim() ||
            "",

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

        message:
          error.message,
      });
    }
  };

  // ======================================
// Customer - FINAL UPI PAYMENT SUBMISSION
//
// IMPORTANT:
// This is the ONLY NEW UPI endpoint that
// creates the final MongoDB order.
//
// Flow:
//
// Screenshot
//     ↓
// Server validates again
//     ↓
// Amount calculated from MongoDB
//     ↓
// Screenshot amount must match
//     ↓
// Stock reduced
//     ↓
// Final Order created
// ======================================

export const submitUPIOrderAndProof =
  async (
    req,
    res
  ) => {
    try {
      // ======================================
      // FILE REQUIRED
      // ======================================

      if (!req.file) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          message:
            "Please upload your UPI payment screenshot.",
        });
      }

      // ======================================
      // PRODUCTS
      // ======================================

      let products;

      try {
        products =
          typeof req.body.products ===
          "string"
            ? JSON.parse(
                req.body.products
              )
            : req.body.products;
      } catch {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          message:
            "Invalid product data.",
        });
      }

      // ======================================
      // BUILD SERVER-SIDE ORDER DATA
      // ======================================

      const body = {
        ...req.body,

        products,

        paymentMethod:
          "UPI",
      };

      const data =
        await buildOrderData(
          body,
          "UPI"
        );

      // ======================================
      // 5-MINUTE SESSION
      //
      // Frontend sends the expiry timestamp.
      // Server refuses submission after expiry.
      // ======================================

      const sessionExpiresAt =
        req.body.paymentSessionExpiresAt
          ? new Date(
              req.body.paymentSessionExpiresAt
            )
          : null;

      if (
        !sessionExpiresAt ||
        Number.isNaN(
          sessionExpiresAt.getTime()
        ) ||
        sessionExpiresAt.getTime() <=
          Date.now()
      ) {
        return res.status(410).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          paymentSessionExpired:
            true,

          message:
            "Payment session expired. Please return to checkout and start a new UPI session.",
        });
      }

      // ======================================
      // UPI ID
      // ======================================

      const expectedUPIId =
        String(
          req.body.expectedUPIId ||
            ""
        ).trim();

      if (!expectedUPIId) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          message:
            "UPI payment ID is not configured.",
        });
      }

      // ======================================
      // SERVER-SIDE SCREENSHOT VALIDATION
      //
      // This is NOT trusting the frontend's
      // previous validation result.
      // ======================================

      const validation =
        await validateUPIPaymentScreenshot(
          {
            buffer:
              req.file.buffer,

            expectedAmount:
              data.totalAmount,

            expectedUPIId,
          }
        );

      // ======================================
      // VALIDATION FAILED
      // ======================================

      if (
        !validation?.validScreenshot ||
        !validation.amountMatches
      ) {
        return res.status(422).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          qrFound:
            Boolean(
              validation?.qrFound
            ),

          transactionIdFound:
            Boolean(
              validation?.transactionIdFound ||
              validation?.transactionId
            ),

          transactionId:
            validation?.transactionId ||
            "",

          amountMatches:
            Boolean(
              validation?.amountMatches
            ),

          message:
            validation?.reason ||
            "Payment proof could not be verified against this order amount.",
        });
      }

      // ======================================
      // REDUCE STOCK ONLY AFTER VALIDATION
      // ======================================

      const stockReducedItems =
        [];

      try {
        for (
          const item of
            data.products
        ) {
          const updatedProduct =
            await Product.findOneAndUpdate(
              {
                _id:
                  item.productId,

                stock: {
                  $gte:
                    item.quantity,
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
        // SCREENSHOT STORAGE
        // ======================================

        const now =
          new Date();

        const screenshotDataUrl =
          `data:${req.file.mimetype};base64,` +
          req.file.buffer.toString(
            "base64"
          );

        // ======================================
        // FINAL MONGODB ORDER
        // ======================================

        const order =
          await Order.create({
            user:
              req.user._id,

            customerName:
              data.customerName,

            phone:
              data.phone,

            email:
              data.email,

            address:
              data.address,

            city:
              data.city,

            state:
              data.state,

            pincode:
              data.pincode,

            products:
              data.products,

            subtotal:
              data.subtotal,

            discountAmount:
              data.discountAmount,

            shippingAmount:
              data.shippingAmount,

            couponCode:
              data.couponCode,

            totalAmount:
              data.totalAmount,

            paymentMethod:
              "UPI",

            paymentSessionStartedAt:
              new Date(
                sessionExpiresAt.getTime() -
                  UPI_PAYMENT_SESSION_MS
              ),

            paymentSessionExpiresAt:
              sessionExpiresAt,

            paymentSessionStatus:
              "Completed",

            paymentStatus:
              "Pending",

            upiPaymentProof:
              {
                submitted:
                  true,

                screenshot:
                  screenshotDataUrl,

                status:
                  "Pending Verification",

                submittedAt:
                  now,

                verifiedAt:
                  null,

                adminNote:
                  `Automatic validation passed. Transaction ID: ${
                    validation.transactionId ||
                    "detected"
                  }. Amount matched: ₹${Number(
                    data.totalAmount
                  ).toFixed(2)}.`,
              },

            estimatedDelivery:
              data.estimatedDelivery,
          });

        // ======================================
        // COUPON USAGE
        // ======================================

        if (
          data.appliedCoupon
        ) {
          await Coupon.findByIdAndUpdate(
            data.appliedCoupon._id,

            {
              $inc: {
                usedCount:
                  1,
              },
            }
          );
        }

        // ======================================
        // SUCCESS
        // ======================================

        return res.status(201).json({
          success: true,

          validScreenshot:
            true,

          orderCreated:
            true,

          paymentSessionExpired:
            false,

          qrFound:
            Boolean(
              validation.qrFound
            ),

          transactionIdFound:
            Boolean(
              validation.transactionIdFound ||
              validation.transactionId
            ),

          transactionId:
            validation.transactionId ||
            "",

          amountMatches:
            Boolean(
              validation.amountMatches
            ),

          message:
            "Payment proof verified and order created successfully. Payment is pending admin verification.",

          order,
        });
      } catch (
        orderError
      ) {
        // ======================================
        // STOCK ROLLBACK
        // ======================================

        for (
          const item of
            stockReducedItems
        ) {
          await Product.findByIdAndUpdate(
            item.productId,

            {
              $inc: {
                stock:
                  item.quantity,
              },
            }
          );
        }

        throw orderError;
      }
    } catch (error) {
      console.error(
        "Submit UPI Order And Proof Error:",
        error
      );

      return res.status(400).json({
        success: false,

        validScreenshot:
          false,

        orderCreated:
          false,

        message:
          error.message,
      });
    }
  };

// ======================================
// Legacy Customer - Submit UPI Payment Proof
//
// Kept only for already-created historical
// UPI orders.
//
// NEW checkout flow does NOT use this route.
// ======================================

export const submitUPIPaymentProof =
  async (
    req,
    res
  ) => {
    try {
      const order =
        await Order.findOne({
          _id:
            req.params.id,

          user:
            req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          message:
            "Order not found.",
        });
      }

      if (
        order.paymentMethod !==
        "UPI"
      ) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            true,

          message:
            "This order does not use UPI payment.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            true,

          message:
            "Please upload your UPI payment screenshot.",
        });
      }

      const validation =
        await validateUPIPaymentScreenshot(
          {
            buffer:
              req.file.buffer,

            expectedAmount:
              order.totalAmount,

            expectedUPIId:
              String(
                req.body
                  .expectedUPIId ||
                  ""
              ).trim(),
          }
        );

      if (
        !validation?.validScreenshot
      ) {
        return res.status(422).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            true,

          amountMatches:
            Boolean(
              validation?.amountMatches
            ),

          message:
            validation?.reason ||
            "Invalid UPI payment screenshot.",
        });
      }

      order.upiPaymentProof =
        {
          submitted:
            true,

          screenshot:
            `data:${req.file.mimetype};base64,` +
            req.file.buffer.toString(
              "base64"
            ),

          status:
            "Pending Verification",

          submittedAt:
            new Date(),

          verifiedAt:
            null,

          adminNote:
            "Automatic validation passed.",
        };

      order.paymentStatus =
        "Pending";

      order.paymentSessionStatus =
        "Completed";

      await order.save();

      return res.status(200).json({
        success: true,

        validScreenshot:
          true,

        orderCreated:
          true,

        message:
          "UPI payment proof submitted successfully.",

        order,
      });
    } catch (error) {
      console.error(
        "Legacy Submit UPI Payment Proof Error:",
        error
      );

      return res.status(500).json({
        success: false,

        validScreenshot:
          false,

        orderCreated:
          false,

        message:
          error.message,
      });
    }
  };

// ======================================
// CUSTOMER - PRE-VALIDATE UPI PAYMENT PROOF
//
// IMPORTANT:
// NEVER creates an order.
// ======================================

export const validateUPIPaymentProof =
  async (
    req,
    res
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          message:
            "Please upload a payment screenshot.",
        });
      }

      const expectedAmount =
        Number(
          req.body
            .expectedAmount
        );

      const expectedUPIId =
        String(
          req.body
            .expectedUPIId ||
            ""
        ).trim();

      if (
        !Number.isFinite(
          expectedAmount
        ) ||
        expectedAmount <= 0
      ) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          message:
            "Invalid payment amount.",
        });
      }

      if (!expectedUPIId) {
        return res.status(400).json({
          success: false,

          validScreenshot:
            false,

          message:
            "UPI payment ID is not configured.",
        });
      }

      const validation =
        await validateUPIPaymentScreenshot(
          {
            buffer:
              req.file.buffer,

            expectedAmount,

            expectedUPIId,
          }
        );

      if (
        !validation?.validScreenshot
      ) {
        return res.status(422).json({
          success: false,

          validScreenshot:
            false,

          orderCreated:
            false,

          qrFound:
            Boolean(
              validation?.qrFound
            ),

          transactionIdFound:
            Boolean(
              validation?.transactionIdFound ||
              validation?.transactionId
            ),

          transactionId:
            validation?.transactionId ||
            "",

          amountMatches:
            Boolean(
              validation?.amountMatches
            ),

          message:
            validation?.reason ||
            "Invalid UPI payment screenshot. Please upload the actual successful payment receipt.",
        });
      }

      return res.status(200).json({
        success: true,

        validScreenshot:
          true,

        orderCreated:
          false,

        qrFound:
          Boolean(
            validation.qrFound
          ),

        transactionIdFound:
          Boolean(
            validation.transactionIdFound ||
            validation.transactionId
          ),

        transactionId:
          validation.transactionId ||
          "",

        amountMatches:
          Boolean(
            validation.amountMatches
          ),

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

        validScreenshot:
          false,

        orderCreated:
          false,

        message:
          "Unable to analyze this screenshot. Please upload a clear successful UPI payment screenshot.",
      });
    }
  };

// ======================================
// Customer - Expire Legacy UPI Session
//
// New frontend expiry is handled locally and
// redirects directly to /checkout.
// This endpoint remains only for old orders.
// ======================================

export const expireUPIPaymentSession =
  async (
    req,
    res
  ) => {
    try {
      const order =
        await Order.findOne({
          _id:
            req.params.id,

          user:
            req.user._id,
        });

      if (!order) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found.",
        });
      }

      const expired =
        await expireUPIOrderIfNeeded(
          order
        );

      if (
        !expired &&
        order.paymentSessionStatus ===
          "Active"
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

        paymentSessionExpired:
          true,

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

        message:
          error.message,
      });
    }
  };

  // ======================================
// Admin - Approve UPI Payment
// ======================================

export const approveUPIPayment =
  async (
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

      if (
        order.upiPaymentProof
          .status ===
        "Approved"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Payment is already approved.",
        });
      }

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

        message:
          error.message,
      });
    }
  };

// ======================================
// Admin - Reject UPI Payment
// ======================================

export const rejectUPIPayment =
  async (
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

      if (
        order.upiPaymentProof
          .status ===
          "Rejected" &&
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
      // RESTORE STOCK
      // ======================================

      for (
        const item of
          order.products
      ) {
        await Product.findByIdAndUpdate(
          item.productId,

          {
            $inc: {
              stock:
                item.quantity,
            },
          }
        );
      }

      order.upiPaymentProof.status =
        "Rejected";

      order.upiPaymentProof.verifiedAt =
        new Date();

      order.upiPaymentProof.adminNote =
        req.body.adminNote?.trim() ||
        "UPI payment proof was rejected.";

      order.paymentStatus =
        "Pending";

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

        message:
          error.message,
      });
    }
  };

// ======================================
// Admin - Get All Orders
// ======================================

export const getOrders =
  async (
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
            createdAt:
              -1,
          });

      return res.status(200).json({
        success: true,

        count:
          orders.length,

        orders,
      });
    } catch (error) {
      console.error(
        "Get Orders Error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message,
      });
    }
  };

// ======================================
// Admin - Get Single Order
// ======================================

export const getOrder =
  async (
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

        message:
          error.message,
      });
    }
  };

// ======================================
// Admin - Update Order
// ======================================

export const updateOrder =
  async (
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

      if (
        req.body.orderStatus
      ) {
        order.orderStatus =
          req.body.orderStatus;
      }

      if (
        req.body.paymentStatus
      ) {
        order.paymentStatus =
          req.body.paymentStatus;
      }

      if (
        req.body.trackingNumber !==
        undefined
      ) {
        order.trackingNumber =
          req.body.trackingNumber;
      }

      if (
        req.body.courierName !==
        undefined
      ) {
        order.courierName =
          req.body.courierName;
      }

      if (
        req.body.estimatedDelivery !==
        undefined
      ) {
        order.estimatedDelivery =
          req.body.estimatedDelivery;
      }

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

        message:
          error.message,
      });
    }
  };

// ======================================
// Admin - Delete Order
// ======================================

export const deleteOrder =
  async (
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

        message:
          error.message,
      });
    }
  };

// ======================================
// Customer - Get Order Payment Status
// ======================================
export const getOrderPaymentStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this order status.",
      });
    }

    return res.status(200).json({
      success: true,
      orderId: order._id,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      isPaid: order.paymentStatus === "Paid",
      totalAmount: order.totalAmount,
      updatedAt: order.updatedAt,
    });
  } catch (error) {
    console.error("Get Order Payment Status Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};