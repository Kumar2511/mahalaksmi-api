import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const DEFAULT_USERNAME = "the_girl_ho_se";

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
    .replace(
      /\.(jpg|jpeg|png|webp|mp4|mov|m4v)$/i,
      ""
    )
    .trim();
}

export function analyzeInstagramZip(
  zipPath,
  targetUsername = DEFAULT_USERNAME
) {
  if (!zipPath) {
    throw new Error("ZIP file path is required");
  }

  if (!fs.existsSync(zipPath)) {
    throw new Error(
      `ZIP file not found: ${zipPath}`
    );
  }

  const zip = new AdmZip(zipPath);

  const entries = zip
    .getEntries()
    .filter(
      (entry) => !entry.isDirectory
    );

  const groups = new Map();

  let images = 0;
  let videos = 0;
  let ignored = 0;

  for (const entry of entries) {
    const fullName = entry.entryName;

    const filename =
      path.basename(fullName);

    const mediaType =
      getMediaType(filename);

    // --------------------------------------
    // Unsupported file
    // --------------------------------------

    if (!mediaType) {
      ignored++;
      continue;
    }

    // --------------------------------------
    // Target username filter
    // --------------------------------------

    if (
      !fullName
        .toLowerCase()
        .includes(
          targetUsername.toLowerCase()
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

    // --------------------------------------
    // Normalize filename
    // --------------------------------------

    const normalized =
      normalizeFilename(filename);

    const parts =
      normalized.split("_");

    // --------------------------------------
    // Find Instagram media ID
    // --------------------------------------

    let mediaId = "";

    for (
      let i = parts.length - 1;
      i >= 0;
      i--
    ) {
      if (
        /^\d{10,}$/.test(
          parts[i]
        )
      ) {
        mediaId = parts[i];
        break;
      }
    }

    // --------------------------------------
    // Group key
    // --------------------------------------

    const groupKey =
      mediaId || normalized;

    // --------------------------------------
    // Create group
    // --------------------------------------

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupId: groupKey,

        username:
          targetUsername,

        mediaId,

        images: [],

        videos: [],

        files: [],
      });
    }

    const group =
      groups.get(groupKey);

    // --------------------------------------
    // Preserve EXACT ZIP entry path
    // --------------------------------------

    const media = {
      path: fullName,

      filename,

      type: mediaType,

      // Important:
      // This is the exact path inside
      // the ZIP. We use it later to locate
      // the extracted file.
      zipPath: fullName,
    };

    group.files.push(
      media
    );

    if (mediaType === "image") {
      group.images.push(
        fullName
      );
    }

    if (mediaType === "video") {
      group.videos.push(
        fullName
      );
    }
  }

  // --------------------------------------
  // Sort groups
  // --------------------------------------

  const productGroups =
    Array.from(
      groups.values()
    ).sort(
      (a, b) =>
        b.files.length -
        a.files.length
    );

  // --------------------------------------
  // Result
  // --------------------------------------

  return {
    summary: {
      zip:
        path.basename(zipPath),

      targetUsername,

      totalFiles:
        entries.length,

      images,

      videos,

      ignored,

      groups:
        productGroups.length,

      analyzedAt:
        new Date().toISOString(),
    },

    groups:
      productGroups,
  };
}