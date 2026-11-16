import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export const EMAIL_FROM =
  process.env.EMAIL_FROM || "Job Pipeline <onboarding@resend.dev>";

export interface SendVerificationEmailParams {
  to: string;
  name?: string;
  verificationUrl: string;
}

export async function sendVerificationEmail({
  to,
  name,
  verificationUrl,
}: SendVerificationEmailParams) {
  const recipientName = name || to.split("@")[0] || "there";

  if (!resend) {
    console.warn(
      `\n======================================================\n` +
      `[Resend Notice] RESEND_API_KEY is not configured.\n` +
      `Verification link for ${to}:\n${verificationUrl}\n` +
      `Set RESEND_API_KEY in your environment to send live emails.\n` +
      `======================================================\n`
    );
    return { success: false, skipped: true };
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email - Job Pipeline</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1f2a54; padding: 28px 32px; text-align: left;">
              <span style="color: #60a5fa; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">
                Eduvrse Job Intelligence
              </span>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">
                Job Pipeline
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin: 0 0 16px;">
                Welcome, ${recipientName}!
              </h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Thanks for joining Job Pipeline. You are one step away from automated remote job matching across 9 global job boards tailored to your specialized CVs.
              </p>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                Please verify your email address to confirm your account and unlock deep AI Resume Gap Analysis and tailored Interview Prep:
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #1f2a54;">
                    <a href="${verificationUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      Verify Email Address &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="word-break: break-all; margin: 6px 0 24px;">
                <a href="${verificationUrl}" style="color: #2563eb; font-size: 12.5px; text-decoration: underline;">
                  ${verificationUrl}
                </a>
              </p>

              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin-top: 24px;">
                <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 8px;">
                  What you can do on Job Pipeline:
                </div>
                <ul style="margin: 0; padding-left: 20px; font-size: 12.5px; color: #475569; line-height: 1.6;">
                  <li><strong>Upload 3 Specialized CVs:</strong> Match different roles (e.g. Frontend, Full-stack, Mobile).</li>
                  <li><strong>Automated Scraping:</strong> Continuous crawler indexing Greenhouse, Himalayas, Remotive, Ashby, and more.</li>
                  <li><strong>AI Interview Prep:</strong> Targeted behavioral STAR frameworks and technical role practice.</li>
                </ul>
              </div>

              <p style="color: #94a3b8; font-size: 12px; margin: 28px 0 0;">
                This link will expire in 1 hour. If you didn't create a Job Pipeline account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} Job Pipeline &bull; Eduvrse. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: "Verify your email for Job Pipeline",
      html,
    });

    if (error) {
      console.error("[Resend Error]", error);
      return { success: false, error };
    }

    console.log(`[Resend] Verification email dispatched to ${to} (id: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Resend Exception]", err);
    return { success: false, error: err.message };
  }
}
