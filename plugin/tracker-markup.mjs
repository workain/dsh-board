// A deliberately small, pure, non-DOM parser for untrusted Tracker content.
// Consumers MUST render text as text nodes, never as HTML. See parseTrackerMarkup.
export const TRACKER_MARKUP_LIMITS = Object.freeze({ input: 200_000, nodes: 8_000, depth: 24, work: 1_000_000 });

const LIMIT = Symbol('limit');
const text = value => ({ type: 'text', value });
const element = (type, children = [], extra = {}) => ({ type, ...extra, children });
const fallback = value => ({ type: 'root', children: value ? [text(value)] : [] });
const allowed = new Set(['p', 'div', 'br', 'ul', 'ol', 'li', 'b', 'strong', 'em', 'i', 'code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const dangerous = new Set(['script', 'style', 'iframe', 'svg', 'math', 'img', 'object', 'embed', 'video', 'audio', 'source', 'link', 'meta', 'base', 'form', 'input', 'template', 'noscript', 'canvas', 'head']);
const voidTags = new Set(['img', 'source', 'link', 'meta', 'base', 'input', 'embed', 'br']);
const entities = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' });

function decodeEntities(value) {
  // Bound each candidate to avoid rescanning a long run after repeated '&'.
  return value.replace(/&(#(?:x[0-9a-f]{1,8}|[0-9]{1,10})|[a-z][a-z0-9]{1,31});/gi, (whole, entity) => {
    if (entity[0] !== '#') return Object.hasOwn(entities, entity.toLowerCase()) ? entities[entity.toLowerCase()] : whole;
    const hex = entity[1]?.toLowerCase() === 'x';
    const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
  });
}

// No relative, protocol-relative, backslash, whitespace/control, credentials or
// encoded protocol/host. URL canonicalization is only applied after strict checks.
export function safeTrackerHref(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f-\u009f\\]/u.test(value) || !/^https?:\/\//i.test(value)) return null;
  const authority = /^https?:\/\/([^/?#]*)/i.exec(value)?.[1];
  if (!authority || authority.includes('%')) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function context() {
  let count = 0, work = 0;
  return {
    // Charge the entire potentially scanned region *before* invoking indexOf or
    // a regex on it. An attacker cannot force repeated unbounded lookaheads.
    scan(size) { work += size; if (work > TRACKER_MARKUP_LIMITS.work) throw LIMIT; },
    add(type, children, extra) { if (++count > TRACKER_MARKUP_LIMITS.nodes) throw LIMIT; return element(type, children, extra); },
    text(value) { if (++count > TRACKER_MARKUP_LIMITS.nodes) throw LIMIT; return text(value); },
  };
}
function pushText(out, value, ctx) {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.value += value;
  else out.push(ctx.text(value));
}

// Balanced minimal inline syntax. Ambiguous or incomplete syntax stays literal.
function inline(s, ctx, depth = 0) {
  if (depth >= TRACKER_MARKUP_LIMITS.depth) throw LIMIT;
  const out = [];
  let i = 0;
  ctx.scan(s.length);
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && /[\\`*_[\]()!]/.test(s[i + 1])) { pushText(out, s[i + 1], ctx); i += 2; continue; }
    if (s[i] === '\n') { out.push(ctx.add('br', [])); i++; continue; }
    if (s[i] === '`') {
      ctx.scan(s.length - i);
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) { out.push(ctx.add('code', [ctx.text(s.slice(i + 1, end))])); i = end + 1; continue; }
    }
    // Images are always literal: neither a link nor an image element.
    if (s.startsWith('![', i)) {
      ctx.scan(s.length - i);
      const match = /^!\[[^\]\n]*\]\([^\n)]*\)/.exec(s.slice(i));
      if (match) { pushText(out, match[0], ctx); i += match[0].length; continue; }
      pushText(out, '![', ctx); i += 2; continue;
    }
    if (s[i] === '[') {
      ctx.scan(s.length - i);
      const match = /^\[([^\]\n]+)\]\(([^\s()]+)\)/.exec(s.slice(i));
      if (match) {
        const href = safeTrackerHref(match[2]);
        if (href) out.push(ctx.add('a', inline(match[1], ctx, depth + 1), { href }));
        else pushText(out, match[0], ctx);
        i += match[0].length; continue;
      }
    }
    const marker = s.startsWith('**', i) ? '**' : s.startsWith('__', i) ? '__' : s[i] === '*' ? '*' : s[i] === '_' ? '_' : null;
    if (marker && !(marker[0] === '_' && i > 0 && /[\p{L}\p{N}_]/u.test(s[i - 1]))) {
      ctx.scan(s.length - i);
      const end = s.indexOf(marker, i + marker.length);
      if (end > i + marker.length && !/\s/.test(s[i + marker.length]) && !/\s/.test(s[end - 1]) && !(marker[0] === '_' && /[\p{L}\p{N}_]/u.test(s[end + marker.length] || ''))) {
        out.push(ctx.add(marker.length === 2 ? 'strong' : 'em', inline(s.slice(i + marker.length, end), ctx, depth + 1)));
        i = end + marker.length; continue;
      }
    }
    pushText(out, s[i], ctx); i++;
  }
  return out;
}

