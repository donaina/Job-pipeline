import { db } from "@/lib/db";
import { jobMatches, jobs, resumes } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { cosineSimilarity } from "@/lib/ai/embeddings";

export async function matchJobsForUser(userId: string, limit: number = 50) {
  // 1. Fetch user's resumes
  const userResumes = await db
    .select()
    .from(resumes)
    .where(eq(resumes.userId, userId));

  if (userResumes.length === 0) {
    return { matched: 0, message: "No resumes found for user." };
  }

  // 2. Fetch recent jobs
  const availableJobs = await db
    .select()
    .from(jobs)
    .limit(limit);

  let matchedCount = 0;

  for (const job of availableJobs) {
    // Check if match already exists
    const [existing] = await db
      .select()
      .from(jobMatches)
      .where(and(eq(jobMatches.userId, userId), eq(jobMatches.jobId, job.id)));

    if (existing) continue;

    // Find best fitting resume among the user's uploaded slots
    let bestResume = userResumes[0];
    let highestScore = 50; // baseline

    for (const res of userResumes) {
      let score = 50;
      if (res.embedding && job.embedding) {
        const similarity = cosineSimilarity(res.embedding, job.embedding);
        score = Math.round(similarity * 100);
      } else {
        // Fallback: title/skill keyword overlap
        const jobText = `${job.title} ${job.description}`.toLowerCase();
        const resumeSkills = (res.parsedData?.coreSkills || []).map((s) =>
          s.toLowerCase()
        );
        let hits = 0;
        for (const skill of resumeSkills) {
          if (jobText.includes(skill)) hits++;
        }
        const total = Math.max(resumeSkills.length, 1);
        score = Math.min(95, Math.round(50 + (hits / total) * 45));
      }

      if (score > highestScore) {
        highestScore = score;
        bestResume = res;
      }
    }

    // Insert match record
    await db.insert(jobMatches).values({
      userId,
      jobId: job.id,
      bestResumeId: bestResume.id,
      matchScore: highestScore,
      status: "NEW",
    });

    matchedCount++;
  }

  return { matched: matchedCount };
}

