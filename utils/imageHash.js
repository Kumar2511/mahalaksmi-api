import sharp from "sharp";

/**
 * ============================================================
 * THE GIRL HOUSE - SCREENSHOT PRODUCT MATCHING
 * ============================================================
 *
 * The customer may upload:
 *
 * 1. Direct product image
 * 2. Customer website screenshot
 * 3. Instagram post screenshot
 * 4. Instagram product screenshot
 *
 * We compare the uploaded screenshot against the REAL
 * catalogue images stored in Product.images.
 *
 * The screenshot does not have to be manually cropped.
 * ============================================================
 */

const DESCRIPTOR_SIZE = 32;

/* ------------------------------------------------------------
 * Utility
 * ------------------------------------------------------------ */

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function normalize(values) {
  if (!values.length) {
    return [];
  }

  let sum = 0;

  for (const value of values) {
    sum += value;
  }

  const mean =
    sum / values.length;

  let variance = 0;

  for (const value of values) {
    const difference =
      value - mean;

    variance +=
      difference * difference;
  }

  variance /=
    values.length;

  const std =
    Math.sqrt(variance) ||
    1;

  return values.map(
    (value) =>
      (value - mean) / std
  );
}

function cosineSimilarity(
  a,
  b
) {
  if (
    !a ||
    !b ||
    a.length === 0 ||
    a.length !== b.length
  ) {
    return -1;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    dot +=
      a[i] * b[i];

    magnitudeA +=
      a[i] * a[i];

    magnitudeB +=
      b[i] * b[i];
  }

  if (
    magnitudeA <= 0 ||
    magnitudeB <= 0
  ) {
    return -1;
  }

  return (
    dot /
    Math.sqrt(
      magnitudeA *
        magnitudeB
    )
  );
}

/* ------------------------------------------------------------
 * Create grayscale + edge descriptors
 * ------------------------------------------------------------ */

function buildEdgeVector(
  grayscale,
  width,
  height
) {
  const edges = [];

  for (
    let y = 0;
    y < height - 1;
    y++
  ) {
    for (
      let x = 0;
      x < width - 1;
      x++
    ) {
      const index =
        y * width + x;

      const current =
        grayscale[index];

      const right =
        grayscale[
          index + 1
        ];

      const bottom =
        grayscale[
          index + width
        ];

      const horizontal =
        Math.abs(
          current - right
        );

      const vertical =
        Math.abs(
          current - bottom
        );

      edges.push(
        horizontal +
          vertical
      );
    }
  }

  return normalize(
    edges
  );
}

/* ------------------------------------------------------------
 * Fingerprint
 * ------------------------------------------------------------ */

async function createFingerprint(
  input,
  aspectRatio = 1
) {
  const {
    data,
    info,
  } = await sharp(input)
    .autoOrient()
    .resize(
      DESCRIPTOR_SIZE,
      DESCRIPTOR_SIZE,
      {
        fit: "fill",
      }
    )
    .removeAlpha()
    .raw()
    .toBuffer({
      resolveWithObject:
        true,
    });

  const channels =
    info.channels || 3;

  const grayscale = [];

  let red = 0;
  let green = 0;
  let blue = 0;

  const pixelCount =
    DESCRIPTOR_SIZE *
    DESCRIPTOR_SIZE;

  for (
    let i = 0;
    i < pixelCount;
    i++
  ) {
    const offset =
      i * channels;

    const r =
      channels === 1
        ? data[offset]
        : data[offset] || 0;

    const g =
      channels === 1
        ? data[offset]
        : data[
            offset + 1
          ] || 0;

    const b =
      channels === 1
        ? data[offset]
        : data[
            offset + 2
          ] || 0;

    red += r;
    green += g;
    blue += b;

    grayscale.push(
      r * 0.299 +
        g * 0.587 +
        b * 0.114
    );
  }

  return {
    grayscale:
      normalize(
        grayscale
      ),

    edges:
      buildEdgeVector(
        grayscale,
        DESCRIPTOR_SIZE,
        DESCRIPTOR_SIZE
      ),

    color: {
      r:
        red / pixelCount,

      g:
        green / pixelCount,

      b:
        blue / pixelCount,
    },

    aspectRatio:
      Number(aspectRatio) ||
      1,
  };
}

/* ------------------------------------------------------------
 * Screenshot regions
 *
 * Instead of only using 10 large fixed regions, we create
 * many possible product-image areas.
 * ------------------------------------------------------------ */

