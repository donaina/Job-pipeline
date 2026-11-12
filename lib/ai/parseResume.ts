import { ai } from "./gemini";

export interface ParsedResume {
  fullName?: string;
  email?: string;
  phone?: string;
  links?: { linkedin?: string; github?: string; portfolio?: string };
  summary?: string;
  coreSkills?: string[];
  toolsAndFrameworks?: string[];
  yearsOfExperience?: number;
  experience?: Array<{
    company: string;
    role: string;
    startDate?: string;
    endDate?: string;
    highlights?: string[];
  }>;
  education?: Array<{
    institution: string;
    degree?: string;
    year?: string;
  }>;
}

export async function parseResumeText(rawText: string): Promise<ParsedResume> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `You are an expert technical recruiter and ATS parsing engine.
Extract and normalize the following resume text into a clean, structured JSON object according to the schema provided.
Do not hallucinate or add skills that are not explicitly supported by the text.

RESUME TEXT:
${rawText.slice(0, 15000)}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          fullName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          links: {
            type: "object",
            properties: {
              linkedin: { type: "string" },
              github: { type: "string" },
              portfolio: { type: "string" },
            },
          },
          summary: { type: "string" },
          coreSkills: {
            type: "array",
            items: { type: "string" },
          },
          toolsAndFrameworks: {
            type: "array",
            items: { type: "string" },
          },
          yearsOfExperience: { type: "number" },
          experience: {
            type: "array",
            items: {
              type: "object",
              properties: {
                company: { type: "string" },
                role: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                highlights: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["company", "role"],
            },
          },
          education: {
            type: "array",
            items: {
              type: "object",
              properties: {
                institution: { type: "string" },
                degree: { type: "string" },
                year: { type: "string" },
              },
              required: ["institution"],
            },
          },
        },
      },
    },
  });

  const text = response.text || "{}";
  return JSON.parse(text) as ParsedResume;
}
