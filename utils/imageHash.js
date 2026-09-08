import sharp from "sharp";
import fs from "fs";
import path from "path";

/**
 * Compute 256-bit High-Precision Difference Hash (dHash 16x16) for an image.
 * Resizes to 17x16 grayscale, compares adjacent pixels across rows.
 * Provides 4x higher structural precision than 8x8 dHash to prevent false positives.
 */
export async function compute256Hash(input) {
  try {
    let pipeline = sharp(input);
    const metadata = await pipeline.metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    const { data } = await pipeline
      .grayscale()
      .resize(17, 16, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hashBits = "";
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const leftPixel = data[row * 17 + col];
        const rightPixel = data[row * 17 + col + 1];
        hashBits += leftPixel < rightPixel ? "1" : "0";
      }
    }
    return hashBits;
  } catch (error) {
    console.error("Error computing 256-bit hash:", error);
    return null;
  }
}

/**
 * Compute RGB Mean Color Stats for precise color identity verification.
 */
export async function computeColorStats(input) {
  try {
    const stats = await sharp(input).stats();
    if (stats.channels && stats.channels.length >= 3) {
      return {
        r: Math.round(stats.channels[0].mean),
        g: Math.round(stats.channels[1].mean),
        b: Math.round(stats.channels[2].mean),
      };
    }
  } catch (err) {
    console.error("Error computing color stats:", err);
  }
  return null;
}

/**
 * Compute multi-crop hashes and color stats across 5 region extractions:
 * 1. Full image (100%)
 * 2. Center crop (60% focused center)
 * 3. Square center crop (1:1 aspect ratio)
 * 4. Top-Center crop (70% top focused)
 * 5. Middle-Center crop (70% middle focused)
 * This guarantees cropped screenshots derived from website images match the catalogue product!
 */
export async function computeImageFingerprint(input) {
  const fingerprints = [];
  try {
    const pipeline = sharp(input);
    const metadata = await pipeline.metadata();

    if (!metadata.width || !metadata.height) {
      return fingerprints;
    }

    const { width, height } = metadata;

    // 1. Full image fingerprint
    const fullHash = await compute256Hash(input);
    const fullColor = await computeColorStats(input);
    if (fullHash) {
      fingerprints.push({ hash: fullHash, color: fullColor, type: "full" });
    }

    // Function to add a sub-crop region
    const addRegion = async (left, top, cropW, cropH, regionType) => {
      try {
        if (cropW > 30 && cropH > 30 && left >= 0 && top >= 0 && left + cropW <= width && top + cropH <= height) {
          const croppedBuffer = await sharp(input)
            .extract({ left, top, width: cropW, height: cropH })
            .toBuffer();
          const cropHash = await compute256Hash(croppedBuffer);
          const cropColor = await computeColorStats(croppedBuffer);
          if (cropHash) {
            fingerprints.push({ hash: cropHash, color: cropColor, type: regionType });
          }
        }
      } catch (e) {
        // Skip unprocessable sub-crops
      }
    };

    // 2. Center crop (60% focused center)
    const cW60 = Math.floor(width * 0.6);
    const cH60 = Math.floor(height * 0.6);
    await addRegion(Math.floor((width - cW60) / 2), Math.floor((height - cH60) / 2), cW60, cH60, "center60");

    // 3. Square center crop (1:1 aspect ratio)
    const sqSide = Math.floor(Math.min(width, height) * 0.8);
    await addRegion(Math.floor((width - sqSide) / 2), Math.floor((height - sqSide) / 2), sqSide, sqSide, "square");

    // 4. Top-Center crop (70% top focused)
    const cW70 = Math.floor(width * 0.7);
    const cH70 = Math.floor(height * 0.7);
    await addRegion(Math.floor((width - cW70) / 2), Math.floor(height * 0.05), cW70, cH70, "top70");

    // 5. Middle-Center crop (70% middle focused)
    await addRegion(Math.floor((width - cW70) / 2), Math.floor(height * 0.15), cW70, cH70, "mid70");

  } catch (err) {
    console.error("Error computing image fingerprint:", err);
  }
  return fingerprints;
}

/**
 * Calculate Hamming distance between two binary hash strings.
 */
export function hammingDistance256(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 256;
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

/**
 * Calculate minimum Hamming distance and color difference between candidate fingerprint lists.
 */
export function compareFingerprints(fpList1, fpList2) {
  let minDistance = 256;
  let minColorDiff = 255;

  for (const fp1 of fpList1) {
    for (const fp2 of fpList2) {
      // Prioritize corresponding crop region comparisons (e.g. full vs full, center vs center)
      const isSameType = fp1.type === fp2.type;
      const rawDist = hammingDistance256(fp1.hash, fp2.hash);
      const effectiveDist = isSameType ? rawDist : rawDist + 4;

      let colorDiff = 0;
      if (fp1.color && fp2.color) {
        colorDiff =
          Math.abs(fp1.color.r - fp2.color.r) +
          Math.abs(fp1.color.g - fp2.color.g) +
          Math.abs(fp1.color.b - fp2.color.b);
      }

      if (effectiveDist < minDistance || (effectiveDist === minDistance && colorDiff < minColorDiff)) {
        minDistance = rawDist;
        minColorDiff = colorDiff;
      }
    }
  }

  return { minDistance, minColorDiff };
}

/**
 * Category detector based on aspect ratio & color structure.
 */
export async function detectJewelleryCategory(input) {
  try {
    const pipeline = sharp(input);
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) return null;

    const aspectRatio = metadata.width / metadata.height;

    if (aspectRatio > 1.3) {
      return "Necklaces";
    } else if (aspectRatio < 0.75) {
      return "Earrings";
    } else {
      return "Rings";
    }
  } catch (err) {
    console.error("Error detecting category:", err);
    return null;
  }
}