async function createSearchRegions(
  input
) {
  const metadata =
    await sharp(input)
      .autoOrient()
      .metadata();

  const width =
    metadata.width || 0;

  const height =
    metadata.height || 0;

  if (
    width < 20 ||
    height < 20
  ) {
    return [];
  }

  const regions = [];

  /* Complete image */
  regions.push({
    name: "full",
    left: 0,
    top: 0,
    width,
    height,
    aspectRatio: width / height,
  });

  /**
   * ------------------------------------------------------------
   * DYNAMIC CONTENT-AWARE BOUNDING BOX DETECTION
   * ------------------------------------------------------------
   * Automatically isolates the product image box from surrounding
   * backgrounds (white, cream, dark mode, browser frames, UI bars).
   * ------------------------------------------------------------
   */
  try {
    const scale = Math.min(240 / width, 240 / height, 1);
    const sw = Math.max(10, Math.round(width * scale));
    const sh = Math.max(10, Math.round(height * scale));

    const { data } = await sharp(input)
      .autoOrient()
      .resize(sw, sh, { fit: "fill" })
      .removeAlpha()
      .toFormat("raw")
      .toBuffer({ resolveWithObject: true });

    // Sample border RGB values to determine ambient background
    const borderR = [], borderG = [], borderB = [];
    for (let x = 0; x < sw; x += 4) {
      const topIdx = x * 3;
      const botIdx = ((sh - 1) * sw + x) * 3;
      borderR.push(data[topIdx], data[botIdx]);
      borderG.push(data[topIdx + 1], data[botIdx + 1]);
      borderB.push(data[topIdx + 2], data[botIdx + 2]);
    }
    for (let y = 0; y < sh; y += 4) {
      const leftIdx = y * sw * 3;
      const rightIdx = (y * sw + (sw - 1)) * 3;
      borderR.push(data[leftIdx], data[rightIdx]);
      borderG.push(data[leftIdx + 1], data[rightIdx + 1]);
      borderB.push(data[leftIdx + 2], data[rightIdx + 2]);
    }
    borderR.sort((a, b) => a - b);
    borderG.sort((a, b) => a - b);
    borderB.sort((a, b) => a - b);

    const mid = Math.floor(borderR.length / 2);
    const bgR = borderR[mid] || 128;
    const bgG = borderG[mid] || 128;
    const bgB = borderB[mid] || 128;

    // Scan for foreground bounding box across color distance thresholds
    for (const bgThreshold of [6, 12, 20, 32, 48]) {
      let minX = sw, maxX = 0, minY = sh, maxY = 0;
      let count = 0;

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const idx = (y * sw + x) * 3;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          if (diff > bgThreshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            count++;
          }
        }
      }

      if (count > 15 && maxX > minX && maxY > minY) {
        const left = Math.max(0, Math.round(minX / scale));
        const top = Math.max(0, Math.round(minY / scale));
        const boxWidth = Math.min(width - left, Math.round((maxX - minX + 1) / scale));
        const boxHeight = Math.min(height - top, Math.round((maxY - minY + 1) / scale));

        if (boxWidth >= 40 && boxHeight >= 40) {
          regions.push({
            name: `fg-autocrop-t${bgThreshold}`,
            left,
            top,
            width: boxWidth,
            height: boxHeight,
            aspectRatio: boxWidth / boxHeight,
          });

          // Padded variant
          const padX = Math.round(boxWidth * 0.05);
          const padY = Math.round(boxHeight * 0.05);
          const pLeft = Math.max(0, left - padX);
          const pTop = Math.max(0, top - padY);
          const pWidth = Math.min(width - pLeft, boxWidth + 2 * padX);
          const pHeight = Math.min(height - pTop, boxHeight + 2 * padY);

          regions.push({
            name: `fg-autocrop-padded-t${bgThreshold}`,
            left: pLeft,
            top: pTop,
            width: pWidth,
            height: pHeight,
            aspectRatio: pWidth / pHeight,
          });
        }
      }
    }
  } catch (err) {
    // Fall back safely to grid crops if image processing fails
  }

  /**
   * Common Instagram / catalogue image ratios.
   */
  const ratios = [
    0.5625,
    0.6667,
    0.75,
    0.8,
    1,
    1.25,
    1.3333,
    1.5,
    1.7778,
  ];

  /**
   * Product may occupy different portions
   * of a screenshot.
   */
  const coverages = [
    0.35,
    0.45,
    0.55,
    0.65,
    0.75,
    0.85,
  ];

  /**
   * More positions than before.
   */
  const positions = [
    [0, 0],
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [1, 0],

    [0, 0.25],
    [0.25, 0.25],
    [0.5, 0.25],
    [0.75, 0.25],
    [1, 0.25],

    [0, 0.5],
    [0.25, 0.5],
    [0.5, 0.5],
    [0.75, 0.5],
    [1, 0.5],

    [0, 0.75],
    [0.25, 0.75],
    [0.5, 0.75],
    [0.75, 0.75],
    [1, 0.75],

    [0, 1],
    [0.25, 1],
    [0.5, 1],
    [0.75, 1],
    [1, 1],
  ];

  for (
    const ratio of ratios
  ) {
    for (
      const coverage of coverages
    ) {
      const targetArea =
        width *
        height *
        coverage;

      let cropWidth =
        Math.sqrt(
          targetArea *
            ratio
        );

      let cropHeight =
        cropWidth /
        ratio;

      if (
        cropWidth > width
      ) {
        cropWidth =
          width;

        cropHeight =
          cropWidth /
          ratio;
      }

      if (
        cropHeight > height
      ) {
        cropHeight =
          height;

        cropWidth =
          cropHeight *
          ratio;
      }

      cropWidth =
        Math.round(
          cropWidth
        );

      cropHeight =
        Math.round(
          cropHeight
        );

      if (
        cropWidth < 50 ||
        cropHeight < 50 ||
        cropWidth > width ||
        cropHeight > height
      ) {
        continue;
      }

      for (
        const [
          horizontal,
          vertical,
        ] of positions
      ) {
        const maxLeft =
          width -
          cropWidth;

        const maxTop =
          height -
          cropHeight;

        const left =
          Math.round(
            maxLeft *
              horizontal
          );

        const top =
          Math.round(
            maxTop *
              vertical
          );

        regions.push({
          name:
            `crop-${ratio}-${coverage}-${horizontal}-${vertical}`,

          left,
          top,

          width:
            cropWidth,

          height:
            cropHeight,

          aspectRatio:
            cropWidth /
            cropHeight,
        });
      }
    }
  }

  /**
   * Explicit likely Instagram/product areas.
   */
  const special = [
    {
      name:
        "instagram-main",

      left:
        Math.round(
          width * 0.03
        ),

      top:
        Math.round(
          height * 0.08
        ),

      width:
        Math.round(
          width * 0.94
        ),

      height:
        Math.round(
          height * 0.72
        ),
    },

    {
      name:
        "instagram-image",

      left:
        Math.round(
          width * 0.05
        ),

      top:
        Math.round(
          height * 0.12
        ),

      width:
        Math.round(
          width * 0.90
        ),

      height:
        Math.round(
          height * 0.62
        ),
    },

    {
      name:
        "center-product",

      left:
        Math.round(
          width * 0.08
        ),

      top:
        Math.round(
          height * 0.10
        ),

      width:
        Math.round(
          width * 0.84
        ),

      height:
        Math.round(
          height * 0.75
        ),
    },
  ];

  for (
    const region of special
  ) {
    if (
      region.left >= 0 &&
      region.top >= 0 &&
      region.width >= 50 &&
      region.height >= 50 &&
      region.left +
          region.width <=
        width &&
      region.top +
          region.height <=
        height
    ) {
      regions.push({
        ...region,

        aspectRatio:
          region.width /
          region.height,
      });
    }
  }

  /**
   * Remove duplicates.
   */
  const unique =
    new Map();

  for (
    const region of regions
  ) {
    const key = [
      region.left,
      region.top,
      region.width,
      region.height,
    ].join(":");

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        region
      );
    }
  }

  return Array.from(
    unique.values()
  );
}

