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
// ------------------------------------------
// Helpers
// ------------------------------------------
function productText(product) {
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
  const t = productText(product);
  const result = [];
  // Temple Jewellery
  if (
    /temple|lakshmi|ganesha|deity|peacock|elephant|nakshi|nakashi|namam/.test(t)
  ) {
    result.push("Temple Jewellery");
  }
  // Kundan
  if (/kundan/.test(t)) {
    result.push("Kundan Collection");
  }
  // Pearl
  if (/pearl|pearls|moti/.test(t)) {
    result.push("Pearl Collection");
  }
  // CZ
  if (/\bcz\b|cubic zirconia/.test(t)) {
    result.push("CZ Collection");
  }
  // Bridal
  if (
    /bridal|bride|wedding|wedding wear|marriage|muhurtham|bridal wear/.test(t)
  ) {
    result.push("Bridal Collection");
  }
  // Festive
  if (
    /festive|festival|diwali|pongal|navratri|onam|celebration/.test(t)
  ) {
    result.push("Festive Collection");
  }
  // Traditional
  if (
    /traditional|antique|jhumka|jhumki|haram|manga malai|mangalsutra/.test(t)
  ) {
    result.push("Traditional Collection");
  }
  // Minimalist
  if (
    /minimal|minimalist|delicate|simple|dainty|sleek/.test(t)
  ) {
    result.push("Minimalist Collection");
  }
  // Daily Wear
  if (
    /daily wear|everyday|casual|office wear|office|daily/.test(t)
  ) {
    result.push("Daily Wear");
  }
  // Party Wear
  if (
    /party|party wear|statement|occasion wear|evening wear/.test(t)
  ) {
    result.push("Party Wear");
  }
  return [...new Set(result)];
}
// ------------------------------------------
// Main
// ------------------------------------------
async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" Jewellery Collection Migration");
  console.log("==========================================");
  console.log("");
  console.log("MODE: DRY RUN");
  console.log("NO DATABASE CHANGES WILL BE MADE.");
  console.log("");
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected.");
  console.log("");
  const products = await Product.find({})
    .select(
      "name category description specifications collections collection"
    )
    .lean();
  console.log("Total products:", products.length);
  console.log("");
  const counts = {};
  let unclassified = 0;
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const assigned = classifyCollections(product);
    console.log("------------------------------------------");
    console.log(`Product ${i + 1}/${products.length}`);
    console.log("Name:", product.name);
    console.log("Category:", product.category);
    console.log(
      "Collections:",
      assigned.length ? assigned.join(", ") : "NONE"
    );
    if (!assigned.length) {
      unclassified++;
    }
    for (const collection of assigned) {
      counts[collection] =
        (counts[collection] || 0) + 1;
    }
  }
  console.log("");
  console.log("==========================================");
  console.log(" DRY RUN SUMMARY");
  console.log("==========================================");
  console.log("");
  console.table(counts);
  console.log("");
  console.log("Unclassified products:", unclassified);
  console.log("");
  console.log("IMPORTANT:");
  console.log("No products were modified.");
  console.log("No old collection values were deleted.");
  console.log("");
  await mongoose.disconnect();
  console.log("MongoDB connection closed.");
}
main().catch(async (error) => {
  console.error("");
  console.error("ERROR");
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
