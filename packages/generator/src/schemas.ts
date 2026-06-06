import { z } from "zod";

export const localeSchema = z.enum(["en-US", "zh-CN"]);
export const sourceSchema = z.enum(["producthunt", "github"]);

export const trendIndexSchema = z.object({
  schemaVersion: z.literal("daily-tech-radar.index.v1"),
  source: sourceSchema,
  locale: localeSchema,
  latestDate: z.string().nullable(),
  dates: z.array(z.string()),
  generatedAt: z.string()
});

export const dailyTrendFeedSchema = z.object({
  schemaVersion: z.literal("daily-tech-radar.v1"),
  source: z.literal("producthunt"),
  locale: localeSchema,
  date: z.string(),
  sourceTimezone: z.string(),
  generatedAt: z.string(),
  items: z.array(
    z.object({
      rank: z.number(),
      id: z.string(),
      name: z.string(),
      tagline: z.string(),
      description: z.string(),
      keywords: z.array(z.string()),
      metrics: z.record(z.number()),
      links: z.object({
        homepage: z.string().nullable().optional(),
        source: z.string()
      }),
      assets: z.object({
        icon: z.string().nullable().optional(),
        thumbnail: z.string().nullable().optional(),
        media: z.array(
          z.object({
            type: z.string(),
            url: z.string(),
            videoUrl: z.string().nullable().optional()
          })
        )
      }),
      raw: z.record(z.unknown())
    })
  )
});

const githubSourceReportSchema = z.object({
  id: z.enum(["github_trending_html", "huchenme_api", "github_search", "github_rest"]),
  role: z.enum(["candidate", "fallback", "enrichment"]),
  status: z.enum(["ok", "partial", "failed", "skipped"]),
  itemCount: z.number().optional(),
  rateLimit: z.object({ limit: z.number().optional(), remaining: z.number().optional() }).optional()
});

const githubCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  labelEn: z.string().optional(),
  icon: z.string(),
  order: z.number(),
  description: z.string().optional()
});

const githubRepoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  url: z.string(),
  avatarUrl: z.string().nullable().optional(),
  homepageUrl: z.string().nullable().optional(),
  source: z.object({
    primary: z.enum(["github_trending_html", "huchenme_api", "github_search"]),
    sourceRank: z.number(),
    starsGained: z.number()
  }),
  metadata: z.object({
    description: z.string(),
    language: z.string(),
    topics: z.array(z.string()),
    stars: z.number(),
    forks: z.number().optional(),
    license: z.string().nullable().optional(),
    defaultBranch: z.string().nullable().optional(),
    pushedAt: z.string().nullable().optional(),
    topLanguages: z.array(z.string()).optional()
  }),
  readmeRef: z.object({
    status: z.enum(["available", "missing", "rate_limited", "unknown"]),
    path: z.string().nullable().optional(),
    sha: z.string().nullable().optional(),
    rawUrl: z.string().nullable().optional()
  }),
  readmeSignals: z.object({
    title: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    headings: z.array(z.string()),
    commands: z.array(z.string()),
    keywords: z.array(z.string()),
    score: z.number()
  }),
  visual: z.object({
    kind: z.enum(["readme_image", "agnes_generated", "repository_avatar", "none"]),
    url: z.string().nullable().optional(),
    thumbUrl: z.string().nullable().optional(),
    alt: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    promptHash: z.string().nullable().optional()
  }),
  classification: z.object({
    primaryCategoryId: z.string(),
    secondaryCategoryIds: z.array(z.string()),
    confidence: z.number(),
    method: z.enum(["rules", "rules_readme", "llm", "manual_override"]),
    reasons: z.array(z.string()),
    signals: z.array(z.string())
  }),
  rank: z.object({
    globalRank: z.number(),
    categoryRank: z.number().optional(),
    score: z.number()
  })
});

const githubViewSchema = z.object({
  id: z.string(),
  type: z.enum(["category", "curated", "review"]),
  label: z.string(),
  categoryId: z.string().optional(),
  repoIds: z.array(z.string()),
  sort: z.enum(["score", "globalRank", "starsGained", "confidence"]).optional()
});

export const dailyTrendPackageSchema = z.object({
  schemaVersion: z.literal("trendreader.daily.v1"),
  packageId: z.string(),
  locale: localeSchema,
  generatedAt: z.string(),
  expiresAt: z.string(),
  sourceWindow: z.object({
    since: z.enum(["daily", "weekly", "monthly"]),
    language: z.string(),
    spokenLanguageCode: z.string().nullable().optional()
  }),
  sources: z.array(githubSourceReportSchema),
  taxonomy: z.object({
    version: z.string(),
    generatedAt: z.string(),
    categories: z.array(githubCategorySchema)
  }),
  repos: z.array(githubRepoSchema),
  views: z.array(githubViewSchema).optional(),
  health: z
    .object({
      status: z.enum(["ok", "partial", "degraded"]),
      candidateCount: z.number(),
      enrichedRepoCount: z.number(),
      unclassifiedRepoCount: z.number(),
      warnings: z.array(z.string())
    })
    .optional()
});
