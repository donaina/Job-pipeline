"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Metrics {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  totalJobs: number;
  jobsLast24h: number;
  totalMatches: number;
  totalResumes: number;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  role: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  aiAnalysisCount: number;
  resumeCount?: number;
  preferences?: any;
  createdAt: string;
}

interface ResumeRecord {
  id: string;
  slotNumber: number;
  label: string;
  inputType: string;
  fileName?: string;
  fileUrl?: string;
  rawText?: string;
  parsedData?: {
    targetRole?: string;
    summary?: string;
    coreSkills?: string[];
    toolsAndFrameworks?: string[];
    yearsOfExperience?: number;
    experience?: Array<{ company: string; role: string }>;
  };
  updatedAt?: string;
  createdAt?: string;
}

interface MatchRecord {
  id: string;
  matchScore: number;
  status: string;
  gapAnalysis?: string;
  bestResumeId?: string;
  createdAt: string;
  job: {
    id: string;
    title: string;
    company: string;
    location: string;
    salaryEst?: string;
    applyUrl?: string;
    tags?: string[];
  };
}

const SOURCES = [
  { name: "Remotive", type: "Remote Board API", status: "Active" },
  { name: "We Work Remotely", type: "RSS Feed", status: "Active" },
  { name: "Himalayas", type: "Remote Board API", status: "Active" },
  { name: "RemoteOK", type: "JSON API", status: "Active" },
  { name: "Greenhouse", type: "Company ATS", status: "Active" },
  { name: "Lever", type: "Company ATS", status: "Active" },
  { name: "Ashby", type: "Company ATS", status: "Active" },
  { name: "BambooHR", type: "Company ATS", status: "Active" },
  { name: "Seek", type: "RSS Feed", status: "Active" },
  { name: "Canada Job Bank", type: "Gov Job Portal", status: "Active" },
];

