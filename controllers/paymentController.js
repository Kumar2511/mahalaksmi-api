import PaymentSettings from "../models/PaymentSettings.js";
import Order from "../models/Order.js";

// ===================================
// GET PAYMENT SETTINGS
// ===================================
export const getPaymentSettings = async (req, res) => {
  try {
    let settings = await PaymentSettings.findOne();

    if (!settings) {
      settings = await PaymentSettings.create({});
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get Payment Settings Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// UPDATE PAYMENT SETTINGS
// ===================================
export const updatePaymentSettings = async (req, res) => {
  try {
    let settings = await PaymentSettings.findOne();

    if (!settings) {
      settings = await PaymentSettings.create(req.body);
    } else {
      settings = await PaymentSettings.findByIdAndUpdate(
        settings._id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );
    }

    res.status(200).json({
      success: true,
      message: "Payment settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update Payment Settings Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// GET PAYMENT TRANSACTIONS
// ===================================
export const getPayments = async (req, res) => {
  try {
    const orders = await Order.find({})
      .select(
        `
        _id
        customerName
        email
        phone
        totalAmount
        paymentMethod
        paymentStatus
        razorpayOrderId
        razorpayPaymentId
        upiPaymentProof
        createdAt
        `
      )
      .sort({ createdAt: -1 })
      .lean();

    const payments = orders.map((order) => ({
      _id: order._id,

      orderId: order._id,

      customerName: order.customerName || "Customer",

      email: order.email || "",

      phone: order.phone || "",

      amount: Number(order.totalAmount || 0),

      paymentMethod: order.paymentMethod || "COD",

      paymentStatus: order.paymentStatus || "Pending",

      transactionId:
        order.razorpayPaymentId ||
        order.razorpayOrderId ||
        "",

      upiStatus:
        order.upiPaymentProof?.status ||
        "Not Submitted",

      upiScreenshot:
        order.upiPaymentProof?.screenshot ||
        "",

      createdAt: order.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get Payments Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===================================
// GET SINGLE PAYMENT
// ===================================
export const getPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email phone")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Payment transaction not found",
      });
    }

    const payment = {
      _id: order._id,

      orderId: order._id,

      customerName: order.customerName || "Customer",

      email: order.email || "",

      phone: order.phone || "",

      amount: Number(order.totalAmount || 0),

      paymentMethod: order.paymentMethod || "COD",

      paymentStatus: order.paymentStatus || "Pending",

      transactionId:
        order.razorpayPaymentId ||
        order.razorpayOrderId ||
        "",

      razorpayOrderId:
        order.razorpayOrderId || "",

      razorpayPaymentId:
        order.razorpayPaymentId || "",

      upiPaymentProof:
        order.upiPaymentProof || {},

      orderStatus:
        order.orderStatus || "Pending",

      createdAt: order.createdAt,

      updatedAt: order.updatedAt,
    };

    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get Payment Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};