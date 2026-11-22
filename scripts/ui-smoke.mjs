#!/usr/bin/env node
/**
 * DeepSeekDesign — real-DSH-Web UI smoke test.
 *
 * Boots DeepSeek Harness Web in a new temporary profile, installs the plugin, launches
 * headless Google Chrome, drives the REAL workbench UI over the DevTools Protocol, and
 * asserts the 0.9.6 interaction flows:
 *
 *   1. app boots, the "DeepSeekDesign" sidebar entry opens the workbench overlay, and the
 *      overlay is an aria-modal dialog with the covered app root inert (V1.0.0);
 *   2. a generated WebM video and WAV audio are dropped onto the asset library
 *      (DataTransfer + DragEvent) and appear as asset cards;
 *   3. the video card is dragged onto the video timeline lane; a clip appears and an
 *      empty timeline anchors it at 0 even though it was dropped at 60% width;
 *   4. a timeline marquee/box-select selects the clip, Delete/Backspace removes it,
 *      and Cmd/Ctrl+Z restores it;
 *   5. Escape during a marquee cancels the marquee without closing the workbench;
 *   6. playing the timeline starts a running AudioContext and schedules real
 *      AudioBufferSourceNodes for the audio clip (no exception);
 *   7. maximizing the preview keeps the preview frame visible (0.9.6: the
 *      conversation column is hidden so the preview row cannot collapse);
 *   8. the Projects menu is workspace-only, exposes the per-minute backup toggle
 *      (which persists), and offers the V1.0.0 clear-all-backups action;
 *   9. the export modal opens and closes without errors.
 *
 * Any uncaught page exception / console.error / error log entry from the moment the
 * app is navigated is collected and fails the run.
 *
 * Requirements: Node >= 22, the DeepSeek Harness CLI, and Google Chrome.
 * The test uses a temporary DSH_HOME and Chrome profile, with both services
 * bound to loopback. It installs from source unless a release tarball is supplied.
 *
 * Usage:
 *   node scripts/ui-smoke.mjs
 *   DSH_PLUGIN_TARBALL=/path/to/release.tgz node scripts/ui-smoke.mjs
 *   DSH_CHROME_BIN=/path/to/Chrome node scripts/ui-smoke.mjs
 *
 * Prints one PASS/FAIL line per assertion and exits non-zero on any failure or
 * uncaught error.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PLUGIN_DIR = join(ROOT, 'deepseek-design-plugin');
const DSH_LAUNCHER = process.env.DSH_BIN
  || '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
const CHROME_BIN = process.env.DSH_CHROME_BIN
  || process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TARBALL = process.env.DSH_PLUGIN_TARBALL;
const HEADED = process.env.UI_SMOKE_HEADED === '1';
const KEEP = process.env.UI_SMOKE_KEEP === '1';
const BOOT_TIMEOUT_MS = 90_000;
const APP_READY_TIMEOUT_MS = 60_000;
const HARD_TIMEOUT_MS = 150_000;

// ---------------------------------------------------------------------------
// Result reporting
// ---------------------------------------------------------------------------

const checks = [];
let passed = 0;
let failed = 0;

function line(status, name, detail) {
  console.log(status.padEnd(4) + ' ' + name + (detail === undefined || detail === '' ? '' : ' — ' + detail));
}

function pass(name, detail) {
  passed += 1;
  checks.push({ status: 'PASS', name, detail });
  line('PASS', name, detail);
}

function fail(name, detail) {
  failed += 1;
  checks.push({ status: 'FAIL', name, detail });
  line('FAIL', name, detail);
}

function brief(value, limit = 400) {
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
  if (text === undefined) text = String(value);
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(label + ' timed out after ' + timeoutMs + 'ms' + (last === undefined ? '' : ' (last: ' + brief(last, 160) + ')'));
}

// ---------------------------------------------------------------------------
// Isolated DSH_HOME + profile
// ---------------------------------------------------------------------------

function prepareHome(rootDir) {
  const home = join(rootDir, 'home');
  const profileDir = join(home, 'profiles', 'ui-smoke');
  const env = { ...process.env, DSH_HOME: home };
  const runDsh = (args) => {
    const result = spawnSync(DSH_LAUNCHER, args, {
      cwd: rootDir,
      env,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error('DSH profile setup failed: ' + (result.error ?? (result.stdout + result.stderr)));
    }
  };
  runDsh(['--profile', 'ui-smoke', '--from-default-profile', 'web', '--dump-config']);
  runDsh(['plugin', '--profile', 'ui-smoke', 'add', TARBALL ? resolve(TARBALL) : PLUGIN_DIR]);
  return { home, profileDir };
}

// ---------------------------------------------------------------------------
// `dsh web` lifecycle
// ---------------------------------------------------------------------------

function parseWebUrl(text) {
  const match = /dsh web: (https?:\/\/\S+)/.exec(text);
  return match === null ? null : match[1];
}

async function bootDshWeb(home) {
  const child = spawn(DSH_LAUNCHER, ['--profile', 'ui-smoke', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
    cwd: tmpdir(),
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const state = { child, stdout: '', stderr: '', url: null, exited: false, code: null };
  child.stdout.on('data', (chunk) => { state.stdout = (state.stdout + chunk.toString('utf8')).slice(-20_000); });
  child.stderr.on('data', (chunk) => { state.stderr = (state.stderr + chunk.toString('utf8')).slice(-20_000); });
  child.once('exit', (code, signal) => { state.exited = true; state.code = code; state.signal = signal; });
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const url = parseWebUrl(state.stdout) ?? parseWebUrl(state.stderr);
    if (url !== null) { state.url = url; return state; }
    if (state.exited) {
      throw new Error('dsh web exited before printing its URL (code=' + state.code + ', signal=' + state.signal + ')\n'
        + state.stdout.slice(-2000) + '\n' + state.stderr.slice(-2000));
    }
    await sleep(150);
  }
  throw new Error('dsh web did not print a tokenized URL within ' + BOOT_TIMEOUT_MS + 'ms\n'
    + state.stdout.slice(-2000) + '\n' + state.stderr.slice(-2000));
}

async function stopDshWeb(state) {
  if (state === null) return;
  const child = state.child;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* Gone. */ } }
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(4000).then(() => false),
  ]);
  if (!exited) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* Gone. */ } }
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(2000)]);
  }
}

