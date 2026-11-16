import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobMatches, jobs, resumes, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateInterviewPrep } from "@/lib/ai/interviewPrep";
import { ParsedResume } from "@/lib/ai/parseResume";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user's subscription tier & limit (shares counter with gap analysis)
    const [currentUser] = await db
      .select({
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        aiAnalysisCount: user.aiAnalysisCount,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    const isPro =
      currentUser?.subscriptionTier === "pro" || currentUser?.role === "admin";
    if (!isPro && (currentUser?.aiAnalysisCount || 0) >= 5) {
      return NextResponse.json(
        {
          error:
            "You have reached your free monthly limit of 5 AI analyses. Upgrade to Pro for unlimited interview prep and evaluations.",
        },
        { status: 403 }
      );
    }

    const matchId = params.id;

    // Fetch the match record
    const [match] = await db
      .select()
      .from(jobMatches)
      .where(
        and(eq(jobMatches.id, matchId), eq(jobMatches.userId, session.user.id))
      );

    if (!match) {
      return NextResponse.json({ error: "Match not found." }, { status: 404 });
    }

    // Return cached interview prep if it already exists
    if (match.interviewPrep) {
      return NextResponse.json({
        success: true,
        interviewPrep: match.interviewPrep,
        cached: true,
      });
    }

    // Fetch the corresponding job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, match.jobId));

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    // Fetch the candidate's best resume
    let resumeRecord;
    if (match.bestResumeId) {
      const [r] = await db
        .select()
        .from(resumes)
        .where(eq(resumes.id, match.bestResumeId));
      resumeRecord = r;
    } else {
      const [r] = await db
        .select()
        .from(resumes)
        .where(eq(resumes.userId, session.user.id))
        .limit(1);
      resumeRecord = r;
    }

    if (!resumeRecord || !resumeRecord.parsedData) {
      return NextResponse.json(
        {
          error:
            "No structured resume data found. Please upload your resume first.",
        },
        { status: 400 }
      );
    }

    // Generate interview prep with Gemini
    const interviewPrep = await generateInterviewPrep(
      {
        title: job.title,
        company: job.company,
        description: job.description,
      },
      resumeRecord.parsedData as ParsedResume
    );

    // Cache the result on the match record
    await db
      .update(jobMatches)
      .set({
        interviewPrep: interviewPrep as any,
        updatedAt: new Date(),
      })
      .where(eq(jobMatches.id, matchId));

    // Increment user's AI analysis counter
    await db
      .update(user)
      .set({
        aiAnalysisCount: (currentUser?.aiAnalysisCount || 0) + 1,
      })
      .where(eq(user.id, session.user.id));

    return NextResponse.json({
      success: true,
      interviewPrep,
    });
  } catch (error: any) {
    console.error("Interview prep generation failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate interview prep." },
      { status: 500 }
    );
  }
}

