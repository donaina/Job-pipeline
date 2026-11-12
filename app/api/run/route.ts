import { NextRequest, NextResponse } from "next/server";
import { ingestGlobalJobs } from "@/lib/jobs/ingest";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

function checkAuth(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron-pipeline] Running scheduled job ingestion...");
    const ingestResult = await ingestGlobalJobs();

    console.log("[cron-pipeline] Matching jobs for all registered users...");
    const allUsers = await db.select({ id: user.id, email: user.email }).from(user);

    let totalMatches = 0;
    for (const u of allUsers) {
      const res = await matchJobsForUser(u.id);
      totalMatches += res.matched || 0;
    }

    console.log(
      `[cron-pipeline] Finished: ${ingestResult.added} new jobs, ${totalMatches} new matches across ${allUsers.length} users.`
    );

    return NextResponse.json({
      success: true,
      newJobsAdded: ingestResult.added,
      totalJobsFetched: ingestResult.totalFetched,
      eligibleJobs: ingestResult.eligible,
      usersProcessed: allUsers.length,
      totalMatchesCreated: totalMatches,
    });
  } catch (error: any) {
    console.error("[cron-pipeline] Failed:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
