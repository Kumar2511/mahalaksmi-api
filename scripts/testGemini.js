import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is missing from .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
});

try {
  console.log("");
  console.log("==========================================");
  console.log(" Gemini API Test");
  console.log("==========================================");
  console.log("");

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents:
      "Reply with exactly: Gemini API connection successful",
  });

  console.log("Gemini response:");
  console.log(response.text);

  console.log("");
  console.log("✅ Gemini API connection successful");
  console.log("");
} catch (error) {
  console.error("");
  console.error("❌ Gemini API test failed");
  console.error(error);
}