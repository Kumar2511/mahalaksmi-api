import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import StockNotification from "../models/StockNotification.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = [];

    // Latest Orders
    const latestOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);

    latestOrders.forEach((order) => {
      notifications.push({
        type: "order",
        title: "New Order",
        message: `${order.customerName} placed an order`,
        date: order.createdAt,
        link: `/admin/orders/${order._id}`,
      });
    });

    // Pending Customer Stock Notification Requests
    const stockRequests = await StockNotification.find({ notified: false })
      .populate("product", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    stockRequests.forEach((sub) => {
      const productName = sub.product?.name || "a product";
      notifications.push({
        type: "stock_request",
        title: "New Stock Notification Request",
        message: `${sub.email} requested restock alert for ${productName}`,
        date: sub.createdAt,
        link: "/admin/stock-notifications",
      });
    });

    // Latest Reviews
    const latestReviews = await Review.find()
      .sort({ createdAt: -1 })
      .limit(5);

    latestReviews.forEach((review) => {
      notifications.push({
        type: "review",
        title: "New Review",
        message: review.customerName,
        date: review.createdAt,
        link: "/admin/reviews",
      });
    });

    // Low Stock Products
    const lowStock = await Product.find({
      stock: { $lte: 5 },
    });

    lowStock.forEach((product) => {
      notifications.push({
        type: "stock",
        title: "Low Stock",
        message: `${product.name} (${product.stock} left)`,
        date: product.updatedAt,
        link: "/admin/products",
      });
    });

    notifications.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

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