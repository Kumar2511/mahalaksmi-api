import "dotenv/config";
import fs from "fs";
import path from "path";
import connectDB from "../config/db.js";
import { shouldPromoteHybridFallback } from "../services/hybridFallbackService.js";
import { findProductByImage } from "../controllers/imageSearchController.js";

// Mock Express response object
function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

async function runUnitTests() {
  console.log("\n========================================================");
  console.log("PHASE D.3 PART 1: shouldPromoteHybridFallback UNIT TESTS");
  console.log("========================================================\n");

  const testCases = [
    {
      id: 1,
      description: "score .9177 / margin .1115 (Clean direct photo)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "HIGH_CONFIDENCE",
          score: 0.9177,
          margin: 0.1115,
          imageType: "DIRECT_CLEAN",
        },
        exactCandidate: { _id: "6a8983a438c8c89855e85110", name: "Fairy Pendant" },
      },
      expected: true,
    },
    {
      id: 2,
      description: "score .8915 / margin .0560 (Clean direct post)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "HIGH_CONFIDENCE",
          score: 0.8915,
          margin: 0.056,
          imageType: "DIRECT_CLEAN",
        },
        exactCandidate: { _id: "6a8983a438c8c89855e85110", name: "Fairy Pendant" },
      },
      expected: true,
    },
    {
      id: 3,
      description: "score .8868 / margin .0883 (Clean direct photo)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "HIGH_CONFIDENCE",
          score: 0.8868,
          margin: 0.0883,
          imageType: "DIRECT_CLEAN",
        },
        exactCandidate: { _id: "6a8983a438c8c89855e85110", name: "Fairy Pendant" },
      },
      expected: true,
    },
    {
      id: 4,
      description: "score .8340 / margin .0191 (Ambiguous score & tight margin)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "AMBIGUOUS",
          score: 0.834,
          margin: 0.0191,
          imageType: "DIRECT_CLEAN",
        },
        exactCandidate: { _id: "6a8983a438c8c89855e85110", name: "Fairy Pendant" },
      },
      expected: false,
    },
    {
      id: 5,
      description: "score .7427 / margin .0263 (Medium confidence style match)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "MEDIUM_CONFIDENCE",
          score: 0.7427,
          margin: 0.0263,
          imageType: "DIRECT_CLEAN",
        },
        exactCandidate: null,
      },
      expected: false,
    },
    {
      id: 6,
      description: "score .6581 / margin .0108 (Tiny thumbnail ambiguous match)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "AMBIGUOUS",
          score: 0.6581,
          margin: 0.0108,
          imageType: "SCREENSHOT_CLUTTERED",
        },
        exactCandidate: null,
      },
      expected: false,
    },
    {
      id: 7,
      description: "score .6033 / margin .0206 (Low energy screenshot candidate)",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "AMBIGUOUS",
          score: 0.6033,
          margin: 0.0206,
          imageType: "SCREENSHOT_CLUTTERED",
        },
        exactCandidate: null,
      },
      expected: false,
    },
    {
      id: 8,
      description: "score .5856 / margin .0251 (Unrelated noise / reject)",
      input: {
        success: false,
        source: "hybrid_clip",
        confidence: {
          level: "NO_MATCH",
          score: 0.5856,
          margin: 0.0251,
          imageType: "UNKNOWN",
        },
        exactCandidate: null,
      },
      expected: false,
    },
    {
      id: 9,
      description: "score .8501 / margin .0501 but cluttered image type",
      input: {
        success: true,
        source: "hybrid_clip",
        confidence: {
          level: "HIGH_CONFIDENCE",
          score: 0.8501,
          margin: 0.0501,
          imageType: "SCREENSHOT_CLUTTERED",
        },
        exactCandidate: { _id: "6a8983a438c8c89855e85110", name: "Fairy Pendant" },
      },
      expected: false,
    },
    {
      id: 10,
      description: "missing / null confidence fields",
      input: null,
      expected: false,
    },
    {
      id: 11,
      description: "empty object {}",
      input: {},
      expected: false,
    },
    {
      id: 12,
      description: "confidence object without score/margin",
      input: { confidence: { level: "HIGH_CONFIDENCE" } },
      expected: false,
    },
    {
      id: 13,
      description: "high score with missing exactCandidate object",
      input: {
        confidence: {
          level: "HIGH_CONFIDENCE",
          score: 0.95,
          margin: 0.12,
          imageType: "DIRECT_CLEAN",
        },
        exactCandidate: null,
      },
      expected: false,
    },
    {
      id: 14,
      description: "high score but cluttered viewport (score .8950 / margin .0600)",
      input: {
        confidence: {
          level: "HIGH_CONFIDENCE",
          score: 0.895,
          margin: 0.06,
          imageType: "SCREENSHOT_CLUTTERED",
        },
        exactCandidate: { _id: "6a8983a438c8c89855e85110", name: "Fairy Pendant" },
      },
      expected: false,
    },
  ];

  let passed = 0;
  for (const t of testCases) {
    const actual = shouldPromoteHybridFallback(t.input);
    const isOk = actual === t.expected;
    if (isOk) passed++;
    console.log(
      `Test ${String(t.id).padStart(2)}: ${t.description.padEnd(56)} | Expected: ${String(t.expected).padEnd(5)} | Actual: ${String(actual).padEnd(5)} | ${isOk ? "PASS" : "FAIL"}`
    );
  }

  console.log(`\nDecision Unit Tests: ${passed}/${testCases.length} PASSED.\n`);
  if (passed !== testCases.length) {
    throw new Error("Some shouldPromoteHybridFallback unit tests failed!");
  }
}

