import dotenv from "dotenv";
import connectDB from "../config/db.js";

import Category from "../models/Category.js";
import Collection from "../models/Collection.js";
import Product from "../models/Product.js";

dotenv.config();

/*
========================================================
MAHALAKSHMI / THE GIRL HOUSE
INSTAGRAM CATALOG IMPORT
========================================================

IMPORTANT:

1. Old default products are NOT imported.
2. Gemini is NOT used.
3. Images are NOT imported.
4. Videos are NOT imported.
5. Price = 0 until admin verifies.
6. Stock = 0 until admin verifies.
7. Admin can edit everything later.
8. Source Product IDs are stored using instagramLink:
      catalog:P001
      catalog:P002
      ...
9. Re-running this script will UPDATE existing catalog
   products instead of creating duplicates.
========================================================
*/


// ======================================================
// CATEGORIES
// ======================================================

const categories = [
  {
    name: "Necklaces",
    slug: "necklaces",
    description:
      "Necklaces and pendant necklaces imported from the client catalog.",
    image: "",
    isActive: true,
  },

  {
    name: "Jewellery Sets",
    slug: "jewellery-sets",
    description:
      "Complete jewellery sets including necklaces and matching pieces.",
    image: "",
    isActive: true,
  },

  {
    name: "Chains",
    slug: "chains",
    description:
      "Invisible chains, anti-tarnish chains and other chain jewellery.",
    image: "",
    isActive: true,
  },

  {
    name: "Rings",
    slug: "rings",
    description:
      "Ring jewellery products.",
    image: "",
    isActive: true,
  },
];


// ======================================================
// COLLECTIONS
// ======================================================

const collectionNames = [
  "Minimal / Everyday",
  "Traditional / Classic",
  "Temple / Traditional",
  "Attigai / Traditional",
  "Ganesha / Antique",
  "Anti-Tarnish / Invisible",
  "Temple / Lakshmi",
  "Kids Jewellery",
  "Anti-Tarnish",
  "Gifting / Romantic",
  "Traditional / Emerald",
];

const collections = collectionNames.map((name) => ({
  name,

  slug: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""),

  description:
    `Imported from the client Instagram catalog: ${name}`,

  image: "",

  isActive: true,
}));


// ======================================================
// PRODUCT DATA
// ======================================================

