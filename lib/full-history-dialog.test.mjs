import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const dialogSource = await readFile(new URL("../components/FullHistoryDialog.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("full history opens inside Chat instead of creating a browser tab", () => {
  assert.match(appShellSource, /setFullHistorySessionId\(selectedSession\.id\)/);
  assert.doesNotMatch(appShellSource, /window\.open\([\s\S]*?\/export\?inline=1/);
  assert.match(dialogSource, /<dialog/);
  assert.match(dialogSource, /<iframe/);
  assert.match(dialogSource, /\/export\?inline=1/);
  assert.match(dialogSource, /sandbox="allow-downloads allow-scripts"/);
});

test("full history uses a full-screen mobile layout", () => {
  assert.match(styles, /\.full-history-dialog[\s\S]*?width: min\(1200px/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?\.full-history-dialog[\s\S]*?width: 100vw;[\s\S]*?height: 100dvh;/);
  assert.match(styles, /\.full-history-content[\s\S]*?var\(--safe-area-bottom\)/);
});
