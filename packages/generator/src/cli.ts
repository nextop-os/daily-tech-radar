import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { lastCompletedProductHuntDate } from "./date.js";
import { localizeGitHubRepos, localizeProductHuntPosts } from "./llm/agnes.js";
import { buildProductHuntFeeds, fetchProductHuntPosts } from "./sources/producthunt.js";
import { writeSourcePayload } from "./output/write-json.js";
import type { ProductHuntPost } from "./types.js";
import { buildGitHubPackage, parseGitHubTrendingHtml } from "./github/package.js";

const program = new Command();

program
  .option("--source <source>", "source to generate: producthunt or github", "producthunt")
  .option("--date <date>", "source date in YYYY-MM-DD")
  .option("--fixture <path>", "read source data from a fixture file instead of live APIs")
  .option("--output <dir>", "output data directory", "data")
  .option("--limit <number>", "maximum item count", "30")
  .option("--dry-run", "validate and print target paths without writing files")
  .option("--skip-llm", "skip Agnes localization and use deterministic fallback")
  .parse(normalizeArgv(process.argv));

const options = program.opts<{
  source: "producthunt" | "github";
  date?: string;
  fixture?: string;
  output: string;
  limit: string;
  dryRun?: boolean;
  skipLlm?: boolean;
}>();

const date = options.date ?? lastCompletedProductHuntDate();
const generatedAt = new Date().toISOString();
const limit = Number(options.limit);
const outputDir = resolveUserPath(options.output);

if (options.source === "producthunt") {
  const posts = await loadProductHuntPosts({ fixture: options.fixture, date, limit });
  const localizations = await localizeProductHuntPosts({
    posts,
    apiKey: options.skipLlm ? undefined : process.env.AGNES_API_KEY
  });
  const feeds = buildProductHuntFeeds({ posts, localizations, date, generatedAt, limit });
  const en = await writeSourcePayload({
    outputDir,
    source: "producthunt",
    locale: "en-US",
    date,
    payload: feeds.english,
    dryRun: options.dryRun
  });
  const zh = await writeSourcePayload({
    outputDir,
    source: "producthunt",
    locale: "zh-CN",
    date,
    payload: feeds.chinese,
    dryRun: options.dryRun
  });
  console.log(JSON.stringify({ source: "producthunt", date, itemCount: feeds.english.items.length, en, zh }, null, 2));
} else if (options.source === "github") {
  const html = options.fixture
    ? await readFile(resolveUserPath(options.fixture), "utf8")
    : await fetch("https://github.com/trending?since=daily").then((response) => response.text());
  const candidates = parseGitHubTrendingHtml(html).slice(0, limit);
  const visualOptions = {
    githubToken: process.env.GITHUB_TOKEN,
    agnesApiKey: process.env.AGNES_API_KEY,
    generateAgnesImages: process.env.DISABLE_AGNES_IMAGE_GENERATION !== "1"
  };
  const enPackage = await buildGitHubPackage({ candidates, locale: "en-US", date, generatedAt, visual: visualOptions });
  const githubLocalizations = await localizeGitHubRepos({
    repos: enPackage.repos,
    apiKey: options.skipLlm ? undefined : process.env.AGNES_API_KEY
  });
  const zhPackage = await buildGitHubPackage({
    candidates,
    locale: "zh-CN",
    date,
    generatedAt,
    localizations: githubLocalizations,
    visual: visualOptions
  });
  const en = await writeSourcePayload({
    outputDir,
    source: "github",
    locale: "en-US",
    date,
    payload: enPackage,
    dryRun: options.dryRun
  });
  const zh = await writeSourcePayload({
    outputDir,
    source: "github",
    locale: "zh-CN",
    date,
    payload: zhPackage,
    dryRun: options.dryRun
  });
  console.log(JSON.stringify({ source: "github", date, itemCount: enPackage.repos.length, en, zh }, null, 2));
} else {
  throw new Error(`Unsupported source: ${options.source}`);
}

async function loadProductHuntPosts(options: {
  fixture?: string;
  date: string;
  limit: number;
}): Promise<ProductHuntPost[]> {
  if (options.fixture) {
    const raw = JSON.parse(await readFile(resolveUserPath(options.fixture), "utf8")) as unknown;
    if (Array.isArray(raw)) {
      return raw as ProductHuntPost[];
    }
    const edges = (raw as { data?: { posts?: { edges?: Array<{ node?: ProductHuntPost }> } } }).data?.posts?.edges ?? [];
    return edges.flatMap((edge) => (edge.node ? [edge.node] : []));
  }

  const token = process.env.PRODUCTHUNT_DEVELOPER_TOKEN;
  if (!token) {
    throw new Error("PRODUCTHUNT_DEVELOPER_TOKEN is required for live Product Hunt generation");
  }

  return fetchProductHuntPosts({ token, date: options.date, limit: options.limit });
}

function normalizeArgv(argv: string[]): string[] {
  if (argv[2] === "--") {
    return [argv[0], argv[1], ...argv.slice(3)];
  }
  return argv;
}

function resolveUserPath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), value);
}
