import fs from "fs";
import path from "path";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";

import Product from "../models/Product.js";
import {
  createFingerprint,
  createScreenshotFingerprints,
  compareFingerprints,
  compareScreenshotToCatalogue,
} from "../utils/imageHash.js";

// ============================================================
// GEMINI SERVER-SIDE VISION SETUP
// ============================================================
function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Server-side AI image classifier for jewellery category detection.
 * Never exposes AI keys or internal details to the client.
 */
async function classifyImageWithGemini(filePath) {
  const ai = getGeminiClient();
  if (!ai) {
    console.warn("Gemini vision classification skipped: GEMINI_API_KEY missing");
    return null;
  }
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error("Error reading file for Gemini vision:", err);
    return null;
  }

  const base64Data = fileBuffer.toString("base64");

  const prompt = `Analyze this image for a luxury jewellery store.
Determine:
1. Is this image showing a valid jewellery product (necklace, ring, earrings, bracelet, chain, pendant, jewellery set, accessory) or a person wearing jewellery as the main subject? (true/false)
   If it is a car, animal, building, food, document, meme, text screenshot, computer screenshot, generic logo, landscape, non-jewellery product, or unrelated photo, answer false.
2. If true, classify it into EXACTLY ONE of these 8 categories:
   ["Necklaces", "Chains", "Bracelets", "Earrings", "Rings", "Pendants", "Jewelry Sets", "Accessories"]

Return ONLY a raw JSON object:
{
  "isJewellery": boolean,
  "category": string | null,
  "confidence": number
}`;

  const CANONICAL_CATEGORIES = [
    "Necklaces",
    "Chains",
    "Bracelets",
    "Earrings",
    "Rings",
    "Pendants",
    "Jewelry Sets",
    "Accessories",
  ];

  const models = [
    "gemini-3.6-flash",
    "gemma-4-26b-a4b-it",
  ];

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data,
            },
          },
          prompt,
        ],
      });

      const text = response.text || "";
      console.log(`[GEMINI RAW RESPONSE] model: "${model}" ->`, text.trim());
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const isJewellery = Boolean(parsed.isJewellery);
        let category = null;

        if (isJewellery && parsed.category) {
          const normP = String(parsed.category).trim().toLowerCase();
          const matchedCat = CANONICAL_CATEGORIES.find((c) => {
            const normC = c.toLowerCase();
            return normC === normP || normC === normP + "s" || normC + "s" === normP;
          });
          if (matchedCat) {
            category = matchedCat;
          }
        }

        const result = {
          modelUsed: model,
          isJewellery,
          category,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
        };
        console.log("[GEMINI PARSED RESULT]", result);
        return result;
      }
    } catch (err) {
      console.warn(`Gemini vision classification warning (${model}):`, err.message);
    }
  }
  return null;
}

/**
 * Check if an image is a solid color / zero-detail / plain canvas image.
 */
async function checkImageDetail(filePath) {
  try {
    const stats = await sharp(filePath).stats();
    const channels = stats.channels || [];
    const stdevs = channels.map((c) => c.stdev || 0);
    const avgStdev = stdevs.reduce((a, b) => a + b, 0) / (stdevs.length || 1);

    if (avgStdev < 12) {
      return { isPlain: true, avgStdev };
    }
    return { isPlain: false, avgStdev };
  } catch (e) {
    return { isPlain: false, avgStdev: 50 };
  }
}

// ============================================================
// CATALOGUE FINGERPRINT CACHE
// ============================================================
const fingerprintCache = new Map();

// ============================================================
// HELPERS
// ============================================================
const isRemoteUrl = (value) => {
  return typeof value === "string" && /^https?:\/\//i.test(value);
};

const getFilename = (value) => {
  if (!value || typeof value !== "string") return "";
  try {
    return decodeURIComponent(value.split("?")[0].split("/").pop() || "").toLowerCase();
  } catch {
    return (value.split("?")[0].split("/").pop() || "").toLowerCase();
  }
};

const normalizeInstagramUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  return value.trim().toLowerCase().split("?")[0].replace(/\/+$/, "");
};

const getProductImageUrls = (product) => {
  if (!product) return [];
  const images = Array.isArray(product.images) ? product.images : [];
  return [...images, product.image].filter(
    (value, index, array) => Boolean(value) && array.indexOf(value) === index
  );
};

