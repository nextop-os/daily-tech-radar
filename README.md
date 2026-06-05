# Daily Tech Radar

Daily Tech Radar publishes render-ready daily trend data for Product Hunt first,
then GitHub Trending. It writes bilingual JSON files and ships a small JS/TS SDK
for consumers.

## Phases

- Phase 1: Product Hunt daily Top 30, Agnes Chinese localization, `latest.json`,
  `index.json`, and SDK.
- Phase 2: GitHub Trending `DailyTrendPackage`, README signals, category views,
  visual covers, Agnes image fallback, and SDK.

## Output

```txt
data/
  producthunt/
    en-US/
      2026-06-05.json
      latest.json
      index.json
    zh-CN/
      2026-06-05.json
      latest.json
      index.json
```

## Local Development

```bash
pnpm install
pnpm test
pnpm generate -- --source producthunt --fixture packages/generator/test/fixtures/producthunt-posts.json --date 2026-06-05
```

Live Product Hunt generation needs:

```txt
PRODUCTHUNT_DEVELOPER_TOKEN
AGNES_API_KEY
```

Do not commit real tokens. Product Hunt commercial usage may require Product
Hunt approval; check Product Hunt's current API terms before using this data in
a commercial product.

