import Product from "../models/Product.js";

/*
|--------------------------------------------------------------------------
| VOICE COMMAND SERVICE
|--------------------------------------------------------------------------
|
| Supported operations:
|
| 1. Increase stock
| 2. Decrease stock
| 3. Set stock
|
| Supports:
|
| English:
|   Increase Sweet Necklace stock by 2
|   Add 2 stock to Sweet Necklace
|   Decrease Sweet Necklace stock by 3
|   Set Sweet Necklace stock to 10
|
| Tanglish:
|   Sweet Necklace stock 2 increase pannu
|   Sweet Necklace ku 2 stock add pannu
|   Sweet Necklace stock ah 2 increase pannu
|   Sweet Necklace stock 2 korai
|
| Tamil:
|   Sweet Necklace stock 2 அதிகப்படுத்து
|   Sweet Necklace stock 2 குறை
|   Sweet Necklace stock 10 ஆக வை
|
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Tamil numbers
|--------------------------------------------------------------------------
*/

const TAMIL_NUMBER_MAP = {
  "பூஜ்ஜியம்": 0,
  "பூஜியம்": 0,
  "பூஜ்ஜிய": 0,

  "ஒன்று": 1,
  "ஒரு": 1,
  "ஒன்றை": 1,

  "இரண்டு": 2,
  "இரண்டை": 2,

  "மூன்று": 3,
  "மூன்றை": 3,

  "நான்கு": 4,
  "நான்கை": 4,

  "ஐந்து": 5,
  "ஐந்தை": 5,

  "ஆறு": 6,
  "ஆறை": 6,

  "ஏழு": 7,
  "ஏழை": 7,

  "எட்டு": 8,
  "எட்டை": 8,

  "ஒன்பது": 9,
  "ஒன்பதை": 9,

  "பத்து": 10,
  "பதினொன்று": 11,
  "பன்னிரண்டு": 12,
  "பதின்மூன்று": 13,
  "பதினான்கு": 14,
  "பதினைந்து": 15,
  "பதினாறு": 16,
  "பதினேழு": 17,
  "பதினெட்டு": 18,
  "பத்தொன்பது": 19,
  "இருபது": 20,
};

/*
|--------------------------------------------------------------------------
| English numbers
|--------------------------------------------------------------------------
*/

const ENGLISH_NUMBER_MAP = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/*
|--------------------------------------------------------------------------
| Normalize text
|--------------------------------------------------------------------------
*/

const normalizeText = (value = "") => {
  return String(value)
    .normalize("NFKC")
    .trim()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ");
};

const normalizeForMatching = (value = "") => {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/*
|--------------------------------------------------------------------------
| Escape Mongo regex
|--------------------------------------------------------------------------
*/

const escapeRegex = (value = "") => {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/*
|--------------------------------------------------------------------------
| Convert number word
|--------------------------------------------------------------------------
*/

const convertWordNumber = (value) => {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value);

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      TAMIL_NUMBER_MAP,
      normalized
    )
  ) {
    return TAMIL_NUMBER_MAP[normalized];
  }

  const englishValue =
    ENGLISH_NUMBER_MAP[
      normalized.toLowerCase()
    ];

  if (englishValue !== undefined) {
    return englishValue;
  }

  return null;
};

/*
|--------------------------------------------------------------------------
| Extract amount
|--------------------------------------------------------------------------
*/

const extractAmount = (text) => {
  const normalized = normalizeText(text);

  /*
  | Numeric number
  */

  const numericMatch =
    normalized.match(/\b(\d+)\b/);

  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  /*
  | Word number
  */

  const words = normalized.split(" ");

  for (const word of words) {
    const value =
      convertWordNumber(word);

    if (value !== null) {
      return value;
    }
  }

  return null;
};

/*
|--------------------------------------------------------------------------
| Detect action
|--------------------------------------------------------------------------
*/

