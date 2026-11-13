"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
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
  role: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  aiAnalysisCount: number;
  createdAt: string;
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
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  const sessionUser = (session as any)?.user;

  useEffect(() => {
    if (!isPending && !sessionUser) {
      router.push("/login");
    } else if (sessionUser) {
      loadData();
    }
  }, [session, isPending]);

  async function parseSafeJson(res: Response) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Server returned HTTP ${res.status} (non-JSON response)`);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
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

      // Check if a background scrape is already in progress
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

    // Stop polling after 3 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setScraping(false);
    }, 180000);
  }

  async function triggerScrape() {
    setScraping(true);
    setScrapeFeedback("Initiating scrape across 9 sources in background...");
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

  async function updateUserPlan(userId: string, subscriptionTier: "free" | "pro") {
    try {
      setUpdatingUser(userId);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, subscriptionTier }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, subscriptionTier } : u))
        );
        if (metrics) {
          await loadData();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  }

  async function updateUserRole(userId: string, role: "admin" | "user") {
    try {
      setUpdatingUser(userId);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role } : u))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
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
            Manage platform users, subscription tiers, and job crawler pipelines.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" className="actionBtn" style={{ textDecoration: "none" }}>
            &larr; User Dashboard
          </Link>
          <button
            onClick={triggerScrape}
            disabled={scraping}
            className="actionBtn primary"
          >
            {scraping ? "Crawling 9 Sources..." : "⚡ Run Scraper Now"}
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
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
        <h2 style={{ fontSize: 18, color: "var(--navy)", margin: "0 0 14px" }}>
          User Accounts & Subscription Management
        </h2>
        <div className="panel">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px" }}>User</th>
                <th style={{ padding: "12px 16px" }}>Tier</th>
                <th style={{ padding: "12px 16px" }}>Role</th>
                <th style={{ padding: "12px 16px" }}>Joined</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isPro = u.subscriptionTier === "pro";
                const isAdmin = u.role === "admin";
                const isUpdating = updatingUser === u.id;

                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text)" }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{u.email}</div>
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
                    <td style={{ padding: "14px 16px", color: "var(--text-muted)", fontSize: 12.5 }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => updateUserPlan(u.id, isPro ? "free" : "pro")}
                          disabled={isUpdating}
                          className="chip"
                          style={{
                            cursor: "pointer",
                            background: isPro ? "#fff" : "#eff6ff",
                            color: isPro ? "var(--text-muted)" : "#1d4ed8",
                          }}
                        >
                          {isPro ? "Downgrade to Free" : "Upgrade to Pro"}
                        </button>
                        <button
                          onClick={() => updateUserRole(u.id, isAdmin ? "user" : "admin")}
                          disabled={isUpdating}
                          className="chip"
                          style={{ cursor: "pointer" }}
                        >
                          {isAdmin ? "Remove Admin" : "Make Admin"}
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

      {/* Scraper Sources Status */}
      <div>
        <h2 style={{ fontSize: 18, color: "var(--navy)", margin: "0 0 14px" }}>
          Configured Remote Ingestion Sources (9 Services)
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
    </div>
  );
}
