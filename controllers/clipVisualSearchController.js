import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { runHybridFallback } from "../services/hybridFallbackService.js";

export const performClipShadowSearch = async (req, res) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    if (!req.file || (!req.file.buffer && !req.file.path)) {
      return res.status(400).json({
        success: false,
        source: "hybrid_clip",
        requestId,
        message: "Please upload an image file.",
      });
    }

    // In-memory buffer from multer.memoryStorage()
    let fileBuffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({
        success: false,
        source: "hybrid_clip",
        requestId,
        message: "Uploaded file is empty.",
      });
    }

    // Run isolated hybrid fallback pipeline (in-memory only, no disk/Cloudinary writes)
    const fallbackResult = await runHybridFallback(fileBuffer, {
      requestId,
    });

    // Explicitly discard local buffer reference
    fileBuffer = null;

    return res.status(200).json({
      ...fallbackResult,
      requestId,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("[ClipShadowSearchError]:", error);
    return res.status(500).json({
      success: false,
      source: "hybrid_clip",
      requestId,
      message: "Internal server error during CLIP shadow fallback search.",
      error: error.message,
    });
  }
};