/* ------------------------------------------------------------
 * Screenshot fingerprints
 * ------------------------------------------------------------ */

async function createScreenshotFingerprints(
  input,
  requestId = null
) {
  // Generate candidate regions
  const regions = await createSearchRegions(input);
  const totalRegions = regions.length;
  if (requestId) {
    console.log(`[ImageSearch][${requestId}] Candidate regions generated: ${totalRegions}`);
  }
  const fingerprints = [];
  let successCount = 0;
  let rejectCount = 0;

  const selected = regions.slice(0, 240);
  for (const region of selected) {
    try {
      const crop = await sharp(input)
        .autoOrient()
        .extract({
          left: region.left,
          top: region.top,
          width: region.width,
          height: region.height,
        })
        .toBuffer();

      const fingerprint = await createFingerprint(crop, region.aspectRatio);
      fingerprints.push({
        region: region.name,
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
        ...fingerprint,
      });
      successCount++;
    } catch (err) {
      rejectCount++;
      if (requestId) {
        console.log(`[ImageSearch][${requestId}] Region rejected (${region.name}): ${err.message}`);
      }
      // ignore invalid crop
    }
  }
  if (requestId) {
    console.log(`[ImageSearch][${requestId}] Fingerprint generation: ${successCount} successes, ${rejectCount} rejections`);
  }
  return fingerprints;
}

/* ------------------------------------------------------------
 * Catalogue variants
 *
 * The real catalogue image is also tested in several
 * centre-cropped versions because Instagram may crop it.
 * ------------------------------------------------------------ */

