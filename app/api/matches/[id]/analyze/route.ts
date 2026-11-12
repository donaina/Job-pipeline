import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jobMatches, jobs, resumes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { analyzeResumeJobGap } from "@/lib/ai/gapAnalysis";
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

    // Fetch the corresponding job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, match.jobId));

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    // Fetch the candidate's best resume (or default to user's first resume)
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
            "No structured resume data found. Please upload or input your resume first.",
        },
        { status: 400 }
      );
    }

    // Run Deep Gap Analysis with Gemini
    const analysis = await analyzeResumeJobGap(
      {
        title: job.title,
        company: job.company,
        description: job.description,
      },
      resumeRecord.parsedData as ParsedResume
    );

    // Update match record with AI results
    const [updated] = await db
      .update(jobMatches)
      .set({
        matchScore: analysis.matchScore,
        gapAnalysis: {
          fitLevel: analysis.fitLevel,
          summaryReasoning: analysis.summaryReasoning,
          strengths: analysis.strengths,
          missingCriticalSkills: analysis.missingCriticalSkills,
          missingNiceToHaves: analysis.missingNiceToHaves,
        },
        tailoredSuggestions: analysis.tailoredSuggestions,
        updatedAt: new Date(),
      })
      .where(eq(jobMatches.id, matchId))
      .returning();

    return NextResponse.json({
      success: true,
      analysis,
      match: updated,
    });
  } catch (error: any) {
    console.error("Gap analysis failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze resume gap." },
      { status: 500 }
    );
  }
}

