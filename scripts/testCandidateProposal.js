import sharp from "sharp";
import fs from "fs";

const screenshotPath = "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png";
const groundTruth = { left: 330, top: 395, width: 62, height: 62 };

function computeIoU(b1, b2) {
  const x1 = Math.max(b1.left, b2.left);
  const y1 = Math.max(b1.top, b2.top);
  const x2 = Math.min(b1.left + b1.width, b2.left + b2.width);
  const y2 = Math.min(b1.top + b1.height, b2.top + b2.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  const area1 = b1.width * b1.height;
  const area2 = b2.width * b2.height;
  const unionArea = area1 + area2 - interArea;

  return unionArea === 0 ? 0 : interArea / unionArea;
}

function computeOverlap(candidate, target) {
  // Fraction of target covered by candidate
  const x1 = Math.max(candidate.left, target.left);
  const y1 = Math.max(candidate.top, target.top);
  const x2 = Math.min(candidate.left + candidate.width, target.left + target.width);
  const y2 = Math.min(candidate.top + candidate.height, target.top + target.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const targetArea = target.width * target.height;

  return targetArea === 0 ? 0 : interArea / targetArea;
}

async function proposeImageLikeCandidates(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;

  // Downsample to analysis grid
  const sw = 160;
  const sh = Math.max(20, Math.round((height / width) * 160));
  const scaleX = width / sw;
  const scaleY = height / sh;

  const { data } = await sharp(imageBuffer)
    .resize(sw, sh, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = sw * sh;

  // Calculate cell-level metrics on the downsampled grid
  const cellColorVar = new Float32Array(pixelCount);
  const cellSat = new Float32Array(pixelCount);
  const cellBimodal = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    cellSat[i] = max === 0 ? 0 : (max - min) / max;

    const mean = (r + g + b) / 3;
    cellColorVar[i] = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    cellBimodal[i] = (lum < 30 || lum > 225) ? 1.0 : 0.0;
  }

  // Multi-scale sliding window definitions:
  // Scale 1: Small thumbnail (~12-16% of width: e.g. 70-100px in 1024w)
  // Scale 2: Medium card (~25-30% of width: e.g. 180-220px in 1024w)
  // Scale 3: Large modal/viewport (~45-55% of width: e.g. 350-450px in 1024w)
  const windowScales = [
    { w: Math.round(sw * 0.12), h: Math.round(sw * 0.12), name: "small_thumbnail", minScore: 2.0 },
    { w: Math.round(sw * 0.16), h: Math.round(sw * 0.16), name: "medium_thumbnail", minScore: 2.5 },
    { w: Math.round(sw * 0.28), h: Math.round(sw * 0.28), name: "medium_card", minScore: 3.0 },
    { w: Math.round(sw * 0.45), h: Math.round(sw * 0.45), name: "large_card", minScore: 3.5 },
  ];

  const rawCandidates = [];

  for (const wdef of windowScales) {
    const winW = wdef.w;
    const winH = wdef.h;
    const step = Math.max(2, Math.floor(winW / 4));

    for (let y = 0; y <= sh - winH; y += step) {
      for (let x = 0; x <= sw - winW; x += step) {
        let satSum = 0;
        let colorVarSum = 0;
        let bimodalSum = 0;
        const total = winW * winH;

        for (let wy = 0; wy < winH; wy++) {
          for (let wx = 0; wx < winW; wx++) {
            const idx = (y + wy) * sw + (x + wx);
            satSum += cellSat[idx];
            colorVarSum += cellColorVar[idx];
            bimodalSum += cellBimodal[idx];
          }
        }

        const meanSat = satSum / total;
        const meanColorVar = colorVarSum / total;
        const meanBimodal = bimodalSum / total;

        // Photographic Score:
        // High saturation + color variance, penalized by extreme bimodal (text/borders)
        if (meanBimodal > 0.75) continue; // Exclude text & high-contrast UI borders
        if (meanSat < 0.05) continue; // Exclude grayscale UI/text

        const photoScore = (meanColorVar * 0.1) * (1.0 + meanSat * 5.0) * (1.0 - meanBimodal * 0.8);

        if (photoScore > wdef.minScore) {
          const origX = Math.max(0, Math.round(x * scaleX));
          const origY = Math.max(0, Math.round(y * scaleY));
          const origW = Math.min(width - origX, Math.round(winW * scaleX));
          const origH = Math.min(height - origY, Math.round(winH * scaleY));

          rawCandidates.push({
            scaleName: wdef.name,
            box: { left: origX, top: origY, width: origW, height: origH },
            photoScore,
            meanSat: Number(meanSat.toFixed(3)),
            meanBimodal: Number(meanBimodal.toFixed(3)),
          });
        }
      }
    }
  }

  // Sort by photoScore descending
  rawCandidates.sort((a, b) => b.photoScore - a.photoScore);

  // Non-Maximum Suppression (NMS) to keep top diverse candidates
  const selectedCandidates = [];
  for (const cand of rawCandidates) {
    let tooClose = false;
    for (const sel of selectedCandidates) {
      const iou = computeIoU(cand.box, sel.box);
      if (iou > 0.35) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selectedCandidates.push(cand);
      if (selectedCandidates.length >= 6) break;
    }
  }

  return selectedCandidates;
}

async function run() {
  const buf = fs.readFileSync(screenshotPath);
  const candidates = await proposeImageLikeCandidates(buf);

  console.log(`Generated ${candidates.length} principled candidate regions:`);
  console.log("Ground Truth Target Box:", groundTruth);
  console.log("------------------------------------------------------------------");

  candidates.forEach((c, idx) => {
    const iou = computeIoU(c.box, groundTruth);
    const overlap = computeOverlap(c.box, groundTruth);
    const centerTargetX = groundTruth.left + groundTruth.width / 2;
    const centerTargetY = groundTruth.top + groundTruth.height / 2;
    const centerCandX = c.box.left + c.box.width / 2;
    const centerCandY = c.box.top + c.box.height / 2;
    const dist = Math.sqrt((centerCandX - centerTargetX) ** 2 + (centerCandY - centerTargetY) ** 2);

    console.log(`Candidate #${idx + 1} [${c.scaleName}]:`);
    console.log(`  Box          : left=${c.box.left}, top=${c.box.top}, width=${c.box.width}, height=${c.box.height}`);
    console.log(`  Photo Score  : ${c.photoScore.toFixed(2)} (Sat: ${c.meanSat}, Bimodal: ${c.meanBimodal})`);
    console.log(`  Target IoU   : ${iou.toFixed(3)} | Target Overlap: ${(overlap * 100).toFixed(1)}%`);
    console.log(`  Center Dist  : ${dist.toFixed(1)} px`);
    console.log(`  Contains Prod: ${overlap >= 0.75 ? "YES" : "NO"}`);
    console.log("");
  });
}

run().catch(console.error);
