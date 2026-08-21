import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// ==========================================
// LOAD ENVIRONMENT FIRST
// ==========================================

const PROJECT_ROOT = process.cwd();

dotenv.config({
  path: path.join(
    PROJECT_ROOT,
    ".env"
  ),
});

// ==========================================
// IMPORT GEMINI SERVICE AFTER ENV IS LOADED
// ==========================================

const {
  identifyInstagramProduct,
} = await import(
  "../../services/instagramProductIdentifier.js"
);

// ==========================================
// CONFIG
// ==========================================

const OUTPUT_FILE = path.join(
  PROJECT_ROOT,
  "data",
  "instagram-ai-preview.json"
);

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

const CATEGORIES = [
  "Necklaces",
  "Jewellery-Sets",
  "Chains",
  "Bracelets",
  "Earrings",
  "Rings",
  "Pendants",
  "Accessories",
];

// ==========================================
// VERIFY GEMINI KEY
// ==========================================

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    `GEMINI_API_KEY was not loaded.

Expected:
${path.join(
  PROJECT_ROOT,
  ".env"
)}`
  );
}

console.log(
  "✅ GEMINI_API_KEY loaded"
);

// ==========================================
// HELPERS
// ==========================================

function isImage(filePath) {
  return IMAGE_EXTENSIONS.includes(
    path.extname(filePath).toLowerCase()
  );
}

function getAllFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = [];

  for (
    const entry of fs.readdirSync(
      directory,
      {
        withFileTypes: true,
      }
    )
  ) {
    const fullPath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(
        ...getAllFiles(fullPath)
      );
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function getGroupDirectories(category) {
  const categoryPath = path.join(
    PROJECT_ROOT,
    category
  );

  if (!fs.existsSync(categoryPath)) {
    return [];
  }

  return fs
    .readdirSync(
      categoryPath,
      {
        withFileTypes: true,
      }
    )
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith("group_")
    )
    .map(
      (entry) =>
        path.join(
          categoryPath,
          entry.name
        )
    );
}

// ==========================================
// LOAD IMAGE GROUPS
// ==========================================

function loadImageGroups() {
  const groups = [];

  for (const category of CATEGORIES) {
    const directories =
      getGroupDirectories(category);

    for (const groupPath of directories) {
      const allFiles =
        getAllFiles(groupPath);

      const images = allFiles
        .filter(isImage)
        .slice(0, 5);

      const allMediaFiles =
        allFiles.length;

      const videoCount =
        allMediaFiles -
        images.length;

      const groupName =
        path.basename(groupPath);

      const mediaId =
        groupName.replace(
          /^group_/,
          ""
        );

      // ====================================
      // SKIP VIDEO-ONLY GROUP
      // ====================================

      if (images.length === 0) {
        console.log(
          `⏭️ SKIP VIDEO-ONLY | ${category} | ${mediaId}`
        );

        continue;
      }

      groups.push({
        category,
        mediaId,
        groupName,
        groupPath,
        images,
        videoCount,
      });
    }
  }

  return groups;
}

// ==========================================
// LOAD EXISTING PREVIEW
// ==========================================

function loadExistingPreview() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {
      generatedAt: null,
      mode: "IMAGE_ONLY",
      totalGroups: 0,
      totalImages: 0,
      successful: 0,
      failed: 0,
      videosImported: 0,
      results: [],
    };
  }

  try {
    const raw =
      fs.readFileSync(
        OUTPUT_FILE,
        "utf8"
      );

    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(
        parsed.results
      )
    ) {
      throw new Error(
        "Preview JSON does not contain a valid results array."
      );
    }

    return parsed;
  } catch (error) {
    console.warn("");
    console.warn(
      "⚠️ Existing preview could not be loaded."
    );
    console.warn(
      error.message
    );
    console.warn(
      "Starting with an empty preview."
    );
    console.warn("");

    return {
      generatedAt: null,
      mode: "IMAGE_ONLY",
      totalGroups: 0,
      totalImages: 0,
      successful: 0,
      failed: 0,
      videosImported: 0,
      results: [],
    };
  }
}

// ==========================================
// SAVE CHECKPOINT
// ==========================================

