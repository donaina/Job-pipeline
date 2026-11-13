import { db } from "@/lib/db";
import { jobMatches, jobs, resumes } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { parseResumeText } from "@/lib/ai/parseResume";
import { generateEmbedding } from "@/lib/ai/embeddings";

const KNOWN_TECH_KEYWORDS = [
  "typescript", "javascript", "python", "go", "golang", "java", "kotlin", "swift",
  "rust", "c#", "c++", "sql", "postgresql", "mysql", "mongodb", "redis", "react",
  "next.js", "vue", "angular", "node.js", "node", "express", "nestjs", "fastify",
  "django", "flask", "fastapi", "spring", "docker", "kubernetes", "aws", "gcp",
  "azure", "linux", "vps", "git", "github actions", "terraform", "graphql", "rest",
  "microservices", "tailwind", "prisma", "rabbitmq", "bullmq", "kafka", "supabase",
  "traefik", "fineract", "nip", "nibss", "paystack", "flutterwave", "tdd", "ci/cd",
  "fintech", "payments", "ledger", "banking", "api"
];

function extractFallbackSkills(rawText: string): string[] {
  const textLower = rawText.toLowerCase();
  const found: string[] = [];
  for (const kw of KNOWN_TECH_KEYWORDS) {
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      if (regex.test(textLower)) found.push(kw);
    } else {
      if (textLower.includes(kw)) found.push(kw);
    }
  }
  return found;
}

function computeJobScore(
  job: { title: string; description: string; tags?: string[] | null },
  resume: { label?: string; skills: string[]; roles: string[] }
): number {
  const jobTitle = (job.title || "").toLowerCase();
  const jobDesc = (job.description || "").toLowerCase();
  const jobContent = `${jobTitle} ${jobDesc}`;

  let score = 40; // baseline

  // 1. Role Title Alignment (up to 32 points)
  const candidateRoles = [
    ...(resume.roles || []),
    resume.label || "",
    "Software Engineer",
    "Developer",
  ].filter(Boolean);

  let titleMatched = false;
  for (const role of candidateRoles) {
    const rLower = role.toLowerCase();
    if (rLower.length > 3 && (jobTitle.includes(rLower) || rLower.includes(jobTitle))) {
      score += 28;
      titleMatched = true;
      break;
    }
  }

  if (!titleMatched) {
    const roleTokens = candidateRoles
      .flatMap((r) => r.toLowerCase().split(/[\s,/-]+/))
      .filter((w) => w.length > 3 && !["with", "from", "that"].includes(w));

    let overlap = 0;
    for (const token of roleTokens) {
      if (jobTitle.includes(token)) overlap++;
    }
    if (overlap >= 2) score += 22;
    else if (overlap === 1) score += 12;
  }

  // 2. Tech Stack & Skills Overlap (up to 40 points)
  let skillHits = 0;
  for (const skill of resume.skills) {
    const sLower = skill.toLowerCase();
    if (sLower.length <= 3) {
      const regex = new RegExp(`\\b${sLower}\\b`, "i");
      if (regex.test(jobContent)) skillHits++;
    } else {
      if (jobContent.includes(sLower)) skillHits++;
    }
  }

  if (skillHits >= 5) score += 38;
  else if (skillHits === 4) score += 32;
  else if (skillHits === 3) score += 25;
  else if (skillHits === 2) score += 18;
  else if (skillHits === 1) score += 10;

  // 3. Seniority & Leadership Alignment (up to 8 points)
  const isSeniorJob =
    jobTitle.includes("senior") ||
    jobTitle.includes("lead") ||
    jobTitle.includes("staff") ||
    jobTitle.includes("principal");
  const isSeniorResume = candidateRoles.some(
    (r) =>
      r.toLowerCase().includes("lead") ||
      r.toLowerCase().includes("senior") ||
      r.toLowerCase().includes("principal")
  );
  if (isSeniorJob && isSeniorResume) {
    score += 8;
  }

  // 4. Domain / Industry Alignment (Payments, Fintech, Banking, APIs) (up to 10 points)
  const domainKeywords = [
    "payments", "fintech", "banking", "api", "microservices", "transaction", "ledger"
  ];
  for (const dk of domainKeywords) {
    if (jobContent.includes(dk) && resume.skills.some((s) => s.toLowerCase().includes(dk))) {
      score += 6;
      break;
    }
  }

  // 5. Irrelevant Role Penalty
  const irrelevantTitles = [
    "marketing", "sales representative", "content writer", "copywriter",
    "graphic designer", "ui/ux designer", "recruiter", "accountant",
    "legal", "customer support", "data entry"
  ];
  for (const it of irrelevantTitles) {
    if (jobTitle.includes(it)) {
      score -= 30;
      break;
    }
  }

  return Math.min(96, Math.max(35, Math.round(score)));
}

