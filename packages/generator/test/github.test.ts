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

  it("builds a DailyTrendPackage with views and health", () => {
    const html = readFileSync(join(here, "fixtures/github-trending.html"), "utf8");
    const candidates = parseGitHubTrendingHtml(html);
    const pkg = buildGitHubPackage({
      candidates,
      locale: "zh-CN",
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z"
    });

    expect(dailyTrendPackageSchema.parse(pkg)).toEqual(pkg);
    expect(pkg.repos[0].classification.primaryCategoryId).toBe("ai");
    expect(pkg.views?.some((view) => view.repoIds.length > 0)).toBe(true);
    expect(pkg.health?.status).toBe("ok");
  });
});

