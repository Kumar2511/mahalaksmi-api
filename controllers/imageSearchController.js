import fs from "fs";
import path from "path";
import sharp from "sharp";
import axios from "axios";
import Product from "../models/Product.js";
import crypto from "crypto";

import {
  createScreenshotFingerprints,
  createCatalogueFingerprints,
  compareScreenshotToCatalogue,
} from "../utils/imageHash.js";
import { runHybridFallback, shouldPromoteHybridFallback } from "../services/hybridFallbackService.js";

/**
 * ============================================================
 * THE GIRL HOUSE - IMAGE SEARCH CONTROLLER
 * ============================================================
 */

const CUSTOMER_SITE_URL =
  process.env.CUSTOMER_SITE_URL ||
  "https://the-girl-ho-she.vercel.app";

/**
 * ------------------------------------------------------------
 * MATCHING THRESHOLDS
 * ------------------------------------------------------------
 *
 * Exact:
 *   Very strong structural match.
 *
 * Similar:
 *   Meaningful visual similarity only.
 *
 * Random images should remain below these thresholds.
 * ------------------------------------------------------------
 */

const EXACT_SIMILARITY = 0.80;
const VERY_STRONG_EXACT = 0.86;
const SIMILAR_SIMILARITY = 0.72;
const EXACT_MARGIN = 0.008;

/**
 * ------------------------------------------------------------
 * CACHE
 * ------------------------------------------------------------
 */

const catalogueCache =
  new Map();

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function cleanString(value) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function isRemoteUrl(value) {
  return (
    typeof value ===
      "string" &&
    /^https?:\/\//i.test(
      value
    )
  );
}

function getFilename(value) {
  const stringValue =
    cleanString(value);

  if (!stringValue) {
    return "";
  }

  try {
    return decodeURIComponent(
      stringValue
        .split("?")[0]
        .split("/")
        .pop() || ""
    ).toLowerCase();
  } catch {
    return (
      stringValue
        .split("?")[0]
        .split("/")
        .pop() || ""
    ).toLowerCase();
  }
}

/**
 * ------------------------------------------------------------
 * INSTAGRAM URL NORMALIZATION
 * ------------------------------------------------------------
 *
 * Existing working Instagram functionality preserved.
 * ------------------------------------------------------------
 */

function normalizeInstagramUrl(
  value
) {
  if (
    !value ||
    typeof value !==
      "string"
  ) {
    return "";
  }

  try {
    const trimmed =
      value.trim();

    const parsed =
      new URL(
        trimmed.startsWith(
          "http://"
        ) ||
          trimmed.startsWith(
            "https://"
          )
          ? trimmed
          : `https://${trimmed}`
      );

    const host =
      parsed.hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        )
        .replace(
          /^m\./,
          ""
        );

    if (
      host !==
      "instagram.com"
    ) {
      return "";
    }

    const segments =
      parsed.pathname
        .split("/")
        .map(
          (segment) =>
            segment.trim()
        )
        .filter(Boolean);

    if (
      segments.length <
      2
    ) {
      return "";
    }

    let type =
      segments[0]
        .toLowerCase();

    if (
      type === "reels"
    ) {
      type = "reel";
    }

    if (
      ![
        "p",
        "reel",
        "tv",
      ].includes(type)
    ) {
      return "";
    }

    const shortcode =
      segments[1]
        .toLowerCase()
        .trim();

    if (!shortcode) {
      return "";
    }

    return `${type}:${shortcode}`;
  } catch {
    return "";
  }
}

/**
 * ------------------------------------------------------------
 * PRODUCT IMAGE LIST
 * ------------------------------------------------------------
 */

function getProductImageUrls(
  product
) {
  if (!product) {
    return [];
  }

  const images =
    Array.isArray(
      product.images
    )
      ? product.images
      : [];

  return [
    ...images,
    product.image,
  ].filter(
    (
      value,
      index,
      array
    ) =>
      Boolean(value) &&
      array.indexOf(
        value
      ) === index
  );
}

function getPrimaryProductImage(
  product,
  fallback = ""
) {
  return (
    product?.images?.[0] ||
    product?.image ||
    fallback ||
    ""
  );
}

function buildProductResult(
  product,
  matchedImage = ""
) {
  return {
    _id:
      product._id,

    name:
      product.name,

    price:
      product.price,

    discountPrice:
      product.discountPrice,

    category:
      product.category,

    image:
      getPrimaryProductImage(
        product,
        matchedImage
      ),

    images:
      Array.isArray(
        product.images
      )
        ? product.images
        : [],
  };
}

