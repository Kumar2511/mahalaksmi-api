import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY is missing from environment variables"
  );
}

const ai = new GoogleGenAI({
  apiKey,
});

const MODEL = "gemini-3.6-flash";

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

// ==========================================
// GEMINI RETRY CONFIGURATION
// ==========================================

const MAX_RETRIES = 3;

// IMPORTANT:
// 429 quota errors are NOT retried.
// 500 / 502 / 503 can be temporary.
const RETRYABLE_STATUS_CODES = [
  500,
  502,
  503,
];

// ==========================================
// MIME TYPE
// ==========================================

function getMimeType(filePath) {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".png":
      return "image/png";

    case ".webp":
      return "image/webp";

    default:
      return null;
  }
}

// ==========================================
// WAIT
// ==========================================

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ==========================================
// GET ERROR STATUS
// ==========================================

function getErrorStatus(error) {
  if (
    error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }

  if (
    error &&
    typeof error.code === "number"
  ) {
    return error.code;
  }

  const message = String(
    error?.message ||
      error ||
      ""
  );

  const match =
    message.match(
      /\b(400|401|403|404|408|409|429|500|502|503|504)\b/
    );

  return match
    ? Number(match[1])
    : null;
}

// ==========================================
// CHECK QUOTA ERROR
// ==========================================

function isQuotaError(error) {
  const status =
    getErrorStatus(error);

  const message =
    String(
      error?.message ||
        error ||
        ""
    ).toLowerCase();

  return (
    status === 429 ||
    message.includes(
      "resource_exhausted"
    ) ||
    message.includes(
      "quota exceeded"
    ) ||
    message.includes(
      "generativelanguage.googleapis.com/generate_content_free_tier_requests"
    )
  );
}

// ==========================================
// CLEAN GEMINI JSON
// ==========================================

function cleanJsonResponse(text) {
  if (!text) {
    throw new Error(
      "Gemini returned an empty response"
    );
  }

  let cleaned =
    String(text).trim();

  // Remove markdown code fences
  cleaned = cleaned
    .replace(
      /^```json\s*/i,
      ""
    )
    .replace(
      /^```\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch (error) {
    console.error(
      "Gemini returned invalid JSON:"
    );

    console.error(
      cleaned
    );

    throw new Error(
      "Gemini returned invalid JSON"
    );
  }
}

// ==========================================
// GEMINI REQUEST WITH RETRIES
// ==========================================

async function generateGeminiResponse(contents) {
  let lastError = null;
  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log("");
      console.log(
        `🤖 Gemini attempt ${attempt}/${MAX_RETRIES}`
      );
      const response =
        await ai.models.generateContent({
          model: MODEL,
          contents,
        });
      console.log(
        "✅ Gemini response received"
      );
      return response;
    } catch (error) {
      lastError = error;
      const status =
        getErrorStatus(error);
      const quota =
        isQuotaError(error);
      console.error(
        "❌ Gemini request failed:",
        error?.message ||
          error
      );
      // ========================================
      // QUOTA / 429
      // ========================================
      if (quota) {
        console.error(
          "🚫 Gemini quota exhausted. Not retrying."
        );
        throw new Error(
          "Gemini API quota exceeded. Please try again later."
        );
      }
      // ========================================
      // NON-RETRYABLE ERROR
      // ========================================
      if (
        !RETRYABLE_STATUS_CODES.includes(
          status
        )
      ) {
        console.error(
          "🚫 Non-retryable Gemini error."
        );
        throw error;
      }
      // ========================================
      // TEMPORARY ERROR
      // ========================================
      if (
        attempt < MAX_RETRIES
      ) {
        const delay =
          Math.pow(
            2,
            attempt - 1
          ) * 2000;
        console.error(
          `⏳ Gemini temporarily unavailable. Retrying in ${
            delay / 1000
          } seconds...`
        );
        await wait(
          delay
        );
      }
    }
  }
  throw new Error(
    lastError?.message ||
      `Gemini is temporarily unavailable after ${MAX_RETRIES} attempts.`
  );
}// ==========================================
// IDENTIFY INSTAGRAM PRODUCT
// ==========================================

/**
 * Identify a jewellery product from
 * multiple images.
 *
 * @param {string[]} imagePaths
 * @returns {Promise<object>}
 */

