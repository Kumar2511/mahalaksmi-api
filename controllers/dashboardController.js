import Order from "../models/Order.js";
import Product from "../models/Product.js";

export const getDashboardStats = async (req, res) => {
  try {
    // ==========================
    // Counts
    // ==========================
    const totalOrders = await Order.countDocuments();

    const totalProducts = await Product.countDocuments();

    const totalCustomers = (
      await Order.distinct("phone")
    ).length;

    const pendingOrders = await Order.countDocuments({
      orderStatus: "Pending",
    });

    const lowStockProducts = await Product.countDocuments({
      stock: { $lte: 5 },
    });

    // ==========================
    // Revenue
    // ==========================
    const revenue = await Order.aggregate([
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
      revenue.length > 0 ? revenue[0].total : 0;

    // ==========================
    // Latest Orders
    // ==========================
    const latestOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);

    // ==========================
    // Low Stock Products
    // ==========================
    const lowStockList = await Product.find({
      stock: { $lte: 5 },
    }).limit(5);

    res.status(200).json({
      success: true,

      stats: {
        totalRevenue,
        totalOrders,
        totalProducts,
        totalCustomers,
        pendingOrders,
        lowStockProducts,
      },

      latestOrders,

      lowStockList,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });

  }
};