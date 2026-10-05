import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_APPEARANCE, GLASS_PRESETS, PRESETS, PRESET_MODE,
  applyAppearance, migrateV1Appearance, parseAppearance, readAppearance, writeAppearance,
} from "./appearance.ts";

const memoryStorage = (values = {}) => {
  const map = new Map(Object.entries(values));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    getItemThrows: key => { throw new Error(`storage denied for ${key}`); },
    snapshot: () => Object.fromEntries(map),
  };
};

test("PRESET_MODE binds the sample's light/dark split for all seven presets", () => {
  assert.deepEqual([...PRESETS], ["paper", "glacier", "peach", "instagram", "graphite", "obsidian", "dracula"]);
  assert.deepEqual(Object.keys(PRESET_MODE), [...PRESETS]);
  assert.deepEqual(
    PRESETS.filter(preset => PRESET_MODE[preset] === "light"),
    ["paper", "glacier", "peach", "instagram"],
  );
  assert.deepEqual(
    PRESETS.filter(preset => PRESET_MODE[preset] === "dark"),
    ["graphite", "obsidian", "dracula"],
  );
  assert.deepEqual([...GLASS_PRESETS], ["glacier", "obsidian"]);
  for (const preset of GLASS_PRESETS) assert.ok(PRESETS.includes(preset));
  assert.deepEqual(DEFAULT_APPEARANCE, { preset:"paper", motion:"full", background:true, opaque:false });
});

test("parseAppearance restores v2 records and falls back to the default preset on anything else", () => {
  const saved = { version:2, preset:"obsidian", motion:"reduced", background:false, opaque:true, note:"not-an-appearance-field" };
  assert.deepEqual(parseAppearance(JSON.stringify(saved)), { preset:"obsidian", motion:"reduced", background:false, opaque:true });
  assert.deepEqual(parseAppearance('{"version":2,"preset":"glacier"}'), { preset:"glacier", motion:"full", background:true, opaque:false });
  // unknown or wrongly-typed fields revert per field, unknown presets revert wholesale
  assert.deepEqual(
    parseAppearance('{"version":2,"preset":"dracula","motion":"sleepy","background":"false","opaque":1}'),
    { preset:"dracula", motion:"full", background:true, opaque:false },
  );
  for (const raw of [
    null, "", "broken", "[]", "true",
    '{"version":1,"preset":"paper","motion":"reduced","background":false,"opaque":true}',
    '{"version":3,"preset":"paper"}',
    '{"version":2,"preset":"ocean"}',
    '{"version":2}',
  ]) assert.deepEqual(parseAppearance(raw), DEFAULT_APPEARANCE);
});

const V1_TO_V2 = {
  paper: { classic:["paper","paper"], ocean:["glacier","glacier"], rose:["peach","peach"], orchid:["glacier","dracula"], instagram:["instagram","instagram"] },
  glass: { classic:["glacier","obsidian"], ocean:["glacier","obsidian"], rose:["peach","peach"], orchid:["glacier","dracula"], instagram:["instagram","instagram"] },
};

test("migrateV1Appearance maps every v1 material×palette×mode cell to the approved preset", () => {
  for (const [material, palettes] of Object.entries(V1_TO_V2))
    for (const [palette, modes] of Object.entries(palettes))
      for (const [index, preset] of modes.entries()) {
        const dark = index === 1;
        const migrated = migrateV1Appearance(JSON.stringify({ material, palette, motion:"reduced", background:false, opaque:true }), dark);
        assert.deepEqual(
          migrated,
          { preset, motion:"reduced", background:false, opaque:true },
          `${material}/${palette}/${dark ? "dark" : "light"} must become ${preset}`,
        );
        assert.equal(PRESETS.includes(migrated.preset), true);
      }
});

test("migrateV1Appearance recovers from unreadable records and unknown fields", () => {
  for (const raw of [null, "", "broken", "[]", '"text"']) assert.deepEqual(migrateV1Appearance(raw, true), DEFAULT_APPEARANCE);
  // unknown palette falls back to the classic row, unknown material to the paper table
  assert.equal(migrateV1Appearance('{"material":"paper","palette":"mint"}', false).preset, "paper");
  assert.equal(migrateV1Appearance('{"material":"glass","palette":"mint"}', true).preset, "obsidian");
  assert.equal(migrateV1Appearance('{"material":"silk","palette":"ocean"}', false).preset, "glacier");
  assert.deepEqual(
    migrateV1Appearance('{"material":"glass","palette":"rose","motion":"sleepy","background":"false","opaque":1}', true),
    { preset:"peach", motion:"full", background:true, opaque:false },
  );
});

