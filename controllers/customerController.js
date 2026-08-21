import User from "../models/User.js";
import Order from "../models/Order.js";

// ======================================================
// GET ALL CUSTOMERS
// ======================================================
// Shows EVERY registered customer,
// including customers who have not placed an order yet.
// ======================================================

export const getCustomers = async (req, res) => {
  try {
    // ------------------------------------------
    // 1. Get all registered customer accounts
    // ------------------------------------------

    const users = await User.find({
      role: "customer",
    })
      .select("-password")
      .sort({
        createdAt: -1,
      })
      .lean();

    // ------------------------------------------
    // 2. Get all orders
    // ------------------------------------------

    const orders = await Order.find()
      .sort({
        createdAt: -1,
      })
      .lean();

    // ------------------------------------------
    // 3. Create order map by phone
    // ------------------------------------------

    const ordersMap = {};

    orders.forEach((order) => {
      const phone = order.phone;

      if (!phone) return;

      if (!ordersMap[phone]) {
        ordersMap[phone] = [];
      }

      ordersMap[phone].push(order);
    });

    // ------------------------------------------
    // 4. Build customer list
    // ------------------------------------------

    const customers = users.map((user) => {
      const phone = user.phone || "";

      const customerOrders =
        ordersMap[phone] || [];

      const totalOrders =
        customerOrders.length;

      const totalSpent =
        customerOrders.reduce(
          (sum, order) =>
            sum +
            Number(order.totalAmount || 0),
          0
        );

      const lastOrder =
        customerOrders.length > 0
          ? customerOrders.reduce(
              (latest, order) => {
                if (!latest) {
                  return order.createdAt;
                }

                return new Date(
                  order.createdAt
                ) > new Date(latest)
                  ? order.createdAt
                  : latest;
              },
              null
            )
          : null;

      // ----------------------------------------
      // Address
      // ----------------------------------------

      const latestAddress =
        user.addresses &&
        user.addresses.length > 0
          ? user.addresses[
              user.addresses.length - 1
            ]
          : null;

      return {
        _id: user._id,

        name: user.name || "",

        phone: user.phone || "",

        email: user.email || "",

        address:
          latestAddress?.address ||
          "",

        city:
          latestAddress?.city ||
          "",

        state:
          latestAddress?.state ||
          "",

        pincode:
          latestAddress?.pincode ||
          "",

        totalOrders,

        totalSpent,

        lastOrder,

        emailVerified:
          Boolean(user.emailVerified),

        createdAt:
          user.createdAt,

        updatedAt:
          user.updatedAt,
      };
    });

    // ------------------------------------------
    // 5. Return customers
    // ------------------------------------------

    return res.status(200).json({
      success: true,

      customers,
    });

  } catch (error) {
    console.error(
      "Get Customers Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to load customers",
    });
  }
};


// ======================================================
// GET SINGLE CUSTOMER
// ======================================================
// Works even when the customer has ZERO orders.
// ======================================================

export const getCustomer = async (
  req,
  res
) => {
  try {
    const { phone } = req.params;

    console.log(
      "Phone from URL:",
      phone
    );

    // ------------------------------------------
    // 1. Find registered customer
    // ------------------------------------------

    const user = await User.findOne({
      phone,
      role: "customer",
    })
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,

        message:
          "Customer not found",
      });
    }

    // ------------------------------------------
    // 2. Get customer's orders
    // ------------------------------------------

    const orders = await Order.find({
      phone,
    })
      .sort({
        createdAt: -1,
      })
      .lean();

    console.log(
      "Orders found:",
      orders.length
    );

    // ------------------------------------------
    // 3. Calculate statistics
    // ------------------------------------------

    const totalOrders =
      orders.length;

    const totalSpent =
      orders.reduce(
        (sum, order) =>
          sum +
          Number(order.totalAmount || 0),
        0
      );

    const lastOrder =
      orders.length > 0
        ? orders[0].createdAt
        : null;

    // ------------------------------------------
    // 4. Latest saved address
    // ------------------------------------------

    const latestAddress =
      user.addresses &&
      user.addresses.length > 0
        ? user.addresses[
            user.addresses.length - 1
          ]
        : null;

    // ------------------------------------------
    // 5. Build customer response
    // ------------------------------------------

    const customer = {
      _id: user._id,

      customerName:
        user.name || "",

      name:
        user.name || "",

      phone:
        user.phone || "",

      email:
        user.email || "",

      address:
        latestAddress?.address ||
        "",

      city:
        latestAddress?.city ||
        "",

      state:
        latestAddress?.state ||
        "",

      pincode:
        latestAddress?.pincode ||
        "",

      totalOrders,

      totalSpent,

      lastOrder,

      emailVerified:
        Boolean(user.emailVerified),

      createdAt:
        user.createdAt,

      updatedAt:
        user.updatedAt,

      orders,
    };

    // ------------------------------------------
    // 6. Send response
    // ------------------------------------------

    return res.status(200).json({
      success: true,

      customer,

      orders,
    });

  } catch (error) {
    console.error(
      "Get Customer Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to load customer",
    });
  }
};

// ======================================================
// TEMPORARY — DELETE CUSTOMER
// ======================================================
// Deletes:
// 1. Customer User account
// 2. All orders belonging to that customer
//
// ADMIN ONLY
// ======================================================

export const deleteCustomer = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    // ------------------------------------------
    // 1. Find customer
    // ------------------------------------------

    const customer =
      await User.findOne({
        _id: id,
        role: "customer",
      });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // ------------------------------------------
    // 2. Delete customer's orders
    // ------------------------------------------

    const orderDeleteResult =
      await Order.deleteMany({
        $or: [
          {
            user: customer._id,
          },
          {
            phone: customer.phone,
          },
        ],
      });

    // ------------------------------------------
    // 3. Delete customer account
    // ------------------------------------------

    await User.deleteOne({
      _id: customer._id,
      role: "customer",
    });

    // ------------------------------------------
    // 4. Success
    // ------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Customer account and all associated orders deleted successfully.",

      deletedCustomer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },

      deletedOrders:
        orderDeleteResult.deletedCount || 0,
    });

  } catch (error) {
    console.error(
      "Delete Customer Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to delete customer",
    });
  }
};