// ============================================================
// RESOLVE CATALOGUE IMAGE
// ============================================================
async function resolveCatalogueImage(imgUrl) {
  if (!imgUrl) return null;

  try {
    const filename = getFilename(imgUrl);
    if (filename) {
      const localPublicPaths = [
        path.resolve(process.cwd(), "../mahalaksmi/public/products", filename),
        path.resolve(process.cwd(), "..", "mahalaksmi", "public", "products", filename),
        path.resolve(process.cwd(), "public/products", filename),
        path.resolve(process.cwd(), "../mahalaksmi/public", filename),
        path.resolve(process.cwd(), "..", "mahalaksmi", "public", filename),
        path.resolve(process.cwd(), "public", filename),
      ];
      for (const p of localPublicPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    }

    if (isRemoteUrl(imgUrl)) {
      const response = await axios.get(imgUrl, {
        responseType: "arraybuffer",
        timeout: 3000,
        maxContentLength: 10 * 1024 * 1024,
        maxBodyLength: 10 * 1024 * 1024,
      });
      return Buffer.from(response.data);
    }

    const cleanPath = imgUrl.startsWith("/") ? imgUrl.slice(1) : imgUrl;
    const possiblePaths = [
      path.resolve(process.cwd(), cleanPath),
      path.resolve(process.cwd(), "../mahalaksmi", "public", cleanPath),
      path.resolve(process.cwd(), "..", "mahalaksmi", "public", cleanPath),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// GET CATALOGUE FINGERPRINT
// ============================================================
async function getCatalogueFingerprint(imgUrl) {
  if (!imgUrl) return null;
  if (fingerprintCache.has(imgUrl)) return fingerprintCache.get(imgUrl);

  try {
    const imageInput = await resolveCatalogueImage(imgUrl);
    if (!imageInput) {
      fingerprintCache.set(imgUrl, null);
      return null;
    }

    const fingerprint = await createFingerprint(imageInput);
    fingerprintCache.set(imgUrl, fingerprint);
    return fingerprint;
  } catch (error) {
    console.error(`Catalogue fingerprint error (${imgUrl}):`, error.message);
    fingerprintCache.set(imgUrl, null);
    return null;
  }
}

// ============================================================
// INSTAGRAM URL SEARCH
// ============================================================
export const searchProductByUrl = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message: "Please provide a valid Instagram product URL.",
        exactMatch: null,
        matches: [],
      });
    }

    const inputUrl = normalizeInstagramUrl(url);
    if (!inputUrl) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message: "Please provide a valid Instagram product URL.",
        exactMatch: null,
        matches: [],
      });
    }

    const products = await Product.find({
      instagramLink: { $exists: true, $nin: ["", null] },
    }).lean();

    const exactProduct = products.find(
      (product) => normalizeInstagramUrl(product.instagramLink) === inputUrl
    );

    if (!exactProduct) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message: "Sorry, we can't find this product in our store.",
        exactMatch: null,
        matches: [],
      });
    }

    const result = {
      _id: exactProduct._id,
      name: exactProduct.name,
      price: exactProduct.price,
      discountPrice: exactProduct.discountPrice,
      category: exactProduct.category,
      image: exactProduct.images?.[0] || exactProduct.image || "",
    };

    return res.status(200).json({
      success: true,
      matchType: "exact",
      message: "Product found!",
      exactMatch: result,
      matches: [result],
      redirectUrl: `/shop/${exactProduct._id}`,
    });
  } catch (error) {
    console.error("Instagram URL Search Error:", error);
    return res.status(500).json({
      success: false,
      matchType: "none",
      message: "Unable to process Instagram link search. Please try again.",
      exactMatch: null,
      matches: [],
    });
  }
};

