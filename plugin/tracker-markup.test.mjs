import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseTrackerMarkup as parse, safeTrackerHref, TRACKER_MARKUP_LIMITS as limits } from './tracker-markup.mjs';

const walk = (node, fn) => { fn(node); for (const child of node.children || []) walk(child, fn); };
const strings = root => { let result = ''; walk(root, n => { if (n.type === 'text') result += n.value; if (n.type === 'br') result += '\n'; }); return result; };
const nodes = (root, type) => { const found = []; walk(root, n => { if (n.type === type) found.push(n); }); return found; };
const wrap = html => `<#<html><body>${html}</body></html>#>`;

test('common Markdown blocks and inline formatting form a restricted AST', () => {
  const root = parse('# Heading\n\nLine **bold** and *italic* and `code`\nsecond\n\n- one\n- two\n\n1. three\n2. four\n\n```js\nconst x = "<img>";\n```');
  for (const type of ['h1', 'p', 'strong', 'em', 'code', 'br', 'ul', 'ol', 'li', 'pre']) assert.ok(nodes(root, type).length, type);
  assert.match(strings(root), /Heading/);
  assert.match(strings(root), /const x = "<img>"/);
  assert.equal(nodes(root, 'img').length, 0);
});

test('only explicit HTTP(S) links are active, never Markdown images', () => {
  const root = parse('[ok](https://example.test/path?q=1) [no](javascript:alert) ![picture](https://example.test/i.png) [bad](data:text/html,x)');
  assert.equal(nodes(root, 'a').length, 1);
  assert.equal(nodes(root, 'a')[0].href, 'https://example.test/path?q=1');
  assert.match(strings(root), /!\[picture\]\(https:\/\/example\.test\/i\.png\)/);
  assert.match(strings(root), /\[no\]\(javascript:alert\)/);
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '//evil.test/x', 'https:\\evil.test', 'https://user:pass@example.test', 'https://example.test/\nfoo', 'https://example.test/\u0000', 'https%3a//example.test', ' https://example.test', 'https://']) assert.equal(safeTrackerHref(href), null, href);
  assert.equal(safeTrackerHref('HTTPS://EXAMPLE.TEST/path'), 'https://example.test/path');
});

test('legacy HTML subset decodes text and discards all attributes except vetted href', () => {
  const root = parse(wrap('<div onmouseover="alert(1)"><p>Hello &amp; &#x1f600;<br>second <b>bold</b> <em>em</em></p><ul><li>One</li><li>Two</li></ul><a href="https://example.test/?a=1&amp;b=2" onclick="evil()">link</a></div>'));
  assert.equal(nodes(root, 'a')[0].href, 'https://example.test/?a=1&b=2');
  assert.match(strings(root), /Hello & 😀\nsecond bold em/);
  assert.equal(nodes(root, 'li').length, 2);
  walk(root, n => { assert.deepEqual(Object.keys(n).sort(), (n.type === 'text' ? ['type', 'value'] : n.type === 'a' ? ['children', 'href', 'type'] : ['children', 'type']).sort()); });
});

test('unsafe elements and their contents never become executable or fetched nodes', () => {
  const root = parse(wrap('<head><title>private head</title><script>head script</script></head><p>before<img src=x onerror="alert(1)">after</p><script>alert(1)</script><style>secret</style><iframe><p>hidden</p></iframe><svg><script>nested</script></svg><math><mi>bad</mi></math><p>end</p><!-- comment -->'));
  assert.equal(strings(root), 'beforeafterend');
  for (const type of ['img', 'script', 'style', 'iframe', 'svg', 'math']) assert.equal(nodes(root, type).length, 0);
});

test('URL obfuscation, malformed or duplicate attributes cannot create unsafe links', () => {
  for (const href of ['javascript:alert(1)', 'jav&#x61;script:alert(1)', '&#x6a;avascript:evil', 'java&#10;script:evil', 'https://good.test&#10;@evil.test', 'data:text/html,x', '//evil.test', 'https://good.test\\@evil.test']) {
    const root = parse(wrap(`<a href="${href}">label</a>`));
    assert.equal(nodes(root, 'a').length, 0, href);
    assert.match(strings(root), /label/);
  }
  const duplicate = wrap('<a href="https://good.test" href="javascript:evil">label</a>');
  assert.equal(strings(parse(duplicate)), duplicate);
});

