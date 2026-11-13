import { ai } from "./gemini";
import { ParsedResume } from "./parseResume";

export interface GapAnalysisResult {
  matchScore: number;
  fitLevel: string;
  summaryReasoning: string;
  strengths: string[];
  missingCriticalSkills: string[];
  missingNiceToHaves: string[];
  tailoredSuggestions: {
    summaryTweak: string;
    suggestedBulletEdits: Array<{
      originalBullet: string;
      improvedBullet: string;
    }>;
    keywordsToIntegrate: string[];
  };
}

export async function analyzeResumeJobGap(
  job: { title: string; company: string; description: string },
  resume: ParsedResume
): Promise<GapAnalysisResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = `You are an elite Technical Hiring Manager and Career Strategist.
Compare this candidate's resume with the job requirements and compute an objective match evaluation along with concrete, high-impact resume improvements.

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Description:
${job.description.slice(0, 8000)}

CANDIDATE RESUME PROFILE:
Summary: ${resume.summary || "N/A"}
Skills: ${(resume.coreSkills || []).concat(resume.toolsAndFrameworks || []).join(", ")}
Experience:
${(resume.experience || [])
  .map(
    (e) =>
      `- ${e.role} at ${e.company} (${e.startDate || ""} - ${e.endDate || ""}):\n  ` +
      (e.highlights || []).join("\n  ")
  )
  .join("\n")}

EVALUATION GOALS:
1. Calculate a realistic match score from 0 to 100 based on actual skill and experience overlap.
2. Identify specific technical/domain strengths that directly align with the role.
3. Call out missing critical skills that are mandatory for the role.
4. Call out missing nice-to-have or bonus skills.
5. Provide actionable, high-quality resume improvements:
   - summaryTweak: A tailored 2-3 sentence summary rewritten specifically for this role.
   - suggestedBulletEdits: 1-3 concrete bullet points from the candidate's existing experience rewritten with stronger metrics and relevant keywords for this job.
   - keywordsToIntegrate: 3-6 exact keyword phrases that an ATS scanner or hiring team will search for.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          matchScore: { type: "number" },
          fitLevel: { type: "string" },
          summaryReasoning: { type: "string" },
          strengths: {
            type: "array",
            items: { type: "string" },
          },
          missingCriticalSkills: {
            type: "array",
            items: { type: "string" },
          },
          missingNiceToHaves: {
            type: "array",
            items: { type: "string" },
          },
          tailoredSuggestions: {
            type: "object",
            properties: {
              summaryTweak: { type: "string" },
              suggestedBulletEdits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    originalBullet: { type: "string" },
                    improvedBullet: { type: "string" },
                  },
                  required: ["originalBullet", "improvedBullet"],
                },
              },
              keywordsToIntegrate: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "summaryTweak",
              "suggestedBulletEdits",
              "keywordsToIntegrate",
            ],
          },
        },
        required: [
          "matchScore",
          "fitLevel",
          "summaryReasoning",
          "strengths",
          "missingCriticalSkills",
          "missingNiceToHaves",
          "tailoredSuggestions",
        ],
      },
    },
  });

  const text = response.text || "{}";
  return JSON.parse(text) as GapAnalysisResult;
}
