import Order from "../models/Order.js";

// ==========================
// Get All Customers
// ==========================
export const getCustomers = async (req, res) => {
  try {
    const orders = await Order.find().sort({
      createdAt: -1,
    });

    const customersMap = {};

    orders.forEach((order) => {
      const key = order.phone;

      if (!customersMap[key]) {
        customersMap[key] = {
          _id: key, // use phone as unique id
          name: order.customerName,
          phone: order.phone,
          email: order.email,
          address: order.address,
          city: order.city,
          state: order.state,
          pincode: order.pincode,
          totalOrders: 0,
          totalSpent: 0,
          lastOrder: order.createdAt,
        };
      }

      customersMap[key].totalOrders += 1;
      customersMap[key].totalSpent += order.totalAmount;

      if (
        new Date(order.createdAt) >
        new Date(customersMap[key].lastOrder)
      ) {
        customersMap[key].lastOrder = order.createdAt;
      }
    });

    res.status(200).json({
      success: true,
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
// ==========================
// Get Single Customer
// ==========================
export const getCustomer = async (req, res) => {
  try {
    const { phone } = req.params;

    console.log("Phone from URL:", phone);

    const orders = await Order.find({ phone }).sort({
      createdAt: -1,
    });

    console.log("Orders found:", orders.length);

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const customer = {
      customerName: orders[0].customerName,
      phone: orders[0].phone,
      email: orders[0].email,
      address: orders[0].address,
      city: orders[0].city,
      state: orders[0].state,
      pincode: orders[0].pincode,
      totalOrders: orders.length,
      totalSpent: orders.reduce(
        (sum, order) => sum + order.totalAmount,
        0
      ),
      orders,
    };

    res.status(200).json({
      success: true,
      customer,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};