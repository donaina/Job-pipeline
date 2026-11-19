# Job Pipeline 🚀

An autonomous, multi-tenant AI job discovery, vector matching, and application intelligence platform.

Job Pipeline continuously aggregates job postings across 10 global platforms, parses candidates' CVs using Google Gemini AI, generates vector embeddings, scores alignment against active roles, and equips candidates with personalized interview preparation and tailored application kits.

**Live Production URL:** [https://job-pipeline.eduvrse.co](https://job-pipeline.eduvrse.co)

---

## Architecture & System Flow

```
                                  ┌──────────────────────────────────────────────┐
                                  │           10 Global Job Feeds                │
                                  │  Canada Job Bank • Greenhouse • Lever • Ashby│
                                  │  BambooHR • Himalayas • Seek • Remotive      │
                                  │  WeWorkRemotely • RemoteOK                   │
                                  └──────────────────────┬───────────────────────┘
                                                         │
                                               [Background Ingest / Cron]
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │   PostgreSQL (Drizzle ORM)   │
                                          │     4,500+ Active Roles      │
                                          └──────────────┬───────────────┘
                                                         │
  ┌─────────────────────────────────┐                    │
  │        Candidate Resumes        │                    │
  │  • Up to 3 CV slots per user    │                    ▼
  │  • PDF Text Parsing (pdf-parse) │         ┌──────────────────────┐
  │  • Gemini AI Skills Extraction  ├────────►│ AI Job Match Engine  │
  │  • Gemini Text Embeddings (768) │         │ • Role alignment     │
  └─────────────────────────────────┘         │ • Skill overlap      │
                                              │ • Seniority weighting│
                                              │ • Domain heuristics  │
                                              │ • Vector similarity  │
                                              └──────────┬───────────┘
                                                         │
                                                         ▼
                                           ┌────────────────────────────┐
                                           │    Candidate Dashboard     │
                                           │  • Real-time multi-filter  │
                                           │  • AI Interview Prep guide │
                                           │  • One-click Apply Kit     │
                                           │  • Workplace arrangements  │
                                           └────────────────────────────┘
```

---

## Key Features

### 1. 🤖 AI-Powered Resume Parsing & Matching
- **Multi-Resume Support**: Candidates can upload up to 3 specialized CVs (e.g. Full-Stack Engineer, Product Manager, Operations Lead).
- **Gemini AI Parsing**: Utilizes `gemini-2.5-flash` to extract candidate summary, target roles, core technical/soft skills, tools & frameworks, and career history.
- **Vector Embeddings**: Generates semantic embeddings with Google's `text-embedding-004` model.
- **Fine-Grained Scoring Engine**:
  - Exact & fuzzy role title alignment (up to 38 points).
  - Whole-word skill overlap evaluation (up to 32 points).
  - Seniority matching (Lead, Senior, Staff, Director, Associate).
  - Cross-industry domain heuristics (Fintech, Banking, Healthcare, Operations, etc.).

### 2. 🌐 10 Aggregated Job Feeds
Crawls and normalizes roles across 10 top hiring platforms:
1. **Canada Job Bank (`jobbank.gc.ca`)**: Canada's federal job registry with official telework tags (Remote, Hybrid, On-site).
2. **Greenhouse**: Direct ATS board crawling across curated company registries.
3. **Lever**: Direct ATS job board API ingestion.
4. **Ashby**: Modern startup and tech ATS boards.
5. **BambooHR**: Enterprise and growth company listings.
6. **Himalayas**: High-growth remote tech opportunities.
7. **Seek**: Australia and New Zealand opportunities.
8. **Remotive**: Verified global tech jobs.
9. **WeWorkRemotely**: Remote community listings.
10. **RemoteOK**: Global digital nomad and remote roles.

### 3. 🎯 Intelligent Dashboard & Multi-Filter
- **Real-Time Search**: Search instantly by company, job title, or keyword.
- **Location Filter**: Capped and truncated select menu preventing overflow while preserving searchability.
- **Workplace Arrangement Detection**:
  - 🌍 Remote (All)
  - 🏢 Hybrid
  - 🏛️ On-site / In-Office
  - 🌐 Worldwide Remote
  - 📍 Region-Specific Remote
- **Job Type**: Filter by Full-Time, Contract, or Freelance.
- **Interview Prep Assistant**: One-click AI generation of role-specific technical questions, company deep-dives, and STAR response outlines.
- **Apply Kit**: Quick access to saved candidate details, pre-filled answers, and instant CV downloads.

### 4. 🛡️ Admin Command Center (`/admin`)
- **System Metrics**: Real-time stats on registered users, active jobs, matches generated, and source distribution.
- **User Management**: Inspect users, adjust roles (`admin` / `user`), and manage subscription status.
- **Resume Management on Behalf of Users**: Admins can inspect, upload, replace, or delete resumes across all 3 slots for any user.
- **Per-User Match Re-syncing**: Re-evaluates candidate resumes against all active database positions with clear feedback banners.
- **Global Web Crawler (`⚡ Run Scraper Now`)**: Asynchronously crawls all 10 sources in the background with live progress polling.

### 5. 🔐 Authentication & Security
- **Better Auth Integration**: Secure session management, email verification via Resend, cookie-based sessions with 24-hour duration.
- **Role-Based Access Control (RBAC)**: Protected admin endpoints and middleware verification.
- **Safe Sandboxing**: File uploads validated, strictly isolated, and stored securely.

---

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, React 18, TypeScript)
- **Database**: [PostgreSQL](https://www.postgresql.org/) via [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication**: [Better Auth](https://www.better-auth.com/)
- **AI & LLM**: Google Gemini API (`gemini-2.5-flash`, `text-embedding-004`)
- **Email Delivery**: [Resend](https://resend.com/) & Nodemailer
- **Document Processing**: `pdf-parse`
- **Styling**: Native CSS Variables, Responsive Grid & Flexbox layouts
- **Deployment**: Docker container on Oracle Cloud VPS with Caddy reverse proxy (HTTPS)

---

## Project Structure

```
job-pipeline/
├── app/
│   ├── (auth)/
│   │   ├── login/              # Sign in and Sign up flows
│   │   └── verify-email/       # Email verification handling
│   ├── admin/                  # Admin Command Center & User Management
│   ├── resumes/                # Multi-resume upload & parsing interface
│   ├── api/
│   │   ├── admin/              # Admin metrics, users, resumes, scrape API
│   │   ├── auth/               # Better Auth handler routes
│   │   ├── jobs/               # Public and authenticated job queries
│   │   ├── matches/            # Match scoring, sync & AI interview prep
│   │   ├── resumes/            # User resume upload & management
│   │   └── verify-email/       # Resend email verification endpoint
│   ├── globals.css             # Unified theme, badges, and layout styles
│   ├── layout.tsx              # Root HTML layout with auth providers
│   └── page.tsx                # Candidate job matching dashboard
├── config/
│   ├── companies.json          # Curated company targets for ATS APIs
│   ├── countries.json          # Country geographic & pay data
│   └── cvMapping.json          # Keyword mappings for heuristic fallbacks
├── lib/
│   ├── ai/
│   │   ├── embeddings.ts       # Gemini vector embedding generation
│   │   └── parseResume.ts      # Gemini AI CV parsing & fallback extractors
│   ├── db/
│   │   ├── index.ts            # Drizzle database client
│   │   └── schema.ts           # PostgreSQL database schema & relations
│   ├── fetchers/               # Feed scrapers (10 platforms)
│   │   ├── canada-job-bank.js  # jobbank.gc.ca crawler & RSS fallback
│   │   ├── greenhouse.js       # Greenhouse board API
│   │   ├── lever.js            # Lever board API
│   │   ├── ashby.js            # Ashby board API
│   │   ├── bamboohr.js         # BambooHR board API
│   │   ├── himalayas.js        # Himalayas RSS/API
│   │   ├── seek.js             # Seek crawler
│   │   ├── remotive.js         # Remotive API
│   │   ├── weworkremotely.js   # WWR RSS feed
│   │   └── remoteok.js         # RemoteOK API
│   ├── jobs/
│   │   └── ingest.ts           # Global job ingestion & self-healing
│   ├── matcher/
│   │   └── matchUserJobs.ts    # Multi-user vector & heuristic matching
│   ├── auth.ts                 # Better Auth server configuration
│   ├── auth-client.ts          # Better Auth client hooks
│   ├── email.ts                # Resend transactional email client
│   ├── filters.js              # Location & workplace type categorization
│   └── scorer.js               # Keyword scoring rules
├── tests/
│   ├── filters.test.mjs        # Filter & workplace classification tests
│   └── scorer.test.mjs         # Scorer logic tests
└── scripts/
    ├── check-companies.mjs     # ATS company list health checker
    └── run-pipeline.mjs        # Standalone CLI pipeline runner
```

---

## Environment Configuration

Create a `.env.local` file in the root directory based on `.env.local.example`:

```bash
# --- Database & Multi-Tenancy ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_pipeline

# --- Authentication (Better Auth) ---
# Generate secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-random-32-character-secret-key-here
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- AI & Vector Embeddings ---
GEMINI_API_KEY=your-gemini-api-key-here

# --- File Storage ---
UPLOADS_DIR=./uploads/resumes

# --- Transactional Email (Resend) ---
RESEND_API_KEY=re_123456789
EMAIL_FROM="Job Pipeline <onboarding@resend.dev>"

# --- Matching Constraints ---
MINIMUM_MATCH_SCORE=55
AUTO_APPROVE_MIN_SCORE=80
REQUIRE_REMOTE=false
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20.x or higher
- **Package Manager**: `pnpm` (or `npm`)
- **Database**: PostgreSQL (local or cloud instance)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/donaina/Job-pipeline.git
cd Job-pipeline

# Install dependencies
pnpm install

# Copy environment variables
cp .env.local.example .env.local
# (Edit .env.local with your database and API credentials)
```

### 3. Database Migration
Push the Drizzle schema to your PostgreSQL database:
```bash
pnpm db:push
```

### 4. Run Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Build

```bash
# Run unit test suite
pnpm test

# Build for production
pnpm build

# Start production server
pnpm start
```

---

## Production Deployment

The platform is deployed via Docker and Caddy reverse proxy:
- **Server**: Oracle Cloud VPS (`132.226.80.40`)
- **Reverse Proxy**: Caddy with automated SSL/TLS certificates.
- **Continuous Deployment**: Aeroplane pipeline triggers automatically upon merging pull requests into the `main` branch.

---

## Contributing & Development Workflow

To maintain code stability and prevent deployment regressions:
1. **Never push directly to `main`**.
2. Create a dedicated feature or bugfix branch (`feat/...` or `fix/...`).
3. Verify that `pnpm test` and `pnpm build` pass cleanly.
4. Submit a Pull Request targeting `main`.

---

## License

Private and proprietary. All rights reserved.
