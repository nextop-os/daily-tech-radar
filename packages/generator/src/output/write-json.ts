import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DailyTrendFeed, DailyTrendPackage, Locale, TrendIndex, TrendSource } from "../types.js";
import { dailyTrendFeedSchema, dailyTrendPackageSchema, trendIndexSchema } from "../schemas.js";

export async function writeSourcePayload(options: {
  outputDir: string;
  source: TrendSource;
  locale: Locale;
  date: string;
  payload: DailyTrendFeed | DailyTrendPackage;
  dryRun?: boolean;
}): Promise<{ dateFile: string; latestFile: string; indexFile: string }> {
  const dir = path.join(options.outputDir, options.source, options.locale);
  const dateFile = path.join(dir, `${options.date}.json`);
  const latestFile = path.join(dir, "latest.json");
  const indexFile = path.join(dir, "index.json");

  if (options.source === "producthunt") {
    dailyTrendFeedSchema.parse(options.payload);
  } else {
    dailyTrendPackageSchema.parse(options.payload);
  }

  const index = await nextIndex({
    source: options.source,
    locale: options.locale,
    date: options.date,
    indexFile
  });

  trendIndexSchema.parse(index);

  if (!options.dryRun) {
    await mkdir(dir, { recursive: true });
    await writeJson(dateFile, options.payload);
    await writeJson(latestFile, options.payload);
    await writeJson(indexFile, index);
  }

  return { dateFile, latestFile, indexFile };
}

async function nextIndex(options: {
  source: TrendSource;
  locale: Locale;
  date: string;
  indexFile: string;
}): Promise<TrendIndex> {
  const dates = new Set<string>();
  try {
    const existing = JSON.parse(await readFile(options.indexFile, "utf8")) as TrendIndex;
    for (const date of existing.dates ?? []) {
      dates.add(date);
    }
  } catch {
    // Missing or invalid index files are rebuilt from the current write.
  }
  dates.add(options.date);
  const sortedDates = [...dates].sort();
  return {
    schemaVersion: "daily-tech-radar.index.v1",
    source: options.source,
    locale: options.locale,
    latestDate: sortedDates.at(-1) ?? null,
    dates: sortedDates,
    generatedAt: new Date().toISOString()
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

