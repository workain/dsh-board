// The DSH ModuleLoader consumes client.js directly; no transpiler or bundler is
// needed for the plain-JavaScript template. This build is a fail-closed check,
// not a claim that generated Typert artifacts or browser integration exist.
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.slice(2);
if (mode.length && (mode.length !== 1 || mode[0] !== '--check')) {
  throw new Error('Usage: node scripts/build.mjs [--check]');
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (pkg.name !== 'dsh-board' || pkg.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('Unexpected package identity or bundle patch');
}
for (const file of ['index.js', 'core.mjs', 'service.mjs', 'sqlite-store.mjs', 'tracker-api.mjs', 'tracker-fetch.mjs', 'tracker-service.mjs', 'tracker-settings.mjs', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/ru.json']) {
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
for (const file of ['index.js', 'core.mjs', 'service.mjs', 'sqlite-store.mjs', 'tracker-api.mjs', 'tracker-fetch.mjs', 'tracker-service.mjs', 'tracker-settings.mjs', 'client.js']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const client = await readFile(resolve(root, 'client.js'), 'utf8');
if (!client.includes('__ModuleLoader__')) throw new Error('client.js must register with the DSH ModuleLoader');
console.log('Plain-JavaScript bundle validated; no generated RPC artifacts were produced.');
