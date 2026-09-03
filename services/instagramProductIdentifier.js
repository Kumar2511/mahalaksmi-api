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
You are an expert jewellery product catalog assistant for an e-commerce website.

Analyze ALL provided images carefully.

IMPORTANT:
- Multiple images may show different views of THE SAME jewellery product.
- Treat all provided images as ONE product.
- Do NOT create multiple products from multiple images.
- Ignore Instagram filenames, media IDs, group IDs, hashtags, captions, and technical filenames when creating the product name.
- The output must be suitable for a professional jewellery e-commerce website.

PRODUCT NAME RULES:

Create a clean, attractive, realistic e-commerce product name.

The name MUST:
- Describe the actual jewellery visible in the images.
- Be short and professional.
- Normally contain 2 to 6 meaningful words.
- Use jewellery terminology such as:
  Necklace, Haram, Choker, Jhumka, Earrings, Stud Earrings,
  Chandbali, Ring, Bracelet, Bangles, Kada, Chain,
  Pendant, Anklet, Maang Tikka, Jewellery Set, etc.
- Mention visible design characteristics when useful:
  Temple, Kundan, Pearl, Floral, Stone Studded, Bridal,
  Antique, Traditional, Designer, Minimal, Layered, etc.
- Never use random product numbers.
- Never use Instagram media IDs.
- Never use filenames.
- Never use phrases such as:
  "Instagram Product",
  "Product 381650...",
  "Group 001",
  "Image Product",
  "AI Product",
  "Unknown Product".
- Do not copy an Instagram caption as the product name.
- Do not invent a brand name.
- Do not invent a specific gemstone/material that cannot reasonably be identified.
- If the exact design is uncertain, use a safe generic jewellery name.

GOOD EXAMPLES:

"Antique Temple Necklace"
"Pearl Layered Necklace"
"Traditional Kundan Necklace"
"Floral Stone Earrings"
"Classic Jhumka Earrings"
"Pearl Drop Earrings"
"Antique Gold Jhumka"
"Designer Chandbali Earrings"
"Elegant Kundan Ring"
"Traditional Temple Bangles"
"Stone Studded Bracelet"
"Layered Gold Chain"
"Temple Jewellery Set"
"Bridal Necklace Set"

BAD EXAMPLES:

"3816504180358607578"
"Group 3816504180358607578"
"Instagram Product"
"IMG_1234 Product"
"AI Imported Product"
"Jewellery Product 01"

Return ONLY valid JSON.

Do not use markdown.

Do not add explanations outside the JSON.

Use exactly this structure:

{
  "name": "",
  "category": "",
  "collections": [],
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

RULES:

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

2. jewelleryType should describe the specific jewellery type visible.

3. material should describe only what can reasonably be determined
   from the images.

   Do NOT claim real gold, silver, diamond, etc.
   unless it can reasonably be determined.

4. metalPlating should describe visible plating when identifiable:

   - Gold
   - Silver
   - Rose Gold
   - Oxidized
   - Antique Gold

   If uncertain, return "".

5. stone should mention visible stones or decorative elements
   only when reasonably identifiable:

   - CZ
   - Pearl
   - Kundan
   - Ruby
   - Emerald
   - Crystal

   If uncertain, return "".

6. weight must remain empty unless explicitly visible
   or provided.

7. occasion can be inferred conservatively:

   - Daily Wear
   - Party Wear
   - Bridal
   - Wedding
   - Festive
   - Traditional
   - Casual

8. description must be suitable for an e-commerce product page.

   Write 1-3 concise sentences describing:
   - design
   - visible details
   - suitable usage

   Do NOT mention Instagram.
   Do NOT mention AI.
   Do NOT mention image analysis.
   Do NOT invent technical specifications.

9. colors should contain only visibly identifiable colours.

10. sizes should contain only sizes that are actually visible
    or reasonably provided.

11. price must remain 0 unless an actual price is explicitly
    visible in the provided images.

12. discountPrice must remain 0 unless an actual discounted
    price is explicitly visible.

13. stock must remain 0.

14. featured must remain false.

15. bestSeller must remain false.

16. newArrival should remain true for newly imported products.

17. trending must remain false.

18. instagramLink must remain empty.

19. confidence must be a number from 0 to 1 representing
    confidence in the product identification.

20. reasoning should briefly explain why the product name
    and category were selected.

FINAL IMPORTANT RULE:

The "name" field must ALWAYS be a clean human-readable
e-commerce jewellery product name.

Never return IDs, filenames, Instagram captions,
group numbers, or technical identifiers as the product name.
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




