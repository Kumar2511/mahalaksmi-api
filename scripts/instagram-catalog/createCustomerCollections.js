import mongoose from "mongoose";
import dotenv from "dotenv";
import Collection from "../../models/Collection.js";
dotenv.config();
const collections = [
  {
    name: "New Arrivals",
    slug: "new-arrivals",
    description: "Discover our latest jewellery arrivals.",
  },
  {
    name: "Best Sellers",
    slug: "best-sellers",
    description: "Our most loved jewellery pieces.",
  },
  {
    name: "Bridal Collection",
    slug: "bridal-collection",
    description: "Elegant jewellery for bridal and wedding occasions.",
  },
  {
    name: "Temple Jewellery",
    slug: "temple-jewellery",
    description: "Traditional temple-inspired jewellery designs.",
  },
  {
    name: "Traditional Collection",
    slug: "traditional-collection",
    description: "Classic traditional Indian jewellery designs.",
  },
  {
    name: "Festive Collection",
    slug: "festive-collection",
    description: "Jewellery perfect for festive celebrations.",
  },
  {
    name: "Daily Wear",
    slug: "daily-wear",
    description: "Elegant jewellery for everyday styling.",
  },
  {
    name: "Party Wear",
    slug: "party-wear",
    description: "Statement jewellery for parties and special occasions.",
  },
  {
    name: "Minimalist Collection",
    slug: "minimalist-collection",
    description: "Simple and elegant jewellery for a minimal look.",
  },
  {
    name: "Pearl Collection",
    slug: "pearl-collection",
    description: "Beautiful jewellery featuring pearl details.",
  },
  {
    name: "Kundan Collection",
    slug: "kundan-collection",
    description: "Elegant jewellery featuring Kundan-inspired designs.",
  },
  {
    name: "CZ Collection",
    slug: "cz-collection",
    description: "Sparkling jewellery featuring CZ stone details.",
  },
];
async function main() {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MongoDB connection string not found.");
  }
  console.log("");
  console.log("==========================================");
  console.log(" Creating Jewellery Collections");
  console.log("==========================================");
  console.log("");
  await mongoose.connect(mongoUri);
  console.log("MongoDB connected.");
  console.log("");
  let created = 0;
  let existing = 0;
  for (const item of collections) {
    const result = await Collection.findOneAndUpdate(
      { slug: item.slug },
      {
        $set: {
          name: item.name,
          description: item.description,
          isActive: true,
        },
        $setOnInsert: {
          slug: item.slug,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
    const wasCreated =
      result.createdAt?.getTime() ===
      result.updatedAt?.getTime();
    if (wasCreated) {
      created++;
      console.log(`CREATED  | ${item.name}`);
    } else {
      existing++;
      console.log(`EXISTS   | ${item.name}`);
    }
  }
  console.log("");
  console.log("==========================================");
  console.log(" COLLECTION SETUP COMPLETE");
  console.log("==========================================");
  console.log("");
  console.log("Created:", created);
  console.log("Existing:", existing);
  console.log("Total:", collections.length);
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
