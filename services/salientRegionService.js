import sharp from "sharp";

/**
 * Propose 4-6 high-salience candidate regions using multi-scale spatial energy & contrast.
 * 
 * 1. full: Always keep the global full image (essential for direct uploads & mobile crops)
 * 2. energy_box_primary: The highest texture/edge density bounding box (isolated product thumbnail)
 * 3. energy_box_expanded: 1.5x padded context around the primary energy box
 * 4. energy_box_secondary: Second distinct high-energy cluster (if separated spatially)
 * 5. modal_foreground_box: Content bounding box excluding ambient background / border frames
 * 6. central_square: 1:1 aspect ratio square center
 */
export async function proposeSalientCandidateRegions(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  const candidateRegions = [];

  // 1. Full image
  candidateRegions.push({
    name: "full",
    left: 0,
    top: 0,
    width,
    height,
    buffer: imageBuffer,
  });

  if (width < 60 || height < 60) {
    return candidateRegions;
  }

  // Downsample to fast analysis grid
  const sw = 160;
  const sh = Math.max(10, Math.round((height / width) * 160));
  const scaleX = width / sw;
  const scaleY = height / sh;

  const { data } = await sharp(imageBuffer)
    .greyscale()
    .resize(sw, sh, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Compute spatial gradient energy
  const energy = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;
      const gx = data[idx + 1] - data[idx - 1];
      const gy = data[idx + sw] - data[idx - sw];
      energy[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Multi-scale sliding window search for high-density visual objects
  // Small window (covers ~10-20% of image width: typical for desktop screenshots / thumbnails)
  // Medium window (covers ~35-50% of image width: typical for cards / Instagram posts)
  const windowDefs = [
    { w: Math.round(sw * 0.15), h: Math.round(sw * 0.15), label: "small" },
    { w: Math.round(sw * 0.35), h: Math.round(sw * 0.35), label: "medium" },
  ];

  const candidateBoxes = [];

  for (const wdef of windowDefs) {
    const winW = Math.max(8, wdef.w);
    const winH = Math.max(8, wdef.h);
    let bestWin = null;
    let maxMean = -1;

    for (let y = 0; y <= sh - winH; y += 3) {
      for (let x = 0; x <= sw - winW; x += 3) {
        let sum = 0;
        for (let wy = 0; wy < winH; wy++) {
          for (let wx = 0; wx < winW; wx++) {
            sum += energy[(y + wy) * sw + (x + wx)];
          }
        }
        const mean = sum / (winW * winH);
        if (mean > maxMean) {
          maxMean = mean;
          bestWin = { x, y, winW, winH, mean };
        }
      }
    }

    if (bestWin && maxMean > 15) {
      candidateBoxes.push({
        name: `salient_object_${wdef.label}`,
        left: Math.max(0, Math.round(bestWin.x * scaleX)),
        top: Math.max(0, Math.round(bestWin.y * scaleY)),
        width: Math.min(width, Math.round(bestWin.winW * scaleX)),
        height: Math.min(height, Math.round(bestWin.winH * scaleY)),
        density: maxMean,
      });
    }
  }

  // Sort boxes by density
  candidateBoxes.sort((a, b) => b.density - a.density);

  // Add primary salient box
  if (candidateBoxes.length > 0) {
    const primary = candidateBoxes[0];
    candidateRegions.push({
      name: "salient_primary_focus",
      left: primary.left,
      top: primary.top,
      width: primary.width,
      height: primary.height,
    });

    // Also add an expanded context box (1.4x padding)
    const padX = Math.round(primary.width * 0.2);
    const padY = Math.round(primary.height * 0.2);
    const expLeft = Math.max(0, primary.left - padX);
    const expTop = Math.max(0, primary.top - padY);
    const expWidth = Math.min(width - expLeft, primary.width + 2 * padX);
    const expHeight = Math.min(height - expTop, primary.height + 2 * padY);

    candidateRegions.push({
      name: "salient_primary_context",
      left: expLeft,
      top: expTop,
      width: expWidth,
      height: expHeight,
    });
  }

  // Add 1:1 Aspect ratio square center (robust for direct product photos & square Instagram posts)
  const minDim = Math.min(width, height);
  candidateRegions.push({
    name: "central_square",
    left: Math.round((width - minDim) / 2),
    top: Math.round((height - minDim) / 2),
    width: minDim,
    height: minDim,
  });

  // Extract Sharp buffers for each region
  const finalRegions = [];
  for (const reg of candidateRegions) {
    try {
      let buf;
      if (reg.left === 0 && reg.top === 0 && reg.width === width && reg.height === height) {
        buf = imageBuffer;
      } else {
        buf = await sharp(imageBuffer)
          .extract({
            left: Math.max(0, reg.left),
            top: Math.max(0, reg.top),
            width: Math.min(width - reg.left, reg.width),
            height: Math.min(height - reg.top, reg.height),
          })
          .toBuffer();
      }

      finalRegions.push({
        name: reg.name,
        left: reg.left,
        top: reg.top,
        width: reg.width,
        height: reg.height,
        buffer: buf,
      });
    } catch (err) {
      console.warn(`[SalientRegionError] Failed extracting ${reg.name}:`, err.message);
    }
  }

  return finalRegions;
}
