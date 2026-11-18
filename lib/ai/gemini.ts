import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";

export const ai = new GoogleGenAI({ apiKey });

export const RECOMMENDED_GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
];

export async function generateContentWithFallback(params: {
  contents: string;
  config?: any;
  preferredModel?: string;
  maxRetries?: number;
}): Promise<any> {
  const models = params.preferredModel
    ? [params.preferredModel, ...RECOMMENDED_GEMINI_MODELS.filter((m) => m !== params.preferredModel)]
    : RECOMMENDED_GEMINI_MODELS;

  let lastError: any = null;

  for (const model of models) {
    let attempts = 0;
    const maxAttempts = params.maxRetries ?? 2;

    while (attempts < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        attempts++;
        const status = err.status || err.code;
        // If 503 (high demand) or 429 (rate limit), pause briefly then retry
        if (status === 503 || status === 429) {
          await new Promise((r) => setTimeout(r, 600 * attempts));
        } else {
          // If 404 or other model error, move to next model immediately
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Gemini models failed to generate content.");
}


