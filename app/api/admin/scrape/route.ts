import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { ingestGlobalJobs } from "@/lib/jobs/ingest";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    console.log("[admin-scrape] Triggered manual job ingestion...");
    const ingestResult = await ingestGlobalJobs();

    console.log("[admin-scrape] Updating matches for all registered users...");
    const allUsers = await db.select({ id: user.id }).from(user);

    let totalMatches = 0;
    for (const u of allUsers) {
      const res = await matchJobsForUser(u.id);
      totalMatches += res.matched || 0;
    }

    return NextResponse.json({
      success: true,
      added: ingestResult.added,
      totalFetched: ingestResult.totalFetched,
      eligible: ingestResult.eligible,
      usersProcessed: allUsers.length,
      totalMatches,
    });
  } catch (err: any) {
    console.error("Manual scrape trigger error:", err);
    return NextResponse.json(
      { error: err.message || "Scraping failed." },
      { status: 500 }
    );
  }
}
