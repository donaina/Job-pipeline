import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resumes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { parseResumeText, ParsedResume } from "@/lib/ai/parseResume";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";
import { ingestGlobalJobs } from "@/lib/jobs/ingest";
import { jobs } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
// @ts-ignore
import pdfParse from "pdf-parse";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads", "resumes");

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userResumes = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, session.user.id));

    return NextResponse.json({ resumes: userResumes });
  } catch (error: any) {
    console.error("Failed to fetch resumes:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch resumes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";

    let slotNumber = 1;
    let label = "General CV";
    let inputType = "FILE_UPLOAD";
    let rawText = "";
    let fileName = "";
    let fileUrl = "";
    let parsedData: ParsedResume | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      slotNumber = Number(formData.get("slotNumber") || 1);
      label = (formData.get("label") as string) || `Resume ${slotNumber}`;
      inputType = "FILE_UPLOAD";

      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file was uploaded." },
          { status: 400 }
        );
      }

      fileName = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      // Extract raw text from PDF
      try {
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text || "";
      } catch (pdfErr: any) {
        console.error("PDF parse error:", pdfErr);
        return NextResponse.json(
          { error: "Could not read the PDF file. Ensure it is not password protected." },
          { status: 400 }
        );
      }

      // Save file to persistent storage
      const userUploadDir = path.join(UPLOADS_DIR, session.user.id);
      await fs.mkdir(userUploadDir, { recursive: true });
      const safeFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const filePath = path.join(userUploadDir, safeFilename);
      await fs.writeFile(filePath, buffer);
      fileUrl = `/uploads/resumes/${session.user.id}/${safeFilename}`;

      // AI parse into structured profile
      try {
        parsedData = await parseResumeText(rawText);
      } catch (aiErr: any) {
        console.warn("AI parse fallback:", aiErr.message);
        parsedData = { summary: rawText.slice(0, 500) };
      }
    } else {
      // Manual experience input (JSON body)
      const body = await req.json();
      slotNumber = Number(body.slotNumber || 1);
      label = body.label || `Resume ${slotNumber}`;
      inputType = "MANUAL_ENTRY";
      parsedData = body.parsedData || {};
      rawText = JSON.stringify(parsedData, null, 2);
    }

    if (![1, 2, 3].includes(slotNumber)) {
      return NextResponse.json(
        { error: "slotNumber must be 1, 2, or 3." },
        { status: 400 }
      );
    }

    // Generate 768-dim embedding for semantic matching
    const embeddingText = `${label}\n${parsedData?.summary || ""}\n${(parsedData?.coreSkills || []).join(", ")}\n${(parsedData?.toolsAndFrameworks || []).join(", ")}`;
    const embedding = await generateEmbedding(embeddingText);

    // Check if slot already exists for this user
    const existing = await db
      .select()
      .from(resumes)
      .where(
        and(eq(resumes.userId, session.user.id), eq(resumes.slotNumber, slotNumber))
      );

    let savedResume;
    if (existing.length > 0) {
      // Update slot
      const [updated] = await db
        .update(resumes)
        .set({
          label,
          inputType,
          fileUrl,
          fileName,
          rawText,
          parsedData,
          embedding: embedding.length ? embedding : null,
          updatedAt: new Date(),
        })
        .where(eq(resumes.id, existing[0].id))
        .returning();
      savedResume = updated;
    } else {
      // Insert new slot
      const [inserted] = await db
        .insert(resumes)
        .values({
          userId: session.user.id,
          slotNumber,
          label,
          inputType,
          fileUrl,
          fileName,
          rawText,
          parsedData,
          embedding: embedding.length ? embedding : null,
          isDefault: slotNumber === 1,
        })
        .returning();
      savedResume = inserted;
    }

    // Check if jobs exist; if jobs table is empty, run initial ingest
    try {
      const [jobsCount] = await db.select({ count: sql<number>`count(*)` }).from(jobs);
      if (Number(jobsCount?.count || 0) === 0) {
        console.log("[resumes] Jobs table is empty. Running initial job ingestion...");
        await ingestGlobalJobs();
      }
    } catch (ingestErr) {
      console.warn("[resumes] Initial ingest check warning:", ingestErr);
    }

    // Automatically trigger immediate matching for this user
    let matchResult = { matched: 0 };
    try {
      matchResult = await matchJobsForUser(session.user.id);
    } catch (matchErr) {
      console.warn("[resumes] Immediate matching warning:", matchErr);
    }

    return NextResponse.json({
      success: true,
      resume: savedResume,
      matched: matchResult.matched,
    });
  } catch (error: any) {
    console.error("Failed to save resume:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process and save resume." },
      { status: 500 }
    );
  }
}

