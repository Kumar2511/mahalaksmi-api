import Order from "../models/Order.js";
import Product from "../models/Product.js";

export const getAnalytics = async (req, res) => {
  try {

    // Monthly Revenue
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          paymentStatus: "Paid",
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
          },
          revenue: {
            $sum: "$totalAmount",
          },
          orders: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          "_id.month": 1,
        },
      },
    ]);

    // Top Customers
    const topCustomers = await Order.aggregate([
      {
        $group: {
          _id: "$phone",
          customerName: { $first: "$customerName" },
          totalSpent: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
        },
      },
      {
        $sort: {
          totalSpent: -1,
        },
      },
      {
        $limit: 5,
      },
    ]);

    // Top Selling Products
    const topProducts = await Order.aggregate([
      {
        $unwind: "$products",
      },
      {
        $group: {
          _id: "$products.productId",
          name: {
            $first: "$products.name",
          },
          sold: {
            $sum: "$products.quantity",
          },
        },
      },
      {
        $sort: {
          sold: -1,
        },
      },
      {
        $limit: 5,
      },
    ]);

    // Category Sales
    const categorySales = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          totalProducts: {
            $sum: 1,
          },
        },
      },
    ]);

    res.json({
      success: true,
      monthlyRevenue,
      topCustomers,
      topProducts,
      categorySales,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};