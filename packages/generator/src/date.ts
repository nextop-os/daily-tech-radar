import { DateTime } from "luxon";

export const PRODUCT_HUNT_TIMEZONE = "UTC";

export function lastCompletedProductHuntDate(now = new Date()): string {
  return requireIso(
    DateTime.fromJSDate(now, { zone: PRODUCT_HUNT_TIMEZONE })
    .minus({ days: 1 })
      .toISODate()
  );
}

export function productHuntDayWindow(date: string): { postedAfter: string; postedBefore: string } {
  const start = DateTime.fromISO(date, { zone: PRODUCT_HUNT_TIMEZONE }).startOf("day");
  return {
    postedAfter: requireIso(start.toUTC().toISO()),
    postedBefore: requireIso(start.plus({ days: 1 }).toUTC().toISO())
  };
}

export function addUtcDays(isoDate: string, days: number): string {
  return requireIso(DateTime.fromISO(isoDate, { zone: "utc" }).plus({ days }).toISO());
}

function requireIso(value: string | null): string {
  if (!value) {
    throw new Error("Failed to format ISO date");
  }
  return value;
}
