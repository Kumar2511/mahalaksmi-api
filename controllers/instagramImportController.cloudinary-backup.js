import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";

import {
  analyzeInstagramZip,
} from "../services/instagramZipAnalyzer.js";

import {
  identifyInstagramProduct,
} from "../services/instagramProductIdentifier.js";

// ==========================================
// INSTAGRAM IMPORT STORAGE
// ==========================================

const INSTAGRAM_IMPORT_ROOT = path.resolve(
  process.cwd(),
  "uploads/instagram-import"
);

if (!fs.existsSync(INSTAGRAM_IMPORT_ROOT)) {
  fs.mkdirSync(INSTAGRAM_IMPORT_ROOT, {
    recursive: true,
  });
}

// ==========================================
// CONFIG
// ==========================================

const MEDIA_ROOT = path.resolve(
  process.cwd(),
  "uploads",
  "instagram-import"
);

// ==========================================
// ANALYZE + EXTRACT INSTAGRAM ZIP
// ==========================================

export const analyzeInstagramZipUpload = async (
  req,
  res
) => {
  let sessionDirectory = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Instagram ZIP file is required",
      });
    }

    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      " Instagram ZIP Upload"
    );
    console.log(
      "=========================================="
    );

    console.log(
      "Uploaded file:",
      req.file.originalname
    );

    console.log(
      "Size:",
      `${(
        req.file.size /
        1024 /
        1024
      ).toFixed(2)} MB`
    );

    // --------------------------------------
    // Create session
    // --------------------------------------

    const sessionId = randomUUID();

    sessionDirectory = path.join(
      INSTAGRAM_IMPORT_ROOT,
      sessionId
    );

    fs.mkdirSync(
      sessionDirectory,
      {
        recursive: true,
      }
    );

    // --------------------------------------
    // Extract ZIP
    // --------------------------------------

    const zip = new AdmZip(
      req.file.path
    );

    zip.extractAllTo(
      sessionDirectory,
      true
    );

    console.log(
      "Extracted Instagram media"
    );

    // --------------------------------------
    // Analyze extracted ZIP
    // --------------------------------------

    const result =
      analyzeInstagramZip(
        req.file.path
      );

    // --------------------------------------
    // Convert media paths to session URLs
    // --------------------------------------

    const groups =
      result.groups.map(
        (group) => ({
          ...group,

          files: group.files.map(
            (media) => {
              const filename =
                path.basename(
                  media.path
                );

              const relativePath =
                path.relative(
                  sessionDirectory,
                  path.join(
                    sessionDirectory,
                    filename
                  )
                );

              return {
                ...media,

                url:
                  `/api/instagram-import/media/${sessionId}/${encodeURIComponent(
                    relativePath.replace(
                      /\\/g,
                      "/"
                    )
                  )}`,
              };
            }
          ),
        })
      );

      // --------------------------------------
// Save analysis for later AI identification
// --------------------------------------

const analysisData = {
  summary: result.summary,
  groups,
};

fs.writeFileSync(
  path.join(
    sessionDirectory,
    "analysis.json"
  ),
  JSON.stringify(
    analysisData,
    null,
    2
  ),
  "utf8"
);

    // --------------------------------------
    // Delete temporary uploaded ZIP
    // --------------------------------------

    try {
      fs.unlinkSync(
        req.file.path
      );
    } catch (cleanupError) {
      console.warn(
        "ZIP cleanup warning:",
        cleanupError.message
      );
    }

    // --------------------------------------
    // Response
    // --------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Instagram ZIP analyzed successfully",

      sessionId,

      summary:
        result.summary,

      groups,
    });
  } catch (error) {
    console.error(
      "Instagram ZIP Analysis Error:",
      error
    );

    if (req.file?.path) {
      try {
        fs.unlinkSync(
          req.file.path
        );
      } catch {}
    }

    if (sessionDirectory) {
      try {
        fs.rmSync(
          sessionDirectory,
          {
            recursive: true,
            force: true,
          }
        );
      } catch {}
    }

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Failed to analyze Instagram ZIP",
    });
  }
};
// ==========================================
// IDENTIFY INSTAGRAM PRODUCT WITH GEMINI
// ==========================================

// ==========================================
// IDENTIFY INSTAGRAM PRODUCT WITH GEMINI
// ==========================================

