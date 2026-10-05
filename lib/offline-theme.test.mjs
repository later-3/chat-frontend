import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { readStyleSheetSources } from './style-sources.ts';
const html = await readFile(new URL('../public/offline.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
test('offline shell respects saved theme and follows the system when storage is unavailable', () => {
  for (const [preference, systemDark, expected] of [['light', true, 'light'], ['dark', false, 'dark'], ['auto', true, 'dark'], [null, false, 'light']]) {
    const root = { dataset: {} };
    const meta = {};
    runInNewContext(script, { document: { documentElement: root, querySelector: () => meta }, localStorage: { getItem: () => preference }, matchMedia: () => ({ matches: systemDark, addEventListener() {} }) });
    assert.equal(root.dataset.theme, expected);
  }
  const root = { dataset: {} };
  const media = { matches: true, addEventListener(_type, callback) { this.change = callback; } };
  runInNewContext(script, { document: { documentElement: root, querySelector: () => ({}) }, localStorage: { getItem() { throw Error('denied'); } }, matchMedia: () => media });
  assert.equal(root.dataset.theme, 'dark');
  media.matches = false;
  media.change();
  assert.equal(root.dataset.theme, 'light');
});

test('offline theme colors use the application palette for both appearances', async () => {
  const sources = await readStyleSheetSources();
  // light comes from the paper :root baseline, dark from the graphite preset block
  for (const color of ['#FAF9F7','#6551B8','#232327','#c5b7f0']) {
    assert.ok(html.includes(color), color);
    assert.ok(sources.some(source => source.includes(color)), color);
  }
});
