import assert from 'node:assert/strict';
import test from 'node:test';
import { topDialogLayer } from './dialog-layer.ts';

test('a responsive drawer activated late cannot take keys from an open settings modal', () => {
  const drawer = { name: 'project files', depth: 250 };
  const settings = { name: 'coworker settings', depth: 760 };
  const editor = { name: 'memory editor', depth: 1000 };
  const level = layer => layer.depth;
  assert.equal(topDialogLayer([settings, drawer], level), settings);
  assert.equal(topDialogLayer([drawer, settings, editor], level), editor);
  assert.equal(topDialogLayer([drawer, settings], level), settings);
  assert.equal(topDialogLayer([drawer], level), drawer);
  assert.equal(topDialogLayer([], level), undefined);
  const nextEditor = { name: 'provider chooser', depth: 1000 };
  assert.equal(topDialogLayer([editor, nextEditor], level), nextEditor);
});
