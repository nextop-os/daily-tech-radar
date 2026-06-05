export type Locale = "en-US" | "zh-CN";
export type TrendSource = "producthunt" | "github";

export type DailyTrendFeed = {
  schemaVersion: "daily-tech-radar.v1";
  source: "producthunt";
  locale: Locale;
  date: string;
  sourceTimezone: string;
  generatedAt: string;
  items: unknown[];
};

export type DailyTrendPackage = {
  schemaVersion: "trendreader.daily.v1";
  packageId: string;
  locale: Locale;
  generatedAt: string;
  expiresAt: string;
  repos: unknown[];
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

