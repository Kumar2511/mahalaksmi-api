import Product from "../models/Product.js";
import Order from "../models/Order.js";

export const globalSearch = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      return res.json({
        success: true,
        products: [],
        orders: [],
        customers: [],
      });
    }

    const regex = new RegExp(q, "i");

    const products = await Product.find({
      $or: [
        { name: regex },
        { category: regex },
        { collections: regex },
      ],
    }).limit(5);

    const orders = await Order.find({
      $or: [
        { customerName: regex },
        { phone: regex },
      ],
    }).limit(5);

    const customersMap = {};

    orders.forEach((order) => {
      if (!customersMap[order.phone]) {
        customersMap[order.phone] = {
          customerName: order.customerName,
          phone: order.phone,
        };
      }
    });

    res.json({
      success: true,
      products,
      orders,
      customers: Object.values(customersMap),
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};