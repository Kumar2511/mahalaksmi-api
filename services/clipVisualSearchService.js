import { pipeline, RawImage } from "@huggingface/transformers";
import fs from "fs";

const MODEL_TASK = "image-feature-extraction";
const MODEL_NAME = "Xenova/clip-vit-base-patch32";
const EXPECTED_DIMENSION = 512;

let pipelineInstance = null;
let pipelinePromise = null;

export async function getClipPipeline() {
  if (pipelineInstance) {
    return pipelineInstance;
  }
  if (!pipelinePromise) {
    console.log(`[CLIP-Service] Initializing ${MODEL_NAME}...`);
    pipelinePromise = pipeline(MODEL_TASK, MODEL_NAME)
      .then((instance) => {
        pipelineInstance = instance;
        console.log(`[CLIP-Service] Pipeline ready.`);
        return pipelineInstance;
      })
      .catch((err) => {
        pipelinePromise = null;
        console.error(`[CLIP-Service] Pipeline initialization failed:`, err);
        throw err;
      });
  }
  return pipelinePromise;
}

export async function extractEmbeddingFromBuffer(buffer) {
  const extractor = await getClipPipeline();
  const blob = new Blob([buffer]);
  const rawImage = await RawImage.fromBlob(blob);
  const rawOutput = await extractor(rawImage);

  let embeddingArray;
  if (rawOutput && rawOutput.ort_tensor && rawOutput.ort_tensor.cpuData) {
    embeddingArray = Array.from(rawOutput.ort_tensor.cpuData);
  } else if (rawOutput && rawOutput.data) {
    embeddingArray = Array.from(rawOutput.data);
  } else if (rawOutput instanceof Float32Array || Array.isArray(rawOutput)) {
    embeddingArray = Array.from(rawOutput);
  } else if (rawOutput && typeof rawOutput.tolist === "function") {
    embeddingArray = rawOutput.tolist();
    if (Array.isArray(embeddingArray[0])) embeddingArray = embeddingArray[0];
  } else {
    throw new Error(`Unrecognized pipeline output format: ${typeof rawOutput}`);
  }

  if (embeddingArray.length !== EXPECTED_DIMENSION) {
    throw new Error(`Embedding dimension mismatch: expected ${EXPECTED_DIMENSION}, got ${embeddingArray.length}`);
  }

  for (let i = 0; i < embeddingArray.length; i++) {
    const v = embeddingArray[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`Embedding value at index ${i} is non-finite: ${v}`);
    }
  }

  return embeddingArray;
}

export function computeCosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
    return 0;
  }
  if (vecA.length !== EXPECTED_DIMENSION || vecB.length !== EXPECTED_DIMENSION) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < EXPECTED_DIMENSION; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Number.isFinite(similarity) ? similarity : 0;
}
