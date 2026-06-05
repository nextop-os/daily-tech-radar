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
  sources: z.array(z.record(z.unknown())),
  taxonomy: z.object({
    version: z.string(),
    generatedAt: z.string(),
    categories: z.array(z.record(z.unknown()))
  }),
  repos: z.array(z.record(z.unknown())),
  views: z.array(z.record(z.unknown())).optional(),
  health: z.record(z.unknown()).optional()
});