/**
 * ============================================================
 * CATALOGUE IMAGE RESOLUTION
 * ============================================================
 *
 * IMPORTANT FIX:
 *
 * Old problem:
 *
 * /products/necklace-1.png
 *          ↓
 * https://mahalaksmi-api.onrender.com/products/necklace-1.png
 *          ↓
 * 404
 *
 * Correct:
 *
 * /products/necklace-1.png
 *          ↓
 * https://the-girl-ho-she.vercel.app/products/necklace-1.png
 *
 * Cloudinary URLs remain untouched.
 * ============================================================
 */

const imageBufferCache = new Map();

async function fetchRemoteBuffer(url, timeoutMs = 15000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        maxContentLength: 12 * 1024 * 1024,
        maxBodyLength: 12 * 1024 * 1024,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return Buffer.from(response.data);
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

async function resolveCatalogueImage(imageUrl) {
  const value = cleanString(imageUrl);

  if (!value) {
    return null;
  }

  if (imageBufferCache.has(value)) {
    return imageBufferCache.get(value);
  }

  try {
    const filename = getFilename(value);

    /**
     * --------------------------------------------------------
     * 1. LOCAL FILE CHECK FIRST
     * --------------------------------------------------------
     */
    if (filename) {
      const localPaths = [
        path.resolve(process.cwd(), "public/products", filename),
        path.resolve(process.cwd(), "../mahalaksmi/public/products", filename),
        path.resolve(process.cwd(), "..", "mahalaksmi", "public/products", filename),
        path.resolve(process.cwd(), "public", filename),
        path.resolve(process.cwd(), "../mahalaksmi/public", filename),
        path.resolve(process.cwd(), "..", "mahalaksmi", "public", filename),
        path.resolve(process.cwd(), ".image_cache", filename),
      ];

      for (const localPath of localPaths) {
        if (fs.existsSync(localPath)) {
          imageBufferCache.set(value, localPath);
          return localPath;
        }
      }
    }

    /**
     * --------------------------------------------------------
     * 2. ABSOLUTE REMOTE URL
     * --------------------------------------------------------
     */
    if (isRemoteUrl(value)) {
      const parsed = new URL(value);
      const backendHost = parsed.hostname.toLowerCase();
      const backendHosts = [
        "mahalaksmi-api.onrender.com",
        "localhost",
        "127.0.0.1",
      ];
      const isBackendHost = backendHosts.includes(backendHost);
      const pathname = parsed.pathname || "";
      const isCustomerPublicAsset =
        pathname.startsWith("/products/") ||
        pathname.startsWith("/assets/") ||
        pathname.startsWith("/images/");

      const targetUrl = (isBackendHost && isCustomerPublicAsset)
        ? `${CUSTOMER_SITE_URL}${pathname}${parsed.search || ""}`
        : value;

      try {
        const buffer = await fetchRemoteBuffer(targetUrl);
        if (filename) {
          try {
            const cacheDir = path.resolve(process.cwd(), ".image_cache");
            if (!fs.existsSync(cacheDir)) {
              fs.mkdirSync(cacheDir, { recursive: true });
            }
            fs.writeFileSync(path.resolve(cacheDir, filename), buffer);
          } catch {}
        }
        imageBufferCache.set(value, buffer);
        return buffer;
      } catch (httpError) {
        if (targetUrl !== value) {
          const origBuffer = await fetchRemoteBuffer(value);
          if (filename) {
            try {
              const cacheDir = path.resolve(process.cwd(), ".image_cache");
              if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
              }
              fs.writeFileSync(path.resolve(cacheDir, filename), origBuffer);
            } catch {}
          }
          imageBufferCache.set(value, origBuffer);
          return origBuffer;
        }
        throw httpError;
      }
    }

    /**
     * --------------------------------------------------------
     * 3. RELATIVE CUSTOMER WEBSITE PATH
     * --------------------------------------------------------
     */
    const customerUrl = `${CUSTOMER_SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
    const buffer = await fetchRemoteBuffer(customerUrl);
    imageBufferCache.set(value, buffer);
    return buffer;
  } catch (error) {
    console.warn("Visual search could not resolve catalogue image:", {
      imageUrl: value,
      error: error.message,
    });
    return null;
  }
}

/**
 * ============================================================
 * CATALOGUE FINGERPRINT CACHE
 * ============================================================
 */

async function getCatalogueFingerprints(
  imageUrl
) {
  const key =
    cleanString(imageUrl);

  if (!key) {
    return null;
  }

  if (
    catalogueCache.has(
      key
    )
  ) {
    return catalogueCache.get(
      key
    );
  }

  try {
    const imageInput =
      await resolveCatalogueImage(
        key
      );

    if (!imageInput) {
      return null;
    }

    const fingerprints =
      await createCatalogueFingerprints(
        imageInput
      );

    if (
      !fingerprints ||
      fingerprints.length ===
        0
    ) {
      return null;
    }

    catalogueCache.set(
      key,
      fingerprints
    );

    return fingerprints;
  } catch (error) {
    console.warn(
      "Catalogue fingerprint error:",
      {
        imageUrl:
          key,

        error:
          error.message,
      }
    );

    return null;
  }
}

/**
 * ============================================================
 * CONCURRENCY
 * ============================================================
 */

async function mapWithConcurrency(
  items,
  concurrency,
  worker
) {
  const results =
    new Array(
      items.length
    );

  let cursor = 0;

  async function runner() {
    while (true) {
      const index =
        cursor++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      try {
        results[index] =
          await worker(
            items[index],
            index
          );
      } catch {
        results[index] =
          null;
      }
    }
  }

  const workers =
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            items.length
          ),
      },
      () => runner()
    );

  await Promise.all(
    workers
  );

  return results;
}

/**
 * ============================================================
 * DEDUPLICATE
 * ============================================================
 */

function deduplicateProducts(
  items
) {
  const result = [];

  const seen =
    new Set();

  for (
    const item of items
  ) {
    const id =
      String(
        item.product._id
      );

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    result.push(
      item
    );
  }

  return result;
}

/**
 * ============================================================
 * INSTAGRAM URL SEARCH
 * ============================================================
 *
 * PRESERVED.
 * ============================================================
 */

export const searchProductByUrl =
  async (
    req,
    res
  ) => {
    try {
      const { url } =
        req.body;

      if (
        !url ||
        typeof url !==
          "string"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            matchType:
              "none",

            message:
              "Please provide a valid Instagram product URL.",

            exactMatch:
              null,

            matches: [],
          });
      }

      const normalizedInput =
        normalizeInstagramUrl(
          url
        );

      if (
        !normalizedInput
      ) {
        return res
          .status(400)
          .json({
            success: false,

            matchType:
              "none",

            message:
              "Please provide a valid Instagram product URL.",

            exactMatch:
              null,

            matches: [],
          });
      }

      const products =
        await Product.find({
          instagramLink: {
            $exists: true,

            $nin: [
              "",
              null,
            ],
          },
        }).lean();

      const exactProduct =
        products.find(
          (product) =>
            normalizeInstagramUrl(
              product.instagramLink
            ) ===
            normalizedInput
        );

      if (
        !exactProduct
      ) {
        return res
          .status(200)
          .json({
            success: true,

            matchType:
              "none",

            message:
              "Sorry, we can't find this product in our store.",

            exactMatch:
              null,

            matches: [],
          });
      }

      const result =
        buildProductResult(
          exactProduct
        );

      return res
        .status(200)
        .json({
          success: true,

          matchType:
            "exact",

          message:
            "Product found!",

          exactMatch:
            result,

          matches: [
            result,
          ],

          redirectUrl:
            `/shop/${exactProduct._id}`,
        });
    } catch (error) {
      console.error(
        "Instagram URL Search Error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          matchType:
            "none",

          message:
            "Unable to process Instagram link search. Please try again.",

          exactMatch:
            null,

          matches: [],
        });
    }
  };

/**
 * ============================================================
 * PHASE D.4: CONTROLLED HIGH-CONFIDENCE PRODUCTION FALLBACK
 * ============================================================
 * Runs runHybridFallback ONLY when hash search returns "none".
 * Evaluates shouldPromoteHybridFallback(result).
 * If promoted (HIGH_CONFIDENCE, score >= 0.880, margin >= 0.050, DIRECT_CLEAN):
 *   Returns exact-match response conforming strictly to FindProductButton.tsx:
 *   {
 *     success: true,
 *     matchType: "exact",
 *     message: "Exact product found!",
 *     exactMatch: <existing Product-compatible object>,
 *     matches: [],
 *     redirectUrl: `/shop/${exactProduct._id}`
 *   }
 * Otherwise (or on ANY error/malformed data/timeout):
 *   Returns standard hash "none" response:
 *   {
 *     success: true,
 *     matchType: "none",
 *     message: "This product is not available in our store.",
 *     exactMatch: null,
 *     matches: []
 *   }
 */
async function handleFallbackOrSendNone(res, tempFilePath, req, requestId) {
  let queryBuffer = null;
  try {
    queryBuffer = req.file?.buffer;
    if (!queryBuffer && tempFilePath && fs.existsSync(tempFilePath)) {
      queryBuffer = fs.readFileSync(tempFilePath);
    }

    if (queryBuffer && queryBuffer.length > 0) {
      const startTime = Date.now();
      let fallbackRes = null;
      try {
        fallbackRes = await runHybridFallback(queryBuffer, { requestId });
      } catch (fbErr) {
        console.warn(`[ImageSearch][${requestId}] Fallback execution caught error:`, fbErr.message);
        fallbackRes = null;
      }

      const processingTimeMs = Date.now() - startTime;
      const canPromote = shouldPromoteHybridFallback(fallbackRes);

      const safeTelemetry = {
        requestId,
        timestamp: new Date().toISOString(),
        hashMatchType: "none",
        hybridConfidenceLevel: fallbackRes?.confidence?.level || "UNKNOWN",
        hybridScore: fallbackRes?.confidence?.score || 0,
        hybridMargin: fallbackRes?.confidence?.margin || 0,
        canPromote,
        processingTimeMs,
      };
      console.log(`[ShadowTelemetry][${requestId}]`, JSON.stringify(safeTelemetry));

      if (canPromote && fallbackRes && fallbackRes.exactCandidate) {
        let productDoc = fallbackRes.exactCandidate.product;
        if (!productDoc || !productDoc._id) {
          try {
            productDoc = await Product.findById(fallbackRes.exactCandidate._id)
              .select("name category price discountPrice images image")
              .lean();
          } catch (fetchErr) {
            console.warn(`[ImageSearch][${requestId}] Failed to fetch promoted product from DB:`, fetchErr.message);
            productDoc = null;
          }
        }

        if (productDoc && productDoc._id) {
          const exactProduct = buildProductResult(productDoc);
          console.log(`[ImageSearch][${requestId}] PROMOTED High-Confidence Fallback: productId=${exactProduct._id}, name=${exactProduct.name}`);

          queryBuffer = null;

          return res.status(200).json({
            success: true,
            matchType: "exact",
            message: "Exact product found!",
            exactMatch: exactProduct,
            matches: [],
            redirectUrl: `/shop/${exactProduct._id}`,
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[ImageSearch][${requestId}] Fallback execution error:`, err.message);
  } finally {
    queryBuffer = null;
  }

  return res.status(200).json({
    success: true,
    matchType: "none",
    message: "This product is not available in our store.",
    exactMatch: null,
    matches: [],
  });
}

