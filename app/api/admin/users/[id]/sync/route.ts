import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";

export async function POST(
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
    const result = await matchJobsForUser(targetUserId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error(`Admin match sync failed for user ${targetUserId}:`, error);
    return NextResponse.json(
      { error: error.message || "Failed to sync job matches for user." },
      { status: 500 }
    );
  }
}