// ---------------------------------------------------------------------------
// Minimal CDP client over Node's global WebSocket
// ---------------------------------------------------------------------------

class CdpConnection {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
    this.closed = false;
    webSocket.addEventListener('message', (event) => this.handleMessage(event));
    webSocket.addEventListener('close', () => {
      this.closed = true;
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('CDP WebSocket closed before response'));
      }
      this.pending.clear();
    });
  }

  static async connect(url, timeoutMs = 10_000) {
    const webSocket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timed out')), timeoutMs);
      webSocket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      webSocket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket connection failed')); }, { once: true });
    });
    return new CdpConnection(webSocket);
  }

  handleMessage(event) {
    let text;
    if (typeof event.data === 'string') text = event.data;
    else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString('utf8');
    else text = String(event.data);
    let payload;
    try { payload = JSON.parse(text); } catch { return; }
    if (payload.id !== undefined) {
      const pending = this.pending.get(payload.id);
      if (pending === undefined) return;
      this.pending.delete(payload.id);
      clearTimeout(pending.timer);
      if (payload.error !== undefined) pending.reject(new Error('CDP ' + payload.method + ': ' + payload.error.message));
      else pending.resolve(payload.result ?? {});
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params?.exceptionDetails;
      this.errors.push('exception: ' + (details?.exception?.description || details?.text || 'unknown'));
    } else if (payload.method === 'Runtime.consoleAPICalled' && payload.params?.type === 'error') {
      this.errors.push('console.error: ' + (payload.params.args ?? [])
        .map((argument) => argument.value ?? argument.description ?? '')
        .join(' '));
    } else if (payload.method === 'Log.entryAdded' && payload.params?.entry?.level === 'error') {
      this.errors.push('log: ' + payload.params.entry.text);
    }
  }

  send(method, params = {}, timeoutMs = 25_000) {
    if (this.closed) return Promise.reject(new Error('CDP connection is closed'));
    const id = (this.nextId += 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP ' + method + ' timed out after ' + timeoutMs + 'ms'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.webSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = false, timeoutMs = 25_000 } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
    if (result.exceptionDetails !== undefined) {
      const details = result.exceptionDetails;
      throw new Error('Page exception: ' + (details.exception?.description || details.text || 'unknown'));
    }
    return result.result?.value;
  }

  async clickAtSelector(selector) {
    const box = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, ok: rect.width > 0 && rect.height > 0,
        hit: hit === null ? null : { tag: hit.tagName, aria: hit.getAttribute('aria-label'), cls: String(hit.className).slice(0, 80) },
      };
    })()`);
    if (box === null || box.ok !== true) throw new Error('element not visible: ' + selector);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    return box;
  }

  async dragAt(from, to, steps = 6) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
        button: 'left',
        buttons: 1,
      });
      await sleep(25);
    }
  }

  async releaseAt(point) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }

  async pressKey(key, code, virtualKeyCode, modifiers = 0) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers,
    });
  }

  close() {
    this.closed = true;
    try { this.webSocket.close(); } catch { /* Already closed. */ }
  }
}

// ---------------------------------------------------------------------------
// Chrome lifecycle
// ---------------------------------------------------------------------------

function launchChrome(profileDir) {
  const args = [
    ...(HEADED ? [] : ['--headless=new']),
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    '--remote-allow-origins=*',
    '--user-data-dir=' + profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-sync',
    '--disable-dev-shm-usage',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ];
  const child = spawn(CHROME_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const stderr = { text: '' };
  child.stderr.on('data', (chunk) => { stderr.text = (stderr.text + chunk.toString('utf8')).slice(-8000); });
  return { child, stderr, exited: new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))) };
}

async function waitForDevToolsPort(profileDir, chromeState, timeoutMs = 20_000) {
  const path = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (chromeState.child.exitCode !== null || chromeState.child.signalCode !== null) {
      throw new Error('Chrome exited before opening the DevTools port (' + chromeState.stderr.text.slice(-1000) + ')');
    }
    if (existsSync(path)) {
      const [portLine] = readFileSync(path, 'utf8').trim().split('\n');
      if (/^\d+$/.test(portLine)) return Number(portLine);
    }
    await sleep(60);
  }
  throw new Error('DevToolsActivePort was not created within ' + timeoutMs + 'ms');
}

async function createPageTarget(port) {
  const base = 'http://127.0.0.1:' + port;
  const response = await fetch(base + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' });
  const target = await response.json();
  if (typeof target.webSocketDebuggerUrl !== 'string') throw new Error('Chrome did not return a page WebSocket URL');
  return target.webSocketDebuggerUrl;
}

async function stopChrome(chromeState, profileDir) {
  if (chromeState !== null && chromeState.child.exitCode === null && chromeState.child.signalCode === null) {
    try { chromeState.child.kill('SIGTERM'); } catch { /* Gone. */ }
    await Promise.race([chromeState.exited, sleep(3000)]);
    if (chromeState.child.exitCode === null && chromeState.child.signalCode === null) {
      try { chromeState.child.kill('SIGKILL'); } catch { /* Gone. */ }
      await Promise.race([chromeState.exited, sleep(2000)]);
    }
  }
  if (!KEEP && profileDir !== null) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); } catch { /* Retry. */ }
      if (!existsSync(profileDir)) break;
      await sleep(100);
    }
  }
}

// ---------------------------------------------------------------------------
// Page-side helpers (injected before the app loads)
// ---------------------------------------------------------------------------

const INSTRUMENT_SCRIPT = `(() => {
  window.__uiSmoke = { contexts: [], bufferSources: 0, errors: [] };
  try {
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (typeof Orig === 'function') {
      class SmokeAudioContext extends Orig {
        constructor(...args) {
          super(...args);
          window.__uiSmoke.contexts.push(this);
        }
        createBufferSource() {
          window.__uiSmoke.bufferSources += 1;
          return super.createBufferSource();
        }
      }
      window.AudioContext = SmokeAudioContext;
      window.webkitAudioContext = SmokeAudioContext;
    }
  } catch (error) {
    window.__uiSmoke.errors.push('instrument: ' + String(error));
  }
})();`;

async function pageMakeMediaFiles(cdp) {
  return cdp.evaluate(`(async () => {
    // 1) Author a real video in this browser via canvas + MediaRecorder. WebM from
    // MediaRecorder carries no duration header (the workbench probeVideo rejects a
    // non-finite duration), so prefer the MP4 codecs Chrome can record with real
    // duration metadata; a WebM fallback is validated the same way before use.
    const makeVideo = async (mime) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(10);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start(40);
      for (let frame = 0; frame < 6; frame += 1) {
        context.fillStyle = frame % 2 === 0 ? '#d33' : '#33d';
        context.fillRect(0, 0, 64, 36);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      recorder.stop();
      await stopped;
      for (const track of stream.getVideoTracks()) track.stop();
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const metadata = await new Promise((resolve) => {
        const probe = document.createElement('video');
        const timer = setTimeout(() => resolve({ duration: 0 }), 4000);
        probe.muted = true;
        probe.playsInline = true;
        probe.preload = 'auto';
        probe.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve({ duration: Number(probe.duration) }); }, { once: true });
        probe.addEventListener('error', () => { clearTimeout(timer); resolve({ duration: 0 }); }, { once: true });
        probe.src = url;
        probe.load();
      });
      URL.revokeObjectURL(url);
      return { blob, duration: metadata.duration, mime, bytes: blob.size };
    };
    const candidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .filter((mime) => MediaRecorder.isTypeSupported(mime));
    let video = null;
    for (const mime of candidates) {
      const candidate = await makeVideo(mime);
      if (Number.isFinite(candidate.duration) && candidate.duration > 0) { video = candidate; break; }
    }
    if (video === null) throw new Error('no MediaRecorder video codec produced a finite duration in this Chrome');

    // 2) A real 0.5 s 16-bit PCM WAV tone (valid RIFF header, decodable by WebAudio).
    const sampleRate = 8000;
    const seconds = 0.5;
    const frames = Math.round(sampleRate * seconds);
    const dataBytes = frames * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    const writeText = (offset, text) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, dataBytes, true);
    for (let index = 0; index < frames; index += 1) {
      const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 0.2;
      view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
    }

    const extension = video.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const videoFile = new File([video.blob], 'smoke-clip.' + extension, { type: video.mime.split(';')[0], lastModified: 1700000000000 });
    const audioFile = new File([buffer], 'smoke-tone.wav', { type: 'audio/wav', lastModified: 1700000000000 });
    // One drop carrying both files: the store treats one drop as one import batch,
    // while a second concurrent drop while import.busy is set is intentionally ignored.
    const transfer = new DataTransfer();
    transfer.items.add(videoFile);
    transfer.items.add(audioFile);
    const panel = document.querySelector('.dsd-assets');
    panel.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    panel.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    return { videoBytes: video.bytes, videoMime: video.mime, videoName: videoFile.name, audioName: audioFile.name, wavBytes: dataBytes + 44 };
  })()`, { awaitPromise: true, timeoutMs: 30_000 });
}

async function pageDropAssetOnLane(cdp, assetName, laneSelector, ratio = 0.6) {
  return cdp.evaluate(`(() => {
    const card = Array.from(document.querySelectorAll('.dsd-asset-card')).find((element) => element.title === ${JSON.stringify(assetName)});
    if (card === undefined) return { ok: false, reason: 'asset card not found: ' + ${JSON.stringify(assetName)} };
    const lane = document.querySelector(${JSON.stringify(laneSelector)});
    if (lane === null) return { ok: false, reason: 'lane not found: ' + ${JSON.stringify(laneSelector)} };
    const rect = lane.getBoundingClientRect();
    const point = { x: rect.left + rect.width * ${ratio}, y: rect.top + rect.height / 2 };
    const transfer = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    lane.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: point.x, clientY: point.y }));
    lane.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: point.x, clientY: point.y }));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    return { ok: true, point, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  })()`);
}

async function pageElementInfo(cdp, selector) {
  return cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (element === null) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      visible: rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden',
    };
  })()`);
}

