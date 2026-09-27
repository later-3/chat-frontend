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

test('localized history changes only reader controls and preserves session source content', async () => {
  const { runInNewContext } = await import('node:vm');
  const { historyLocaleScript } = await import('./history-locale.ts');
  const payload = Buffer.from(JSON.stringify({ entries: [{ id: 'branch', message: { role: 'user', content: 'Session: user Thinking ... 中文正文' } }] })).toString('base64');
  const html = `<html lang="en"><head></head><body><script id="session-data" type="application/json">${payload}</script><script>renderTree()</script></body></html>`;
  for (const locale of ['en', 'zh-CN']) {
    const styled = styleHistoryDocument(html, '', locale);
    assert.ok(styled.includes(payload));
    assert.ok(styled.includes('<script>renderTree()</script>'));
    const values = new Map();
    const element = selector => { if (!values.has(selector)) values.set(selector, { textContent: '', attributes: {}, getAttribute(name) { return this.attributes[name]; }, setAttribute(name, value) { this.attributes[name] = value; } }); return values.get(selector); };
    let observeAgain;
    const document = {
      documentElement: {},
      getElementById: () => null,
      querySelectorAll(selector) {
        assert.ok(!selector.includes('.markdown-content') && !selector.includes('.thinking-text'), 'content is never translated');
        return [element(selector)];
      },
    };
    const script = historyLocaleScript(locale).replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    runInNewContext(script, { document, MutationObserver: class { constructor(callback) { observeAgain = callback; } observe() {} disconnect() {} } });
    assert.equal(document.documentElement.lang, locale);
    const all = element('.sidebar-filters [data-filter="all"]');
    assert.equal(all.textContent, locale === 'zh-CN' ? '全部' : 'All');
    all.textContent = 'All';
    observeAgain();
    assert.equal(all.textContent, locale === 'zh-CN' ? '全部' : 'All', 'Pi rerenders retain selected language');
  }
});
