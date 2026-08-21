import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import Product from "../models/Product.js";
const SESSION_ID =
  "7990d3b2-c103-44e7-a02b-67aa28dfbc97";
const GROUP_ID =
  "3822326582888071119";
const SESSION_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "instagram-import",
  SESSION_ID
);
const ANALYSIS_FILE = path.join(
  SESSION_DIRECTORY,
  "analysis.json"
);
const PRODUCT_ID =
  "6a883d48b479512538b2bbb1";
async function main() {
  console.log("");
  console.log("☁️ Cloudinary migration test");
  console.log("Product:", PRODUCT_ID);
  console.log("Group:", GROUP_ID);
  console.log("");
  const analysis =
    JSON.parse(
      fs.readFileSync(
        ANALYSIS_FILE,
        "utf8"
      )
    );
  const group =
    analysis.groups.find(
      (item) =>
        String(item.groupId) ===
        GROUP_ID
    );
  if (!group) {
    throw new Error(
      "Group not found."
    );
  }
  const imagePaths = [];
  for (const media of group.files || []) {
    if (media.type !== "image") {
      continue;
    }
    const safeRelativePath =
      String(media.zipPath || "")
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
        SESSION_DIRECTORY,
        safeRelativePath
      );
    if (
      !imagePath.startsWith(
        SESSION_DIRECTORY +
          path.sep
      )
    ) {
      continue;
    }
    if (!fs.existsSync(imagePath)) {
      console.warn(
        "⚠️ Missing:",
        imagePath
      );
      continue;
    }
    imagePaths.push(
      imagePath
    );
  }
  console.log(
    "Local images found:",
    imagePaths.length
  );
  if (imagePaths.length === 0) {
    throw new Error(
      "No local images found."
    );
  }
  const cloudinaryUrls = [];
  for (
    let i = 0;
    i < imagePaths.length;
    i++
  ) {
    const imagePath =
      imagePaths[i];
    console.log("");
    console.log(
      `☁️ Uploading ${i + 1}/${imagePaths.length}:`
    );
    console.log(
      path.basename(imagePath)
    );
    const result =
      await cloudinary.uploader.upload(
        imagePath,
        {
          folder:
            "mahalaksmi-products/instagram-import",
          resource_type:
            "image",
        }
      );
    console.log(
      "✅",
      result.secure_url
    );
    cloudinaryUrls.push(
      result.secure_url
    );
  }
  console.log("");
  console.log(
    "☁️ Cloudinary uploads completed:",
    cloudinaryUrls.length
  );
  const product =
    await Product.findById(
      PRODUCT_ID
    );
  if (!product) {
    throw new Error(
      "Product not found in MongoDB."
    );
  }
  product.images =
    cloudinaryUrls;
  await product.save();
  console.log("");
  console.log(
    "🎉 PRODUCT UPDATED SUCCESSFULLY"
  );
  console.log(
    "Product:",
    product.name
  );
  console.log(
    "Images:",
    product.images
  );
}
main()
  .catch((error) => {
    console.error("");
    console.error(
      "❌ Migration failed:"
    );
    console.error(
      error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
