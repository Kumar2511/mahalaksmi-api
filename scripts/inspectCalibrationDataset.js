import "dotenv/config";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import ProductVisualVector from "../models/ProductVisualVector.js";

async function run() {
  await connectDB();
  const products = await Product.find({}).select("name category price images").lean();
  const vectors = await ProductVisualVector.find({ model: "Xenova/clip-vit-base-patch32" }).lean();

  console.log(`Total Products in DB: ${products.length}`);
  console.log(`Total Visual Vectors: ${vectors.length}`);

  const byCat = {};
  for (const p of products) {
    const cat = p.category || "uncategorized";
    byCat[cat] = (byCat[cat] || 0) + 1;
  }
  console.log("Products by Category:", byCat);

  // Print sample products in each category
  console.log("\nSample Products per Category:");
  const seenCats = new Set();
  for (const p of products) {
    const cat = p.category || "uncategorized";
    if (!seenCats.has(cat)) {
      seenCats.add(cat);
      console.log(`Category [${cat}]: ${p._id} - ${p.name}`);
    }
  }

  process.exit(0);
}

run().catch(console.error);
