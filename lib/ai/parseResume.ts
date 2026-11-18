import { generateContentWithFallback } from "./gemini";

export interface ParsedResume {
  fullName?: string;
  targetRole?: string;
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

const COMMON_ROLE_PATTERNS = [
  /\b(?:Senior\s+|Lead\s+|Staff\s+|Principal\s+|Junior\s+|Associate\s+)?(?:Product\s+Operations|Product|Program|Project)\s+Manager\b/i,
  /\b(?:Senior\s+|Lead\s+|Staff\s+|Principal\s+|Junior\s+)?(?:Software|Frontend|Backend|Full[\s-]?Stack|Mobile|DevOps|Site\s+Reliability|Cloud|Systems|Data|AI|ML|Machine\s+Learning)\s+Engineer\b/i,
  /\b(?:Senior\s+|Lead\s+|Junior\s+)?(?:Software\s+Developer|Web\s+Developer|Mobile\s+Developer|Developer)\b/i,
  /\b(?:Senior\s+|Lead\s+)?(?:UI\/UX|Product|Graphic|Visual)\s+Designer\b/i,
  /\b(?:Senior\s+|Lead\s+)?(?:Data\s+Analyst|Business\s+Analyst|Financial\s+Analyst)\b/i,
  /\b(?:Operations|Country|General)\s+Manager\b/i,
  /\b(?:Marketing|Sales|Account|Growth)\s+(?:Manager|Executive|Director|Lead)\b/i,
  /\bScrum\s+Master\b/i,
];

const COMPREHENSIVE_SKILL_KEYWORDS = [
  // Product & Project Management
  "product management", "product operations", "agile", "scrum", "kanban", "roadmapping",
  "user stories", "prd", "stakeholder management", "sprint planning", "okrs", "product lifecycle",
  "feature prioritization", "a/b testing", "go-to-market", "gtm", "market research",
  // Fintech & Operations
  "fintech", "payments", "payment processing", "banking", "compliance", "regulatory compliance",
  "operations", "business development", "partnerships", "risk management", "fraud detection",
  // Engineering & Tech
  "typescript", "javascript", "python", "golang", "go", "java", "c#", "c++", "rust", "php", "ruby",
  "react", "next.js", "vue", "angular", "node.js", "express", "nestjs", "fastapi", "django",
  "sql", "postgresql", "mysql", "mongodb", "redis", "docker", "kubernetes", "aws", "gcp", "azure",
  "git", "ci/cd", "rest", "graphql", "api", "microservices", "terraform", "linux",
  // Design
  "ui/ux", "figma", "user research", "wireframing", "prototyping", "design systems", "interaction design",
  // Data & Analytics
  "analytics", "mixpanel", "amplitude", "tableau", "power bi", "google analytics", "excel", "data analysis"
];

export function extractHeuristicRole(rawText: string): string {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 15);
  for (const line of lines) {
    for (const pattern of COMMON_ROLE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
  }

  // Fallback check in full text
  for (const pattern of COMMON_ROLE_PATTERNS) {
    const match = rawText.match(pattern);
    if (match) return match[0].trim();
  }

  return "";
}

export function extractHeuristicSkills(rawText: string): string[] {
  const textLower = rawText.toLowerCase();
  const matched = new Set<string>();

  for (const kw of COMPREHENSIVE_SKILL_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
    const regex = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, "i");
    if (regex.test(textLower)) {
      matched.add(kw);
    }
  }

  return Array.from(matched);
}

export function extractHeuristicResume(rawText: string): ParsedResume {
  const targetRole = extractHeuristicRole(rawText);
  const skills = extractHeuristicSkills(rawText);

  // Extract candidate name if present on line 1 or 2
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  let fullName = "";
  if (lines.length > 0 && lines[0].length < 40 && !lines[0].toLowerCase().includes("resume")) {
    fullName = lines[0];
  }

  // Extract basic summary if present
  let summary = "";
  const summaryIdx = rawText.search(/SUMMARY|PROFILE|ABOUT ME/i);
  if (summaryIdx !== -1) {
    const afterSummary = rawText.slice(summaryIdx + 7).trim();
    const endIdx = afterSummary.search(/EXPERIENCE|WORK HISTORY|EMPLOYMENT|EDUCATION|SKILLS/i);
    summary = (endIdx !== -1 ? afterSummary.slice(0, endIdx) : afterSummary.slice(0, 450)).trim();
  } else {
    summary = rawText.slice(0, 400).trim();
  }

  return {
    fullName,
    targetRole,
    summary,
    coreSkills: skills.slice(0, 12),
    toolsAndFrameworks: skills.slice(12),
    experience: targetRole ? [{ company: "Previous Experience", role: targetRole }] : [],
  };
}

export async function parseResumeText(rawText: string): Promise<ParsedResume> {
  if (!process.env.GEMINI_API_KEY) {
    return extractHeuristicResume(rawText);
  }

  const prompt = `You are an expert technical recruiter and ATS parsing engine.
Extract and normalize the following resume text into a clean, structured JSON object.
CRITICAL: Accurately identify the candidate's primary targetRole or professional job title (e.g. "Product Operations Manager", "Senior Product Manager", "Fullstack Software Engineer", "UX Designer", "Marketing Manager", "DevOps Engineer").
Extract their coreSkills across their actual specialization (Product, Tech, Operations, Design, Marketing, etc.).
Do not hallucinate or add skills that are not explicitly supported by the text.

RESUME TEXT:
${rawText.slice(0, 15000)}
`;

  try {
    const response = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            targetRole: { type: "string" },
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
      preferredModel: "gemini-3.5-flash-lite",
    });

    const parsed = JSON.parse(response.text || "{}") as ParsedResume;
    if (!parsed.targetRole) {
      parsed.targetRole = extractHeuristicRole(rawText);
    }
    return parsed;
  } catch (err: any) {
    console.warn("[parseResume] Gemini parsing failed, using heuristic parser fallback:", err.message);
    return extractHeuristicResume(rawText);
  }
}

