export type Locale = "en-US" | "zh-CN";
export type TrendSource = "producthunt" | "github";

export type TrendIndex = {
  schemaVersion: "daily-tech-radar.index.v1";
  source: TrendSource;
  locale: Locale;
  latestDate: string | null;
  dates: string[];
  generatedAt: string;
};

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

export type ProductHuntPost = {
  id: string;
  slug?: string | null;
  name: string;
  tagline?: string | null;
  description?: string | null;
  votesCount?: number | null;
  commentsCount?: number | null;
  createdAt?: string | null;
  featuredAt?: string | null;
  website?: string | null;
  url?: string | null;
  thumbnail?: { url?: string | null; videoUrl?: string | null } | null;
  media?: TrendMedia[] | null;
  makers?: Array<{ id?: string; name?: string | null; username?: string | null }> | null;
  topics?: { edges?: Array<{ node?: { id?: string; name?: string; slug?: string } }> } | null;
};

export type ProductHuntLocalization = {
  id: string;
  taglineZh: string;
  descriptionZh: string;
  keywordsEn: string[];
  keywordsZh: string[];
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

export type GitHubVisualOptions = {
  fetchImpl?: typeof fetch;
  githubToken?: string;
  agnesApiKey?: string;
  generateAgnesImages?: boolean;
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
