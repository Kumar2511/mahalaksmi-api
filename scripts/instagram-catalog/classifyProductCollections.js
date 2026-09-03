import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../../models/Product.js";
dotenv.config();
const mongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MongoDB connection string not found.");
}
function getText(product) {
  const s = product.specifications || {};
  return [
    product.name,
    product.description,
    s.material,
    s.jewelleryType,
    s.metalPlating,
    s.stone,
    s.occasion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function classifyCollections(product) {
  const text = getText(product);
  const result = [];
  // Material / design based
  if (/\bkundan\b/.test(text)) {
    result.push("Kundan Collection");
  }
  if (
    /\bcz\b|cubic zirconia|zirconia/.test(text)
  ) {
    result.push("CZ Collection");
  }
  if (
    /\bpearl\b|\bpearls\b|\bmoti\b|faux pearl/.test(text)
  ) {
    result.push("Pearl Collection");
  }
  if (
    /temple jewellery|temple jewelry|lakshmi|ganesha|deity|nakshi|nakashi|namam|temple motif/.test(text)
  ) {
    result.push("Temple Jewellery");
  }
  // Occasion based
  if (
    /bridal|bride|wedding|wedding jewellery|wedding jewelry|bridal wear|marriage|muhurtham/.test(text)
  ) {
    result.push("Bridal Collection");
  }
  if (
    /festive|festival|festive wear|celebration|diwali|pongal|navratri|onam/.test(text)
  ) {
    result.push("Festive Collection");
  }
  if (
    /party wear|party jewellery|party jewelry|statement jewellery|statement jewelry|occasion wear|cocktail|evening wear/.test(text)
  ) {
    result.push("Party Wear");
  }
  if (
    /daily wear|everyday|office wear|casual wear|casual jewellery|casual jewelry|office/.test(text)
  ) {
    result.push("Daily Wear");
  }
  // Style based
  if (
    /minimalist|minimal|simple|delicate|dainty|sleek|lightweight/.test(text)
  ) {
    result.push("Minimalist Collection");
  }
  if (
    /traditional|antique|ethnic|indian traditional|jhumka|jhumki|haram|manga malai|mangalsutra/.test(text)
  ) {
    result.push("Traditional Collection");
  }
  // Always put recent products in New Arrivals
  // only when created within the latest 30 days.
  const createdAt = product.createdAt
    ? new Date(product.createdAt)
    : null;
  const thirtyDaysAgo =
    Date.now() - 30 * 24 * 60 * 60 * 1000;
  if (
    createdAt &&
    createdAt.getTime() >= thirtyDaysAgo
  ) {
    result.push("New Arrivals");
  }
  return [...new Set(result)];
}
async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" Jewellery Collection Preview");
  console.log("==========================================");
  console.log("");
  console.log("MODE: DRY RUN");
  console.log("NO DATABASE CHANGES.");
  console.log("");
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected.");
  console.log("");
  const products = await Product.find({})
    .select(
      "name category description specifications collections collection createdAt"
    )
    .sort({ createdAt: -1 })
    .lean();
  console.log("Total products:", products.length);
  console.log("");
  const counts = {};
  let withoutCollection = 0;
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const assigned =
      classifyCollections(product);
    if (!assigned.length) {
      withoutCollection++;
    }
    for (const collection of assigned) {
      counts[collection] =
        (counts[collection] || 0) + 1;
    }
    console.log("------------------------------------------");
    console.log(`Product ${i + 1}/${products.length}`);
    console.log("Name:", product.name);
    console.log("Category:", product.category);
    console.log(
      "Collections:",
      assigned.length
        ? assigned.join(" | ")
        : "NONE"
    );
  }
  console.log("");
  console.log("==========================================");
  console.log(" COLLECTION PREVIEW SUMMARY");
  console.log("==========================================");
  console.log("");
  console.table(counts);
  console.log("");
  console.log(
    "Products without any collection:",
    withoutCollection
  );
  console.log("");
  console.log("IMPORTANT:");
  console.log("Old AI Imported / Instagram Import values");
  console.log("were NOT modified.");
  console.log("No database changes were made.");
  console.log("");
  await mongoose.disconnect();
  console.log("MongoDB connection closed.");
}
main().catch(async (error) => {
  console.error("");
  console.error("ERROR");
  console.error(error.message);
  console.error("");
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
