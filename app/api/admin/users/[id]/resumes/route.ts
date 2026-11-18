import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { resumes, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { parseResumeText, ParsedResume } from "@/lib/ai/parseResume";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { matchJobsForUser } from "@/lib/matcher/matchUserJobs";
import fs from "fs/promises";
import path from "path";
// @ts-ignore
import pdfParse from "pdf-parse";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads", "resumes");

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
    const userResumes = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, targetUserId))
      .orderBy(resumes.slotNumber);

    return NextResponse.json({ resumes: userResumes });
  } catch (error: any) {
    console.error("Failed to fetch admin user resumes:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch user resumes" },
      { status: 500 }
    );
  }
}

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

  // Verify target user exists
  const [targetUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, targetUserId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found." }, { status: 404 });
  }

  try {
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

      // Save file to persistent storage under target user's folder
      const userUploadDir = path.join(UPLOADS_DIR, targetUserId);
      await fs.mkdir(userUploadDir, { recursive: true });
      const safeFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const filePath = path.join(userUploadDir, safeFilename);
      await fs.writeFile(filePath, buffer);
      fileUrl = `/uploads/resumes/${targetUserId}/${safeFilename}`;

      // AI parse into structured profile
      try {
        parsedData = await parseResumeText(rawText);
      } catch (aiErr: any) {
        console.warn("AI parse fallback:", aiErr.message);
        parsedData = { summary: rawText.slice(0, 500) };
      }

      if ((!label || label.toLowerCase().startsWith("resume ")) && parsedData?.targetRole) {
        label = parsedData.targetRole;
      }
    } else {
      // Manual experience input (JSON body)
      const body = await req.json();
      slotNumber = Number(body.slotNumber || 1);
      parsedData = body.parsedData || {};
      label = body.label || parsedData.targetRole || `Resume ${slotNumber}`;
      inputType = "MANUAL_ENTRY";
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

    // Check if slot already exists for target user
    const existing = await db
      .select()
      .from(resumes)
      .where(
        and(eq(resumes.userId, targetUserId), eq(resumes.slotNumber, slotNumber))
      );

    let savedResume;
    if (existing.length > 0) {
      const [updated] = await db
        .update(resumes)
        .set({
          label,
          inputType,
          fileUrl: fileUrl || existing[0].fileUrl,
          fileName: fileName || existing[0].fileName,
          rawText: rawText || existing[0].rawText,
          parsedData,
          embedding: embedding.length ? embedding : null,
          updatedAt: new Date(),
        })
        .where(eq(resumes.id, existing[0].id))
        .returning();
      savedResume = updated;
    } else {
      const [inserted] = await db
        .insert(resumes)
        .values({
          userId: targetUserId,
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

    // Trigger immediate re-matching in background for the target user
    matchJobsForUser(targetUserId).catch((matchErr) => {
      console.warn(`[admin resumes] Match error for user ${targetUserId}:`, matchErr);
    });

    return NextResponse.json({
      success: true,
      resume: savedResume,
    });
  } catch (error: any) {
    console.error("Admin failed to save resume:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process and save resume." },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const searchParams = req.nextUrl.searchParams;
    let slotNumber = Number(searchParams.get("slotNumber") || 0);

    if (!slotNumber) {
      try {
        const body = await req.json();
        slotNumber = Number(body.slotNumber || 0);
      } catch {}
    }

    if (![1, 2, 3].includes(slotNumber)) {
      return NextResponse.json(
        { error: "slotNumber (1, 2, or 3) is required to delete a resume." },
        { status: 400 }
      );
    }

    // Find the existing resume to remove file if exists
    const [existing] = await db
      .select()
      .from(resumes)
      .where(
        and(eq(resumes.userId, targetUserId), eq(resumes.slotNumber, slotNumber))
      );

    if (!existing) {
      return NextResponse.json(
        { error: `No resume found in slot ${slotNumber} for this user.` },
        { status: 404 }
      );
    }

    // Delete record from DB
    await db
      .delete(resumes)
      .where(and(eq(resumes.userId, targetUserId), eq(resumes.slotNumber, slotNumber)));

    // Try deleting uploaded file from disk if it was a file upload
    if (existing.fileUrl && existing.fileUrl.startsWith("/uploads/resumes/")) {
      try {
        const relativeFilePath = existing.fileUrl.replace("/uploads/resumes/", "");
        const diskPath = path.join(UPLOADS_DIR, relativeFilePath);
        await fs.unlink(diskPath);
      } catch (unlinkErr) {
        console.warn("Could not delete local file from disk:", unlinkErr);
      }
    }

    // Trigger re-matching for the user with their remaining resumes
    matchJobsForUser(targetUserId).catch((matchErr) => {
      console.warn(`[admin resumes delete] Match sync error:`, matchErr);
    });

    return NextResponse.json({
      success: true,
      message: `Resume in slot ${slotNumber} removed successfully.`,
      deletedSlot: slotNumber,
    });
  } catch (error: any) {
    console.error("Admin failed to delete resume:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete resume." },
      { status: 500 }
    );
  }
}
