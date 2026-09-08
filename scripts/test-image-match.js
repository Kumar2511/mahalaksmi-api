import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import axios from "axios";
import Product from "../models/Product.js";
import { computeMultiCropHashes, minHammingDistance } from "../utils/imageHash.js";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/mahalaksmi";

async function getHashesForImage(imgUrl) {
  if (!imgUrl) return [];
  try {
    let input = null;
    if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
      const resp = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 8000 });
      input = Buffer.from(resp.data);
    } else {
      const cleanPath = imgUrl.startsWith("/") ? imgUrl.slice(1) : imgUrl;
      const backendUploadsPath = path.resolve(process.cwd(), cleanPath);
      const frontendPublicPath = path.resolve(process.cwd(), "../mahalaksmi/public", cleanPath);

      if (fs.existsSync(backendUploadsPath)) {
        input = backendUploadsPath;
      } else if (fs.existsSync(frontendPublicPath)) {
        input = frontendPublicPath;
      }
    }

    if (input) {
      return await computeMultiCropHashes(input);
    }
  } catch (err) {
    console.error(`Failed to hash ${imgUrl}:`, err.message);
  }
  return [];
}

async function runDiagnostic() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB Atlas!");

    const products = await Product.find().lean();
    console.log(`Total DB products: ${products.length}\n`);

    // Pick a sample product that has an existing image file
    let sampleProduct = null;
    let targetHashes = [];
    let targetUrl = "";

    for (const p of products) {
      const imgs = [...(p.images || []), p.image].filter(Boolean);
      for (const imgUrl of imgs) {
        const h = await getHashesForImage(imgUrl);
        if (h.length > 0) {
          sampleProduct = p;
          targetHashes = h;
          targetUrl = imgUrl;
          break;
        }
      }
      if (sampleProduct) break;
    }

    if (!sampleProduct) {
      console.log("No resolvable product images found!");
      return;
    }

    console.log(`TEST TARGET PRODUCT:`);
    console.log(`ID: ${sampleProduct._id}`);
    console.log(`Name: ${sampleProduct.name}`);
    console.log(`Category: ${sampleProduct.category}`);
    console.log(`Image URL: ${targetUrl}`);
    console.log(`Target Hashes (${targetHashes.length}):`, targetHashes, "\n");

    console.log("--- RUNNING COMPARISON AGAINST ALL PRODUCTS ---");

    for (const p of products.slice(0, 15)) {
      const pImgs = [...(p.images || []), p.image].filter(Boolean);
      let minDist = 64;

      for (const imgUrl of pImgs) {
        const candidateHashes = await getHashesForImage(imgUrl);
        if (candidateHashes.length > 0) {
          const dist = minHammingDistance(targetHashes, candidateHashes);
          if (dist < minDist) {
            minDist = dist;
          }
        }
      }

      console.log(`Product: "${p.name.slice(0, 45)}" (ID: ${p._id}) -> Min Hamming Distance: ${minDist}`);
    }

  } catch (err) {
    console.error("Diagnostic Error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runDiagnostic();