const products = [

  // ----------------------------------------------------
  // P001
  // ----------------------------------------------------

  {
    sourceId: "P001",
    name: "Cute Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Caption explicitly says necklace.",
  },

  // ----------------------------------------------------
  // P002
  // ----------------------------------------------------

  {
    sourceId: "P002",
    name: "Classic Traditional Necklace",
    category: "Necklaces",
    collection: "Traditional / Classic",
    description:
      "Model-worn necklace; exact name is not supplied.",
  },

  // ----------------------------------------------------
  // P003
  // ----------------------------------------------------

  {
    sourceId: "P003",
    name: "Minimal Pendant Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Single necklace on bust.",
  },

  // ----------------------------------------------------
  // P004
  // ----------------------------------------------------

  {
    sourceId: "P004",
    name: "Temple Pendant Necklace",
    category: "Necklaces",
    collection: "Temple / Traditional",
    description:
      "Temple-style necklace/pendant visible.",
  },

  // ----------------------------------------------------
  // P005
  // ----------------------------------------------------

  {
    sourceId: "P005",
    name: "Attigai Necklace",
    category: "Necklaces",
    collection: "Attigai / Traditional",
    description:
      "Caption explicitly contains Attigai.",
  },

  // ----------------------------------------------------
  // P006
  // ----------------------------------------------------

  {
    sourceId: "P006",
    name: "Minimal Statement Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Single necklace on bust.",
  },

  // ----------------------------------------------------
  // P007
  // ----------------------------------------------------

  {
    sourceId: "P007",
    name: "Traditional Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace plus matching earrings visible.",
  },

  // ----------------------------------------------------
  // P008
  // ----------------------------------------------------

  {
    sourceId: "P008",
    name: "Temple Gold Necklace Set",
    category: "Jewellery Sets",
    collection: "Temple / Traditional",
    description:
      "Temple-style necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P009
  // ----------------------------------------------------

  {
    sourceId: "P009",
    name: "Leaf-Design Necklace",
    category: "Necklaces",
    collection: "Traditional / Classic",
    description:
      "Necklace visible; exact style/name not stated.",
  },

  // ----------------------------------------------------
  // P010
  // ----------------------------------------------------

  {
    sourceId: "P010",
    name: "Temple Pendant Jewellery Set",
    category: "Jewellery Sets",
    collection: "Temple / Traditional",
    description:
      "Necklace and matching earrings visible.",
  },

  // ----------------------------------------------------
  // P011
  // ----------------------------------------------------

  {
    sourceId: "P011",
    name: "Traditional Pendant Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace and matching earrings; 2 media.",
  },

  // ----------------------------------------------------
  // P012
  // ----------------------------------------------------

  {
    sourceId: "P012",
    name: "Classic Gold Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P013
  // ----------------------------------------------------

  {
    sourceId: "P013",
    name: "Ganesha Antique Jewellery Set",
    category: "Jewellery Sets",
    collection: "Ganesha / Antique",
    description:
      "Caption explicitly says Ganesha antique set; video only.",
  },

  // ----------------------------------------------------
  // P014
  // ----------------------------------------------------

  {
    sourceId: "P014",
    name: "Classic Gold Statement Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Long necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P015
  // ----------------------------------------------------

  {
    sourceId: "P015",
    name: "Classic Pendant Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace and earrings visible.",
  },

  // ----------------------------------------------------
  // P016
  // ----------------------------------------------------

  {
    sourceId: "P016",
    name: "Pearl / Beaded Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Long beaded necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P017
  // ----------------------------------------------------

  {
    sourceId: "P017",
    name: "Double-Layer Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Caption explicitly says double-layered.",
  },

  // ----------------------------------------------------
  // P018
  // ----------------------------------------------------

  {
    sourceId: "P018",
    name: "Royal Pendant Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P019
  // ----------------------------------------------------

  {
    sourceId: "P019",
    name: "Invisible Chain",
    category: "Chains",
    collection: "Anti-Tarnish / Invisible",
    description:
      "Caption explicitly says invisible chains; 4 media.",
  },

  // ----------------------------------------------------
  // P020
  // ----------------------------------------------------

  {
    sourceId: "P020",
    name: "Invisible Chain",
    category: "Chains",
    collection: "Anti-Tarnish / Invisible",
    description:
      "Caption explicitly says invisible chains.",
  },

  // ----------------------------------------------------
  // P021
  // ----------------------------------------------------

  {
    sourceId: "P021",
    name: "Invisible Thread / Chain",
    category: "Chains",
    collection: "Anti-Tarnish / Invisible",
    description:
      "Caption says invisible threads; 5 media.",
  },

  // ----------------------------------------------------
  // P022
  // ----------------------------------------------------

  {
    sourceId: "P022",
    name: "Green Stone Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace and matching earrings visible.",
  },

  // ----------------------------------------------------
  // P023
  // ----------------------------------------------------

  {
    sourceId: "P023",
    name: "Lakshmi Traditional Necklace Set",
    category: "Jewellery Sets",
    collection: "Temple / Lakshmi",
    description:
      "Caption references Lakshmi.",
  },

  // ----------------------------------------------------
  // P024
  // ----------------------------------------------------

  {
    sourceId: "P024",
    name: "Golden Chain Necklace",
    category: "Chains",
    collection: "Traditional / Classic",
    description:
      "Chain-style necklace visible.",
  },

  // ----------------------------------------------------
  // P025
  // ----------------------------------------------------

  {
    sourceId: "P025",
    name: "Kids Long Chain",
    category: "Chains",
    collection: "Kids Jewellery",
    description:
      "Caption explicitly says long chain for kids.",
  },

  // ----------------------------------------------------
  // P026
  // ----------------------------------------------------

  {
    sourceId: "P026",
    name: "Anti-Tarnish Chains",
    category: "Chains",
    collection: "Anti-Tarnish",
    description:
      "Caption explicitly says anti-tarnish chains.",
  },

  // ----------------------------------------------------
  // P027
  // ----------------------------------------------------

  {
    sourceId: "P027",
    name: "Traditional Pendant Necklace",
    category: "Necklaces",
    collection: "Traditional / Classic",
    description:
      "Large pendant necklace visible.",
  },

  // ----------------------------------------------------
  // P028
  // ----------------------------------------------------

  {
    sourceId: "P028",
    name: "Heart Pendant Jewellery",
    category: "Necklaces",
    collection: "Gifting / Romantic",
    description:
      "Caption/visual suggest a heart pendant; video only.",
  },

  // ----------------------------------------------------
  // P029
  // ----------------------------------------------------

  {
    sourceId: "P029",
    name: "Traditional Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P030
  // ----------------------------------------------------

  {
    sourceId: "P030",
    name: "Statement Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Large necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P031
  // ----------------------------------------------------

  {
    sourceId: "P031",
    name: "Traditional Necklace",
    category: "Necklaces",
    collection: "Traditional / Classic",
    description:
      "Model-worn necklace; 2 media.",
  },

  // ----------------------------------------------------
  // P032
  // ----------------------------------------------------

  {
    sourceId: "P032",
    name: "Minimal Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Single necklace on bust.",
  },

  // ----------------------------------------------------
  // P033
  // ----------------------------------------------------

  {
    sourceId: "P033",
    name: "Traditional Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P034
  // ----------------------------------------------------

  {
    sourceId: "P034",
    name: "Traditional Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace with matching earrings; 2 media.",
  },

  // ----------------------------------------------------
  // P035
  // ----------------------------------------------------

  {
    sourceId: "P035",
    name: "Emerald Pendant Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Green pendant necklace visible.",
  },

  // ----------------------------------------------------
  // P036
  // ----------------------------------------------------

  {
    sourceId: "P036",
    name: "Minimal Necklace Set",
    category: "Jewellery Sets",
    collection: "Minimal / Everyday",
    description:
      "Necklace and matching small pieces visible.",
  },

  // ----------------------------------------------------
  // P037
  // ----------------------------------------------------

  {
    sourceId: "P037",
    name: "Statement Necklace",
    category: "Necklaces",
    collection: "Traditional / Classic",
    description:
      "Single necklace on bust.",
  },

  // ----------------------------------------------------
  // P038
  // ----------------------------------------------------

  {
    sourceId: "P038",
    name: "Traditional Floral Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P039
  // ----------------------------------------------------

  {
    sourceId: "P039",
    name: "Gold & Emerald Jewellery Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Matching earrings and necklace visible.",
  },

  // ----------------------------------------------------
  // P040
  // ----------------------------------------------------

  {
    sourceId: "P040",
    name: "Traditional Jewellery Collection",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "4-media carousel; review before splitting.",
  },

  // ----------------------------------------------------
  // P041
  // ----------------------------------------------------

  {
    sourceId: "P041",
    name: "Temple Pendant Necklace Set",
    category: "Jewellery Sets",
    collection: "Temple / Traditional",
    description:
      "Necklace and matching earrings.",
  },

  // ----------------------------------------------------
  // P042
  // ----------------------------------------------------

  {
    sourceId: "P042",
    name: "Minimal Pendant Necklace",
    category: "Necklaces",
    collection: "Minimal / Everyday",
    description:
      "Single necklace on bust.",
  },

  // ----------------------------------------------------
  // P043
  // ----------------------------------------------------

  {
    sourceId: "P043",
    name: "Traditional Gold Necklace Set",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "Necklace and matching earrings.",
  },

  // ----------------------------------------------------
  // P044
  // ----------------------------------------------------

  {
    sourceId: "P044",
    name: "Emerald Traditional Necklace",
    category: "Necklaces",
    collection: "Traditional / Emerald",
    description:
      "Caption mentions emerald.",
  },

  // ----------------------------------------------------
  // P045
  // ----------------------------------------------------

  {
    sourceId: "P045",
    name: "Double-Layer Gold Necklace",
    category: "Necklaces",
    collection: "Traditional / Classic",
    description:
      "Caption explicitly says double-layered necklace; 2 media.",
  },

  // ----------------------------------------------------
  // P046
  // ----------------------------------------------------

  {
    sourceId: "P046",
    name: "Traditional Necklace Collection",
    category: "Jewellery Sets",
    collection: "Traditional / Classic",
    description:
      "5-media carousel; review before splitting.",
  },

  // ----------------------------------------------------
  // P047
  // ----------------------------------------------------

  {
    sourceId: "P047",
    name: "Minimal Pendant Jewellery",
    category: "Jewellery Sets",
    collection: "Minimal / Everyday",
    description:
      "Necklace with earrings visible.",
  },

  // ----------------------------------------------------
  // P048
  // ----------------------------------------------------

  {
    sourceId: "P048",
    name: "Lightweight / Everyday Jewellery",
    category: "Jewellery Sets",
    collection: "Minimal / Everyday",
    description:
      "4-media group; product split is not explicit.",
  },

  // ----------------------------------------------------
  // P049
  // ----------------------------------------------------

  {
    sourceId: "P049",
    name: "Temple Pendant Jewellery Set",
    category: "Jewellery Sets",
    collection: "Temple / Traditional",
    description:
      "Large pendant necklace with matching earrings.",
  },

  // ----------------------------------------------------
  // P050
  // ----------------------------------------------------

  {
    sourceId: "P050",
    name: "Minimal Rings",
    category: "Rings",
    collection: "Minimal / Everyday",
    description:
      "Caption explicitly says minimal rings.",
  },
];


// ======================================================
// IMPORT FUNCTION
// ======================================================

const importCatalog = async () => {
  try {

    console.log("");
    console.log("==============================================");
    console.log(" MAHALAKSHMI INSTAGRAM CATALOG IMPORT");
    console.log("==============================================");
    console.log("");

    await connectDB();

    console.log("âœ“ Connected to MongoDB");
    console.log("");

    // ==================================================
    // CATEGORIES
    // ==================================================

    console.log("Importing categories...");

    let categoryCount = 0;

    for (const category of categories) {

      await Category.findOneAndUpdate(
        {
          slug: category.slug,
        },
        {
          $set: category,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      categoryCount++;
    }

    console.log(
      `âœ“ Categories processed: ${categoryCount}`
    );

    console.log("");

    // ==================================================
    // COLLECTIONS
    // ==================================================

    console.log("Importing collections...");

    let collectionCount = 0;

    for (const collection of collections) {

      await Collection.findOneAndUpdate(
        {
          slug: collection.slug,
        },
        {
          $set: collection,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      collectionCount++;
    }

    console.log(
      `âœ“ Collections processed: ${collectionCount}`
    );

    console.log("");

    // ==================================================
    // PRODUCTS
    // ==================================================

    console.log("Importing products...");
    console.log("");

    let imported = 0;
    let updated = 0;

    for (const item of products) {

      /*
      IMPORTANT:

      We use catalog:P001 etc. as the stable
      source identifier.

      This prevents duplicate products when
      the script is executed again.
      */

      const sourceReference =
        `catalog:${item.sourceId}`;

      const productData = {

        name: item.name,

        description:
          item.description ||
          "Imported from client catalog.",

        category: item.category,

        collections: item.collection ? [item.collection] : [],

        /*
        Admin will enter these later.
        */

        price: 0,

        discountPrice: 0,

        stock: 0,

        /*
        Images intentionally empty.
        Admin will upload converted
        e-commerce images later.
        */

        images: [],

        /*
        No video URLs are imported here.
        */

        colors: [],

        sizes: [],

        specifications: {

          material: "",

          jewelleryType: "",

          metalPlating: "",

          stone: "",

          weight: "",

          occasion: "",

          countryOfOrigin: "India",
        },

        featured: false,

        bestSeller: false,

        newArrival: false,

        trending: false,

        /*
        Existing Product schema already
        supports instagramLink.

        We use it internally as the
        stable catalog source reference.
        */

        instagramLink:
          sourceReference,

        reviews: [],

        numReviews: 0,

        averageRating: 0,
      };


      // ==============================================
      // CHECK EXISTING CATALOG PRODUCT
      // ==============================================

      const existing =
        await Product.findOne({
          instagramLink:
            sourceReference,
        });


      // ==============================================
      // UPDATE
      // ==============================================

      if (existing) {

        await Product.findByIdAndUpdate(
          existing._id,
          productData,
          {
            new: true,
            runValidators: true,
          }
        );

        updated++;

        console.log(
          `â†» Updated ${item.sourceId} - ${item.name}`
        );

        continue;
      }


      // ==============================================
      // CREATE
      // ==============================================

      await Product.create(
        productData
      );

      imported++;

      console.log(
        `âœ“ Imported ${item.sourceId} - ${item.name}`
      );
    }


    // ==================================================
    // FINAL RESULT
    // ==================================================

    console.log("");
    console.log("==============================================");
    console.log(" IMPORT COMPLETED");
    console.log("==============================================");
    console.log("");

    console.log(
      `Categories : ${categoryCount}`
    );

    console.log(
      `Collections: ${collectionCount}`
    );

    console.log(
      `New products: ${imported}`
    );

    console.log(
      `Updated products: ${updated}`
    );

    console.log(
      `Total catalog products: ${products.length}`
    );

    console.log("");

    console.log(
      "Images     : NOT IMPORTED"
    );

    console.log(
      "Videos     : NOT IMPORTED"
    );

    console.log(
      "Prices     : 0 (admin verification)"
    );

    console.log(
      "Stock      : 0 (admin verification)"
    );

    console.log("");

    console.log(
      "âœ“ Catalog is ready for Admin Dashboard verification."
    );

    console.log("");

    process.exit(0);

  } catch (error) {

    console.error("");
    console.error(
      "=============================================="
    );

    console.error(
      " CATALOG IMPORT FAILED"
    );

    console.error(
      "=============================================="
    );

    console.error("");

    console.error(
      error
    );

    console.error("");

    process.exit(1);
  }
};


// ======================================================
// START
// ======================================================

importCatalog();
