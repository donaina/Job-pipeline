import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { ingestGlobalJobs } from "@/lib/jobs/ingest";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

let isScrapingRunning = false;
let lastScrapeState: {
  status: "idle" | "running" | "completed" | "failed";
  startedAt?: string;
  finishedAt?: string;
  added?: number;
  totalFetched?: number;
  eligible?: number;
  usersProcessed?: number;
  totalMatches?: number;
  error?: string;
} = { status: "idle" };

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  return NextResponse.json(lastScrapeState);
}

export async function POST(req: NextRequest) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  if (isScrapingRunning) {
    return NextResponse.json({
      success: true,
      message: "Scraping is already in progress.",
      state: lastScrapeState,
    });
  }

  isScrapingRunning = true;
  lastScrapeState = {
    status: "running",
    startedAt: new Date().toISOString(),
  };

  // Run in background so the HTTP request returns immediately
  // This completely eliminates HTTP 504 / 524 reverse-proxy gateway timeouts
  (async () => {
    try {
      console.log("[admin-scrape] Background ingestion started...");
      const ingestResult = await ingestGlobalJobs();

      console.log("[admin-scrape] Updating matches for all registered users...");
      const allUsers = await db.select({ id: user.id }).from(user);

      let totalMatches = 0;
      for (const u of allUsers) {
        const res = await matchJobsForUser(u.id);
        totalMatches += res.matched || 0;
      }

      lastScrapeState = {
        status: "completed",
        startedAt: lastScrapeState.startedAt,
        finishedAt: new Date().toISOString(),
        added: ingestResult.added,
        totalFetched: ingestResult.totalFetched,
        eligible: ingestResult.eligible,
        usersProcessed: allUsers.length,
        totalMatches,
      };
      console.log("[admin-scrape] Background ingestion completed successfully:", lastScrapeState);
    } catch (err: any) {
      console.error("[admin-scrape] Background ingestion failed:", err);
      lastScrapeState = {
        status: "failed",
        startedAt: lastScrapeState.startedAt,
        finishedAt: new Date().toISOString(),
        error: err.message || "Scraping failed.",
      };
    } finally {
      isScrapingRunning = false;
    }
  })();

  return NextResponse.json({
    success: true,
    message: "Scraper initiated in background! Processing jobs and matches...",
    state: lastScrapeState,
  });
}
