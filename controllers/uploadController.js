import cloudinary from "../config/cloudinary.js";
import fs from "fs";

export const uploadMedia = async (req, res) => {
  console.log(
    "========== Upload API Hit =========="
  );

  console.log("File:", req.file);
  console.log("Body:", req.body);

  try {
    // ==========================================
    // Validate File
    // ==========================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded.",
      });
    }

    // ==========================================
    // Folder
    // ==========================================

    const folder =
      req.body.folder ||
      "mahalaksmi-products";

    console.log(
      "Uploading media to Cloudinary..."
    );

    // ==========================================
    // Upload to Cloudinary
    // ==========================================

    const result =
      await cloudinary.uploader.upload(
        req.file.path,
        {
          folder,
          resource_type: "auto",
        }
      );

    console.log(
      "Cloudinary Success:",
      result.secure_url
    );

    console.log(
      "Resource Type:",
      result.resource_type
    );

    // ==========================================
    // Delete Temporary File
    // ==========================================

    try {
      fs.unlinkSync(req.file.path);
    } catch (deleteError) {
      console.warn(
        "Temporary file could not be deleted:",
        deleteError.message
      );
    }

    // ==========================================
    // Response
    // ==========================================

    return res.status(200).json({
      success: true,

      mediaUrl: result.secure_url,

      // Keep imageUrl for backward compatibility
      imageUrl:
        result.resource_type === "image"
          ? result.secure_url
          : "",

      videoUrl:
        result.resource_type === "video"
          ? result.secure_url
          : "",

      resourceType:
        result.resource_type,

      format:
        result.format,

      publicId:
        result.public_id,

      width:
        result.width || null,

      height:
        result.height || null,

      duration:
        result.duration || null,
    });
  } catch (error) {
    console.error(
      "Upload Error:",
      error
    );

    // ==========================================
    // Delete Temporary File
    // ==========================================

    if (req.file?.path) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Media upload failed.",
    });
  }
};