export const identifyInstagramProductController =
  async (req, res) => {
    try {
      const {
        sessionId,
        groupId,
      } = req.body;

      // --------------------------------------
      // Validate input
      // --------------------------------------

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message:
            "Instagram import session ID is required",
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message:
            "Instagram group ID is required",
        });
      }

      // --------------------------------------
      // Validate IDs
      // --------------------------------------

      if (
        !/^[a-zA-Z0-9-]+$/.test(
          sessionId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid Instagram session ID",
        });
      }

      if (
        !/^[a-zA-Z0-9_-]+$/.test(
          groupId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid Instagram group ID",
        });
      }

      // --------------------------------------
      // Session directory
      // --------------------------------------

      const sessionDirectory =
        path.resolve(
          MEDIA_ROOT,
          sessionId
        );

      if (
        !fs.existsSync(
          sessionDirectory
        )
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Instagram import session not found. Please upload the ZIP again.",
        });
      }

      // --------------------------------------
      // Find session analysis
      //
      // We recreate the analysis using the
      // extracted ZIP is NOT possible because
      // the original ZIP was deleted.
      //
      // Therefore we save group metadata
      // during the upload step.
      // --------------------------------------

      const analysisFile =
        path.join(
          sessionDirectory,
          "analysis.json"
        );

      if (
        !fs.existsSync(
          analysisFile
        )
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Instagram analysis data not found. Please upload the ZIP again.",
        });
      }

      const analysis =
        JSON.parse(
          fs.readFileSync(
            analysisFile,
            "utf8"
          )
        );

      // --------------------------------------
      // Find requested group
      // --------------------------------------

      const group =
        analysis.groups.find(
          (item) =>
            item.groupId ===
            groupId
        );

      if (!group) {
        return res.status(404).json({
          success: false,
          message:
            "Instagram product group not found",
        });
      }

      // --------------------------------------
      // Select ONLY images belonging
      // to this exact group.
      // --------------------------------------

      const selectedImages =
        [];

      for (
        const media of group.files
      ) {
        if (
          media.type !==
          "image"
        ) {
          continue;
        }

        const safeRelativePath =
          media.zipPath
            .replace(
              /^[/\\]+/,
              ""
            )
            .replace(
              /\.\.(\/|\\)/g,
              ""
            );

        const imagePath =
          path.resolve(
            sessionDirectory,
            safeRelativePath
          );

        // Security check:
        // Make sure the resolved file
        // remains inside the session.
        if (
          !imagePath.startsWith(
            sessionDirectory +
              path.sep
          )
        ) {
          continue;
        }

        if (
          fs.existsSync(
            imagePath
          )
        ) {
          selectedImages.push(
            imagePath
          );
        }
      }

      // --------------------------------------
      // Validate images
      // --------------------------------------

      if (
        selectedImages.length ===
        0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "No images found for this Instagram product group.",
        });
      }

      // Gemini service supports up to
      // five images for our first version.
      const imagesForAI =
        selectedImages.slice(
          0,
          5
        );

      console.log("");
      console.log(
        "=========================================="
      );
      console.log(
        " Gemini Instagram Product Identification"
      );
      console.log(
        "=========================================="
      );

      console.log(
        "Session:",
        sessionId
      );

      console.log(
        "Group:",
        groupId
      );

      console.log(
        "Images found:",
        selectedImages.length
      );

      console.log(
        "Images sent to Gemini:",
        imagesForAI.length
      );

      // --------------------------------------
      // Gemini
      // --------------------------------------

      const product =
        await identifyInstagramProduct(
          imagesForAI
        );

        // --------------------------------------
// Save AI result into analysis.json
// --------------------------------------

const groupIndex =
  analysis.groups.findIndex(
    (item) =>
      item.groupId === groupId
  );

if (groupIndex >= 0) {
  analysis.groups[groupIndex] = {
    ...analysis.groups[groupIndex],

    identifiedProduct:
      product,

    identifiedAt:
      new Date().toISOString(),

    identified: true,
  };

  fs.writeFileSync(
    analysisFile,
    JSON.stringify(
      analysis,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    "âœ… AI product result saved to analysis.json"
  );
}

      // --------------------------------------
      // Response
      // --------------------------------------

      return res.status(200).json({
        success: true,

        message:
          "Instagram product identified successfully",

        sessionId,

        groupId,

        media: {
          images:
            group.images,

          videos:
            group.videos,

          total:
            group.files.length,
        },

        product,
      });
    } catch (error) {
      console.error(
        "Instagram Product Identification Error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Failed to identify Instagram product",
      });
    }
  };

  // ==========================================
// IMPORT IDENTIFIED INSTAGRAM PRODUCT
// ==========================================

