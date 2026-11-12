import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await matchJobsForUser(session.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Match sync failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync job matches." },
      { status: 500 }
    );
  }
}

