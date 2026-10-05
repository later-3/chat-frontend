import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readStyleSheetSources } from "./style-sources.ts";
import { PRESET_MODE, migrateV1Appearance } from "./appearance.ts";

const htmlSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const cssSource = (await readStyleSheetSources()).join("\n");
const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const chatInputSource = await readFile(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
const extensionWidgetsSource = await readFile(new URL("../components/ExtensionWidgets.tsx", import.meta.url), "utf8");
const mobileHookSource = await readFile(new URL("../hooks/useIsMobile.ts", import.meta.url), "utf8");
const viewportHookSource = await readFile(new URL("../hooks/useVisualViewport.ts", import.meta.url), "utf8");

test("configures iOS standalone mode to use the full screen", () => {
  assert.match(htmlSource, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(htmlSource, /viewport-fit=cover/);
  assert.match(htmlSource, /interactive-widget=resizes-content/);
  assert.match(htmlSource, /rel="apple-touch-icon"/);
});

test("applies the saved appearance before React renders, matching the lib migration", () => {
  // Execute the actual inline head script (no regex drift): localStorage, matchMedia
  // and documentElement are stubbed, the resolved preset is compared cell by cell
  // against migrateV1Appearance so the two migration tables cannot diverge.
  const inlineHead = htmlSource.match(/<script>([\s\S]*?)<\/script>/)[1];
  const runHeadScript = (storage, systemDark) => {
    const classes = new Set();
    const documentElement = {
      dataset:{},
      classList:{ toggle:(name, on) => { if (on) classes.add(name); else classes.delete(name); } },
    };
    runInNewContext(inlineHead, {
      localStorage: { getItem: key => (Object.hasOwn(storage, key) ? storage[key] : null) },
      window: { matchMedia: () => ({ matches: systemDark }) },
      document: { documentElement },
    });
    return { dataset: documentElement.dataset, dark: classes.has("dark") };
  };
  const v2 = runHeadScript({ "chat:appearance:v2": JSON.stringify({ version:2, preset:"dracula" }) }, false);
  assert.equal(v2.dataset.preset, "dracula");
  assert.equal(v2.dark, true);
  for (const material of ["paper", "glass"])
    for (const palette of ["classic", "ocean", "rose", "orchid", "instagram"])
      for (const dark of [false, true]) {
        const storage = { "chat:appearance:v1": JSON.stringify({ material, palette }), "pi-theme": dark ? "dark" : "light" };
        const applied = runHeadScript(storage, !dark);
        const expected = migrateV1Appearance(JSON.stringify({ material, palette }), dark);
        assert.equal(applied.dataset.preset, expected.preset, `${material}/${palette}/${dark ? "dark" : "light"}`);
        assert.equal(applied.dark, PRESET_MODE[expected.preset] === "dark");
      }
  // pi-theme "auto" resolves against the system scheme inside the script too
  const auto = runHeadScript({ "chat:appearance:v1": '{"material":"glass","palette":"classic"}', "pi-theme": "auto" }, true);
  assert.equal(auto.dataset.preset, "obsidian");
  // nothing stored → no premature paint decision; initializeAppearance applies the default
  const empty = runHeadScript({}, false);
  assert.equal(empty.dataset.preset, undefined);
  assert.equal(empty.dark, false);
});

test("tracks the visual viewport while the software keyboard is open", () => {
  assert.match(appShellSource, /useVisualViewport\(\)/);
  assert.match(appShellSource, /paddingTop: "env\(safe-area-inset-top\)"/);
  assert.match(appShellSource, /paddingBottom: "env\(safe-area-inset-bottom\)"/);
  assert.match(appShellSource, /workspace-app\$\{/);
  assert.match(viewportHookSource, /window\.visualViewport/);
  assert.match(viewportHookSource, /resolveMobileViewport/);
  assert.match(viewportHookSource, /--visual-viewport-height/);
  assert.match(viewportHookSource, /--visual-viewport-offset-top/);
  assert.match(cssSource, /\.app-shell-root \{[\s\S]*?height: var\(--visual-viewport-height, 100dvh\)/);
  assert.match(cssSource, /padding-left: var\(--safe-area-left\)/);
  assert.match(cssSource, /padding-right: var\(--safe-area-right\)/);
  assert.match(chatWindowSource, /paddingBottom: readOnly \? "env\(safe-area-inset-bottom\)" : undefined/);
  assert.match(cssSource, /\.mobile-composer \{[\s\S]*?margin: 6px 8px max\(8px, var\(--safe-area-bottom\)\);/);
  assert.match(cssSource, /padding-top:max\(4px,env\(safe-area-inset-top\)\)/);
  assert.match(appShellSource, /aria-label=\{translate\("workspaceNav.files"\)\}/);
  assert.match(cssSource, /left: var\(--safe-area-left\)/);
});

test("contains chat content and inputs within the mobile viewport", () => {
  assert.match(cssSource, /\.markdown-body \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;/);
  assert.match(cssSource, /\.markdown-code-block \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(chatWindowSource, /overflow-x-hidden overflow-y-auto/);
  assert.match(chatInputSource, /flex: "none",\s*minWidth: 0,\s*width: "100%",/);
  assert.ok(chatInputSource.indexOf("data-chat-composer") < chatInputSource.indexOf("data-chat-toolbar"), "writing occupies its own full-width row before the controls");
});

test("prevents iOS focus zoom from widening the layout", () => {
  assert.match(cssSource, /@media \(max-width: 768px\), \(hover: none\) and \(pointer: coarse\) and \(max-height: 500px\)[\s\S]*?textarea,[\s\S]*?input,[\s\S]*?select \{\s*font-size: 16px !important;/);
});

test("keeps compact toolbar actions reachable across phone widths", () => {
  assert.match(mobileHookSource, /NARROW_MOBILE_QUERY = "\(max-width: 480px\)"/);
  assert.match(appShellSource, /!isNarrowMobile && renderChatToolbarActions\(true\)/);
  assert.match(appShellSource, /isNarrowMobile && mobileToolbarMoreOpen/);
});

test("keeps every modal inside the iOS standalone safe area", () => {
  // The extension dialogs used to own this inset; they are shared modals now, so the
  // rule must live on the shared overlay (and cover session memory, history, models…).
  assert.doesNotMatch(chatWindowSource, /extension-dialog-backdrop|role="dialog"/, "extension dialogs use the shared modal");
  assert.match(chatWindowSource, /return <SurfaceDialog/);
  assert.match(cssSource, /@supports \(-webkit-touch-callout: none\)[\s\S]*?\.surface-overlay[\s\S]*?max\(59px, var\(--safe-area-top\)\)/);
});

test("renders ANSI-styled extension widget content without raw escape text", () => {
  assert.match(extensionWidgetsSource, /parseAnsiLine\(formatExtensionWidgetContent\(widget\.lines\)\)/);
});

test("short touch landscapes retain all accessible navigation actions while making room for history", async () => {
  const navigation = await readFile(new URL("../components/WorkspaceNavigation.tsx", import.meta.url), "utf8");
  assert.match(navigation, /<span>\{label\}<\/span>/);
  assert.match(cssSource, /@media \(hover:none\) and \(pointer:coarse\) and \(max-height:500px\)[\s\S]*?\.workspace-nav-item \{ min-height:44px;/);
  assert.match(cssSource, /\.workspace-nav-item span \{ position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset\(50%\);/);
});
