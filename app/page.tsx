"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface JobMatch {
  match: {
    id: string;
    jobId: string;
    bestResumeId: string | null;
    matchScore: number;
    status: string;
    gapAnalysis?: {
      fitLevel?: string;
      summaryReasoning?: string;
      strengths?: string[];
      missingCriticalSkills?: string[];
      missingNiceToHaves?: string[];
    } | null;
    tailoredSuggestions?: {
      summaryTweak?: string;
      suggestedBulletEdits?: Array<{
        originalBullet?: string;
        improvedBullet?: string;
      }>;
      keywordsToIntegrate?: string[];
    } | null;
    notes?: string;
  };
  job: {
    id: string;
    company: string;
    title: string;
    description: string;
    location?: string;
    remoteType?: string;
    salaryEst?: string;
    applyUrl?: string;
    source: string;
  };
  bestResume?: {
    id: string;
    label: string;
    slotNumber: number;
    fileUrl?: string;
  } | null;
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Matches" },
  { value: "NEW", label: "New" },
  { value: "SAVED", label: "Saved" },
  { value: "APPLIED", label: "Applied" },
  { value: "INTERVIEW", label: "Interview" },
  { value: "REJECTED", label: "Rejected" },
];

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [selectedMatch, setSelectedMatch] = useState<JobMatch | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const sessionUser = (session as any)?.user;
  const userId = sessionUser?.id;

  useEffect(() => {
    if (!isPending && !userId) {
      router.push("/login");
    } else if (userId) {
      // Only show full loading placeholder on initial empty load to preserve scroll position
      loadMatches(matches.length === 0);
    }
  }, [userId, isPending, activeTab]);

  async function loadMatches(showLoading = false) {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const url = activeTab === "ALL" ? "/api/matches" : `/api/matches?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.matches) {
        setMatches(data.matches);
      }
    } catch (err) {
      console.error("Failed to load matches", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(matchId: string, status: string) {
    try {
      const res = await fetch("/api/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, status }),
      });
      if (res.ok) {
        setMatches((prev) =>
          prev.map((m) =>
            m.match.id === matchId ? { ...m, match: { ...m.match, status } } : m
          )
        );
        if (selectedMatch?.match.id === matchId) {
          setSelectedMatch((prev) =>
            prev ? { ...prev, match: { ...prev.match, status } } : null
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function runGapAnalysis(matchId: string) {
    try {
      setAnalyzing(true);
      const res = await fetch(`/api/matches/${matchId}/analyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.analysis) {
        // Update local state
        setMatches((prev) =>
          prev.map((m) =>
            m.match.id === matchId
              ? {
                  ...m,
                  match: {
                    ...m.match,
                    matchScore: data.analysis.matchScore,
                    gapAnalysis: data.analysis,
                    tailoredSuggestions: data.analysis.tailoredSuggestions,
                  },
                }
              : m
          )
        );

        if (selectedMatch?.match.id === matchId) {
          setSelectedMatch((prev) =>
            prev
              ? {
                  ...prev,
                  match: {
                    ...prev.match,
                    matchScore: data.analysis.matchScore,
                    gapAnalysis: data.analysis,
                    tailoredSuggestions: data.analysis.tailoredSuggestions,
                  },
                }
              : null
          );
        }
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert("Failed to run gap analysis: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/matches/sync", { method: "POST" });
      const data = await res.json();
      alert(`Job matching synced! ${data.matched || 0} new matches added.`);
      await loadMatches();
    } catch (err: any) {
      alert("Failed to sync matches: " + err.message);
    } finally {
      setSyncing(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const stats = useMemo(() => {
    return {
      total: matches.length,
      highFit: matches.filter((m) => m.match.matchScore >= 75).length,
      applied: matches.filter((m) => m.match.status === "APPLIED").length,
      interview: matches.filter((m) => m.match.status === "INTERVIEW").length,
    };
  }, [matches]);

  if (isPending) {
    return <div className="wrap" style={{ textAlign: "center", paddingTop: 100 }}>Loading session...</div>;
  }

  return (
    <div className="wrap">
      {/* Top Navigation */}
      <div className="pageHead">
        <div>
          <h1 className="wordmark">Job Pipeline</h1>
          <p className="tagline">
            Automated role matching across your 3 specialized CVs with AI-powered resume gap analysis.
          </p>
        </div>
        <div className="headActions">
          {sessionUser?.role === "admin" && (
            <Link
              href="/admin"
              className="actionBtn"
              style={{
                textDecoration: "none",
                background: "#fef3c7",
                borderColor: "#fde68a",
                color: "#92400e",
                fontWeight: 600,
              }}
            >
              ⚡ Admin Portal
            </Link>
          )}
          <Link href="/resumes" className="actionBtn" style={{ textDecoration: "none" }}>
            Manage 3 Resumes
          </Link>
          <button onClick={handleSync} disabled={syncing} className="actionBtn primary">
            {syncing ? "Syncing..." : "Sync Jobs"}
          </button>
          <button
            onClick={async () => {
              await (authClient as any).signOut?.();
              router.push("/login");
            }}
            className="ghostBtn"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="statRow">
        <div className="stat">
          <span className="statNumber">{stats.total}</span>
          <span className="statLabel">Total Matches</span>
        </div>
        <div className="stat">
          <span className="statNumber" style={{ color: "var(--status-applied)" }}>
            {stats.highFit}
          </span>
          <span className="statLabel">Strong Fits (75%+)</span>
        </div>
        <div className="stat">
          <span className="statNumber" style={{ color: "var(--status-approved)" }}>
            {stats.applied}
          </span>
          <span className="statLabel">Applied</span>
        </div>
        <div className="stat">
          <span className="statNumber" style={{ color: "var(--status-interview)" }}>
            {stats.interview}
          </span>
          <span className="statLabel">Interviews</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="tabs">
        {STATUS_OPTIONS.map((tab) => (
          <button
            key={tab.value}
            className={`tab ${activeTab === tab.value ? "active" : ""}`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Matches List */}
      <div className="panel">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Loading job matches...
          </div>
        ) : matches.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            No matches found for this filter.
            <div style={{ marginTop: 12 }}>
              <Link href="/resumes" className="actionBtn primary" style={{ textDecoration: "none" }}>
                Setup Your Resumes First
              </Link>
            </div>
          </div>
        ) : (
          matches.map((item) => {
            const { match, job, bestResume } = item;
            const score = Math.round(match.matchScore);
            return (
              <div key={match.id} className="jobRow">
                <div className="jobMain">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: score >= 75 ? "#dcfce7" : score >= 60 ? "#fef3c7" : "#f1f5f9",
                        color: score >= 75 ? "#166534" : score >= 60 ? "#92400e" : "#475569",
                      }}
                    >
                      {score}% Match
                    </span>
                    {bestResume && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#e0e7ff",
                          color: "#3730a3",
                          fontWeight: 500,
                        }}
                      >
                        CV: {bestResume.label} (Slot {bestResume.slotNumber})
                      </span>
                    )}
                  </div>

                  <h3 className="jobTitle">
                    <a href={job.applyUrl || "#"} target="_blank" rel="noopener noreferrer">
                      {job.title}
                    </a>
                  </h3>

                  <div className="jobCompany">
                    <span className="company">{job.company}</span>
                    <span className="location">{job.location || "Remote"}</span>
                    {job.salaryEst && (
                      <span style={{ color: "var(--status-applied)", fontWeight: 500 }}>
                        {job.salaryEst}
                      </span>
                    )}
                  </div>

                  {match.gapAnalysis?.summaryReasoning && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                        marginTop: 8,
                        marginBottom: 0,
                        background: "#f8fafc",
                        padding: "6px 10px",
                        borderRadius: 6,
                        borderLeft: "3px solid var(--navy)",
                      }}
                    >
                      <strong>Fit Insight:</strong> {match.gapAnalysis.summaryReasoning}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <button
                    onClick={() => {
                      setSelectedMatch(item);
                      if (!match.gapAnalysis) {
                        runGapAnalysis(match.id);
                      }
                    }}
                    className="actionBtn primary"
                    style={{ fontSize: 13 }}
                  >
                    {match.gapAnalysis ? "View Resume Tips & Gap" : "Analyze Fit & Tips"}
                  </button>

                  <div style={{ display: "flex", gap: 6 }}>
                    {match.status !== "APPLIED" && (
                      <button
                        onClick={() => updateStatus(match.id, "APPLIED")}
                        className="actionBtn"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                      >
                        Mark Applied
                      </button>
                    )}
                    {match.status !== "INTERVIEW" && (
                      <button
                        onClick={() => updateStatus(match.id, "INTERVIEW")}
                        className="actionBtn"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                      >
                        Interview
                      </button>
                    )}
                    {match.status !== "REJECTED" && (
                      <button
                        onClick={() => updateStatus(match.id, "REJECTED")}
                        className="actionBtn"
                        style={{ fontSize: 12, padding: "4px 8px", color: "var(--status-rejected)" }}
                      >
                        Pass
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Gap Analysis & Resume Suggestions Modal */}
      {selectedMatch && (
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
              maxWidth: 700,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 12,
                    background: "#e0f2fe",
                    color: "#0369a1",
                    textTransform: "uppercase",
                  }}
                >
                  {selectedMatch.match.gapAnalysis?.fitLevel || "Candidate Fit Analysis"}
                </span>
                <h2 style={{ margin: "8px 0 4px", fontSize: 22, color: "var(--navy)" }}>
                  {selectedMatch.job.title}
                </h2>
                <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                  {selectedMatch.job.company} &bull; Matched CV:{" "}
                  <strong>{selectedMatch.bestResume?.label || "General CV"}</strong>
                </div>
              </div>
              <button
                onClick={() => setSelectedMatch(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  cursor: "pointer",
                  color: "var(--text-faint)",
                }}
              >
                &times;
              </button>
            </div>

            {analyzing ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
                Evaluating role requirements and generating actionable resume suggestions with Gemini...
              </div>
            ) : selectedMatch.match.gapAnalysis ? (
              <div style={{ marginTop: 24 }}>
                {/* Summary reasoning */}
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "var(--navy)" }}>
                    Match Reasoning ({Math.round(selectedMatch.match.matchScore)}/100)
                  </h4>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--text)" }}>
                    {selectedMatch.match.gapAnalysis.summaryReasoning}
                  </p>
                </div>

                {/* Strengths & Missing Skills Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 14, borderRadius: 8 }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#166534" }}>
                      Matched Strengths
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#14532d" }}>
                      {(selectedMatch.match.gapAnalysis.strengths || []).map((s, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>{s}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 14, borderRadius: 8 }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#991b1b" }}>
                      Missing Critical Skills
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#7f1d1d" }}>
                      {(selectedMatch.match.gapAnalysis.missingCriticalSkills || []).map((s, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Tailored Suggestions */}
                {selectedMatch.match.tailoredSuggestions && (
                  <div>
                    <h3 style={{ fontSize: 16, color: "var(--navy)", marginBottom: 12 }}>
                      Actionable Resume Improvements
                    </h3>

                    {/* Summary Tweak */}
                    {selectedMatch.match.tailoredSuggestions.summaryTweak && (
                      <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
                            Tailored Summary Rewrite
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                selectedMatch.match.tailoredSuggestions!.summaryTweak!,
                                "summary"
                              )
                            }
                            className="chip"
                            style={{ cursor: "pointer" }}
                          >
                            {copiedKey === "summary" ? "Copied!" : "Copy"}
                          </button>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                          {selectedMatch.match.tailoredSuggestions.summaryTweak}
                        </p>
                      </div>
                    )}

                    {/* Bullet Edits */}
                    {(selectedMatch.match.tailoredSuggestions.suggestedBulletEdits || []).map((b, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: 12,
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 14,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)" }}>
                            Suggested Bullet Rewrite #{idx + 1}
                          </span>
                          <button
                            onClick={() => copyToClipboard(b.improvedBullet || "", `bullet-${idx}`)}
                            className="chip"
                            style={{ cursor: "pointer" }}
                          >
                            {copiedKey === `bullet-${idx}` ? "Copied!" : "Copy Bullet"}
                          </button>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-faint)", textDecoration: "line-through", marginBottom: 4 }}>
                          {b.originalBullet}
                        </div>
                        <div style={{ fontSize: 13, color: "#166534", fontWeight: 500 }}>
                          {b.improvedBullet}
                        </div>
                      </div>
                    ))}

                    {/* Keywords to integrate */}
                    {selectedMatch.match.tailoredSuggestions.keywordsToIntegrate && (
                      <div style={{ marginTop: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                          Keywords to integrate for ATS scan:
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {selectedMatch.match.tailoredSuggestions.keywordsToIntegrate.map((kw, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: 12,
                                background: "#fef3c7",
                                color: "#92400e",
                                padding: "3px 8px",
                                borderRadius: 4,
                                fontWeight: 500,
                              }}
                            >
                              + {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "30px 0", textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                  No detailed gap analysis generated yet for this job.
                </p>
                <button
                  onClick={() => runGapAnalysis(selectedMatch.match.id)}
                  className="actionBtn primary"
                >
                  Run Deep Gemini Gap Analysis
                </button>
              </div>
            )}

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <a
                href={selectedMatch.job.applyUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="actionBtn primary"
                style={{ textDecoration: "none" }}
              >
                Apply on Company Site &rarr;
              </a>
              <button onClick={() => setSelectedMatch(null)} className="actionBtn">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