function markdown(source, ctx) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  ctx.scan(source.length * 4);
  const blocks = [];
  // Unsupported YFM directives delimit constructs we cannot safely interpret.
  // Keep the whole source verbatim instead of rendering their bodies as Markdown.
  if (lines.some(line => /^[ \t]*\{%/.test(line) || /^[ \t]+(?:[-+*]|\d+[.)])[ \t]+/.test(line))) return { type: 'root', children: [ctx.add('p', [ctx.text(source)])] };
  let i = 0;
  const heading = line => /^(#{1,6})[ \t]+(.+)$/.exec(line);
  const item = line => /^([-+*]|\d+[.)])[ \t]+(.+)$/.exec(line);
  const fence = line => /^ {0,3}```[ \t]*([a-zA-Z0-9_-]*)[ \t]*$/.exec(line);
  const special = line => !!(heading(line) || item(line) || fence(line));
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const f = fence(lines[i]);
    if (f) {
      let end = i + 1;
      while (end < lines.length && !/^ {0,3}```[ \t]*$/.test(lines[end])) end++;
      if (end < lines.length) {
        blocks.push(ctx.add('pre', [ctx.add('code', [ctx.text(lines.slice(i + 1, end).join('\n'))])])); i = end + 1; continue;
      }
      // Preserve unclosed fences including their subsequent lines verbatim.
      blocks.push(ctx.add('p', [ctx.text(lines.slice(i).join('\n'))])); break;
    }
    const h = heading(lines[i]);
    if (h) { blocks.push(ctx.add(`h${h[1].length}`, inline(h[2], ctx))); i++; continue; }
    const first = item(lines[i]);
    if (first) {
      const ordered = /^\d/.test(first[1]);
      const items = [];
      while (i < lines.length) {
        const m = item(lines[i]);
        if (!m || /^\d/.test(m[1]) !== ordered) break;
        items.push(ctx.add('li', inline(m[2], ctx))); i++;
      }
      blocks.push(ctx.add(ordered ? 'ol' : 'ul', items)); continue;
    }
    const para = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !special(lines[i])) para.push(lines[i++]);
    blocks.push(ctx.add('p', inline(para.join('\n'), ctx)));
  }
  return { type: 'root', children: blocks };
}

// Tokenize attributes, rejecting malformed syntax and duplicate href. Nothing but
// a validated href is emitted; event handlers, styles, src etc. are ignored.
function attributes(s, ctx) {
  let i = 0, href = null, alt = null, seenHref = false, seenAlt = false;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i === s.length) break;
    ctx.scan(s.length - i);
    const name = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*/.exec(s.slice(i));
    if (!name) return null;
    i += name[0].length;
    while (i < s.length && /\s/.test(s[i])) i++;
    let value = '';
    if (s[i] === '=') {
      i++; while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '"' || s[i] === "'") {
        const quote = s[i++];
        ctx.scan(s.length - i);
        const end = s.indexOf(quote, i);
        if (end < 0) return null;
        value = s.slice(i, end); i = end + 1;
      } else {
        ctx.scan(s.length - i);
        const m = /^[^\s"'`=<>]+/.exec(s.slice(i));
        if (!m) return null;
        value = m[0]; i += value.length;
      }
    }
    const lower = name[0].toLowerCase();
    if (lower === 'href') {
      if (seenHref) return null;
      seenHref = true; href = decodeEntities(value);
    }
    if (lower === 'alt') {
      if (seenAlt) return null;
      seenAlt = true; alt = decodeEntities(value);
    }
  }
  return { href, alt };
}

