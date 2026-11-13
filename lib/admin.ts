import { auth } from "./auth";
import { headers } from "next/headers";
import { db } from "./db";
import { user } from "./db/schema";
import { eq } from "drizzle-orm";

export async function getAdminSession(reqHeaders?: Headers) {
  try {
    const session = await auth.api.getSession({
      headers: reqHeaders || (await headers()),
    });

    if (!session?.user) {
      return { isAdmin: false, session: null };
    }

    // Double-check role directly from database
    const [dbUser] = await db
      .select({
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    const isAdmin = dbUser?.role === "admin";
    return { isAdmin, session, user: dbUser };
  } catch (err) {
    console.error("Admin session check failed:", err);
    return { isAdmin: false, session: null };
  }
}
