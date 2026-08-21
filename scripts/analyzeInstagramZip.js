import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

// ==========================================
// CONFIG
// ==========================================

const ZIP_PATH = path.resolve(
  process.cwd(),
  "instagram-download.zip"
);

const TARGET_USERNAME = "the_girl_ho_se";

const OUTPUT_FILE = path.resolve(
  process.cwd(),
  "instagram-analysis.json"
);

// ==========================================
// HELPERS
// ==========================================

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".m4v",
];

function getMediaType(filename) {
  const extension = path
    .extname(filename)
    .toLowerCase();

  if (IMAGE_EXTENSIONS.includes(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.includes(extension)) {
    return "video";
  }

  return null;
}

function normalizeFilename(filename) {
  return filename
    .replace(/\.(jpg|jpeg|png|webp|mp4|mov|m4v)$/i, "")
    .trim();
}

// ==========================================
// ANALYZE ZIP
// ==========================================

function analyzeZip() {
  console.log("");
  console.log("==========================================");
  console.log(" Instagram ZIP Analyzer");
  console.log("==========================================");
  console.log("");

  if (!fs.existsSync(ZIP_PATH)) {
    console.error("❌ ZIP file not found:");
    console.error(ZIP_PATH);
    console.error("");
    console.error(
      "Put the ZIP file in the project root and name it:"
    );
    console.error("instagram-download.zip");
    process.exit(1);
  }

  console.log("📦 ZIP:");
  console.log(ZIP_PATH);
  console.log("");

  const zip = new AdmZip(ZIP_PATH);

  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory);

  console.log(
    `📁 Total files: ${entries.length}`
  );

  const groups = new Map();

  let images = 0;
  let videos = 0;
  let ignored = 0;

  // ==========================================
  // PROCESS FILES
  // ==========================================

  for (const entry of entries) {
    const fullName = entry.entryName;

    const filename = path.basename(fullName);

    const mediaType =
      getMediaType(filename);

    if (!mediaType) {
      ignored++;
      continue;
    }

    // ----------------------------------------
    // TARGET USERNAME FILTER
    // ----------------------------------------

    if (
      !fullName
        .toLowerCase()
        .includes(
          TARGET_USERNAME.toLowerCase()
        )
    ) {
      ignored++;
      continue;
    }

    if (mediaType === "image") {
      images++;
    }

    if (mediaType === "video") {
      videos++;
    }

    // ----------------------------------------
    // Remove extension
    // ----------------------------------------

    const normalized =
      normalizeFilename(filename);

    // ----------------------------------------
    // Try to find Instagram media ID
    //
    // Typical filename may contain:
    //
    // username_date_shortcode_mediaId
    // ----------------------------------------

    const parts =
      normalized.split("_");

    let mediaId = "";

    // Search from the end for a long numeric ID
    for (
      let i = parts.length - 1;
      i >= 0;
      i--
    ) {
      if (
        /^\d{10,}$/.test(parts[i])
      ) {
        mediaId = parts[i];
        break;
      }
    }

    // ----------------------------------------
    // FALLBACK GROUP KEY
    // ----------------------------------------

    const groupKey =
      mediaId ||
      normalized;

    // ----------------------------------------
    // Create group
    // ----------------------------------------

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupId: groupKey,

        username:
          TARGET_USERNAME,

        mediaId,

        images: [],

        videos: [],

        files: [],
      });
    }

    const group =
      groups.get(groupKey);

    group.files.push({
      path: fullName,
      filename,
      type: mediaType,
    });

    if (mediaType === "image") {
      group.images.push(fullName);
    }

    if (mediaType === "video") {
      group.videos.push(fullName);
    }
  }

  // ==========================================
  // SORT GROUPS
  // ==========================================

  const productGroups =
    Array.from(groups.values()).sort(
      (a, b) =>
        b.files.length -
        a.files.length
    );

  // ==========================================
  // SUMMARY
  // ==========================================

  const summary = {
    zip: ZIP_PATH,

    targetUsername:
      TARGET_USERNAME,

    totalFiles:
      entries.length,

    images,

    videos,

    ignored,

    groups:
      productGroups.length,

    analyzedAt:
      new Date().toISOString(),
  };

  // ==========================================
  // FINAL RESULT
  // ==========================================

  const result = {
    summary,

    groups:
      productGroups,
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      result,
      null,
      2
    ),
    "utf8"
  );

  // ==========================================
  // CONSOLE REPORT
  // ==========================================

  console.log("");
  console.log(
    "=========================================="
  );

  console.log(
    " Analysis Complete"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  console.log(
    `🖼️ Images: ${images}`
  );

  console.log(
    `🎥 Videos: ${videos}`
  );

  console.log(
    `🚫 Ignored: ${ignored}`
  );

  console.log(
    `📦 Groups: ${productGroups.length}`
  );

  console.log("");

  // ==========================================
  // GROUP PREVIEW
  // ==========================================

  productGroups.forEach(
    (group, index) => {

      console.log(
        `#${String(index + 1).padStart(
          3,
          "0"
        )} | ${group.files.length} media | ` +
        `${group.images.length} images | ` +
        `${group.videos.length} videos | ` +
        `ID: ${
          group.mediaId || "unknown"
        }`
      );
    }
  );

  console.log("");

  console.log(
    `💾 Report saved to:`
  );

  console.log(
    OUTPUT_FILE
  );

  console.log("");
}

// ==========================================
// RUN
// ==========================================

try {
  analyzeZip();
} catch (error) {
  console.error("");
  console.error(
    "❌ Analyzer failed:"
  );
  console.error(error);
  process.exit(1);
}