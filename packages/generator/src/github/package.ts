import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { createAgnesClient } from "agnes-ai-cli";
import type { DailyTrendPackage, GitHubTrendRepo, GitHubVisualOptions, Locale } from "../types.js";
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

type ReadmeInfo = {
  status: "available" | "missing" | "rate_limited" | "unknown";
  path?: string | null;
  sha?: string | null;
  rawUrl?: string | null;
  markdown?: string;
};

type VisualInfo = GitHubTrendRepo["visual"];

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

export async function buildGitHubPackage(options: {
  candidates: CandidateRepo[];
  locale: Locale;
  date: string;
  generatedAt: string;
  visual?: GitHubVisualOptions;
}): Promise<DailyTrendPackage> {
  const repos = await Promise.all(
    options.candidates.map((candidate) => candidateToRepo(candidate, options.locale, options.visual ?? {}))
  );
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

  const readmeImageCount = repos.filter((repo) => repo.visual.kind === "readme_image").length;
  const agnesImageCount = repos.filter((repo) => repo.visual.kind === "agnes_generated").length;
  const avatarFallbackCount = repos.filter((repo) => repo.visual.kind === "repository_avatar").length;

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
      enrichedRepoCount: repos.filter((repo) => repo.readmeRef.status === "available").length,
      unclassifiedRepoCount: repos.filter((repo) => repo.classification.primaryCategoryId === "unclassified").length,
      warnings:
        avatarFallbackCount > 0
          ? [
              `${readmeImageCount} repos used README images, ${agnesImageCount} used Agnes images, ${avatarFallbackCount} fell back to repository avatars`
            ]
          : []
    }
  };
}

async function candidateToRepo(
  candidate: CandidateRepo,
  locale: Locale,
  visualOptions: GitHubVisualOptions
): Promise<GitHubTrendRepo> {
  const category = classify(candidate);
  const id = `${candidate.owner}-${candidate.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const score = Math.max(0, 100 - candidate.rank * 2 + Math.min(candidate.starsGained / 10, 20));
  const readme = await fetchReadme(candidate, visualOptions);
  const readmeSignals = readme.markdown
    ? extractReadmeSignals(readme.markdown, candidate.description, category.signals)
    : {
        title: candidate.name,
        summary: locale === "zh-CN" ? candidate.description : candidate.description,
        headings: [],
        commands: [],
        keywords: category.signals,
        score: category.confidence * 100
      };
  const visual = await selectVisual(candidate, category.id, readme, readmeSignals.summary, visualOptions);
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
      status: readme.status,
      path: readme.path ?? null,
      sha: readme.sha ?? null,
      rawUrl: readme.rawUrl ?? null
    },
    readmeSignals,
    visual,
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

async function fetchReadme(candidate: CandidateRepo, options: GitHubVisualOptions): Promise<ReadmeInfo> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = options.githubToken ? { Authorization: `Bearer ${options.githubToken}` } : undefined;
  const branches = ["main", "master"];
  const names = ["README.md", "readme.md", "README.mdx"];
  for (const branch of branches) {
    for (const name of names) {
      const rawUrl = `https://raw.githubusercontent.com/${candidate.owner}/${candidate.name}/${branch}/${name}`;
      const response = await fetchImpl(rawUrl, { headers });
      if (response.status === 403 || response.status === 429) {
        return { status: "rate_limited", path: name, rawUrl };
      }
      if (response.ok) {
        return {
          status: "available",
          path: name,
          sha: null,
          rawUrl,
          markdown: await response.text()
        };
      }
    }
  }
  return { status: "missing", path: null, sha: null, rawUrl: null };
}

