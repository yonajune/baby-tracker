import assert from "node:assert/strict";
import test from "node:test";
import {
  isActivity,
  loadActivities,
  saveActivities,
  sortActivities,
  STORAGE_KEY,
  StorageChangedError,
} from "../src/activity.ts";
import type { Activity } from "../src/activity.ts";

const feed: Activity = {
  id: "feed-1",
  kind: "feed",
  timestamp: "2026-11-08T10:00:00.000Z",
  note: "",
  amount: 120,
  feedType: "formula",
};
const sleep: Activity = {
  id: "sleep-1",
  kind: "sleep",
  timestamp: "2026-11-08T11:00:00.000Z",
  end: "2026-11-08T12:00:00.000Z",
  note: "Afternoon nap",
};
const diaper: Activity = {
  id: "diaper-1",
  kind: "diaper",
  timestamp: "2026-11-08T12:30:00.000Z",
  diaperType: "both",
  note: "",
};

function memoryStorage(initial: string | null = null) {
  let raw = initial;
  return {
    getItem(key: string) {
      assert.equal(key, STORAGE_KEY);
      return raw;
    },
    setItem(key: string, value: string) {
      assert.equal(key, STORAGE_KEY);
      raw = value;
    },
  };
}

test("all activity kinds persist, reload, sort newest first, and delete", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadActivities(storage), {
    status: "ready",
    activities: [],
    raw: null,
  });
  const raw = saveActivities(storage, [feed, sleep, diaper], null);
  assert.deepEqual(loadActivities(storage), {
    status: "ready",
    activities: [diaper, sleep, feed],
    raw,
  });
  const next = saveActivities(storage, [diaper, feed], raw);
  assert.deepEqual(loadActivities(storage), {
    status: "ready",
    activities: [diaper, feed],
    raw: next,
  });
});

test("sorting does not mutate input and handles dates across year boundaries", () => {
  const earlier = { ...feed, timestamp: "2025-12-31T23:59:00.000Z" };
  const later = { ...sleep, timestamp: "2026-01-01T00:01:00.000Z" };
  const input = [earlier, later];
  assert.deepEqual(sortActivities(input), [later, earlier]);
  assert.deepEqual(input, [earlier, later]);
});

test("optional feeding fields can be omitted and fractional amounts are accepted", () => {
  assert.equal(
    isActivity({
      id: "one",
      kind: "feed",
      timestamp: feed.timestamp,
      note: "",
    }),
    true,
  );
  assert.equal(isActivity({ ...feed, amount: 0.5 }), true);
});

test("untrusted records reject invalid types, dates, amounts, and sleep ranges", () => {
  const invalid: unknown[] = [
    null,
    [],
    5,
    "feed",
    {},
    { ...feed, id: "" },
    { ...feed, id: 4 },
    { ...feed, timestamp: null },
    { ...feed, timestamp: "2026-02-30T10:00:00.000Z" },
    { ...feed, timestamp: "yesterday" },
    { ...feed, note: 5 },
    { ...feed, note: "x".repeat(1001) },
    { ...feed, kind: "unknown" },
    { ...feed, feedType: null },
    { ...feed, feedType: ["formula"] },
    { ...feed, feedType: "juice" },
    { ...diaper, diaperType: "dry" },
    { ...diaper, diaperType: 2 },
    { ...sleep, end: sleep.timestamp },
    { ...sleep, end: feed.timestamp },
    { ...sleep, end: null },
    ...[0, -1, NaN, Infinity, -Infinity, "120", "", null, {}, []].map(
      (amount) => ({ ...feed, amount }),
    ),
  ];
  for (const value of invalid)
    assert.equal(isActivity(value), false, JSON.stringify(value));
});

test("malformed and partially invalid payloads are preserved without writing", () => {
  const invalid = [
    "{broken",
    "",
    "null",
    "[]",
    JSON.stringify({ version: 2, activities: [feed] }),
    JSON.stringify({ version: 1, activities: null }),
    JSON.stringify({ version: 1, activities: [feed, { ...sleep, end: null }] }),
    JSON.stringify({ version: 1, activities: [feed, feed] }),
  ];
  for (const raw of invalid) {
    const storage = memoryStorage(raw);
    assert.deepEqual(loadActivities(storage), { status: "invalid", raw });
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
});

test("denied reads do not look like an empty activity list", () => {
  const storage = {
    getItem() {
      throw new Error("Denied");
    },
    setItem() {
      assert.fail("Must not write");
    },
  };
  assert.deepEqual(loadActivities(storage), { status: "unavailable" });
});

test("quota and denied writes propagate and leave previous data unchanged", () => {
  const raw = JSON.stringify({ version: 1, activities: [feed] });
  const storage = {
    getItem() {
      return raw;
    },
    setItem() {
      throw new Error("Quota exceeded");
    },
  };
  assert.throws(
    () => saveActivities(storage, [feed, sleep], raw),
    /Quota exceeded/,
  );
  assert.deepEqual(loadActivities(storage), {
    status: "ready",
    activities: [feed],
    raw,
  });
});

test("changes from another tab are not silently overwritten", () => {
  const storage = memoryStorage();
  saveActivities(storage, [feed], null);
  assert.throws(
    () => saveActivities(storage, [sleep], null),
    StorageChangedError,
  );
  const result = loadActivities(storage);
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.deepEqual(result.activities, [feed]);
});

test("invalid writes are rejected before touching storage", () => {
  const storage = {
    getItem() {
      assert.fail("Must validate first");
    },
    setItem() {
      assert.fail("Must not write");
    },
  };
  assert.throws(
    () => saveActivities(storage, [{ ...feed, amount: NaN }], null),
    /Invalid activity/,
  );
});
