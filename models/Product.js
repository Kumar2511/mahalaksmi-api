import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    category: {
      type: String,
      required: true,
    },

   collections: {
  type: [String],
  default: [],
},

    price: {
      type: Number,
      required: true,
    },

    discountPrice: {
      type: Number,
      default: 0,
    },

    images: {
  type: [String],
  default: [],
},

video: {
  type: String,
  default: "",
},
colors: {
  type: [String],
  default: [],
},

sizes: {
  type: [String],
  default: [],
},
specifications: {
  material: {
    type: String,
    default: "",
  },

  jewelleryType: {
    type: String,
    default: "",
  },

  metalPlating: {
    type: String,
    default: "",
  },

  stone: {
    type: String,
    default: "",
  },

  weight: {
    type: String,
    default: "",
  },

  occasion: {
    type: String,
    default: "",
  },

  countryOfOrigin: {
    type: String,
    default: "India",
  },
},
    stock: {
      type: Number,
      default: 0,
    },

    // Homepage Sections
    featured: {
      type: Boolean,
      default: false,
    },

    bestSeller: {
      type: Boolean,
      default: false,
    },

    newArrival: {
      type: Boolean,
      default: false,
    },

    trending: {
      type: Boolean,
      default: false,
    },

    instagramLink: {
      type: String,
      default: "",
    },
    reviews: [
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    name: {
      type: String,
    },

    rating: {
      type: Number,
      required: true,
    },

    comment: {
      type: String,
      required: true,
    },
  },
],

numReviews: {
  type: Number,
  default: 0,
},

averageRating: {
  type: Number,
  default: 0,
},
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Product", productSchema);