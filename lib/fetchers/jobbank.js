// jobbank.js
// Canada Job Bank (jobbank.gc.ca) - Official Government of Canada employment portal.
// Uses direct keyword search across tech, engineering, product, and data roles.
// Fetches structured listings (title, employer, location, telework mode, salary, date)
// with Atom/RSS feed fallback if HTML search is ever unavailable.

import Parser from "rss-parser";
import { makeJob } from "./base.js";

const parser = new Parser();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const DEFAULT_QUERIES = [
  "software developer",
  "web developer",
  "frontend",
  "full stack",
  "software engineer",
  "product manager",
  "data analyst",
];

export async function fetchCanadaJobBank(queries = DEFAULT_QUERIES) {
  const jobs = [];
  const seenIds = new Set();

  const fetchResults = await Promise.allSettled(
    queries.map(async (query) => {
      const searchUrl = `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${encodeURIComponent(query)}&sort=M`;
      try {
        const res = await fetch(searchUrl, { headers: HEADERS });
        if (res.ok) {
          const html = await res.text();
          const articles = html.match(/<article id="article-\d+"[\s\S]*?<\/article>/g) || [];

          if (articles.length > 0) {
            return { type: "html", query, articles };
          }
        }
      } catch (err) {
        console.warn(`[jobbank] HTML search failed for "${query}":`, err.message);
      }

      // Fallback: Atom/RSS syndication feed
      try {
        const rssUrl = `https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed?searchstring=${encodeURIComponent(query)}&sort=M`;
        const res = await fetch(rssUrl, { headers: HEADERS });
        if (res.ok) {
          const xml = await res.text();
          const feed = await parser.parseString(xml);
          return { type: "rss", query, items: feed.items || [] };
        }
      } catch (rssErr) {
        console.warn(`[jobbank] RSS fallback failed for "${query}":`, rssErr.message);
      }

      return { type: "none", query, articles: [] };
    })
  );

  for (const result of fetchResults) {
    if (result.status !== "fulfilled") continue;
    const data = result.value;

    if (data.type === "html") {
      for (const art of data.articles) {
        const idMatch = art.match(/id="article-(\d+)"/);
        if (!idMatch) continue;
        const jobId = idMatch[1];
        if (seenIds.has(jobId)) continue;
        seenIds.add(jobId);

        const titleMatch = art.match(/<span class="noctitle">\s*([\s\S]*?)\s*<\/span>/);
        const teleMatch = art.match(/<span class="telework">\s*([\s\S]*?)\s*<\/span>/);
        const busMatch = art.match(/<li class="business">\s*([\s\S]*?)\s*<\/li>/);
        const locMatch = art.match(
          /<li class="location">[\s\S]*?<span class="wb-inv">Location<\/span>\s*([\s\S]*?)\s*<\/li>/
        );
        const salMatch = art.match(/<li class="salary">[\s\S]*?Salary\s*([\s\S]*?)\s*<\/li>/);

        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "Software Developer";
        const company = busMatch
          ? busMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "Canada Employer";
        const rawLoc = locMatch
          ? locMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "";
        const telework = teleMatch
          ? teleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "";
        const salary = salMatch
          ? salMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "";

        const isRemote = telework.toLowerCase() === "remote";
        const isHybrid = telework.toLowerCase() === "hybrid";
        const isOnsite = telework.toLowerCase() === "on site" || telework.toLowerCase() === "onsite";

        let location = rawLoc
          ? rawLoc.toLowerCase().includes("canada")
            ? rawLoc
            : `${rawLoc}, Canada`
          : "Canada";

        if (isRemote) {
          location = rawLoc ? `${rawLoc}, Canada (Remote)` : "Remote (Canada)";
        } else if (isHybrid) {
          location = rawLoc ? `${rawLoc}, Canada (Hybrid)` : "Hybrid (Canada)";
        }

        const link = `https://www.jobbank.gc.ca/jobsearch/jobposting/${jobId}`;
        const description = `${title} at ${company} in ${location}. Workplace: ${
          telework || "On-site / Office"
        }. ${salary ? `Salary: ${salary}. ` : ""}Official Canada Job Bank posting: ${link}`;

        jobs.push(
          makeJob({
            title,
            company,
            location,
            employmentType: telework ? `${telework}` : "Full-time",
            link,
            salary,
            description,
            source: "jobbank",
            tags: [
              "Canada",
              "Job Bank",
              ...(isRemote ? ["Remote"] : isHybrid ? ["Hybrid"] : ["On-site"]),
            ],
          })
        );
      }
    } else if (data.type === "rss" && data.items) {
      for (const item of data.items) {
        const link = item.link || "";
        const idMatch = link.match(/\/(\d+)(?:[?;]|$)/);
        const jobId = idMatch ? idMatch[1] : link;
        if (seenIds.has(jobId)) continue;
        seenIds.add(jobId);

        const summary = item.summary || "";
        const locMatch = summary.match(/<strong>Location:<\/strong>\s*([^<]+)/i);
        const empMatch = summary.match(/<strong>Employer:<\/strong>\s*([^<]+)/i);
        const salMatch = summary.match(/<strong>Salary:<\/strong>\s*([^<]+)/i);

        const rawLoc = locMatch ? locMatch[1].trim() : "";
        const company = empMatch ? empMatch[1].trim() : "Canada Employer";
        const salary = salMatch ? salMatch[1].trim() : "";

        const location = rawLoc
          ? rawLoc.toLowerCase().includes("canada")
            ? rawLoc
            : `${rawLoc}, Canada`
          : "Canada";

        const title = item.title ? item.title.trim() : "Software Developer";
        const description = `${title} at ${company} in ${location}. ${
          salary ? `Salary: ${salary}. ` : ""
        }Canada Job Bank posting: ${link}`;

        jobs.push(
          makeJob({
            title,
            company,
            location,
            employmentType: "Full-time",
            link,
            salary,
            description,
            source: "jobbank",
            tags: ["Canada", "Job Bank"],
          })
        );
      }
    }
  }

  return jobs;
}