const detectAction = (text) => {
  const normalized =
    normalizeForMatching(text);

  /*
  |--------------------------------------------------------------------------
  | SET
  |--------------------------------------------------------------------------
  */

  const setPatterns = [
    /\bset\b.*\bstock\b/i,
    /\bstock\b.*\bset\b/i,
    /\bstock\b.*\bto\b/i,

    /stock.*ஆக.*set/i,
    /stock.*ஆக.*வை/i,
    /stock.*ஆக.*வைக்க/i,
    /stock.*ஆக.*மாற்று/i,
    /stock.*மாற்று/i,
    /ஸ்டாக்.*ஆக.*வை/i,
    /ஸ்டாக்.*மாற்று/i,

    /\bsetu\b/i,
  ];

  if (
    setPatterns.some((pattern) =>
      pattern.test(normalized)
    )
  ) {
    return "set_stock";
  }

  /*
  |--------------------------------------------------------------------------
  | DECREASE
  |--------------------------------------------------------------------------
  */

  const decreasePatterns = [
    /\bdecrease\b/i,
    /\breduce\b/i,
    /\bsubtract\b/i,
    /\bremove\b/i,
    /\bless\b/i,
    /\bminus\b/i,

    /குறை/i,
    /குறைக்க/i,
    /குறைத்துவிடு/i,
    /கழி/i,
    /கழிக்க/i,
    /கழித்துவிடு/i,
    /குறைய/i,

    /\bkorai\b/i,
    /\bkoraikk\b/i,
    /\bkuraikk\b/i,
    /\bkurai\b/i,

    /\bremove pannu\b/i,
    /\bdecrease pannu\b/i,
    /\breduce pannu\b/i,
    /\bsubtract pannu\b/i,
    /\bkurai pannu\b/i,
    /\bkora pannu\b/i,
  ];

  if (
    decreasePatterns.some((pattern) =>
      pattern.test(normalized)
    )
  ) {
    return "decrease_stock";
  }

  /*
  |--------------------------------------------------------------------------
  | INCREASE
  |--------------------------------------------------------------------------
  */

  const increasePatterns = [
    /\bincrease\b/i,
    /\badd\b/i,
    /\bplus\b/i,
    /\bincrement\b/i,
    /\bmore\b/i,

    /அதிகப்படுத்து/i,
    /அதிகரிக்க/i,
    /கூட்டு/i,
    /கூட்ட/i,
    /சேர்க்க/i,
    /சேர்/i,
    /அதிகம்/i,

    /\bincrease pannu\b/i,
    /\badd pannu\b/i,
    /\bplus pannu\b/i,
    /\bincrement pannu\b/i,
    /\badd pannunga\b/i,
    /\bincrease pannunga\b/i,
    /\bkoottu\b/i,
    /\bkoottunga\b/i,
  ];

  if (
    increasePatterns.some((pattern) =>
      pattern.test(normalized)
    )
  ) {
    return "increase_stock";
  }

  return null;
};

/*
|--------------------------------------------------------------------------
| Remove command words
|--------------------------------------------------------------------------
*/