function html(source, ctx) {
  const root = { type: 'root', children: [] }, stack = [{ name: '', node: root }];
  ctx.scan(source.length * 4);
  let i = 0, skipped = null, skipDepth = 0;
  const current = () => stack[stack.length - 1].node.children;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4); if (end < 0) return null;
      i = end + 3; continue;
    }
    if (source[i] !== '<') {
      let end = source.indexOf('<', i); if (end < 0) end = source.length;
      if (!skipped) pushText(current(), decodeEntities(source.slice(i, end)), ctx);
      i = end; continue;
    }
    // Find the next > without interpreting quoted attribute values.
    let end = i + 1, quote = null;
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
      else if (c === '<') return null;
    }
    if (end === source.length || quote) return null;
    const raw = source.slice(i + 1, end);
    i = end + 1;
    if (/^!doctype\s+html\s*$/i.test(raw)) continue;
    const token = /^(\/)?([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*)$/.exec(raw);
    if (!token) return null;
    const closing = !!token[1], name = token[2].toLowerCase();
    let rest = token[3], selfClosing = false;
    if (closing && rest.trim()) return null;
    if (!closing && rest.trimEnd().endsWith('/')) { selfClosing = true; rest = rest.trimEnd().slice(0, -1); }
    if (!closing && rest && !/^\s/.test(rest)) return null;
    const attrs = closing ? null : attributes(rest, ctx);
    if (!closing && !attrs) return null;
    if (skipped) {
      if (name === skipped && !voidTags.has(name)) {
        if (closing) { if (--skipDepth === 0) skipped = null; }
        else if (!selfClosing) skipDepth++;
      }
      continue;
    }
    if (dangerous.has(name)) {
      if (name === 'img' && !closing && attrs.alt) pushText(current(), attrs.alt, ctx);
      if (!closing && !voidTags.has(name) && !selfClosing) { skipped = name; skipDepth = 1; }
      continue;
    }
    if (name === 'html' || name === 'body') continue;
    if (!allowed.has(name)) {
      // Unknown syntax remains visible, never interpreted as HTML.
      pushText(current(), source.slice(i - raw.length - 2, i), ctx); continue;
    }
    if (closing) {
      if (name === 'br' || stack.length === 1 || stack[stack.length - 1].name !== name) return null;
      stack.pop(); continue;
    }
    if (stack.length >= TRACKER_MARKUP_LIMITS.depth) throw LIMIT;
    const href = name === 'a' ? safeTrackerHref(attrs.href) : null;
    // A rejected link becomes a span-like div-less node, not an active link.
    const type = name === 'a' && !href ? 'span' : name === 'b' ? 'strong' : name === 'i' ? 'em' : name;
    const node = ctx.add(type, [], href ? { href } : {});
    current().push(node);
    if (name !== 'br' && !selfClosing) stack.push({ name, node });
  }
  if (stack.length !== 1 || skipped) return null;
  return root;
}

/**
 * parseTrackerMarkup(string) -> {type:'root', children:[node,...]}.
 * Nodes are {type:'text', value:string}, or {type, children}, with an optional
 * href ONLY on type 'a'. Element types: p, div, span, br, ul, ol, li, strong,
 * em, code, pre, h1..h6, a. For 'a' the caller MUST set target='_blank' and
 * rel='noopener noreferrer'. Do not spread AST fields into DOM props; map the
 * allowlisted types explicitly and render text as React children, never innerHTML.
 * No image nodes, fetching, DOM APIs, effects, or markup execution occur here.
 * Input over 200k UTF-16 code units is truncated with a visible marker. Excessive
 * nodes/depth/work and malformed legacy HTML fall back to literal, safely rendered
 * text. The conservative work budget may also fall back on long valid constructs.
 * This is a conservative YFM/Markdown subset, not a CommonMark or HTML parser.
 */
export function parseTrackerMarkup(input) {
  if (typeof input !== 'string') return fallback('');
  const source = input.length > TRACKER_MARKUP_LIMITS.input ? input.slice(0, TRACKER_MARKUP_LIMITS.input) + '\n[… truncated …]' : input;
  // Legacy wrapper is recognized only around the whole content. Parsing failure
  // shows the original literal rather than guessing browser error recovery.
  const trimmed = source.trim();
  const wrapper = trimmed.startsWith('<#') && trimmed.endsWith('#>') ? trimmed.slice(2, -2) : null;
  try {
    const ctx = context();
    return wrapper !== null && /^\s*(?:<!doctype\s+html\s*>\s*)?<html(?:\s|>)/i.test(wrapper) ? (html(wrapper, ctx) || fallback(source)) : markdown(source, ctx);
  } catch (error) {
    if (error === LIMIT) return fallback(source);
    throw error;
  }
}
