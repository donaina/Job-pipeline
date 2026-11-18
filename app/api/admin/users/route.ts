import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { user, resumes } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const allUsers = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        aiAnalysisCount: user.aiAnalysisCount,
        preferences: user.preferences,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));

    // Get count of configured resumes for each user
    const resumeCounts = await db
      .select({
        userId: resumes.userId,
        count: sql<number>`count(*)`,
      })
      .from(resumes)
      .groupBy(resumes.userId);

    const countMap = new Map<string, number>();
    for (const r of resumeCounts) {
      countMap.set(r.userId, Number(r.count || 0));
    }

    const usersWithMeta = allUsers.map((u) => ({
      ...u,
      resumeCount: countMap.get(u.id) || 0,
    }));

    return NextResponse.json({ users: usersWithMeta });
  } catch (err: any) {
    console.error("Admin users error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load users." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { isAdmin } = await getAdminSession(req.headers);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      userId,
      name,
      email,
      role,
      subscriptionTier,
      subscriptionStatus,
      emailVerified,
      preferences,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

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
      .where(eq(user.id, userId))
      .returning();

    return NextResponse.json({ success: true, user: updated });
  } catch (err: any) {
    console.error("Admin user update error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update user." },
      { status: 500 }
    );
  }
}
