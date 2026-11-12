import { fetchAllJobs } from "../fetchers/index.js";
import { db } from "../db";
import { jobs } from "../db/schema";
import { generateEmbedding } from "../ai/embeddings";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function ingestGlobalJobs() {
  console.log("[ingest] Fetching fresh jobs across all sources...");
  const { jobs: rawJobs, total } = await fetchAllJobs();
  console.log(`[ingest] Fetched ${rawJobs.length} jobs (out of ${total} total seen).`);

  let added = 0;

  for (const job of rawJobs) {
    try {
      const link = job.link || job.url || "";
      if (!link) continue;

      // Unique hash for deduplication
      const externalId = crypto
        .createHash("sha256")
        .update(`${job.company || ""}-${job.title || ""}-${link}`)
        .digest("hex");

      // Check if job already exists
      const existing = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.externalId, externalId))
        .limit(1);

      if (existing.length > 0) continue;

      // Generate embedding for job title + description preview
      const embeddingText = `${job.title} at ${job.company}\n${(job.description || "").slice(0, 3000)}`;
      const embedding = await generateEmbedding(embeddingText);

      await db.insert(jobs).values({
        externalId,
        source: job.source || "web",
        company: job.company || "Unknown Company",
        title: job.title || "Software Engineer",
        description: job.description || "",
        location: job.location || "Remote",
        remoteType: job.remote ? "remote" : "unknown",
        salaryEst: job.salary || null,
        applyUrl: link,
        applyEmail: job.applyEmail || null,
        tags: job.tags || [],
        embedding: embedding.length ? embedding : null,
      });

      added++;
    } catch (err: any) {
      console.warn(`[ingest] Failed to save job "${job.title}":`, err.message);
    }
  }

  console.log(`[ingest] Successfully saved ${added} new unique jobs.`);
  return { added, totalFetched: rawJobs.length };
}

