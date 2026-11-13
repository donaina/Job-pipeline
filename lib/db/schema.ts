import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  jsonb,
  uuid,
  customType,
  index,
} from "drizzle-orm/pg-core";

// Custom vector type for embeddings (stored as jsonb for universal Postgres compatibility)
export const vector768 = customType<{ data: number[] }>({
  dataType() {
    return "jsonb";
  },
  toDriver(value: number[]): any {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return (value as number[]) || [];
  },
});

// --- Better Auth Schema Tables ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user").notNull(), // "user" | "admin"
  subscriptionTier: text("subscription_tier").default("free").notNull(), // "free" | "pro"
  subscriptionStatus: text("subscription_status").default("active").notNull(), // "active" | "past_due" | "canceled"
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  aiAnalysisCount: integer("ai_analysis_count").default(0).notNull(),
  preferences: jsonb("preferences").$type<{
    targetRoles?: string[];
    preferredCountries?: string[];
    minSalary?: number;
    remoteOnly?: boolean;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Application Core Tables ---

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slotNumber: integer("slot_number").notNull(), // 1, 2, or 3
    label: text("label").notNull(), // e.g. "Frontend Engineer", "React Native", "Full-stack"
    inputType: text("input_type").notNull().default("FILE_UPLOAD"), // "FILE_UPLOAD" or "MANUAL_ENTRY"
    fileUrl: text("file_url"), // Local disk path or cloud storage URL
    fileName: text("file_name"),
    rawText: text("raw_text"),
    parsedData: jsonb("parsed_data").$type<{
      fullName?: string;
      email?: string;
      phone?: string;
      links?: { linkedin?: string; github?: string; portfolio?: string };
      summary?: string;
      coreSkills?: string[];
      toolsAndFrameworks?: string[];
      yearsOfExperience?: number;
      experience?: Array<{
        company: string;
        role: string;
        startDate?: string;
        endDate?: string;
        highlights?: string[];
      }>;
      education?: Array<{
        institution: string;
        degree?: string;
        year?: string;
      }>;
    }>(),
    embedding: vector768("embedding"),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userSlotIdx: index("user_slot_idx").on(table.userId, table.slotNumber),
  })
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    externalId: text("external_id").notNull().unique(), // Unique hash/ID across Greenhouse, Seek, etc.
    source: text("source").notNull(), // greenhouse, remotive, lever, etc.
    company: text("company").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    remoteType: text("remote_type").default("remote"),
    salaryEst: text("salary_est"),
    applyUrl: text("apply_url"),
    applyEmail: text("apply_email"),
    tags: jsonb("tags").$type<string[]>().default([]),
    requirements: jsonb("requirements").$type<{
      requiredSkills?: string[];
      niceToHaveSkills?: string[];
      seniority?: string;
    }>(),
    embedding: vector768("embedding"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    externalIdIdx: index("job_external_id_idx").on(table.externalId),
  })
);

export const jobMatches = pgTable(
  "job_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    bestResumeId: uuid("best_resume_id").references(() => resumes.id, {
      onDelete: "set null",
    }),
    matchScore: doublePrecision("match_score").notNull().default(0),
    status: text("status").notNull().default("NEW"), // NEW, SAVED, APPLIED, INTERVIEW, REJECTED, DISMISSED
    gapAnalysis: jsonb("gap_analysis").$type<{
      fitLevel?: string;
      summaryReasoning?: string;
      strengths?: string[];
      missingCriticalSkills?: string[];
      missingNiceToHaves?: string[];
    }>(),
    tailoredSuggestions: jsonb("tailored_suggestions").$type<{
      summaryTweak?: string;
      suggestedBulletEdits?: Array<{
        originalBullet?: string;
        improvedBullet?: string;
      }>;
      keywordsToIntegrate?: string[];
    }>(),
    appliedAt: timestamp("applied_at"),
    followUpDate: timestamp("follow_up_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userJobIdx: index("user_job_idx").on(table.userId, table.jobId),
    userScoreIdx: index("user_score_idx").on(table.userId, table.matchScore),
  })
);

