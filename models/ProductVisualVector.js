import mongoose from "mongoose";

const productVisualVectorSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    imageHash: {
      type: String,
      default: null,
    },
    model: {
      type: String,
      default: "Xenova/clip-vit-base-patch32",
    },
    modelVersion: {
      type: String,
      default: "1.0.0",
    },
  },
  {
    timestamps: true,
    collection: "productVisualVectors",
  }
);

productVisualVectorSchema.index(
  { productId: 1, imageUrl: 1 },
  { unique: true }
);

export default mongoose.model("ProductVisualVector", productVisualVectorSchema);
