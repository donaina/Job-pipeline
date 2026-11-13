"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Resume {
  id: string;
  slotNumber: number;
  label: string;
  inputType: string;
  fileName?: string;
  fileUrl?: string;
  parsedData?: {
    fullName?: string;
    summary?: string;
    coreSkills?: string[];
    toolsAndFrameworks?: string[];
    yearsOfExperience?: number;
    experience?: Array<{ company: string; role: string }>;
  };
}

export default function ResumesPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [manualExperience, setManualExperience] = useState({
    summary: "",
    skills: "",
    company: "",
    role: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const sessionUser = (session as any)?.user;

  useEffect(() => {
    if (!isPending && !sessionUser) {
      router.push("/login");
    } else if (sessionUser) {
      loadResumes();
    }
  }, [session, isPending]);

  async function loadResumes() {
    try {
      setLoading(true);
      const res = await fetch("/api/resumes");
      const data = await res.json();
      if (data.resumes) {
        setResumes(data.resumes);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSlot) return;
    setSubmitting(true);
    setStatusMsg("Processing and analyzing with Gemini...");

    try {
      if (mode === "upload") {
        if (!file) {
          alert("Please select a PDF file.");
          setSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append("slotNumber", activeSlot.toString());
        formData.append("label", label || `Resume ${activeSlot}`);
        formData.append("file", file);

        const res = await fetch("/api/resumes", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        if (result.error) throw new Error(result.error);
      } else {
        const parsedData = {
          summary: manualExperience.summary,
          coreSkills: manualExperience.skills.split(",").map((s) => s.trim()).filter(Boolean),
          experience: manualExperience.company
            ? [{ company: manualExperience.company, role: manualExperience.role }]
            : [],
        };
        const res = await fetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotNumber: activeSlot,
            label: label || `Resume ${activeSlot}`,
            parsedData,
          }),
        });
        const result = await res.json();
        if (result.error) throw new Error(result.error);
      }

      setStatusMsg("Saved successfully!");
      setActiveSlot(null);
      setFile(null);
      setLabel("");
      await loadResumes();
    } catch (err: any) {
      alert(err.message || "Failed to save resume.");
    } finally {
      setSubmitting(false);
      setStatusMsg("");
    }
  }

  async function syncMatches() {
    setStatusMsg("Matching active jobs to your resumes...");
    try {
      const res = await fetch("/api/matches/sync", { method: "POST" });
      const data = await res.json();
      alert(`Sync complete! ${data.matched || 0} jobs matched.`);
      router.push("/");
    } catch (err) {
      alert("Error syncing matches.");
    } finally {
      setStatusMsg("");
    }
  }

  if (isPending || loading) {
    return <div className="wrap" style={{ textAlign: "center", paddingTop: 100 }}>Loading your profiles...</div>;
  }

  const slots = [1, 2, 3];

  return (
    <div className="wrap">
      <div className="pageHead">
        <div>
          <h1 className="wordmark">Your 3 Resumes</h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0" }}>
            Upload or manually configure up to 3 specialized CVs to automatically match different roles.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" className="actionBtn" style={{ textDecoration: "none" }}>
            Back to Dashboard
          </Link>
          <button onClick={syncMatches} className="actionBtn primary">
            Sync & Find Matches
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{ padding: 12, background: "#e0f2fe", borderRadius: 6, marginBottom: 20, color: "#0369a1" }}>
          {statusMsg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 40 }}>
        {slots.map((slotNum) => {
          const resume = resumes.find((r) => r.slotNumber === slotNum);
          const isLocked =
            slotNum > 1 &&
            sessionUser?.subscriptionTier !== "pro" &&
            sessionUser?.role !== "admin" &&
            !resume;

          return (
            <div
              key={slotNum}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 280,
                opacity: isLocked ? 0.9 : 1,
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase" }}>
                    Slot {slotNum}
                  </span>
                  {isLocked ? (
                    <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 12, fontWeight: 600 }}>
                      ⭐ Pro Feature
                    </span>
                  ) : resume ? (
                    <span style={{ fontSize: 11, background: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: 12 }}>
                      {resume.inputType === "FILE_UPLOAD" ? "PDF Upload" : "Manual Profile"}
                    </span>
                  ) : null}
                </div>

                <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "var(--navy)" }}>
                  {resume ? resume.label : isLocked ? `Resume Slot ${slotNum} (Pro)` : `Resume Slot ${slotNum} (Empty)`}
                </h3>

                {isLocked ? (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 14 }}>
                    Unlock multi-track CV targeting with <strong>Pro</strong>. Match specialized Frontend, Mobile, and Product engineering roles simultaneously.
                  </p>
                ) : resume ? (
                  <div>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
                      {resume.parsedData?.summary
                        ? resume.parsedData.summary.slice(0, 140) + "..."
                        : "Profile extracted and indexed."}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                      {(resume.parsedData?.coreSkills || []).slice(0, 6).map((skill, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 12,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 20 }}>
                    No resume configured in this slot yet. Upload a tailored CV or fill in your work history.
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  if (isLocked) {
                    alert(
                      "Resume Slots 2 & 3 are available on the Pro plan to target different tech stacks simultaneously. Contact admin or upgrade to unlock."
                    );
                    return;
                  }
                  setActiveSlot(slotNum);
                  setLabel(resume ? resume.label : `Resume Slot ${slotNum}`);
                }}
                className="actionBtn"
                style={{
                  width: "100%",
                  textAlign: "center",
                  background: isLocked ? "#f8fafc" : undefined,
                  color: isLocked ? "#92400e" : undefined,
                }}
              >
                {isLocked ? "🔒 Unlock with Pro" : resume ? "Replace / Edit Slot" : "Setup Slot " + slotNum}
              </button>
            </div>
          );
        })}
      </div>

      {activeSlot && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 30,
              width: "100%",
              maxWidth: 500,
              boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 20, color: "var(--navy)" }}>
              Configure Resume (Slot {activeSlot})
            </h2>

            <div style={{ display: "flex", gap: 10, margin: "16px 0 20px" }}>
              <button
                type="button"
                className={`tab ${mode === "upload" ? "active" : ""}`}
                onClick={() => setMode("upload")}
              >
                Upload PDF CV
              </button>
              <button
                type="button"
                className={`tab ${mode === "manual" ? "active" : ""}`}
                onClick={() => setMode("manual")}
              >
                Enter Experience Manually
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Target Role Label (e.g. Frontend Engineer, Mobile Developer)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. React Native Developer"
                  required
                  style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
                />
              </div>

              {mode === "upload" ? (
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    Upload Resume PDF
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
                  />
                  <small style={{ color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                    Gemini will automatically extract your contact details, experience, and core skills.
                  </small>
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      Professional Summary
                    </label>
                    <textarea
                      value={manualExperience.summary}
                      onChange={(e) => setManualExperience({ ...manualExperience, summary: e.target.value })}
                      placeholder="Experienced engineer specializing in..."
                      rows={3}
                      style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      Core Skills (comma separated)
                    </label>
                    <input
                      type="text"
                      value={manualExperience.skills}
                      onChange={(e) => setManualExperience({ ...manualExperience, skills: e.target.value })}
                      placeholder="React, TypeScript, Next.js, Node.js"
                      style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                        Recent Company
                      </label>
                      <input
                        type="text"
                        value={manualExperience.company}
                        onChange={(e) => setManualExperience({ ...manualExperience, company: e.target.value })}
                        placeholder="Company name"
                        style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                        Role Title
                      </label>
                      <input
                        type="text"
                        value={manualExperience.role}
                        onChange={(e) => setManualExperience({ ...manualExperience, role: e.target.value })}
                        placeholder="e.g. Senior Frontend Dev"
                        style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setActiveSlot(null)}
                  className="actionBtn"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="actionBtn primary"
                >
                  {submitting ? "Analyzing & Saving..." : "Save Resume"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

