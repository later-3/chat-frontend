import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { readStyleSheetSources } from "./style-sources.ts";

const componentDir = new URL("../components/", import.meta.url);
const uiDir = new URL("../components/ui/", import.meta.url);

/** One-off reveals and loop indicators are the only exempt animations (UI/UX §8.1). */
const ALLOWED_ANIMATIONS = [
  "saved-pop 0.45s",             // success confirmation pop (≤450ms reveal bound)
  "saved-check-draw 0.35s",      // its check stroke draw
  "mobile-refresh-spin 0.65s",   // refresh loop indicator
  "device-workspace-spin 0.7s",  // switch loop indicator
  "extension-widget-update-pulse 900ms", // loop indicator
];

const MAGIC_DURATION = /(?<![\w.-])(\d+(?:\.\d+)?)(m?s)(?![\w-])/;
const SHEET_NAMES = ["styles.css", "tokens.css", "base.css", "components.css", "workspace.css", "precision.css"];

/** Aggregated stylesheet sources labelled by file, in declaration order. */
async function sheetEntries() {
  const sources = await readStyleSheetSources();
  return sources.map((source, index) => [SHEET_NAMES[index] ?? `sheet-${index}`, source]);
}

async function sourceFiles() {
  const names = (await readdir(componentDir)).filter(name => name.endsWith(".tsx") || name.endsWith(".module.css"));
  const files = names.map(name => new URL(name, componentDir));
  for (const name of await readdir(uiDir)) {
    if (name.endsWith(".tsx") || name.endsWith(".module.css")) files.push(new URL(name, uiDir));
  }
  return files;
}

test("state transitions use motion tokens, never magic durations", async () => {
  const violations = [];
  const inspect = (label, source) => {
    for (const line of source.split("\n")) {
      if (!line.includes("transition") || line.includes("transition-duration")) continue; // the reduced-motion floor is intentional
      const value = line.slice(line.indexOf("transition"));
      if (!MAGIC_DURATION.test(value.replace(/var\(--duration-\w+\)/g, "token"))) continue;
      violations.push(`${label}: ${line.trim()}`);
    }
  };
  for (const file of await sourceFiles()) inspect(file.pathname.split("/").slice(-1)[0], await readFile(file, "utf8"));
  for (const [name, source] of await sheetEntries()) inspect(name, source);
  assert.deepEqual(violations, [], `transitions must use --duration-* tokens:\n${violations.join("\n")}`);
});

test("animations are token-driven or a declared loop/one-off reveal", async () => {
  const violations = [];
  const inspect = (label, source) => {
    for (const line of source.split("\n")) {
      if (!line.includes("animation") || line.includes("animation-duration")) continue; // loop indicators set their own duration
      if (line.includes("var(--duration") || line.includes("infinite")) continue;
      if (ALLOWED_ANIMATIONS.some(allowed => line.includes(allowed))) continue;
      if (!MAGIC_DURATION.test(line)) continue;
      violations.push(`${label}: ${line.trim()}`);
    }
  };
  for (const file of await sourceFiles()) inspect(file.pathname.split("/").slice(-1)[0], await readFile(file, "utf8"));
  for (const [name, source] of await sheetEntries()) inspect(name, source);
  assert.deepEqual(violations, [], `undeclared animation duration:\n${violations.join("\n")}`);
});

