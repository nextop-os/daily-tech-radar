export type Locale = "en-US" | "zh-CN";
export type TrendSource = "producthunt" | "github";

export type TrendMedia = {
  type: string;
  url: string;
  videoUrl?: string | null;
};

export type DailyTrendFeedItem = {
  rank: number;
  id: string;
  name: string;
  tagline: string;
  description: string;
  keywords: string[];
  metrics: Record<string, number>;
  links: {
    homepage?: string | null;
    source: string;
  };
  assets: {
    icon?: string | null;
    thumbnail?: string | null;
    media: TrendMedia[];
  };
  raw: Record<string, unknown>;
};

export type DailyTrendFeed = {
  schemaVersion: "daily-tech-radar.v1";
  source: "producthunt";
  locale: Locale;
  date: string;
  sourceTimezone: string;
  generatedAt: string;
  items: DailyTrendFeedItem[];
};

export type GitHubTrendRepo = {
  id: string;
  owner: string;
  name: string;
  url: string;
  avatarUrl?: string | null;
  homepageUrl?: string | null;
  source: {
    primary: "github_trending_html" | "huchenme_api" | "github_search";
    sourceRank: number;
    starsGained: number;
  };
  metadata: {
    description: string;
    language: string;
    topics: string[];
    stars: number;
    forks?: number;
    license?: string | null;
    defaultBranch?: string | null;
    pushedAt?: string | null;
    topLanguages?: string[];
  };
  readmeRef: {
    status: "available" | "missing" | "rate_limited" | "unknown";
    path?: string | null;
    sha?: string | null;
    rawUrl?: string | null;
  };
  readmeSignals: {
    title?: string | null;
    summary?: string | null;
    headings: string[];
    commands: string[];
    keywords: string[];
    score: number;
  };
  visual: {
    kind: "readme_image" | "agnes_generated" | "repository_avatar" | "none";
    url?: string | null;
    thumbUrl?: string | null;
    alt?: string | null;
    sourceUrl?: string | null;
    promptHash?: string | null;
  };
  classification: {
    primaryCategoryId: string;
    secondaryCategoryIds: string[];
    confidence: number;
    method: "rules" | "rules_readme" | "llm" | "manual_override";
    reasons: string[];
    signals: string[];
  };
  rank: {
    globalRank: number;
    categoryRank?: number;
    score: number;
  };
};

export type GitHubTrendView = {
  id: string;
  type: "category" | "curated" | "review";
  label: string;
  categoryId?: string;
  repoIds: string[];
  sort?: "score" | "globalRank" | "starsGained" | "confidence";
};

export type DailyTrendPackage = {
  schemaVersion: "trendreader.daily.v1";
  packageId: string;
  locale: Locale;
  generatedAt: string;
  expiresAt: string;
  sourceWindow: {
    since: "daily" | "weekly" | "monthly";
    language: string;
    spokenLanguageCode?: string | null;
  };
  sources: Array<{
    id: "github_trending_html" | "huchenme_api" | "github_search" | "github_rest";
    role: "candidate" | "fallback" | "enrichment";
    status: "ok" | "partial" | "failed" | "skipped";
    itemCount?: number;
    rateLimit?: { limit?: number; remaining?: number };
  }>;
  taxonomy: {
    version: string;
    generatedAt: string;
    categories: Array<{
      id: string;
      label: string;
      labelEn?: string;
      icon: string;
      order: number;
      description?: string;
    }>;
  };
  repos: GitHubTrendRepo[];
  views?: GitHubTrendView[];
  health?: {
    status: "ok" | "partial" | "degraded";
    candidateCount: number;
    enrichedRepoCount: number;
    unclassifiedRepoCount: number;
    warnings: string[];
  };
};

export type TrendIndex = {
  schemaVersion: "daily-tech-radar.index.v1";
  source: TrendSource;
  locale: Locale;
  latestDate: string | null;
  dates: string[];
  generatedAt: string;
};

export type DailyTechRadarClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

export const DEFAULT_BASE_URL = "https://cdn.jsdelivr.net/gh/nextop-os/daily-tech-radar@main/data";

export class DailyTechRadarClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  readonly productHunt = {
    latest: (locale: Locale = "en-US") => this.fetchLatest({ source: "producthunt", locale }) as Promise<DailyTrendFeed>,
    byDate: (date: string, locale: Locale = "en-US") =>
      this.fetchByDate({ source: "producthunt", locale, date }) as Promise<DailyTrendFeed>,
    index: (locale: Locale = "en-US") => this.fetchIndex({ source: "producthunt", locale })
  };

  readonly github = {
    latest: (locale: Locale = "en-US") => this.fetchLatest({ source: "github", locale }) as Promise<DailyTrendPackage>,
    byDate: (date: string, locale: Locale = "en-US") =>
      this.fetchByDate({ source: "github", locale, date }) as Promise<DailyTrendPackage>,
    index: (locale: Locale = "en-US") => this.fetchIndex({ source: "github", locale })
  };

  constructor(options: DailyTechRadarClientOptions = {}) {
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async fetchLatest(options: { source: TrendSource; locale: Locale }): Promise<DailyTrendFeed | DailyTrendPackage> {
    return this.fetchJson(this.urlFor(options.source, options.locale, "latest.json"));
  }

  async fetchByDate(options: {
    source: TrendSource;
    locale: Locale;
    date: string;
  }): Promise<DailyTrendFeed | DailyTrendPackage> {
    return this.fetchJson(this.urlFor(options.source, options.locale, `${options.date}.json`));
  }

  async fetchIndex(options: { source: TrendSource; locale: Locale }): Promise<TrendIndex> {
    return this.fetchJson(this.urlFor(options.source, options.locale, "index.json"));
  }

  private urlFor(source: TrendSource, locale: Locale, fileName: string): string {
    return `${this.baseUrl}/${source}/${locale}/${fileName}`;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`DailyTechRadar request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
