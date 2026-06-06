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
});
