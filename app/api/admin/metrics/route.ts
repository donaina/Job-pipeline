import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { user, jobs, jobMatches, resumes } from "@/lib/db/schema";
import { sql, gte, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalUsersCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(user);

    const [proUsersCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(eq(user.subscriptionTier, "pro"));

    const [totalJobsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs);

    const [jobs24hCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(gte(jobs.createdAt, yesterday));

    const [totalMatchesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobMatches);

    const [totalResumesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(resumes);

    return NextResponse.json({
      metrics: {
        totalUsers: Number(totalUsersCount?.count || 0),
        proUsers: Number(proUsersCount?.count || 0),
        freeUsers:
          Number(totalUsersCount?.count || 0) - Number(proUsersCount?.count || 0),
        totalJobs: Number(totalJobsCount?.count || 0),
        jobsLast24h: Number(jobs24hCount?.count || 0),
        totalMatches: Number(totalMatchesCount?.count || 0),
        totalResumes: Number(totalResumesCount?.count || 0),
      },
    });
  } catch (err: any) {
    console.error("Admin metrics error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load metrics." },
      { status: 500 }
    );
  }
}