function savePreview(
  groups,
  results
) {
  const successful =
    results.filter(
      (item) =>
        item.success === true
    ).length;

  const failed =
    results.filter(
      (item) =>
        item.success === false
    ).length;

  const totalImages =
    groups.reduce(
      (total, group) =>
        total +
        group.images.length,
      0
    );

  const output = {
    generatedAt:
      new Date().toISOString(),

    mode:
      "IMAGE_ONLY",

    totalGroups:
      groups.length,

    totalImages,

    successful,

    failed,

    videosImported: 0,

    results,
  };

  fs.mkdirSync(
    path.dirname(
      OUTPUT_FILE
    ),
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ),
    "utf8"
  );
}

// ==========================================
// DETECT 429 QUOTA ERROR
// ==========================================

function isQuotaError(error) {
  const status =
    error?.status;

  const message =
    String(
      error?.message ||
        error ||
        ""
    ).toLowerCase();

  return (
    status === 429 ||
    message.includes(
      "resource_exhausted"
    ) ||
    message.includes(
      "quota exceeded"
    ) ||
    message.includes(
      "generativelanguage.googleapis.com/generate_content_free_tier_requests"
    )
  );
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    " Instagram AI Image Preview"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  console.log(
    "MODE: IMAGE ONLY"
  );

  console.log(
    "Videos will NOT be imported."
  );

  console.log("");

  // ========================================
  // LOAD ALL IMAGE GROUPS
  // ========================================

  const groups =
    loadImageGroups();

  console.log("");

  console.log(
    "Image product groups:",
    groups.length
  );

  const totalImages =
    groups.reduce(
      (total, group) =>
        total +
        group.images.length,
      0
    );

  const totalVideoOnlyGroups =
    (() => {
      let count = 0;

      for (
        const category of CATEGORIES
      ) {
        const directories =
          getGroupDirectories(
            category
          );

        for (
          const groupPath of directories
        ) {
          const allFiles =
            getAllFiles(
              groupPath
            );

          const images =
            allFiles.filter(
              isImage
            );

          if (
            images.length === 0
          ) {
            count++;
          }
        }
      }

      return count;
    })();

  console.log(
    "Images available:",
    totalImages
  );

  console.log(
    "Video-only groups skipped:",
    totalVideoOnlyGroups
  );

  console.log("");

  // ========================================
  // LOAD EXISTING RESULTS
  // ========================================

  const existing =
    loadExistingPreview();

  const results =
    Array.isArray(
      existing.results
    )
      ? existing.results
      : [];

  // ========================================
  // BUILD SUCCESS MAP
  // ========================================

  const successfulMediaIds =
    new Set(
      results
        .filter(
          (item) =>
            item.success === true
        )
        .map(
          (item) =>
            String(
              item.mediaId
            )
        )
    );

  console.log(
    "Existing successful results:",
    successfulMediaIds.size
  );

  console.log(
    "Remaining groups:",
    groups.filter(
      (group) =>
        !successfulMediaIds.has(
          String(
            group.mediaId
          )
        )
    ).length
  );

  console.log("");

  // ========================================
  // PROCESS GROUPS
  // ========================================

  let quotaStopped = false;

  for (
    let index = 0;
    index < groups.length;
    index++
  ) {
    const group =
      groups[index];

    // ======================================
    // SKIP ALREADY SUCCESSFUL
    // ======================================

    if (
      successfulMediaIds.has(
        String(
          group.mediaId
        )
      )
    ) {
      console.log(
        `⏭️ ALREADY COMPLETE | ${group.category} | ${group.mediaId}`
      );

      continue;
    }

    console.log(
      "------------------------------------------"
    );

    console.log(
      `Group ${
        index + 1
      }/${groups.length}`
    );

    console.log(
      "Category:",
      group.category
    );

    console.log(
      "Media ID:",
      group.mediaId
    );

    console.log(
      "Images:",
      group.images.length
    );

    console.log("");

    try {
      console.log(
        "🤖 Sending images to Gemini..."
      );

      const product =
        await identifyInstagramProduct(
          group.images
        );

      // ====================================
      // REMOVE OLD FAILED RESULT
      // ====================================

      const existingIndex =
        results.findIndex(
          (item) =>
            String(
              item.mediaId
            ) ===
            String(
              group.mediaId
            )
        );

      const successResult = {
        success: true,

        category:
          group.category,

        mediaId:
          group.mediaId,

        groupName:
          group.groupName,

        imageCount:
          group.images.length,

        images:
          group.images.map(
            (filePath) =>
              path.relative(
                PROJECT_ROOT,
                filePath
              )
          ),

        product,

        imported: false,
      };

      if (
        existingIndex >= 0
      ) {
        results[
          existingIndex
        ] = successResult;
      } else {
        results.push(
          successResult
        );
      }

      // ====================================
      // CHECKPOINT
      // ====================================

      savePreview(
        groups,
        results
      );

      successfulMediaIds.add(
        String(
          group.mediaId
        )
      );

      console.log(
        "✅ Gemini identification successful"
      );

      console.log(
        "Name:",
        product.name ||
          "Unnamed product"
      );

      console.log(
        "AI Category:",
        product.category ||
          group.category
      );

      console.log(
        "Confidence:",
        product.confidence ??
          "N/A"
      );

      console.log(
        "💾 Checkpoint saved"
      );
    } catch (error) {
      console.error("");

      console.error(
        "❌ Gemini failed"
      );

      console.error(
        "Status:",
        error?.status ||
          "unknown"
      );

      console.error(
        "Message:",
        error?.message ||
          String(error)
      );

      // ====================================
      // QUOTA EXCEEDED
      // ====================================

      if (
        isQuotaError(error)
      ) {
        console.error("");

        console.error(
          "🛑 GEMINI QUOTA EXCEEDED"
        );

        console.error(
          "Stopping the batch immediately."
        );

        console.error(
          "Existing successful results have been saved."
        );

        quotaStopped = true;

        break;
      }

      // ====================================
      // OTHER FAILURE
      // ====================================

      const failedResult = {
        success: false,

        category:
          group.category,

        mediaId:
          group.mediaId,

        groupName:
          group.groupName,

        imageCount:
          group.images.length,

        images:
          group.images.map(
            (filePath) =>
              path.relative(
                PROJECT_ROOT,
                filePath
              )
          ),

        error:
          error?.message ||
          String(error),

        imported: false,
      };

      const existingIndex =
        results.findIndex(
          (item) =>
            String(
              item.mediaId
            ) ===
            String(
              group.mediaId
            )
        );

      if (
        existingIndex >= 0
      ) {
        results[
          existingIndex
        ] = failedResult;
      } else {
        results.push(
          failedResult
        );
      }

      savePreview(
        groups,
        results
      );

      console.log(
        "💾 Failure checkpoint saved"
      );
    }

    console.log("");
  }

  // ========================================
  // FINAL SUMMARY
  // ========================================

  const successful =
    results.filter(
      (item) =>
        item.success === true
    ).length;

  const failed =
    results.filter(
      (item) =>
        item.success === false
    ).length;

  savePreview(
    groups,
    results
  );

  console.log("");

  console.log(
    "=========================================="
  );

  if (quotaStopped) {
    console.log(
      " AI Preview Paused - Quota Reached"
    );
  } else {
    console.log(
      " AI Preview Complete"
    );
  }

  console.log(
    "=========================================="
  );

  console.log("");

  console.log(
    "Total image groups:",
    groups.length
  );

  console.log(
    "Images available:",
    totalImages
  );

  console.log(
    "Successful:",
    successful
  );

  console.log(
    "Failed:",
    failed
  );

  console.log(
    "Videos imported:",
    0
  );

  console.log("");

  console.log(
    "Preview saved to:"
  );

  console.log(
    OUTPUT_FILE
  );

  console.log("");

  console.log(
    "⚠️ NO MongoDB changes were made."
  );

  console.log(
    "⚠️ NO Cloudinary uploads were made."
  );

  console.log(
    "⚠️ Videos were skipped."
  );

  console.log("");

  if (quotaStopped) {
    console.log(
      "💡 Run this script again after"
    );

    console.log(
      "the Gemini quota becomes available."
    );

    console.log(
      "Already successful groups will be skipped."
    );

    console.log("");
  }
}

// ==========================================
// RUN
// ==========================================

main().catch(
  (error) => {
    console.error("");

    console.error(
      "❌ AI preview process failed"
    );

    console.error(
      error?.message ||
        error
    );

    process.exit(1);
  }
);