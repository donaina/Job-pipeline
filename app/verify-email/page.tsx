"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "just_verified" | "already_verified" | "error"
  >(token ? "loading" : "error");

  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No verification token was provided in this link.");
      return;
    }

    async function verify() {
      try {
        const res = await fetch("/api/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          setVerifiedEmail(data.email || "");
          if (data.state === "already_verified") {
            setStatus("already_verified");
          } else {
            setStatus("just_verified");
          }
        } else {
          setStatus("error");
          setErrorMessage(
            data.error || "This verification link is invalid or has expired."
          );
        }
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(
          err.message || "Failed to communicate with the verification service."
        );
      }
    }

    verify();
  }, [token]);

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
        setResendFeedback("A fresh verification link has been sent! Check your inbox.");
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
    <div className="authWrap">
      <div className="authCard" style={{ textAlign: "center" }}>
        {/* Loading State */}
        {status === "loading" && (
          <div>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⏳</div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 8px", fontSize: 22 }}>
              Verifying your email...
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
              Please wait while we confirm your account.
            </p>
          </div>
        )}

        {/* State 1: Newly Verified */}
        {status === "just_verified" && (
          <div>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#dcfce7",
                color: "#166534",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                margin: "0 auto 18px",
              }}
            >
              ✓
            </div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 10px", fontSize: 23 }}>
              Email Verified Successfully!
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14.5, margin: "0 0 20px", lineHeight: 1.6 }}>
              Your email <strong style={{ color: "var(--navy)" }}>{verifiedEmail}</strong> has now been verified. Your Job Pipeline account is fully active.
            </p>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "14px 18px",
                textAlign: "left",
                marginBottom: 24,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--navy)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Now Available on Your Account:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
                <li>✨ <strong>AI Resume Gap Analysis</strong> unlocked</li>
                <li>🎯 <strong>Tailored Interview Prep</strong> enabled</li>
                <li>⚡ Continuous job matching across 9 global platforms</li>
              </ul>
            </div>

            <Link
              href="/"
              className="actionBtn primary"
              style={{
                textDecoration: "none",
                display: "block",
                padding: "12px 24px",
                fontSize: 14.5,
                fontWeight: 600,
              }}
            >
              Go to Dashboard &rarr;
            </Link>
          </div>
        )}

        {/* State 2: Already Verified Previously */}
        {status === "already_verified" && (
          <div>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#e0e7ff",
                color: "#3730a3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                margin: "0 auto 18px",
              }}
            >
              ℹ️
            </div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 10px", fontSize: 23 }}>
              Email Already Verified
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14.5, margin: "0 0 24px", lineHeight: 1.6 }}>
              The email address <strong style={{ color: "var(--navy)" }}>{verifiedEmail}</strong> has already been confirmed previously. Your account is active and ready to use.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href="/"
                className="actionBtn primary"
                style={{
                  textDecoration: "none",
                  display: "block",
                  padding: "12px 24px",
                  fontSize: 14.5,
                  fontWeight: 600,
                }}
              >
                Go to Dashboard &rarr;
              </Link>
              <Link
                href="/login"
                className="actionBtn"
                style={{
                  textDecoration: "none",
                  display: "block",
                  padding: "10px 24px",
                  fontSize: 13.5,
                }}
              >
                Sign In to Another Account
              </Link>
            </div>
          </div>
        )}

        {/* State 3: Error / Expired */}
        {status === "error" && (
          <div>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#fef2f2",
                color: "#b91c1c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                margin: "0 auto 18px",
              }}
            >
              &times;
            </div>
            <h2 style={{ color: "var(--navy)", margin: "0 0 10px", fontSize: 22 }}>
              Verification Link Invalid or Expired
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
              {errorMessage || "This verification link is invalid, has already been used, or has expired (links expire after 1 hour)."}
            </p>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 18,
                textAlign: "left",
                marginBottom: 20,
              }}
            >
              <h4 style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--navy)" }}>
                Request a Fresh Verification Link
              </h4>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                Enter your registered email address to receive a new link:
              </p>
              <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    padding: "9px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 13.5,
                  }}
                />
                <button
                  type="submit"
                  disabled={resending}
                  className="actionBtn primary"
                  style={{ fontSize: 13, padding: "10px" }}
                >
                  {resending ? "Sending..." : "Send New Verification Link"}
                </button>
              </form>
              {resendFeedback && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 12.5,
                    color: resendFeedback.startsWith("Error") ? "#b91c1c" : "#166534",
                  }}
                >
                  {resendFeedback}
                </div>
              )}
            </div>

            <div>
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
