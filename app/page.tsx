"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession, authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface InterviewPrepData {
  behavioralQuestions?: Array<{
    question: string;
    whyAsked: string;
    answerFramework: string;
  }>;
  technicalQuestions?: Array<{
    question: string;
    topic: string;
    difficulty: string;
    hints: string;
  }>;
  systemDesignTopics?: Array<{
    scenario: string;
    keyConsiderations: string;
    relevanceToRole: string;
  }>;
  preparationTips?: string[];
  practiceAreas?: Array<{
    area: string;
    priority: string;
    resources: string;
  }>;
}

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
    interviewPrep?: InterviewPrepData | null;
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
    tags?: string[];
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

function matchLocationRegion(location: string, region: string, tags?: string[]): boolean {
  const loc = (location || "").toLowerCase();
  const isWorldwideTagged =
    tags?.includes("Worldwide Remote") ||
    /worldwide|anywhere|global|distributed/i.test(loc);

  switch (region) {
    case "worldwide":
      return isWorldwideTagged || loc === "remote" || loc === "";
    case "us":
      return /united states|usa|\bus\b|u\.s\.|america|california|san francisco|new york|seattle|austin|texas|chicago|los angeles|boston|remote - us|us - remote/i.test(
        loc
      );
    case "europe_uk":
      return /united kingdom|\buk\b|london|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|madrid|barcelona|europe|ireland|dublin|poland|sweden|switzerland/i.test(
        loc
      );
    case "canada":
      return /canada|toronto|vancouver|ontario|montreal|quebec|alberta/i.test(loc);
    case "apac":
      return /singapore|japan|tokyo|australia|sydney|melbourne|south korea|seoul|india|bengaluru|bangalore|apac|asia/i.test(
        loc
      );
    case "latam":
      return /mexico|brazil|latam|argentina|colombia|latin america/i.test(loc);
    default:
      if (region.startsWith("exact:")) {
        const target = region.slice(6).toLowerCase();
        return loc.includes(target);
      }
      return loc.includes(region.toLowerCase());
  }
}

function getWorkplaceType(job: JobMatch["job"]): "remote" | "hybrid" | "onsite" {
  if (job.remoteType === "hybrid" || job.tags?.includes("Hybrid")) {
    return "hybrid";
  }
  if (job.remoteType === "onsite" || job.tags?.includes("On-site")) {
    return "onsite";
  }

  const combined = `${job.location || ""} ${job.title} ${job.description || ""}`.toLowerCase();
  const tagsStr = (job.tags || []).join(" ").toLowerCase();

  if (tagsStr.includes("hybrid") || combined.includes("hybrid")) {
    return "hybrid";
  }

  if (
    tagsStr.includes("on-site") ||
    tagsStr.includes("onsite") ||
    /(on[- ]?site|in[- ]?office|office based)/i.test(combined)
  ) {
    return "onsite";
  }

  if (
    job.remoteType === "remote" ||
    tagsStr.includes("remote") ||
    tagsStr.includes("worldwide remote") ||
    tagsStr.includes("region-specific remote") ||
    /(remote|worldwide|anywhere|telework|work from home)/i.test(combined)
  ) {
    return "remote";
  }

  if (job.location && job.location.trim() !== "" && job.location.toLowerCase() !== "remote") {
    return "onsite";
  }

  return "remote";
}

function matchJobType(job: JobMatch["job"], type: string): boolean {
  const workplace = getWorkplaceType(job);
  const isWorldwideJob =
    job.tags?.includes("Worldwide Remote") ||
    /worldwide|anywhere|global/i.test(job.location || "");
  const isRegionJob = workplace === "remote" && !isWorldwideJob;

  const titleAndDesc = `${job.title} ${job.description || ""}`.toLowerCase();
  const isContract = /(contract|freelance|contractor|temp)/i.test(titleAndDesc);
  const isFullTime = /(full[- ]?time)/i.test(titleAndDesc);

  switch (type) {
    case "remote":
      return workplace === "remote";
    case "hybrid":
      return workplace === "hybrid";
    case "onsite":
      return workplace === "onsite";
    case "worldwide_remote":
      return isWorldwideJob;
    case "region_remote":
      return isRegionJob;
    case "full_time":
      return isFullTime;
    case "contract":
      return isContract;
    default:
      return true;
  }
}

