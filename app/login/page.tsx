"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (res.error) {
          setError(res.error.message || "Sign up failed.");
        } else {
          setSignUpSuccess(true);
        }
      } else {
        const res = await signIn.email({
          email,
          password,
        });
        if (res.error) {
          setError(res.error.message || "Invalid email or password.");
        } else {
          router.push("/");
          router.refresh();
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    setResendMsg("");
    try {
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackURL: "/" }),
      });
      if (res.ok) {
        setResendMsg("A fresh verification email has been sent! Check your inbox.");
      } else {
        const data = await res.json().catch(() => ({}));
        setResendMsg(data.message || "Failed to resend. Please try again.");
      }
    } catch (err: any) {
      setResendMsg("Error: " + err.message);
    } finally {
      setResending(false);
    }
  }

  if (signUpSuccess) {
    return (
      <div className="authWrap">
        <div className="authCard" style={{ textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#dbeafe",
              color: "#1d4ed8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              margin: "0 auto 16px",
            }}
          >
            ✉️
          </div>
          <h2 style={{ color: "var(--navy)", margin: "0 0 10px", fontSize: 22 }}>
            Check your inbox!
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 20px" }}>
            We've sent a verification link to <strong style={{ color: "var(--navy)" }}>{email}</strong>.
            Please click the link in the email to confirm your account and unlock all AI features.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
            <button
              onClick={() => {
                router.push("/");
                router.refresh();
              }}
              className="actionBtn primary"
              style={{ width: "100%", padding: "12px", fontSize: 14 }}
            >
              Continue to Dashboard &rarr;
            </button>
            <button
              onClick={handleResendVerification}
              disabled={resending}
              className="actionBtn"
              style={{ width: "100%", padding: "10px", fontSize: 13 }}
            >
              {resending ? "Resending..." : "Resend Verification Email"}
            </button>
          </div>

          {resendMsg && (
            <div
              style={{
                marginTop: 14,
                fontSize: 13,
                color: resendMsg.startsWith("Error") ? "#b91c1c" : "#166534",
              }}
            >
              {resendMsg}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="authWrap">
      <div className="authCard">
        <h1
          style={{
            fontFamily: "var(--font-display, serif)",
            fontSize: 26,
            color: "var(--navy)",
            marginTop: 0,
            marginBottom: 8,
          }}
        >
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 14,
            marginBottom: 24,
            marginTop: 0,
          }}
        >
          {isSignUp
            ? "Sign up to manage your 3 resumes and get tailored job matches."
            : "Sign in to access your matches and resume feedback."}
        </p>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#b91c1c",
              fontSize: 14,
              marginBottom: 18,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {isSignUp && (
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daniel Chimezie"
                required={isSignUp}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  fontSize: 14,
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontSize: 14,
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontSize: 14,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              padding: "11px",
              background: "var(--navy)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
          {isSignUp ? "Already have an account? " : "Don't have an account yet? "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--status-approved)",
              cursor: "pointer",
              fontWeight: 500,
              padding: 0,
            }}
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

