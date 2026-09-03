import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "./models/Product.js";
dotenv.config();
const mongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MongoDB connection string not found.");
}
async function main() {
  await mongoose.connect(mongoUri);
  console.log("");
  console.log("==========================================");
  console.log(" REMOVE OLD COLLECTION FIELD");
  console.log("==========================================");
  console.log("");
  const result = await Product.updateMany(
    { collection: { $exists: true } },
    { $unset: { collection: 1 } }
  );
  console.log("Matched:", result.matchedCount);
  console.log("Modified:", result.modifiedCount);
  await mongoose.disconnect();
  console.log("");
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
