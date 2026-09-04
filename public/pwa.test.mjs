import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("./manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
const offlinePage = readFileSync(new URL("./offline.html", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("the installable PWA is branded and scoped as Chat", () => {
  assert.equal(manifest.name, "Chat");
  assert.equal(manifest.short_name, "Chat");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/lifeos-astronaut-/);
    assert.equal(existsSync(new URL(`.${icon.src}`, import.meta.url)), true, `missing ${icon.src}`);
  }
});

test("the service worker and offline page use the Chat identity", () => {
  assert.match(serviceWorker, /const CACHE_PREFIX = "chat"/);
  assert.match(serviceWorker, /const LEGACY_CACHE_PREFIX = "pi-web"/);
  assert.match(serviceWorker, /\/lifeos-astronaut-192x192\.png/);
  assert.match(offlinePage, /\/lifeos-astronaut-192x192\.png/);
  assert.match(offlinePage, /Chat 当前离线/);
  assert.doesNotMatch(offlinePage, /Pi Web is offline/);
});

test("the production service worker cache follows the package version", () => {
  assert.match(viteConfig, /import packageMetadata from "\.\/package\.json" with \{ type: "json" \}/);
  assert.match(viteConfig, /process\.env\.VITE_APP_VERSION \?\? packageMetadata\.version/);
  assert.match(viteConfig, /"import\.meta\.env\.VITE_APP_VERSION": JSON\.stringify\(appVersion\)/);
});