export const importInstagramProductController =
  async (req, res) => {
    try {

      console.log("ðŸ”¥ IMPORT PRODUCT REQUEST RECEIVED");
      console.log("Body:", req.body);

      const {
        sessionId,
        groupId,
      } = req.body;

      // --------------------------------------
      // Validate
      // --------------------------------------

      if (!sessionId || !groupId) {
        return res.status(400).json({
          success: false,
          message:
            "Session ID and group ID are required.",
        });
      }

      if (
        !/^[a-zA-Z0-9-]+$/.test(
          sessionId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid Instagram session ID.",
        });
      }

      if (
        !/^[a-zA-Z0-9_-]+$/.test(
          groupId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid Instagram group ID.",
        });
      }

      // --------------------------------------
      // Session
      // --------------------------------------

      const sessionDirectory =
        path.resolve(
          MEDIA_ROOT,
          sessionId
        );

      const analysisFile =
        path.join(
          sessionDirectory,
          "analysis.json"
        );

      if (
        !fs.existsSync(
          analysisFile
        )
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Instagram analysis data not found. Please analyze the ZIP again.",
        });
      }

      // --------------------------------------
      // Read analysis
      // --------------------------------------

      const analysis =
        JSON.parse(
          fs.readFileSync(
            analysisFile,
            "utf8"
          )
        );

      const group =
        analysis.groups.find(
          (item) =>
            item.groupId ===
            groupId
        );

      if (!group) {
        return res.status(404).json({
          success: false,
          message:
            "Instagram product group not found.",
        });
      }

      // --------------------------------------
      // Make sure Gemini identification
      // already happened
      // --------------------------------------

      const ai =
        group.identifiedProduct;

      if (!ai) {
        return res.status(400).json({
          success: false,
          message:
            "This product has not been identified by AI yet.",
        });
      }

      if (!ai.name) {
        return res.status(400).json({
          success: false,
          message:
            "AI product name is missing.",
        });
      }

      // --------------------------------------
      // Prevent duplicate import
      // --------------------------------------

      if (group.importedProductId) {
        return res.status(409).json({
          success: false,
          message:
            "This product has already been imported.",
          productId:
            group.importedProductId,
        });
      }

      // --------------------------------------
      // Build image URLs
      // --------------------------------------

      const images = [];

      for (
        const media of group.files || []
      ) {
        if (
          media.type !==
          "image"
        ) {
          continue;
        }

        const safeRelativePath =
          String(
            media.zipPath || ""
          )
            .replace(
              /^[/\\]+/,
              ""
            )
            .replace(
              /\.\.(\/|\\)/g,
              ""
            );

        const imagePath =
          path.resolve(
            sessionDirectory,
            safeRelativePath
          );

        // Security check
        if (
          !imagePath.startsWith(
            sessionDirectory +
              path.sep
          )
        ) {
          continue;
        }

        if (
          !fs.existsSync(
            imagePath
          )
        ) {
          continue;
        }

        const relativePath =
          path
            .relative(
              MEDIA_ROOT,
              imagePath
            )
            .replace(
              /\\/g,
              "/"
            );

        images.push(
          `/uploads/instagram-import/${relativePath}`
        );
      }

      // --------------------------------------
      // Create MongoDB product
      // --------------------------------------

      const Product =
        (await import(
          "../models/Product.js"
        )).default;

      const existingProduct =
        await Product.findOne({
          name: ai.name,
        });

      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message:
            "A product with this name already exists.",
          product:
            existingProduct,
        });
      }

      const productData = {
        name:
          ai.name,
        description:
          ai.description || "",
        category:
          ai.category ||
          group.category ||
          "Jewellery",
        collection:
          ai.collection ||
          "AI Imported",
        price:
          Number.isFinite(
            Number(ai.price)
          )
            ? Number(ai.price)
            : 0,
        discountPrice:
          Number.isFinite(
            Number(ai.discountPrice)
          )
            ? Number(ai.discountPrice)
            : 0,
        images,
        video:
          ai.video || "",
        colors:
          Array.isArray(ai.colors)
            ? ai.colors
            : [],
        sizes:
          Array.isArray(ai.sizes)
            ? ai.sizes
            : [],
        specifications: {
          material:
            ai.material || "",
          jewelleryType:
            ai.jewelleryType || "",
          metalPlating:
            ai.metalPlating || "",
          stone:
            ai.stone || "",
          weight:
            ai.weight || "",
          occasion:
            ai.occasion || "",
          countryOfOrigin:
            ai.countryOfOrigin ||
            "India",
        },
        stock:
          Number.isFinite(
            Number(ai.stock)
          )
            ? Number(ai.stock)
            : 0,
        featured:
          Boolean(ai.featured),
        bestSeller:
          Boolean(ai.bestSeller),
        newArrival:
          ai.newArrival !== undefined
            ? Boolean(ai.newArrival)
            : true,
        trending:
          Boolean(ai.trending),
        instagramLink:
          ai.instagramLink || "",
        reviews: [],
        numReviews: 0,
        averageRating: 0,
      };
      console.log("ðŸš€ ABOUT TO CREATE PRODUCT");
console.log("Product name:", productData.name);
console.log("Product category:", productData.category);
console.log("Image URLs:", productData.images);

const createdProduct =
  await Product.create(
    productData
  );

console.log("âœ… PRODUCT CREATED:", createdProduct._id);

      // --------------------------------------
      // Save import state
      // --------------------------------------

      const groupIndex =
        analysis.groups.findIndex(
          (item) =>
            item.groupId ===
            groupId
        );

      if (
        groupIndex >= 0
      ) {
        analysis.groups[
          groupIndex
        ] = {
          ...analysis.groups[
            groupIndex
          ],

          imported: true,

          importedProductId:
            String(
              createdProduct._id
            ),

          importedAt:
            new Date().toISOString(),
        };
      }

      fs.writeFileSync(
        analysisFile,
        JSON.stringify(
          analysis,
          null,
          2
        ),
        "utf8"
      );

      // --------------------------------------
      // Response
      // --------------------------------------

      return res.status(201).json({
        success: true,

        message:
          "AI product imported successfully.",

        product:
          createdProduct,

        productId:
          createdProduct._id,
      });
    } catch (error) {
      console.error(
        "Instagram Product Import Error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Failed to import Instagram product.",
      });
    }
  };