const sendNoneWithShadow = handleFallbackOrSendNone;

/**
 * ============================================================
 * SCREENSHOT SEARCH
 * ============================================================
 */

export const findProductByImage =
  async (
    req,
    res
  ) => {
  const requestId = crypto.randomUUID();
  console.log(`[ImageSearch] Start request ${requestId} from ${req.headers.origin || 'unknown'}`);

    let tempFilePath =
      null;

    try {
      /**
       * ------------------------------------------------------
       * 1. UPLOAD VALIDATION
       * ------------------------------------------------------
       */

      if (!req.file) {
  console.log(`[ImageSearch][${requestId}] No file uploaded, returning 400`);
  return res
    .status(400)
    .json({
      success: false,

      matchType:
        "none",

      message:
        "Please upload a valid jewellery image or product screenshot.",

      exactMatch:
        null,

      matches: [],
    });
}

      tempFilePath =
        req.file.path;

      if (
        !tempFilePath ||
        !fs.existsSync(
          tempFilePath
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            matchType:
              "none",

            message:
              "Please upload a valid jewellery image or product screenshot.",

            exactMatch:
              null,

            matches: [],
          });
      }

      /**
       * ------------------------------------------------------
       * 2. SCREENSHOT ANALYSIS
       * ------------------------------------------------------
       *
       * IMPORTANT:
       *
       * There is NO old "plain image" rejection here.
       *
       * A valid product screenshot must always reach
       * the catalogue matcher.
       * ------------------------------------------------------
       */

      // ---------- Diagnostic logging for screenshot fingerprint generation ----------

    const filePath = tempFilePath;
    const exists = fs.existsSync(filePath);
    const size = exists ? fs.statSync(filePath).size : null;
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = '';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    console.log(`[ImageSearch][${requestId}] File diagnostics: path=${filePath}, exists=${exists}, size=${size}, mime=${mimeType}, ext=${ext}`);
    // Capture Sharp metadata (width, height, format)
    try {
      const meta = await sharp(filePath).metadata();
      console.log(`[ImageSearch][${requestId}] Sharp metadata: width=${meta.width}, height=${meta.height}, format=${meta.format}`);
    } catch (metaErr) {
      console.log(`[ImageSearch][${requestId}] Sharp metadata error: ${metaErr.message}`);
    }

    // Generate screenshot fingerprints with requestId for deeper logs
      const screenshotFingerprints = await createScreenshotFingerprints(tempFilePath);


      if (
        !screenshotFingerprints ||
        screenshotFingerprints.length ===
          0
      ) {
        console.log(`[ImageSearch][${requestId}] No fingerprints, returning none, filename=${req.file?.originalname || 'unknown'}`);
        return await sendNoneWithShadow(res, tempFilePath, req, requestId);
      }

      /**
       * ------------------------------------------------------
       * 3. REAL MONGODB PRODUCTS
       * ------------------------------------------------------
       */

      const products =
        await Product.find()
          .lean();

      if (
        !products ||
        products.length ===
          0
      ) {
        return res
          .status(200)
          .json({
            success: true,

            matchType:
              "none",

            message:
              "This product is not available in our store.",

            exactMatch:
              null,

            matches: [],
          });
      }

      /**
       * ------------------------------------------------------
       * 4. CREATE IMAGE JOBS
       * ------------------------------------------------------
       */

      const jobs = [];

      for (
        const product of products
      ) {
        const imageUrls =
          getProductImageUrls(
            product
          );

        for (
          const imageUrl of imageUrls
        ) {
          jobs.push({
            product,
            imageUrl,
          });
        }
      }

      if (
        jobs.length ===
        0
      ) {
        return res
          .status(200)
          .json({
            success: true,

            matchType:
              "none",

            message:
              "This product is not available in our store.",

            exactMatch:
              null,

            matches: [],
          });
      }

      /**
       * ------------------------------------------------------
       * 5. COMPARE AGAINST REAL CATALOGUE
       * ------------------------------------------------------
       *
       * Five concurrent image operations keep the Render
       * backend from being overwhelmed.
       * ------------------------------------------------------
       */

      const comparisons =
        await mapWithConcurrency(
          jobs,
          5,
          async ({
            product,
            imageUrl,
          }) => {
            const catalogueFingerprints =
              await getCatalogueFingerprints(
                imageUrl
              );

            if (
              !catalogueFingerprints
            ) {
              return null;
            }

            const comparison =
              compareScreenshotToCatalogue(
                screenshotFingerprints,
                catalogueFingerprints
              );

            if (
              !comparison
            ) {
              return null;
            }

            return {
              product,

              matchedImageUrl:
                imageUrl,

              comparison,
            };
          }
        );

      /**
       * ------------------------------------------------------
       * 6. BEST IMAGE PER PRODUCT
       * ------------------------------------------------------
       */

      const bestByProduct =
        new Map();

      for (
        const item of comparisons
      ) {
        if (!item) {
          continue;
        }

        const productId =
          String(
            item.product._id
          );

        const existing =
          bestByProduct.get(
            productId
          );

        if (
          !existing ||
          item.comparison
            .similarity >
            existing
              .comparison
              .similarity
        ) {
          bestByProduct.set(
            productId,
            item
          );
        }
      }

      let scored =
        Array.from(
          bestByProduct.values()
        );

      if (
        scored.length ===
        0
      ) {
        return await sendNoneWithShadow(res, tempFilePath, req, requestId);
      }

      /**
       * ------------------------------------------------------
       * 7. SORT BY ACTUAL VISUAL SCORE
       * ------------------------------------------------------
       */

      scored.sort(
        (a, b) =>
          b.comparison
            .similarity -
          a.comparison
            .similarity
      );

      scored =
        deduplicateProducts(
          scored
        );

      const best =
        scored[0];

      const second =
        scored[1] ||
        null;

      const bestSimilarity =
        Number(
          best.comparison
            .similarity
        );

      const secondSimilarity =
        second
          ? Number(
              second
                .comparison
                .similarity
            )
          : 0;

      const margin =
        bestSimilarity -
        secondSimilarity;

      /**
       * ------------------------------------------------------
       * 8. EXACT MATCH
       * ------------------------------------------------------
       *
       * Require strong:
       *
       * - grayscale structure
       * - edge structure
       * - overall similarity
       *
       * This prevents a generic jewellery/random screenshot
       * from being called exact.
       * ------------------------------------------------------
       */

      const strongStructure =
        best.comparison
          .grayscaleSimilarity >=
        0.83;

      const strongEdges =
        best.comparison
          .edgeSimilarity >=
        0.48;

      const normalExact =
        bestSimilarity >=
          EXACT_SIMILARITY &&
        strongStructure &&
        strongEdges &&
        margin >=
          EXACT_MARGIN;

      const veryStrongExact =
        bestSimilarity >=
          VERY_STRONG_EXACT &&
        best.comparison
          .grayscaleSimilarity >=
        0.88;
      if (
        normalExact ||
        veryStrongExact
      ) {
        const exactProduct =
          buildProductResult(
            best.product,
            best.matchedImageUrl
          );

        console.log(`[ImageSearch][${requestId}] Exact match found: productId=${best.product._id}, score=${bestSimilarity.toFixed(3)}`);
        return res
          .status(200)
          .json({
            success: true,

            matchType:
              "exact",

            message:
              "Exact product found!",

            exactMatch:
              exactProduct,

            matches: [
              exactProduct,
            ],

            redirectUrl:
              `/shop/${best.product._id}`,
          });
      }

      /**
       * ------------------------------------------------------
       * 9. SIMILAR PRODUCTS
       * ------------------------------------------------------
       *
       * NEVER:
       *
       * - first six DB products
       * - all category products
       * - random products
       *
       * ONLY actual visual candidates.
       * ------------------------------------------------------
       */

      const similar =
        scored
          .filter(
            (item) => {
              const similarity =
                Number(
                  item.comparison
                    .similarity
                );

              const structure =
                Number(
                  item.comparison
                    .grayscaleSimilarity
                );

              const edges =
                Number(
                  item.comparison
                    .edgeSimilarity
                );

              return (
                similarity >=
                  SIMILAR_SIMILARITY &&
                structure >=
                  0.76 &&
                edges >=
                  0.56
              );
            }
          )
          .slice(
            0,
            6
          );

      if (
        similar.length >
        0
      ) {
        const results =
          similar.map(
            (item) =>
              buildProductResult(
                item.product,
                item.matchedImageUrl
              )
          );

        console.log(`[ImageSearch][${requestId}] Category match, topScore=${bestSimilarity.toFixed(3)}, productId=${best.product._id}, filename=${req.file?.originalname || 'unknown'}`);
        return res
          .status(200)
          .json({
            success: true,

            /**
             * "category" retained because the existing
             * customer frontend already uses this state
             * for the similar-results UI.
             *
             * These are NOT category-selected products.
             */
            matchType:
              "category",

            category:
              best.product
                ?.category ||
              "",

            message:
              "We couldn't confirm the exact product, but these visually similar products may be related:",

            exactMatch:
              null,

            matches:
              results,
          });
      }

      /**
       * ------------------------------------------------------
       * 10. NO MATCH
       * ------------------------------------------------------
       */

      console.log(`[ImageSearch][${requestId}] No match found, topScore=${typeof bestSimilarity !== 'undefined' ? bestSimilarity.toFixed(3) : 'N/A'}, filename=${req.file?.originalname || 'unknown'}`);
        return await sendNoneWithShadow(res, tempFilePath, req, requestId);
    } catch (error) {
      console.error(
        "Visual Product Search Error:",
        error
      );

      console.log(`[ImageSearch][${requestId}] Error processing request: ${error.message || error}`);
        return res
        .status(500)
        .json({
          success: false,

          matchType:
            "none",

          message:
            "Unable to search this image right now. Please try again.",

          exactMatch:
            null,

          matches: [],
        });
    } finally {
      /**
       * ------------------------------------------------------
       * DELETE TEMP UPLOAD
       * ------------------------------------------------------
       */

      if (
        tempFilePath &&
        fs.existsSync(
          tempFilePath
        )
      ) {
        try {
          fs.unlinkSync(
            tempFilePath
          );
        } catch (
          cleanupError
        ) {
          console.warn(
            "Unable to delete visual-search temp file:",
            cleanupError.message
          );
        }
      }
    }
  };