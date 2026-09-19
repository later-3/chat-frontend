import assert from 'node:assert/strict';
import test from 'node:test';
import { styleHistoryDocument } from './history-document.ts';

test('history presentation preserves Pi data, branches and scripts while adding Chat theme', () => {
  const html = '<!DOCTYPE html><html><head><style>body{color:red}</style></head><body><script id="session-data" type="application/json">{"entries":[{"id":"branch"}]}</script><script>renderTree()</script></body></html>';
  const styled = styleHistoryDocument(html, 'body{color:blue}');
  assert.equal(styled.replace('<style id="chat-history-theme">body{color:blue}</style>', ''), html);
  assert.throws(() => styleHistoryDocument('<html><head></head><body>Gateway error</body></html>', ''), /无效/);
  assert.throws(() => styleHistoryDocument('{"error":"unavailable"}', ''), /无效/);
});