async function createCatalogueFingerprints(
  input
) {
  const metadata =
    await sharp(input)
      .autoOrient()
      .metadata();

  const width =
    metadata.width || 0;

  const height =
    metadata.height || 0;

  if (
    width < 20 ||
    height < 20
  ) {
    return [];
  }

  const variants = [
    {
      name:
        "catalogue-full",

      left: 0,
      top: 0,
      width,
      height,
    },
  ];

  for (
    const scale of [
      0.96,
      0.92,
      0.86,
      0.78,
    ]
  ) {
    const cropWidth =
      Math.max(
        20,
        Math.round(
          width * scale
        )
      );

    const cropHeight =
      Math.max(
        20,
        Math.round(
          height * scale
        )
      );

    variants.push({
      name:
        `catalogue-crop-${scale}`,

      left:
        Math.round(
          (width -
            cropWidth) /
            2
        ),

      top:
        Math.round(
          (height -
            cropHeight) /
            2
        ),

      width:
        cropWidth,

      height:
        cropHeight,
    });
  }

  const results = [];

  for (
    const variant of variants
  ) {
    try {
      const crop =
        await sharp(input)
          .autoOrient()
          .extract({
            left:
              variant.left,

            top:
              variant.top,

            width:
              variant.width,

            height:
              variant.height,
          })
          .toBuffer();

      const fingerprint =
        await createFingerprint(
          crop,
          variant.width /
            variant.height
        );

      results.push({
        variant:
          variant.name,

        ...fingerprint,
      });
    } catch {
      // Ignore broken variant.
    }
  }

  return results;
}

/* ------------------------------------------------------------
 * Compare two fingerprints
 * ------------------------------------------------------------ */

function compareFingerprints(
  search,
  catalogue
) {
  const grayscaleSimilarity =
    cosineSimilarity(
      search.grayscale,
      catalogue.grayscale
    );

  const edgeSimilarity =
    cosineSimilarity(
      search.edges,
      catalogue.edges
    );

  const colorA =
    search.color;

  const colorB =
    catalogue.color;

  const colorDistance =
    Math.sqrt(
      Math.pow(
        colorA.r -
          colorB.r,
        2
      ) +
        Math.pow(
          colorA.g -
            colorB.g,
          2
        ) +
        Math.pow(
          colorA.b -
            colorB.b,
          2
        )
    );

  const colorSimilarity =
    clamp(
      1 -
        colorDistance /
          300,
      0,
      1
    );

  const ratioA =
    Number(
      search.aspectRatio ||
        1
    );

  const ratioB =
    Number(
      catalogue.aspectRatio ||
        1
    );

  const ratioDifference =
    Math.abs(
      Math.log(
        ratioA /
          ratioB
      )
    );

  /**
   * Product identity is mainly based on image structure.
   *
   * Colour is supporting evidence only.
   */
  let similarity =
    grayscaleSimilarity * 0.76 +
    edgeSimilarity * 0.16 +
    colorSimilarity * 0.08;

  /**
   * Only penalise extreme aspect-ratio differences.
   */
  if (
    ratioDifference >
    0.65
  ) {
    similarity -=
      Math.min(
        0.10,
        ratioDifference *
          0.06
      );
  }

  similarity =
    clamp(
      similarity,
      0,
      1
    );

  return {
    similarity,

    grayscaleSimilarity,

    edgeSimilarity,

    colorSimilarity,

    ratioDifference,
  };
}

/* ------------------------------------------------------------
 * Screenshot -> catalogue
 * ------------------------------------------------------------ */

function compareScreenshotToCatalogue(
  screenshotFingerprints,
  catalogueFingerprints
) {
  if (
    !Array.isArray(screenshotFingerprints) ||
    !Array.isArray(catalogueFingerprints) ||
    screenshotFingerprints.length === 0 ||
    catalogueFingerprints.length === 0
  ) {
    return null;
  }

  // Prefer cached full‑image fingerprint if present to avoid variant re‑hashing differences
  const full = catalogueFingerprints.find(cf => cf.variant === "catalogue-full");
  const effectiveCatalogues = full ? [full] : catalogueFingerprints;
  if (full) {
    console.log('[ImageSearch][CACHE] Using cached catalogue-full fingerprint for product');
  }

  let best = null;
  for (const screenshot of screenshotFingerprints) {
    for (const catalogue of effectiveCatalogues) {
      const comparison = compareFingerprints(screenshot, catalogue);
      if (comparison.ratioDifference > 1.0) continue;
      if (!best || comparison.similarity > best.similarity) {
        best = {
          screenshotRegion: screenshot.region,
          catalogueVariant: catalogue.variant,
          ...comparison,
        };
      }
    }
  }

  return best;
}

export {
  createFingerprint,
  createSearchRegions,
  createScreenshotFingerprints,
  createCatalogueFingerprints,
  compareFingerprints,
  compareScreenshotToCatalogue,
  cosineSimilarity,
};