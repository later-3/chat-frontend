import assert from "node:assert/strict";
import test from "node:test";
import { readToolbarLabelMode, showToolbarLabels, writeToolbarLabelMode } from "./ui-preference.ts";

function withStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
  };
  return store;
}

test("toolbar actions default to icons only, labels are an explicit preference", () => {
  const store = withStorage();
  assert.equal(readToolbarLabelMode(), "icons");
  assert.equal(showToolbarLabels("icons"), false);
  writeToolbarLabelMode("icons-and-labels");
  assert.equal(readToolbarLabelMode(), "icons-and-labels");
  assert.equal(showToolbarLabels("icons-and-labels"), true);
  assert.equal(store.get("chat:toolbar-labels"), "icons-and-labels");
  writeToolbarLabelMode("icons");
  assert.equal(readToolbarLabelMode(), "icons");
});

test("unknown or unavailable storage falls back to icons instead of throwing", () => {
  withStorage({ "chat:toolbar-labels": "yes-please" });
  assert.equal(readToolbarLabelMode(), "icons");
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.equal(readToolbarLabelMode(), "icons");
  writeToolbarLabelMode("icons-and-labels");
});
