import { db } from "@/lib/db";
import { jobMatches, jobs, resumes } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { parseResumeText, extractHeuristicSkills, extractHeuristicRole } from "@/lib/ai/parseResume";
import { generateEmbedding } from "@/lib/ai/embeddings";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
}

function containsWordOrSymbol(text: string, term: string): boolean {
  if (!text || !term) return false;
  const escaped = escapeRegex(term);
  const regex = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:$|[^a-z0-9_])`, "i");
  return regex.test(text);
}

function computeJobScore(
  job: { title: string; description: string; tags?: string[] | null },
  resume: { label?: string; targetRole?: string; skills: string[]; roles: string[] }
): number {
  const jobTitle = (job.title || "").toLowerCase();
  const jobDesc = (job.description || "").toLowerCase();
  const jobContent = `${jobTitle} ${jobDesc}`;

  // 1. Gather all candidate roles exclusively from resume & label (NO hardcoded roles)
  const candidateRoles = [
    resume.targetRole || "",
    resume.label && !resume.label.toLowerCase().startsWith("resume slot") ? resume.label : "",
    ...(resume.roles || []),
  ].filter(Boolean);

  let score = 30; // base baseline

  // 2. Role Title Alignment (up to 38 points)
  let titleScore = 0;
  for (const role of candidateRoles) {
    const rLower = role.toLowerCase().trim();
    if (rLower.length > 3 && (jobTitle.includes(rLower) || rLower.includes(jobTitle))) {
      titleScore = 38;
      break;
    }
  }

  if (titleScore === 0 && candidateRoles.length > 0) {
    const stopWords = new Set([
      "with", "from", "that", "senior", "lead", "staff", "principal", "junior",
      "associate", "role", "manager", "engineer", "specialist", "officer", "head"
    ]);
    const roleTokens = candidateRoles
      .flatMap((r) => r.toLowerCase().split(/[\s,/-]+/))
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const jobTitleTokens = jobTitle.split(/[\s,/-]+/).filter((w) => w.length > 2 && !stopWords.has(w));

    let overlap = 0;
    for (const token of roleTokens) {
      if (jobTitleTokens.includes(token)) overlap++;
    }

    if (overlap >= 2) titleScore = 30;
    else if (overlap === 1) titleScore = 16;
  }

  score += titleScore;

  // 3. Skills Overlap (up to 32 points)
  let skillHits = 0;
  for (const skill of resume.skills) {
    if (skill.length > 1 && containsWordOrSymbol(jobContent, skill)) {
      skillHits++;
    }
  }

  if (skillHits >= 5) score += 32;
  else if (skillHits === 4) score += 26;
  else if (skillHits === 3) score += 20;
  else if (skillHits === 2) score += 14;
  else if (skillHits === 1) score += 7;

  // 4. Seniority Alignment (up to 8 points)
  const isSeniorJob = /(senior|lead|staff|principal|director|head of)/i.test(jobTitle);
  const isSeniorResume = candidateRoles.some((r) =>
    /(senior|lead|staff|principal|director|head of|manager)/i.test(r)
  );
  if (isSeniorJob && isSeniorResume) {
    score += 8;
  }

  // 5. Domain / Industry Alignment (Payments, Fintech, Banking, Operations) (up to 10 points)
  const domainKeywords = [
    "payments", "fintech", "banking", "operations", "api", "transaction", "compliance", "regulatory"
  ];
  for (const dk of domainKeywords) {
    if (jobContent.includes(dk) && resume.skills.some((s) => s.toLowerCase().includes(dk))) {
      score += 6;
      break;
    }
  }

  // 6. Cross-Disciplinary Mismatch Dampening
  // Ensure non-dev roles (Product, Design, Marketing, Ops) are not inundated with pure coding roles
  const isDevJob = /(software engineer|full\s?stack|frontend|backend|mobile dev|devops|site reliability|cloud engineer|embedded|firmware|\.net developer|java developer|python developer|golang developer|react developer|sdk)/i.test(jobTitle);
  const isCandidateDev = candidateRoles.some((r) =>
    /(software|developer|frontend|backend|full\s?stack|devops|systems engineer|programmer|web dev)/i.test(r)
  );

  if (isDevJob && !isCandidateDev) {
    // Candidate has no developer roles: dampen developer roles heavily
    score -= 35;
  }

  const isProductJob = /(product manager|product management|product operations|head of product|vp of product|group product)/i.test(jobTitle);
  const isCandidateProduct = candidateRoles.some((r) =>
    /(product manager|product management|product operations|head of product)/i.test(r)
  );

  if (isCandidateProduct && isProductJob) {
    score += 15; // bonus boost for matching product roles
  }

  return Math.min(98, Math.max(25, Math.round(score)));
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

  // Self-heal: ensure parsedData and targetRole exist on resumes
  for (const res of userResumes) {
    let parsed = (res.parsedData as any) || {};
    let needsUpdate = false;

    if (!parsed?.targetRole || !parsed?.coreSkills || parsed.coreSkills.length === 0) {
      if (res.rawText) {
        try {
          console.log(`[matcher] Re-parsing resume slot ${res.slotNumber}...`);
          const aiParsed = await parseResumeText(res.rawText);
          if (aiParsed.targetRole || (aiParsed.coreSkills && aiParsed.coreSkills.length > 0)) {
            parsed = { ...parsed, ...aiParsed };
            needsUpdate = true;
          }
        } catch (e: any) {
          console.warn("[matcher] AI re-parse failed, using heuristic fallback:", e.message);
        }

        if (!parsed.targetRole) {
          parsed.targetRole = extractHeuristicRole(res.rawText);
          needsUpdate = true;
        }

        if (!parsed.coreSkills || parsed.coreSkills.length === 0) {
          const fallbackSkills = extractHeuristicSkills(res.rawText);
          parsed.coreSkills = fallbackSkills.slice(0, 10);
          parsed.toolsAndFrameworks = fallbackSkills.slice(10);
          needsUpdate = true;
        }
      }
    }

    let newLabel = res.label;
    if ((!newLabel || newLabel.toLowerCase().startsWith("resume slot")) && parsed.targetRole) {
      newLabel = parsed.targetRole;
      needsUpdate = true;
    }

    if (needsUpdate) {
      const embeddingText = `${newLabel}\n${parsed.summary || ""}\n${(parsed.coreSkills || []).join(", ")}`;
      const emb = await generateEmbedding(embeddingText);

      await db
        .update(resumes)
        .set({
          label: newLabel,
          parsedData: parsed,
          embedding: emb.length ? emb : null,
          updatedAt: new Date(),
        })
        .where(eq(resumes.id, res.id));

      res.label = newLabel;
      res.parsedData = parsed;
      res.embedding = emb.length ? emb : null;
    }
  }

  // 2. Fetch candidate pool of recent jobs
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
    let highestScore = 25;

    for (const res of userResumes) {
      const parsed = (res.parsedData as any) || {};
      const skills: string[] = [
        ...(parsed?.coreSkills || []),
        ...(parsed?.toolsAndFrameworks || []),
      ];
      const roles: string[] = [
        ...(parsed?.experience?.map((e: any) => e.role) || []),
      ];

      const score = computeJobScore(job, {
        label: res.label,
        targetRole: parsed?.targetRole,
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
