import dotenv from "dotenv";
import connectDB from "../../config/db.js";
import Product from "../../models/Product.js";

dotenv.config();

function cleanText(value) {
  return String(value || "")
    .replace(/[_]+/g, " ")
    .replace(/#[a-zA-Z0-9_]+/g, "")
    .replace(/\b20\d{2}[-_/]\d{2}[-_/]\d{2}\b/g, "")
    .replace(/\b20\d{2}[-_/]\d{2}\b/g, "")
    .replace(/\bDV[a-zA-Z0-9_-]+\b/gi, "")
    .replace(/\bD[Vv][a-zA-Z0-9_-]+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createCleanName(product) {
  let source =
    product.description ||
    product.name ||
    "";

  source = cleanText(source);

  // Remove common Instagram caption phrases
  source = source
    .replace(
      /follow us.*$/i,
      ""
    )
    .replace(
      /dm us.*$/i,
      ""
    )
    .replace(
      /contact us.*$/i,
      ""
    )
    .replace(
      /available now.*$/i,
      ""
    )
    .replace(
      /shop now.*$/i,
      ""
    )
    .trim();

  // Try to extract the meaningful first sentence
  const sentences = source
    .split(/[.!?]+/)
    .map((text) =>
      text.trim()
    )
    .filter(Boolean);

  let name =
    sentences[0] ||
    source;

  // Keep product names reasonably short
  if (name.length > 80) {
    name =
      name
        .split(" ")
        .slice(0, 10)
        .join(" ");
  }

  // If the extracted text is too generic,
  // use category-based fallback.
  const generic =
    !name ||
    name.length < 5 ||
    /^(new|beautiful|available|shop|check|dm)$/i.test(
      name
    );

  if (generic) {
    name =
      `${product.category || "Jewellery"} Product`;
  }

  // Title case
  name = name
    .toLowerCase()
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );

  return name;
}

async function main() {
  try {
    await connectDB();

    console.log(
      "Connected to MongoDB"
    );

    const products =
      await Product.find({
        instagramLink: {
          $regex:
            /^instagram-import:/,
        },
      });

    console.log(
      `Found ${products.length} Instagram imported products.`
    );

    let updated = 0;

    for (const product of products) {
      const oldName =
        product.name;

      const newName =
        createCleanName(product);

      if (
        oldName === newName
      ) {
        continue;
      }

      product.name =
        newName;

      await product.save();

      updated++;

      console.log(
        `UPDATED: ${oldName}`
      );

      console.log(
        `       → ${newName}`
      );
    }

    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      " CLEANUP COMPLETED"
    );
    console.log(
      "=========================================="
    );

    console.log(
      `Products found : ${products.length}`
    );

    console.log(
      `Products updated: ${updated}`
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "Cleanup failed:",
      error
    );

    process.exit(1);
  }
}

main();