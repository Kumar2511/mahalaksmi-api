import cloudinary from "../config/cloudinary.js";

// ==========================================
// Find Product By Image
// ==========================================

export const findProductByImage = async (req, res) => {
  console.log("====================================");
  console.log("🔍 FIND PRODUCT BY IMAGE API");
  console.log("====================================");

  try {
    // ========================================
    // Check Image
    // ========================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    console.log("Screenshot received:");
    console.log("File:", req.file);

    // ========================================
    // Upload Screenshot To Cloudinary
    // ========================================

    console.log(
      "Uploading screenshot to Cloudinary..."
    );

    const result =
      await cloudinary.uploader.upload(
        req.file.path,
        {
          folder:
            "mahalaksmi-product-search",
        }
      );

    console.log(
      "Screenshot uploaded:",
      result.secure_url
    );

    // ========================================
    // Temporary Response
    // ========================================
    //
    // IMPORTANT:
    // Actual visual matching will be added
    // in the next step.
    //

    return res.status(200).json({
      success: true,

      message:
        "Screenshot uploaded successfully",

      imageUrl: result.secure_url,

      matches: [],
    });
  } catch (error) {
    console.error(
      "Image Search Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};