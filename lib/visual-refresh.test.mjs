import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("visual-refresh preview switch is prototype-gated and bilingual", async () => {
  const [hook, settings, precision, en, zh] = await Promise.all([
    readFile(new URL("../hooks/useVisualRefresh.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/WorkspaceSettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/precision.css", import.meta.url), "utf8"),
    readFile(new URL("./i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("./i18n/messages/zh-CN.ts", import.meta.url), "utf8"),
  ]);
  // Hook persists under a single key and toggles a DOM dataset gate.
  assert.match(hook, /chat:visual-refresh/);
  assert.match(hook, /dataset\.visualRefresh/);
  assert.match(hook, /conservative/);
  assert.match(hook, /aggressive/);
  // Settings exposes both modes through i18n keys, never hardcoded copy.
  assert.match(settings, /useVisualRefresh/);
  assert.match(settings, /design\.visualRefresh/);
  assert.doesNotMatch(settings, /激进版预览|Conservative keeps/);
  // Aggressive treatment stays inside existing tokens; no new palette.
  assert.match(precision, /data-visual-refresh="aggressive"/);
  assert.match(precision, /--shadow-dialog/);
  assert.match(precision, /--radius-control/);
  assert.match(precision, /--duration-overlay/);
  assert.doesNotMatch(precision, /#FAF9F7|#1C1B20/);
  for (const key of [
    "design.visualRefresh",
    "design.visualRefreshHint",
    "design.visualRefresh.conservative",
    "design.visualRefresh.aggressive",
  ]) {
    assert.match(en, new RegExp(`"${key}"`));
    assert.match(zh, new RegExp(`"${key}"`));
  }
});

test("P3 dialog contract: temp configs share SurfaceDialog, nested layers stay above", async () => {
  const [panel, models, memory] = await Promise.all([
    readFile(new URL("../components/LongAgentSettingsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ModelsConfig.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MemoryManager.tsx", import.meta.url), "utf8"),
  ]);
  for (const [name, source] of [["panel", panel], ["models", models], ["memory", memory]]) {
    assert.match(source, /<SurfaceDialog/, `${name}: temp config must use SurfaceDialog`);
    assert.doesNotMatch(source, /createPortal\([\s\S]*window\.document\.body/, `${name}: no full-page portal`);
  }
  // Nested picker/editor keep their own focus scopes above the shared overlay (1100/1101).
  assert.match(models, /zIndex: 1110/);
  assert.match(
    await readFile(new URL("../components/MemoryManager.module.css", import.meta.url), "utf8"),
    /z-index: 1110/,
  );
});
