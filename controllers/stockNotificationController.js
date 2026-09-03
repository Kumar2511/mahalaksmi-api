import StockNotification from "../models/StockNotification.js";
import Product from "../models/Product.js";
import { sendRestockEmail, sendAdminStockNotificationEmail } from "../utils/sendEmail.js";

// ======================================
// Subscribe For Back-In-Stock Notification
// ======================================

export const subscribeStockNotification = async (
  req,
  res
) => {
  try {
    const {
      productId,
      email,
    } = req.body;

    // ======================================
    // Validate Product ID
    // ======================================

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    // ======================================
    // Validate Email
    // ======================================

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid email address.",
      });
    }

    // ======================================
    // Find Product
    // ======================================

    const product =
      await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // ======================================
    // Product Already Available
    // ======================================

    if (Number(product.stock) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This product is currently available.",
      });
    }

    // ======================================
    // Check Existing Request
    // ======================================

    const existingRequest =
      await StockNotification.findOne({
        product: product._id,
        email: normalizedEmail,
      });

    if (existingRequest) {
      // Already waiting
      if (!existingRequest.notified) {
        return res.status(409).json({
          success: false,
          message:
            "You are already on the notification list for this product.",
        });
      }

      // Previously notified, allow subscribing again
      existingRequest.notified = false;
      existingRequest.notifiedAt = null;

      await existingRequest.save();

      return res.status(200).json({
        success: true,
        message:
          "You have been added to the notification list again.",
        notification: existingRequest,
      });
    }

    // ======================================
    // Create Notification Request
    // ======================================

    const notification =
      await StockNotification.create({
        product: product._id,
        email: normalizedEmail,
        user: req.user?._id || null,
        notified: false,
      });

    // Notify Admin via Email asynchronously
    sendAdminStockNotificationEmail({
      customerEmail: normalizedEmail,
      product,
    }).catch((adminErr) => {
      console.error("Admin Stock Notification Email Error:", adminErr);
    });

    return res.status(201).json({
      success: true,
      message:
        "You will be notified when this product is back in stock.",
      notification,
    });
  } catch (error) {
    console.error(
      "Stock Notification Subscribe Error:",
      error
    );

    // ======================================
    // Duplicate Key Protection
    // ======================================

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "You are already subscribed for this product.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to save your notification request.",
    });
  }
};

// ======================================
// Check Existing Subscription
// ======================================

export const checkStockNotification =
  async (req, res) => {
    try {
      const {
        productId,
        email,
      } = req.query;

      if (!productId || !email) {
        return res.status(400).json({
          success: false,
          message:
            "Product ID and email are required.",
        });
      }

      const notification =
        await StockNotification.findOne({
          product: productId,
          email: String(email)
            .trim()
            .toLowerCase(),
          notified: false,
        });

      return res.status(200).json({
        success: true,
        subscribed:
          Boolean(notification),
      });
    } catch (error) {
      console.error(
        "Check Stock Notification Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// ======================================
// Admin - Get Pending Notifications
// ======================================

export const getStockNotifications =
  async (req, res) => {
    try {
      const notifications =
        await StockNotification.find({
          notified: false,
        })
          .populate(
            "product",
            "name images stock"
          )
          .populate(
            "user",
            "name email"
          )
          .sort({
            createdAt: -1,
          });

      return res.status(200).json({
        success: true,
        count: notifications.length,
        notifications,
      });
    } catch (error) {
      console.error(
        "Get Stock Notifications Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };
  // ======================================
// Admin - Delete / Decline Notification
// ======================================

export const deleteStockNotification = async (
  req,
  res
) => {
  try {
    const notification =
      await StockNotification.findById(
        req.params.id
      );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Stock notification request not found.",
      });
    }

    await notification.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Stock notification request declined successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Stock Notification Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to decline stock notification request.",
    });
  }
};

// ======================================
// Helper: Process Pending Restock Notifications
// ======================================
export const processProductRestockNotifications = async (productId, productData) => {
  try {
    if (!productId) return;

    const pendingSubscribers = await StockNotification.find({
      product: productId,
      notified: false,
    });

    if (!pendingSubscribers || pendingSubscribers.length === 0) {
      console.log(`ℹ️ No pending stock notification subscribers for product: ${productId}`);
      return;
    }

    console.log(`🔔 Found ${pendingSubscribers.length} subscribers waiting for restock of: ${productData?.name || productId}`);

    for (const sub of pendingSubscribers) {
      try {
        const sent = await sendRestockEmail({
          email: sub.email,
          product: productData,
        });

        if (sent) {
          sub.notified = true;
          sub.notifiedAt = new Date();
          await sub.save();
          console.log(`✅ Marked notification as sent for: ${sub.email}`);
        } else {
          console.error(`⚠️ Email dispatch failed for ${sub.email}, leaving notified: false`);
        }
      } catch (subErr) {
        console.error(`❌ Error processing restock notification for ${sub.email}:`, subErr);
      }
    }
  } catch (error) {
    console.error("Process Stock Notifications Error:", error);
  }
};