export default function AdminPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeFeedback, setScrapeFeedback] = useState("");

  // User Management Modal State
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [managingUser, setManagingUser] = useState(false);
  const [activeUserTab, setActiveUserTab] = useState<"profile" | "resumes" | "matches">("profile");
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [userResumes, setUserResumes] = useState<ResumeRecord[]>([]);
  const [userMatches, setUserMatches] = useState<MatchRecord[]>([]);

  // Profile Form state
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    role: "user",
    subscriptionTier: "free",
    subscriptionStatus: "active",
    emailVerified: false,
    preferredLocations: "",
    preferredJobTypes: "",
    minSalary: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState("");

  // Resume Management State
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeLabel, setResumeLabel] = useState("");
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null);
  const [resumeFeedback, setResumeFeedback] = useState("");

  // User Matching Sync State
  const [syncingUserMatches, setSyncingUserMatches] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState("");

  const sessionUser = (session as any)?.user;
  const userId = sessionUser?.id;

  useEffect(() => {
    if (!isPending && !userId) {
      router.push("/login");
    } else if (userId) {
      loadData(users.length === 0);
    }
  }, [userId, isPending]);

  async function parseSafeJson(res: Response) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Server returned HTTP ${res.status} (non-JSON response)`);
    }
  }

  async function loadData(showLoading = false) {
    try {
      if (showLoading) setLoading(true);
      const [metricsRes, usersRes] = await Promise.all([
        fetch("/api/admin/metrics"),
        fetch("/api/admin/users"),
      ]);

      if (metricsRes.status === 403 || usersRes.status === 403) {
        setForbidden(true);
        return;
      }

      const metricsData = await parseSafeJson(metricsRes);
      const usersData = await parseSafeJson(usersRes);

      if (metricsData.metrics) setMetrics(metricsData.metrics);
      if (usersData.users) setUsers(usersData.users);

      try {
        const scrapeRes = await fetch("/api/admin/scrape");
        const scrapeData = await parseSafeJson(scrapeRes);
        if (scrapeData.status === "running") {
          setScraping(true);
          setScrapeFeedback("Scraper is currently running in background...");
          pollScrapeStatus();
        }
      } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function pollScrapeStatus() {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/scrape");
        const data = await parseSafeJson(res);

        if (data.status === "completed") {
          clearInterval(pollInterval);
          setScraping(false);
          setScrapeFeedback(
            `Completed! ${data.added ?? 0} new remote jobs saved, ${data.totalMatches ?? 0} matches generated across ${data.usersProcessed ?? 0} users.`
          );
          await loadData();
        } else if (data.status === "failed") {
          clearInterval(pollInterval);
          setScraping(false);
          setScrapeFeedback("Error: " + (data.error || "Scraping failed."));
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 3000);

    setTimeout(() => {
      clearInterval(pollInterval);
      setScraping(false);
    }, 180000);
  }

  async function triggerScrape() {
    setScraping(true);
    setScrapeFeedback("Initiating scrape across 10 sources in background...");
    try {
      const res = await fetch("/api/admin/scrape", { method: "POST" });
      const data = await parseSafeJson(res);
      if (res.ok && data.success) {
        setScrapeFeedback("Scraper running in background... fetching feeds and calculating matches.");
        pollScrapeStatus();
      } else {
        setScrapeFeedback("Error: " + (data.error || "Failed to start scraper."));
        setScraping(false);
      }
    } catch (err: any) {
      setScrapeFeedback("Failed to trigger scrape: " + err.message);
      setScraping(false);
    }
  }

  // Open User Management Modal
  async function openUserModal(u: UserRecord) {
    setSelectedUser(u);
    setManagingUser(true);
    setActiveUserTab("profile");
    setProfileFeedback("");
    setResumeFeedback("");
    setSyncFeedback("");
    setUploadingSlot(null);
    setResumeFile(null);
    setResumeLabel("");

    const prefs = u.preferences || {};
    setUserForm({
      name: u.name || "",
      email: u.email || "",
      role: u.role || "user",
      subscriptionTier: u.subscriptionTier || "free",
      subscriptionStatus: u.subscriptionStatus || "active",
      emailVerified: Boolean(u.emailVerified),
      preferredLocations: Array.isArray(prefs.locations) ? prefs.locations.join(", ") : (prefs.locations || ""),
      preferredJobTypes: Array.isArray(prefs.jobTypes) ? prefs.jobTypes.join(", ") : (prefs.jobTypes || ""),
      minSalary: prefs.minSalary ? String(prefs.minSalary) : "",
    });

    setLoadingUserDetails(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`);
      const data = await parseSafeJson(res);
      if (data.user) {
        setSelectedUser(data.user);
        const p = data.user.preferences || {};
        setUserForm({
          name: data.user.name || "",
          email: data.user.email || "",
          role: data.user.role || "user",
          subscriptionTier: data.user.subscriptionTier || "free",
          subscriptionStatus: data.user.subscriptionStatus || "active",
          emailVerified: Boolean(data.user.emailVerified),
          preferredLocations: Array.isArray(p.locations) ? p.locations.join(", ") : (p.locations || ""),
          preferredJobTypes: Array.isArray(p.jobTypes) ? p.jobTypes.join(", ") : (p.jobTypes || ""),
          minSalary: p.minSalary ? String(p.minSalary) : "",
        });
      }
      if (data.resumes) setUserResumes(data.resumes);
      if (data.matches) setUserMatches(data.matches);
    } catch (err: any) {
      console.error("Failed to load user details:", err);
    } finally {
      setLoadingUserDetails(false);
    }
  }

  function closeUserModal() {
    setManagingUser(false);
    setSelectedUser(null);
    setUploadingSlot(null);
    setResumeFile(null);
    setResumeLabel("");
  }

  // Save User Profile Changes
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setSavingProfile(true);
    setProfileFeedback("");

    try {
      const parsedPrefs = {
        locations: userForm.preferredLocations.split(",").map((s) => s.trim()).filter(Boolean),
        jobTypes: userForm.preferredJobTypes.split(",").map((s) => s.trim()).filter(Boolean),
        ...(userForm.minSalary ? { minSalary: Number(userForm.minSalary) } : {}),
      };

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          subscriptionTier: userForm.subscriptionTier,
          subscriptionStatus: userForm.subscriptionStatus,
          emailVerified: userForm.emailVerified,
          preferences: parsedPrefs,
        }),
      });

      const data = await parseSafeJson(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update user profile.");
      }

      setProfileFeedback("✅ User profile updated successfully!");
      if (data.user) {
        setSelectedUser(data.user);
        setUsers((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? { ...u, ...data.user } : u))
        );
      }
    } catch (err: any) {
      setProfileFeedback("❌ Error: " + (err.message || "Could not save profile."));
    } finally {
      setSavingProfile(false);
    }
  }

  // Upload Resume on Behalf of User
  async function handleUploadResume(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser || !uploadingSlot) return;
    if (!resumeFile) {
      alert("Please select a PDF file.");
      return;
    }

    setIsUploadingResume(true);
    setResumeFeedback("Uploading and parsing PDF with AI...");

    try {
      const formData = new FormData();
      formData.append("slotNumber", uploadingSlot.toString());
      formData.append("label", resumeLabel || `Resume ${uploadingSlot}`);
      formData.append("file", resumeFile);

      const res = await fetch(`/api/admin/users/${selectedUser.id}/resumes`, {
        method: "POST",
        body: formData,
      });

      const data = await parseSafeJson(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to upload resume.");
      }

      setResumeFeedback(`✅ Resume Slot ${uploadingSlot} saved and vectorized! Background job matching started.`);
      setUploadingSlot(null);
      setResumeFile(null);
      setResumeLabel("");

      // Refresh resumes and matches
      await refreshUserResumesAndMatches(selectedUser.id);
    } catch (err: any) {
      setResumeFeedback("❌ Upload failed: " + (err.message || "Error"));
    } finally {
      setIsUploadingResume(false);
    }
  }

  // Delete Resume for User
  async function handleDeleteResume(slotNumber: number) {
    if (!selectedUser) return;
    if (!confirm(`Are you sure you want to remove Resume Slot ${slotNumber} for this user?`)) {
      return;
    }

    setDeletingSlot(slotNumber);
    setResumeFeedback(`Removing Resume Slot ${slotNumber}...`);

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/resumes?slotNumber=${slotNumber}`, {
        method: "DELETE",
      });

      const data = await parseSafeJson(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to remove resume.");
      }

      setResumeFeedback(`✅ Resume Slot ${slotNumber} removed successfully.`);
      await refreshUserResumesAndMatches(selectedUser.id);
    } catch (err: any) {
      setResumeFeedback("❌ Remove failed: " + (err.message || "Error"));
    } finally {
      setDeletingSlot(null);
    }
  }

  // Trigger Re-sync of Matches for User
  async function handleSyncUserMatches() {
    if (!selectedUser) return;
    setSyncingUserMatches(true);
    setSyncFeedback("Syncing matches with candidate resumes against active jobs in database...");

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/sync`, {
        method: "POST",
      });

      const data = await parseSafeJson(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to sync matches.");
      }

      if (data.message) {
        setSyncFeedback(`ℹ️ ${data.message}`);
      } else {
        const matched = Number(data.matched || 0);
        const total = Number(data.totalTop || 50);
        if (matched === 0) {
          setSyncFeedback(
            `✨ All matches are already up to date! Evaluated candidate CV against active database roles (Top ${total} positions). (Note: This scores against existing jobs in the database. To crawl brand-new postings from all 10 external platforms, use "⚡ Run Scraper Now" above).`
          );
        } else {
          setSyncFeedback(
            `🎯 Sync complete! ${matched} new or higher-scoring job matches added/updated (Top ${total} active roles).`
          );
        }
      }

      // Refresh matches list
      await refreshUserResumesAndMatches(selectedUser.id);
    } catch (err: any) {
      setSyncFeedback("❌ Sync failed: " + (err.message || "Error"));
    } finally {
      setSyncingUserMatches(false);
    }
  }

  async function refreshUserResumesAndMatches(targetUserId: string) {
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}`);
      const data = await parseSafeJson(res);
      if (data.resumes) {
        setUserResumes(data.resumes);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUserId ? { ...u, resumeCount: data.resumes.length } : u
          )
        );
      }
      if (data.matches) setUserMatches(data.matches);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  }

  if (isPending || loading) {
    return <div className="wrap" style={{ textAlign: "center", paddingTop: 100 }}>Loading admin console...</div>;
  }

  if (forbidden) {
    return (
      <div className="wrap" style={{ textAlign: "center", paddingTop: 100 }}>
        <h2 style={{ color: "var(--status-rejected)" }}>403 - Forbidden</h2>
        <p style={{ color: "var(--text-muted)" }}>
          You do not have administrative privileges to access this area.
        </p>
        <Link href="/" className="actionBtn primary" style={{ textDecoration: "none", marginTop: 12 }}>
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const slots = [1, 2, 3];

  return (
    <div className="wrap">
      {/* Header */}
      <div className="pageHead">
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--status-approved)", textTransform: "uppercase" }}>
            Admin Portal
          </span>
          <h1 className="wordmark" style={{ margin: "4px 0" }}>
            Platform Control & Analytics
          </h1>
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 13.5 }}>
            Manage platform users, inspect & update profiles, upload/remove resumes, and oversee job crawler pipelines.
          </p>
        </div>
        <div className="headActions">
          <Link href="/" className="actionBtn" style={{ textDecoration: "none" }}>
            &larr; User Dashboard
          </Link>
          <button
            onClick={triggerScrape}
            disabled={scraping}
            className="actionBtn primary"
          >
            {scraping ? "Crawling 10 Sources..." : "⚡ Run Scraper Now"}
          </button>
        </div>
      </div>

      {scrapeFeedback && (
        <div
          style={{
            padding: "12px 16px",
            background: scrapeFeedback.startsWith("Error") ? "#fef2f2" : "#f0fdf4",
            border: "1px solid " + (scrapeFeedback.startsWith("Error") ? "#fecaca" : "#bbf7d0"),
            borderRadius: 8,
            marginBottom: 20,
            color: scrapeFeedback.startsWith("Error") ? "#b91c1c" : "#166534",
            fontSize: 13.5,
          }}
        >
          {scrapeFeedback}
        </div>
      )}

      {/* Metrics Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Total Users</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginTop: 4 }}>
            {metrics?.totalUsers || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
            Pro: <strong style={{ color: "var(--status-approved)" }}>{metrics?.proUsers || 0}</strong> &bull; Free: {metrics?.freeUsers || 0}
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Active Remote Jobs</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginTop: 4 }}>
            {metrics?.totalJobs || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--status-applied)", marginTop: 4 }}>
            +{metrics?.jobsLast24h || 0} in last 24h
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Total Matches</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginTop: 4 }}>
            {metrics?.totalMatches || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
            Across all candidate resumes
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Resumes Ingested</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginTop: 4 }}>
            {metrics?.totalResumes || 0}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}>
            Vectorized & indexed
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, color: "var(--navy)", margin: 0 }}>
            User Accounts & Profiles
          </h2>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {users.length} registered accounts
          </span>
        </div>

        <div className="panel">
          <div className="tableResponsive">
            <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "12px 16px" }}>User</th>
                  <th style={{ padding: "12px 16px" }}>Tier</th>
                  <th style={{ padding: "12px 16px" }}>Role</th>
                  <th style={{ padding: "12px 16px" }}>CVs</th>
                  <th style={{ padding: "12px 16px" }}>Joined</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isPro = u.subscriptionTier === "pro";
                  const isAdmin = u.role === "admin";
                  const cvCount = u.resumeCount ?? 0;

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>{u.name || "Anonymous User"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                          {u.email}
                          {u.emailVerified ? (
                            <span style={{ color: "#166534", fontSize: 10, background: "#dcfce7", padding: "1px 5px", borderRadius: 8 }}>
                              Verified
                            </span>
                          ) : (
                            <span style={{ color: "#92400e", fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 8 }}>
                              Unverified
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: isPro ? "#dbeafe" : "#f1f5f9",
                            color: isPro ? "#1d4ed8" : "#475569",
                            textTransform: "uppercase",
                          }}
                        >
                          {u.subscriptionTier}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: isAdmin ? "#fef3c7" : "#f8fafc",
                            color: isAdmin ? "#92400e" : "#64748b",
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: cvCount > 0 ? "var(--status-approved)" : "var(--text-faint)",
                            background: cvCount > 0 ? "#eff6ff" : "#f8fafc",
                            padding: "2px 8px",
                            borderRadius: 10,
                          }}
                        >
                          {cvCount}/3 CVs
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-muted)", fontSize: 12.5 }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                          <button
                            onClick={() => openUserModal(u)}
                            className="chip"
                            style={{
                              cursor: "pointer",
                              background: "var(--navy)",
                              color: "#fff",
                              fontWeight: 600,
                              borderColor: "var(--navy)",
                            }}
                          >
                            👤 Manage Profile & CVs
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Scraper Sources Status */}
      <div>
        <h2 style={{ fontSize: 18, color: "var(--navy)", margin: "0 0 14px" }}>
          Configured Remote Ingestion Sources (10 Platforms)
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
            gap: 12,
          }}
        >
          {SOURCES.map((source, idx) => (
            <div
              key={idx}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{source.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{source.type}</div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  background: "#dcfce7",
                  color: "#166534",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                {source.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* USER MANAGEMENT MODAL */}
      {managingUser && selectedUser && (
        <div
          className="modalOverlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeUserModal();
          }}
        >
          <div className="modalDialog" style={{ maxWidth: 840, padding: "26px 30px" }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 21, color: "var(--navy)" }}>
                    {selectedUser.name || "User Profile"}
                  </h2>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: selectedUser.subscriptionTier === "pro" ? "#dbeafe" : "#f1f5f9",
                      color: selectedUser.subscriptionTier === "pro" ? "#1d4ed8" : "#475569",
                      textTransform: "uppercase",
                    }}
                  >
                    {selectedUser.subscriptionTier}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: selectedUser.role === "admin" ? "#fef3c7" : "#f8fafc",
                      color: selectedUser.role === "admin" ? "#92400e" : "#64748b",
                    }}
                  >
                    {selectedUser.role}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                  {selectedUser.email} &bull; ID: <code style={{ fontSize: 11 }}>{selectedUser.id}</code>
                </div>
              </div>
              <button
                onClick={closeUserModal}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="tabs" style={{ marginBottom: 20 }}>
              <button
                className={`tab ${activeUserTab === "profile" ? "active" : ""}`}
                onClick={() => setActiveUserTab("profile")}
              >
                👤 Profile & Settings
              </button>
              <button
                className={`tab ${activeUserTab === "resumes" ? "active" : ""}`}
                onClick={() => setActiveUserTab("resumes")}
              >
                📄 Resumes ({userResumes.length}/3)
              </button>
              <button
                className={`tab ${activeUserTab === "matches" ? "active" : ""}`}
                onClick={() => setActiveUserTab("matches")}
              >
                🎯 Job Matches ({userMatches.length})
              </button>
            </div>

            {loadingUserDetails ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                Loading user profile, resumes, and matches...
              </div>
            ) : (
              <>
                {/* TAB 1: PROFILE & SETTINGS */}
                {activeUserTab === "profile" && (
                  <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {profileFeedback && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: 6,
                          fontSize: 13.5,
                          background: profileFeedback.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
                          border: "1px solid " + (profileFeedback.startsWith("✅") ? "#bbf7d0" : "#fecaca"),
                          color: profileFeedback.startsWith("✅") ? "#166534" : "#b91c1c",
                        }}
                      >
                        {profileFeedback}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={userForm.name}
                          onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                          required
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                          required
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                          Platform Role
                        </label>
                        <select
                          value={userForm.role}
                          onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
                        >
                          <option value="user">User (Standard Candidate)</option>
                          <option value="admin">Admin (System Privileges)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                          Subscription Tier
                        </label>
                        <select
                          value={userForm.subscriptionTier}
                          onChange={(e) => setUserForm({ ...userForm, subscriptionTier: e.target.value })}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
                        >
                          <option value="free">Free (1 Resume Slot)</option>
                          <option value="pro">Pro (3 Resume Slots + Priority Matching)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                          Subscription Status
                        </label>
                        <select
                          value={userForm.subscriptionStatus}
                          onChange={(e) => setUserForm({ ...userForm, subscriptionStatus: e.target.value })}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
                        >
                          <option value="active">Active</option>
                          <option value="canceled">Canceled</option>
                          <option value="past_due">Past Due</option>
                          <option value="trialing">Trialing</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                          Email Verification Status
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 38 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5 }}>
                            <input
                              type="checkbox"
                              checked={userForm.emailVerified}
                              onChange={(e) => setUserForm({ ...userForm, emailVerified: e.target.checked })}
                              style={{ width: 18, height: 18, cursor: "pointer" }}
                            />
                            Mark as Verified
                          </label>
                          {userForm.emailVerified ? (
                            <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                              Verified
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                              Unverified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Job Preferences Section */}
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "var(--navy)" }}>
                        Target Job Preferences
                      </h4>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text-muted)", marginBottom: 4 }}>
                            Preferred Locations (comma separated, e.g. Worldwide, Remote, US)
                          </label>
                          <input
                            type="text"
                            value={userForm.preferredLocations}
                            onChange={(e) => setUserForm({ ...userForm, preferredLocations: e.target.value })}
                            placeholder="Worldwide, US Only, Europe"
                            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13.5 }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text-muted)", marginBottom: 4 }}>
                            Preferred Job Types (comma separated, e.g. Full-time, Contract)
                          </label>
                          <input
                            type="text"
                            value={userForm.preferredJobTypes}
                            onChange={(e) => setUserForm({ ...userForm, preferredJobTypes: e.target.value })}
                            placeholder="Full-time, Contract"
                            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13.5 }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={closeUserModal}
                        className="actionBtn"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="actionBtn primary"
                      >
                        {savingProfile ? "Saving Changes..." : "💾 Save Profile Changes"}
                      </button>
                    </div>
                  </form>
                )}

                {/* TAB 2: RESUMES MANAGEMENT */}
                {activeUserTab === "resumes" && (
                  <div>
                    {resumeFeedback && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: 6,
                          fontSize: 13.5,
                          marginBottom: 16,
                          background: resumeFeedback.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
                          border: "1px solid " + (resumeFeedback.startsWith("✅") ? "#bbf7d0" : "#fecaca"),
                          color: resumeFeedback.startsWith("✅") ? "#166534" : "#b91c1c",
                        }}
                      >
                        {resumeFeedback}
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                        Admin controls to inspect, upload, replace, or remove resumes for <strong>{selectedUser.name}</strong>.
                      </p>
                      <button
                        onClick={handleSyncUserMatches}
                        disabled={syncingUserMatches}
                        className="actionBtn"
                        style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                      >
                        {syncingUserMatches ? "Syncing..." : "⚡ Re-sync Job Matches"}
                      </button>
                    </div>

                    {syncFeedback && (
                      <div
                        style={{
                          padding: "9px 13px",
                          borderRadius: 6,
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          background: syncFeedback.startsWith("❌")
                            ? "#fef2f2"
                            : syncFeedback.startsWith("ℹ️")
                            ? "#fffbeb"
                            : syncFeedback.startsWith("✨")
                            ? "#f0f9ff"
                            : "#f0fdf4",
                          color: syncFeedback.startsWith("❌")
                            ? "#991b1b"
                            : syncFeedback.startsWith("ℹ️")
                            ? "#92400e"
                            : syncFeedback.startsWith("✨")
                            ? "#075985"
                            : "#166534",
                          border: `1px solid ${
                            syncFeedback.startsWith("❌")
                              ? "#fecaca"
                              : syncFeedback.startsWith("ℹ️")
                              ? "#fde68a"
                              : syncFeedback.startsWith("✨")
                              ? "#bae6fd"
                              : "#bbf7d0"
                          }`,
                          marginBottom: 16,
                        }}
                      >
                        {syncFeedback}
                      </div>
                    )}

                    {/* Resumes 3-slot Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
                      {slots.map((slotNum) => {
                        const resume = userResumes.find((r) => r.slotNumber === slotNum);
                        const isDeleting = deletingSlot === slotNum;
                        const isUploadingThis = uploadingSlot === slotNum;

                        return (
                          <div
                            key={slotNum}
                            style={{
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              padding: 16,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              minHeight: 250,
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase" }}>
                                  Slot {slotNum}
                                </span>
                                {resume ? (
                                  <span style={{ fontSize: 10.5, background: "#dbeafe", color: "#1e40af", padding: "1px 6px", borderRadius: 8 }}>
                                    {resume.inputType === "FILE_UPLOAD" ? "PDF Upload" : "Manual Profile"}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10.5, background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: 8 }}>
                                    Empty Slot
                                  </span>
                                )}
                              </div>

                              <h4 style={{ margin: "0 0 6px", fontSize: 15, color: "var(--navy)" }}>
                                {resume ? resume.label : `Resume Slot ${slotNum}`}
                              </h4>

                              {resume ? (
                                <div>
                                  {resume.fileName && (
                                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                                      File: <strong>{resume.fileName}</strong>
                                    </div>
                                  )}

                                  {resume.fileUrl && (
                                    <div style={{ marginBottom: 8 }}>
                                      <a
                                        href={resume.fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 12, color: "var(--status-approved)", textDecoration: "none", fontWeight: 600 }}
                                      >
                                        📄 View / Download Uploaded PDF &rarr;
                                      </a>
                                    </div>
                                  )}

                                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px", lineHeight: 1.4 }}>
                                    {resume.parsedData?.summary
                                      ? resume.parsedData.summary.slice(0, 100) + "..."
                                      : "Indexed resume text."}
                                  </p>

                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                                    {(resume.parsedData?.coreSkills || []).slice(0, 4).map((skill, sIdx) => (
                                      <span
                                        key={sIdx}
                                        style={{
                                          fontSize: 10.5,
                                          background: "var(--surface)",
                                          border: "1px solid var(--border)",
                                          padding: "1px 6px",
                                          borderRadius: 4,
                                        }}
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "14px 0" }}>
                                  No resume uploaded for this slot yet.
                                </p>
                              )}
                            </div>

                            {/* Slot Actions */}
                            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                              {isUploadingThis ? (
                                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                                    PDF File:
                                  </label>
                                  <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                                    style={{ fontSize: 12, width: "100%", marginBottom: 8 }}
                                  />
                                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                                    Role Label (Optional):
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Senior Frontend Engineer"
                                    value={resumeLabel}
                                    onChange={(e) => setResumeLabel(e.target.value)}
                                    style={{ width: "100%", padding: "4px 8px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border)", marginBottom: 8 }}
                                  />
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={handleUploadResume}
                                      disabled={isUploadingResume}
                                      className="chip"
                                      style={{ background: "var(--navy)", color: "#fff", cursor: "pointer", flex: 1, textAlign: "center" }}
                                    >
                                      {isUploadingResume ? "Uploading..." : "Save PDF"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setUploadingSlot(null);
                                        setResumeFile(null);
                                        setResumeLabel("");
                                      }}
                                      className="chip"
                                      style={{ cursor: "pointer" }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUploadingSlot(slotNum);
                                      setResumeLabel(resume ? resume.label : "");
                                    }}
                                    className="chip"
                                    style={{ flex: 1, textAlign: "center", cursor: "pointer" }}
                                  >
                                    {resume ? "🔄 Replace PDF" : "+ Upload PDF"}
                                  </button>
                                  {resume && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteResume(slotNum)}
                                      disabled={isDeleting}
                                      className="chip"
                                      style={{ color: "var(--status-rejected)", borderColor: "#fecaca", cursor: "pointer" }}
                                      title="Remove resume from this slot"
                                    >
                                      {isDeleting ? "..." : "🗑️ Delete"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 3: TOP MATCHES */}
                {activeUserTab === "matches" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                        Current top matches for <strong>{selectedUser.name}</strong> based on their vectorized resumes.
                      </p>
                      <button
                        onClick={handleSyncUserMatches}
                        disabled={syncingUserMatches}
                        className="actionBtn"
                        style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                      >
                        {syncingUserMatches ? "Syncing..." : "⚡ Re-sync Matches"}
                      </button>
                    </div>

                    {syncFeedback && (
                      <div
                        style={{
                          padding: "9px 13px",
                          borderRadius: 6,
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          background: syncFeedback.startsWith("❌")
                            ? "#fef2f2"
                            : syncFeedback.startsWith("ℹ️")
                            ? "#fffbeb"
                            : syncFeedback.startsWith("✨")
                            ? "#f0f9ff"
                            : "#f0fdf4",
                          color: syncFeedback.startsWith("❌")
                            ? "#991b1b"
                            : syncFeedback.startsWith("ℹ️")
                            ? "#92400e"
                            : syncFeedback.startsWith("✨")
                            ? "#075985"
                            : "#166534",
                          border: `1px solid ${
                            syncFeedback.startsWith("❌")
                              ? "#fecaca"
                              : syncFeedback.startsWith("ℹ️")
                              ? "#fde68a"
                              : syncFeedback.startsWith("✨")
                              ? "#bae6fd"
                              : "#bbf7d0"
                          }`,
                          marginBottom: 14,
                        }}
                      >
                        {syncFeedback}
                      </div>
                    )}

                    {userMatches.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "36px 0", color: "var(--text-faint)", background: "var(--bg)", borderRadius: 8 }}>
                        No matches generated yet. Upload a resume or click <strong>Re-sync Matches</strong> above.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
                        {userMatches.map((m) => {
                          const scoreColor =
                            m.matchScore >= 80 ? "var(--status-applied)" : m.matchScore >= 60 ? "var(--status-approved)" : "var(--score)";

                          return (
                            <div
                              key={m.id}
                              style={{
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "10px 14px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: scoreColor,
                                      background: "var(--surface)",
                                      border: `1px solid var(--border)`,
                                      padding: "1px 7px",
                                      borderRadius: 10,
                                    }}
                                  >
                                    {m.matchScore}%
                                  </span>
                                  <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--navy)" }}>
                                    {m.job.title}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                                  {m.job.company} &bull; {m.job.location || "Remote"} {m.job.salaryEst ? `&bull; ${m.job.salaryEst}` : ""}
                                </div>
                              </div>

                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {m.job.applyUrl && (
                                  <a
                                    href={m.job.applyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="chip"
                                    style={{
                                      fontSize: 12,
                                      textDecoration: "none",
                                      background: "var(--surface)",
                                      color: "var(--navy)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    View Job ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
