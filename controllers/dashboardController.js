import Order from "../models/Order.js";
import Product from "../models/Product.js";

export const getDashboardStats = async (req, res) => {
  try {
    // =========================================
    // COUNTS
    // =========================================

    const [
      totalOrders,
      totalProducts,
      totalCustomers,
      pendingOrders,
      lowStockProducts,
      outOfStockProducts,
    ] = await Promise.all([
      Order.countDocuments(),

      Product.countDocuments(),

      // Unique customers based on phone
      Order.distinct("phone").then((phones) => phones.length),

      Order.countDocuments({
        orderStatus: "Pending",
      }),

      Product.countDocuments({
        stock: {
          $gt: 0,
          $lte: 5,
        },
      }),

      Product.countDocuments({
        stock: 0,
      }),
    ]);

    // =========================================
    // REVENUE
    // =========================================

    const revenueResult = await Order.aggregate([
      {
        $match: {
          paymentStatus: "Paid",
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$totalAmount",
          },
        },
      },
    ]);

    const totalRevenue =
      revenueResult.length > 0
        ? Number(revenueResult[0].total || 0)
        : 0;

    // =========================================
    // LATEST ORDERS
    // =========================================

    const latestOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // =========================================
    // LOW STOCK PRODUCTS
    // =========================================

    const lowStockList = await Product.find({
      stock: {
        $gt: 0,
        $lte: 5,
      },
    })
      .sort({ stock: 1 })
      .limit(5)
      .lean();

    // =========================================
    // OUT OF STOCK PRODUCTS
    // =========================================

    const outOfStockList = await Product.find({
      stock: 0,
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    // =========================================
    // RESPONSE
    // =========================================

    res.status(200).json({
      success: true,

      stats: {
        totalRevenue,
        totalOrders,
        totalProducts,
        totalCustomers,
        pendingOrders,
        lowStockProducts,
        outOfStockProducts,
      },

      latestOrders,

      lowStockList,

      outOfStockList,
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to load dashboard statistics",
    });
  }
};