import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import StockNotification from "../models/StockNotification.js";
import AdminNotification from "../models/AdminNotification.js";
import AdminDeviceToken from "../models/AdminDeviceToken.js";
import { sendAdminPushNotification } from "../services/fcmService.js";

/**
 * Trigger Admin Notification (Persistent DB record + FCM Push)
 * Safe failure: Never throws to caller.
 */
export async function triggerAdminNotification({
  type,
  title,
  message,
  link,
  relatedEntityId = "",
  relatedEntityType = "",
}) {
  try {
    // 1. Duplicate check (prevent duplicate notifications for same entity/action in 1 minute)
    if (relatedEntityId) {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const existing = await AdminNotification.findOne({
        type,
        relatedEntityId,
        createdAt: { $gte: oneMinuteAgo },
      });
      if (existing) {
        return existing;
      }
    }

    // 2. Save Persistent Notification to MongoDB
    const notification = await AdminNotification.create({
      type,
      title,
      message,
      link: link || "/admin",
      relatedEntityId: String(relatedEntityId || ""),
      relatedEntityType: String(relatedEntityType || ""),
      date: new Date(),
    });

    // 3. Dispatch FCM Push to registered Admin devices asynchronously
    sendAdminPushNotification({
      title,
      message,
      link: link || "/admin",
      data: {
        type,
        relatedEntityId: String(relatedEntityId || ""),
        relatedEntityType: String(relatedEntityType || ""),
        notificationId: String(notification._id),
      },
    }).catch((pushErr) => {
      console.error("FCM Push Dispatch Error:", pushErr?.message || pushErr);
    });

    return notification;
  } catch (error) {
    console.error("Trigger Admin Notification Error:", error?.message || error);
    return null;
  }
}

/**
 * GET /api/notifications
 * Preserves exact backward compatibility with NotificationBell & /admin/notifications
 */
export const getNotifications = async (req, res) => {
  try {
    const notifications = [];

    // 1. Read persistent notifications from MongoDB
    const dbNotifications = await AdminNotification.find()
      .sort({ createdAt: -1 })
      .limit(20);

    dbNotifications.forEach((n) => {
      notifications.push({
        _id: String(n._id),
        type: n.type,
        title: n.title,
        message: n.message,
        date: n.date || n.createdAt,
        link: n.link,
        read: n.read,
      });
    });

    // 2. Dynamic fallbacks for latest Orders (if not already captured)
    const latestOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);

    latestOrders.forEach((order) => {
      const link = `/admin/orders/${order._id}`;
      if (!notifications.some((n) => n.link === link)) {
        notifications.push({
          type: "order",
          title: "New Order",
          message: `${order.customerName || "Customer"} placed an order`,
          date: order.createdAt,
          link,
        });
      }
    });

    // 3. Dynamic fallbacks for Pending Stock Requests
    const stockRequests = await StockNotification.find({ notified: false })
      .populate("product", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    stockRequests.forEach((sub) => {
      const productName = sub.product?.name || "a product";
      const link = "/admin/stock-notifications";
      if (
        !notifications.some(
          (n) => n.type === "stock_request" && n.message?.includes(sub.email)
        )
      ) {
        notifications.push({
          type: "stock_request",
          title: "New Stock Notification Request",
          message: `${sub.email} requested restock alert for ${productName}`,
          date: sub.createdAt,
          link,
        });
      }
    });

    // 4. Dynamic fallbacks for Latest Reviews
    const latestReviews = await Review.find()
      .sort({ createdAt: -1 })
      .limit(5);

    latestReviews.forEach((review) => {
      const link = "/admin/reviews";
      if (
        !notifications.some(
          (n) => n.type === "review" && n.message === review.customerName
        )
      ) {
        notifications.push({
          type: "review",
          title: "New Review",
          message: review.customerName || "New Customer Review",
          date: review.createdAt,
          link,
        });
      }
    });

    // 5. Dynamic fallbacks for Low Stock Products
    const lowStock = await Product.find({ stock: { $lte: 5 } });
    lowStock.forEach((product) => {
      const link = "/admin/products";
      if (
        !notifications.some(
          (n) => n.type === "stock" && n.message?.includes(product.name)
        )
      ) {
        notifications.push({
          type: "stock",
          title: "Low Stock",
          message: `${product.name} (${product.stock} left)`,
          date: product.updatedAt,
          link,
        });
      }
    });

    // Sort by date descending
    notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Get Notifications Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/notifications/fcm-token
 * Authenticated Admin registers FCM device token
 */
export const registerFCMToken = async (req, res) => {
  try {
    const { token, platform = "android" } = req.body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can register for admin push notifications",
      });
    }

    const cleanToken = token.trim();

    const record = await AdminDeviceToken.findOneAndUpdate(
      { token: cleanToken },
      {
        user: req.user._id,
        token: cleanToken,
        platform: ["android", "ios", "web"].includes(platform) ? platform : "android",
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Admin FCM token registered successfully",
      deviceId: record._id,
    });
  } catch (error) {
    console.error("Register FCM Token Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to register FCM token",
    });
  }
};

/**
 * DELETE /api/notifications/fcm-token
 * Authenticated Admin unregisters FCM device token on logout
 */
export const unregisterFCMToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (token && typeof token === "string") {
      await AdminDeviceToken.deleteOne({ token: token.trim() });
    } else if (req.user?._id) {
      await AdminDeviceToken.deleteMany({ user: req.user._id });
    }

    res.status(200).json({
      success: true,
      message: "FCM token unregistered successfully",
    });
  } catch (error) {
    console.error("Unregister FCM Token Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to unregister FCM token",
    });
  }
};