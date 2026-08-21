import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

const TARGET_USERNAME = "the_girl_ho_se";

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
  const extension = path.extname(filename).toLowerCase();

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
  targetUsername = TARGET_USERNAME
) {
  if (!zipPath) {
    throw new Error("ZIP file path is required");
  }

  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP file not found: ${zipPath}`);
  }

  const zip = new AdmZip(zipPath);

  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory);

  const groups = new Map();

  let images = 0;
  let videos = 0;
  let ignored = 0;

  for (const entry of entries) {
    const fullName = entry.entryName;

    const filename = path.basename(fullName);

    const mediaType = getMediaType(filename);

    // Ignore unsupported files
    if (!mediaType) {
      ignored++;
      continue;
    }

    // Username filter
    if (
      !fullName
        .toLowerCase()
        .includes(targetUsername.toLowerCase())
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

    const normalized = normalizeFilename(filename);

    const parts = normalized.split("_");

    let mediaId = "";

    // Find long numeric Instagram media ID
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^\d{10,}$/.test(parts[i])) {
        mediaId = parts[i];
        break;
      }
    }

    const groupKey = mediaId || normalized;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupId: groupKey,
        username: targetUsername,
        mediaId,
        images: [],
        videos: [],
        files: [],
      });
    }

    const group = groups.get(groupKey);

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

  const productGroups = Array.from(
    groups.values()
  ).sort(
    (a, b) =>
      b.files.length - a.files.length
  );

  return {
    summary: {
      zip: path.basename(zipPath),

      targetUsername,

      totalFiles: entries.length,

      images,

      videos,

      ignored,

      groups: productGroups.length,

      analyzedAt:
        new Date().toISOString(),
    },

    groups: productGroups,
  };
}