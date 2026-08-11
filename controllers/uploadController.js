import cloudinary from "../config/cloudinary.js";
import fs from "fs";

export const uploadMedia = async (req, res) => {
  console.log("========== Upload API Hit ==========");
  console.log("File:", req.file);
  console.log("Body:", req.body);

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const folder =
      req.body.folder || "mahalaksmi-products";

    console.log("Uploading media to Cloudinary...");

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

    // Remove temporary local file
    try {
      fs.unlinkSync(req.file.path);
    } catch (deleteError) {
      console.warn(
        "Temporary file could not be deleted:",
        deleteError.message
      );
    }

    return res.status(200).json({
      success: true,

      // Used by existing image upload code
      imageUrl: result.secure_url,

      // Used by video upload code
      mediaUrl: result.secure_url,

      resourceType:
        result.resource_type,

      format: result.format,

      publicId:
        result.public_id,
    });
  } catch (error) {
    console.error(
      "Upload Error:",
      error
    );

    // Remove temporary file if upload fails
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};