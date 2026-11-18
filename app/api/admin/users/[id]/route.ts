import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { user, resumes, jobMatches, jobs } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  const resolvedParams = await Promise.resolve(params);
  const targetUserId = resolvedParams.id;
  if (!targetUserId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  try {
    const [targetUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userResumes = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, targetUserId))
      .orderBy(resumes.slotNumber);

    const userMatches = await db
      .select({
        id: jobMatches.id,
        matchScore: jobMatches.matchScore,
        status: jobMatches.status,
        gapAnalysis: jobMatches.gapAnalysis,
        bestResumeId: jobMatches.bestResumeId,
        createdAt: jobMatches.createdAt,
        job: {
          id: jobs.id,
          title: jobs.title,
          company: jobs.company,
          location: jobs.location,
          salaryEst: jobs.salaryEst,
          applyUrl: jobs.applyUrl,
          tags: jobs.tags,
        },
      })
      .from(jobMatches)
      .innerJoin(jobs, eq(jobMatches.jobId, jobs.id))
      .where(eq(jobMatches.userId, targetUserId))
      .orderBy(desc(jobMatches.matchScore))
      .limit(20);

    return NextResponse.json({
      user: targetUser,
      resumes: userResumes,
      matches: userMatches,
    });
  } catch (err: any) {
    console.error("Failed to fetch user details:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load user profile." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  const resolvedParams = await Promise.resolve(params);
  const targetUserId = resolvedParams.id;
  if (!targetUserId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const {
      name,
      email,
      role,
      subscriptionTier,
      subscriptionStatus,
      emailVerified,
      preferences,
    } = body;

    const [updated] = await db
      .update(user)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(subscriptionTier !== undefined ? { subscriptionTier } : {}),
        ...(subscriptionStatus !== undefined ? { subscriptionStatus } : {}),
        ...(emailVerified !== undefined ? { emailVerified: Boolean(emailVerified) } : {}),
        ...(preferences !== undefined ? { preferences } : {}),
        updatedAt: new Date(),
      })
      .where(eq(user.id, targetUserId))
      .returning();

    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    console.error("Failed to update user profile:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update user profile." },
      { status: 500 }
    );
  }
}
