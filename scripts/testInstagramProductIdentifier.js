import "dotenv/config";

import {
  identifyInstagramProduct,
} from "../services/instagramProductIdentifier.js";

const imagePath =
  process.argv[2];

if (!imagePath) {
  console.error(
    "Usage:"
  );

  console.error(
    'node scripts/testInstagramProductIdentifier.js "IMAGE_PATH"'
  );

  process.exit(1);
}

try {
  console.log("");
  console.log(
    "=========================================="
  );
  console.log(
    " Instagram Product AI Test"
  );
  console.log(
    "=========================================="
  );
  console.log("");

  console.log(
    "Image:"
  );

  console.log(
    imagePath
  );

  console.log("");

  const result =
    await identifyInstagramProduct([
      imagePath,
    ]);

  console.log(
    "AI RESULT:"
  );

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  console.log("");

  console.log(
    "✅ Instagram product identification successful"
  );

  console.log("");
} catch (error) {
  console.error("");

  console.error(
    "❌ Instagram product identification failed"
  );

  console.error(
    error
  );
}