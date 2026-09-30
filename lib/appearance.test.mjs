import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_APPEARANCE, PALETTES, parseAppearance, readAppearance, applyAppearance } from "./appearance.ts";

test("appearance restores independent choices, recovers corrupt storage and leaves execution values out", () => {
  for (const palette of PALETTES) for (const material of ["paper", "glass"]) {
    const value = { version:1, palette, material, motion:"reduced", background:false, opaque:true, model:"not-an-appearance-field" };
    assert.deepEqual(parseAppearance(JSON.stringify(value)), { palette, material, motion:"reduced", background:false, opaque:true });
  }
  for (const value of [null, "broken", "[]", '{"version":2}', "true"]) assert.deepEqual(parseAppearance(value), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('{"version":1,"palette":"missing","background":"false"}'), DEFAULT_APPEARANCE);
  assert.deepEqual(readAppearance({ getItem() { throw new Error("storage denied"); } }), DEFAULT_APPEARANCE);
  const root = { dataset:{} };
  applyAppearance(root, { ...DEFAULT_APPEARANCE, material:"glass", palette:"rose", opaque:true });
  assert.equal(root.dataset.material, "glass");
  assert.equal(root.dataset.palette, "rose");
  assert.equal(root.dataset.transparency, "opaque");
});

const luminance = hex => {
  const rgb = hex.replace("#", "").match(/../g).map(byte => parseInt(byte, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (a,b) => (Math.max(luminance(a),luminance(b)) + .05) / (Math.min(luminance(a),luminance(b)) + .05);
test("every palette keeps readable content and primary actions in both modes", () => {
  const css = readFileSync(new URL("../src/styles/appearance.css", import.meta.url), "utf8");
  const base = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  for (const palette of PALETTES) for (const dark of [false,true]) {
    const selector = palette === "classic" ? (dark ? "html.dark" : ":root") : `html${dark ? ".dark" : ""}[data-palette="${palette}"]`;
    const source = palette === "classic" ? base : css;
    const block = source.slice(source.indexOf(selector + " {")).split("}")[0];
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map(match => [match[1], match[2]]));
    for (const background of ["bg", "bg-panel", "bg-selected"]) for (const text of ["text", "text-muted", "text-dim"]) {
      assert.ok(contrast(tokens[background],tokens[text]) >= 4.5, `${palette}/${dark}/${background}/${text}`);
    }
    assert.ok(contrast(tokens.accent,tokens["on-accent"]) >= 4.5, `${palette}/${dark}/primary button`);
  }
});