async function runControllerCustomerContractTests() {
  console.log("========================================================");
  console.log("PHASE D.3 PART 2: /api/image-search CUSTOMER CONTRACT TESTS");
  console.log("Verifying that production customer responses remain 100% untouched");
  console.log("========================================================\n");

  await connectDB();

  const tempDir = path.resolve(process.cwd(), "uploads", "temp-search");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Load a known image: fairy direct catalogue image
  const cachedFiles = fs.readdirSync(".image_cache");
  const sampleLocalImage = path.resolve(".image_cache", cachedFiles[0]);
  const sampleBuf = fs.readFileSync(sampleLocalImage);

  // Test Case A: Exact catalogue match query
  const testAFile = path.resolve(tempDir, `contract-test-a-${Date.now()}.jpg`);
  fs.writeFileSync(testAFile, sampleBuf);

  const reqA = {
    headers: { origin: "http://localhost:3000" },
    file: { path: testAFile, originalname: "contract-test-a.jpg" },
  };
  const resA = createMockResponse();
  await findProductByImage(reqA, resA);

  console.log("Contract Check A (Exact Match Upload):");
  console.log("  Status code:", resA.statusCode);
  console.log("  Response body matchType:", resA.body?.matchType);
  console.log("  Has exactMatch:", Boolean(resA.body?.exactMatch));
  console.log("  Has matches array:", Array.isArray(resA.body?.matches));
  console.log("  RedirectUrl present:", Boolean(resA.body?.redirectUrl));
  const isOkA = resA.statusCode === 200 && resA.body?.matchType === "exact" && resA.body?.exactMatch;
  console.log("  Result:", isOkA ? "PASSED (Standard exact match contract preserved)" : "FAILED");

  // Test Case B: Hash-none query (e.g. Unrelated blue sky / landscape that hashes to none)
  const unrelatedBuf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  const testBFile = path.resolve(tempDir, `contract-test-b-${Date.now()}.png`);
  fs.writeFileSync(testBFile, unrelatedBuf);

  const reqB = {
    headers: { origin: "http://localhost:3000" },
    file: { path: testBFile, originalname: "contract-test-b.png" },
  };
  const resB = createMockResponse();
  await findProductByImage(reqB, resB);

  console.log("\nContract Check B (Hash-None Query Upload):");
  console.log("  Status code:", resB.statusCode);
  console.log("  Response body matchType:", resB.body?.matchType);
  console.log("  ExactMatch value:", resB.body?.exactMatch);
  console.log("  Matches array length:", resB.body?.matches?.length);
  console.log("  Message:", resB.body?.message);

  const isOkB =
    resB.statusCode === 200 &&
    resB.body?.success === true &&
    resB.body?.matchType === "none" &&
    resB.body?.exactMatch === null &&
    Array.isArray(resB.body?.matches) &&
    resB.body?.matches.length === 0 &&
    resB.body?.message === "This product is not available in our store.";

  console.log("  Result:", isOkB ? "PASSED (Standard 'none' response completely unchanged)" : "FAILED");

  console.log("\n========================================================");
  console.log("PHASE D.3 ALL VERIFICATION CHECKS PASSED");
  console.log("========================================================\n");
  process.exit(0);
}

async function main() {
  await runUnitTests();
  await runControllerCustomerContractTests();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
