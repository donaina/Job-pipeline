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

// Dedicated Temporary Foreign Worker / LMIA queries on Job Bank (fsrc=32)
// These explicitly target Canadian employers authorized/applying to sponsor international workers.
const DEFAULT_TFW_QUERIES = [
  "software developer",
  "web developer",
  "software engineer",
  "full stack",
  "data analyst",
  "developer",
  "programmer",
];

export async function fetchCanadaJobBank(queries = DEFAULT_QUERIES) {
  const jobs = [];
  const seenIds = new Set();

  // Combine standard searches and dedicated TFW/LMIA queries (fsrc=32)
  const searchTasks = [
    ...queries.map((q) => ({ query: q, isTfw: false })),
    ...DEFAULT_TFW_QUERIES.map((q) => ({ query: q, isTfw: true })),
  ];

  const fetchResults = await Promise.allSettled(
    searchTasks.map(async ({ query, isTfw }) => {
      const tfwParam = isTfw ? "&fsrc=32" : "";
      const searchUrl = `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${encodeURIComponent(
        query
      )}${tfwParam}&sort=M`;
      try {
        const res = await fetch(searchUrl, { headers: HEADERS });
        if (res.ok) {
          const html = await res.text();
          const articles = html.match(/<article id="article-\d+"[\s\S]*?<\/article>/g) || [];

          if (articles.length > 0) {
            return { type: "html", query, isTfw, articles };
          }
        }
      } catch (err) {
        console.warn(`[jobbank] HTML search failed for "${query}" (TFW: ${isTfw}):`, err.message);
      }

      // Fallback: Atom/RSS syndication feed
      try {
        const rssUrl = `https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed?searchstring=${encodeURIComponent(
          query
        )}${tfwParam}&sort=M`;
        const res = await fetch(rssUrl, { headers: HEADERS });
        if (res.ok) {
          const xml = await res.text();
          const feed = await parser.parseString(xml);
          return { type: "rss", query, isTfw, items: feed.items || [] };
        }
      } catch (rssErr) {
        console.warn(`[jobbank] RSS fallback failed for "${query}" (TFW: ${isTfw}):`, rssErr.message);
      }

      return { type: "none", query, isTfw, articles: [] };
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

        // Check for LMIA flag in Job Bank HTML
        const lmiaMatch = art.match(/class="[^"]*jobLMIAflag[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const lmiaText = lmiaMatch
          ? lmiaMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
          : "";
        const isLmia = Boolean(data.isTfw || lmiaMatch || /LMIA/i.test(art));

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

        // Direct link to the international foreign worker posting if LMIA/TFW
        const link = isLmia
          ? `https://www.jobbank.gc.ca/jobsearch/jobpostingtfw/${jobId}`
          : `https://www.jobbank.gc.ca/jobsearch/jobposting/${jobId}`;

        const lmiaNote = isLmia
          ? `[Canada Visa Sponsorship / ${lmiaText || "LMIA Supported"} for Foreign Candidates]. `
          : "";

        const description = `${title} at ${company} in ${location}. Workplace: ${
          telework || "On-site / Office"
        }. ${lmiaNote}${salary ? `Salary: ${salary}. ` : ""}Official Canada Job Bank posting: ${link}`;

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
              ...(isLmia
                ? [
                    "Canada Visa Sponsorship",
                    "LMIA",
                    lmiaText ? `LMIA: ${lmiaText}` : "LMIA Approved",
                  ]
                : []),
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
        const isLmia = Boolean(data.isTfw || /LMIA/i.test(item.title || "") || /LMIA/i.test(summary));

        const location = rawLoc
          ? rawLoc.toLowerCase().includes("canada")
            ? rawLoc
            : `${rawLoc}, Canada`
          : "Canada";

        const title = item.title ? item.title.trim() : "Software Developer";
        const finalLink = isLmia && idMatch
          ? `https://www.jobbank.gc.ca/jobsearch/jobpostingtfw/${jobId}`
          : link;

        const description = `${title} at ${company} in ${location}. ${
          isLmia ? "[Canada Visa Sponsorship / LMIA Supported]. " : ""
        }${salary ? `Salary: ${salary}. ` : ""}Canada Job Bank posting: ${finalLink}`;

        jobs.push(
          makeJob({
            title,
            company,
            location,
            employmentType: "Full-time",
            link: finalLink,
            salary,
            description,
            source: "jobbank",
            tags: [
              "Canada",
              "Job Bank",
              ...(isLmia ? ["Canada Visa Sponsorship", "LMIA"] : []),
            ],
          })
        );
      }
    }
  }

  return jobs;
}