export async function matchJobsForUser(userId: string, candidatePoolLimit: number = 500) {
  // 1. Fetch user's resumes
  const userResumes = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId));

  if (userResumes.length === 0) {
    return { matched: 0, message: "No resumes found for user." };
  }

  // Self-heal: ensure parsedData and skills exist on resumes
  for (const res of userResumes) {
    let parsed = res.parsedData as any;
    let needsUpdate = false;

    if (!parsed?.coreSkills || parsed.coreSkills.length === 0) {
      if (res.rawText) {
        try {
          console.log(`[matcher] Re-parsing resume slot ${res.slotNumber} with gemini-3.5-flash...`);
          const aiParsed = await parseResumeText(res.rawText);
          if (aiParsed.coreSkills && aiParsed.coreSkills.length > 0) {
            parsed = aiParsed;
            needsUpdate = true;
          }
        } catch (e: any) {
          console.warn("[matcher] AI re-parse failed, using keyword extractor fallback:", e.message);
        }

        if (!needsUpdate) {
          const fallbackSkills = extractFallbackSkills(res.rawText);
          parsed = {
            ...parsed,
            coreSkills: fallbackSkills.slice(0, 10),
            toolsAndFrameworks: fallbackSkills.slice(10),
          };
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      const embeddingText = `${res.label}\n${parsed.summary || ""}\n${(parsed.coreSkills || []).join(", ")}`;
      const emb = await generateEmbedding(embeddingText);

      await db
        .update(resumes)
        .set({
          parsedData: parsed,
          embedding: emb.length ? emb : null,
          updatedAt: new Date(),
        })
        .where(eq(resumes.id, res.id));

      res.parsedData = parsed;
      res.embedding = emb.length ? emb : null;
    }
  }

  // 2. Fetch a healthy candidate pool of recent jobs
  const candidateJobs = await db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(candidatePoolLimit);

  if (candidateJobs.length === 0) {
    return { matched: 0, message: "No jobs available in database." };
  }

  // 3. Score all jobs against user resumes
  const scoredJobs: Array<{
    job: typeof candidateJobs[0];
    bestResume: typeof userResumes[0];
    score: number;
  }> = [];

  for (const job of candidateJobs) {
    let bestResume = userResumes[0];
    let highestScore = 35;

    for (const res of userResumes) {
      const parsed = res.parsedData as any;
      const skills: string[] = [
        ...(parsed?.coreSkills || []),
        ...(parsed?.toolsAndFrameworks || []),
      ];
      const roles: string[] = [
        res.label || "",
        ...(parsed?.experience?.map((e: any) => e.role) || []),
      ];

      const score = computeJobScore(job, {
        label: res.label,
        skills,
        roles,
      });

      if (score > highestScore) {
        highestScore = score;
        bestResume = res;
      }
    }

    scoredJobs.push({
      job,
      bestResume,
      score: highestScore,
    });
  }

  // 4. Sort by score descending and take the top 50 matches
  scoredJobs.sort((a, b) => b.score - a.score);
  const topMatches = scoredJobs.slice(0, 50);

  let updatedOrInsertedCount = 0;

  for (const item of topMatches) {
    const { job, bestResume, score } = item;

    const [existing] = await db
      .select({ id: jobMatches.id, matchScore: jobMatches.matchScore })
      .from(jobMatches)
      .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, job.id)))
      .limit(1);

    if (existing) {
      if (existing.matchScore !== score) {
        await db
          .update(jobMatches)
          .set({
            matchScore: score,
            bestResumeId: bestResume.id,
            updatedAt: new Date(),
          })
          .where(eq(jobMatches.id, existing.id));
        updatedOrInsertedCount++;
      }
    } else {
      await db.insert(jobMatches).values({
        userId,
        jobId: job.id,
        bestResumeId: bestResume.id,
        matchScore: score,
        status: "NEW",
      });
      updatedOrInsertedCount++;
    }
  }

  return { matched: updatedOrInsertedCount, totalTop: topMatches.length };
}
