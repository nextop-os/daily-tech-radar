import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGitHubPackage, parseGitHubTrendingHtml } from "../src/github/package.js";
import { dailyTrendPackageSchema } from "../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("GitHub package generation", () => {
  it("parses GitHub Trending HTML candidates", () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      owner: "chopratejas",
      name: "headroom",
      stars: 14201,
      forks: 420,
      starsGained: 2503
    });
  });

  it("builds a DailyTrendPackage with views and health", async () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html);
    const pkg = await buildGitHubPackage({
      candidates,
      locale: "zh-CN",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      visual: {
        fetchImpl: async () => new Response("not found", { status: 404 })
      }
    });

    expect(dailyTrendPackageSchema.parse(pkg)).toEqual(pkg);
    expect(pkg.repos[0].classification.primaryCategoryId).toBe("ai");
    expect(pkg.views?.some((view) => view.repoIds.length > 0)).toBe(true);
    expect(pkg.health?.status).toBe("ok");
  });

  it("applies Chinese repo localizations to GitHub text fields", async () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html).slice(0, 1);
    const english = await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      visual: {
        fetchImpl: async () =>
          new Response(
            [
              "# Headroom",
              "",
              "Headroom compresses tool outputs, logs, files, and RAG chunks before they reach the LLM, keeping agent context focused while preserving useful answers."
            ].join("\n"),
            { status: 200 }
          )
      }
    });
    const zh = await buildGitHubPackage({
      candidates,
      locale: "zh-CN",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      localizations: [
        {
          id: english.repos[0].id,
          descriptionZh: "在进入 LLM 前压缩工具输出和日志。",
          summaryZh: "Headroom 会在工具输出、日志、文件和 RAG 片段进入 LLM 前进行压缩，让代理上下文保持聚焦，同时保留有用答案。",
          keywordsZh: ["上下文压缩", "代理工具", "RAG"]
        }
      ],
      visual: {
        fetchImpl: async () =>
          new Response(
            [
              "# Headroom",
              "",
              "Headroom compresses tool outputs, logs, files, and RAG chunks before they reach the LLM, keeping agent context focused while preserving useful answers."
            ].join("\n"),
            { status: 200 }
          )
      }
    });

    expect(zh.repos[0].metadata.description).toBe("在进入 LLM 前压缩工具输出和日志。");
    expect(zh.repos[0].readmeSignals.summary).toBe(
      "Headroom 会在工具输出、日志、文件和 RAG 片段进入 LLM 前进行压缩，让代理上下文保持聚焦，同时保留有用答案。"
    );
    expect(zh.repos[0].readmeSignals.keywords).toEqual(["上下文压缩", "代理工具", "RAG"]);
    expect(dailyTrendPackageSchema.parse(zh)).toEqual(zh);
  });

  it("uses the first usable README image as the repo visual", async () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html).slice(0, 1);
    const pkg = await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      visual: {
        fetchImpl: async () =>
          new Response("# Headroom\n\n![Demo](./assets/demo.png)\n\nA useful project.", { status: 200 })
      }
    });

    expect(pkg.repos[0].visual).toMatchObject({
      kind: "readme_image",
      url: "https://raw.githubusercontent.com/chopratejas/headroom/main/assets/demo.png"
    });
    expect(pkg.repos[0].readmeRef.status).toBe("available");
  });

  it("keeps README images and badges out of readmeSignals.summary", async () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html).slice(0, 1);
    const pkg = await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      visual: {
        fetchImpl: async () =>
          new Response(
            [
              "# Headroom",
              "",
              "██╗  ██╗███████╗ █████╗ ██████╗ ██████╗",
              "",
              '<p align="center"><img src="./assets/demo.png" alt="Demo"></p>',
              "",
              "[![Build](https://img.shields.io/badge/build-ok-green.svg)](https://example.com)",
              "",
              "Headroom compresses tool outputs, logs, files, and RAG chunks before they reach the LLM, keeping agent context focused while preserving useful answers."
            ].join("\n"),
            { status: 200 }
          )
      }
    });

    expect(pkg.repos[0].readmeSignals.summary).toBe(
      "Headroom compresses tool outputs, logs, files, and RAG chunks before they reach the LLM, keeping agent context focused while preserving useful answers."
    );
  });

  it("does not treat star-history charts as product visuals", async () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html).slice(0, 1);
    const pkg = await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      visual: {
        fetchImpl: async () =>
          new Response(
            [
              "# Headroom",
              "",
              "![Star History Chart](https://api.star-history.com/svg?repos=chopratejas/headroom&type=Date)",
              "",
              "Headroom compresses tool outputs, logs, files, and RAG chunks before they reach the LLM, keeping agent context focused while preserving useful answers."
            ].join("\n"),
            { status: 200 }
          )
      }
    });

    expect(pkg.repos[0].visual.kind).toBe("repository_avatar");
  });

  it("generates concrete product covers instead of README banners", async () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html).slice(0, 1);
    let capturedPrompt = "";
    const pkg = await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      visual: {
        agnesApiKey: "test-key",
        generateAgnesImages: true,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.includes("apihub.agnes-ai.com/v1/images/generations")) {
            const body = JSON.parse(String(init?.body)) as { prompt: string };
            capturedPrompt = body.prompt;
            return new Response(
              JSON.stringify({
                data: [{ url: "https://example.com/generated-product-cover.png" }]
              }),
              { status: 200 }
            );
          }
          return new Response(
            [
              "# Headroom",
              "",
              "![Headroom banner](./assets/banner.png)",
              "",
              "Headroom compresses tool outputs, logs, files, and RAG chunks before they reach the LLM, keeping agent context focused while preserving useful answers."
            ].join("\n"),
            { status: 200 }
          );
        }
      }
    });

    expect(pkg.repos[0].visual).toMatchObject({
      kind: "agnes_generated",
      url: "https://example.com/generated-product-cover.png"
    });
    expect(capturedPrompt).toContain("type: cartoon visual explainer infographic");
    expect(capturedPrompt).toContain("turn complex technical content into a visual feast");
    expect(capturedPrompt).toContain("Choose an original layout that fits the repo");
    expect(capturedPrompt).toContain("Do not copy a fixed input-center-output template");
    expect(capturedPrompt).toContain("Possible layouts");
    expect(capturedPrompt).toContain("Visual metaphor");
    expect(capturedPrompt).toContain("many documents, logs, files, and RAG chunks compress into a smaller focused context packet");
    expect(capturedPrompt).toContain("Required text script");
    expect(capturedPrompt).toContain('repo title "chopratejas / headroom"');
    expect(capturedPrompt).toContain("capability headline");
    expect(capturedPrompt).toContain("Context Compression");
    expect(capturedPrompt).toContain("Raw Logs & Files");
    expect(capturedPrompt).toContain("Focused Context");
    expect(capturedPrompt).toContain("Must visibly include");
    expect(capturedPrompt).toContain("infer the actual product or tool");
    expect(capturedPrompt).toContain("Render the most likely product UI or usage surface");
    expect(capturedPrompt).toContain("browser extension popup");
    expect(capturedPrompt).toContain("editor panel");
    expect(capturedPrompt).toContain("agent chat");
    expect(capturedPrompt).toContain("Use product-specific interface details");
    expect(capturedPrompt).toContain("the repo title must be the largest readable text");
    expect(capturedPrompt).toContain("Only the repo title, capability headline, section labels, benefit tags, and essential UI labels may contain text");
    expect(capturedPrompt).not.toContain("repo name, GitHub logo");
    expect(capturedPrompt).not.toContain("Avoid: GitHub logo");
    expect(capturedPrompt).toContain("No extra labels and no gibberish microtext");
  });

  it("infers research agent cover concepts from repo text", async () => {
    const html = [
      '<article class="Box-row">',
      '<h2><a href="/mvanhorn/last30days-skill">mvanhorn / last30days-skill</a></h2>',
      "<p>AI agent skill that researches any topic across Reddit, X, YouTube, HN, Polymarket, and the web - then synthesizes a grounded summary</p>",
      '<span itemprop="programmingLanguage">Python</span>',
      '<a class="Link--muted">31,620</a>',
      '<a class="Link--muted">2,634</a>',
      '<span class="d-inline-block float-sm-right">1,111 stars today</span>',
      "</article>"
    ].join("\n");
    const candidates = parseGitHubTrendingHtml(html).slice(0, 1);
    let capturedPrompt = "";
    await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-07",
      generatedAt: "2026-06-08T08:20:00.000Z",
      visual: {
        agnesApiKey: "test-key",
        generateAgnesImages: true,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.includes("apihub.agnes-ai.com/v1/images/generations")) {
            const body = JSON.parse(String(init?.body)) as { prompt: string };
            capturedPrompt = body.prompt;
            return new Response(JSON.stringify({ data: [{ url: "https://example.com/last30days-cover.png" }] }), {
              status: 200
            });
          }
          return new Response(
            [
              "# /last30days",
              "",
              "An AI agent-led search engine scored by upvotes, likes, and real money - not editors.",
              "",
              "Researches Reddit, X, YouTube, Hacker News, Polymarket, and the web, then writes a grounded summary."
            ].join("\n"),
            { status: 200 }
          );
        }
      }
    });

    expect(capturedPrompt).toContain('repo title "mvanhorn / last30days-skill"');
    expect(capturedPrompt).toContain('capability headline "Research Agent Skill"');
    expect(capturedPrompt).toContain('benefit tags "Social Signals / Market Odds / Evidence / Grounded Brief"');
    expect(capturedPrompt).toContain("agent skill card");
    expect(capturedPrompt).toContain("source chips for Reddit X YouTube HN Polymarket Web");
    expect(capturedPrompt).toContain("Social Signals Market Odds Evidence badges");
    expect(capturedPrompt).toContain("grounded brief panel");
    expect(capturedPrompt).not.toContain("Avoid: GitHub logo");
  });
});
