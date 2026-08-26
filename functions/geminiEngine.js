const { GoogleGenerativeAI } = require("@google/generative-ai");
const { SYSTEM_PROMPT } = require("./prompt");

/**
 * Strips markdown code fences, surrounding whitespace, and extracts the JSON body.
 */
function cleanJsonText(rawText) {
  if (!rawText) return "{}";
  let cleaned = rawText.trim();
  
  // Remove markdown code fences if present
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");
  
  // If text has preamble before the first { or trailing text after the last }, slice it
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

/**
 * Initializes and executes multimodal inference with active Google Search Grounding.
 * Uses the flagship production model: gemini-3.6-flash.
 */
async function analyzeImageWithGemini(apiKey, cleanBase64, mimeType, customPrompt) {
  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 4096
    },
    tools: [
      {
        googleSearch: {}
      }
    ]
  });

  const imagePart = {
    inlineData: {
      data: cleanBase64,
      mimeType: mimeType || "image/jpeg"
    }
  };

  const prompt = customPrompt || "Perform a full 411 scan and diagnostic analysis of this image.";
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const rawText = response.text();

  let parsedReport;
  try {
    const sanitized = cleanJsonText(rawText);
    parsedReport = JSON.parse(sanitized);
  } catch (parseError) {
    console.error("Failed to parse Gemini output text into JSON. Raw output:", rawText);
    throw new Error("Diagnostic engine produced unparseable output format.");
  }

  return parsedReport;
}

module.exports = {
  analyzeImageWithGemini
};