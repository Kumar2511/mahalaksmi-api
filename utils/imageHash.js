import sharp from "sharp";

/**
 * Visual fingerprint utilities for Find Your Product.
 *
 * IMPORTANT:
 * - The customer uploads the FULL screenshot.
 * - We do NOT require the customer to crop the jewellery.
 * - The screenshot is analysed as a whole AND through automatically
 *   generated regions/tiles.
 * - The customer never chooses or defines a crop.
 *
 * This allows a jewellery product inside an Instagram screenshot,
 * browser screenshot, social-media screenshot, etc. to be matched
 * against the actual catalogue product image.
 */

/**
 * Convert an image into a perceptual dHash.
 *
 * 17 x 16 grayscale image produces:
 * 16 x 16 = 256 comparison bits.
 */
async function compute256Hash(input) {
  const { data } = await sharp(input)
    .resize(17, 16, {
      fit: "fill",
    })
    .grayscale()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  let bits = "";

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const current = data[y * 17 + x];
      const next = data[y * 17 + x + 1];

      bits += current > next ? "1" : "0";
    }
  }

  return bits;
}

/**
 * Calculate average RGB values.
 *
 * Used together with perceptual hashing so that two visually
 * different products with similar outlines are less likely to
 * be treated as exact matches.
 */
async function computeColorStats(input) {
  const stats = await sharp(input).stats();

  const channels = stats.channels || [];

  const r = channels[0]?.mean || 0;
  const g = channels[1]?.mean || 0;
  const b = channels[2]?.mean || 0;

  return {
    r,
    g,
    b,
  };
}

/**
 * Compare two binary hashes using Hamming distance.
 *
 * Lower = more visually similar.
 */
function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (hashA.length !== hashB.length) {
    return Number.MAX_SAFE_INTEGER;
  }

  let distance = 0;

  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) {
      distance++;
    }
  }

  return distance;
}

/**
 * RGB distance.
 */
function colorDistance(colorA, colorB) {
  if (!colorA || !colorB) {
    return Number.MAX_SAFE_INTEGER;
  }

  const dr = colorA.r - colorB.r;
  const dg = colorA.g - colorB.g;
  const db = colorA.b - colorB.b;

  return Math.sqrt(
    dr * dr +
      dg * dg +
      db * db
  );
}

/**
 * Generate a fingerprint for an image.
 */
async function createFingerprint(input) {
  const [hash, color] = await Promise.all([
    compute256Hash(input),
    computeColorStats(input),
  ]);

  return {
    hash,
    color,
  };
}

/**
 * Create an automatically generated set of search regions.
 *
 * This is NOT a customer crop.
 *
 * The user uploads the complete screenshot and the server
 * automatically creates several overlapping regions so the
 * jewellery can be detected even when:
 *
 * - Instagram UI is present
 * - browser chrome is present
 * - text/captions surround the product
 * - the product is not perfectly centred
 * - the screenshot contains multiple visual areas
 *
 * We intentionally do not ask the customer to crop anything.
 */
async function createSearchRegions(input) {
  const metadata = await sharp(input).metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (!width || !height) {
    return [];
  }

  const regions = [];

  /**
   * Always include the complete screenshot.
   */
  regions.push({
    name: "full",
    left: 0,
    top: 0,
    width,
    height,
  });

  /**
   * Large central region.
   *
   * This is only one of several automatically generated regions.
   * It does NOT replace full-image analysis.
   */
  const centerWidth = Math.round(width * 0.82);
  const centerHeight = Math.round(height * 0.82);

  regions.push({
    name: "center",
    left: Math.max(
      0,
      Math.round((width - centerWidth) / 2)
    ),
    top: Math.max(
      0,
      Math.round((height - centerHeight) / 2)
    ),
    width: centerWidth,
    height: centerHeight,
  });

  /**
   * Overlapping horizontal regions.
   */
  const horizontalWidth = Math.round(width * 0.68);

  regions.push({
    name: "left",
    left: 0,
    top: Math.round(height * 0.08),
    width: horizontalWidth,
    height: Math.round(height * 0.84),
  });

  regions.push({
    name: "middle",
    left: Math.round(width * 0.16),
    top: Math.round(height * 0.08),
    width: horizontalWidth,
    height: Math.round(height * 0.84),
  });

  regions.push({
    name: "right",
    left: Math.max(
      0,
      width - horizontalWidth
    ),
    top: Math.round(height * 0.08),
    width: horizontalWidth,
    height: Math.round(height * 0.84),
  });

  /**
   * Automatically inspect upper/middle/lower areas.
   *
   * This helps when the jewellery occupies only part of a
   * complete Instagram screenshot.
   */
  const verticalHeight = Math.round(height * 0.68);

  regions.push({
    name: "top",
    left: Math.round(width * 0.08),
    top: 0,
    width: Math.round(width * 0.84),
    height: verticalHeight,
  });

  regions.push({
    name: "middle-vertical",
    left: Math.round(width * 0.08),
    top: Math.round(height * 0.16),
    width: Math.round(width * 0.84),
    height: verticalHeight,
  });

  regions.push({
    name: "bottom",
    left: Math.round(width * 0.08),
    top: Math.max(
      0,
      height - verticalHeight
    ),
    width: Math.round(width * 0.84),
    height: verticalHeight,
  });

  /**
   * Remove invalid/duplicate regions.
   */
  const unique = new Map();

  for (const region of regions) {
    const safeWidth = Math.min(
      region.width,
      width - region.left
    );

    const safeHeight = Math.min(
      region.height,
      height - region.top
    );

    if (
      safeWidth <= 0 ||
      safeHeight <= 0
    ) {
      continue;
    }

    const normalized = {
      ...region,
      width: safeWidth,
      height: safeHeight,
    };

    const key = [
      normalized.left,
      normalized.top,
      normalized.width,
      normalized.height,
    ].join(":");

    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  }

  return Array.from(unique.values());
}

