import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { createAgnesClient } from "agnes-ai-cli";
import type {
  DailyTrendPackage,
  GitHubRepoLocalization,
  GitHubTrendRepo,
  GitHubVisualOptions,
  Locale
} from "../types.js";
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
  localizations?: GitHubRepoLocalization[];
  visual?: GitHubVisualOptions;
}): Promise<DailyTrendPackage> {
  const localizations = new Map((options.localizations ?? []).map((item) => [item.id, item]));
  const repos = await Promise.all(
    options.candidates.map((candidate) =>
      candidateToRepo(candidate, options.locale, options.visual ?? {}, localizations)
    )
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
  visualOptions: GitHubVisualOptions,
  localizations: Map<string, GitHubRepoLocalization>
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
  const localization = locale === "zh-CN" ? localizations.get(id) : undefined;
  const localizedReadmeSignals = localization
    ? {
        ...readmeSignals,
        summary: localization.summaryZh,
        keywords: localization.keywordsZh
      }
    : readmeSignals;
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
      description: localization?.descriptionZh ?? candidate.description,
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
    readmeSignals: localizedReadmeSignals,
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
  const summary = extractReadmeSummary(markdown) ?? fallbackSummary;
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

export function extractReadmeSummary(markdown: string): string | null {
  const scrubbed = markdown
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "\n")
    .replace(/<img\b[^>]*>/gi, "\n")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "\n")
    .replace(/\[[^\]]+]:\s+\S+.*$/gm, "\n");

  for (const paragraph of scrubbed.split(/\n{2,}/)) {
    const text = paragraph
      .replace(/<[^>]+>/g, " ")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*_]{3,}\s*$/gm, "")
      .replace(/^\s*[|: -]+\s*$/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/\[[^\]]+]\(([^)]+)\)/g, "$1")
      .replace(/[#>*_`[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (isUsableSummary(text)) {
      return text.slice(0, 280);
    }
  }
  return null;
}