const cleanProductQuery = (text) => {
  let value = normalizeText(text);

  const patterns = [
    /*
    |--------------------------------------------------------------------------
    | English command words
    |--------------------------------------------------------------------------
    */

    /\bincrease\b/gi,
    /\bincreased\b/gi,
    /\badd\b/gi,
    /\bplus\b/gi,
    /\bincrement\b/gi,

    /\bdecrease\b/gi,
    /\bdecreased\b/gi,
    /\breduce\b/gi,
    /\bsubtract\b/gi,
    /\bremove\b/gi,
    /\bminus\b/gi,

    /\bset\b/gi,
    /\bsetu\b/gi,

    /*
    |--------------------------------------------------------------------------
    | English filler words
    |--------------------------------------------------------------------------
    */

    /\bstock\b/gi,
    /\bby\b/gi,
    /\bto\b/gi,
    /\bthe\b/gi,
    /\bis\b/gi,
    /\bof\b/gi,

    /*
    |--------------------------------------------------------------------------
    | Tanglish command words
    |--------------------------------------------------------------------------
    */

    /\bpannu\b/gi,
    /\bpannunga\b/gi,
    /\bpannum\b/gi,
    /\bpanna\b/gi,

    /\bseyy\b/gi,
    /\bsei\b/gi,

    /\bku\b/gi,
    /\bkku\b/gi,
    /\bah\b/gi,
    /\boda\b/gi,
    /\bla\b/gi,

    /\bkorai\b/gi,
    /\bkoraikk\b/gi,
    /\bkuraikk\b/gi,
    /\bkurai\b/gi,

    /\bkoottu\b/gi,
    /\bkoottunga\b/gi,

    /*
    |--------------------------------------------------------------------------
    | Tamil increase words
    |--------------------------------------------------------------------------
    */

    /அதிகப்படுத்து/g,
    /அதிகப்படுத்துங்க/g,
    /அதிகப்படுத்தவும்/g,
    /அதிகரிக்க/g,
    /அதிகரிக்கவும்/g,

    /கூட்டு/g,
    /கூட்ட/g,
    /கூட்டுங்க/g,

    /சேர்க்க/g,
    /சேர்க்கவும்/g,
    /சேர்/g,

    /*
    |--------------------------------------------------------------------------
    | Tamil decrease words
    |--------------------------------------------------------------------------
    */

    /குறை/g,
    /குறைக்க/g,
    /குறைக்கவும்/g,
    /குறைத்துவிடு/g,
    /குறைத்துவிடுங்க/g,

    /கழி/g,
    /கழிக்க/g,
    /கழிக்கவும்/g,
    /கழித்துவிடு/g,

    /*
    |--------------------------------------------------------------------------
    | Tamil set words
    |--------------------------------------------------------------------------
    */

    /மாற்று/g,
    /மாற்றவும்/g,
    /வை/g,
    /வைக்க/g,
    /வைக்கவும்/g,
    /வைத்துவிடு/g,
    /வைத்துவிடுங்க/g,

    /*
    |--------------------------------------------------------------------------
    | Tamil filler words
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | These words are not part of the product name.
    |
    */

    /ஆக/g,
    /ஆகவே/g,
    /என்று/g,
    /என/g,
    /க்கு/g,

    /*
    |--------------------------------------------------------------------------
    | Tamil generic words
    |--------------------------------------------------------------------------
    */

    /செய்/g,
    /பண்ணு/g,
    /பண்ணுங்க/g,

    /ஸ்டாக்/g,
    /ஸ்டாக்‌/g,
    /பொருள்/g,
  ];

  /*
  |--------------------------------------------------------------------------
  | Remove command/filler words
  |--------------------------------------------------------------------------
  */

  for (const pattern of patterns) {
    value = value.replace(pattern, " ");
  }

  /*
  |--------------------------------------------------------------------------
  | Remove numeric amounts
  |--------------------------------------------------------------------------
  */

  value = value.replace(
    /\b\d+\b/g,
    " "
  );

  /*
  |--------------------------------------------------------------------------
  | Remove Tamil number words
  |--------------------------------------------------------------------------
  */

  for (
    const numberWord of Object.keys(
      TAMIL_NUMBER_MAP
    )
  ) {
    value = value.replace(
      new RegExp(
        escapeRegex(numberWord),
        "g"
      ),
      " "
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Remove English number words
  |--------------------------------------------------------------------------
  */

  for (
    const numberWord of Object.keys(
      ENGLISH_NUMBER_MAP
    )
  ) {
    value = value.replace(
      new RegExp(
        `\\b${escapeRegex(numberWord)}\\b`,
        "gi"
      ),
      " "
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Final cleanup
  |--------------------------------------------------------------------------
  */

  return value
    .replace(/\s+/g, " ")
    .trim();
};

/*
|--------------------------------------------------------------------------
| Product token normalization
|--------------------------------------------------------------------------
*/

const tokenize = (value = "") => {
  return normalizeForMatching(value)
    .split(/\s+/)
    .filter(Boolean);
};

/*
|--------------------------------------------------------------------------
| Product matching score
|--------------------------------------------------------------------------
|
| We don't only use exact regex.
|
| We also compare individual words so:
|
| "sweet necklace"
| "Sweet Necklace"
| "sweet necklace stock"
|
| can resolve to the same database product.
|
|--------------------------------------------------------------------------
*/

const calculateProductScore = (
  query,
  product
) => {
  const queryTokens =
    tokenize(query);

  const nameTokens =
    tokenize(product.name);

  if (
    !queryTokens.length ||
    !nameTokens.length
  ) {
    return 0;
  }

  let score = 0;

  /*
  | Exact normalized name
  */

  if (
    normalizeForMatching(
      product.name
    ) ===
    normalizeForMatching(query)
  ) {
    score += 100;
  }

  /*
  | Full query contained in name
  */

  if (
    normalizeForMatching(
      product.name
    ).includes(
      normalizeForMatching(query)
    )
  ) {
    score += 50;
  }

  /*
  | Token matching
  */

  for (const queryToken of queryTokens) {
    for (const nameToken of nameTokens) {
      if (
        nameToken === queryToken
      ) {
        score += 25;
        continue;
      }

      if (
        nameToken.includes(
          queryToken
        ) ||
        queryToken.includes(
          nameToken
        )
      ) {
        score += 10;
      }
    }
  }

  /*
  | Category matching
  */

  if (
    product.category &&
    normalizeForMatching(
      product.category
    ).includes(
      normalizeForMatching(query)
    )
  ) {
    score += 5;
  }

  return score;
};

/*
|--------------------------------------------------------------------------
| Find product from LIVE database
|--------------------------------------------------------------------------
*/

const findProduct = async (
  productQuery
) => {
  const query =
    normalizeText(productQuery);

  if (!query) {
    return {
      product: null,
      reason:
        "Product name was not detected.",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Exact database match
  |--------------------------------------------------------------------------
  */

  const exact =
    await Product.findOne({
      name: {
        $regex:
          `^${escapeRegex(query)}$`,
        $options: "i",
      },
    });

  if (exact) {
    return {
      product: exact,
      reason: null,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Partial database match
  |--------------------------------------------------------------------------
  */

  const partialProducts =
    await Product.find({
      name: {
        $regex:
          escapeRegex(query),
        $options: "i",
      },
    }).limit(10);

  if (
    partialProducts.length === 1
  ) {
    return {
      product:
        partialProducts[0],
      reason: null,
    };
  }

  if (
    partialProducts.length > 1
  ) {
    return {
      product: null,
      reason:
        "MULTIPLE_PRODUCTS",
      matches:
        partialProducts,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Token / fuzzy fallback
  |--------------------------------------------------------------------------
  */

  const allProducts =
    await Product.find({})
      .select(
        "_id name category stock featured bestSeller newArrival trending"
      )
      .limit(1000)
      .lean();

  const scoredProducts =
    allProducts
      .map((product) => ({
        product,
        score:
          calculateProductScore(
            query,
            product
          ),
      }))
      .filter(
        (item) =>
          item.score >= 20
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (
    scoredProducts.length === 1
  ) {
    return {
      product:
        scoredProducts[0].product,
      reason: null,
    };
  }

  if (
    scoredProducts.length > 1
  ) {
    const highestScore =
      scoredProducts[0].score;

    const strongMatches =
      scoredProducts.filter(
        (item) =>
          item.score >=
          highestScore - 10
      );

    if (
      strongMatches.length === 1
    ) {
      return {
        product:
          strongMatches[0].product,
        reason: null,
      };
    }

    return {
      product: null,
      reason:
        "MULTIPLE_PRODUCTS",
      matches:
        strongMatches
          .slice(0, 5)
          .map(
            (item) =>
              item.product
          ),
    };
  }

  return {
    product: null,
    reason:
      "PRODUCT_NOT_FOUND",
  };
};

/*
|--------------------------------------------------------------------------
| Build confirmation message
|--------------------------------------------------------------------------
*/

const buildConfirmationMessage = ({
  action,
  productName,
  previousStock,
  amount,
  newStock,
}) => {
  if (
    action ===
    "increase_stock"
  ) {
    return `${productName}: stock ${previousStock} → ${newStock}. Increase by ${amount}?`;
  }

  if (
    action ===
    "decrease_stock"
  ) {
    return `${productName}: stock ${previousStock} → ${newStock}. Decrease by ${amount}?`;
  }

  return `${productName}: stock ${previousStock} → ${newStock}. Set stock to ${amount}?`;
};

/*
|--------------------------------------------------------------------------
| Parse voice command
|--------------------------------------------------------------------------
*/

export const parseVoiceCommand =
  async (transcript) => {
    const originalText =
      normalizeText(transcript);

    if (!originalText) {
      return {
        success: false,
        message:
          "Voice command is empty.",
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Detect action
    |--------------------------------------------------------------------------
    */

    const action =
      detectAction(
        originalText
      );

    if (!action) {
      return {
        success: false,
        message:
          "I could not understand the stock action. Please say increase, decrease, or set stock.",
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Extract amount
    |--------------------------------------------------------------------------
    */

    const amount =
      extractAmount(
        originalText
      );

    if (
      amount === null ||
      Number.isNaN(amount) ||
      amount < 0
    ) {
      return {
        success: false,
        message:
          "Please specify a valid stock number.",
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Extract product
    |--------------------------------------------------------------------------
    */

    const productQuery =
      cleanProductQuery(
        originalText
      );

    if (!productQuery) {
      return {
        success: false,
        message:
          "I could not identify the product name.",
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Find LIVE product
    |--------------------------------------------------------------------------
    */

    const result =
      await findProduct(
        productQuery
      );

    /*
    |--------------------------------------------------------------------------
    | Multiple matches
    |--------------------------------------------------------------------------
    */

    if (
      result.reason ===
      "MULTIPLE_PRODUCTS"
    ) {
      return {
        success: false,
        message:
          "More than one product matches that name. Please specify the full product name.",
        needsSelection: true,
        matches:
          result.matches.map(
            (product) => ({
              _id: String(
                product._id
              ),
              name: product.name,
              category:
                product.category,
              stock:
                product.stock,
            })
          ),
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Product not found
    |--------------------------------------------------------------------------
    */

    if (!result.product) {
      return {
        success: false,
        message:
          "I could not find that product in the current product catalog.",
        productQuery,
      };
    }

    const product =
      result.product;

    /*
    |--------------------------------------------------------------------------
    | Calculate proposed stock
    |--------------------------------------------------------------------------
    */

    const previousStock =
      Number(
        product.stock || 0
      );

    let newStock =
      previousStock;

    if (
      action ===
      "increase_stock"
    ) {
      newStock =
        previousStock +
        amount;
    }

    if (
      action ===
      "decrease_stock"
    ) {
      newStock = Math.max(
        0,
        previousStock -
          amount
      );
    }

    if (
      action === "set_stock"
    ) {
      newStock = amount;
    }

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT
    |--------------------------------------------------------------------------
    |
    | Nothing is saved here.
    |
    | This endpoint is READ ONLY.
    |
    |--------------------------------------------------------------------------
    */

    return {
      success: true,

      confirmationRequired:
        true,

      command: {
        action,

        productId:
          String(product._id),

        productName:
          product.name,

        previousStock,

        amount,

        newStock,
      },

      message:
        buildConfirmationMessage({
          action,
          productName:
            product.name,
          previousStock,
          amount,
          newStock,
        }),
    };
  };

/*
|--------------------------------------------------------------------------
| Get LIVE assistant context
|--------------------------------------------------------------------------
|
| This replaces the hardcoded demo messages.
|--------------------------------------------------------------------------
*/

export const getVoiceAssistantContext =
  async () => {
    const products =
      await Product.find({})
        .select(
          "_id name category stock featured bestSeller newArrival trending"
        )
        .sort({
          updatedAt: -1,
        })
        .limit(1000)
        .lean();

    const categories =
      await Product.distinct(
        "category"
      );

    const cleanCategories =
      categories
        .filter(Boolean)
        .map((item) =>
          String(item).trim()
        )
        .filter(Boolean);

    /*
    |--------------------------------------------------------------------------
    | Generate suggestions from REAL products
    |--------------------------------------------------------------------------
    */

    const suggestions =
      products
        .slice(0, 4)
        .map((product) => {
          return {
            productId:
              String(product._id),

            productName:
              product.name,

            category:
              product.category ||
              "",

            currentStock:
              Number(
                product.stock || 0
              ),

            examples: [
              `${product.name} stock 2 increase pannu`,
              `Increase ${product.name} stock by 2`,
              `${product.name} stock 1 குறை`,
            ],
          };
        });

    return {
      success: true,

      totalProducts:
        products.length,

      categories:
        cleanCategories,

      sections: {
        featured: products.filter(
          (product) =>
            product.featured
        ).length,

        bestSeller:
          products.filter(
            (product) =>
              product.bestSeller
          ).length,

        newArrival:
          products.filter(
            (product) =>
              product.newArrival
          ).length,

        trending:
          products.filter(
            (product) =>
              product.trending
          ).length,
      },

      supportedActions: [
        "increase_stock",
        "decrease_stock",
        "set_stock",
      ],

      suggestions,
    };
  };

/*
|--------------------------------------------------------------------------
| Execute voice command
|--------------------------------------------------------------------------
|
| THIS is the only place where MongoDB is modified.
|--------------------------------------------------------------------------
*/

export const executeVoiceCommand =
  async ({
    productId,
    action,
    amount,
  }) => {
    if (!productId) {
      throw new Error(
        "Product ID is required."
      );
    }

    if (
      ![
        "increase_stock",
        "decrease_stock",
        "set_stock",
      ].includes(action)
    ) {
      throw new Error(
        "Unsupported voice action."
      );
    }

    const numericAmount =
      Number(amount);

    if (
      Number.isNaN(
        numericAmount
      ) ||
      numericAmount < 0
    ) {
      throw new Error(
        "Invalid stock amount."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Fetch current product again
    |--------------------------------------------------------------------------
    |
    | This is important.
    |
    | We don't blindly trust the value from /parse.
    |
    |--------------------------------------------------------------------------
    */

    const product =
      await Product.findById(
        productId
      );

    if (!product) {
      throw new Error(
        "Product not found."
      );
    }

    const oldStock =
      Number(
        product.stock || 0
      );

    let newStock =
      oldStock;

    if (
      action ===
      "increase_stock"
    ) {
      newStock =
        oldStock +
        numericAmount;
    }

    if (
      action ===
      "decrease_stock"
    ) {
      newStock = Math.max(
        0,
        oldStock -
          numericAmount
      );
    }

    if (
      action ===
      "set_stock"
    ) {
      newStock =
        numericAmount;
    }

    /*
    |--------------------------------------------------------------------------
    | SAVE ONLY AFTER CONFIRM
    |--------------------------------------------------------------------------
    */

    product.stock =
      newStock;

    await product.save();

    return {
      product,
      oldStock,
      newStock,
    };
  };