// ============================================================
// VISUAL PRODUCT SEARCH (STRICT 3-STEP DECISION TREE)
// ============================================================
export const findProductByImage = async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message: "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    tempFilePath = req.file.path;
    if (!fs.existsSync(tempFilePath)) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message: "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // STEP 0: SERVER-SIDE AI CLASSIFICATION & DETAIL CHECK
    // --------------------------------------------------------
    const detailStats = await checkImageDetail(tempFilePath);

    // If image is a solid color / plain canvas with zero visual detail -> REJECT IMMEDIATELY (CASE 3)
    if (detailStats.isPlain) {
      console.log("🚫 Rejected plain/solid color image screenshot.");
      return res.status(200).json({
        success: true,
        matchType: "none",
        message: "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    const aiAnalysis = await classifyImageWithGemini(tempFilePath);

    // If Gemini explicitly says this is NOT a jewellery image -> REJECT IMMEDIATELY (CASE 3)
    if (aiAnalysis && aiAnalysis.isJewellery === false) {
      console.log("🚫 Gemini rejected non-jewellery image screenshot.");
      return res.status(200).json({
        success: true,
        matchType: "none",
        message: "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // STEP 1: MULTI-REGION FINGERPRINT COMPARISON
    // --------------------------------------------------------
    const screenshotFingerprints = await createScreenshotFingerprints(tempFilePath);
    const products = await Product.find().lean();

    if (!products || products.length === 0 || !screenshotFingerprints || screenshotFingerprints.length === 0) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message: "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    const scoredProducts = [];
    const originalName = (req.file.originalname || "").toLowerCase();

    for (const product of products) {
      const imageUrls = getProductImageUrls(product);
      if (imageUrls.length === 0) continue;

      let bestComparison = null;
      let matchedImageUrl = null;
      let exactFilenameMatched = false;

      for (const imageUrl of imageUrls) {
        const imgFilename = getFilename(imageUrl);
        if (imgFilename && originalName && originalName.includes(imgFilename)) {
          exactFilenameMatched = true;
          bestComparison = { hashDistance: 0, colorDistance: 0, score: 0 };
          matchedImageUrl = imageUrl;
          break;
        }

        const catalogueFingerprint = await getCatalogueFingerprint(imageUrl);
        if (!catalogueFingerprint) continue;

        const comparison = compareScreenshotToCatalogue(screenshotFingerprints, catalogueFingerprint);
        if (!comparison) continue;

        if (!bestComparison || comparison.score < bestComparison.score) {
          bestComparison = comparison;
          matchedImageUrl = imageUrl;
        }
      }

      if (bestComparison) {
        scoredProducts.push({
          product,
          comparison: bestComparison,
          matchedImageUrl,
          exactFilenameMatched,
        });
      }
    }

    if (scoredProducts.length === 0) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message: "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    scoredProducts.sort((a, b) => a.comparison.score - b.comparison.score);

    const topMatch = scoredProducts[0];
    const secondMatch = scoredProducts[1] || null;

    const topDistance = topMatch.comparison.hashDistance;
    const topColorDistance = topMatch.comparison.colorDistance;
    const secondDistance = secondMatch ? secondMatch.comparison.hashDistance : 256;

    // Strict exact match thresholds
    const strongExact = topDistance <= 18 && topColorDistance <= 40;
    const dominantExact =
      topDistance <= 26 &&
      topColorDistance <= 60 &&
      (secondDistance - topDistance >= 14 || secondDistance >= 50);

    const isExact = topMatch.exactFilenameMatched || strongExact || dominantExact;

    // ========================================================
    // CASE 1: EXACT PRODUCT MATCH (ONLY ONE PRODUCT RETURNED)
    // ========================================================
    if (isExact) {
      const product = topMatch.product;
      const exactProduct = {
        _id: product._id,
        name: product.name,
        price: product.price,
        discountPrice: product.discountPrice,
        category: product.category,
        image: product.images?.[0] || product.image || topMatch.matchedImageUrl || "",
      };

      return res.status(200).json({
        success: true,
        matchType: "exact",
        message: "Exact product found!",
        exactMatch: exactProduct,
        matches: [exactProduct],
        redirectUrl: `/shop/${product._id}`,
      });
    }

    // ========================================================
    // CASE 2: CATEGORY MATCH FOR VALID JEWELLERY SCREENSHOTS
    // ========================================================
    const CANONICAL_CATEGORIES = [
      "Necklaces",
      "Chains",
      "Bracelets",
      "Earrings",
      "Rings",
      "Pendants",
      "Jewelry Sets",
      "Accessories",
    ];

    let detectedCategory = null;

    if (aiAnalysis && aiAnalysis.isJewellery === true && aiAnalysis.category) {
      const matchCat = CANONICAL_CATEGORIES.find(
        (c) => c.toLowerCase() === String(aiAnalysis.category).trim().toLowerCase()
      );
      if (matchCat) {
        detectedCategory = matchCat;
      }
    }

    if (detectedCategory) {
      const catProducts = products.filter(
        (p) => String(p.category || "").toLowerCase() === String(detectedCategory).toLowerCase()
      );

      if (catProducts.length > 0) {
        const uniqueCatProducts = [];
        const seenIds = new Set();

        for (const p of catProducts) {
          const idStr = String(p._id);
          if (!seenIds.has(idStr)) {
            seenIds.add(idStr);
            uniqueCatProducts.push({
              _id: p._id,
              name: p.name,
              price: p.price,
              discountPrice: p.discountPrice,
              category: p.category,
              image: p.images?.[0] || p.image || "",
            });
          }
        }

        return res.status(200).json({
          success: true,
          matchType: "category",
          category: detectedCategory,
          message: `We couldn't find the exact product, but these ${detectedCategory} items may be related:`,
          exactMatch: null,
          matches: uniqueCatProducts.slice(0, 8),
        });
      }
    }

    // ========================================================
    // CASE 3: INVALID / UNRELATED IMAGE REJECTION (ZERO PRODUCTS)
    // ========================================================
    return res.status(200).json({
      success: true,
      matchType: "none",
      message: "Please upload a valid jewellery image or product screenshot.",
      exactMatch: null,
      matches: [],
    });

  } catch (error) {
    console.error("Visual Image Search Error:", error);
    return res.status(500).json({
      success: false,
      matchType: "none",
      message: "Unable to analyze screenshot. Please try another image.",
      exactMatch: null,
      matches: [],
    });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log("🧹 Temporary visual-search screenshot deleted.");
      } catch (e) {
        // silent
      }
    }
  }
};