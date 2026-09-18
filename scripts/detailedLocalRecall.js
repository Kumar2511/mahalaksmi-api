import sharp from "sharp";
import fs from "fs";

const groundTruthDatasets = [
  {
    name: "Fairy Tiny Desktop Modal",
    filePath: "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945719909.png",
    groundTruth: { left: 330, top: 395, width: 62, height: 62 },
  },
  {
    name: "Customer Screenshot 2",
    filePath: "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945712892.png",
    groundTruth: { left: 330, top: 395, width: 62, height: 62 },
  },
  {
    name: "Customer Screenshot 3",
    filePath: "C:/Users/ELCOT/.gemini/antigravity/brain/d800a299-ef95-401e-a4a7-fed97897cea4/.user_uploaded/media_1788945723732.png",
    groundTruth: { left: 330, top: 395, width: 62, height: 62 },
  },
];

function computeIoU(b1, b2) {
  const x1 = Math.max(b1.left, b2.left);
  const y1 = Math.max(b1.top, b2.top);
  const x2 = Math.min(b1.left + b1.width, b2.left + b2.width);
  const y2 = Math.min(b1.top + b1.height, b2.top + b2.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  const unionArea = b1.width * b1.height + b2.width * b2.height - interArea;
  return unionArea === 0 ? 0 : interArea / unionArea;
}

function computeOverlap(candidate, target) {
  const x1 = Math.max(candidate.left, target.left);
  const y1 = Math.max(candidate.top, target.top);
  const x2 = Math.min(candidate.left + candidate.width, target.left + target.width);
  const y2 = Math.min(candidate.top + candidate.height, target.top + target.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  return interArea / (target.width * target.height);
}

async function getCandidates(imageBuffer, maxK = 20) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width;
  const height = meta.height;

  const sw = 160;
  const sh = Math.max(20, Math.round((height / width) * 160));
  const scaleX = width / sw;
  const scaleY = height / sh;

  const { data } = await sharp(imageBuffer)
    .resize(sw, sh, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = sw * sh;
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

  const scales = [
    { w: Math.round(sw * 0.10), h: Math.round(sw * 0.10), type: "tiny_thumb" },
    { w: Math.round(sw * 0.16), h: Math.round(sw * 0.16), type: "small_thumb" },
    { w: Math.round(sw * 0.28), h: Math.round(sw * 0.28), type: "medium_card" },
  ];

  const rawPool = [];
  for (const s of scales) {
    const winW = s.w;
    const winH = s.h;
    const step = Math.max(2, Math.floor(winW / 3));

    for (let y = 0; y <= sh - winH; y += step) {
      for (let x = 0; x <= sw - winW; x += step) {
        let satSum = 0, varSum = 0, bimodalSum = 0;
        const total = winW * winH;
        for (let wy = 0; wy < winH; wy++) {
          for (let wx = 0; wx < winW; wx++) {
            const idx = (y + wy) * sw + (x + wx);
            satSum += cellSat[idx];
            varSum += cellColorVar[idx];
            bimodalSum += cellBimodal[idx];
          }
        }
        const meanSat = satSum / total;
        const meanVar = varSum / total;
        const meanBimodal = bimodalSum / total;

        if (meanBimodal > 0.70) continue;
        if (meanSat < 0.08) continue;

        const photoScore = (meanVar * 0.1) * (1.0 + meanSat * 5.0) * (1.0 - meanBimodal * 0.9);
        const origX = Math.max(0, Math.round(x * scaleX));
        const origY = Math.max(0, Math.round(y * scaleY));
        const origW = Math.min(width - origX, Math.round(winW * scaleX));
        const origH = Math.min(height - origY, Math.round(winH * scaleY));

        rawPool.push({
          type: s.type,
          box: { left: origX, top: origY, width: origW, height: origH },
          photoScore,
        });
      }
    }
  }

  rawPool.sort((a, b) => b.photoScore - a.photoScore);

  const candidates = [
    { type: "full_image", box: { left: 0, top: 0, width, height } },
  ];

  for (const cand of rawPool) {
    let suppressed = false;
    for (const sel of candidates.slice(1)) {
      if (computeIoU(cand.box, sel.box) > 0.35) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) {
      candidates.push(cand);
      if (candidates.length >= maxK) break;
    }
  }

  return candidates;
}

async function run() {
  console.log("DETAILED LOCAL RECALL FOR LOCAL CROPS (EXCLUDING FULL IMAGE):");
  for (const ds of groundTruthDatasets) {
    const buf = fs.readFileSync(ds.filePath);
    const candidates = await getCandidates(buf, 20);

    // Filter to localized candidates (index >= 1)
    const localCands = candidates.slice(1);
    let bestLocalIoU = 0;
    let bestLocalOverlap = 0;
    let localFoundIdx = null;

    localCands.forEach((c, idx) => {
      const iou = computeIoU(c.box, ds.groundTruth);
      const overlap = computeOverlap(c.box, ds.groundTruth);
      if (iou > bestLocalIoU) bestLocalIoU = iou;
      if (overlap > bestLocalOverlap) bestLocalOverlap = overlap;
      if (overlap >= 0.70 && iou >= 0.15 && localFoundIdx === null) {
        localFoundIdx = idx + 2; // +1 for 1-based, +1 for full_image
      }
    });

    console.log(`${ds.name}:`);
    console.log(`  Local Candidates Total: ${localCands.length}`);
    console.log(`  Best Local IoU        : ${bestLocalIoU.toFixed(3)}`);
    console.log(`  Best Local Overlap    : ${(bestLocalOverlap * 100).toFixed(1)}%`);
    console.log(`  Local Candidate Found?: ${localFoundIdx ? `YES (Candidate #${localFoundIdx})` : "NO"}`);
  }
}

run();
