import assert from "node:assert/strict";
import test from "node:test";
import { addArchivedDay, readArchivedDays, removeArchivedDay, writeArchivedDays, ARCHIVED_DAY_LIMIT } from "./friend-archive-memory.ts";

function withStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
  };
  return store;
}

test("archived days keep only valid dates, newest first and capped", () => {
  const store = withStorage();
  assert.deepEqual(readArchivedDays("friend"), []);
  writeArchivedDays("friend", ["2026-09-01", "invalid", "2026-09-30", "2026-09-01", "2026-13-01"]);
  assert.deepEqual(readArchivedDays("friend"), ["2026-09-30", "2026-09-01"]);
  writeArchivedDays("friend", Array.from({ length: 12 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`));
  assert.equal(readArchivedDays("friend").length, ARCHIVED_DAY_LIMIT, "the area stays scannable");
  const kept = JSON.parse(store.get("chat:friend-archive:friend"));
  assert.equal(kept[0], "2026-09-12", "newest day first");
  assert.equal(kept.includes("2026-09-05"), false, "older days beyond the cap are dropped");
  assert.deepEqual(kept, [...kept].sort((a, b) => b.localeCompare(a)));
});

test("adding today is a no-op because today is always shown, and removal drops one day", () => {
  withStorage();
  assert.deepEqual(addArchivedDay("friend", "2026-09-29", "2026-09-29"), []);
  assert.deepEqual(addArchivedDay("friend", "2026-09-28", "2026-09-29"), ["2026-09-28"]);
  assert.deepEqual(addArchivedDay("friend", "2026-09-27", "2026-09-29"), ["2026-09-28", "2026-09-27"]);
  assert.deepEqual(removeArchivedDay("friend", "2026-09-28"), ["2026-09-27"]);
  assert.equal(readArchivedDays("friend").length, 1);
});

test("corrupt or unavailable storage degrades to no archived days instead of throwing", () => {
  withStorage({ "chat:friend-archive:friend": "{not json" });
  assert.deepEqual(readArchivedDays("friend"), []);
  withStorage({ "chat:friend-archive:friend": JSON.stringify({ day: "2026-09-28" }) });
  assert.deepEqual(readArchivedDays("friend"), []);
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.deepEqual(readArchivedDays("friend"), []);
  assert.deepEqual(writeArchivedDays("friend", ["2026-09-28"]), ["2026-09-28"]);
});
