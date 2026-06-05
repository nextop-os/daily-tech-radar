# Daily Tech Radar 项目方案

`daily-tech-radar` 是 `nextop-os` 下的每日科技趋势数据仓库。Phase 1 先跑通 Product Hunt，Phase 2 再接 GitHub Trending。

## Phase 1: Product Hunt

- Product Hunt GraphQL v2 抓取每日 Top 30。
- Agnes `agnes-2.0-flash` 生成中文 `tagline`、`description`、`keywords`。
- 输出 `data/producthunt/{locale}/{date}.json`、`latest.json`、`index.json`。
- SDK 暴露 `client.productHunt.latest()`、`byDate()`、`index()`。

## Phase 2: GitHub Trending

- 复用 `nextop-apps/apps/github-trending/docs/daily-trend-package.md` 的 `DailyTrendPackage`。
- Candidate source: GitHub Trending HTML -> huchenme API fallback -> GitHub Search degraded fallback。
- GitHub REST enrichment: repo metadata、languages、topics、README ref。
- README 全文不进每日 JSON，只存 `readmeRef` 和 `readmeSignals`。
- README 图片优先作为视觉封面，没有有效图片时用 `agnes-ai-cli` 或 JS API 生图。
- SDK 暴露 `client.github.latest()`、`byDate()`、`index()`。

## Secrets

真实密钥只能放 GitHub Secrets 或本地环境变量：

```txt
PRODUCTHUNT_DEVELOPER_TOKEN
AGNES_API_KEY
GITHUB_TOKEN
```

不要把真实 key 写入代码、fixture、文档或 workflow。

