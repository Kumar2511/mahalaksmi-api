import sharp from "sharp";
import fs from "fs";

const screenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";

async function analyzeBox(imageBuffer, name, box) {
  const cropBuf = await sharp(imageBuffer)
    .extract(box)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cropBuf;
  const pixelCount = info.width * info.height;
  const channels = info.channels;

  // 1. Channel means & variances
  let sumR = 0, sumG = 0, sumB = 0;
  let sumSqR = 0, sumSqG = 0, sumSqB = 0;

  // 2. Grayscale & Saturation
  let satSum = 0, satSqSum = 0;
  let grayData = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];

    sumR += r; sumG += g; sumB += b;
    sumSqR += r * r; sumSqG += g * g; sumSqB += b * b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    satSum += sat;
    satSqSum += sat * sat;

    grayData[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const varR = sumSqR / pixelCount - meanR * meanR;
  const varG = sumSqG / pixelCount - meanG * meanG;
  const varB = sumSqB / pixelCount - meanB * meanB;
  const colorVariance = (varR + varG + varB) / 3;

  const meanSat = satSum / pixelCount;
  const varSat = satSqSum / pixelCount - meanSat * meanSat;

  // 3. Edge density via Sobel gradient
  const w = info.width;
  const h = info.height;
  let edgeSum = 0;
  let edgeCount = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = grayData[idx + 1] - grayData[idx - 1];
      const gy = grayData[idx + w] - grayData[idx - w];
      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeSum += mag;
      if (mag > 30) edgeCount++;
    }
  }

  const innerPixels = Math.max(1, (w - 2) * (h - 2));
  const meanEdgeMag = edgeSum / innerPixels;
  const edgeDensity = edgeCount / innerPixels;

  // 4. Binarization / Contrast measure (fraction of pixels very close to dark or light extremes)
  let extremeCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    const lum = grayData[i];
    if (lum < 35 || lum > 220) extremeCount++;
  }
  const bimodalExtremeRatio = extremeCount / pixelCount;

  // 5. Unique Color Quantization (measuring color richness)
  const uniqueQuantizedColors = new Set();
  for (let i = 0; i < pixelCount; i++) {
    const rq = Math.floor(data[i * channels] / 16);
    const gq = Math.floor(data[i * channels + 1] / 16);
    const bq = Math.floor(data[i * channels + 2] / 16);
    uniqueQuantizedColors.add((rq << 8) | (gq << 4) | bq);
  }
  const colorRichness = uniqueQuantizedColors.size / Math.min(256, pixelCount);

  return {
    name,
    box,
    aspectRatio: Number((info.width / info.height).toFixed(2)),
    colorVariance: Math.round(colorVariance),
    meanSat: Number(meanSat.toFixed(3)),
    varSat: Number(varSat.toFixed(4)),
    meanEdgeMag: Number(meanEdgeMag.toFixed(2)),
    edgeDensity: Number((edgeDensity * 100).toFixed(1)) + "%",
    bimodalExtremeRatio: Number((bimodalExtremeRatio * 100).toFixed(1)) + "%",
    uniqueColorCount: uniqueQuantizedColors.size,
    colorRichness: Number(colorRichness.toFixed(3)),
  };
}

async function run() {
  const buf = fs.readFileSync(screenshotPath);
  const meta = await sharp(buf).metadata();
  console.log(`Image: ${screenshotPath} (${meta.width}x${meta.height})`);

  const regionsToTest = [
    { name: "Ground Truth Product (Fairy)", box: { left: 330, top: 395, width: 62, height: 62 } },
    { name: "UI Text (Product Title / Description)", box: { left: 405, top: 390, width: 200, height: 40 } },
    { name: "Modal Header / Title Bar", box: { left: 320, top: 290, width: 350, height: 40 } },
    { name: "Close Button (X icon)", box: { left: 670, top: 295, width: 30, height: 30 } },
    { name: "Flat Background (Dark Overlay)", box: { left: 100, top: 100, width: 100, height: 100 } },
    { name: "Modal White Card Panel", box: { left: 330, top: 480, width: 150, height: 50 } },
  ];

  const results = [];
  for (const r of regionsToTest) {
    const res = await analyzeBox(buf, r.name, r.box);
    results.push(res);
  }

  console.table(results);
}

run().catch(console.error);
