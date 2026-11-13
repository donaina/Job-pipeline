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
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        aiAnalysisCount: user.aiAnalysisCount,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));

    return NextResponse.json({ users: allUsers });
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
    const { userId, role, subscriptionTier, subscriptionStatus } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const [updated] = await db
      .update(user)
      .set({
        ...(role ? { role } : {}),
        ...(subscriptionTier ? { subscriptionTier } : {}),
        ...(subscriptionStatus ? { subscriptionStatus } : {}),
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
