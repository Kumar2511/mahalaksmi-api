import path from "path";
import { analyzeInstagramZip } from "../services/instagramZipAnalyzer.js";

const zipPath = path.resolve(
  process.cwd(),
  "instagram-download.zip"
);

try {
  console.log("");
  console.log("==========================================");
  console.log(" Instagram Analyzer Test");
  console.log("==========================================");
  console.log("");

  const result = analyzeInstagramZip(zipPath);

  console.log(
    "Total files:",
    result.summary.totalFiles
  );

  console.log(
    "Images:",
    result.summary.images
  );

  console.log(
    "Videos:",
    result.summary.videos
  );

  console.log(
    "Ignored:",
    result.summary.ignored
  );

  console.log(
    "Groups:",
    result.summary.groups
  );

  console.log("");

  result.groups
    .slice(0, 10)
    .forEach((group, index) => {
      console.log(
        `#${String(index + 1).padStart(3, "0")}`,
        "|",
        `${group.files.length} media`,
        "|",
        `${group.images.length} images`,
        "|",
        `${group.videos.length} videos`,
        "| ID:",
        group.mediaId || "unknown"
      );
    });

  console.log("");
  console.log("✅ Analyzer test successful");
} catch (error) {
  console.error("");
  console.error("❌ Analyzer test failed");
  console.error(error);
  process.exit(1);
}