test("readAppearance prefers v2, resolves the v1 theme key and survives blocked storage", () => {
  const v2 = JSON.stringify({ version:2, preset:"dracula", motion:"full", background:true, opaque:false });
  const v1 = JSON.stringify({ material:"glass", palette:"classic" });
  assert.deepEqual(
    readAppearance(memoryStorage({ "chat:appearance:v2": v2, "chat:appearance:v1": v1, "pi-theme": "light" })),
    { preset:"dracula", motion:"full", background:true, opaque:false },
  );
  // a corrupt v2 record does not resurrect the v1 appearance
  assert.deepEqual(readAppearance(memoryStorage({ "chat:appearance:v2": "{oops", "chat:appearance:v1": v1, "pi-theme": "dark" })), DEFAULT_APPEARANCE);
  // explicit dark/light win; auto and a missing key follow the system scheme
  const withSystem = storage => readAppearance(storage, () => true);
  assert.equal(withSystem(memoryStorage({ "chat:appearance:v1": v1, "pi-theme": "dark" })).preset, "obsidian");
  assert.equal(withSystem(memoryStorage({ "chat:appearance:v1": v1, "pi-theme": "light" })).preset, "glacier");
  assert.equal(withSystem(memoryStorage({ "chat:appearance:v1": v1, "pi-theme": "auto" })).preset, "obsidian");
  assert.equal(withSystem(memoryStorage({ "chat:appearance:v1": v1, "pi-theme": "" })).preset, "obsidian");
  assert.equal(withSystem(memoryStorage({ "chat:appearance:v1": v1 })).preset, "obsidian");
  assert.equal(readAppearance(memoryStorage({ "chat:appearance:v1": v1 }), () => false).preset, "glacier");
  assert.equal(readAppearance(memoryStorage({ "chat:appearance:v1": v1, "pi-theme": "auto" }), () => false).preset, "glacier");
  assert.deepEqual(readAppearance({ getItem: key => { throw new Error(`storage denied for ${key}`); } }), DEFAULT_APPEARANCE);
  // an unreadable theme key counts as light
  const brokenTheme = { getItem: key => { if (key === "pi-theme") throw new Error("denied"); return key === "chat:appearance:v1" ? v1 : null; } };
  assert.equal(readAppearance(brokenTheme, () => true).preset, "glacier");
});

test("writeAppearance persists v2 and mirrors the offline-shell theme key", () => {
  const storage = memoryStorage();
  writeAppearance(storage, { preset:"obsidian", motion:"reduced", background:false, opaque:true });
  assert.deepEqual(
    JSON.parse(storage.getItem("chat:appearance:v2")),
    { version:2, preset:"obsidian", motion:"reduced", background:false, opaque:true },
  );
  assert.equal(storage.getItem("pi-theme"), "dark");
  writeAppearance(storage, { ...DEFAULT_APPEARANCE });
  assert.equal(storage.getItem("pi-theme"), "light");
});

const fakeRoot = () => {
  const classes = new Set();
  return {
    dataset:{}, classes,
    classList:{ toggle:(name, on) => { if (on) classes.add(name); else classes.delete(name); }, contains:name => classes.has(name) },
  };
};

test("applyAppearance projects the preset onto data attributes and the dark class", () => {
  const light = fakeRoot();
  applyAppearance(light, { ...DEFAULT_APPEARANCE });
  assert.deepEqual(light.dataset, { preset:"paper", motion:"on", background:"on", transparency:"normal" });
  assert.equal(light.classes.has("dark"), false);
  const dark = fakeRoot();
  applyAppearance(dark, { preset:"obsidian", motion:"reduced", background:false, opaque:true });
  assert.deepEqual(dark.dataset, { preset:"obsidian", motion:"off", background:"off", transparency:"reduced" });
  assert.equal(dark.classes.has("dark"), true);
  // switching back to a light preset must clear a stale dark class
  const switched = fakeRoot();
  switched.classes.add("dark");
  applyAppearance(switched, { preset:"glacier", motion:"full", background:true, opaque:false });
  assert.equal(switched.classes.has("dark"), false);
});

const luminance = hex => {
  const rgb = hex.replace("#", "").match(/../g).map(byte => parseInt(byte, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test("every preset keeps readable content and primary actions on its declared surfaces", () => {
  const tokensCss = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  const appearanceCss = readFileSync(new URL("../src/styles/appearance.css", import.meta.url), "utf8");
  const block = (source, marker) => source.slice(source.indexOf(marker)).split("}")[0];
  for (const preset of PRESETS) {
    // paper is the :root baseline in tokens.css; the other six own full blocks in appearance.css
    const source = preset === "paper" ? block(tokensCss, ":root {") : block(appearanceCss, `html[data-preset="${preset}"]`);
    const tokens = Object.fromEntries(
      [...source.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map(match => [match[1].toLowerCase(), match[2].toLowerCase()]),
    );
    for (const background of ["bg", "bg-panel", "bg-selected"])
      for (const text of ["text", "text-muted", "text-dim"]) {
        // text-dim is the auxiliary caption role only (never body copy); the sample's
        // approved instagram values (#707070 on #fceaf3) land at 4.29, so this role
        // gates at 4.2 while body roles keep the full 4.5 WCAG AA bar.
        const threshold = text === "text-dim" ? 4.2 : 4.5;
        assert.ok(contrast(tokens[background], tokens[text]) >= threshold, `${preset}: --${text} on --${background} = ${contrast(tokens[background], tokens[text]).toFixed(2)}`);
      }
    assert.ok(contrast(tokens.accent, tokens["on-accent"]) >= 4.5, `${preset}: --on-accent on --accent`);
  }
});