/**
 * Create fingerprints for the complete screenshot plus
 * automatically generated regions.
 */
async function createScreenshotFingerprints(input) {
  const regions = await createSearchRegions(input);

  const fingerprints = [];

  for (const region of regions) {
    try {
      const regionBuffer = await sharp(input)
        .extract({
          left: region.left,
          top: region.top,
          width: region.width,
          height: region.height,
        })
        .jpeg({
          quality: 90,
        })
        .toBuffer();

      const fingerprint = await createFingerprint(
        regionBuffer
      );

      fingerprints.push({
        region: region.name,
        ...fingerprint,
      });
    } catch (error) {
      console.warn(
        `Unable to fingerprint screenshot region "${region.name}":`,
        error.message
      );
    }
  }

  return fingerprints;
}

/**
 * Compare a screenshot fingerprint against a catalogue fingerprint.
 */
function compareFingerprints(
  searchFingerprint,
  catalogueFingerprint
) {
  if (
    !searchFingerprint ||
    !catalogueFingerprint
  ) {
    return {
      hashDistance: Number.MAX_SAFE_INTEGER,
      colorDistance: Number.MAX_SAFE_INTEGER,
      score: Number.MAX_SAFE_INTEGER,
    };
  }

  const hashDistanceValue = hammingDistance(
    searchFingerprint.hash,
    catalogueFingerprint.hash
  );

  const colorDistanceValue = colorDistance(
    searchFingerprint.color,
    catalogueFingerprint.color
  );

  /**
   * Hash is the primary signal.
   * Colour is secondary.
   *
   * We intentionally keep colour influence low because:
   * - screenshots can have filters
   * - Instagram can alter image rendering
   * - browser/display colours can differ
   */
  const normalizedColor =
    Math.min(colorDistanceValue, 441.67) / 441.67;

  const score =
    hashDistanceValue +
    normalizedColor * 12;

  return {
    hashDistance: hashDistanceValue,
    colorDistance: colorDistanceValue,
    score,
  };
}

/**
 * Compare multiple automatically generated screenshot regions
 * against one catalogue image.
 *
 * The BEST region wins.
 *
 * Therefore the customer's full screenshot can still find the
 * product even when the jewellery occupies only part of it.
 */
function compareScreenshotToCatalogue(
  screenshotFingerprints,
  catalogueFingerprint
) {
  if (
    !Array.isArray(screenshotFingerprints) ||
    screenshotFingerprints.length === 0
  ) {
    return null;
  }

  let best = null;

  for (const screenshotFingerprint of screenshotFingerprints) {
    const comparison = compareFingerprints(
      screenshotFingerprint,
      catalogueFingerprint
    );

    if (
      !best ||
      comparison.score < best.score
    ) {
      best = {
        region: screenshotFingerprint.region,
        ...comparison,
      };
    }
  }

  return best;
}

export {
  compute256Hash,
  computeColorStats,
  hammingDistance,
  colorDistance,
  createFingerprint,
  createSearchRegions,
  createScreenshotFingerprints,
  compareFingerprints,
  compareScreenshotToCatalogue,
};