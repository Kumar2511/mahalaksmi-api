import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import Product from "../models/Product.js";
import {
  createFingerprint,
  createScreenshotFingerprints,
  compareScreenshotToCatalogue,
} from "../utils/imageHash.js";

// ============================================================
// CATALOGUE FINGERPRINT CACHE
// ============================================================

const fingerprintCache = new Map();

// ============================================================
// CONSTANTS
// ============================================================

const EXACT_DISTANCE = 40;
const CATEGORY_DISTANCE = 48;
const PLAIN_IMAGE_STDEV = 12;

// ============================================================
// HELPERS
// ============================================================

const isRemoteUrl = (value) => {
  return typeof value === "string" && /^https?:\/\//i.test(value);
};

const getFilename = (value) => {
  if (!value || typeof value !== "string") return "";

  try {
    return decodeURIComponent(
      value.split("?")[0].split("/").pop() || ""
    ).toLowerCase();
  } catch {
    return (
      value.split("?")[0].split("/").pop() || ""
    ).toLowerCase();
  }
};

// ============================================================
// INSTAGRAM URL NORMALIZATION
// ============================================================

const normalizeInstagramUrl = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  try {
    const trimmed = value.trim();

    const parsed = new URL(
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`
    );

    const host = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^m\./, "");

    if (host !== "instagram.com") {
      return "";
    }

    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length < 2) {
      return "";
    }

    let type = segments[0].toLowerCase();

    if (type === "reels") {
      type = "reel";
    }

    if (!["p", "reel", "tv"].includes(type)) {
      return "";
    }

    const shortcode = segments[1]
      .toLowerCase()
      .trim();

    if (!shortcode) {
      return "";
    }

    return `${type}:${shortcode}`;
  } catch {
    return "";
  }
};

// ============================================================
// PRODUCT IMAGE HELPERS
// ============================================================

const getProductImageUrls = (product) => {
  if (!product) return [];

  const images = Array.isArray(product.images)
    ? product.images
    : [];

  return [
    ...images,
    product.image,
  ].filter(
    (value, index, array) =>
      Boolean(value) &&
      array.indexOf(value) === index
  );
};

const getPrimaryProductImage = (product, fallback = "") => {
  return (
    product?.images?.[0] ||
    product?.image ||
    fallback ||
    ""
  );
};

const buildProductResult = (
  product,
  matchedImage = ""
) => {
  return {
    _id: product._id,
    name: product.name,
    price: product.price,
    discountPrice: product.discountPrice,
    category: product.category,
    image: getPrimaryProductImage(
      product,
      matchedImage
    ),
  };
};

// ============================================================
// IMAGE DETAIL CHECK
// ============================================================

async function checkImageDetail(filePath) {
  try {
    const stats = await sharp(filePath).stats();

    const channels = stats.channels || [];

    const stdevs = channels.map(
      (channel) => channel.stdev || 0
    );

    const avgStdev =
      stdevs.reduce(
        (sum, value) => sum + value,
        0
      ) /
      (stdevs.length || 1);

    return {
      isPlain: avgStdev < PLAIN_IMAGE_STDEV,
      avgStdev,
    };
  } catch {
    // Never reject an image only because metadata extraction failed.
    return {
      isPlain: false,
      avgStdev: 50,
    };
  }
}

// ============================================================
// CATALOGUE IMAGE RESOLUTION
// ============================================================

async function resolveCatalogueImage(imgUrl) {
  if (!imgUrl) return null;

  try {
    const filename = getFilename(imgUrl);

    if (filename) {
      const localPublicPaths = [
        path.resolve(
          process.cwd(),
          "../mahalaksmi/public/products",
          filename
        ),
        path.resolve(
          process.cwd(),
          "..",
          "mahalaksmi",
          "public",
          "products",
          filename
        ),
        path.resolve(
          process.cwd(),
          "public/products",
          filename
        ),
        path.resolve(
          process.cwd(),
          "../mahalaksmi/public",
          filename
        ),
        path.resolve(
          process.cwd(),
          "..",
          "mahalaksmi",
          "public",
          filename
        ),
        path.resolve(
          process.cwd(),
          "public",
          filename
        ),
      ];

      for (const localPath of localPublicPaths) {
        if (fs.existsSync(localPath)) {
          return localPath;
        }
      }
    }

    if (isRemoteUrl(imgUrl)) {
      const response = await axios.get(
        imgUrl,
        {
          responseType: "arraybuffer",
          timeout: 5000,
          maxContentLength:
            10 * 1024 * 1024,
          maxBodyLength:
            10 * 1024 * 1024,
        }
      );

      return Buffer.from(response.data);
    }

    const cleanPath = imgUrl.startsWith("/")
      ? imgUrl.slice(1)
      : imgUrl;

    const possiblePaths = [
      path.resolve(
        process.cwd(),
        cleanPath
      ),
      path.resolve(
        process.cwd(),
        "../mahalaksmi",
        "public",
        cleanPath
      ),
      path.resolve(
        process.cwd(),
        "..",
        "mahalaksmi",
        "public",
        cleanPath
      ),
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    return null;
  } catch (error) {
    console.error(
      "Catalogue image resolution error:",
      error.message
    );

    return null;
  }
}

// ============================================================
// CATALOGUE FINGERPRINT
// ============================================================

async function getCatalogueFingerprint(imgUrl) {
  if (!imgUrl) return null;

  if (fingerprintCache.has(imgUrl)) {
    return fingerprintCache.get(imgUrl);
  }

  try {
    const imageInput =
      await resolveCatalogueImage(imgUrl);

    if (!imageInput) {
      fingerprintCache.set(imgUrl, null);
      return null;
    }

    const fingerprint =
      await createFingerprint(imageInput);

    fingerprintCache.set(
      imgUrl,
      fingerprint
    );

    return fingerprint;
  } catch (error) {
    console.error(
      `Catalogue fingerprint error (${imgUrl}):`,
      error.message
    );

    fingerprintCache.set(imgUrl, null);

    return null;
  }
}

// ============================================================
// UNIQUE CATEGORY PRODUCTS
// ============================================================

const deduplicateCategoryProducts = (
  products
) => {
  const unique = [];

  const seenIds = new Set();
  const seenImages = new Set();

  for (const product of products) {
    if (!product?._id) continue;

    const id = String(product._id);

    const image = String(
      getPrimaryProductImage(product)
    )
      .trim()
      .toLowerCase();

    // Prevent both duplicate IDs and duplicate
    // visual images from being shown.
    if (seenIds.has(id)) {
      continue;
    }

    if (image && seenImages.has(image)) {
      continue;
    }

    seenIds.add(id);

    if (image) {
      seenImages.add(image);
    }

    unique.push(
      buildProductResult(product)
    );
  }

  return unique;
};

// ============================================================
// INSTAGRAM URL SEARCH
// ============================================================

export const searchProductByUrl = async (
  req,
  res
) => {
  try {
    const { url } = req.body;

    if (
      !url ||
      typeof url !== "string"
    ) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message:
          "Please provide a valid Instagram product URL.",
        exactMatch: null,
        matches: [],
      });
    }

    const normalizedInput =
      normalizeInstagramUrl(url);

    if (!normalizedInput) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message:
          "Please provide a valid Instagram product URL.",
        exactMatch: null,
        matches: [],
      });
    }

    const products =
      await Product.find({
        instagramLink: {
          $exists: true,
          $nin: ["", null],
        },
      }).lean();

    const exactProduct =
      products.find(
        (product) =>
          normalizeInstagramUrl(
            product.instagramLink
          ) === normalizedInput
      );

    if (!exactProduct) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message:
          "Sorry, we can't find this product in our store.",
        exactMatch: null,
        matches: [],
      });
    }

    const result =
      buildProductResult(
        exactProduct
      );

    return res.status(200).json({
      success: true,
      matchType: "exact",
      message: "Product found!",
      exactMatch: result,
      matches: [result],
      redirectUrl:
        `/shop/${exactProduct._id}`,
    });
  } catch (error) {
    console.error(
      "Instagram URL Search Error:",
      error
    );

    return res.status(500).json({
      success: false,
      matchType: "none",
      message:
        "Unable to process Instagram link search. Please try again.",
      exactMatch: null,
      matches: [],
    });
  }
};

// ============================================================
// DETERMINISTIC VISUAL PRODUCT SEARCH
// ============================================================

export const findProductByImage = async (
  req,
  res
) => {
  let tempFilePath = null;

  try {
    // --------------------------------------------------------
    // 1. FILE VALIDATION
    // --------------------------------------------------------

    if (!req.file) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message:
          "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    tempFilePath = req.file.path;

    if (
      !tempFilePath ||
      !fs.existsSync(tempFilePath)
    ) {
      return res.status(400).json({
        success: false,
        matchType: "none",
        message:
          "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // 2. SOLID / ZERO-DETAIL IMAGE REJECTION
    // --------------------------------------------------------

    const detailStats =
      await checkImageDetail(
        tempFilePath
      );

    if (detailStats.isPlain) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message:
          "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // 3. GENERATE MULTI-REGION FINGERPRINTS
    // --------------------------------------------------------

    const screenshotFingerprints =
      await createScreenshotFingerprints(
        tempFilePath
      );

    if (
      !Array.isArray(
        screenshotFingerprints
      ) ||
      screenshotFingerprints.length === 0
    ) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message:
          "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // 4. LOAD REAL CATALOGUE
    // --------------------------------------------------------

    const products =
      await Product.find().lean();

    if (
      !Array.isArray(products) ||
      products.length === 0
    ) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message:
          "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // 5. COMPARE AGAINST EVERY CATALOGUE PRODUCT
    // --------------------------------------------------------

    const scoredProducts = [];

    const originalName =
      String(
        req.file.originalname || ""
      ).toLowerCase();

    for (const product of products) {
      const imageUrls =
        getProductImageUrls(product);

      if (imageUrls.length === 0) {
        continue;
      }

      let bestComparison = null;
      let matchedImageUrl = null;
      let exactFilenameMatched = false;

      for (const imageUrl of imageUrls) {
        const catalogueFilename =
          getFilename(imageUrl);

        // ----------------------------------------------------
        // EXACT FILENAME MATCH
        // ----------------------------------------------------

        if (
          catalogueFilename &&
          originalName &&
          originalName.includes(
            catalogueFilename
          )
        ) {
          exactFilenameMatched = true;

          bestComparison = {
            hashDistance: 0,
            colorDistance: 0,
            score: 0,
          };

          matchedImageUrl = imageUrl;

          break;
        }

        // ----------------------------------------------------
        // VISUAL FINGERPRINT MATCH
        // ----------------------------------------------------

        const catalogueFingerprint =
          await getCatalogueFingerprint(
            imageUrl
          );

        if (!catalogueFingerprint) {
          continue;
        }

        const comparison =
          compareScreenshotToCatalogue(
            screenshotFingerprints,
            catalogueFingerprint
          );

        if (!comparison) {
          continue;
        }

        // IMPORTANT:
        // We choose the candidate by the actual
        // hashDistance first.
        //
        // This guarantees that "bestDistance"
        // really means the closest visual structure.
        // ----------------------------------------------------

        if (
          !bestComparison ||
          comparison.hashDistance <
            bestComparison.hashDistance ||
          (
            comparison.hashDistance ===
              bestComparison.hashDistance &&
            comparison.colorDistance <
              bestComparison.colorDistance
          )
        ) {
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

    // --------------------------------------------------------
    // 6. NO VISUAL CANDIDATE
    // --------------------------------------------------------

    if (scoredProducts.length === 0) {
      return res.status(200).json({
        success: true,
        matchType: "none",
        message:
          "Please upload a valid jewellery image or product screenshot.",
        exactMatch: null,
        matches: [],
      });
    }

    // --------------------------------------------------------
    // 7. SORT BY REAL VISUAL DISTANCE
    // --------------------------------------------------------

    scoredProducts.sort(
      (a, b) => {
        const hashDifference =
          a.comparison.hashDistance -
          b.comparison.hashDistance;

        if (hashDifference !== 0) {
          return hashDifference;
        }

        return (
          a.comparison.colorDistance -
          b.comparison.colorDistance
        );
      }
    );

    const topMatch =
      scoredProducts[0];

    const bestDistance =
      Number(
        topMatch.comparison.hashDistance
      );

    // ========================================================
    // A) EXACT PRODUCT
    // ========================================================

    // STRICT RULE:
    // bestDistance <= 40
    // OR exact filename match.
    //
    // NO extra color-distance rejection here.
    // ========================================================

    const isExact =
      topMatch.exactFilenameMatched ||
      bestDistance <= EXACT_DISTANCE;

    if (isExact) {
      const exactProduct =
        buildProductResult(
          topMatch.product,
          topMatch.matchedImageUrl
        );

      return res.status(200).json({
        success: true,
        matchType: "exact",
        message: "Exact product found!",
        exactMatch: exactProduct,
        matches: [exactProduct],
        redirectUrl:
          `/shop/${topMatch.product._id}`,
      });
    }

    // ========================================================
    // B) VALID JEWELLERY / CATEGORY FALLBACK
    // ========================================================

    const isCategoryFallback =
      bestDistance > EXACT_DISTANCE &&
      bestDistance <= CATEGORY_DISTANCE;

    if (isCategoryFallback) {
      // ------------------------------------------------------
      // TOP 3 VISUAL CANDIDATES
      // ------------------------------------------------------

      const top3Candidates =
        scoredProducts.slice(0, 3);

      const categoryScores =
        new Map();

      for (const candidate of top3Candidates) {
        const category =
          String(
            candidate.product.category || ""
          ).trim();

        if (!category) {
          continue;
        }

        const distance =
          Number(
            candidate.comparison.hashDistance
          );

        // Smaller distance = stronger weight.
        const weight =
          Math.max(
            1,
            CATEGORY_DISTANCE + 1 - distance
          );

        const previous =
          categoryScores.get(category) || 0;

        categoryScores.set(
          category,
          previous + weight
        );
      }

      let detectedCategory = null;
      let highestScore = -1;

      for (
        const [
          category,
          score,
        ] of categoryScores.entries()
      ) {
        if (score > highestScore) {
          highestScore = score;
          detectedCategory = category;
        }
      }

      // ------------------------------------------------------
      // ONLY REAL PRODUCTS FROM DETECTED CATEGORY
      // ------------------------------------------------------

      if (detectedCategory) {
        const categoryProducts =
          products.filter(
            (product) =>
              String(
                product.category || ""
              ).toLowerCase() ===
              String(
                detectedCategory
              ).toLowerCase()
          );

        const uniqueCategoryProducts =
          deduplicateCategoryProducts(
            categoryProducts
          );

        if (
          uniqueCategoryProducts.length > 0
        ) {
          return res.status(200).json({
            success: true,
            matchType: "category",
            category:
              detectedCategory,
            message:
              `We couldn't find the exact product, but these ${detectedCategory} items may be related:`,
            exactMatch: null,
            matches:
              uniqueCategoryProducts.slice(
                0,
                8
              ),
          });
        }
      }
    }

    // ========================================================
    // C) RANDOM / NON-JEWELLERY / TOO-FAR IMAGE
    // ========================================================

    return res.status(200).json({
      success: true,
      matchType: "none",
      message:
        "Please upload a valid jewellery image or product screenshot.",
      exactMatch: null,
      matches: [],
    });
  } catch (error) {
    console.error(
      "Visual Image Search Error:",
      error
    );

    return res.status(500).json({
      success: false,
      matchType: "none",
      message:
        "Unable to analyze screenshot. Please try another image.",
      exactMatch: null,
      matches: [],
    });
  } finally {
    // --------------------------------------------------------
    // CLEAN TEMP UPLOAD
    // --------------------------------------------------------

    if (
      tempFilePath &&
      fs.existsSync(tempFilePath)
    ) {
      try {
        fs.unlinkSync(
          tempFilePath
        );
      } catch {
        // silent cleanup failure
      }
    }
  }
};