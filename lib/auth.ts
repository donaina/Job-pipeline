import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { sendVerificationEmail } from "./email/resend";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600, // 1 hour
    sendVerificationEmail: async ({ user, token }) => {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.BETTER_AUTH_URL ||
        "https://job-pipeline.eduvrse.co";
      const cleanAppUrl = appUrl.replace(/\/+$/, "");
      const verificationUrl = `${cleanAppUrl}/verify-email?token=${encodeURIComponent(token)}`;

      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        verificationUrl,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      subscriptionTier: {
        type: "string",
        defaultValue: "free",
      },
      subscriptionStatus: {
        type: "string",
        defaultValue: "active",
      },
      aiAnalysisCount: {
        type: "number",
        defaultValue: 0,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60 * 2, // 2 hours
  },
});

