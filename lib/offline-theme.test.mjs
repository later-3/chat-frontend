import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
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
