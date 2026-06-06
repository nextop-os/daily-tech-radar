# Daily Tech Radar 数据契约

`daily-tech-radar` 是 `nextop-os` 下的每日科技趋势数据仓库。当前 v0 已经跑通 Product Hunt 和 GitHub Trending 的每日 JSON 产出，并提供 JS/TS SDK。

## 当前输出

```txt
data/
  producthunt/
    en-US/YYYY-MM-DD.json
    en-US/latest.json
    en-US/index.json
    zh-CN/YYYY-MM-DD.json
    zh-CN/latest.json
    zh-CN/index.json
  github/
    en-US/YYYY-MM-DD.json
    en-US/latest.json
    en-US/index.json
    zh-CN/YYYY-MM-DD.json
    zh-CN/latest.json
    zh-CN/index.json
```

`latest.json` 内容等同于最新日期文件；`index.json` 提供 `latestDate` 和历史 `dates`。

## Product Hunt

Product Hunt 使用 `DailyTrendFeed`，适合产品榜单卡片渲染：

- `source`: `producthunt`
- `locale`: `en-US` 或 `zh-CN`
- `items[].name`: 产品名称，来自 Product Hunt。
- `items[].tagline` / `description`: 英文包保留来源文本，中文包使用 Agnes 文本本地化。
- `items[].keywords`: 英文/中文关键词。
- `items[].metrics.votes` / `comments`: 票数和评论数。
- `items[].links.homepage`: 产品官网。
- `items[].links.source`: Product Hunt 页面。
- `items[].assets.icon`: 产品图标，优先使用 Product Hunt `thumbnail.url`。
- `items[].assets.thumbnail`: 产品缩略图，优先使用 Product Hunt `thumbnail.url`。
- `items[].assets.media`: Product Hunt 产品媒体图或视频封面，不使用 maker 用户头像。
- `items[].raw`: 来源辅助字段；只有 API 真返回时才写入 `makers`、`topics`。

## GitHub Trending

GitHub 使用 `DailyTrendPackage`，适合趋势仓库索引和多视图渲染：

- `sourceWindow`: 当前为 `daily` / `All`。
- `sources`: 当前 v0 主要是 `github_trending_html`。
- `taxonomy.categories`: 固定分类集合。
- `repos`: 趋势仓库列表。
- `views`: 预计算展示视图，`views[].repoIds` 已按对应视图排序。
- `health`: 候选数量、README enrichment 数量和 degraded/warning 信息。

GitHub repo 核心字段：

- `metadata.description`: 当前来自 GitHub Trending HTML，REST enrichment 后会更完整。
- `metadata.language` / `stars` / `forks` / `topLanguages`: 当前来自 Trending HTML。
- `metadata.topics`、`license`、`defaultBranch`、`pushedAt`、`homepageUrl`、`readmeRef.sha`: 当前 v0 可能为空或 `null`，后续通过 GitHub REST enrichment 补齐。
- `readmeRef`: raw README fallback 的状态、路径和 URL。
- `readmeSignals.title`: README 第一个 H1。
- `readmeSignals.summary`: README 第一段正常文本；会跳过图片、badge、HTML wrapper、代码块和图表。
- `readmeSignals.commands`: README 中的安装命令。
- `readmeSignals.keywords`: 分类信号和 README heading 派生关键词。
- `visual.kind`: `readme_image`、`agnes_generated`、`repository_avatar` 或 `none`。
- `classification`: 固定 taxonomy 内的分类结果。
- `rank`: 全局排名、分类排名和排序分数。

视觉封面顺序：

1. README 第一张有效产品图，支持 Markdown 图片和 HTML `<img>`。
2. 跳过 badge、shield、Open Collective、star-history、stats、contributors、coverage 等非产品图。
3. 没有 README 产品图时调用 Agnes 生图。
4. Agnes 失败时最后 fallback 到 GitHub avatar。

`zh-CN` GitHub 包会本地化 taxonomy、views label，以及 repo `metadata.description`、`readmeSignals.summary`、`readmeSignals.keywords`。有 `AGNES_API_KEY` 时使用 Agnes 生成中文文本；没有密钥或使用 `--skip-llm` 时会写入 deterministic fallback，保留来源英文，保证本地与 CI 生成稳定。

## SDK

npm 包名：

```txt
@nextop-os/daily-tech-radar
```

SDK 内置默认 CDN：

```txt
https://cdn.jsdelivr.net/gh/nextop-os/daily-tech-radar@main/data
```

类接口：

```ts
import { DailyTechRadarClient } from "@nextop-os/daily-tech-radar";

const client = new DailyTechRadarClient();

await client.productHunt.latest("zh-CN");
await client.productHunt.byDate("2026-06-05", "en-US");
await client.productHunt.index("zh-CN");

await client.github.latest("zh-CN");
await client.github.byDate("2026-06-05", "en-US");
await client.github.index("zh-CN");

await client.fetchLatest({ source: "producthunt", locale: "zh-CN" });
await client.fetchByDate({ source: "github", locale: "en-US", date: "2026-06-05" });
await client.fetchIndex({ source: "github", locale: "zh-CN" });
```

## Secrets

真实密钥只能放 GitHub Secrets 或本地环境变量：

```txt
PRODUCTHUNT_DEVELOPER_TOKEN
AGNES_API_KEY
GITHUB_TOKEN
```

`DISABLE_AGNES_IMAGE_GENERATION=1` 可以关闭 GitHub Agnes 生图 fallback。

## 后续增强

- GitHub huchenme API fallback。
- GitHub Search degraded fallback。
- GitHub REST metadata、languages、topics、README enrichment。
- GitHub repo 文本本地化质量评估、缓存和增量重试。
- README 图片 `HEAD` / content-type 可用性校验。
- Agnes 生成图转存到对象存储、release assets 或约定的静态资产路径。