export async function identifyInstagramProduct(
  imagePaths
) {
  // ========================================
  // VALIDATE IMAGE ARRAY
  // ========================================

  if (
    !Array.isArray(imagePaths) ||
    imagePaths.length === 0
  ) {
    throw new Error(
      "At least one product image is required"
    );
  }

  // ========================================
  // VALIDATE IMAGES
  // ========================================

  const validImages =
    imagePaths
      .filter((filePath) => {
        if (
          !fs.existsSync(
            filePath
          )
        ) {
          console.warn(
            "âš ï¸ Image file not found:",
            filePath
          );

          return false;
        }

        return Boolean(
          getMimeType(
            filePath
          )
        );
      })
      .slice(0, 5);

  if (
    validImages.length === 0
  ) {
    throw new Error(
      "No valid product images were found"
    );
  }

  console.log("");

  console.log(
    "=========================================="
  );

  console.log(
    " Preparing Images For Gemini"
  );

  console.log(
    "=========================================="
  );

  console.log(
    "Images received:",
    imagePaths.length
  );

  console.log(
    "Valid images:",
    validImages.length
  );

  // ========================================
  // CONVERT IMAGES TO BASE64
  // ========================================

  const imageParts = [];

  for (
    const filePath of validImages
  ) {
    const mimeType =
      getMimeType(
        filePath
      );

    const imageBuffer =
      fs.readFileSync(
        filePath
      );

    imageParts.push({
      inlineData: {
        mimeType,
        data:
          imageBuffer.toString(
            "base64"
          ),
      },
    });
  }

  // ========================================
  // GEMINI PROMPT
  // ========================================

  const prompt = `
You are an expert jewellery product catalog assistant.

Analyze the provided product images carefully.

These images may show different views of THE SAME jewellery product.

Do not treat each image as a separate product.

Identify the jewellery product shown in the images.

Return ONLY valid JSON.

Do not use markdown.

Do not add explanations outside the JSON.

Use exactly this structure:
{
  "name": "",
  "category": "",
  "collection": "AI Imported",
  "description": "",
  "price": 0,
  "discountPrice": 0,
  "colors": [],
  "sizes": [],
  "material": "",
  "jewelleryType": "",
  "metalPlating": "",
  "stone": "",
  "weight": "",
  "occasion": "",
  "countryOfOrigin": "India",
  "stock": 0,
  "featured": false,
  "bestSeller": false,
  "newArrival": true,
  "trending": false,
  "instagramLink": "",
  "confidence": 0,
  "reasoning": ""
}
Rules:

1. category must normally be one of:

   - Necklaces
   - Earrings
   - Rings
   - Bracelets
   - Bangles
   - Pendants
   - Chains
   - Anklets
   - Maang Tikka
   - Jewellery Sets
   - Other

2. jewelleryType should describe the specific jewellery type.

3. material should describe what can reasonably be determined
   from the images.

   Do not invent exact material if it cannot
   be visually determined.

4. metalPlating should describe visible plating such as:

   - Gold
   - Silver
   - Rose Gold
   - Oxidized
   - Antique Gold

   If uncertain, use an empty string.

5. stone should mention visible stones such as:

   - CZ
   - Pearl
   - Kundan
   - Ruby
   - Emerald
   - Crystal

   If none can be determined,
   use an empty string.

6. weight must remain empty unless the weight
   is explicitly visible or provided in the image.

7. occasion can be inferred conservatively
   from the design, such as:

   - Wedding
   - Party
   - Festive
   - Casual
   - Traditional

8. description should be suitable for an
   ecommerce jewellery product page.

9. Do NOT invent:

   - brand names
   - prices
   - measurements
   - certifications
   - technical specifications

10. confidence must be a number between 0 and 1.

11. reasoning should briefly explain the
    visual evidence used to identify the product.

Remember:

The images represent ONE product listing.
`;

  // ========================================
  // GEMINI CONTENT
  // ========================================

  const contents = [
    {
      role: "user",

      parts: [
        {
          text: prompt,
        },

        ...imageParts,
      ],
    },
  ];

  // ========================================
  // CALL GEMINI
  // ========================================

  const response =
    await generateGeminiResponse(
      contents
    );

  // ========================================
  // PARSE RESULT
  // ========================================

  const result =
    cleanJsonResponse(
      response.text
    );

  // ========================================
  // FINAL RESULT
  // ========================================

  return {
    ...result,

    source: {
      model: MODEL,

      imagesAnalyzed:
        validImages.length,
    },
  };
}



