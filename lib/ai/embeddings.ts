import { ai } from "./gemini";

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set. Skipping embedding generation.");
      return [];
    }

    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: text.slice(0, 8000), // safe limit for single chunk
    });

    const res = response as any;
    return res.embedding?.values || res.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error("Error generating embedding:", error);
    return [];
  }
}

// Helper to compute cosine similarity between two numeric vectors in memory
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

