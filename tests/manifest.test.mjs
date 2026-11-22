import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'deepseek-design-plugin');
const MAX_ICON_BYTES = 32 * 1024;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pngInfo(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', 'icon must have a PNG signature');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', 'icon must contain an IHDR chunk');
  return {
    bytes: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('plugin manifest exports a valid PNG icon', () => {
  const pkg = readJson(join(PLUGIN, 'package.json'));
  assert.equal(pkg.exports['./icon'], './icon.png');
  assert.equal(pkg.exports['./package.json'], './package.json');
  assert.ok(pkg.files.includes('icon.png'), 'icon.png must be included in the packed file list');
  assert.equal(pkg.files.includes('icon.svg'), false, 'the old SVG must not be in the packed file list');
  assert.equal(existsSync(join(PLUGIN, 'icon.svg')), false, 'the old SVG must be removed');

  const iconPath = join(PLUGIN, 'icon.png');
  assert.equal(existsSync(iconPath), true, 'icon.png is missing');
  const icon = pngInfo(iconPath);
  assert.equal(icon.width, 128);
  assert.equal(icon.height, 128);
  assert.ok(icon.bytes <= MAX_ICON_BYTES, `icon is ${icon.bytes} bytes; plugin limit is ${MAX_ICON_BYTES}`);

});

test('manifest keeps the Host bundle and Client registration intact', () => {
  const pkg = readJson(join(PLUGIN, 'package.json'));
  assert.equal(pkg.name, '@local/deepseek-design-workbench');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.client.immediately, true);
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-ui-tool',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-file-drag',
  ]);
  assert.equal(pkg.exports['.'], './index.js');
  assert.equal(pkg.exports['./client'], './client.js');
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json');
  const patch = readFileSync(join(PLUGIN, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /@local\/deepseek-design-workbench/);
});

test('manifest ships the export worker script in the packed file list', () => {
  const pkg = readJson(join(PLUGIN, 'package.json'));
  for (const file of ['index.js', 'export-worker.js', 'client.js', 'cordis.patch.yml', 'icon.png']) {
    assert.ok(pkg.files.includes(file), file + ' must be in the packed file list');
  }
  const workerPath = join(PLUGIN, 'export-worker.js');
  assert.equal(existsSync(workerPath), true, 'export-worker.js is missing');
  assert.ok(readFileSync(workerPath, 'utf8').length > 500, 'export-worker.js must not be a placeholder');
});

test('export worker is a self-contained, network-disabled classic worker', () => {
  const source = readFileSync(join(PLUGIN, 'export-worker.js'), 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m, 'the worker must not use ESM syntax');
  assert.doesNotMatch(source, /\brequire\s*\(/, 'the worker must not require modules');
  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b/, 'the worker must not touch the DOM');
  assert.match(source, /OffscreenCanvas/, 'the worker paints on an OffscreenCanvas');
  assert.match(source, /createImageBitmap\s*\(/, 'the worker returns ImageBitmap frames');
  assert.match(source, /new Function\s*\(/, 'the worker evaluates model code with new Function');
  assert.match(source, /function draw\(ctx, t, width, height\)/, 'the worker documents the required draw signature');
  assert.match(source, /frameCount = Math\.max\(1, Math\.round\(/, 'the worker derives its frame count from duration and fps');
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    assert.match(source, new RegExp(name), name + ' must be blocked in the worker');
  }
  assert.match(source, /type: 'frame'/, 'the worker posts frame messages');
  assert.match(source, /type: 'done'/, 'the worker posts a done message');
  assert.match(source, /type: 'error'/, 'the worker posts an error message');
});

test('plugin display metadata is localized and current', () => {
  const zh = readJson(join(PLUGIN, 'locale', 'zh.json')).meta;
  const en = readJson(join(PLUGIN, 'locale', 'en.json')).meta;
  assert.match(zh.title, /1\.0\.0/);
  assert.match(en.title, /1\.0\.0/);
  for (const [locale, meta] of Object.entries({ zh, en })) {
    assert.equal(typeof meta.title, 'string', `${locale} title`);
    assert.ok(meta.title.trim().length > 0, `${locale} title is empty`);
    assert.equal(typeof meta.description, 'string', `${locale} description`);
    assert.ok(meta.description.trim().length > 0, `${locale} description is empty`);
    assert.doesNotMatch(meta.description, /Liquid Glass/i, `${locale} still has stale Liquid Glass copy`);
  }
  const changelog = readFileSync(join(PLUGIN, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /^## 1\.0\.0 — /m, 'CHANGELOG must document the 1.0.0 release');
  assert.match(changelog, /Plugin version is `1\.0\.0`/);
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  assert.match(readme, /current release is 1\.0\.0/);
  assert.match(readme, /icon\.png/);
  assert.doesNotMatch(readme, /icon\.svg/);
  assert.doesNotMatch(readme, /Liquid Glass/i);
});
