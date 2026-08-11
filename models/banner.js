import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    subtitle: {
      type: String,
      default: "",
    },

    image: {
      type: String,
      required: true,
    },

    buttonText: {
      type: String,
      default: "",
    },

    buttonLink: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["Hero", "Offer", "Mobile"],
      default: "Hero",
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Banner", bannerSchema);