function isUsableSummary(value: string): boolean {
  if (value.length < 40) {
    return false;
  }
  if (/^(language|contributors?|forks|stargazers?|stars?|license|build|coverage)\b/i.test(value)) {
    return false;
  }
  if (/^!/.test(value)) {
    return false;
  }
  if (/[█╔╗║═╝╚]/.test(value)) {
    return false;
  }
  if (/(shield|badge|release-img|test-img|license-img|go-report-img|docker-pulls|github-downloads)/i.test(value)) {
    return false;
  }
  if (/^(https?:\/\/|www\.)/i.test(value)) {
    return false;
  }
  const letters = value.replace(/[^a-zA-Z\u4e00-\u9fff]/g, "");
  const compact = value.replace(/\s/g, "");
  return letters.length >= 24 && letters.length / compact.length >= 0.45;
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
    const prompt = buildAgnesCoverPrompt(candidate, categoryId, summary);
    try {
      const agnes = createAgnesClient({ apiKey: options.agnesApiKey, fetchImpl: options.fetchImpl });
      const image = await agnes.image.generate({
        mode: "text2img",
        model: "agnes-image-2.1-flash",
        prompt,
        size: "1024x640",
        seed: imageSeed(`${candidate.owner}/${candidate.name}`)
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

function buildAgnesCoverPrompt(
  candidate: CandidateRepo,
  categoryId: string,
  summary: string | null | undefined
) {
  const workflow = workflowForCategory(categoryId);
  const visualMetaphor = visualMetaphorForRepo(candidate, summary);
  const visualScript = visualScriptForRepo(candidate, categoryId, summary);

  return [
    "type: cartoon visual explainer infographic",
    "Goal: turn complex technical content into a visual feast that explains the product function in one glance.",
    "Asset type: 16:10 GitHub trend card cover for a product discovery app, optimized for a card thumbnail and a larger detail drawer.",
    `Project: ${candidate.owner}/${candidate.name}`,
    `Category: ${categoryId}`,
    `Description: ${candidate.description}`,
    `README summary: ${summary ?? candidate.description}`,
    `Category hint: ${categoryId}`,
    `Functional story hint: ${workflow}.`,
    `Visual metaphor hint: ${visualMetaphor}.`,
    `Fallback text script if semantic inference is uncertain: capability headline "${visualScript.headline}", section labels "${visualScript.sections.join(" / ")}", benefit tags "${visualScript.benefits.join(" / ")}".`,
    `Fallback visual objects if semantic inference is uncertain: ${visualScript.objects.join(", ")}.`,
    "Semantic inference rules: before drawing, infer the actual product or tool from the repo title, description, and README summary. Decide the product type, target user, core job-to-be-done, input sources, transformation, output, proof/scoring signals, and likely UI surface.",
    "Generate the visible script from that inferred meaning: repo title, a concise capability headline, 2-3 section labels that describe the real workflow, and 2-4 benefit tags that name the real capabilities or signals. Do not merely reuse the fallback script when the repo text gives better specifics.",
    "Render the most likely product UI or usage surface implied by the repo: browser extension popup, editor panel, terminal session, canvas, agent chat, workflow builder, dashboard, API console, mobile app, document parser, database browser, or other concrete interface. Pick the surface semantically rather than by keyword matching.",
    "Make the repository identity obvious at thumbnail size: the repo title must be the largest readable text, and the capability headline must sit directly beneath it.",
    "Choose an original layout that fits the repo. Do not copy a fixed input-center-output template and do not imitate any supplied reference image structure.",
    "Possible layouts: process flow, before-and-after comparison, modular feature map, architecture cutaway, hub-and-spoke capability map, layered stack, dashboard collage, pipeline journey, comic-style explanation panels, or another clear infographic composition.",
    "The poster should explain the specific repo: what problem it solves, what source material or user action starts it, what transformation happens, and what useful outcome appears. Use the repo title and capability headline to anchor that story.",
    "Use a memorable central visual metaphor when helpful: compression machine, parser, agent control room, automation conveyor, memory graph, creative engine, API toolkit, or another metaphor implied by the repo.",
    "Use product-specific interface details: navigation rails, prompt boxes, canvas objects, file trees, cards, charts, terminal prompts, plugin tiles, inspector panels, timeline strips, browser chrome, or mobile screens when those details clarify the product.",
    "Use large icons, clean illustrations, charts, documents, app windows, database blocks, terminal cards, agent/tool nodes, arrows, callouts, numbered badges, or benefit cards as needed, but only if they clarify the function.",
    "Style: bright educational infographic poster, playful but professional, thick rounded strokes, glossy icons, white background, vibrant accent colors, high information density, crisp hierarchy, delightful small decorations.",
    "Typography: use the required text script as large readable labels. Keep every text element short, high-contrast, typo-free, and important to comprehension.",
    "Only the repo title, capability headline, section labels, benefit tags, and essential UI labels may contain text. Essential UI labels must be short, meaningful, and tied to the repo's capability; avoid fake filler text.",
    "Avoid: copied GitHub UI, README screenshot, long paragraphs, small body text, code snippets, lorem ipsum, fake UI microcopy, generic sci-fi cube, plain abstract gradient, mascot-only image, dark screenshot banner.",
    "No extra labels and no gibberish microtext. If text cannot be rendered cleanly, replace it with blank grey placeholder lines."
  ].join("\n");
}

function visualMetaphorForRepo(candidate: CandidateRepo, summary: string | null | undefined) {
  const text = `${candidate.name} ${candidate.description} ${summary ?? ""}`.toLowerCase();

  if (/(compress|compression|context|rag|logs?|tool outputs?|chunks?)/.test(text)) {
    return "many documents, logs, files, and RAG chunks compress into a smaller focused context packet that feeds an AI agent answer panel";
  }

  if (/(ocr|pdf|document|parse|structured data|extract)/.test(text)) {
    return "PDFs and images enter a document parser, text regions are recognized, and clean tables or JSON-like data cards come out";
  }

  if (/(agent|workflow|automation|mcp|tool use)/.test(text)) {
    return "a user task enters an agent workspace, tools are selected and executed, and completed action cards are produced";
  }

  if (/(commerce|ecommerce|store|shopify|order|customer support)/.test(text)) {
    return "products, orders, and customer messages flow through an automation hub into inventory, fulfillment, and support results";
  }

  if (/(image|video|visual|generate|generation|render)/.test(text)) {
    return "prompts and source assets flow through a creative engine into generated image or video output tiles";
  }

  if (/(memory|knowledge|search|recall|conversation)/.test(text)) {
    return "scattered notes and conversations are indexed into a knowledge graph, then retrieved as focused answers";
  }

  if (/(cli|terminal|command|developer|sdk|api|framework)/.test(text)) {
    return "commands, code modules, and API calls move through a developer toolkit into deployable project outputs";
  }

  return "raw project inputs are transformed through a central capability engine into practical product outputs";
}

function visualScriptForRepo(candidate: CandidateRepo, categoryId: string, summary: string | null | undefined) {
  const text = `${candidate.name} ${candidate.description} ${summary ?? ""}`.toLowerCase();

  if (/(compress|compression|context|rag|logs?|tool outputs?|chunks?)/.test(text)) {
    return {
      benefits: ["Less Tokens", "Agent Ready", "Better Answers"],
      headline: "Context Compression",
      objects: [
        "raw log sheets",
        "file stack",
        "RAG chunk cards",
        "compression engine",
        "shrinking token meter",
        "focused context packet",
        "AI answer panel"
      ],
      sections: ["Raw Logs & Files", "Compress", "Focused Context"]
    };
  }

  if (/(ocr|pdf|document|parse|structured data|extract)/.test(text)) {
    return {
      benefits: ["Tables", "JSON Data", "LLM Ready"],
      headline: "Document AI",
      objects: ["PDF page", "image document", "OCR scanner beam", "text blocks", "table grid", "structured data cards"],
      sections: ["PDF & Images", "Recognize", "Structured Data"]
    };
  }

  if (/(agent|workflow|automation|mcp|tool use)/.test(text)) {
    return {
      benefits: ["Tool Planning", "Auto Execute", "Workflow Done"],
      headline: "AI Agent Workflow",
      objects: ["user task card", "agent control room", "tool icons", "workflow arrows", "completed action cards"],
      sections: ["Task Input", "Plan Tools", "Execute"]
    };
  }

  if (/(commerce|ecommerce|store|shopify|order|customer support)/.test(text)) {
    return {
      benefits: ["Orders", "Support", "Fulfillment"],
      headline: "Commerce Ops",
      objects: ["product cards", "order queue", "support messages", "automation hub", "shipping boxes", "status dashboard"],
      sections: ["Store Inputs", "Automate", "Operations"]
    };
  }

  if (/(image|video|visual|generate|generation|render)/.test(text)) {
    return {
      benefits: ["Generate", "Edit", "Export"],
      headline: "Visual AI",
      objects: ["prompt card", "source assets", "creative engine", "image tiles", "video strip", "export tray"],
      sections: ["Prompt & Assets", "Create", "Visual Output"]
    };
  }

  if (/(memory|knowledge|search|recall|conversation)/.test(text)) {
    return {
      benefits: ["Index", "Retrieve", "Answer"],
      headline: "Knowledge Memory",
      objects: ["conversation cards", "note stack", "knowledge graph", "search beam", "context snippets", "answer panel"],
      sections: ["Notes", "Memory Graph", "Answer"]
    };
  }

  if (/(cli|terminal|command|developer|sdk|api|framework)/.test(text) || categoryId === "tools") {
    return {
      benefits: ["Command", "API", "Ship"],
      headline: "Developer Tool",
      objects: ["terminal card", "code modules", "API blocks", "automation arrows", "package box", "deploy badge"],
      sections: ["Code", "Automate", "Ship"]
    };
  }

  return {
    benefits: ["Workflow", "Automation", "Result"],
    headline: "Open Source Tool",
    objects: ["input cards", "capability engine", "workflow arrows", "dashboard panels", "result tiles"],
    sections: ["Inputs", "Engine", "Outputs"]
  };
}

function workflowForCategory(categoryId: string) {
  switch (categoryId) {
    case "ai":
      return "user task or data enters an AI agent/model, the system reasons with tools, and a useful result is produced";
    case "frontend":
      return "component or design input becomes an interactive user interface in a browser";
    case "backend":
      return "requests and data move through APIs, services, and storage into an operational result";
    case "tools":
      return "developer command or workflow input is automated into repeatable output";
    default:
      return "raw project input is transformed into a practical product outcome";
  }
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
    if (isSkippedImage(candidate.src, candidate.alt)) {
      continue;
    }
    return {
      alt: candidate.alt,
      url: resolveReadmeImageUrl(candidate.src, readmeRawUrl)
    };
  }
  return null;
}

function isSkippedImage(src: string, alt?: string | null): boolean {
  const value = `${src} ${alt ?? ""}`.toLowerCase();
  return (
    value.includes("shield") ||
    value.includes("badge") ||
    value.includes("opencollective") ||
    value.includes("star-history") ||
    value.includes("starchart") ||
    value.includes("github-readme-stats") ||
    value.includes("repobeats") ||
    value.includes("readme-banner") ||
    value.includes("wordmark") ||
    /(^|[-_/\s])(banner|logo)([-_.:/\s]|$)/.test(value) ||
    value.includes("contributors") ||
    value.includes("stargazers") ||
    value.includes("forks") ||
    value.includes("coverage") ||
    value.includes("build status") ||
    value.includes("star history") ||
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

function imageSeed(value: string): number {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}