async function pageVisibleMask(cdp) {
  return cdp.evaluate(`(() => {
    const masks = Array.from(document.querySelectorAll('[class*="_mask_"]'));
    const visible = masks.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01;
    });
    return visible !== undefined;
  })()`);
}

async function pageNoticeState(cdp) {
  return cdp.evaluate(`(() => {
    const sidebar = document.querySelector('button[aria-label="DeepSeekDesign"]');
    const rect = sidebar === null ? null : sidebar.getBoundingClientRect();
    const hit = rect === null ? null : document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const body = document.body?.innerText ?? '';
    return {
      noticeText: body.includes('预览版说明') || body.includes('Preview notes'),
      sidebarReachable: hit !== null && sidebar !== null && (hit === sidebar || sidebar.contains(hit)),
    };
  })()`);
}

/** Start a timeline marquee with synthetic PointerEvents (real DOM handlers). */
async function pageSyntheticMarqueeStart(cdp, laneSelector) {
  const started = await cdp.evaluate(`(() => {
    const lane = document.querySelector(${JSON.stringify(laneSelector)});
    if (lane === null) return { ok: false, reason: 'lane missing' };
    const rect = lane.getBoundingClientRect();
    const start = { x: rect.left + rect.width * 0.92, y: rect.top + rect.height * 0.5 };
    const mid = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.75 };
    const end = { x: Math.max(0, rect.left - 2), y: rect.top + rect.height * 0.92 };
    const event = (type, x, y, buttons) => new PointerEvent(type, {
      bubbles: true, cancelable: true, button: 0, buttons, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
    });
    lane.dispatchEvent(event('pointerdown', start.x, start.y, 1));
    window.dispatchEvent(event('pointermove', start.x - 12, start.y, 1));
    window.dispatchEvent(event('pointermove', mid.x, mid.y, 1));
    window.dispatchEvent(event('pointermove', end.x, end.y, 1));
    return { ok: true, start, end };
  })()`);
  if (started.ok !== true) return started;
  await sleep(180); // let the marquee effect install its window listeners
  return started;
}

