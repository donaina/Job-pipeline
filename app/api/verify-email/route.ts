import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required." }, { status: 400 });
    }

    // 1. Decode JWT payload to find the user's email
    const parts = token.split(".");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "Invalid token format." }, { status: 400 });
    }

    let payload: any;
    try {
      const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
      payload = JSON.parse(decoded);
    } catch {
      return NextResponse.json({ error: "Invalid token payload." }, { status: 400 });
    }

    const email = payload?.email;
    if (!email) {
      return NextResponse.json({ error: "Token is missing email payload." }, { status: 400 });
    }

    // 2. Check if the user is already verified in DB
    const [existingUser] = await db
      .select({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    if (!existingUser) {
      return NextResponse.json({ error: "No account found matching this email." }, { status: 404 });
    }

    const wasAlreadyVerified = Boolean(existingUser.emailVerified);

    // 3. Execute Better Auth verifyEmail endpoint to validate signature & expiration
    const verifyRes = await auth.api.verifyEmail({
      query: { token },
      headers: req.headers,
      asResponse: true,
    });

    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            errData.message ||
            errData.error ||
            "This verification link is invalid or has expired.",
        },
        { status: 400 }
      );
    }

    // 4. Return distinct state so UI can show proper message
    const response = NextResponse.json({
      success: true,
      email: existingUser.email,
      state: wasAlreadyVerified ? "already_verified" : "just_verified",
    });

    // Forward session cookie so user is logged in
    const setCookie = verifyRes.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }

    return response;
  } catch (err: any) {
    console.error("Verification error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to verify email." },
      { status: 500 }
    );
  }
}