test('malformed or ambiguous legacy markup falls back to visible literal text', () => {
  for (const content of ['<p>hello</div>', '<p title="unterminated>hello</p>', '<p>hello', '<!-- unfinished', '<p><b>x</p></b>']) {
    const source = wrap(content);
    assert.equal(strings(parse(source)), source);
    assert.equal(nodes(parse(source), 'a').length, 0);
  }
});

test('unknown tags and YFM directives remain visible as inert text', () => {
  const root = parse(wrap('<p>Hello <custom data-x="1">there</custom></p>'));
  assert.match(strings(root), /<custom data-x="1">there<\/custom>/);
  const yfm = '{% cut "Details" %}\n**keep raw**\n{% endcut %}';
  assert.equal(strings(parse(yfm)), yfm);
  assert.equal(nodes(parse(yfm), 'strong').length, 0);
  const unclosed = '```js\nconst x = 1';
  assert.equal(strings(parse(unclosed)), unclosed);
});

test('limits cap input, AST nodes and nesting safely', () => {
  const large = parse('x'.repeat(limits.input + 100));
  assert.match(strings(large), /\[… truncated …\]$/);
  assert.ok(strings(large).length < limits.input + 100);
  const deep = wrap('<div>'.repeat(limits.depth + 5) + 'inside' + '</div>'.repeat(limits.depth + 5));
  assert.equal(strings(parse(deep)), deep);
  const many = Array(10000).fill('<br>').join('');
  const source = wrap(many);
  const fallback = parse(source);
  assert.equal(strings(fallback), source);
  assert.equal(fallback.children.length, 1);
});

test('literal identifiers, nested lists, image alternatives and encoded hosts', () => {
  const identifier = parse('my_file_name and _emphasis_');
  assert.equal(strings(identifier), 'my_file_name and emphasis');
  assert.equal(nodes(identifier, 'em').length, 1);
  const list = '- parent\n  - nested\n- sibling';
  assert.equal(strings(parse(list)), list);
  assert.equal(nodes(parse(list), 'ul').length, 0);
  const html = parse(wrap('<h1>Title</h1><p>before<img alt="Diagram &amp; chart" src="https://example.test/img">after</p>'));
  assert.equal(nodes(html, 'h1').length, 1);
  assert.equal(nodes(html, 'img').length, 0);
  assert.equal(strings(html), 'TitlebeforeDiagram & chartafter');
  assert.equal(safeTrackerHref('https://%65xample.test/path'), null);
  assert.equal(safeTrackerHref('https://example.test/%65'), 'https://example.test/%65');
});

test('adversarial repeated lookaheads fall back within a hard work budget', () => {
  // Each input exceeds the work budget after at most a few long lookaheads;
  // literal fallback is deterministic and does not rely on timing assertions.
  for (const source of [
    '['.repeat(100_000), '!['.repeat(50_000), '_ '.repeat(50_000),
    wrap('<div ' + 'x '.repeat(45_000) + '>inside</div>'),
  ]) assert.equal(strings(parse(source)), source);
  // A child deadline additionally catches accidental removal of the budget,
  // without a tight runtime threshold on slow or contended CI hosts.
  const module = new URL('./tracker-markup.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {parseTrackerMarkup as p} from ${JSON.stringify(module)}; for (const s of ['['.repeat(200000), '!['.repeat(100000), '  '.repeat(100000), '<#<html><body><div '+ 'a '.repeat(90000) + '></div></body></html>#>']) p(s);`], { timeout: 8000, encoding: 'utf8' });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});

test('binary controls and unknown entities are text, not markup', () => {
  const root = parse(wrap('<p>\0&#0; &#xD800; &bogus; &lt;img src=x onerror=evil&gt;</p>'));
  assert.equal(strings(root), '\0� � &bogus; <img src=x onerror=evil>');
  assert.equal(nodes(root, 'img').length, 0);
  assert.equal(strings(parse(null)), '');
});