function matchResumeSlot(bestResume: JobMatch["bestResume"], slot: string): boolean {
  if (slot === "ALL") return true;
  return String(bestResume?.slotNumber) === slot;
}

function matchSearch(item: JobMatch, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().trim();
  const title = (item.job.title || "").toLowerCase();
  const company = (item.job.company || "").toLowerCase();
  const loc = (item.job.location || "").toLowerCase();
  const cvLabel = (item.bestResume?.label || "").toLowerCase();
  const reasoning = (item.match.gapAnalysis?.summaryReasoning || "").toLowerCase();
  const tags = (item.job.tags || []).join(" ").toLowerCase();

  return (
    title.includes(q) ||
    company.includes(q) ||
    loc.includes(q) ||
    cvLabel.includes(q) ||
    reasoning.includes(q) ||
    tags.includes(q)
  );
}

export default function Dashboard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [resumeFilter, setResumeFilter] = useState("ALL");

  const [selectedMatch, setSelectedMatch] = useState<JobMatch | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [preparingInterview, setPreparingInterview] = useState(false);
  const [modalTab, setModalTab] = useState<"gap" | "interview">("gap");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    message: string;
    type: "success" | "info" | "error";
  } | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState("");

  const sessionUser = (session as any)?.user;
  const userId = sessionUser?.id;

  useEffect(() => {
    if (!isPending && !userId) {
      router.push("/login");
    } else if (userId) {
      // Only show full loading placeholder on initial empty load to preserve scroll position
      loadMatches(matches.length === 0);
    }
  }, [userId, isPending]);

  async function loadMatches(showLoading = false) {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const res = await fetch("/api/matches");
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

  async function handleResendVerification() {
    if (!sessionUser?.email) return;
    setResendingVerification(true);
    setVerificationFeedback("");
    try {
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sessionUser.email, callbackURL: "/" }),
      });
      if (res.ok) {
        setVerificationFeedback("Verification link sent! Check your inbox.");
      } else {
        const data = await res.json().catch(() => ({}));
        setVerificationFeedback(data.message || "Failed to send verification email.");
      }
    } catch (err: any) {
      setVerificationFeedback("Error: " + err.message);
    } finally {
      setResendingVerification(false);
    }
  }

  async function runGapAnalysis(matchId: string) {
    if (sessionUser && sessionUser.emailVerified === false) {
      alert(
        "Please verify your email address to unlock AI Resume Gap Analysis. Check your inbox or click 'Resend Verification Email' at the top of the page."
      );
      return;
    }
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

  async function runInterviewPrep(matchId: string) {
    if (sessionUser && sessionUser.emailVerified === false) {
      alert(
        "Please verify your email address to generate AI Interview Prep. Check your inbox or click 'Resend Verification Email' at the top of the page."
      );
      return;
    }
    try {
      setPreparingInterview(true);
      const res = await fetch(`/api/matches/${matchId}/interview-prep`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.interviewPrep) {
        setMatches((prev) =>
          prev.map((m) =>
            m.match.id === matchId
              ? {
                  ...m,
                  match: {
                    ...m.match,
                    interviewPrep: data.interviewPrep,
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
                    interviewPrep: data.interviewPrep,
                  },
                }
              : null
          );
        }
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert("Failed to generate interview prep: " + err.message);
    } finally {
      setPreparingInterview(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch("/api/matches/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Sync failed");

      const count = Number(data.matched || 0);
      const total = Number(data.totalTop || matches.length || 50);

      if (count > 0) {
        setSyncFeedback({
          message: `🎯 Sync complete! Added or updated ${count} higher-scoring job matches.`,
          type: "success",
        });
      } else {
        setSyncFeedback({
          message: `✨ All matches are up to date! Displaying your top ${total} roles actively matched across your resumes.`,
          type: "info",
        });
      }
      await loadMatches();
    } catch (err: any) {
      setSyncFeedback({
        message: "Failed to sync matches: " + err.message,
        type: "error",
      });
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

  const statusCounts = useMemo(() => {
    const baseFiltered = matches.filter((item) => {
      if (locationFilter !== "ALL" && !matchLocationRegion(item.job.location || "", locationFilter, item.job.tags)) {
        return false;
      }
      if (typeFilter !== "ALL" && !matchJobType(item.job, typeFilter)) {
        return false;
      }
      if (resumeFilter !== "ALL" && !matchResumeSlot(item.bestResume, resumeFilter)) {
        return false;
      }
      if (!matchSearch(item, searchQuery)) {
        return false;
      }
      return true;
    });

    const counts: Record<string, number> = {
      ALL: baseFiltered.length,
      NEW: 0,
      SAVED: 0,
      APPLIED: 0,
      INTERVIEW: 0,
      REJECTED: 0,
    };

    for (const m of baseFiltered) {
      const st = m.match.status;
      if (counts[st] !== undefined) {
        counts[st] = (counts[st] || 0) + 1;
      }
    }

    return counts;
  }, [matches, locationFilter, typeFilter, resumeFilter, searchQuery]);

  const dynamicLocations = useMemo(() => {
    const locSet = new Set<string>();
    for (const m of matches) {
      const loc = m.job.location?.trim();
      if (loc && loc.toLowerCase() !== "remote" && loc.toLowerCase() !== "worldwide") {
        locSet.add(loc);
      }
    }
    return Array.from(locSet).slice(0, 25).sort();
  }, [matches]);

  const resumeOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of matches) {
      if (m.bestResume?.slotNumber) {
        map.set(m.bestResume.slotNumber, m.bestResume.label);
      }
    }
    return Array.from(map.entries())
      .map(([slotNumber, label]) => ({ slotNumber, label }))
      .sort((a, b) => a.slotNumber - b.slotNumber);
  }, [matches]);

  const locationFilterLabel = useMemo(() => {
    switch (locationFilter) {
      case "worldwide":
        return "Worldwide / Anywhere";
      case "us":
        return "United States / North America";
      case "europe_uk":
        return "Europe & UK";
      case "canada":
        return "Canada";
      case "apac":
        return "Asia-Pacific";
      case "latam":
        return "Latin America";
      default:
        if (locationFilter.startsWith("exact:")) {
          return locationFilter.slice(6);
        }
        return locationFilter;
    }
  }, [locationFilter]);

  const typeFilterLabel = useMemo(() => {
    switch (typeFilter) {
      case "remote":
        return "Remote Roles";
      case "hybrid":
        return "Hybrid Roles";
      case "onsite":
        return "On-site Roles";
      case "worldwide_remote":
        return "Worldwide Remote";
      case "region_remote":
        return "Region-Specific Remote";
      case "full_time":
        return "Full-Time";
      case "contract":
        return "Contract / Freelance";
      default:
        return typeFilter;
    }
  }, [typeFilter]);

  const resumeFilterLabel = useMemo(() => {
    const opt = resumeOptions.find((r) => String(r.slotNumber) === resumeFilter);
    return opt ? `Slot ${opt.slotNumber}: ${opt.label}` : `Slot ${resumeFilter}`;
  }, [resumeFilter, resumeOptions]);

  const hasActiveFilters =
    locationFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    resumeFilter !== "ALL" ||
    searchQuery.trim().length > 0;

  function resetFilters() {
    setLocationFilter("ALL");
    setTypeFilter("ALL");
    setResumeFilter("ALL");
    setSearchQuery("");
  }

  const filteredMatches = useMemo(() => {
    return matches.filter((item) => {
      // 1. Status Filter
      if (activeTab !== "ALL" && item.match.status !== activeTab) {
        return false;
      }
      // 2. Location Filter
      if (locationFilter !== "ALL" && !matchLocationRegion(item.job.location || "", locationFilter, item.job.tags)) {
        return false;
      }
      // 3. Job Type Filter
      if (typeFilter !== "ALL" && !matchJobType(item.job, typeFilter)) {
        return false;
      }
      // 4. Resume Slot Filter
      if (resumeFilter !== "ALL" && !matchResumeSlot(item.bestResume, resumeFilter)) {
        return false;
      }
      // 5. Search Query
      if (!matchSearch(item, searchQuery)) {
        return false;
      }
      return true;
    });
  }, [matches, activeTab, locationFilter, typeFilter, resumeFilter, searchQuery]);

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

      {/* Sync Status Banner */}
      {syncFeedback && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13.5,
            fontWeight: 500,
            background:
              syncFeedback.type === "success"
                ? "#f0fdf4"
                : syncFeedback.type === "info"
                ? "#eff6ff"
                : "#fef2f2",
            border:
              syncFeedback.type === "success"
                ? "1px solid #bbf7d0"
                : syncFeedback.type === "info"
                ? "1px solid #bfdbfe"
                : "1px solid #fecaca",
            color:
              syncFeedback.type === "success"
                ? "#166534"
                : syncFeedback.type === "info"
                ? "#1e40af"
                : "#991b1b",
          }}
        >
          <span>{syncFeedback.message}</span>
          <button
            onClick={() => setSyncFeedback(null)}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "inherit",
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Email Verification Banner */}
      {sessionUser && sessionUser.emailVerified === false && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 10,
            padding: "14px 20px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>✉️</span>
            <div>
              <div style={{ fontWeight: 600, color: "#92400e", fontSize: 14 }}>
                Please verify your email address
              </div>
              <div style={{ fontSize: 13, color: "#b45309", marginTop: 2 }}>
                We sent a verification link to <strong>{sessionUser.email}</strong>. Please confirm your email to unlock AI Resume Gap Analysis and Interview Prep.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {verificationFeedback ? (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>
                {verificationFeedback}
              </span>
            ) : (
              <button
                onClick={handleResendVerification}
                disabled={resendingVerification}
                className="actionBtn"
                style={{
                  fontSize: 12.5,
                  padding: "6px 14px",
                  background: "#fff",
                  borderColor: "#fcd34d",
                  color: "#92400e",
                  fontWeight: 600,
                }}
              >
                {resendingVerification ? "Sending..." : "Resend Verification Email"}
              </button>
            )}
          </div>
        </div>
      )}

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
        {STATUS_OPTIONS.map((tab) => {
          const count = statusCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              className={`tab ${activeTab === tab.value ? "active" : ""}`}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === tab.value ? "var(--navy)" : "#e2e8f0",
                  color: activeTab === tab.value ? "#ffffff" : "#475569",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Multi-Filter Bar */}
      <div className="filterBar">
        <div className="filterRow">
          {/* Keyword Search */}
          <div className="filterSearch" style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-faint)",
                fontSize: 13,
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Filter by title, company, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px 8px 32px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13.5,
                outline: "none",
                background: "#faf9f6",
                color: "var(--text)",
                minHeight: 38,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  fontSize: 16,
                  color: "var(--text-faint)",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                &times;
              </button>
            )}
          </div>

          {/* Location Dropdown */}
          <div className="filterGroup">
            <label
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--navy)",
                whiteSpace: "nowrap",
              }}
            >
              📍 Location:
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="filterSelect"
              style={{
                maxWidth: 195,
                width: "100%",
                textOverflow: "ellipsis",
                overflow: "hidden",
                borderColor: locationFilter !== "ALL" ? "#93c5fd" : "var(--border)",
                background: locationFilter !== "ALL" ? "#eff6ff" : "#fff",
                color: locationFilter !== "ALL" ? "#1e40af" : "var(--text)",
                fontWeight: locationFilter !== "ALL" ? 600 : 400,
              }}
            >
              <option value="ALL">All Locations</option>
              <optgroup label="Regions">
                <option value="worldwide">🌍 Worldwide</option>
                <option value="us">🇺🇸 United States</option>
                <option value="europe_uk">🇬🇧 Europe & UK</option>
                <option value="canada">🇨🇦 Canada</option>
                <option value="apac">🌏 Asia-Pacific</option>
                <option value="latam">🌎 Latin America</option>
              </optgroup>
              {dynamicLocations.length > 0 && (
                <optgroup label="Specific Locations in Matches">
                  {dynamicLocations.map((loc) => {
                    const displayLoc = loc.length > 25 ? `${loc.slice(0, 23)}...` : loc;
                    return (
                      <option key={loc} value={`exact:${loc}`} title={loc}>
                        {displayLoc}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>

          {/* Job Type Dropdown */}
          <div className="filterGroup">
            <label
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--navy)",
                whiteSpace: "nowrap",
              }}
            >
              💼 Type:
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="filterSelect"
              style={{
                maxWidth: 195,
                width: "100%",
                textOverflow: "ellipsis",
                overflow: "hidden",
                borderColor: typeFilter !== "ALL" ? "#c4b5fd" : "var(--border)",
                background: typeFilter !== "ALL" ? "#f5f3ff" : "#fff",
                color: typeFilter !== "ALL" ? "#5b21b6" : "var(--text)",
                fontWeight: typeFilter !== "ALL" ? 600 : 400,
              }}
            >
              <option value="ALL">All Types & Arrangements</option>
              <optgroup label="Workplace Arrangement">
                <option value="remote">🌍 Remote (All)</option>
                <option value="hybrid">🏢 Hybrid</option>
                <option value="onsite">🏛️ On-site / In-Office</option>
                <option value="worldwide_remote">🌐 Worldwide Remote</option>
                <option value="region_remote">📍 Region-Specific Remote</option>
              </optgroup>
              <optgroup label="Employment Type">
                <option value="full_time">⏱️ Full-Time</option>
                <option value="contract">📑 Contract / Freelance</option>
              </optgroup>
            </select>
          </div>

          {/* CV Track Dropdown */}
          <div className="filterGroup">
            <label
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--navy)",
                whiteSpace: "nowrap",
              }}
            >
              📄 CV:
            </label>
            <select
              value={resumeFilter}
              onChange={(e) => setResumeFilter(e.target.value)}
              className="filterSelect"
              style={{
                maxWidth: 180,
                width: "100%",
                textOverflow: "ellipsis",
                overflow: "hidden",
                borderColor: resumeFilter !== "ALL" ? "#fcd34d" : "var(--border)",
                background: resumeFilter !== "ALL" ? "#fef3c7" : "#fff",
                color: resumeFilter !== "ALL" ? "#92400e" : "var(--text)",
                fontWeight: resumeFilter !== "ALL" ? 600 : 400,
              }}
            >
              <option value="ALL">All Resumes</option>
              {resumeOptions.map((resOpt) => {
                const labelDisplay =
                  resOpt.label.length > 20 ? `${resOpt.label.slice(0, 18)}...` : resOpt.label;
                return (
                  <option key={resOpt.slotNumber} value={String(resOpt.slotNumber)} title={resOpt.label}>
                    Slot {resOpt.slotNumber}: {labelDisplay}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Active Filters Summary & Chips */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            paddingTop: hasActiveFilters ? 10 : 0,
            borderTop: hasActiveFilters ? "1px solid #f1ede6" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
              Showing <strong>{filteredMatches.length}</strong> of <strong>{matches.length}</strong> matches
            </span>

            {locationFilter !== "ALL" && (
              <span className="filterChip" onClick={() => setLocationFilter("ALL")}>
                📍 {locationFilterLabel} &times;
              </span>
            )}
            {typeFilter !== "ALL" && (
              <span className="filterChip" onClick={() => setTypeFilter("ALL")}>
                💼 {typeFilterLabel} &times;
              </span>
            )}
            {resumeFilter !== "ALL" && (
              <span className="filterChip" onClick={() => setResumeFilter("ALL")}>
                📄 {resumeFilterLabel} &times;
              </span>
            )}
            {searchQuery.trim() && (
              <span className="filterChip" onClick={() => setSearchQuery("")}>
                🔍 &ldquo;{searchQuery.trim()}&rdquo; &times;
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              style={{
                background: "none",
                border: "none",
                color: "var(--status-rejected)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
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
        ) : filteredMatches.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600, color: "var(--navy)", fontSize: 16 }}>
              No job matches found
            </div>
            <p style={{ fontSize: 13.5, marginTop: 4, marginBottom: 16, color: "var(--text-muted)" }}>
              No matches meet your selected filter criteria. Try broadening your location or job type.
            </p>
            <button onClick={resetFilters} className="actionBtn primary" style={{ fontSize: 13 }}>
              Reset All Filters
            </button>
          </div>
        ) : (
          filteredMatches.map((item) => {
            const { match, job, bestResume } = item;
            const score = Math.round(match.matchScore);
            const workplace = getWorkplaceType(job);
            const isWorldwide =
              job.tags?.includes("Worldwide Remote") ||
              /worldwide|anywhere|global/i.test(job.location || "");
            const isContract = /(contract|freelance|contractor|temp)/i.test(
              `${job.title} ${job.description || ""}`
            );
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

                  <div className="jobCompany" style={{ alignItems: "center" }}>
                    <span className="company">{job.company}</span>
                    <span className="location">📍 {job.location || "Remote"}</span>
                    {workplace === "hybrid" ? (
                      <span
                        style={{
                          fontSize: 11.5,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#f5f3ff",
                          color: "#6b21a8",
                          fontWeight: 600,
                        }}
                      >
                        🏢 Hybrid
                      </span>
                    ) : workplace === "onsite" ? (
                      <span
                        style={{
                          fontSize: 11.5,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#f1f5f9",
                          color: "#334155",
                          fontWeight: 600,
                        }}
                      >
                        🏛️ On-site
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11.5,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: isWorldwide ? "#dcfce7" : "#eff6ff",
                          color: isWorldwide ? "#166534" : "#1d4ed8",
                          fontWeight: 600,
                        }}
                      >
                        {isWorldwide ? "🌍 Worldwide Remote" : "🌐 Region Remote"}
                      </span>
                    )}
                    {isContract && (
                      <span
                        style={{
                          fontSize: 11.5,
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: "#fef3c7",
                          color: "#92400e",
                          fontWeight: 600,
                        }}
                      >
                        📑 Contract
                      </span>
                    )}
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

                <div className="jobRowActions">
                  <div className="actionRow">
                    <button
                      onClick={() => {
                        setSelectedMatch(item);
                        setModalTab("gap");
                        if (!match.gapAnalysis) {
                          runGapAnalysis(match.id);
                        }
                      }}
                      className="actionBtn primary"
                      style={{ fontSize: 13 }}
                    >
                      {match.gapAnalysis ? "View Resume Tips & Gap" : "Analyze Fit & Tips"}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMatch(item);
                        setModalTab("interview");
                        if (!match.interviewPrep) {
                          runInterviewPrep(match.id);
                        }
                      }}
                      className="actionBtn"
                      style={{
                        fontSize: 13,
                        background: "#ede9fe",
                        borderColor: "#c4b5fd",
                        color: "#5b21b6",
                        fontWeight: 600,
                      }}
                    >
                      {match.interviewPrep ? "View Interview Prep" : "🎯 Interview Prep"}
                    </button>
                  </div>

                  <div className="actionRow">
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

      {/* Gap Analysis & Interview Prep Modal */}
      {selectedMatch && (
        <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedMatch(null); }}>
          <div className="modalDialog">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 12,
                    background: modalTab === "interview" ? "#ede9fe" : "#e0f2fe",
                    color: modalTab === "interview" ? "#5b21b6" : "#0369a1",
                    textTransform: "uppercase",
                  }}
                >
                  {modalTab === "interview"
                    ? "Interview Prep"
                    : selectedMatch.match.gapAnalysis?.fitLevel || "Candidate Fit Analysis"}
                </span>
                <h2 style={{ margin: "8px 0 4px", fontSize: 22, color: "var(--navy)" }}>
                  {selectedMatch.job.title}
                </h2>
                <div style={{ fontSize: 13.5, color: "var(--text-muted)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px", marginTop: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--navy)" }}>{selectedMatch.job.company}</span>
                  <span>&bull;</span>
                  <span>📍 {selectedMatch.job.location || "Remote"}</span>
                  <span>&bull;</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background:
                        getWorkplaceType(selectedMatch.job) === "hybrid"
                          ? "#f5f3ff"
                          : getWorkplaceType(selectedMatch.job) === "onsite"
                          ? "#f1f5f9"
                          : "#dcfce7",
                      color:
                        getWorkplaceType(selectedMatch.job) === "hybrid"
                          ? "#6b21a8"
                          : getWorkplaceType(selectedMatch.job) === "onsite"
                          ? "#334155"
                          : "#166534",
                    }}
                  >
                    {getWorkplaceType(selectedMatch.job) === "hybrid"
                      ? "🏢 Hybrid"
                      : getWorkplaceType(selectedMatch.job) === "onsite"
                      ? "🏛️ On-site"
                      : "🌍 Remote"}
                  </span>
                  <span>&bull;</span>
                  <span>
                    Matched CV: <strong>{selectedMatch.bestResume?.label || "General CV"}</strong>
                  </span>
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

            {/* Modal Tab Switcher */}
            <div style={{ display: "flex", gap: 0, marginTop: 16, borderBottom: "2px solid var(--border)" }}>
              <button
                onClick={() => setModalTab("gap")}
                style={{
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "none",
                  border: "none",
                  borderBottom: modalTab === "gap" ? "2px solid var(--navy)" : "2px solid transparent",
                  color: modalTab === "gap" ? "var(--navy)" : "var(--text-muted)",
                  cursor: "pointer",
                  marginBottom: -2,
                }}
              >
                Resume Gap & Tips
              </button>
              <button
                onClick={() => {
                  setModalTab("interview");
                  if (!selectedMatch.match.interviewPrep) {
                    runInterviewPrep(selectedMatch.match.id);
                  }
                }}
                style={{
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "none",
                  border: "none",
                  borderBottom: modalTab === "interview" ? "2px solid #7c3aed" : "2px solid transparent",
                  color: modalTab === "interview" ? "#7c3aed" : "var(--text-muted)",
                  cursor: "pointer",
                  marginBottom: -2,
                }}
              >
                🎯 Interview Prep
              </button>
            </div>

            {/* === GAP ANALYSIS TAB === */}
            {modalTab === "gap" && (
              <>
                {analyzing ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
                    Evaluating role requirements and generating actionable resume suggestions with Gemini...
                  </div>
                ) : selectedMatch.match.gapAnalysis ? (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
                      <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "var(--navy)" }}>
                        Match Reasoning ({Math.round(selectedMatch.match.matchScore)}/100)
                      </h4>
                      <p style={{ margin: 0, fontSize: 13.5, color: "var(--text)" }}>
                        {selectedMatch.match.gapAnalysis.summaryReasoning}
                      </p>
                    </div>

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

                    {selectedMatch.match.tailoredSuggestions && (
                      <div>
                        <h3 style={{ fontSize: 16, color: "var(--navy)", marginBottom: 12 }}>
                          Actionable Resume Improvements
                        </h3>

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
              </>
            )}

            {/* === INTERVIEW PREP TAB === */}
            {modalTab === "interview" && (
              <>
                {preparingInterview ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: 24, marginBottom: 12 }}>🎯</div>
                    Generating personalized interview questions, technical challenges, and preparation plan with Gemini...
                  </div>
                ) : selectedMatch.match.interviewPrep ? (
                  <div style={{ marginTop: 20 }}>
                    {/* Behavioral Questions */}
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 15, color: "var(--navy)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>💬</span> Behavioral Questions
                      </h3>
                      {(selectedMatch.match.interviewPrep.behavioralQuestions || []).map((q, idx) => (
                        <div
                          key={idx}
                          style={{
                            marginBottom: 12,
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            padding: 14,
                            background: "#fafbfc",
                          }}
                        >
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
                            Q{idx + 1}: {q.question}
                          </div>
                          <div style={{ fontSize: 12, color: "#6366f1", marginBottom: 6, fontStyle: "italic" }}>
                            Why they ask: {q.whyAsked}
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--text-muted)", background: "#fff", padding: "8px 10px", borderRadius: 6, borderLeft: "3px solid #a78bfa" }}>
                            <strong>Answer framework:</strong> {q.answerFramework}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Technical Questions */}
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 15, color: "var(--navy)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>⚙️</span> Technical Questions
                      </h3>
                      {(selectedMatch.match.interviewPrep.technicalQuestions || []).map((q, idx) => (
                        <div
                          key={idx}
                          style={{
                            marginBottom: 12,
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            padding: 14,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--navy)" }}>
                              {q.question}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 12,
                                background:
                                  q.difficulty === "Hard" ? "#fef2f2" :
                                  q.difficulty === "Medium" ? "#fef3c7" : "#f0fdf4",
                                color:
                                  q.difficulty === "Hard" ? "#991b1b" :
                                  q.difficulty === "Medium" ? "#92400e" : "#166534",
                              }}
                            >
                              {q.difficulty}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "#7c3aed", marginBottom: 6 }}>
                            Topic: {q.topic}
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--text-muted)", background: "#f1f5f9", padding: "6px 10px", borderRadius: 6 }}>
                            💡 {q.hints}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* System Design Topics */}
                    {(selectedMatch.match.interviewPrep.systemDesignTopics || []).length > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <h3 style={{ fontSize: 15, color: "var(--navy)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🏗️</span> System Design Topics
                        </h3>
                        {selectedMatch.match.interviewPrep.systemDesignTopics!.map((sd, idx) => (
                          <div
                            key={idx}
                            style={{
                              marginBottom: 12,
                              border: "1px solid #c7d2fe",
                              borderRadius: 8,
                              padding: 14,
                              background: "#eef2ff",
                            }}
                          >
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: "#3730a3", marginBottom: 6 }}>
                              {sd.scenario}
                            </div>
                            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 4 }}>
                              <strong>Key considerations:</strong> {sd.keyConsiderations}
                            </div>
                            <div style={{ fontSize: 12, color: "#6366f1", fontStyle: "italic" }}>
                              Relevance: {sd.relevanceToRole}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preparation Tips */}
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 15, color: "var(--navy)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>📋</span> Preparation Tips
                      </h3>
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 14 }}>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#78350f" }}>
                          {(selectedMatch.match.interviewPrep.preparationTips || []).map((tip, idx) => (
                            <li key={idx} style={{ marginBottom: 6 }}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Practice Areas */}
                    <div style={{ marginBottom: 8 }}>
                      <h3 style={{ fontSize: 15, color: "var(--navy)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🔧</span> What to Practice
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {(selectedMatch.match.interviewPrep.practiceAreas || []).map((pa, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: 8,
                              padding: 12,
                              background: "#fff",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
                                {pa.area}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: 10,
                                  background:
                                    pa.priority === "Critical" ? "#fef2f2" :
                                    pa.priority === "High" ? "#fef3c7" : "#f0fdf4",
                                  color:
                                    pa.priority === "Critical" ? "#991b1b" :
                                    pa.priority === "High" ? "#92400e" : "#166534",
                                }}
                              >
                                {pa.priority}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {pa.resources}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "30px 0", textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                    <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                      Generate personalized interview questions and preparation tips for this role.
                    </p>
                    <button
                      onClick={() => runInterviewPrep(selectedMatch.match.id)}
                      className="actionBtn primary"
                      style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                    >
                      Generate Interview Prep
                    </button>
                  </div>
                )}
              </>
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
