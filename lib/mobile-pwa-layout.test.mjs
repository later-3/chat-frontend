import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
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

test("applies the saved theme before React renders", () => {
  assert.match(htmlSource, /localStorage\.getItem\("pi-theme"\)/);
  assert.match(htmlSource, /document\.documentElement\.classList\.add\("dark"\)/);
});

test("tracks the visual viewport while the software keyboard is open", () => {
  assert.match(appShellSource, /useVisualViewport\(\)/);
  assert.match(appShellSource, /paddingTop: "env\(safe-area-inset-top\)"/);
  assert.match(appShellSource, /paddingBottom: "env\(safe-area-inset-bottom\)"/);
  assert.match(appShellSource, /className="app-shell-root"/);
  assert.match(viewportHookSource, /window\.visualViewport/);
  assert.match(viewportHookSource, /resolveMobileViewport/);
  assert.match(viewportHookSource, /--visual-viewport-height/);
  assert.match(viewportHookSource, /--visual-viewport-offset-top/);
  assert.match(cssSource, /\.app-shell-root \{[\s\S]*?height: var\(--visual-viewport-height, 100dvh\)/);
  assert.match(cssSource, /padding-left: var\(--safe-area-left\)/);
  assert.match(cssSource, /padding-right: var\(--safe-area-right\)/);
  assert.match(chatWindowSource, /paddingBottom: readOnly \? "env\(safe-area-inset-bottom\)" : undefined/);
  assert.match(cssSource, /\.mobile-composer \{[\s\S]*?margin: 6px 8px max\(8px, var\(--safe-area-bottom\)\);/);
  assert.match(appShellSource, /height: "calc\(36px \+ env\(safe-area-inset-top\)\)"/);
  assert.match(appShellSource, /data-mobile-toolbar-file=\{mobile \? "true" : undefined\}/);
  assert.match(cssSource, /left: var\(--safe-area-left\)/);
});

test("contains chat content and inputs within the mobile viewport", () => {
  assert.match(cssSource, /\.markdown-body \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: hidden;/);
  assert.match(cssSource, /\.markdown-code-block \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(chatWindowSource, /overflow-x-hidden overflow-y-auto/);
  assert.match(chatInputSource, /flex: 1,\s*minWidth: 0,\s*width: "100%",/);
});

test("prevents iOS focus zoom from widening the layout", () => {
  assert.match(cssSource, /@media \(max-width: 768px\), \(hover: none\) and \(pointer: coarse\) and \(max-height: 500px\)[\s\S]*?textarea,[\s\S]*?input,[\s\S]*?select \{\s*font-size: 16px !important;/);
});

test("keeps compact toolbar actions reachable across phone widths", () => {
  assert.match(mobileHookSource, /NARROW_MOBILE_QUERY = "\(max-width: 480px\)"/);
  assert.match(appShellSource, /!isNarrowMobile && renderChatToolbarActions\(true\)/);
  assert.match(appShellSource, /isNarrowMobile && mobileToolbarMoreOpen/);
});

test("keeps extension dialogs inside the iOS standalone safe area", () => {
  assert.match(chatWindowSource, /className="extension-dialog-backdrop"/);
  assert.match(chatWindowSource, /className="extension-dialog-surface"/);
  assert.match(cssSource, /@supports \(-webkit-touch-callout: none\)[\s\S]*?\.extension-dialog-backdrop[\s\S]*?max\(59px, var\(--safe-area-top\)\)/);
});

test("renders ANSI-styled extension widget content without raw escape text", () => {
  assert.match(extensionWidgetsSource, /parseAnsiLine\(formatExtensionWidgetContent\(widget\.lines\)\)/);
});
