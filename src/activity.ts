type BaseActivity = { id: string; timestamp: string; note: string };
export type FeedType = "breast milk" | "formula" | "solids" | "other";
export type Activity = BaseActivity &
  (
    | { kind: "feed"; feedType?: FeedType; amount?: number }
    | { kind: "sleep"; end: string }
    | { kind: "diaper"; diaperType: "wet" | "dirty" | "both" }
  );
export type LoadResult =
  | { status: "ready"; activities: Activity[]; raw: string | null }
  | { status: "invalid"; raw: string }
  | { status: "unavailable" };
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export const STORAGE_KEY = "baby-tracker.activities.v1";
export class StorageChangedError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function isActivity(value: unknown): value is Activity {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    !isTimestamp(value.timestamp) ||
    typeof value.note !== "string" ||
    value.note.length > 1000
  )
    return false;
  if (value.kind === "feed") {
    return (
      (value.feedType === undefined ||
        ["breast milk", "formula", "solids", "other"].includes(
          value.feedType as string,
        )) &&
      (value.amount === undefined ||
        (typeof value.amount === "number" &&
          Number.isFinite(value.amount) &&
          value.amount > 0))
    );
  }
  if (value.kind === "sleep")
    return (
      isTimestamp(value.end) &&
      Date.parse(value.end) > Date.parse(value.timestamp)
    );
  if (value.kind === "diaper")
    return ["wet", "dirty", "both"].includes(value.diaperType as string);
  return false;
}

export function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
}

function isActivityList(value: unknown): value is Activity[] {
  return (
    Array.isArray(value) &&
    value.every(isActivity) &&
    new Set(value.map((activity) => activity.id)).size === value.length
  );
}

export function loadActivities(storage: StoragePort): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "ready", activities: [], raw };
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !isRecord(data) ||
      data.version !== 1 ||
      !isActivityList(data.activities)
    )
      return { status: "invalid", raw };
    return {
      status: "ready",
      activities: sortActivities(data.activities),
      raw,
    };
  } catch {
    return { status: "invalid", raw };
  }
}

export function saveActivities(
  storage: StoragePort,
  activities: Activity[],
  expectedRaw: string | null,
) {
  if (!isActivityList(activities)) throw new Error("Invalid activity data");
  if (storage.getItem(STORAGE_KEY) !== expectedRaw)
    throw new StorageChangedError("Saved data changed");
  const raw = JSON.stringify({ version: 1, activities });
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
