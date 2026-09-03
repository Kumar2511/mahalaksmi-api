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
function getProductText(product) {
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
function getCollections(product) {
  const text = getProductText(product);
  const collections = [];
  if (/\bkundan\b/.test(text))
    collections.push("Kundan Collection");
  if (/\bcz\b|cubic zirconia|zirconia/.test(text))
    collections.push("CZ Collection");
  if (/\bpearl\b|\bpearls\b|\bmoti\b|faux pearl/.test(text))
    collections.push("Pearl Collection");
  if (
    /temple jewellery|temple jewelry|lakshmi|ganesha|deity|nakshi|nakashi|namam|temple motif/.test(text)
  )
    collections.push("Temple Jewellery");
  if (
    /bridal|bride|wedding|wedding jewellery|wedding jewelry|bridal wear|marriage|muhurtham/.test(text)
  )
    collections.push("Bridal Collection");
  if (
    /festive|festival|festive wear|celebration|diwali|pongal|navratri|onam/.test(text)
  )
    collections.push("Festive Collection");
  if (
    /traditional|antique|ethnic|indian traditional|jhumka|jhumki|haram|manga malai|mangalsutra/.test(text)
  )
    collections.push("Traditional Collection");
  if (
    /party wear|party jewellery|party jewelry|statement jewellery|statement jewelry|occasion wear|cocktail|evening wear/.test(text)
  )
    collections.push("Party Wear");
  if (
    /daily wear|everyday|office wear|casual wear|casual jewellery|casual jewelry|office/.test(text)
  )
    collections.push("Daily Wear");
  if (
    /minimalist|minimal|simple|delicate|dainty|sleek|lightweight/.test(text)
  )
    collections.push("Minimalist Collection");
  if (product.bestSeller === true)
    collections.push("Best Sellers");
  if (product.newArrival === true)
    collections.push("New Arrivals");
  const unique = [...new Set(collections)];
  if (unique.length === 0) {
    unique.push("New Arrivals");
  }
  return unique;
}
async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" FINAL JEWELLERY COLLECTION MIGRATION");
  console.log("==========================================");
  console.log("");
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected.");
  console.log("");
  const products = await Product.find({});
  console.log("Products found:", products.length);
  console.log("");
  const counts = {};
  let updated = 0;
  for (const product of products) {
    const assignedCollections = getCollections(product);
    product.collections = assignedCollections;
    // Remove old AI Imported / Instagram Import field
    product.set("collection", undefined);
    await product.save();
    updated++;
    for (const collection of assignedCollections) {
      counts[collection] =
        (counts[collection] || 0) + 1;
    }
  }
  console.log("");
  console.log("==========================================");
  console.log(" MIGRATION COMPLETE");
  console.log("==========================================");
  console.log("");
  console.log("Updated products:", updated);
  console.log("");
  console.log("COLLECTION COUNTS:");
  console.table(counts);
  console.log("");
  console.log("Old import collection field removed.");
  console.log("Customer-facing collections assigned.");
  console.log("");
  await mongoose.disconnect();
  console.log("MongoDB connection closed.");
}
main().catch(async (error) => {
  console.error("");
  console.error("MIGRATION ERROR");
  console.error(error.message);
  console.error("");
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
