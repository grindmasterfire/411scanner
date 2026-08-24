const { GoogleGenerativeAI } = require("@google/generative-ai");
const { SYSTEM_PROMPT } = require("./prompt");

/**
 * Initializes and executes multimodal inference with active Google Search Grounding.
 * Includes automatic escalation to gemini-3.6-flash if archetype_badge returns INSUFFICIENT_DATA.
 *
 * @param {string} apiKey Gemini API Key
 * @param {string} cleanBase64 Base64 image payload (without data URI header)
 * @param {string} mimeType Image MIME type (e.g. image/jpeg)
 * @param {string} [customPrompt] Optional user or system override prompt
 * @returns {Promise<object>} Parsed diagnostic JSON report
 */
async function analyzeImageWithGemini(apiKey, cleanBase64, mimeType, customPrompt) {
  const genAI = new GoogleGenerativeAI(apiKey);

  const modelConfig = {
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    },
    tools: [
      {
        googleSearch: {
          dynamicThreshold: 0.3
        }
      }
    ]
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash-lite",
    ...modelConfig
  });

  const imagePart = {
    inlineData: {
      data: cleanBase64,
      mimeType: mimeType
    }
  };

  const prompt = customPrompt || "Perform a full 411 scan and diagnostic analysis of this image.";
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const text = response.text();

  let parsedReport;
  try {
    parsedReport = JSON.parse(text);
  } catch (parseError) {
    parsedReport = {
      title: "Scan Diagnostic Output",
      category: "General",
      confidence: 0.85,
      summary: text,
      details: [],
      recommendations: [],
      sources: []
    };
  }

  // Escalation block: If archetype_badge is INSUFFICIENT_DATA, re-run with gemini-3.6-flash
  if (parsedReport?.technical_ledger?.network_telemetry?.archetype_badge === "INSUFFICIENT_DATA") {
    try {
      const escalationModel = genAI.getGenerativeModel({
        model: "gemini-3.6-flash",
        ...modelConfig
      });
      const escalatedResult = await escalationModel.generateContent([prompt, imagePart]);
      const escalatedResponse = await escalatedResult.response;
      const escalatedText = escalatedResponse.text();
      try {
        parsedReport = JSON.parse(escalatedText);
      } catch (escalatedParseErr) {
        console.warn("Escalated report parse error:", escalatedParseErr);
      }
    } catch (escalationErr) {
      console.warn("Escalation to gemini-3.6-flash failed, retaining initial report:", escalationErr);
    }
  }

  return parsedReport;
}

module.exports = {
  analyzeImageWithGemini
};
