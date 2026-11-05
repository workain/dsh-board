// The DSH ModuleLoader consumes client.js directly; no transpiler or bundler is
// needed for the plain-JavaScript template. This build is a fail-closed check,
// not a claim that generated Typert artifacts or browser integration exist.
import { readFile, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.slice(2);
if (mode.length && (mode.length !== 1 || !['--check', '--write'].includes(mode[0]))) {
  throw new Error('Usage: node scripts/build.mjs [--check|--write]');
}
const write = mode[0] === '--write';
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (pkg.name !== 'dsh-board' || pkg.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('Unexpected package identity or bundle patch');
}
for (const file of ['index.js', 'core.mjs', 'service.mjs', 'sqlite-store.mjs', 'tracker-api.mjs', 'tracker-fetch.mjs', 'tracker-service.mjs', 'tracker-tools.mjs', 'tracker-account.mjs', 'tracker-links.mjs', 'tracker-settings.mjs', 'tracker-markup.mjs', 'tracker-statuses.mjs', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/ru.json']) {
  try {
    await access(resolve(root, file));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing required bundle file: ${file}`, { cause: error });
    throw error;
  }
}
for (const locale of ['en', 'ru']) {
  const metadata = JSON.parse(await readFile(resolve(root, `locale/${locale}.json`), 'utf8'));
  if (!metadata.meta?.title || !metadata.meta?.description) throw new Error(`Missing ${locale} metadata`);
}
// These modules are deliberately standalone. Only the enumerated, line-start
// named declarations may be exported; reject imports and all other exports
// rather than silently generating a different or invalid client program.
const sources = [
  ['tracker-markup.mjs', ['TRACKER_MARKUP_LIMITS', 'safeTrackerHref', 'parseTrackerMarkup']],
  ['tracker-statuses.mjs', ['groupTrackerStatuses']],
];
const parts = [];
for (const [file, expectedExports] of sources) {
  const source = await readFile(resolve(root, file), 'utf8');
  if (/^\s*import\b/m.test(source) || /\bimport\s*\(/.test(source)) throw new Error(`${file} must not import dependencies`);
  const found = [];
  const body = source.replace(/^export (const|function) ([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    found.push(name);
    return `${kind} ${name}`;
  });
  if (/^\s*export\b/m.test(body) || found.length !== expectedExports.length || found.some((name, i) => name !== expectedExports[i])) {
    throw new Error(`${file} has unexpected exports`);
  }
  // Separate scopes prevent helper names from colliding across modules.
  const digest = createHash('sha256').update(source).digest('hex');
  parts.push(`  // ${file} sha256:${digest}\n  ...(() => {\n${body}\n    return { ${expectedExports.join(', ')} };\n  })(),`);
}
const begin = '/* BEGIN GENERATED TRACKER HELPERS */';
const end = '/* END GENERATED TRACKER HELPERS */';
const generated = `${begin}\nconst { parseTrackerMarkup, safeTrackerHref, groupTrackerStatuses } = {\n${parts.join('\n')}\n};\n${end}`;
const clientPath = resolve(root, 'client.js');
const client = await readFile(clientPath, 'utf8');
if (!client.includes('__ModuleLoader__')) throw new Error('client.js must register with the DSH ModuleLoader');
const start = client.indexOf(begin), finish = client.indexOf(end);
if (start < 0 || finish < start || client.indexOf(begin, start + begin.length) !== -1 || client.indexOf(end, finish + end.length) !== -1) {
  throw new Error('client.js must contain exactly one ordered pair of generated Tracker helper markers');
}
const actual = client.slice(start, finish + end.length);
const updated = client.slice(0, start) + generated + client.slice(finish + end.length);
if (!write && actual !== generated) throw new Error('Generated Tracker helpers are stale; run node scripts/build.mjs --write');
// Validate the prospective artifact before touching client.js. --write is an
// explicit maintenance operation, never an implicit side effect of npm build.
for (const file of ['index.js', 'core.mjs', 'service.mjs', 'sqlite-store.mjs', 'tracker-api.mjs', 'tracker-fetch.mjs', 'tracker-service.mjs', 'tracker-tools.mjs', 'tracker-account.mjs', 'tracker-links.mjs', 'tracker-settings.mjs', 'tracker-markup.mjs', 'tracker-statuses.mjs']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const clientCheck = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: updated, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
if (clientCheck.error) throw clientCheck.error;
if (clientCheck.status !== 0) process.exit(clientCheck.status ?? 1);
if (write && actual !== generated) {
  // Refuse to overwrite changes made while this process was validating.
  if (await readFile(clientPath, 'utf8') !== client) throw new Error('client.js changed during validation; retry --write');
  await writeFile(clientPath, updated);
  console.log('Generated Tracker helpers updated in client.js.');
}
console.log('Plain-JavaScript bundle validated; no generated RPC artifacts were produced.');
