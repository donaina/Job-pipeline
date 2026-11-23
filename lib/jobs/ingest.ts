import { fetchAllJobs } from "../fetchers/index.js";
import { filterJobs, detectWorkplaceType, detectVisaSponsorship } from "../filters.js";
import { db } from "../db";
import { jobs } from "../db/schema";
import { generateEmbedding } from "../ai/embeddings";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function ingestGlobalJobs() {
  console.log("[ingest] Fetching fresh jobs across all sources...");
  const { jobs: rawJobs, total } = await fetchAllJobs();
  console.log(`[ingest] Fetched ${rawJobs.length} jobs (out of ${total} total seen).`);

  // Filter for Remote & Nigeria / Worldwide / Eligible Country jobs
  const eligibleJobs = filterJobs(rawJobs);
  console.log(`[ingest] ${eligibleJobs.length} jobs passed the remote and location eligibility filter.`);

  let added = 0;

  for (const job of eligibleJobs) {
    try {
      const link = job.link || job.url || "";
      if (!link) continue;

      // Unique hash for deduplication
      const externalId = crypto
        .createHash("sha256")
        .update(`${job.company || ""}-${job.title || ""}-${link}`)
        .digest("hex");

      const workplaceType = detectWorkplaceType(job);
      const isSponsorship = detectVisaSponsorship(job);

      // Check if job already exists
      const existing = await db
        .select({ id: jobs.id, remoteType: jobs.remoteType, tags: jobs.tags })
        .from(jobs)
        .where(eq(jobs.externalId, externalId))
        .limit(1);

      if (existing.length > 0) {
        const existingJob = existing[0];
        let needsUpdate = false;
        const updatePayload: Record<string, any> = {};

        // Self-heal workplace arrangement if previously default
        if (workplaceType !== "remote" && existingJob.remoteType !== workplaceType) {
          updatePayload.remoteType = workplaceType;
          needsUpdate = true;
        }

        // Self-heal visa sponsorship tags
        const currentTags: string[] = existingJob.tags || [];
        if (isSponsorship && !currentTags.some((t) => /sponsorship|lmia/i.test(t))) {
          const newTags = [...currentTags, "Canada Visa Sponsorship"];
          if (
            (job.tags?.includes("LMIA") || /lmia/i.test(`${job.title} ${job.description}`)) &&
            !newTags.includes("LMIA")
          ) {
            newTags.push("LMIA");
          }
          updatePayload.tags = newTags;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await db.update(jobs).set(updatePayload).where(eq(jobs.id, existingJob.id));
        }
        continue;
      }

      const tags = [
        ...(job.tags || []),
        workplaceType === "remote"
          ? (job.locationRestricted ? "Region-Specific Remote" : "Worldwide Remote")
          : workplaceType === "hybrid"
          ? "Hybrid"
          : "On-site",
      ];

      if (isSponsorship && !tags.some((t) => /sponsorship/i.test(t))) {
        tags.push("Canada Visa Sponsorship");
        if (
          (job.tags?.includes("LMIA") || /lmia/i.test(`${job.title} ${job.description}`)) &&
          !tags.includes("LMIA")
        ) {
          tags.push("LMIA");
        }
      }

      await db.insert(jobs).values({
        externalId,
        source: job.source || "web",
        company: job.company || "Unknown Company",
        title: job.title || "Software Engineer",
        description: job.description || "",
        location: job.location || (workplaceType === "remote" ? "Remote" : "On-site"),
        remoteType: workplaceType,
        salaryEst: job.salary || null,
        applyUrl: link,
        applyEmail: job.applyEmail || null,
        tags,
        embedding: null,
      });

      added++;
    } catch (err: any) {
      console.warn(`[ingest] Failed to save job "${job.title}":`, err.message);
    }
  }

  console.log(`[ingest] Successfully saved ${added} new unique remote jobs.`);
  return { added, totalFetched: rawJobs.length, eligible: eligibleJobs.length };
}
