import mongoose from "mongoose";

const storySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },

    media: {
      type: String,
      default: "",
    },

    title: {
      type: String,
      default: "",
    },

    subtitle: {
      type: String,
      default: "",
    },

    duration: {
      type: Number,
      default: 3000,
    },
  },
  {
    _id: false,
  }
);

const adminAppSettingsSchema = new mongoose.Schema(
  {
    // ========================================================
    // APP BRANDING
    // ========================================================

    appName: {
      type: String,
      default: "The Girl Who She",
    },

    appSubtitle: {
      type: String,
      default: "Premium Jewellery Management",
    },

    appLogo: {
      type: String,
      default: "",
    },

    appIcon: {
      type: String,
      default: "",
    },

    // ========================================================
    // TYPOGRAPHY
    // ========================================================

    headingFont: {
      type: String,
      default: "Cormorant Garamond",
    },

    bodyFont: {
      type: String,
      default: "Inter",
    },

    // ========================================================
    // BRAND COLORS
    // ========================================================

    primaryColor: {
      type: String,
      default: "#071525",
    },

    accentColor: {
      type: String,
      default: "#C8A96B",
    },

    backgroundColor: {
      type: String,
      default: "#F7F3EA",
    },

    // ========================================================
    // SPLASH
    // ========================================================

    splashEnabled: {
      type: Boolean,
      default: true,
    },

    splashDuration: {
      type: Number,
      default: 3000,
      min: 1000,
      max: 10000,
    },

    splashLogo: {
      type: String,
      default: "",
    },

    splashBackground: {
      type: String,
      default: "",
    },

    // ========================================================
    // STORIES
    // ========================================================

    storiesEnabled: {
      type: Boolean,
      default: true,
    },

    story1: {
      type: storySchema,
      default: () => ({}),
    },

    story2: {
      type: storySchema,
      default: () => ({
        type: "video",
        duration: 5000,
      }),
    },

    story3: {
      type: storySchema,
      default: () => ({
        type: "video",
        duration: 5000,
      }),
    },

    // ========================================================
    // WELCOME PAGE
    // ========================================================

    welcomeEnabled: {
      type: Boolean,
      default: true,
    },

    welcomeTitle: {
      type: String,
      default: "Every piece tells a story.",
    },

    welcomeSubtitle: {
      type: String,
      default:
        "Discover a refined jewellery experience created for moments worth remembering.",
    },

    exploreButtonText: {
      type: String,
      default: "Explore Our Website",
    },

    adminLoginButtonText: {
      type: String,
      default: "Admin Login",
    },

    existingAdminText: {
      type: String,
      default: "Existing administrator? Sign in",
    },

    // ========================================================
    // NOTIFICATIONS
    // ========================================================

    notificationsEnabled: {
      type: Boolean,
      default: true,
    },

    orderNotifications: {
      type: Boolean,
      default: true,
    },

    customerNotifications: {
      type: Boolean,
      default: true,
    },

    reviewNotifications: {
      type: Boolean,
      default: true,
    },

    notificationSound: {
      type: Boolean,
      default: false,
    },

    // ========================================================
    // APPEARANCE
    // ========================================================

    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },

    // ========================================================
    // MOBILE APP
    // ========================================================

    mobileOptimized: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "AdminAppSettings",
  adminAppSettingsSchema
);