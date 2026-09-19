import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const dialogSource = await readFile(new URL("../components/FullHistoryDialog.tsx", import.meta.url), "utf8");
const surfaceSource = await readFile(new URL("../components/SurfaceDialog.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("full history opens inside Chat instead of creating a browser tab", () => {
  assert.match(appShellSource, /setFullHistorySessionId\(selectedSession\.id\)/);
  assert.doesNotMatch(appShellSource, /window\.open\([\s\S]*?\/export\?inline=1/);
  assert.match(surfaceSource, /<dialog/);
  assert.match(dialogSource, /<iframe/);
  assert.match(dialogSource, /inline=1/);
  assert.match(dialogSource, /sandbox="allow-downloads allow-scripts"/);
});

test("full history uses a full-screen mobile layout", () => {
  assert.match(styles, /\.surface-dialog-wide[^}]*width:min\(1440px/);
  assert.match(styles, /\.surface-dialog,\.surface-dialog-wide[^}]*width:100%; height:100dvh/);
  assert.match(styles, /surface-header[^}]*env\(safe-area-inset-top\)/);
});
