import sharp from "sharp";
import { createWorker } from "tesseract.js";
import jsQR from "jsqr";

const normalizeText = (value = "") =>
  String(value)
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeUPIId = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const extractAmounts = (text) => {
  const matches = [];
  const regex =
    /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].replace(/,/g, "");
    const value = Number(raw);

    if (Number.isFinite(value) && value > 0) {
      matches.push(value);
    }
  }

  return [...new Set(matches)];
};

const extractTransactionId = (text) => {
  const patterns = [
    /(?:upi\s*)?(?:transaction|txn)\s*(?:id|no|number)\s*[:#-]?\s*([A-Z0-9]{8,40})/i,
    /(?:utr|reference|ref(?:erence)?\s*no)\s*[:#-]?\s*([A-Z0-9]{8,40})/i,
    /(?:upi\s*ref(?:erence)?(?:\s*no)?|rrn)\s*[:#-]?\s*([A-Z0-9]{8,40})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
};

const hasAny = (text, words) =>
  words.some((word) => text.includes(word));

const hasStrongSuccessPhrase = (text) =>
  [
    "payment successful",
    "payment completed",
    "paid successfully",
    "transaction successful",
    "transaction completed",
    "money sent successfully",
    "payment received",
  ].some((phrase) => text.includes(phrase));

const hasFailurePhrase = (text) =>
  [
    "failed",
    "failure",
    "declined",
    "cancelled",
    "canceled",
    "pending",
    "processing",
    "unable to process",
    "try again",
    "refunded",
    "reversed",
  ].some((phrase) => text.includes(phrase));

const looksLikeUPIId = (value = "") =>
  /^[a-z0-9._-]{2,}@[a-z0-9._-]{2,}$/i.test(
    String(value).trim()
  );

export const validateUPIPaymentScreenshot = async ({
  buffer,
  expectedAmount,
  expectedUPIId = "",
}) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return {
      validScreenshot: false,
      reason: "Payment screenshot file is missing.",
    };
  }

  const expected = Number(expectedAmount);

  if (!Number.isFinite(expected) || expected <= 0) {
    return {
      validScreenshot: false,
      reason: "Invalid order amount.",
    };
  }

  const normalizedExpectedUPI = normalizeUPIId(
    expectedUPIId
  );

  if (
    normalizedExpectedUPI &&
    !looksLikeUPIId(normalizedExpectedUPI)
  ) {
    return {
      validScreenshot: false,
      reason: "Invalid merchant UPI ID.",
    };
  }

  let metadata;

  try {
    metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return {
        validScreenshot: false,
        reason:
          "The uploaded file is not a readable image.",
      };
    }

    if (metadata.width < 240 || metadata.height < 240) {
      return {
        validScreenshot: false,
        reason:
          "Please upload a clear payment screenshot.",
      };
    }
  } catch (error) {
    return {
      validScreenshot: false,
      reason:
        "The uploaded file is not a valid image.",
    };
  }

  let qrFound = false;

  try {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({
        resolveWithObject: true,
      });

    const qrResult = jsQR(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      {
        inversionAttempts: "attemptBoth",
      }
    );

    qrFound = Boolean(qrResult?.data);
  } catch (error) {
    console.warn(
      "UPI QR finder skipped:",
      error.message
    );
  }

  let worker;

  try {
    worker = await createWorker("eng");

    const result = await worker.recognize(buffer);

    const rawText = result?.data?.text || "";

    const text = normalizeText(rawText).toLowerCase();

    if (text.length < 20) {
      return {
        validScreenshot: false,
        qrFound,
        reason:
          "The screenshot does not contain enough readable payment information.",
      };
    }

    const upiKeywords = [
      "upi",
      "gpay",
      "google pay",
      "phonepe",
      "paytm",
      "bhim",
      "upi transaction",
      "upi ref",
      "transaction id",
      "txn id",
      "utr",
      "reference no",
      "paid to",
      "sent to",
      "payment successful",
      "payment completed",
      "payment received",
      "paid successfully",
      "money sent",
      "debited",
    ];

    const successKeywords = [
      "paid",
      "successful",
      "completed",
      "sent",
      "debited",
      "payment successful",
      "payment completed",
    ];

    const upiKeywordsFound = hasAny(
      text,
      upiKeywords
    );

    const successTextFound =
      hasStrongSuccessPhrase(text) ||
      hasAny(text, successKeywords);

    const failureTextFound =
      hasFailurePhrase(text);

    const transactionId =
      extractTransactionId(rawText);

    const amounts =
      extractAmounts(rawText);

    const amountMatches = amounts.some(
      (amount) =>
        Math.abs(amount - expected) < 0.01
    );

    const upiIdMatches =
      !normalizedExpectedUPI ||
      text.includes(normalizedExpectedUPI) ||
      text.includes(
        normalizedExpectedUPI.replace(
          /\s/g,
          ""
        )
      );

    /*
     * A generic word such as "paid" is not enough.
     * The screenshot must contain a meaningful
     * successful-payment signal and must not contain
     * failure/pending/refund language.
     */
    const successSignalValid =
      successTextFound &&
      !failureTextFound;

    /*
     * A payment receipt must contain a transaction /
     * reference / UTR identifier.
     */
    const transactionIdValid =
      Boolean(transactionId) &&
      transactionId.length >= 8 &&
      transactionId.length <= 40;

    const validScreenshot =
      upiKeywordsFound &&
      successSignalValid &&
      amountMatches &&
      transactionIdValid &&
      upiIdMatches;

    return {
      validScreenshot,

      qrFound,

      upiKeywordsFound,

      successTextFound,

      failureTextFound,

      amountMatches,

      transactionIdFound:
        transactionIdValid,

      transactionId,

      detectedAmounts:
        amounts,

      merchantUPIMatch:
        upiIdMatches,

      extractedText:
        rawText.slice(0, 4000),

      reason: validScreenshot
        ? "UPI payment screenshot passed automatic validation."
        : "The uploaded image does not contain enough valid UPI payment details for this order.",
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
};