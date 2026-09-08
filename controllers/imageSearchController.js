import fs from "fs";
import path from "path";
import axios from "axios";
import Product from "../models/Product.js";
import {
  computeImageFingerprint,
  compareFingerprints,
  detectJewelleryCategory,
} from "../utils/imageHash.js";

// Cache for catalogue image fingerprints to avoid re-hashing static images repeatedly
const fingerprintCache = new Map();

/**
 * Resolves local file paths or fetches Cloudinary buffers to compute fingerprints.
 * Handles both backend uploads (/uploads/) and frontend public (/products/) paths.
 */
async function getCatalogueFingerprints(imgUrl) {
  if (!imgUrl) return [];

  if (fingerprintCache.has(imgUrl)) {
    return fingerprintCache.get(imgUrl);
  }

  try {
    let imageInput = null;

    if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
      // Cloudinary / Remote URL
      const response = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 6000,
      });
      imageInput = Buffer.from(response.data);
    } else {
      // Relative path handling
      const cleanPath = imgUrl.startsWith("/") ? imgUrl.slice(1) : imgUrl;
      const backendUploadsPath = path.resolve(process.cwd(), cleanPath);
      const frontendPublicPath = path.resolve(process.cwd(), "../mahalaksmi/public", cleanPath);

      if (fs.existsSync(backendUploadsPath)) {
        imageInput = backendUploadsPath;
      } else if (fs.existsSync(frontendPublicPath)) {
        imageInput = frontendPublicPath;
      }
    }

    if (imageInput) {
      const fingerprints = await computeImageFingerprint(imageInput);
      fingerprintCache.set(imgUrl, fingerprints);
      return fingerprints;
    }
  } catch (err) {
    console.error(`Error fingerprinting catalogue image (${imgUrl}):`, err.message);
  }

  fingerprintCache.set(imgUrl, []);
  return [];
}

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
        matchType: "none",
        message: "This product is not available in our store.",
      });
    }

    return res.status(200).json({
      success: true,
      matchType: "exact",
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
// FIND PRODUCT BY SCREENSHOT (HIGH-PRECISION VISUAL SEARCH)
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

    // 1. Compute 256-bit perceptual fingerprints for uploaded screenshot
    const uploadedFingerprints = await computeImageFingerprint(tempFilePath);

    // Fetch catalogue products from MongoDB
    const products = await Product.find().lean();

    if (!products || products.length === 0 || uploadedFingerprints.length === 0) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message: "⚠️ We couldn't identify a jewellery product. Please upload a jewellery image or choose a category below.",
        exactMatch: null,
        matches: [],
      });
    }

    // 2. Perform 256-bit Hash & Color comparison against catalogue product images
    const scoredProducts = [];

    for (const prod of products) {
      const prodImages = [
        ...(prod.images || []),
        prod.image,
      ].filter(Boolean);

      let minDist = 256;
      let minColor = 255;
      let exactFilenameMatched = false;

      for (const imgUrl of prodImages) {
        // Filename identity check (Priority 1a)
        const imgFilename = imgUrl.split("/").pop()?.toLowerCase() || "";
        if (imgFilename && originalName && originalName.includes(imgFilename)) {
          minDist = 0;
          minColor = 0;
          exactFilenameMatched = true;
          break;
        }

        // 256-Bit Perceptual Fingerprint Check (Priority 1b)
        const catalogueFps = await getCatalogueFingerprints(imgUrl);
        if (catalogueFps.length > 0) {
          const { minDistance, minColorDiff } = compareFingerprints(uploadedFingerprints, catalogueFps);
          if (minDistance < minDist) {
            minDist = minDistance;
            minColor = minColorDiff;
          }
        }
      }

      scoredProducts.push({
        product: prod,
        distance: minDist,
        colorDiff: minColor,
        exactFilenameMatched,
        confidence: Math.max(0, (256 - minDist) / 256),
      });
    }

    // Sort products by lowest 256-bit distance, then by lowest color difference
    scoredProducts.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.colorDiff - b.colorDiff;
    });

    const topMatch = scoredProducts[0];
    const secondMatch = scoredProducts[1] || { distance: 256, colorDiff: 255 };

    // =========================================================
    // LEVEL 1: EXACT PRODUCT MATCH
    // Requirement: Must be 100% exact catalogue identity.
    // 1. Filename match OR
    // 2. Full/crop 256-bit distance <= 20 & color diff <= 30 OR
    // 3. Multi-region crop distance <= 28 & color diff <= 35 with clear score dominance over 2nd best candidate
    // =========================================================
    const isDominantMatch =
      topMatch &&
      topMatch.distance <= 28 &&
      topMatch.colorDiff <= 35 &&
      (secondMatch.distance - topMatch.distance >= 15 || secondMatch.distance > 40);

    const isExactMatch =
      topMatch &&
      (topMatch.exactFilenameMatched ||
        (topMatch.distance <= 20 && topMatch.colorDiff <= 30) ||
        isDominantMatch);

    if (isExactMatch) {
      const exactProduct = {
        _id: topMatch.product._id,
        name: topMatch.product.name,
        price: topMatch.product.price,
        discountPrice: topMatch.product.discountPrice,
        category: topMatch.product.category,
        image: topMatch.product.images?.[0] || topMatch.product.image || "",
        confidence: topMatch.confidence,
      };

      return res.status(200).json({
        success: true,
        matchType: "exact",
        message: "Product found!",
        exactMatch: exactProduct,
        matches: [exactProduct],
        redirectUrl: `/shop/${exactProduct._id}`,
      });
    }

    // =========================================================
    // LEVEL 2: NO EXACT MATCH -> RELATIVE CATEGORY PRODUCTS (UP TO 6 COMPACT CARDS)
    // =========================================================
    let detectedCategory = null;

    if (originalName.includes("necklace") || originalName.includes("haram") || originalName.includes("attigai")) {
      detectedCategory = "Necklaces";
    } else if (originalName.includes("earring") || originalName.includes("jhumka") || originalName.includes("stud")) {
      detectedCategory = "Earrings";
    } else if (originalName.includes("ring")) {
      detectedCategory = "Rings";
    } else if (originalName.includes("bangle") || originalName.includes("bracelet") || originalName.includes("kada")) {
      detectedCategory = "Bracelets";
    } else if (originalName.includes("chain")) {
      detectedCategory = "Chains";
    } else if (originalName.includes("pendant")) {
      detectedCategory = "Pendants";
    } else if (originalName.includes("set")) {
      detectedCategory = "Jewelry Sets";
    } else if (topMatch && topMatch.distance <= 75) {
      // Visual category hint from catalogue item if distance indicates jewellery similarity
      detectedCategory = topMatch.product.category || null;
    }

    if (!detectedCategory) {
      detectedCategory = await detectJewelleryCategory(tempFilePath);
    }

    if (detectedCategory) {
      const catProds = products.filter(
        (p) => String(p.category || "").toLowerCase() === detectedCategory.toLowerCase()
      );

      if (catProds.length > 0) {
        const compactSimilar = catProds.slice(0, 6).map((p) => ({
          _id: p._id,
          name: p.name,
          price: p.price,
          discountPrice: p.discountPrice,
          category: p.category,
          image: p.images?.[0] || p.image || "",
          confidence: 0.7,
        }));

        return res.status(200).json({
          success: true,
          matchType: "similar",
          message: "We couldn't find the exact product, but these may be related:",
          categoryName: detectedCategory,
          exactMatch: null,
          matches: compactSimilar,
        });
      }
    }

    // =========================================================
    // LEVEL 3: INVALID / UNRELATED IMAGE -> NO MATCH STATE
    // =========================================================
    return res.status(200).json({
      success: true,
      matchType: "none",
      message: "⚠️ We couldn't identify a jewellery product. Please upload a jewellery image or choose a category below.",
      exactMatch: null,
      matches: [],
    });

  } catch (error) {
    console.error("Visual Image Search Error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to analyze screenshot. Please try another image.",
    });
  } finally {
    // CRITICAL SECURITY & PRIVACY REQUIREMENT:
    // Delete temporary screenshot immediately after analysis completes.
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