import Review from "../models/Review.js";
import Order from "../models/Order.js";

// ======================================================
// Create Review
// ======================================================
export const createReview = async (req, res) => {
  try {
    const {
      orderId,
      productId,
      rating,
      reviewTitle,
      comment,
      images,
      videos,
    } = req.body;

    // ==================================================
    // Basic Validation
    // ==================================================

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

    // ==================================================
    // Validate Rating
    // ==================================================

    const numericRating = Number(rating);

    if (
      Number.isNaN(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    // ==================================================
    // Find Customer Order
    // ==================================================

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // ==================================================
    // Only Delivered Orders
    // ==================================================

    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message:
          "You can review a product only after the order is delivered.",
      });
    }

    // ==================================================
    // Check Product Was Ordered
    // ==================================================

    const orderedProduct = order.products.find(
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

    // ==================================================
    // Prevent Duplicate Review
    // ==================================================

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

    // ==================================================
    // Customer Name
    // ==================================================

    const customerName =
      order.customerName ||
      req.user.name ||
      "Customer";

    // ==================================================
    // Normalize Images
    // ==================================================

    let reviewImages = [];

    if (Array.isArray(images)) {
      reviewImages = images.filter(
        (image) =>
          typeof image === "string" &&
          image.trim() !== ""
      );
    } else if (typeof images === "string") {
      try {
        const parsedImages = JSON.parse(images);

        if (Array.isArray(parsedImages)) {
          reviewImages = parsedImages.filter(
            (image) =>
              typeof image === "string" &&
              image.trim() !== ""
          );
        }
      } catch {
        reviewImages = images
          .split(",")
          .map((image) => image.trim())
          .filter(Boolean);
      }
    }

    // ==================================================
    // Normalize Videos
    // ==================================================

    let reviewVideos = [];

    if (Array.isArray(videos)) {
      reviewVideos = videos.filter(
        (video) =>
          typeof video === "string" &&
          video.trim() !== ""
      );
    } else if (typeof videos === "string") {
      try {
        const parsedVideos = JSON.parse(videos);

        if (Array.isArray(parsedVideos)) {
          reviewVideos = parsedVideos.filter(
            (video) =>
              typeof video === "string" &&
              video.trim() !== ""
          );
        }
      } catch {
        reviewVideos = videos
          .split(",")
          .map((video) => video.trim())
          .filter(Boolean);
      }
    }

    // ==================================================
    // Create Review
    // ==================================================

   const review = await Review.create({
  user: req.user._id,

  order: orderId,

  product: productId,

  customerName,

  rating: Number(rating),

  reviewTitle:
    typeof reviewTitle === "string"
      ? reviewTitle.trim()
      : "",

  comment: comment.trim(),

  images: Array.isArray(images)
    ? images.filter(
        (image) =>
          typeof image === "string" &&
          image.trim() !== ""
      )
    : [],

  videos: Array.isArray(videos)
    ? videos.filter(
        (video) =>
          typeof video === "string" &&
          video.trim() !== ""
      )
    : [],

  source: "website",

  approved: false,
});

    // ==================================================
    // Response
    // ==================================================

    return res.status(201).json({
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

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// Import Historical Reviews - Admin
// ======================================================
export const importReviews = async (req, res) => {
  try {
    const { reviews } = req.body;

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a non-empty reviews array.",
      });
    }

    let imported = 0;
    let skipped = 0;

    const errors = [];

    for (let index = 0; index < reviews.length; index++) {
      const item = reviews[index];

      try {
        const {
          customerName,
          productId,
          productName,
          rating,
          reviewTitle,
          comment,
          images,
          videos,
          createdAt,
        } = item;

        // ------------------------------------------
        // Validation
        // ------------------------------------------

        if (!customerName || !rating || !comment) {
          skipped++;

          errors.push({
            row: index + 1,
            message:
              "Customer name, rating and comment are required.",
          });

          continue;
        }

        const numericRating = Number(rating);

        if (
          !Number.isFinite(numericRating) ||
          numericRating < 1 ||
          numericRating > 5
        ) {
          skipped++;

          errors.push({
            row: index + 1,
            message:
              "Rating must be between 1 and 5.",
          });

          continue;
        }

        // ------------------------------------------
        // Find Product
        // ------------------------------------------

        let product = null;

        if (productId) {
          try {
            product =
              await Product.findById(productId);
          } catch {
            product = null;
          }
        }

        if (!product && productName) {
          const cleanName =
            String(productName).trim();

          const escapedName =
            cleanName.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            );

          product =
            await Product.findOne({
              name: {
                $regex: `^${escapedName}$`,
                $options: "i",
              },
            });
        }

        if (!product && productName) {
          const cleanName =
            String(productName).trim();

          const escapedName =
            cleanName.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            );

          product =
            await Product.findOne({
              name: {
                $regex: escapedName,
                $options: "i",
              },
            });
        }

        // ------------------------------------------
        // Product Not Found
        // ------------------------------------------

        if (!product) {
          skipped++;

          errors.push({
            row: index + 1,
            message:
              `Product not found: ${
                productName ||
                productId ||
                "Unknown"
              }`,
          });

          continue;
        }

        // ------------------------------------------
        // Normalize Images
        // ------------------------------------------

        let reviewImages = [];

        if (Array.isArray(images)) {
          reviewImages = images.filter(
            (image) =>
              typeof image === "string" &&
              image.trim() !== ""
          );
        }

        // ------------------------------------------
        // Normalize Videos
        // ------------------------------------------

        let reviewVideos = [];

        if (Array.isArray(videos)) {
          reviewVideos = videos.filter(
            (video) =>
              typeof video === "string" &&
              video.trim() !== ""
          );
        }

        // ------------------------------------------
        // Create Imported Review
        // ------------------------------------------

        const reviewData = {
          product: product._id,

          customerName:
            String(customerName).trim(),

          rating: numericRating,

          reviewTitle:
            typeof reviewTitle === "string"
              ? reviewTitle.trim()
              : "",

          comment:
            String(comment).trim(),

          images: reviewImages,

          videos: reviewVideos,

          // Historical reviews are already trusted
          approved: true,
        };

        // ------------------------------------------
        // Preserve Original Date
        // ------------------------------------------

        if (createdAt) {
          const parsedDate =
            new Date(createdAt);

          if (
            !Number.isNaN(
              parsedDate.getTime()
            )
          ) {
            reviewData.createdAt =
              parsedDate;
          }
        }

        await Review.create(reviewData);

        imported++;
      } catch (itemError) {
        console.error(
          `Import Review Row ${
            index + 1
          } Error:`,
          itemError
        );

        skipped++;

        errors.push({
          row: index + 1,
          message: itemError.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      imported,
      skipped,
      total: reviews.length,
      errors,
      message:
        `${imported} reviews imported successfully.`,
    });
  } catch (error) {
    console.error(
      "Import Reviews Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ======================================================
// Get Reviews by Product
// ======================================================
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
        .populate(
          "product",
          "name images"
        )
        .sort({
          createdAt: -1,
        });

    const totalReviews =
      reviews.length;

    const averageRating =
      totalReviews > 0
        ? Number(
            (
              reviews.reduce(
                (sum, item) =>
                  sum + item.rating,
                0
              ) / totalReviews
            ).toFixed(1)
          )
        : 0;

    return res.status(200).json({
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

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// Get All Reviews - Admin
// ======================================================
export const getAllReviews = async (
  req,
  res
) => {
  try {
    const reviews =
      await Review.find()
        .populate(
          "product",
          "name images"
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

    return res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error(
      "Get All Reviews Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// Approve Review
// ======================================================
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
          runValidators: true,
        }
      );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    return res.status(200).json({
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

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ======================================================
// Delete Review
// ======================================================
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
        message: "Review not found.",
      });
    }

    await review.deleteOne();

    return res.status(200).json({
      success: true,
      message:
        "Review deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Review Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};