test("pressed state is a token background, not a brightness filter", async () => {
  const violations = [];
  const inspect = (label, source) => {
    if (/filter:\s*brightness\(/.test(source)) violations.push(label);
  };
  for (const file of await sourceFiles()) inspect(file.pathname.split("/").slice(-1)[0], await readFile(file, "utf8"));
  for (const [name, source] of await sheetEntries()) inspect(name, source);
  assert.deepEqual(violations, [], "filter:brightness() darkens icon and label together; use --bg-selected/--accent-pressed");
});

test("every dimming layer fades in, and Radix layers also fade out (UI/UX §8.2)", async () => {
  const precision = (await sheetEntries()).find(([name]) => name === "precision.css")[1];
  assert.match(precision, /@keyframes scrim-in/);
  assert.match(precision, /@keyframes scrim-out/);
  assert.match(precision, /@keyframes layer-in/);
  assert.match(precision, /@keyframes layer-out/);
  // Radix overlays own both directions; the shared scrim class covers the rest.
  for (const selector of [".surface-overlay", ".command-palette-overlay"]) {
    assert.match(precision, new RegExp(`${selector.replace(".", "\\.")}[^{]*\\{[^}]*animation: scrim-in`), `${selector} must fade in`);
  }
  assert.match(precision, /\.surface-overlay\[data-state="closed"\][^{]*\{[^}]*scrim-out/, "surface overlay must fade out");
  const uiModule = await readFile(new URL("ui.module.css", uiDir), "utf8");
  assert.match(uiModule, /\.overlay \{[^}]*animation:scrim-in/, "Radix AlertDialog overlay must fade in");
  assert.match(uiModule, /\.overlay\[data-state=closed\] \{[^}]*scrim-out/, "Radix AlertDialog overlay must fade out");
  const memory = await readFile(new URL("MemoryManager.module.css", componentDir), "utf8");
  assert.match(memory, /\.editorBackdrop \{[^}]*animation: scrim-in/, "nested editor scrim must fade");
  const models = await readFile(new URL("ModelsConfig.module.css", componentDir), "utf8");
  assert.match(models, /\.pickerScrim \{[^}]*animation: scrim-in/, "nested picker scrim must fade");
});

test("shared UI primitives are the only definition of buttons and modals", async () => {
  // Reuse invariant: pages compose the shared primitives instead of forking them.
  const declarers = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, "utf8");
    if (source.includes("data-ui-button")) declarers.push(file.pathname.split("/").slice(-1)[0]);
  }
  assert.deepEqual(declarers, ["Button.tsx", "ui.module.css"], "only the shared Button primitive may define the button surface");

  const UI_PRIMITIVES = ["Button.tsx", "Tooltip.tsx", "Popover.tsx", "DropdownMenu.tsx", "Confirmation.tsx", "FeedbackToaster.tsx", "CommandPalette.tsx", "SourceCode.tsx", "PageHeader.tsx"];
  for (const primitive of UI_PRIMITIVES) await readFile(new URL(primitive, uiDir), "utf8");
  // SurfaceDialog is the shared modal surface but lives beside its consumers.
  await readFile(new URL("SurfaceDialog.tsx", componentDir), "utf8");
});

test("hand-rolled modals stay on the documented migration backlog", async () => {
  // UI/UX §18.4: temporary configuration belongs in SurfaceDialog. These files still
  // implement the legacy `useDialogFocus` overlay and are the reviewed backlog — a new
  // entry here means a new divergence, so the list must be updated on purpose.
  const LEGACY_MODAL_OWNERS = [
    "ChatWindow.tsx",            // extension request dialog + session memory reader
    "CommandPalette.tsx",        // navigation-only palette (documented exception)
    "DirectoryPicker.tsx",
    "ExtensionsConfig.tsx",
    "FileExplorer.tsx",          // compact action sheet (Sheet mode, not a modal)
    "MemoryManager.tsx",         // nested add/edit editor above the shared dialog
    "MobileDeviceSwitcher.tsx",  // compact action sheet
    "MobileWorkspaceHeader.tsx", // compact action sheet
    "ModelsConfig.tsx",          // nested provider picker above the shared dialog
    "PluginsConfig.tsx",
    "ProviderRequests.tsx",
    "RemovedSessionsPanel.tsx",
    "SessionSidebar.tsx",        // compact action sheet
    "SkillsConfig.tsx",
  ];
  const found = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, "utf8");
    if (source.includes('role="dialog"')) found.push(file.pathname.split("/").slice(-1)[0]);
  }
  const unexpected = found.filter(name => !LEGACY_MODAL_OWNERS.includes(name));
  assert.deepEqual(unexpected, [], `new hand-rolled modal: extend the primitive instead (ui-ux §18.4): ${unexpected.join(", ")}`);
});

test("every shared ui-* layout class used by components exists in the stylesheets", async () => {
  const sheets = (await sheetEntries()).map(([, source]) => source).join("\n");
  const used = new Set();
  for (const file of await sourceFiles()) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/className="(ui-[a-z0-9-]+)/g)) used.add(match[1]);
  }
  const missing = [...used].filter(name => !sheets.includes(`.${name} `) && !sheets.includes(`.${name}{`) && !sheets.includes(`.${name}:`));
  assert.deepEqual(missing, [], `ui-* class without a rule: ${missing.join(", ")}`);
});

test("toolbar actions are declared once, with an icon-only default", async () => {
  const owners = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, "utf8");
    if (source.includes('data-toolbar-action')) owners.push(file.pathname.split("/").slice(-1)[0]);
  }
  assert.deepEqual(owners, ["ToolbarAction.tsx"], "toolbars must compose components/ui/ToolbarAction.tsx");
  const action = await readFile(new URL("ToolbarAction.tsx", uiDir), "utf8");
  const preference = await readFile(new URL("../lib/ui-preference.ts", import.meta.url), "utf8");
  assert.match(preference, /chat:toolbar-labels/);
  assert.match(preference, /"icons"/, "icons are the default mode");
  assert.match(action, /useToolbarLabels/, "the label mode comes from one shared preference");
  assert.match(action, /is-icon-only/, "icons-only is the rendered default");
});
