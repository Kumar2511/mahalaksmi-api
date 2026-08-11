import CustomerLook from "../models/CustomerLook.js";
import Order from "../models/Order.js";

// ======================================
// Customer - Submit Share Your Look
// ======================================
export const createCustomerLook = async (req, res) => {
  try {
    const {
      orderId,
      productId,
      instagramUsername,
      feedback,
      rating,
      image,
    } = req.body;

    // ==============================
    // Basic Validation
    // ==============================

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Please upload your photo.",
      });
    }

    // ==============================
    // Find Customer Order
    // ==============================

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found or you are not authorized to access this order.",
      });
    }

    // ==============================
    // Only Delivered Orders
    // ==============================

    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message:
          "You can share your look only after your order has been delivered.",
      });
    }

    // ==============================
    // Check Product Belongs To Order
    // ==============================

    const orderedProduct = order.products.find(
      (item) =>
        item.productId.toString() ===
        productId.toString()
    );

    if (!orderedProduct) {
      return res.status(400).json({
        success: false,
        message:
          "This product does not belong to the selected order.",
      });
    }

    // ==============================
    // Prevent Duplicate Submission
    // ==============================

    const existingLook =
      await CustomerLook.findOne({
        user: req.user._id,
        orderId,
        productId,
      });

    if (existingLook) {
      return res.status(400).json({
        success: false,
        message:
          "You have already submitted a look for this product.",
      });
    }

    // ==============================
    // Create Customer Look
    // ==============================

    const customerLook =
      await CustomerLook.create({
        user: req.user._id,

        customerName:
          order.customerName,

        email:
          order.email || req.user.email || "",

        instagramUsername:
          instagramUsername || "",

        orderId: order._id,

        productId:
          orderedProduct.productId,

        productName:
          orderedProduct.name,

        image,

        feedback:
          feedback || "",

        rating:
          Number(rating) || 5,

        status: "Pending",
      });

    // ==============================
    // Response
    // ==============================

    res.status(201).json({
      success: true,
      message:
        "Thank you! Your look has been submitted for review.",
      customerLook,
    });
  } catch (error) {
    console.error(
      "Create Customer Look Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Customer - Get My Submitted Looks
// ======================================
export const getMyCustomerLooks = async (
  req,
  res
) => {
  try {
    const looks =
      await CustomerLook.find({
        user: req.user._id,
      })
        .populate(
          "orderId",
          "orderStatus createdAt"
        )
        .populate(
          "productId",
          "name image price"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,
      count: looks.length,
      looks,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Get All Customer Looks
// ======================================
export const getCustomerLooks = async (
  req,
  res
) => {
  try {
    const looks =
      await CustomerLook.find()
        .populate(
          "user",
          "name email"
        )
        .populate(
          "orderId",
          "orderStatus createdAt"
        )
        .populate(
          "productId",
          "name image price"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,
      count: looks.length,
      looks,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Get Single Customer Look
// ======================================
export const getCustomerLook = async (
  req,
  res
) => {
  try {
    const look =
      await CustomerLook.findById(
        req.params.id
      )
        .populate(
          "user",
          "name email"
        )
        .populate(
          "orderId",
          "orderStatus createdAt"
        )
        .populate(
          "productId",
          "name image price"
        );

    if (!look) {
      return res.status(404).json({
        success: false,
        message:
          "Customer look not found.",
      });
    }

    res.status(200).json({
      success: true,
      look,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================
// Admin - Update Approval Status
// ======================================
export const updateCustomerLook =
  async (req, res) => {
    try {
      const look =
        await CustomerLook.findById(
          req.params.id
        );

      if (!look) {
        return res.status(404).json({
          success: false,
          message:
            "Customer look not found.",
        });
      }

      if (req.body.status) {
        if (
          ![
            "Pending",
            "Approved",
            "Rejected",
          ].includes(req.body.status)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid customer look status.",
          });
        }

        look.status =
          req.body.status;
      }

      if (
        req.body.adminNote !==
        undefined
      ) {
        look.adminNote =
          req.body.adminNote;
      }

      await look.save();

      res.status(200).json({
        success: true,
        message:
          "Customer look updated successfully.",
        look,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };

// ======================================
// Admin - Delete Customer Look
// ======================================
export const deleteCustomerLook =
  async (req, res) => {
    try {
      const look =
        await CustomerLook.findById(
          req.params.id
        );

      if (!look) {
        return res.status(404).json({
          success: false,
          message:
            "Customer look not found.",
        });
      }

      await look.deleteOne();

      res.status(200).json({
        success: true,
        message:
          "Customer look deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  };