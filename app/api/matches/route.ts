import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobMatches, jobs, resumes } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    const query = db
      .select({
        match: jobMatches,
        job: jobs,
        bestResume: {
          id: resumes.id,
          label: resumes.label,
          slotNumber: resumes.slotNumber,
          fileUrl: resumes.fileUrl,
        },
      })
      .from(jobMatches)
      .innerJoin(jobs, eq(jobMatches.jobId, jobs.id))
      .leftJoin(resumes, eq(jobMatches.bestResumeId, resumes.id))
      .where(
        statusFilter && statusFilter !== "ALL"
          ? and(
              eq(jobMatches.userId, session.user.id),
              eq(jobMatches.status, statusFilter)
            )
          : eq(jobMatches.userId, session.user.id)
      )
      .orderBy(desc(jobMatches.matchScore));

    const results = await query;

    return NextResponse.json({ matches: results });
  } catch (error: any) {
    console.error("Failed to fetch matches:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch matches." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { matchId, status, notes, followUpDate } = body;

    if (!matchId) {
      return NextResponse.json({ error: "matchId is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(jobMatches)
      .set({
        ...(status ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(followUpDate ? { followUpDate: new Date(followUpDate) } : {}),
        ...(status === "APPLIED" ? { appliedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(eq(jobMatches.id, matchId), eq(jobMatches.userId, session.user.id))
      )
      .returning();

    return NextResponse.json({ success: true, match: updated });
  } catch (error: any) {
    console.error("Failed to update match:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update match." },
      { status: 500 }
    );
  }
}