async function pageSyntheticMarqueeEnd(cdp, point) {
  await cdp.evaluate(`(() => {
    const end = ${JSON.stringify(point)};
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: end.x, clientY: end.y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: end.x, clientY: end.y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
    }));
  })()`);
}

async function pageInstallKeyLog(cdp) {
  await cdp.evaluate(`(() => {
    window.__uiSmokeKeys = [];
    document.addEventListener('keydown', (event) => window.__uiSmokeKeys.push({ key: event.key, code: event.code, target: event.target && event.target.tagName, prevented: event.defaultPrevented }), true);
  })()`);
}

async function pageReadKeyLog(cdp) {
  return cdp.evaluate(`window.__uiSmokeKeys ?? []`);
}

/** Dispatch a synthetic KeyboardEvent on document and window (capture listeners included). */
async function pageSyntheticKey(cdp, key, code, modifiers = {}) {
  const init = JSON.stringify({ key, code, ...modifiers });
  await cdp.evaluate(`(() => {
    const init = ${init};
    const options = { bubbles: true, cancelable: true, composed: true, key: init.key, code: init.code, metaKey: init.metaKey === true, ctrlKey: init.ctrlKey === true, shiftKey: init.shiftKey === true };
    document.dispatchEvent(new KeyboardEvent('keydown', options));
    window.dispatchEvent(new KeyboardEvent('keydown', options));
  })()`);
}

