import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";

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
      (a, b) =>
        new Date(b.date) - new Date(a.date)
    );

    res.json({
      success: true,
      notifications,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};