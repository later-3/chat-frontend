import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { DEFAULT_LOCALE, resolveInitialLocale } from './i18n/preference.ts';
import { enLocale } from './i18n/messages/en.ts';
import { zhCNLocale } from './i18n/messages/zh-CN.ts';
import { formatInterfaceFeedback } from './i18n/feedback.ts';
import { formatRelativeTime } from './i18n/format.ts';

const placeholders = value => [...value.matchAll(/\{([\w.-]+)\}/g)].map(match => match[1]).sort();
test('English is the default; only an explicit persisted choice selects Chinese', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
  for (const stored of [null, undefined, '', 'en', 'invalid', 'zh-TW']) assert.equal(resolveInitialLocale(stored), 'en');
  assert.equal(resolveInitialLocale('zh-CN'), 'zh-CN');
  const provider = readFileSync(new URL('../hooks/useI18n.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(provider, /navigator\.languages?|resolveBrowserLocale/);
});

test('both language packs cover the same keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(enLocale.messages).sort(), Object.keys(zhCNLocale.messages).sort());
  for (const [key, en] of Object.entries(enLocale.messages)) {
    const zh = zhCNLocale.messages[key];
    assert.ok(en.trim() && zh.trim(), key);
    assert.doesNotMatch(en, /\p{Script=Han}/u, `${key} contains Chinese in English mode`);
    assert.deepEqual(placeholders(en), placeholders(zh), key);
  }
});

test('UI translation calls resolve in both languages and visible copy cannot bypass i18n', () => {
  // Identifiers, brands, measurement units and realistic input examples are deliberately unchanged.
  const literals = new Set(['A','T','Chat','web','v','pi','mermaid','t/s','s','tokens','OAuth','API','ID *','· v','provider-request-review','skills.sh ↗','skills.sh','pi.dev/packages']);
  const examples = new Set(['notes/topic.md','Asia/Shanghai','https://api.example.com/v1','128000','16384','0','npm:@scope/package','/path/to/agent.json']);
  for (const file of readdirSync(new URL('../components/', import.meta.url)).filter(file => file.endsWith('.tsx'))) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
    const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t','tr','translate'].includes(node.expression.text) && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        assert.ok(enLocale.messages[key] && zhCNLocale.messages[key], `${file}: missing ${key}`);
      }
      if (ts.isJsxText(node) && /[a-zA-Z\p{Script=Han}]/u.test(node.text.trim())) assert.ok(literals.has(node.text.trim()), `${file}: untranslated text ${node.text.trim()}`);
      if (ts.isJsxAttribute(node) && ['title','aria-label','label','description','placeholder'].includes(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
        const value = node.initializer.text;
        assert.ok(literals.has(value) || examples.has(value), `${file}: untranslated ${node.name.text}=${value}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(root);
  }
});

test('feedback switches languages without losing commands, identifiers or original diagnostics', () => {
  const source = '当前会话不支持 /foobar 命令，请改用界面操作或普通文字描述；输入已保留';
  const en = formatInterfaceFeedback(source, 'en');
  assert.match(en.summary, /\/foobar command is unavailable/);
  assert.doesNotMatch(en.summary, /\p{Script=Han}/u);
  assert.match(formatInterfaceFeedback(en.summary, 'zh-CN').summary, /不支持 \/foobar/);
  assert.equal(formatInterfaceFeedback('找不到长期 Agent：nexus-1', 'en').summary, 'Friend not found: nexus-1');
  assert.equal(formatInterfaceFeedback('长期 Agent Nexus已停用，请在同事设置中检查启用状态', 'en').summary, 'Nexus is disabled. Check its settings.');
  const diagnostic = '原始诊断 SQL_TEST original details';
  assert.equal(formatInterfaceFeedback(diagnostic, 'en').details, diagnostic);
  assert.doesNotMatch(formatInterfaceFeedback(diagnostic, 'en').summary, /\p{Script=Han}/u);
  assert.match(formatInterfaceFeedback('HTTP 403 denied', 'zh-CN').summary, /权限|授权/);
  assert.equal(formatInterfaceFeedback('执行已结束，历史同步失败：socket disconnected', 'en').details, '执行已结束，历史同步失败：socket disconnected');
});

test('relative dates follow the selected language', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  assert.equal(formatRelativeTime('2026-09-27T11:55:00Z', 'en', now), '5 minutes ago');
  assert.equal(formatRelativeTime('2026-09-27T11:55:00Z', 'zh-CN', now), '5分钟前');
});

test('offline shell shares English default and persisted Chinese preference without the application bundle', () => {
  const html = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][1][1];
  for (const stored of [null, 'en', 'zh-CN', 'invalid', 'blocked']) {
    const elements = {};
    const document = { documentElement: {}, getElementById: id => elements[id] ??= {} };
    runInNewContext(script, { document, window: { addEventListener() {} }, localStorage: { getItem() { if (stored === 'blocked') throw Error('denied'); return stored; } } });
    assert.equal(document.documentElement.lang, stored === 'zh-CN' ? 'zh-CN' : 'en');
    assert.equal(elements['offline-reconnect'].textContent, stored === 'zh-CN' ? '重新连接' : 'Reconnect');
  }
});

test('built-in workflow labels translate while user names, identifiers and execution metadata stay intact', async () => {
  const { translateWorkflowCopy } = await import('./i18n/workflow-copy.ts');
  const en = key => enLocale.messages[key];
  const zh = key => zhCNLocale.messages[key];
  assert.equal(translateWorkflowCopy('minimal-pi-coding-agent', '直接执行', en), 'Direct execution');
  assert.equal(translateWorkflowCopy('minimal-pi-coding-agent', 'Pi Coding Agent', zh), 'Pi 编程智能体');
  assert.equal(translateWorkflowCopy('minimal-pi-coding-agent', '我的直接执行', en), '我的直接执行');
  assert.equal(translateWorkflowCopy('custom-workflow', '直接执行', en), '直接执行');
  assert.equal(translateWorkflowCopy('minimal-pi-coding-agent', 'custom/model-id', zh), 'custom/model-id');
});