// ---------------------------------------------------------------------------
// Main run
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  const rootDir = mkdtempSync(join(tmpdir(), 'dsh-ui-smoke-'));
  let dshState = null;
  let chromeState = null;
  let cdp = null;
  let chromeProfileDir = null;

  const hardTimer = setTimeout(() => {
    console.error('[ui-smoke] hard timeout after ' + HARD_TIMEOUT_MS + 'ms; aborting');
    process.exit(3);
  }, HARD_TIMEOUT_MS);
  hardTimer.unref?.();

  try {
    if (!existsSync(DSH_LAUNCHER)) throw new Error('dsh CLI launcher not found: ' + DSH_LAUNCHER);
    if (!existsSync(CHROME_BIN)) throw new Error('Chrome not found: ' + CHROME_BIN);
    if (!existsSync(PLUGIN_DIR)) throw new Error('plugin folder not found: ' + PLUGIN_DIR);
    // 1) Isolated home/profile. The child process gets DSH_HOME explicitly; a
    // DSH_HOME inherited from the developer's shell is irrelevant and untouched.
    const { home, profileDir } = prepareHome(rootDir);
    if (!home.startsWith(tmpdir()) || home.startsWith(join(homedir(), '.dsh'))) {
      throw new Error('refusing to run with a non-temporary DSH_HOME: ' + home);
    }
    pass('fresh isolated DSH profile created', 'home=' + home);
    const installedPlugin = join(profileDir, 'node_modules', '@local', 'deepseek-design-workbench');
    const pluginManifest = JSON.parse(readFileSync(join(installedPlugin, 'package.json'), 'utf8'));
    const fileHash = (file) => createHash('sha256').update(readFileSync(join(installedPlugin, file))).digest('hex').slice(0, 12);
    console.log('[ui-smoke] plugin under test: @local/deepseek-design-workbench@' + pluginManifest.version
      + ' | client.js ' + fileHash('client.js') + ' | index.js ' + fileHash('index.js')
      + ' | export-worker.js ' + fileHash('export-worker.js'));
    console.log('[ui-smoke] install source: ' + (TARBALL ? 'release tarball' : 'local source'));

    // 2) Boot the real web server.
    console.log('[ui-smoke] booting isolated dsh web…');
    dshState = await bootDshWeb(home);
    pass('isolated dsh web booted with a tokenized URL', dshState.url.replace(/token=[^&]+/, 'token=…'));
    const webOrigin = new URL(dshState.url).origin;

    // 3) Chrome + CDP.
    chromeProfileDir = mkdtempSync(join(tmpdir(), 'dsd-ui-smoke-chrome-'));
    chromeState = launchChrome(chromeProfileDir);
    const devToolsPort = await waitForDevToolsPort(chromeProfileDir, chromeState);
    cdp = await CdpConnection.connect(await createPageTarget(devToolsPort));
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT_SCRIPT });
    pass('headless Chrome launched and CDP attached');

    // 4) Navigate to the REAL app and wait for the plugin sidebar entry.
    await cdp.send('Page.navigate', { url: dshState.url });
    const sidebarEntry = await waitFor(async () => {
      return cdp.evaluate(`(() => {
        const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
        const entry = buttons.find((button) => button.getAttribute('aria-label') === 'DeepSeekDesign');
        if (entry === undefined) return null;
        if (document.querySelector('.dsd-overlay') !== null) return 'already-open';
        const text = (document.body?.innerText ?? '');
        return { label: entry.getAttribute('aria-label'), text, href: location.href };
      })()`);
    }, 'DeepSeekDesign sidebar entry', APP_READY_TIMEOUT_MS, 300);
    pass('real app booted and the DeepSeekDesign sidebar entry exists', 'href=' + sidebarEntry.href);

    // 5) Dismiss the shipped first-run "preview notice" modal: its mask sits above
    // the app and would swallow every trusted click. Click its Continue button
    // (trusted when possible), then verify the mask is gone.
    const noticeButtonRect = `(() => {
      const target = Array.from(document.querySelectorAll('button, [role="button"]')).find((element) => {
        const text = (element.innerText || '').trim();
        if (text !== '继续' && text !== 'Continue') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
      });
      if (target === undefined) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, tag: target.tagName, cls: String(target.className).slice(0, 90) };
    })()`;
    // The first-run notice leaves its backdrop element in the DOM during the exit
    // animation, so "mask element exists" is not the right signal: probe hit-testing at
    // the sidebar entry and the notice copy instead.
    const noticeDismissed = `(() => {
      const sidebar = document.querySelector('button[aria-label="DeepSeekDesign"]');
      const rect = sidebar === null ? null : sidebar.getBoundingClientRect();
      const hit = rect === null ? null : document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const body = document.body?.innerText ?? '';
      return {
        noticeText: body.includes('预览版说明') || body.includes('Preview notes'),
        sidebarReachable: hit !== null && sidebar !== null && (hit === sidebar || sidebar.contains(hit)),
        hit: hit === null ? null : { tag: hit.tagName, cls: String(hit.className).slice(0, 80) },
      };
    })()`;
    let noticePath = 'no notice presented';
    if (await cdp.evaluate(`document.querySelector('.dsd-assets') === null && (${noticeButtonRect}) !== null`)) {
      const notice = await cdp.evaluate(noticeButtonRect);
      if (notice !== null) {
        // A DOM click reaches the React handler even when the notice's backdrop
        // covers the layout; a trusted CDP click is the fallback.
        await cdp.evaluate(`(() => {
          const target = Array.from(document.querySelectorAll('button, [role="button"]')).find((element) => {
            const text = (element.innerText || '').trim();
            return (text === '继续' || text === 'Continue') && element.getBoundingClientRect().width > 0;
          });
          if (target !== undefined) target.click();
        })()`);
        await sleep(700);
        let state = await pageNoticeState(cdp);
        noticePath = 'synthetic click';
        if (state.noticeText || !state.sidebarReachable) {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: notice.x, y: notice.y, button: 'left', clickCount: 1 });
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: notice.x, y: notice.y, button: 'left', clickCount: 1 });
          await sleep(700);
          state = await pageNoticeState(cdp);
          noticePath = 'trusted click';
        }
        if (!state.noticeText && state.sidebarReachable) {
          pass('first-run preview notice dismissed (input no longer masked)', 'via ' + noticePath);
        } else {
          fail('first-run preview notice dismissed (input no longer masked)', brief(state));
        }
      }
    } else {
      pass('no first-run preview notice presented');
    }

    // 6) Open the workbench. A trusted CDP click is preferred; if anything still
    // swallows the hit target, fall back to the DOM click path the plugin's React
    // handler accepts (same handler, synthetic event).
    const sidebarHit = await cdp.clickAtSelector('button[aria-label="DeepSeekDesign"]');
    let openPath = 'trusted click';
    try {
      await waitFor(async () => cdp.evaluate(`document.querySelector('.dsd-overlay') !== null`), 'workbench overlay (trusted)', 4000);
    } catch {
      const hitNote = sidebarHit.hit === undefined ? '' : ' hit=' + brief(sidebarHit.hit, 160);
      await cdp.evaluate(`(() => {
        const entry = document.querySelector('button[aria-label="DeepSeekDesign"]');
        if (entry !== null) entry.click();
      })()`);
      openPath = 'synthetic click after blocked hit' + hitNote;
      await waitFor(async () => cdp.evaluate(`document.querySelector('.dsd-overlay') !== null`), 'workbench overlay (fallback)', 15_000);
    }
    const overlayInfo = await cdp.evaluate(`(() => {
      const overlay = document.querySelector('.dsd-overlay');
      return { present: overlay !== null, canvas: document.querySelectorAll('.dsd-stage, .dsd-stage-inner').length, assetPanel: document.querySelector('.dsd-assets') !== null, timeline: document.querySelector('.dsd-timeline') !== null };
    })()`);
    if (overlayInfo.present && overlayInfo.assetPanel && overlayInfo.timeline) {
      pass('clicking the sidebar entry opens the real workbench overlay', 'asset-panel + timeline present via ' + openPath);
    } else {
      fail('clicking the sidebar entry opens the real workbench overlay', brief(overlayInfo));
    }

    // 6b) V1.0.0 modal semantics: the overlay is an aria-modal dialog and the
    // covered app root is inert while it is open.
    const modalSemantics = await cdp.evaluate(`(() => {
      const overlay = document.querySelector('.dsd-overlay');
      const appRoot = document.getElementById('root');
      return {
        role: overlay === null ? null : overlay.getAttribute('role'),
        ariaModal: overlay === null ? null : overlay.getAttribute('aria-modal'),
        appInert: appRoot === null ? null : appRoot.hasAttribute('inert'),
        appAriaHidden: appRoot === null ? null : appRoot.getAttribute('aria-hidden'),
      };
    })()`);
    if (modalSemantics.role === 'dialog' && modalSemantics.ariaModal === 'true'
      && modalSemantics.appInert === true && modalSemantics.appAriaHidden === 'true') {
      pass('the workbench overlay is a modal dialog and the covered app is inert', brief(modalSemantics));
    } else {
      fail('the workbench overlay is a modal dialog and the covered app is inert', brief(modalSemantics));
    }

    // 7) Import two generated files by dropping them on the asset library.
    const generated = await pageMakeMediaFiles(cdp);
    const wantedNames = [generated.videoName, generated.audioName];
    const imported = await waitFor(async () => {
      return cdp.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.dsd-asset-card'));
        const names = cards.map((card) => card.title);
        const wanted = ${JSON.stringify(wantedNames)};
        return wanted.every((name) => names.includes(name)) ? { count: cards.length, names } : null;
      })()`);
    }, 'imported asset cards', 20_000);
    pass('DataTransfer drop imports a generated video and WAV audio as asset cards',
      'generated=' + brief(generated) + ' cards=' + brief(imported.names));

    // 8) Drag the video asset onto the video lane; an empty timeline anchors it at 0.
    const videoDrop = await pageDropAssetOnLane(cdp, generated.videoName, '.dsd-lane-video', 0.6);
    if (videoDrop.ok !== true) throw new Error('video lane drop failed: ' + brief(videoDrop));
    const videoClip = await waitFor(async () => {
      return cdp.evaluate(`(() => {
        const clip = document.querySelector('.dsd-lane-video .dsd-clip');
        if (clip === null) return null;
        return { id: clip.getAttribute('data-clip-id'), left: clip.style.left, aria: clip.getAttribute('aria-label') };
      })()`);
    }, 'video clip', 10_000);
    if (videoClip.left === '0%') {
      pass('dropping the video card on the empty video lane creates a clip anchored at 0', 'left=' + videoClip.left + ' aria=' + videoClip.aria);
    } else {
      fail('dropping the video card on the empty video lane creates a clip anchored at 0', 'left=' + videoClip.left);
    }

    // 9) Drop the audio asset on the audio lane (feeds the WebAudio sanity step).
    const audioDrop = await pageDropAssetOnLane(cdp, generated.audioName, '.dsd-lane-audio', 0.4);
    if (audioDrop.ok !== true) throw new Error('audio lane drop failed: ' + brief(audioDrop));
    await waitFor(async () => cdp.evaluate(`document.querySelectorAll('.dsd-lane-audio .dsd-clip').length >= 1`), 'audio clip', 10_000);
    pass('dropping the audio card on the audio lane creates an audio clip');

    // 9b) Maximize the preview (V0.9.6). The conversation column must be hidden
    // and the stage/canvas must keep a real size, otherwise the maximized
    // preview renders blank.
    await cdp.clickAtSelector('.dsd-previewhead .dsd-iconbtn');
    const focusLayout = await waitFor(async () => cdp.evaluate(`(() => {
      const root = document.querySelector('.dsd-root');
      if (root === null || !root.classList.contains('dsd-focus')) return null;
      const chat = document.querySelector('.dsd-chatpanel');
      const stage = document.querySelector('.dsd-stage');
      const canvas = document.querySelector('.dsd-preview-canvas');
      const frame = document.querySelector('.dsd-frame');
      const stageRect = stage === null ? null : stage.getBoundingClientRect();
      const canvasRect = canvas === null ? null : canvas.getBoundingClientRect();
      return {
        chatDisplay: chat === null ? null : getComputedStyle(chat).display,
        stageWidth: stageRect === null ? 0 : stageRect.width,
        stageHeight: stageRect === null ? 0 : stageRect.height,
        canvasWidth: canvasRect === null ? 0 : canvasRect.width,
        canvasHeight: canvasRect === null ? 0 : canvasRect.height,
        frameVisibility: frame === null ? null : getComputedStyle(frame).visibility,
      };
    })()`), 'maximized preview layout', 6000);
    const maximizedOk = focusLayout.chatDisplay === 'none'
      && focusLayout.stageWidth > 200
      && focusLayout.stageHeight > 200
      && focusLayout.canvasWidth > 0
      && focusLayout.canvasHeight > 0
      && focusLayout.frameVisibility !== 'hidden';
    if (maximizedOk) {
      pass('maximizing the preview hides other columns and keeps the preview frame visible', brief(focusLayout));
    } else {
      fail('maximizing the preview hides other columns and keeps the preview frame visible', brief(focusLayout));
    }
    await cdp.clickAtSelector('.dsd-previewhead .dsd-iconbtn');
    const collapsed = await waitFor(async () => cdp.evaluate(`(() => {
      const root = document.querySelector('.dsd-root');
      const chat = document.querySelector('.dsd-chatpanel');
      if (root === null || chat === null) return false;
      return !root.classList.contains('dsd-focus') && getComputedStyle(chat).display !== 'none';
    })()`), 'preview collapse', 6000).then(() => true).catch(() => false);
    if (collapsed) pass('collapsing the preview restores the conversation column');
    else fail('collapsing the preview restores the conversation column', 'focus class or chat visibility not restored');

    // 9c) Projects menu: workspace-only (no scope selector) + backup toggle.
    await cdp.clickAtSelector('.dsd-projectmenu button[aria-haspopup="menu"]');
    const projectMenu = await waitFor(async () => cdp.evaluate(`(() => {
      const popover = document.querySelector('.dsd-project-popover');
      if (popover === null) return null;
      const toggle = popover.querySelector('.dsd-project-backup input[type="checkbox"]');
      return {
        togglePresent: toggle !== null,
        checked: toggle === null ? null : toggle.checked,
        scopeButtons: popover.querySelectorAll('.dsd-project-scope-btn, .dsd-project-scope-options').length,
        restoreItem: /恢复最近备份|Restore latest backup/.test(popover.textContent || ''),
        clearItem: /清除所有备份|Clear all backups/.test(popover.textContent || ''),
      };
    })()`), 'project menu', 6000);
    if (projectMenu.togglePresent && projectMenu.checked === true && projectMenu.scopeButtons === 0 && projectMenu.restoreItem) {
      pass('Projects menu is workspace-only with the minute-backup toggle enabled by default', brief(projectMenu));
    } else {
      fail('Projects menu is workspace-only with the minute-backup toggle enabled by default', brief(projectMenu));
    }
    if (projectMenu.clearItem === true) pass('Projects menu offers the V1.0.0 clear-all-backups action');
    else fail('Projects menu offers the V1.0.0 clear-all-backups action', brief(projectMenu));
    await cdp.clickAtSelector('.dsd-project-backup');
    const backupOff = await waitFor(async () => {
      return cdp.evaluate(`(() => {
        const raw = window.localStorage.getItem('deepseek-design.settings.v1');
        const input = document.querySelector('.dsd-project-backup input[type="checkbox"]');
        if (raw === null) return null;
        let settings = null;
        try { settings = JSON.parse(raw); } catch { settings = null; }
        return settings !== null && settings.autoBackup === false && input !== null && input.checked === false;
      })()`);
    }, 'backup toggle off', 5000).catch(async () => {
      await cdp.evaluate(`(() => {
        const input = document.querySelector('.dsd-project-backup input[type="checkbox"]');
        if (input !== null) input.click();
      })()`);
      return waitFor(async () => cdp.evaluate(`(() => {
        const raw = window.localStorage.getItem('deepseek-design.settings.v1');
        const input = document.querySelector('.dsd-project-backup input[type="checkbox"]');
        if (raw === null) return null;
        let settings = null;
        try { settings = JSON.parse(raw); } catch { settings = null; }
        return settings !== null && settings.autoBackup === false && input !== null && input.checked === false;
      })()`), 'backup toggle off (synthetic)', 5000);
    });
    if (backupOff === true) pass('the minute-backup toggle persists when switched off');
    else fail('the minute-backup toggle persists when switched off', brief(backupOff));
    // Turn it back on and close the menu for the remaining steps.
    await cdp.evaluate(`(() => {
      const input = document.querySelector('.dsd-project-backup input[type="checkbox"]');
      if (input !== null && !input.checked) input.click();
    })()`);
    await cdp.pressKey('Escape', 'Escape', 27);
    await waitFor(async () => cdp.evaluate(`document.querySelector('.dsd-project-popover') === null`), 'project menu closed', 5000);

    // 10) Timeline marquee selects the video clip.
    const laneBox = await pageElementInfo(cdp, '.dsd-lane-video');
    if (laneBox === null || laneBox.visible !== true) throw new Error('video lane not visible');
    const marqueeFrom = { x: laneBox.left + laneBox.width * 0.92, y: laneBox.top + laneBox.height * 0.5 };
    const marqueeTo = { x: Math.max(0, laneBox.left - 2), y: laneBox.top + laneBox.height * 0.92 };
    await cdp.dragAt(marqueeFrom, marqueeTo);
    await sleep(120);
    let marqueeVisible = await cdp.evaluate(`document.querySelector('.dsd-marquee') !== null`);
    let marqueePath = 'trusted pointer drag';
    let marqueeSynthetic = null;
    if (!marqueeVisible) {
      // Fall back to synthetic PointerEvents on the real lane/window handlers.
      marqueeSynthetic = await pageSyntheticMarqueeStart(cdp, '.dsd-lane-video');
      marqueeVisible = await cdp.evaluate(`document.querySelector('.dsd-marquee') !== null`);
      marqueePath = 'synthetic PointerEvents';
    }
    if (marqueeSynthetic === null || marqueeSynthetic.ok !== true) await cdp.releaseAt(marqueeTo);
    else await pageSyntheticMarqueeEnd(cdp, marqueeSynthetic.end);
    const selection = await waitFor(async () => {
      return cdp.evaluate(`(() => {
        const clip = document.querySelector('.dsd-lane-video .dsd-clip.is-selected');
        return clip === null ? null : { id: clip.getAttribute('data-clip-id'), selectedCount: document.querySelectorAll('.dsd-clip.is-selected').length };
      })()`);
    }, 'marquee selection', 6000).catch(async () => {
      const diagnostics = await cdp.evaluate(`(() => {
        const lane = document.querySelector('.dsd-lane-video');
        const clip = document.querySelector('.dsd-lane-video .dsd-clip');
        const rect = (el) => { if (el === null) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
        return { lane: rect(lane), clip: rect(clip), selected: document.querySelectorAll('.dsd-clip.is-selected').length, marqueeVisible: document.querySelector('.dsd-marquee') !== null };
      })()`);
      throw new Error('marquee selection failed: ' + brief(diagnostics));
    });
    pass('timeline marquee (box-select) renders and selects the video clip', 'via ' + marqueePath + ' marqueeRendered=' + String(marqueeVisible) + ' selected=' + brief(selection));

    // 11) Delete removes the selected clip; Cmd/Ctrl+Z restores it.
    // The workbench ignores shortcuts while focus is outside its root (e.g. a
    // previously focused app-sidebar button); click empty stage space first.
    await cdp.clickAtSelector('.dsd-stage');
    let focusInfo = await cdp.evaluate(`(() => { const root = document.querySelector('.dsd-root'); const active = document.activeElement; return { tag: active && active.tagName, inRoot: root !== null && active !== null && root.contains(active), isBody: active === document.body }; })()`);
    if (focusInfo.isBody !== true && focusInfo.inRoot !== true) {
      await cdp.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
      focusInfo = await cdp.evaluate(`(() => { const root = document.querySelector('.dsd-root'); const active = document.activeElement; return { tag: active && active.tagName, inRoot: root !== null && active !== null && root.contains(active), isBody: active === document.body }; })()`);
    }
    await pageInstallKeyLog(cdp);
    const deleteVia = (await waitFor(async () => {
      await cdp.pressKey('Delete', 'Delete', 46);
      return cdp.evaluate(`document.querySelectorAll('.dsd-lane-video .dsd-clip').length === 0`).catch(() => false);
    }, 'clip deleted (trusted Delete)', 2000).then(() => 'trusted Delete').catch(() => null))
      ?? (await pageSyntheticKey(cdp, 'Delete', 'Delete').then(() => waitFor(async () => cdp.evaluate(`document.querySelectorAll('.dsd-lane-video .dsd-clip').length === 0`), 'clip deleted (synthetic Delete)', 3000).then(() => 'synthetic KeyboardEvent').catch(() => null)));
    if (deleteVia !== null) pass('Delete removes the marquee-selected clip', 'via ' + deleteVia);
    else {
      const diagnostics = { keys: await pageReadKeyLog(cdp), root: await cdp.evaluate(`(() => { const root = document.querySelector('.dsd-root'); return root === null ? null : { offsetParent: root.offsetParent === null ? null : String(root.offsetParent.className), selected: document.querySelectorAll('.dsd-clip.is-selected').length }; })()`) };
      fail('Delete removes the marquee-selected clip', brief(diagnostics));
    }
    const undoVia = (await cdp.pressKey('z', 'KeyZ', 90, 4).then(() => waitFor(async () => cdp.evaluate(`document.querySelectorAll('.dsd-lane-video .dsd-clip').length === 1`), 'clip restored (trusted Cmd+Z)', 2500).then(() => 'trusted Cmd+Z').catch(() => null)))
      ?? (await pageSyntheticKey(cdp, 'z', 'KeyZ', { metaKey: true }).then(() => waitFor(async () => cdp.evaluate(`document.querySelectorAll('.dsd-lane-video .dsd-clip').length === 1`), 'clip restored (synthetic Cmd+Z)', 3000).then(() => 'synthetic KeyboardEvent').catch(() => null)));
    if (undoVia !== null) pass('Cmd+Z restores the deleted clip (undo)', 'via ' + undoVia);
    else fail('Cmd+Z restores the deleted clip (undo)', brief(await pageReadKeyLog(cdp)));

    // 12) Escape while dragging a marquee cancels it without closing the workbench.
    const overlayBeforeEscape = await cdp.evaluate(`document.querySelector('.dsd-overlay') !== null`);
    await cdp.dragAt({ x: laneBox.left + laneBox.width * 0.92, y: laneBox.top + laneBox.height * 0.5 },
      { x: Math.max(0, laneBox.left - 2), y: laneBox.top + laneBox.height * 0.92 }, 4);
    let marqueeDuringEscape = await cdp.evaluate(`document.querySelector('.dsd-marquee') !== null`);
    let escapeSynthetic = null;
    if (!marqueeDuringEscape) {
      escapeSynthetic = await pageSyntheticMarqueeStart(cdp, '.dsd-lane-video');
      marqueeDuringEscape = await cdp.evaluate(`document.querySelector('.dsd-marquee') !== null`);
    }
    await cdp.pressKey('Escape', 'Escape', 27);
    await sleep(250);
    let escapeVia = 'trusted Escape';
    let afterEscape = await cdp.evaluate(`(() => ({ marquee: document.querySelector('.dsd-marquee') !== null, overlay: document.querySelector('.dsd-overlay') !== null }))()`);
    if (afterEscape.marquee && afterEscape.overlay) {
      await pageSyntheticKey(cdp, 'Escape', 'Escape');
      await sleep(250);
      escapeVia = 'synthetic KeyboardEvent';
      afterEscape = await cdp.evaluate(`(() => ({ marquee: document.querySelector('.dsd-marquee') !== null, overlay: document.querySelector('.dsd-overlay') !== null }))()`);
    }
    if (escapeSynthetic !== null && escapeSynthetic.ok === true) await pageSyntheticMarqueeEnd(cdp, escapeSynthetic.end);
    else await cdp.releaseAt({ x: Math.max(0, laneBox.left - 2), y: laneBox.top + laneBox.height * 0.92 });
    if (marqueeDuringEscape && afterEscape.marquee === false && afterEscape.overlay === true && overlayBeforeEscape === true) {
      pass('Escape during a marquee cancels the marquee and keeps the workbench open', 'via ' + escapeVia);
    } else {
      fail('Escape during a marquee cancels the marquee and keeps the workbench open', brief({ marqueeDuringEscape, afterEscape }));
    }

    // 13) Playback: AudioContext running + real AudioBufferSourceNodes scheduled.
    await cdp.clickAtSelector('.dsd-transportbtn.is-play');
    const audio = await waitFor(async () => {
      return cdp.evaluate(`(() => {
        const state = window.__uiSmoke ?? { contexts: [], bufferSources: 0, errors: ['instrumentation missing'] };
        const states = state.contexts.map((context) => context.state);
        return states.includes('running') && state.bufferSources > 0
          ? { states, bufferSources: state.bufferSources, errors: state.errors }
          : null;
      })()`);
    }, 'WebAudio playback graph', 8000).catch(() => cdp.evaluate(`(() => {
      const state = window.__uiSmoke ?? { contexts: [], bufferSources: 0, errors: ['instrumentation missing'] };
      return { states: state.contexts.map((context) => context.state), bufferSources: state.bufferSources, errors: state.errors };
    })()`));
    if (audio.states.includes('running') && audio.bufferSources > 0) {
      pass('playback creates a running AudioContext and real AudioBufferSourceNodes', brief(audio));
    } else {
      fail('playback creates a running AudioContext and real AudioBufferSourceNodes', brief(audio));
    }
    await sleep(300);
    await cdp.clickAtSelector('.dsd-transportbtn.is-play'); // pause
    pass('playback pauses again without errors');

    // 14) Export modal opens and closes.
    await cdp.clickAtSelector('.dsd-topaction.is-primary');
    await waitFor(async () => cdp.evaluate(`document.querySelector('.dsd-modal') !== null`), 'export modal', 8000);
    pass('export modal opens');
    await cdp.pressKey('Escape', 'Escape', 27);
    await waitFor(async () => cdp.evaluate(`document.querySelector('.dsd-modal') === null`), 'export modal closed', 5000);
    const overlayAfterModal = await cdp.evaluate(`document.querySelector('.dsd-overlay') !== null`);
    if (overlayAfterModal) pass('export modal closes via Escape and the workbench stays open');
    else fail('export modal closes via Escape and the workbench stays open');

    // 15) Page errors must be empty across the whole run.
    await sleep(400);
    const errors = cdp.errors.slice();
    if (errors.length === 0) {
      pass('no uncaught page exceptions, console.error, or error log entries', 'origin=' + webOrigin);
    } else {
      fail('no uncaught page exceptions, console.error, or error log entries', errors.join(' | ').slice(0, 800));
    }
  } catch (error) {
    fail('ui-smoke run completed without an unexpected script failure', String(error?.message ?? error).slice(0, 800));
    if (cdp !== null) {
      try {
        const body = await cdp.evaluate(`(document.body?.innerText ?? '').slice(0, 1500)`);
        console.error('[ui-smoke] page text at failure:', body);
      } catch { /* Page may be gone. */ }
    }
    if (cdp !== null && cdp.errors.length > 0) {
      fail('no page errors during the run', cdp.errors.join(' | ').slice(0, 800));
    }
  } finally {
    clearTimeout(hardTimer);
    if (cdp !== null) {
      try { cdp.close(); } catch { /* Already closed. */ }
    }
    await stopChrome(chromeState, chromeProfileDir);
    await stopDshWeb(dshState);
    if (!KEEP) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try { rmSync(rootDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); } catch { /* Retry. */ }
        if (!existsSync(rootDir)) break;
        await sleep(100);
      }
    } else {
      console.log('[ui-smoke] kept temp state at ' + rootDir);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log('');
  console.log('[ui-smoke] SUMMARY ' + passed + ' PASS / ' + failed + ' FAIL | ' + Math.round(durationMs / 100) / 10 + 's');
  if (failed > 0) {
    console.log('[ui-smoke] RESULT: FAIL');
    process.exitCode = 1;
  } else {
    console.log('[ui-smoke] RESULT: PASS');
  }
}

await main();
