import { ai } from "./gemini";
import { ParsedResume } from "./parseResume";

export interface InterviewPrepResult {
  behavioralQuestions: Array<{
    question: string;
    whyAsked: string;
    answerFramework: string;
  }>;
  technicalQuestions: Array<{
    question: string;
    topic: string;
    difficulty: string;
    hints: string;
  }>;
  systemDesignTopics: Array<{
    scenario: string;
    keyConsiderations: string;
    relevanceToRole: string;
  }>;
  preparationTips: string[];
  practiceAreas: Array<{
    area: string;
    priority: string;
    resources: string;
  }>;
}

export async function generateInterviewPrep(
  job: { title: string; company: string; description: string },
  resume: ParsedResume
): Promise<InterviewPrepResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const experienceText = (resume.experience || [])
    .map(
      (e) =>
        `- ${e.role} at ${e.company} (${e.startDate || ""} - ${e.endDate || ""}):\n  ` +
        (e.highlights || []).join("\n  ")
    )
    .join("\n");

  const prompt = `You are a Senior Technical Interview Coach with deep knowledge of how top companies interview candidates.
Based on the job description and the candidate's resume, generate a comprehensive, personalized interview preparation guide.

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Description:
${job.description.slice(0, 8000)}

CANDIDATE RESUME PROFILE:
Summary: ${resume.summary || "N/A"}
Skills: ${(resume.coreSkills || []).concat(resume.toolsAndFrameworks || []).join(", ")}
Experience:
${experienceText}

GENERATION GOALS:
1. **Behavioral Questions** (5-7): Likely situational/behavioral questions the interviewer will ask for THIS specific role at THIS company. Include why it's asked and a STAR-method answer framework the candidate can personalize with their experience.
2. **Technical Questions** (5-8): Role-specific technical questions covering the tech stack mentioned in the job description. Include topic area, difficulty level (Easy/Medium/Hard), and hints for approaching each question.
3. **System Design Topics** (2-4): System design scenarios relevant to the company's domain and the role's responsibilities. Include key considerations and why this topic is relevant.
4. **Preparation Tips** (5-7): Actionable, specific tips for this candidate to prepare, focusing on gaps between their resume and the job requirements.
5. **Practice Areas** (4-6): Specific technical areas, tools, or concepts the candidate should practice before the interview. Include priority level (Critical/High/Medium) and recommended free resources or approaches to practice.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          behavioralQuestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                whyAsked: { type: "string" },
                answerFramework: { type: "string" },
              },
              required: ["question", "whyAsked", "answerFramework"],
            },
          },
          technicalQuestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                topic: { type: "string" },
                difficulty: { type: "string" },
                hints: { type: "string" },
              },
              required: ["question", "topic", "difficulty", "hints"],
            },
          },
          systemDesignTopics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                scenario: { type: "string" },
                keyConsiderations: { type: "string" },
                relevanceToRole: { type: "string" },
              },
              required: ["scenario", "keyConsiderations", "relevanceToRole"],
            },
          },
          preparationTips: {
            type: "array",
            items: { type: "string" },
          },
          practiceAreas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                area: { type: "string" },
                priority: { type: "string" },
                resources: { type: "string" },
              },
              required: ["area", "priority", "resources"],
            },
          },
        },
        required: [
          "behavioralQuestions",
          "technicalQuestions",
          "systemDesignTopics",
          "preparationTips",
          "practiceAreas",
        ],
      },
    },
  });

  const text = response.text || "{}";
  return JSON.parse(text) as InterviewPrepResult;
}

