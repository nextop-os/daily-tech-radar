import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import type { DailyTrendPackage, GitHubTrendRepo, Locale } from "../types.js";
import { addUtcDays } from "../date.js";

type CandidateRepo = {
  owner: string;
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  starsGained: number;
  rank: number;
  url: string;
};

const TAXONOMY = [
  { id: "ai", label: "AI", labelEn: "AI", icon: "bot", order: 20 },
  { id: "tools", label: "工具", labelEn: "Tools", icon: "wrench", order: 100 },
  { id: "frontend", label: "前端", labelEn: "Frontend", icon: "layout", order: 140 },
  { id: "backend", label: "后端", labelEn: "Backend", icon: "server", order: 110 },
  { id: "unclassified", label: "Needs Review", labelEn: "Needs Review", icon: "circle-help", order: 999 }
];

export function parseGitHubTrendingHtml(html: string): CandidateRepo[] {
  const $ = cheerio.load(html);
  const repos: CandidateRepo[] = [];
  $("article.Box-row").each((index, element) => {
    const title = $(element).find("h2 a").text().replace(/\s+/g, " ").trim();
    const [ownerRaw, nameRaw] = title.split("/").map((part) => part.trim());
    if (!ownerRaw || !nameRaw) {
      return;
    }
    const href = $(element).find("h2 a").attr("href") ?? `/${ownerRaw}/${nameRaw}`;
    const description = $(element).find("p").first().text().replace(/\s+/g, " ").trim();
    const language = $(element).find("[itemprop='programmingLanguage']").text().trim();
    const numbers = $(element)
      .find("a.Link--muted, span.d-inline-block.float-sm-right")
      .map((_, item) => $(item).text().replace(/,/g, "").trim())
      .get();
    const stars = parseFirstNumber(numbers[0]);
    const forks = parseFirstNumber(numbers[1]);
    const starsGained = parseFirstNumber(numbers.find((text) => /stars?\s+today/i.test(text)) ?? "0");
    repos.push({
      owner: ownerRaw,
      name: nameRaw,
      description,
      language,
      stars,
      forks,
      starsGained,
      rank: index + 1,
      url: `https://github.com${href}`
    });
  });
  return repos;
}

export function buildGitHubPackage(options: {
  candidates: CandidateRepo[];
  locale: Locale;
  date: string;
  generatedAt: string;
}): DailyTrendPackage {
  const repos = options.candidates.map((candidate) => candidateToRepo(candidate, options.locale));
  const views = TAXONOMY.map((category) => ({
    id: category.id,
    type: category.id === "unclassified" ? ("review" as const) : ("category" as const),
    label: options.locale === "zh-CN" ? category.label : category.labelEn ?? category.label,
    categoryId: category.id,
    repoIds: repos
      .filter((repo) => repo.classification.primaryCategoryId === category.id)
      .sort((a, b) => b.rank.score - a.rank.score)
      .map((repo) => repo.id),
    sort: "score" as const
  })).filter((view) => view.repoIds.length > 0);

  return {
    schemaVersion: "trendreader.daily.v1",
    packageId: `github-daily-All-${options.date}`,
    locale: options.locale,
    generatedAt: options.generatedAt,
    expiresAt: addUtcDays(options.generatedAt, 1),
    sourceWindow: {
      since: "daily",
      language: "All",
      spokenLanguageCode: null
    },
    sources: [
      {
        id: "github_trending_html",
        role: "candidate",
        status: repos.length > 0 ? "ok" : "failed",
        itemCount: repos.length
      }
    ],
    taxonomy: {
      version: options.date,
      generatedAt: options.generatedAt,
      categories: TAXONOMY
    },
    repos,
    views,
    health: {
      status: repos.length > 0 ? "ok" : "degraded",
      candidateCount: options.candidates.length,
      enrichedRepoCount: 0,
      unclassifiedRepoCount: repos.filter((repo) => repo.classification.primaryCategoryId === "unclassified").length,
      warnings: ["Phase 2 fixture package: REST enrichment and Agnes visual generation are not enabled in this run"]
    }
  };
}

function candidateToRepo(candidate: CandidateRepo, locale: Locale): GitHubTrendRepo {
  const category = classify(candidate);
  const id = `${candidate.owner}-${candidate.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const score = Math.max(0, 100 - candidate.rank * 2 + Math.min(candidate.starsGained / 10, 20));
  return {
    id,
    owner: candidate.owner,
    name: candidate.name,
    url: candidate.url,
    avatarUrl: `https://github.com/${candidate.owner}.png`,
    homepageUrl: null,
    source: {
      primary: "github_trending_html",
      sourceRank: candidate.rank,
      starsGained: candidate.starsGained
    },
    metadata: {
      description: candidate.description,
      language: candidate.language,
      topics: [],
      stars: candidate.stars,
      forks: candidate.forks,
      license: null,
      defaultBranch: null,
      pushedAt: null,
      topLanguages: candidate.language ? [candidate.language] : []
    },
    readmeRef: {
      status: "unknown",
      path: null,
      sha: null,
      rawUrl: null
    },
    readmeSignals: {
      title: candidate.name,
      summary: locale === "zh-CN" ? candidate.description : candidate.description,
      headings: [],
      commands: [],
      keywords: category.signals,
      score: category.confidence * 100
    },
    visual: {
      kind: "repository_avatar",
      url: `https://github.com/${candidate.owner}.png`,
      thumbUrl: `https://github.com/${candidate.owner}.png`,
      alt: `${candidate.owner}/${candidate.name}`,
      sourceUrl: candidate.url,
      promptHash: hashPrompt(`${candidate.owner}/${candidate.name}:${candidate.description}`)
    },
    classification: {
      primaryCategoryId: category.id,
      secondaryCategoryIds: [],
      confidence: category.confidence,
      method: "rules",
      reasons: category.reasons,
      signals: category.signals
    },
    rank: {
      globalRank: candidate.rank,
      categoryRank: candidate.rank,
      score
    }
  };
}

function classify(candidate: CandidateRepo): { id: string; confidence: number; reasons: string[]; signals: string[] } {
  const text = `${candidate.name} ${candidate.description} ${candidate.language}`.toLowerCase();
  const rules = [
    { id: "ai", tokens: ["ai", "agent", "llm", "mcp", "model"] },
    { id: "frontend", tokens: ["react", "vue", "frontend", "css", "ui"] },
    { id: "backend", tokens: ["server", "database", "api", "postgres", "redis"] },
    { id: "tools", tokens: ["cli", "tool", "automation", "workflow"] }
  ];
  for (const rule of rules) {
    const matched = rule.tokens.filter((token) => text.includes(token));
    if (matched.length > 0) {
      return {
        id: rule.id,
        confidence: Math.min(0.9, 0.6 + matched.length * 0.1),
        reasons: matched.map((token) => `Matched ${token}`),
        signals: matched
      };
    }
  }
  return {
    id: "unclassified",
    confidence: 0.4,
    reasons: ["No taxonomy rule matched with enough confidence"],
    signals: []
  };
}

function parseFirstNumber(input: string): number {
  const match = input.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function hashPrompt(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

