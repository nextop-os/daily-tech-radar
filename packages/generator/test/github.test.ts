import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGitHubPackage, extractReadmeSummary, parseGitHubTrendingHtml } from "../src/github/package.js";
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

  it("skips repository move notices when extracting README summaries", () => {
    const summary = extractReadmeSummary(
      [
        "> **goose has moved!** This project has moved from `block/goose` to the Agentic AI Foundation. Some links and references are still being updated — please bear with us during the transition.",
        "",
        "# goose",
        "",
        "_your native open source AI agent — desktop app, CLI, and API — for code, workflows, and everything in between_",
        "",
        "goose is a general-purpose AI agent that runs on your machine. Not just for code — use it for research, writing, automation, data analysis, or anything you need to get done."
      ].join("\n")
    );

    expect(summary).toContain(
      "your native open source AI agent — desktop app, CLI, and API — for code, workflows, and everything in between"
    );
    expect(summary).toContain(
      "goose is a general-purpose AI agent that runs on your machine. Not just for code"
    );
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
    expect(capturedPrompt).toContain("Required visible title hierarchy");
    expect(capturedPrompt).toContain('Meaning brief: Positioning "ai product or tool"');
    expect(capturedPrompt).toContain('Visible text script: main title "chopratejas/headroom"');
    expect(capturedPrompt).toContain("exact main title");
    expect(capturedPrompt).toContain("product-specific capability headline");
    expect(capturedPrompt).toContain("Optional fallback text hints");
    expect(capturedPrompt).toContain("Project: chopratejas/headroom");
    expect(capturedPrompt).toContain("repo title");
    expect(capturedPrompt).toContain("capability headline");
    expect(capturedPrompt).toContain("Context Compression");
    expect(capturedPrompt).toContain("Raw Logs & Files");
    expect(capturedPrompt).toContain("Focused Context");
    expect(capturedPrompt).toContain("Optional fallback visual hints");
    expect(capturedPrompt).toContain("infer the actual product or tool");
    expect(capturedPrompt).toContain("Never use Category, Functional story, Visual metaphor, or optional fallback headline as the main title");
    expect(capturedPrompt).toContain("Description is the strongest signal");
    expect(capturedPrompt).toContain("capability headline must be a product noun phrase");
    expect(capturedPrompt).toContain("Do not use section labels such as Task Input / Plan Tools / Execute as the headline");
    expect(capturedPrompt).toContain("Use an internal four-point product brief");
    expect(capturedPrompt).toContain("Positioning, Core Capability, Standout, and Best Fit");
    expect(capturedPrompt).toContain("Positioning answers what the repo is");
    expect(capturedPrompt).toContain("Core Capability answers what it does");
    expect(capturedPrompt).toContain("Standout answers why it is notable");
    expect(capturedPrompt).toContain("Best Fit answers who should use it");
    expect(capturedPrompt).toContain("Only make offline, survival, emergency, field, or no-internet use the main story");
    expect(capturedPrompt).toContain("Local, native, self-hosted, portable, or runs-on-your-machine");
    expect(capturedPrompt).toContain("does not mean a rugged survival device unless the repo says so");
    expect(capturedPrompt).toContain("Create a better capability headline than the fallback");
    expect(capturedPrompt).toContain("Render the most likely product UI or usage surface");
    expect(capturedPrompt).toContain("browser extension popup");
    expect(capturedPrompt).toContain("editor panel");
    expect(capturedPrompt).toContain("agent chat");
    expect(capturedPrompt).toContain("app surfaces, integrations, providers, extensions, APIs");
    expect(capturedPrompt).toContain("For AI agent products, show concrete agent surfaces");
    expect(capturedPrompt).toContain("install, execute, edit, test, any LLM, desktop app, CLI, API");
    expect(capturedPrompt).toContain("Use product-specific interface details");
    expect(capturedPrompt).toContain("use the exact Project value as the largest readable title");
    expect(capturedPrompt).toContain("Text budget: exact repo title, one capability headline, 4 to 7 feature chips");
    expect(capturedPrompt).toContain("Only the repo title, capability headline, section labels, benefit tags, essential UI labels, and concise positioning/use-case callouts may contain text");
    expect(capturedPrompt).toContain("Logos or product marks are allowed");
    expect(capturedPrompt).not.toContain("repo name, GitHub logo");
    expect(capturedPrompt).not.toContain("Avoid: GitHub logo");
    expect(capturedPrompt).toContain("No extra labels and no gibberish microtext");
  });

  it("creates product-specific visible text for native agent repos", async () => {
    const html = [
      '<article class="Box-row">',
      '  <h2><a href="/aaif-goose/goose">aaif-goose / goose</a></h2>',
      "  <p>an open source, extensible AI agent that goes beyond code suggestions - install, execute, edit, and test with any LLM</p>",
      '  <span itemprop="programmingLanguage">Rust</span>',
      '  <a class="Link--muted" href="/aaif-goose/goose/stargazers">47,602</a>',
      '  <a class="Link--muted" href="/aaif-goose/goose/forks">5,018</a>',
      '  <span class="d-inline-block float-sm-right">106 stars today</span>',
      "</article>"
    ].join("\n");
    const candidates = parseGitHubTrendingHtml(html);
    let capturedPrompt = "";
    await buildGitHubPackage({
      candidates,
      locale: "en-US",
      date: "2026-06-07",
      generatedAt: "2026-06-08T06:00:00.000Z",
      visual: {
        agnesApiKey: "test-key",
        generateAgnesImages: true,
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.includes("apihub.agnes-ai.com/v1/images/generations")) {
            const body = JSON.parse(String(init?.body)) as { prompt: string };
            capturedPrompt = body.prompt;
            return new Response(JSON.stringify({ data: [{ url: "https://example.com/goose-cover.png" }] }), {
              status: 200
            });
          }
          return new Response(
            [
              "> **goose has moved!** This project has moved from `block/goose` to the Agentic AI Foundation. Some links and references are still being updated — please bear with us during the transition.",
              "",
              "# goose",
              "",
              "_your native open source AI agent — desktop app, CLI, and API — for code, workflows, and everything in between_",
              "",
              "goose is a general-purpose AI agent that runs on your machine. Not just for code — use it for research, writing, automation, data analysis, or anything you need to get done.",
              "",
              "goose works with 15+ providers and 70+ extensions via the Model Context Protocol."
            ].join("\n"),
            { status: 200 }
          );
        }
      }
    });

    expect(capturedPrompt).toContain('Visible text script: main title "aaif-goose/goose"');
    expect(capturedPrompt).toContain('capability headline "Native Open Source AI Agent"');
    expect(capturedPrompt).toContain('feature chips "Desktop / CLI / API / Any LLM / MCP Extensions / Install / Execute / Edit & Test / Research"');
    expect(capturedPrompt).toContain('panel headers "Task / Tools / Result"');
    expect(capturedPrompt).not.toContain("goose has moved");
  });
});
