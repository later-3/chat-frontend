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

/**
 * One size language (UI/UX §18.4): the modal tiers share one formula, and the layer
 * scale lives in tokens instead of per-component numbers.
 */
test("modal sizes, layers and motion come from one shared scale", async () => {
  const sheets = (await readStyleSheetSources()).join("\n");
  assert.match(sheets, /\.surface-dialog \{ width:min\(960px,calc\(100vw - 48px\)\); height:min\(800px,calc\(100dvh - 48px\)\)/, "the default tier");
  assert.match(sheets, /\.surface-dialog-wide \{ width:min\(1440px,calc\(100vw - 48px\)\); height:min\(1000px,calc\(100dvh - 48px\)\)/, "the wide tier uses the same formula, only different numbers");
  for (const token of ["--layer-sheet", "--layer-modal", "--layer-float", "--layer-tooltip", "--layer-toast"]) {
    assert.ok(sheets.includes(`${token}:`), `${token} is declared`);
  }
  assert.match(sheets, /z-index:\s*var\(--layer-modal\)/, "the modal layer comes from the token");
  assert.match(sheets, /z-index:\s*var\(--layer-float\)/, "anchored floats come from the token");
  assert.match(sheets, /z-index:\s*var\(--layer-tooltip\)/, "tooltips come from the token");
  assert.doesNotMatch(sheets, /@keyframes command-palette-in/, "the palette uses the shared reveal, not private keyframes");
  assert.match(sheets, /\.command-palette \{ animation: layer-in/, "the palette reveals like every other modal layer");

  // Overlay-level numbers in components must not grow; the list is the reviewed backlog.
  const OVERLAY_LAYER_OWNERS = [
    "AppShell.tsx", "BranchNavigator.tsx", "DirectoryPicker.tsx", "MobileDebugOverlay.tsx",
    "ProviderRequests.tsx", "RemovedSessionsPanel.tsx",
  ];
  const offenders = [];
  for (const file of await sourceFiles()) {
    const source = await readFile(file, "utf8");
    const numbers = [...source.matchAll(/zIndex: (\d{3,})/g)].map(match => Number(match[1])).filter(value => value > 200);
    if (numbers.length > 0 && !OVERLAY_LAYER_OWNERS.includes(file.pathname.split("/").slice(-1)[0])) {
      offenders.push(file.pathname.split("/").slice(-1)[0]);
    }
  }
  assert.deepEqual(offenders, [], `overlay z-index must come from --layer-* tokens: ${offenders.join(", ")}`);
});

test("hand-rolled modals stay on the documented migration backlog", async () => {
  // UI/UX §18.4: temporary configuration belongs in SurfaceDialog. These files still
  // implement the legacy `useDialogFocus` overlay and are the reviewed backlog — a new
  // entry here means a new divergence, so the list must be updated on purpose.
  const LEGACY_MODAL_OWNERS = [
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
  assert.match(action, /shape === "frame" \? " is-frame"/, "the composer frame is the same primitive, not a second button style");
});

/**
 * Session actions belong to the top bar, composer controls stay inside the frame
 * (UI/UX §20.5). The composer row used to hand-roll every button and to mutate
 * styles from onMouseEnter, which is how it drifted away from the toolbar.
 */
test("the composer keeps only input-level actions and shares the toolbar primitive", async () => {
  const input = await readFile(new URL("ChatInput.tsx", componentDir), "utf8");
  assert.doesNotMatch(input, /currentTarget\.style/, "no inline hover mutation: states come from classes and tokens");
  assert.doesNotMatch(input, /composer-memory-action|data-session-memory-open/, "the session-memory action is not a composer control");
  assert.doesNotMatch(input, /data-session-compact/, "compacting is a session action, not a composer control");
  const frameActions = input.match(/shape="frame"/g) ?? [];
  assert.ok(frameActions.length >= 2, `attach and workflow agents use shape="frame" (${frameActions.length})`);
  assert.doesNotMatch(input, /IconVolume|IconBell|IconNotebook/, "notification and memory controls are session actions, not composer controls");
  assert.match(input, /<WorkflowPicker/, "the workflow value control is the shared picker, not a native select");
  assert.doesNotMatch(input, /<select/, "no native select in the composer frame");
  // The controls row must live inside the bordered frame, not in a strip below it.
  assert.match(input, /className=\{`composer-frame/, "the composer box is one frame");
  assert.ok(
    input.indexOf("className={`composer-frame") < input.indexOf("data-chat-toolbar"),
    "the frame opens before the controls row",
  );
  const sheets = (await readStyleSheetSources()).join("\n");
  assert.match(sheets, /\.composer-frame \{/, "the composer box is one frame");
  // One row inside the box: the value control sits to the right of the send button,
  // and there is no second controls strip below the textarea.
  assert.ok(input.indexOf("<WorkflowPicker") > input.indexOf("onClick={handleSend}"), "the workflow control sits right of the send button");
  assert.equal((input.match(/data-chat-toolbar/g) ?? []).length, 1, "exactly one composer control row");
  assert.ok(input.indexOf("data-chat-toolbar") < input.indexOf("<WorkflowPicker"), "the row wraps textarea, actions and the workflow control");

  // Fast Refresh: a module that also exports plain values cannot hot-swap, which is
  // why composer edits used to require a manual reload (Vite: "export is incompatible").
  const valueExports = [...input.matchAll(/^export (?:async )?(?:function|const|let|class) (\w+)/gm)].map(match => match[1]);
  assert.deepEqual(valueExports, ["ChatInput"], `components/ChatInput.tsx may only export the component (${valueExports.join(", ")})`);

  const window = await readFile(new URL("ChatWindow.tsx", componentDir), "utf8");
  assert.match(window, /createPortal\([\s\S]{0,120}sessionMemoryAction\}[\s\S]{0,60}chatActionsSlot/, "session actions render into the top-bar slot");
  assert.match(window, /data-session-memory-open/, "session memory opens from the top bar");
  assert.match(window, /data-session-compact=\{isCompacting \? "running" : "idle"\}/, "compacting stays addressable for the browser gate");
  assert.match(window, /const soundAction = onSoundToggle === undefined \? null/, "sound moved to the top bar");
  assert.match(window, /const pushAction = onPushToggle === undefined \? null/, "push moved to the top bar");
});

test("navigation and branch actions obey the same toolbar label rule", async () => {
  const rail = await readFile(new URL("WorkspaceNavigation.tsx", componentDir), "utf8");
  assert.match(rail, /useToolbarLabels/, "the rail reads the one label preference");
  assert.match(rail, /is-icon-only/, "the rail defaults to icons only");
  assert.match(rail, /useIsMobile/, "Compact keeps names because touch has no hover");
  assert.match(rail, /Hint/, "icon-only entries keep a tooltip");
  const branches = await readFile(new URL("BranchNavigator.tsx", componentDir), "utf8");
  assert.match(branches, /<ToolbarAction/, "the branch action uses the shared action");
});

test("side panels share one docked-panel primitive instead of repeating the effect", async () => {
  const sheets = (await sheetEntries()).map(([, source]) => source).join("\n");
  const dock = sheets.slice(sheets.indexOf(".workspace-dock {"));
  assert.match(dock, /transition: width var\(--duration-panel\) var\(--ease-standard\)/, "the dock animates with the motion tokens");
  assert.match(sheets, /\.workspace-dock\.is-open \{/, "open state is a class, not a conditional render");
  assert.match(sheets, /\.workspace-dock\.is-closed \{/, "closed state is a class, so the panel can animate out");
  assert.match(sheets, /\.workspace-dock > \* \{[^}]*--dock-width/, "inner content keeps its width so the panel does not reflow");
  // The dock reuses --dock-width for the panel and its inner content, so a percentage
  // would resolve a second time against the panel and squeeze the content.
  const offenders = [...sheets.matchAll(/--dock-width:\s*([^;]+);/g)]
    .map(match => match[1].trim())
    .filter(value => value.includes("%") && !value.includes("var(--"));
  assert.deepEqual(offenders, [], `--dock-width must be an absolute length: ${offenders.join(", ")}`);
  const shell = await readFile(new URL("AppShell.tsx", componentDir), "utf8");
  for (const panel of ["sidebar-container", "right-panel-container", "workspace-friend-panel"]) {
    assert.ok(shell.includes(`workspace-dock ${panel}`), `${panel} must reuse .workspace-dock`);
  }
  assert.match(shell, /workspace-friend-panel \$\{friendPanelOpen \? "is-open" : "is-closed"\}/, "the tasks & archive region stays mounted and toggles a class");
});
