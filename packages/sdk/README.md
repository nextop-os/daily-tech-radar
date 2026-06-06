# @nextop-os/daily-tech-radar

```ts
import { DailyTechRadarClient } from "@nextop-os/daily-tech-radar";

const client = new DailyTechRadarClient();
const latest = await client.productHunt.latest("zh-CN");
```

The client reads from GitHub raw by default so daily JSON updates become visible
quickly. It accepts an optional `baseUrl` for tests or private mirrors.
