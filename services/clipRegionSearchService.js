import sharp from "sharp";
import { extractEmbeddingFromBuffer } from "./clipVisualSearchService.js";
import { proposeSalientCandidateRegions } from "./salientRegionService.js";

/**
 * Generate a compact, deterministic set of sensible regions:
 * 1. full: Complete uploaded image
 * 2. center_crop: 50% central box
 * 3. large_central_crop: 75% central box
 * 4. upper_middle: 50% width, 50% height positioned at top 10%
 * 5. middle: 50% width, 50% height centered vertically
 * 6. lower_middle: 50% width, 50% height positioned at bottom 10%
 * 7. aspect_ratio_square_center: 1:1 square centered crop
 * 8. aspect_ratio_portrait_center: 4:5 / 3:4 portrait centered crop (if applicable)
 */
export async function generateSensibleRegions(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width < 20 || height < 20) {
    return [
      {
        name: "full",
        left: 0,
        top: 0,
        width,
        height,
        buffer: imageBuffer,
      },
    ];
  }

  const regionDefinitions = [];

  // 1. Full image
  regionDefinitions.push({
    name: "full",
    left: 0,
    top: 0,
    width,
    height,
  });

  // 2. Large Central Crop (75% width & height)
  const lccW = Math.round(width * 0.75);
  const lccH = Math.round(height * 0.75);
  regionDefinitions.push({
    name: "large_central_crop",
    left: Math.round((width - lccW) / 2),
    top: Math.round((height - lccH) / 2),
    width: lccW,
    height: lccH,
  });

  // 3. Center Crop (50% width & height)
  const ccW = Math.round(width * 0.5);
  const ccH = Math.round(height * 0.5);
  regionDefinitions.push({
    name: "center_crop",
    left: Math.round((width - ccW) / 2),
    top: Math.round((height - ccH) / 2),
    width: ccW,
    height: ccH,
  });

  // 4. Upper-Middle (50% box centered horizontally, positioned in upper third)
  const umTop = Math.round(height * 0.1);
  const umLeft = Math.round((width - ccW) / 2);
  regionDefinitions.push({
    name: "upper_middle",
    left: umLeft,
    top: Math.max(0, umTop),
    width: ccW,
    height: Math.min(height - umTop, ccH),
  });

  // 5. Middle (same dimensions, centered vertically)
  const mTop = Math.round((height - ccH) / 2);
  regionDefinitions.push({
    name: "middle",
    left: umLeft,
    top: mTop,
    width: ccW,
    height: ccH,
  });

  // 6. Lower-Middle (50% box centered horizontally, positioned in lower half)
  const lmTop = Math.round(height * 0.4);
  regionDefinitions.push({
    name: "lower_middle",
    left: umLeft,
    top: Math.max(0, lmTop),
    width: ccW,
    height: Math.min(height - lmTop, ccH),
  });

  // 7. Aspect-Ratio Square Center (1:1 aspect ratio based on smaller dimension)
  const minDim = Math.min(width, height);
  const sqLeft = Math.round((width - minDim) / 2);
  const sqTop = Math.round((height - minDim) / 2);
  if (sqLeft > 5 || sqTop > 5) {
    regionDefinitions.push({
      name: "aspect_ratio_square_center",
      left: sqLeft,
      top: sqTop,
      width: minDim,
      height: minDim,
    });
  }

  // 8. Aspect-Ratio Portrait Center (4:5 / 0.8 portrait crop if landscape/wide desktop)
  if (width > height) {
    const portraitW = Math.round(height * 0.8);
    if (portraitW <= width && portraitW >= 50) {
      regionDefinitions.push({
        name: "aspect_ratio_portrait_center",
        left: Math.round((width - portraitW) / 2),
        top: 0,
        width: portraitW,
        height: height,
      });
    }
  }

  // Crop each region using sharp
  const generatedRegions = [];
  for (const def of regionDefinitions) {
    try {
      let buffer;
      if (def.left === 0 && def.top === 0 && def.width === width && def.height === height) {
        buffer = imageBuffer;
      } else {
        buffer = await sharp(imageBuffer)
          .extract({
            left: Math.max(0, def.left),
            top: Math.max(0, def.top),
            width: Math.min(width - def.left, def.width),
            height: Math.min(height - def.top, def.height),
          })
          .toBuffer();
      }

      generatedRegions.push({
        name: def.name,
        left: def.left,
        top: def.top,
        width: def.width,
        height: def.height,
        buffer,
      });
    } catch (err) {
      console.warn(`[RegionGenerator] Failed to crop region ${def.name}:`, err.message);
    }
  }

  return generatedRegions;
}

/**
 * Extract embeddings for all candidate regions of a query image
 * Uses proposeSalientCandidateRegions (full + salient focus + context + square)
 */
export async function extractRegionEmbeddings(imageBuffer) {
  const regions = await proposeSalientCandidateRegions(imageBuffer);
  const regionEmbeddings = [];

  for (const region of regions) {
    try {
      const embedding = await extractEmbeddingFromBuffer(region.buffer);
      regionEmbeddings.push({
        regionName: region.name,
        coordinates: {
          left: region.left,
          top: region.top,
          width: region.width,
          height: region.height,
        },
        embedding,
      });
    } catch (err) {
      console.warn(`[RegionEmbeddingError] Failed embedding for ${region.name}:`, err.message);
    }
  }

  return regionEmbeddings;
}
