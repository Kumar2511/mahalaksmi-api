import sharp from "sharp";
import fs from "fs";

const screenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";

async function inspectEdges() {
  const meta = await sharp(screenshotPath).metadata();
  const width = meta.width;
  const height = meta.height;

  // Use canny/sobel approximation via horizontal + vertical gradients
  const { data, info } = await sharp(screenshotPath)
    .greyscale()
    .resize(160, 90, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sw = info.width;
  const sh = info.height;
  const energy = new Float32Array(sw * sh);

  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;
      const gx = data[idx + 1] - data[idx - 1];
      const gy = data[idx + sw] - data[idx - sw];
      energy[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Find candidate windows of size ~ 30x30 in 160x90 grid (approx 190x190 in original)
  const winW = 20, winH = 20;
  const windowScores = [];

  for (let y = 0; y <= sh - winH; y += 4) {
    for (let x = 0; x <= sw - winW; x += 4) {
      let sum = 0;
      let varSum = 0;
      let count = winW * winH;
      for (let wy = 0; wy < winH; wy++) {
        for (let wx = 0; wx < winW; wx++) {
          sum += energy[(y + wy) * sw + (x + wx)];
        }
      }
      const mean = sum / count;
      windowScores.push({
        x,
        y,
        origX: Math.round((x / sw) * width),
        origY: Math.round((y / sh) * height),
        origW: Math.round((winW / sw) * width),
        origH: Math.round((winH / sh) * height),
        meanEnergy: mean,
      });
    }
  }

  windowScores.sort((a, b) => b.meanEnergy - a.meanEnergy);
  console.log("Top 5 energy candidate windows:");
  windowScores.slice(0, 5).forEach((w, i) => {
    console.log(`#${i + 1}: box [left=${w.origX}, top=${w.origY}, width=${w.origW}, height=${w.origH}] energy=${w.meanEnergy.toFixed(2)}`);
  });
}
inspectEdges();
