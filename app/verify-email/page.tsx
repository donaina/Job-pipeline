"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No verification token was found in this link.");
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token!)}`);
        const data = await res.json().catch(() => ({}));

        if (res.ok && (data.status === true || data.user)) {
          setStatus("success");
          // Redirect after 2.5 seconds
          setTimeout(() => {
            router.push("/");
          }, 2500);
        } else {
          setStatus("error");
          setErrorMessage(
            data.message || data.error || "This verification link is invalid or has expired."
          );
        }
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(err.message || "Failed to communicate with verification server.");
      }
    }

    verify();
  }, [token, router]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    setResendFeedback("");
    try {
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail, callbackURL: "/" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResendFeedback("A new verification link has been sent to your email!");
      } else {
        setResendFeedback(data.message || "Failed to resend. Please check the email address.");
      }
    } catch (err: any) {
      setResendFeedback("Error: " + err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: "80px auto", padding: "0 20px" }}>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 36,
          boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
          textAlign: "center",
        }}
      >
        {status === "loading" && (
          <div>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⏳</div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 8px", fontSize: 22 }}>
              Verifying your email...
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
              Please wait a moment while we confirm your account.
            </p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "#dcfce7",
                color: "#166534",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                margin: "0 auto 16px",
              }}
            >
              ✓
            </div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 8px", fontSize: 22 }}>
              Email Verified!
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
              Your email address has been confirmed. You now have full access to AI Gap Analysis, tailored Interview Prep, and job matching.
            </p>
            <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 16 }}>
              Redirecting you to the dashboard in a few seconds...
            </div>
            <Link
              href="/"
              className="actionBtn primary"
              style={{ textDecoration: "none", display: "inline-block", padding: "10px 24px" }}
            >
              Go to Dashboard &rarr;
            </Link>
          </div>
        )}

        {status === "error" && (
          <div>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "#fef2f2",
                color: "#b91c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                margin: "0 auto 16px",
              }}
            >
              &times;
            </div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 8px", fontSize: 22 }}>
              Verification Failed
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
              {errorMessage || "This verification link is invalid or has expired."}
            </p>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 20,
                marginTop: 20,
                textAlign: "left",
              }}
            >
              <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy)" }}>
                Need a new link?
              </h4>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                Enter your registered email address to receive a fresh verification link:
              </p>
              <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                />
                <button
                  type="submit"
                  disabled={resending}
                  className="actionBtn primary"
                  style={{ fontSize: 13 }}
                >
                  {resending ? "Sending..." : "Send New Verification Email"}
                </button>
              </form>
              {resendFeedback && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: resendFeedback.startsWith("Error") ? "#b91c1c" : "#166534",
                  }}
                >
                  {resendFeedback}
                </div>
              )}
            </div>

            <div style={{ marginTop: 24 }}>
              <Link href="/login" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "underline" }}>
                Back to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", paddingTop: 100 }}>Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
