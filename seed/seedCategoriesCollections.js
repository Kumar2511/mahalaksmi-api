import dotenv from "dotenv";
import connectDB from "../config/db.js";

import Category from "../models/Category.js";
import Collection from "../models/Collection.js";

dotenv.config();

const categories = [];

// IMPORTANT:
// Keep this empty for now.
// We will import the EXISTING customer collections
// after checking their exact source data.

const collections = [];

const seedData = async () => {
  try {
    await connectDB();

    console.log("Connected to MongoDB");

    // ------------------------------------------
    // Categories
    // ------------------------------------------

    for (const category of categories) {
      const existing =
        await Category.findOne({
          slug: category.slug,
        });

      if (existing) {
        console.log(
          `Already exists: ${category.name}`
        );
        continue;
      }

      await Category.create(category);

      console.log(
        `Imported category: ${category.name}`
      );
    }

    // ------------------------------------------
    // Collections
    // ------------------------------------------

    for (const collection of collections) {
      const existing =
        await Collection.findOne({
          slug: collection.slug,
        });

      if (existing) {
        console.log(
          `Already exists: ${collection.name}`
        );
        continue;
      }

      await Collection.create(collection);

      console.log(
        `Imported collection: ${collection.name}`
      );
    }

    console.log(
      "Categories & Collections import completed."
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "Import failed:",
      error
    );

    process.exit(1);
  }
};

seedData();