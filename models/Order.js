import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // ===========================
    // Customer Account
    // ===========================
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ===========================
    // Customer Details
    // ===========================
    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
    },

    // ===========================
    // Ordered Products
    // ===========================
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        name: {
          type: String,
          required: true,
        },

        image: {
          type: String,
          default: "",
        },

        price: {
          type: Number,
          required: true,
        },

        quantity: {
          type: Number,
          required: true,
          min: 1,
        },

        color: {
          type: String,
          default: "",
          trim: true,
        },

        size: {
          type: String,
          default: "",
          trim: true,
        },
      },
    ],

    // ===========================
    // Order Pricing
    // ===========================
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    shippingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    couponCode: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // ===========================
    // Payment
    // ===========================
    paymentMethod: {
      type: String,
      enum: ["COD", "UPI", "Razorpay"],
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid"],
      default: "Pending",
    },

    // ===========================
    // 5-Minute UPI Payment Session
    // ===========================
    paymentSessionStartedAt: {
      type: Date,
      default: null,
    },

    paymentSessionExpiresAt: {
      type: Date,
      default: null,
    },

    paymentSessionStatus: {
      type: String,
      enum: [
        "Not Started",
        "Active",
        "Completed",
        "Expired",
      ],
      default: "Not Started",
    },

    // ===========================
    // Razorpay
    // ===========================
    razorpayOrderId: {
      type: String,
      default: "",
      trim: true,
    },

    razorpayPaymentId: {
      type: String,
      default: "",
      trim: true,
    },

    // ===========================
    // UPI Manual Payment Proof
    // ===========================
    upiPaymentProof: {
      submitted: {
        type: Boolean,
        default: false,
      },

      screenshot: {
        type: String,
        default: "",
        trim: true,
      },

      status: {
        type: String,
        enum: [
          "Not Submitted",
          "Pending Verification",
          "Approved",
          "Rejected",
        ],
        default: "Not Submitted",
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      adminNote: {
        type: String,
        default: "",
        trim: true,
      },
    },

    // ===========================
    // Order Status
    // ===========================
    orderStatus: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Packed",
        "Shipped",
        "Out for Delivery",
        "Delivered",
        "Cancelled",
      ],
      default: "Pending",
    },

    // ===========================
    // Shipping Details
    // ===========================
    trackingNumber: {
      type: String,
      default: "",
      trim: true,
    },

    courierName: {
      type: String,
      default: "",
      trim: true,
    },

    estimatedDelivery: {
      type: Date,
      default: null,
    },

    // ===========================
    // Admin Notes
    // ===========================
    adminNotes: {
      type: String,
      default: "",
      trim: true,
    },

    // ===========================
    // Cancellation Feedback
    // ===========================
    cancellationFeedback: {
      submitted: {
        type: Boolean,
        default: false,
      },

      reason: {
        type: String,
        default: "",
        trim: true,
      },

      comment: {
        type: String,
        default: "",
        trim: true,
        maxlength: 1000,
      },

      submittedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Order", orderSchema);
