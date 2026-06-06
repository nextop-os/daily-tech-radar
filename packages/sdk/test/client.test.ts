import { describe, expect, it } from "vitest";
import { DailyTechRadarClient, DEFAULT_BASE_URL } from "../src/index.js";

describe("DailyTechRadarClient", () => {
  it("uses the built-in GitHub raw base URL", () => {
    const client = new DailyTechRadarClient();
    expect(DEFAULT_BASE_URL).toBe(
      "https://raw.githubusercontent.com/nextop-os/daily-tech-radar/main/data"
    );
    expect(client.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("fetches Product Hunt latest and index", async () => {
    const seen: string[] = [];
    const client = new DailyTechRadarClient({
      baseUrl: "https://example.com/data/",
      fetch: async (url) => {
        seen.push(String(url));
        return responseFor(url);
      }
    });

    await expect(client.productHunt.latest("zh-CN")).resolves.toMatchObject({
      source: "producthunt",
      locale: "zh-CN"
    });
    await expect(client.productHunt.index("zh-CN")).resolves.toMatchObject({
      source: "producthunt",
      locale: "zh-CN"
    });
    expect(seen).toEqual([
      "https://example.com/data/producthunt/zh-CN/latest.json",
      "https://example.com/data/producthunt/zh-CN/index.json"
    ]);
  });

  it("fetches GitHub by date through the source helper", async () => {
    const client = new DailyTechRadarClient({
      baseUrl: "https://example.com/data",
      fetch: async (url) => responseFor(url)
    });

    await expect(client.github.byDate("2026-06-05", "en-US")).resolves.toMatchObject({
      schemaVersion: "trendreader.daily.v1",
      locale: "en-US"
    });
  });
});

function responseFor(url: unknown): Response {
  const value = String(url).includes("index.json")
    ? {
        schemaVersion: "daily-tech-radar.index.v1",
        source: "producthunt",
        locale: "zh-CN",
        latestDate: "2026-06-05",
        dates: ["2026-06-05"],
        generatedAt: "2026-06-06T08:20:00.000Z"
      }
    : String(url).includes("/github/")
      ? {
          schemaVersion: "trendreader.daily.v1",
          packageId: "github-daily-All-2026-06-05",
          locale: "en-US",
          generatedAt: "2026-06-06T08:20:00.000Z",
          expiresAt: "2026-06-07T08:20:00.000Z",
          repos: []
        }
      : {
          schemaVersion: "daily-tech-radar.v1",
          source: "producthunt",
          locale: "zh-CN",
          date: "2026-06-05",
          sourceTimezone: "America/Los_Angeles",
          generatedAt: "2026-06-06T08:20:00.000Z",
          items: []
        };
  return new Response(JSON.stringify(value), { status: 200 });
}
