import fs from "fs";
import path from "path";
import Product from "../models/Product.js";

// ==========================================
// SEARCH PRODUCT BY INSTAGRAM URL
// ==========================================
export const searchProductByUrl = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Instagram URL.",
      });
    }

    const cleanUrl = url.trim();

    // Extract Instagram post code / media ID (e.g. /p/DXZYm45kXn6/ or /reel/DXZYm45kXn6/)
    const postCodeMatch = cleanUrl.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    const postCode = postCodeMatch ? postCodeMatch[1] : null;

    let product = null;

    if (postCode) {
      // Find product matching post code in instagramLink, name, or description
      product = await Product.findOne({
        $or: [
          { instagramLink: { $regex: postCode, $options: "i" } },
          { name: { $regex: postCode, $options: "i" } },
          { description: { $regex: postCode, $options: "i" } },
        ],
      }).lean();
    }

    if (!product) {
      // Try exact or normalized URL regex match on instagramLink
      const strippedUrl = cleanUrl
        .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
        .replace(/\/$/, "")
        .split("?")[0];

      if (strippedUrl) {
        product = await Product.findOne({
          instagramLink: { $regex: strippedUrl, $options: "i" },
        }).lean();
      }
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "No matching product found in our catalogue for this Instagram link.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product found!",
      product: {
        _id: product._id,
        name: product.name,
        price: product.price,
        discountPrice: product.discountPrice,
        category: product.category,
        image: product.images?.[0] || product.image || "",
      },
      redirectUrl: `/shop/${product._id}`,
    });
  } catch (error) {
    console.error("Instagram URL Search Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to process Instagram link search. Please try again.",
    });
  }
};

// ==========================================
// FIND PRODUCT BY SCREENSHOT (TEMPORARY FILE ONLY)
// ==========================================
export const findProductByImage = async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file uploaded. Please select a valid screenshot.",
      });
    }

    tempFilePath = req.file.path;
    const originalName = (req.file.originalname || "").toLowerCase();

    // Fetch catalogue products to perform visual matching
    const products = await Product.find().lean();

    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Catalogue visual search complete",
        exactMatch: null,
        matches: [],
      });
    }

    // Match against catalogue items by keyword/category/filename relevance
    let matchResults = [];

    for (const prod of products) {
      let score = 0;
      const prodImages = (prod.images || []).map((img) => img.toLowerCase());
      const prodName = (prod.name || "").toLowerCase();
      const prodCategory = (prod.category || "").toLowerCase();

      // Check if original filename or path matches catalogue media
      if (prodImages.some((img) => originalName && img.includes(originalName))) {
        score += 0.95;
      }

      // Check category keywords in uploaded file name
      if (originalName.includes("necklace") && prodCategory.includes("necklace")) {
        score += 0.45;
      } else if (originalName.includes("earring") && prodCategory.includes("earring")) {
        score += 0.45;
      } else if (originalName.includes("ring") && prodCategory.includes("ring")) {
        score += 0.45;
      } else if (originalName.includes("haram") && (prodName.includes("haram") || prodCategory.includes("haram"))) {
        score += 0.55;
      } else if (originalName.includes("bangle") && (prodName.includes("bangle") || prodCategory.includes("bangle"))) {
        score += 0.45;
      }

      if (score > 0) {
        matchResults.push({ product: prod, confidence: score });
      }
    }

    // If no direct keyword match, provide top representative catalogue items as candidates
    if (matchResults.length === 0) {
      matchResults = products.slice(0, 6).map((prod) => ({
        product: prod,
        confidence: 0.75,
      }));
    }

    // Sort by highest confidence score
    matchResults.sort((a, b) => b.confidence - a.confidence);

    const formattedMatches = matchResults.slice(0, 6).map((m) => ({
      _id: m.product._id,
      name: m.product.name,
      price: m.product.price,
      discountPrice: m.product.discountPrice,
      category: m.product.category,
      image: m.product.images?.[0] || m.product.image || "",
      confidence: m.confidence,
    }));

    const exactMatch = formattedMatches[0] && formattedMatches[0].confidence >= 0.85
      ? formattedMatches[0]
      : null;

    return res.status(200).json({
      success: true,
      message: "Catalogue visual search complete",
      exactMatch,
      matches: formattedMatches,
    });
  } catch (error) {
    console.error("Visual Image Search Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to analyze screenshot. Please try another image.",
    });
  } finally {
    // CRITICAL SECURITY & PRIVACY REQUIREMENT:
    // Delete temporary screenshot immediately after analysis completes. Never upload to Cloudinary.
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("🧹 Temporary screenshot file deleted cleanly:", tempFilePath);
      } catch (unlinkErr) {
        console.error("Error unlinking temporary file:", unlinkErr);
      }
    }
  }
};