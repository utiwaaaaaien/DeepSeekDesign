#!/usr/bin/env node
/**
 * DeepSeekDesign — release packaging.
 *
 * Verifies the plugin source (syntax + Node test suite), then builds a clean
 * release ZIP on the Desktop:
 *
 *   DeepSeekDesign V<version>/
 *     README.md
 *     RELEASE-VERIFICATION.md     (generated: environment, checks, checksums)
 *     deepseek-design-plugin/     (Host, Client, Worker, locale, docs, icon)
 *     tests/                      (Node test suite)
 *     scripts/                    (browser smoke test only)
 *
 * No npm dependencies. Run from anywhere:
 *   node scripts/package-release.mjs [--skip-tests] [--out <path.zip>]
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = join(ROOT, 'deepseek-design-plugin');
const DESKTOP = join(process.env.HOME ?? '', 'Desktop');

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const withUiSmoke = args.includes('--ui-smoke');
const outIndex = args.indexOf('--out');
const explicitOut = outIndex >= 0 ? args[outIndex + 1] : '';

const JUNK_NAMES = new Set(['.DS_Store', '.git', 'node_modules', 'review', 'release-tmp']);
const TEST_SCRIPTS = new Set(['browser-smoke.mjs', 'ui-smoke.mjs', 'package-release.mjs']);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return result;
}

function fail(message, detail) {
  console.error(`\n✗ ${message}`);
  if (detail) console.error(detail.trimEnd());
  process.exit(1);
}

function walk(dir, base = dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    if (JUNK_NAMES.has(name)) continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...walk(full, base));
    else if (stats.isFile()) files.push(relative(base, full).split('\\').join('/'));
  }
  return files;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

// Checksums must cover every shipped file — including review reports — so this
// walker does not apply the packaging junk filter.
function walkAll(dir, base = dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...walkAll(full, base));
    else if (stats.isFile()) files.push(relative(base, full).split('\\').join('/'));
  }
  return files;
}

// ---------------------------------------------------------------------------
// 1. Read and validate the manifest.
// ---------------------------------------------------------------------------
const manifestPath = join(PLUGIN_DIR, 'package.json');
if (!existsSync(manifestPath)) fail(`manifest missing: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = typeof manifest.version === 'string' ? manifest.version : '';
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version is not semver: ${JSON.stringify(version)}`);
const releaseDirName = `DeepSeekDesign V${version}`;
const outPath = explicitOut ? resolve(explicitOut) : join(DESKTOP, `${releaseDirName}.zip`);

for (const required of ['index.js', 'client.js', 'export-worker.js', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'icon.png', 'locale/zh.json', 'locale/en.json']) {
  if (!existsSync(join(PLUGIN_DIR, required))) fail(`plugin file missing: ${required}`);
}
const packed = Array.isArray(manifest.files) ? manifest.files : [];
for (const entry of packed) {
  if (entry.includes('*')) continue;
  if (!existsSync(join(PLUGIN_DIR, entry))) fail(`manifest "files" lists a missing file: ${entry}`);
}
for (const requiredPacked of ['index.js', 'export-worker.js', 'client.js']) {
  if (!packed.includes(requiredPacked)) fail(`manifest "files" does not ship ${requiredPacked}`);
}

// Locale metadata must advertise the same version as the manifest.
for (const locale of ['zh', 'en']) {
  const data = JSON.parse(readFileSync(join(PLUGIN_DIR, 'locale', `${locale}.json`), 'utf8'));
  const title = data?.meta?.title;
  if (typeof title !== 'string' || !title.includes(version)) {
    fail(`locale/${locale}.json meta.title "=${title}" does not mention ${version}`);
  }
}

// The root README and the plugin CHANGELOG must mention the shipped version.
const rootReadme = readFileSync(join(ROOT, 'README.md'), 'utf8');
if (!rootReadme.includes(version)) fail(`root README.md does not mention version ${version}`);
const changelog = readFileSync(join(PLUGIN_DIR, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## ${version}`)) fail(`CHANGELOG.md has no "## ${version}" section`);

// ---------------------------------------------------------------------------
// 2. Syntax-check every shipped JavaScript file.
// ---------------------------------------------------------------------------
const node = process.execPath;
const jsFiles = [
  ...walk(PLUGIN_DIR).filter((file) => file.endsWith('.js')).map((file) => ({ label: `deepseek-design-plugin/${file}`, full: join(PLUGIN_DIR, file) })),
  ...walk(join(ROOT, 'tests')).filter((file) => file.endsWith('.mjs')).map((file) => ({ label: `tests/${file}`, full: join(ROOT, 'tests', file) })),
  ...walk(join(ROOT, 'scripts')).filter((file) => file.endsWith('.mjs')).map((file) => ({ label: `scripts/${file}`, full: join(ROOT, 'scripts', file) })),
];
for (const { label, full } of jsFiles) {
  const check = run(node, ['--check', full]);
  if (check.status !== 0) fail(`syntax check failed: ${label}`, check.stderr);
}
console.log(`✓ syntax: ${jsFiles.length} JavaScript files parse`);

// ---------------------------------------------------------------------------
// 3. Run the Node test suite.
// ---------------------------------------------------------------------------
let testSummary = 'skipped (--skip-tests)';
let testCounts = null;
if (!skipTests) {
  const test = run(node, ['--test', 'tests/*.test.mjs']);
  const output = `${test.stdout ?? ''}${test.stderr ?? ''}`;
  const count = (label) => {
    const match = output.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'm'));
    return match === null ? null : Number(match[1]);
  };
  testCounts = { pass: count('pass'), fail: count('fail'), tests: count('tests') };
  if (test.status !== 0 || testCounts.fail !== 0) {
    fail('Node test suite failed', output.slice(-8000));
  }
  testSummary = `${testCounts.pass}/${testCounts.tests} tests passed, 0 failures`;
  console.log(`✓ tests: ${testSummary}`);
}

// ---------------------------------------------------------------------------
// 3b. Optional real-GUI UI smoke test (slow, needs the Harness app installed).
// ---------------------------------------------------------------------------
let uiSmokeSummary = 'not run (pass --ui-smoke to include the real-GUI UI smoke test)';
if (!skipTests && withUiSmoke && existsSync(join(ROOT, 'scripts', 'ui-smoke.mjs'))) {
  const smoke = run(node, ['scripts/ui-smoke.mjs']);
  const output = `${smoke.stdout ?? ''}${smoke.stderr ?? ''}`;
  const summary = output.match(/\[ui-smoke\] SUMMARY (.+)$/m);
  uiSmokeSummary = summary === null ? 'no summary line' : summary[1].trim();
  if (smoke.status !== 0) fail('real-GUI UI smoke test failed', output.slice(-6000));
  console.log(`✓ ui smoke: ${uiSmokeSummary}`);
}

// ---------------------------------------------------------------------------
// 4. Build a staging tree, then zip it.
// ---------------------------------------------------------------------------
const stagingRoot = mkdtempSync(join(tmpdir(), 'deepseek-design-release-'));
const stagingRelease = join(stagingRoot, releaseDirName);
try {
  mkdirSync(stagingRelease, { recursive: true });
  for (const name of ['README.md', 'README.en.md', 'LICENSE']) {
    cpSync(join(ROOT, name), join(stagingRelease, name));
  }
  cpSync(PLUGIN_DIR, join(stagingRelease, 'deepseek-design-plugin'), {
    recursive: true,
    filter: (source) => {
      const name = basename(source);
      if (JUNK_NAMES.has(name)) return false;
      if (source === join(PLUGIN_DIR, 'node_modules')) return false;
      return true;
    },
  });
  cpSync(join(ROOT, 'tests'), join(stagingRelease, 'tests'), {
    recursive: true,
    filter: (source) => !JUNK_NAMES.has(basename(source)),
  });
  mkdirSync(join(stagingRelease, 'scripts'), { recursive: true });
  for (const name of readdirSync(join(ROOT, 'scripts'))) {
    if (TEST_SCRIPTS.has(name)) cpSync(join(ROOT, 'scripts', name), join(stagingRelease, 'scripts', name));
  }

  // Checksums of every shipped file (paths relative to the release folder).
  const shipped = walkAll(stagingRelease).sort();
  const checksums = shipped.map((file) => `${sha256(join(stagingRelease, file))}  ${file}`);
  writeFileSync(join(stagingRelease, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);

  const releaseNotes = readFileSync(join(PLUGIN_DIR, 'CHANGELOG.md'), 'utf8');
  const sections = releaseNotes.split(/^## /m).slice(1);
  const latestNotes = (sections[0] ?? '').trim();
  const verification = [
    `# DeepSeekDesign ${version} — release verification`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Node: ${process.version}`,
    `Platform: ${process.platform} ${process.arch}`,
    '',
    '## Checks performed before packaging',
    '',
    '- Plugin manifest present, semver version consistent across `package.json`, `locale/*.json`, root `README.md`, and `CHANGELOG.md`.',
    '- Every file listed in `package.json` `files` exists; `index.js`, `client.js`, and `export-worker.js` are shipped.',
    `- Syntax: all ${jsFiles.length} shipped JavaScript files pass \`node --check\`.`,
    `- Test suite: ${testSummary}.`,
    '',
    '## Test suite',
    '',
    '```',
    `cd ${releaseDirName}`,
    'node --test tests/*.test.mjs',
    '```',
    '',
    '## Browser smoke tests',
    '',
    'The packaged `scripts/browser-smoke.mjs` exercises the real export worker in headless Chrome',
    '(worker protocol, frame transfer, pixel output, error and cancel paths):',
    '',
    '```',
    'node scripts/browser-smoke.mjs        # expected: 38 PASS / 0 FAIL',
    '```',
    '',
    'The packaged `scripts/ui-smoke.mjs` boots an isolated real DeepSeek Harness Web instance in',
    'headless Chrome and drives the real workbench UI (open, modal semantics/inert app, import, timeline',
    'drop, maximized preview, workspace-only Projects menu + minute-backup toggle + clear-backups action,',
    'marquee select/delete/undo, Escape handling, playback/WebAudio, export modal):',
    '',
    '```',
    'node scripts/ui-smoke.mjs             # expected: 24 PASS / 0 FAIL',
    '```',
    '',
    `UI smoke result for this build: ${uiSmokeSummary}.`,
    '',
    '## SHA-256',
    '',
    'Every file in this release is listed in `SHA256SUMS.txt`:',
    '',
    '```',
    'shasum -a 256 -c SHA256SUMS.txt',
    '```',
    '',
    '## Release notes',
    '',
    `See \`deepseek-design-plugin/CHANGELOG.md\` (latest section).`,
    '',
    ...latestNotes.trimEnd().split('\n'),
    '',
  ].join('\n');
  writeFileSync(join(stagingRelease, 'RELEASE-VERIFICATION.md'), `${verification}\n`);

  // Refresh checksums to include the generated verification file itself, but
  // never checksum SHA256SUMS.txt itself (a self-reference can never verify).
  const shippedFinal = walkAll(stagingRelease).sort().filter((file) => file !== 'SHA256SUMS.txt');
  writeFileSync(join(stagingRelease, 'SHA256SUMS.txt'),
    `${shippedFinal.map((file) => `${sha256(join(stagingRelease, file))}  ${file}`).join('\n')}\n`);

  rmSync(outPath, { force: true });
  mkdirSync(dirname(outPath), { recursive: true });
  const zip = run('/usr/bin/zip', ['-r', '-X', '-q', outPath, releaseDirName], { cwd: stagingRoot });
  if (zip.status !== 0) fail('zip command failed', zip.stderr);
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}

const zipSize = statSync(outPath).size;
console.log(`✓ packaged: ${outPath} (${(zipSize / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`  ${releaseDirName}/ contains plugin source, tests, README, CHANGELOG, and SHA256SUMS.txt`);
