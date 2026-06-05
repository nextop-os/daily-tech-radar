# @nextop-os/daily-tech-radar

```ts
import { DailyTechRadarClient } from "@nextop-os/daily-tech-radar";

const client = new DailyTechRadarClient();
const latest = await client.productHunt.latest("zh-CN");
```

The client reads from jsDelivr by default and accepts an optional `baseUrl` for
tests or private mirrors.

