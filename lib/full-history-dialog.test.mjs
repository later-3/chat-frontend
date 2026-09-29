import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStyleSheetSources } from "./style-sources.ts";

const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const dialogSource = await readFile(new URL("../components/FullHistoryDialog.tsx", import.meta.url), "utf8");
const surfaceSource = await readFile(new URL("../components/SurfaceDialog.tsx", import.meta.url), "utf8");
const styles = (await readStyleSheetSources()).join("\n");

test("full history opens inside Chat instead of creating a browser tab", () => {
  assert.match(appShellSource, /setFullHistorySessionId\(selectedSession\.id\)/);
  assert.doesNotMatch(appShellSource, /window\.open\([\s\S]*?\/export\?inline=1/);
  assert.match(surfaceSource, /@radix-ui\/react-dialog/);
  assert.match(surfaceSource, /<Dialog.Content/);
  assert.match(dialogSource, /<iframe/);
  assert.match(dialogSource, /inline=1/);
  assert.match(dialogSource, /sandbox="allow-downloads allow-scripts"/);
});

test("full history uses the shared dialog size and mobile layout", () => {
  // No tier of its own: the history reader is the same floating page as session
  // memory (UI/UX §20.6), and compact turns every dialog full screen.
  assert.doesNotMatch(styles, /\.surface-dialog-wide/, "history must not pick a different size");
  assert.match(styles, /\.surface-dialog \{[^}]*width:min\(1120px/);
  assert.match(styles, /\.surface-dialog \{[^}]*width:100%; height:100dvh/);
  assert.match(styles, /surface-header[^}]*env\(safe-area-inset-top\)/);
});
