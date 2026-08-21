import fs from "fs";
import path from "path";

// ==========================================
// CONFIG
// ==========================================

const PROJECT_ROOT = process.cwd();

const CATALOG_ROOT = PROJECT_ROOT;

const MANIFEST_PATH = path.join(
  PROJECT_ROOT,
  "instagram-catalog-manifest.json"
);

const CATEGORY_FOLDERS = [
  "Necklaces",
  "Jewellery-Sets",
  "Chains",
  "Bracelets",
  "Earrings",
  "Rings",
  "Pendants",
  "Accessories",
];

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

// ==========================================
// HELPERS
// ==========================================

function isImage(filename) {
  return IMAGE_EXTENSIONS.includes(
    path.extname(filename).toLowerCase()
  );
}

function isVideo(filename) {
  return VIDEO_EXTENSIONS.includes(
    path.extname(filename).toLowerCase()
  );
}

function getCategoryFolder(category) {
  return path.join(
    CATALOG_ROOT,
    category
  );
}

function getAllFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const results = [];

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
      results.push(
        ...getAllFiles(fullPath)
      );
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

// ==========================================
// LOAD MANIFEST
// ==========================================

function loadManifest() {
  if (
    !fs.existsSync(
      MANIFEST_PATH
    )
  ) {
    throw new Error(
      `Manifest not found:\n${MANIFEST_PATH}`
    );
  }

  const content =
    fs.readFileSync(
      MANIFEST_PATH,
      "utf8"
    );

  const manifest =
    JSON.parse(content);

  if (!Array.isArray(manifest)) {
    throw new Error(
      "Instagram catalog manifest must be an array."
    );
  }

  return manifest;
}

// ==========================================
// BUILD LOCAL CATALOG
// ==========================================

function buildCatalog() {
  const manifest =
    loadManifest();

  const catalog = [];

  for (
    const category of CATEGORY_FOLDERS
  ) {
    const categoryPath =
      getCategoryFolder(
        category
      );

    if (
      !fs.existsSync(
        categoryPath
      )
    ) {
      console.warn(
        `⚠️ Category folder missing: ${category}`
      );

      continue;
    }

    const groupDirectories =
      fs
        .readdirSync(
          categoryPath,
          {
            withFileTypes: true,
          }
        )
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name.startsWith(
              "group_"
            )
        );

    for (
      const groupDirectory of groupDirectories
    ) {
      const groupPath =
        path.join(
          categoryPath,
          groupDirectory.name
        );

      const groupFiles =
        getAllFiles(
          groupPath
        );

      const images =
        groupFiles.filter(
          isImage
        );

      const videos =
        groupFiles.filter(
          isVideo
        );

      const mediaId =
        groupDirectory.name.replace(
          /^group_/,
          ""
        );

      const manifestEntry =
        manifest.find(
          (item) =>
            String(
              item.media_id
            ) ===
            String(
              mediaId
            )
        );

      catalog.push({
        mediaId,

        category,

        groupDirectory:
          groupDirectory.name,

        groupPath,

        images,

        videos,

        imageCount:
          images.length,

        videoCount:
          videos.length,

        totalMedia:
          images.length +
          videos.length,

        captionPrefix:
          manifestEntry?.caption_prefix ||
          "",

        manifestGroupNumber:
          manifestEntry?.group_number ??
          null,
      });
    }
  }

  return catalog;
}

// ==========================================
// SUMMARY
// ==========================================

function printSummary(
  catalog
) {
  const totalGroups =
    catalog.length;

  const totalImages =
    catalog.reduce(
      (
        total,
        group
      ) =>
        total +
        group.imageCount,
      0
    );

  const totalVideos =
    catalog.reduce(
      (
        total,
        group
      ) =>
        total +
        group.videoCount,
      0
    );

  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    " Instagram Catalog Dry Run"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  console.log(
    "Project:",
    PROJECT_ROOT
  );

  console.log(
    "Manifest:",
    MANIFEST_PATH
  );

  console.log("");

  console.log(
    "Product groups:",
    totalGroups
  );

  console.log(
    "Images:",
    totalImages
  );

  console.log(
    "Videos:",
    totalVideos
  );

  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    " Category Summary"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  for (
    const category of CATEGORY_FOLDERS
  ) {
    const categoryGroups =
      catalog.filter(
        (group) =>
          group.category ===
          category
      );

    const images =
      categoryGroups.reduce(
        (
          total,
          group
        ) =>
          total +
          group.imageCount,
        0
      );

    const videos =
      categoryGroups.reduce(
        (
          total,
          group
        ) =>
          total +
          group.videoCount,
        0
      );

    console.log(
      `${category.padEnd(
        18,
        " "
      )} | ${String(
        categoryGroups.length
      ).padStart(
        2,
        " "
      )} groups | ${String(
        images
      ).padStart(
        2,
        " "
      )} images | ${String(
        videos
      ).padStart(
        2,
        " "
      )} videos`
    );
  }

  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    " Product Groups"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  catalog.forEach(
    (
      group,
      index
    ) => {
      console.log(
        `#${String(
          index + 1
        ).padStart(
          3,
          "0"
        )} | ${group.category.padEnd(
          16,
          " "
        )} | ID: ${
          group.mediaId
        } | ${
          group.imageCount
        } images | ${
          group.videoCount
        } videos`
      );
    }
  );

  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    " DRY RUN ONLY"
  );

  console.log(
    "=========================================="
  );

  console.log("");

  console.log(
    "⚠️ No MongoDB changes were made."
  );

  console.log(
    "⚠️ No products were created."
  );

  console.log(
    "⚠️ No media was uploaded."
  );

  console.log("");
}

// ==========================================
// MAIN
// ==========================================

try {
  const catalog =
    buildCatalog();

  if (
    catalog.length === 0
  ) {
    throw new Error(
      "No Instagram product groups were found."
    );
  }

  printSummary(
    catalog
  );
} catch (error) {
  console.error("");

  console.error(
    "❌ Instagram catalog dry run failed"
  );

  console.error("");

  console.error(
    error?.message ||
      error
  );

  console.error("");

  process.exit(1);
}