function extractReadmeSignals(markdown: string, fallbackSummary: string, fallbackKeywords: string[]) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
  const summary =
    markdown
      .split(/\n{2,}/)
      .map((part) => part.replace(/[#>*_`[\]()]/g, "").trim())
      .find((part) => part.length > 40 && !part.startsWith("!")) ?? fallbackSummary;
  const headings = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].slice(0, 8).map((match) => match[1].trim());
  const commands = [...markdown.matchAll(/\b(?:npm install|pnpm add|yarn add|pip install|cargo install)\s+[^\n`]+/g)]
    .slice(0, 6)
    .map((match) => match[0].trim());
  const keywords = [...new Set([...fallbackKeywords, ...headings.slice(0, 4).map((heading) => heading.toLowerCase())])].slice(0, 8);
  return {
    title,
    summary,
    headings,
    commands,
    keywords,
    score: Math.min(100, 40 + headings.length * 5 + commands.length * 5 + (summary ? 20 : 0))
  };
}

async function selectVisual(
  candidate: CandidateRepo,
  categoryId: string,
  readme: ReadmeInfo,
  summary: string | null | undefined,
  options: GitHubVisualOptions
): Promise<VisualInfo> {
  const readmeImage = readme.markdown && readme.rawUrl ? firstReadmeImage(readme.markdown, readme.rawUrl) : null;
  if (readmeImage) {
    return {
      kind: "readme_image",
      url: readmeImage.url,
      thumbUrl: readmeImage.url,
      alt: readmeImage.alt || `${candidate.owner}/${candidate.name}`,
      sourceUrl: readmeImage.url,
      promptHash: null
    };
  }

  if (options.generateAgnesImages && options.agnesApiKey) {
    const prompt = [
      "Create a clean product card cover for an open-source GitHub project.",
      `Project: ${candidate.owner}/${candidate.name}`,
      `Category: ${categoryId}`,
      `Description: ${candidate.description}`,
      `README summary: ${summary ?? candidate.description}`,
      "Style: light editorial software product screenshot, practical developer tool, no fake UI text, no logos copied from GitHub, 16:10 composition, clear focal object."
    ].join("\n");
    try {
      const agnes = createAgnesClient({ apiKey: options.agnesApiKey, fetchImpl: options.fetchImpl });
      const image = await agnes.image.generate({
        mode: "text2img",
        model: "agnes-image-2.1-flash",
        prompt,
        size: "1024x640"
      });
      return {
        kind: "agnes_generated",
        url: image.url,
        thumbUrl: image.url,
        alt: `Generated cover for ${candidate.owner}/${candidate.name}`,
        sourceUrl: null,
        promptHash: hashPrompt(prompt)
      };
    } catch {
      // Fall through to avatar if generation fails.
    }
  }

  return {
    kind: "repository_avatar",
    url: `https://github.com/${candidate.owner}.png`,
    thumbUrl: `https://github.com/${candidate.owner}.png`,
    alt: `${candidate.owner}/${candidate.name}`,
    sourceUrl: candidate.url,
    promptHash: hashPrompt(`${candidate.owner}/${candidate.name}:${candidate.description}`)
  };
}

function firstReadmeImage(markdown: string, readmeRawUrl: string): { url: string; alt: string | null } | null {
  const candidates = [
    ...[...markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => ({
      alt: match[1] || null,
      src: match[2]
    })),
    ...[...markdown.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map((match) => ({
      alt: match[0].match(/alt=["']([^"']+)["']/i)?.[1] ?? null,
      src: match[1]
    }))
  ];
  for (const candidate of candidates) {
    if (isSkippedImage(candidate.src)) {
      continue;
    }
    return {
      alt: candidate.alt,
      url: resolveReadmeImageUrl(candidate.src, readmeRawUrl)
    };
  }
  return null;
}

function isSkippedImage(src: string): boolean {
  const value = src.toLowerCase();
  return (
    value.includes("shield") ||
    value.includes("badge") ||
    value.includes("opencollective") ||
    value.endsWith(".svg?sanitize=true")
  );
}

function resolveReadmeImageUrl(src: string, readmeRawUrl: string): string {
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  if (src.startsWith("//")) {
    return `https:${src}`;
  }
  const base = new URL(readmeRawUrl);
  const parts = base.pathname.split("/");
  parts.pop();
  const normalized = src.replace(/^\.\//, "");
  base.pathname = `${parts.join("/")}/${normalized}`;
  return base.toString();
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
