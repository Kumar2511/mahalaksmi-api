import Review from "../models/Review.js";
import Order from "../models/Order.js";

// ===============================
// Create Review
// ===============================
export const createReview = async (req, res) => {
  try {
    const {
      orderId,
      productId,
      rating,
      comment,
    } = req.body;

    // ===============================
    // Basic Validation
    // ===============================

    if (
      !orderId ||
      !productId ||
      !rating ||
      !comment
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Order, product, rating and comment are required.",
      });
    }

    // ===============================
    // Find Customer Order
    // ===============================

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "Order not found.",
      });
    }

    // ===============================
    // Only Delivered Orders
    // ===============================

    if (
      order.orderStatus !==
      "Delivered"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You can review a product only after the order is delivered.",
      });
    }

    // ===============================
    // Check Product Was Ordered
    // ===============================

    const orderedProduct =
      order.products.find(
        (item) =>
          item.productId.toString() ===
          productId.toString()
      );

    if (!orderedProduct) {
      return res.status(403).json({
        success: false,
        message:
          "You can only review products purchased in this order.",
      });
    }

    // ===============================
    // Prevent Duplicate Review
    // ===============================

    const existingReview =
      await Review.findOne({
        user: req.user._id,
        order: orderId,
        product: productId,
      });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message:
          "You have already reviewed this product.",
      });
    }

    // ===============================
    // Get Customer Name
    // ===============================

    const customerName =
      order.customerName;

    // ===============================
    // Create Review
    // ===============================

    const review = await Review.create({
      user: req.user._id,

      order: orderId,

      product: productId,

      customerName,

      rating: Number(rating),

      comment,

      approved: false,
    });

    // ===============================
    // Response
    // ===============================

    res.status(201).json({
      success: true,
      message:
        "Review submitted successfully. It will appear after approval.",
      review,
    });
  } catch (error) {
    console.error(
      "Create Review Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// Get Reviews by Product
// ===============================
export const getProductReviews = async (
  req,
  res
) => {
  try {
    const reviews =
      await Review.find({
        product: req.params.productId,
        approved: true,
      })
        .populate(
          "user",
          "name"
        )
        .sort({
          createdAt: -1,
        });

    const totalReviews =
      reviews.length;

    const averageRating =
      totalReviews > 0
        ? (
            reviews.reduce(
              (sum, item) =>
                sum + item.rating,
              0
            ) / totalReviews
          ).toFixed(1)
        : 0;

    res.status(200).json({
      success: true,
      totalReviews,
      averageRating,
      reviews,
    });
  } catch (error) {
    console.error(
      "Get Product Reviews Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// Get All Reviews - Admin
// ===============================
export const getAllReviews = async (
  req,
  res
) => {
  try {
    const reviews =
      await Review.find()
        .populate(
          "product",
          "name image"
        )
        .populate(
          "user",
          "name email"
        )
        .populate(
          "order",
          "totalAmount orderStatus createdAt"
        )
        .sort({
          createdAt: -1,
        });

    res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error(
      "Get All Reviews Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// Approve Review
// ===============================
export const approveReview = async (
  req,
  res
) => {
  try {
    const review =
      await Review.findByIdAndUpdate(
        req.params.id,
        {
          approved: true,
        },
        {
          new: true,
        }
      );

    if (!review) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Review approved successfully.",
      review,
    });
  } catch (error) {
    console.error(
      "Approve Review Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ===============================
// Delete Review
// ===============================
export const deleteReview = async (
  req,
  res
) => {
  try {
    const review =
      await Review.findById(
        req.params.id
      );

    if (!review) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found.",
      });
    }

    await review.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "Review deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Review Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};