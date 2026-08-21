import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/Product.js";
const PRODUCT_ID = "6a883d48b479512538b2bbb1";
const cloudinaryUrls = [
  "https://res.cloudinary.com/qbmmnn2b/image/upload/v1787326198/mahalaksmi-products/instagram-import/ulqr4buiprhaxau7lbgo.jpg",
  "https://res.cloudinary.com/qbmmnn2b/image/upload/v1787326199/mahalaksmi-products/instagram-import/gg4peqsiihpainivlqy3.jpg",
  "https://res.cloudinary.com/qbmmnn2b/image/upload/v1787326200/mahalaksmi-products/instagram-import/t03c7s6mdjyxd894zmvr.jpg",
  "https://res.cloudinary.com/qbmmnn2b/image/upload/v1787326201/mahalaksmi-products/instagram-import/xhyuvndxxqxib7on8b3o.jpg",
  "https://res.cloudinary.com/qbmmnn2b/image/upload/v1787326203/mahalaksmi-products/instagram-import/j7rmtuuw0kwirfjvov09.jpg"
];
try {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(
    process.env.MONGODB_URI
  );
  console.log("✅ MongoDB connected.");
  const product =
    await Product.findById(PRODUCT_ID);
  if (!product) {
    throw new Error(
      "Product not found."
    );
  }
  console.log(
    "Product:",
    product.name
  );
  console.log(
    "Old images:",
    product.images.length
  );
  product.images =
    cloudinaryUrls;
  await product.save();
  console.log("");
  console.log(
    "🎉 PRODUCT IMAGES UPDATED!"
  );
  console.log(
    "New images:",
    product.images.length
  );
  console.log("");
  console.log(
    product.images
  );
} catch (error) {
  console.error(
    "❌ Update failed:",
    error.message
  );
} finally {
  await mongoose.disconnect();
  console.log("🔌 MongoDB disconnected.");
}
