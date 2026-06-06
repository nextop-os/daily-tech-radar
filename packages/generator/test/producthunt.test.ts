import { describe, expect, it } from "vitest";
import { lastCompletedProductHuntDate, productHuntDayWindow } from "../src/date.js";
import {
  fallbackLocalizations,
  localizeGitHubRepos,
  localizeProductHuntPosts,
  parseJsonObject
} from "../src/llm/agnes.js";
import { buildProductHuntFeeds } from "../src/sources/producthunt.js";
import { dailyTrendFeedSchema } from "../src/schemas.js";
import fixture from "./fixtures/producthunt-posts.json" assert { type: "json" };

describe("Product Hunt generation", () => {
  it("computes the last completed Product Hunt day in Pacific time", () => {
    expect(lastCompletedProductHuntDate(new Date("2026-06-06T08:20:00Z"))).toBe("2026-06-05");
    expect(lastCompletedProductHuntDate(new Date("2026-12-06T09:20:00Z"))).toBe("2026-12-05");
  });

  it("builds PST/PDT day windows", () => {
    expect(productHuntDayWindow("2026-06-05")).toEqual({
      postedAfter: "2026-06-05T07:00:00.000Z",
      postedBefore: "2026-06-06T07:00:00.000Z"
    });
    expect(productHuntDayWindow("2026-12-05")).toEqual({
      postedAfter: "2026-12-05T08:00:00.000Z",
      postedBefore: "2026-12-06T08:00:00.000Z"
    });
  });

  it("builds bilingual render-ready Product Hunt feeds", () => {
    const posts = fixture;
    const feeds = buildProductHuntFeeds({
      posts,
      localizations: fallbackLocalizations(posts),
      date: "2026-06-05",
      generatedAt: "2026-06-06T08:20:00.000Z",
      limit: 30
    });

    expect(dailyTrendFeedSchema.parse(feeds.english)).toEqual(feeds.english);
    expect(dailyTrendFeedSchema.parse(feeds.chinese)).toEqual(feeds.chinese);
    expect(feeds.english.items.map((item) => item.name)).toEqual(["Alpha AI", "Beta Pages"]);
    expect(feeds.english.items[1].assets.icon).toBe("https://example.com/beta-hero.png");
    expect(feeds.chinese.locale).toBe("zh-CN");
  });

  it("parses Agnes JSON wrapped in markdown fences", () => {
    expect(parseJsonObject("```json\n{\"items\":[]}\n```")).toEqual({ items: [] });
  });

  it("accepts Agnes localizations wrapped in a posts array", async () => {
    const posts = fixture.slice(0, 1);
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  posts: [
                    {
                      id: "1",
                      taglineZh: "面向产品会议的 AI 笔记",
                      descriptionZh: "把产品会议转成清晰的笔记和任务。",
                      keywordsEn: ["AI notes", "meetings"],
                      keywordsZh: ["AI 笔记", "会议"]
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200 }
      );

    await expect(
      localizeProductHuntPosts({
        posts,
        apiKey: "test-key",
        fetchImpl: fetchImpl as typeof fetch
      })
    ).resolves.toEqual([
      {
        id: "1",
        taglineZh: "面向产品会议的 AI 笔记",
        descriptionZh: "把产品会议转成清晰的笔记和任务。",
        keywordsEn: ["AI notes", "meetings"],
        keywordsZh: ["AI 笔记", "会议"]
      }
    ]);
  });

  it("accepts Agnes GitHub localizations wrapped in a repos array", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  repos: [
                    {
                      id: "github-headroom",
                      descriptionZh: "压缩代理上下文。",
                      summaryZh: "在工具输出进入 LLM 前进行压缩，让上下文保持聚焦。",
                      keywordsZh: ["上下文压缩", "代理工具"]
                    }
                  ]
                })
              }
            }
          ]
        }),
        { status: 200 }
      );

    await expect(
      localizeGitHubRepos({
        repos: [
          {
            id: "github-headroom",
            owner: "chopratejas",
            name: "headroom",
            url: "https://github.com/chopratejas/headroom",
            source: {
              primary: "github_trending_html",
              sourceRank: 1,
              starsGained: 2503
            },
            metadata: {
              description: "Compress context.",
              language: "Python",
              topics: [],
              stars: 14201,
              forks: 420,
              license: null,
              defaultBranch: null,
              pushedAt: null,
              topLanguages: ["Python"]
            },
            readmeRef: {
              status: "missing"
            },
            readmeSignals: {
              title: "Headroom",
              summary: "Compress tool outputs before they reach the LLM.",
              headings: [],
              commands: [],
              keywords: ["agent", "context"],
              score: 80
            },
            visual: {
              kind: "repository_avatar",
              url: "https://github.com/chopratejas.png"
            },
            classification: {
              primaryCategoryId: "ai",
              secondaryCategoryIds: [],
              confidence: 0.7,
              method: "rules",
              reasons: ["Matched agent"],
              signals: ["agent"]
            },
            rank: {
              globalRank: 1,
              categoryRank: 1,
              score: 118
            }
          }
        ],
        apiKey: "test-key",
        fetchImpl: fetchImpl as typeof fetch
      })
    ).resolves.toEqual([
      {
        id: "github-headroom",
        descriptionZh: "压缩代理上下文。",
        summaryZh: "在工具输出进入 LLM 前进行压缩，让上下文保持聚焦。",
        keywordsZh: ["上下文压缩", "代理工具"]
      }
    ]);
  });
});
