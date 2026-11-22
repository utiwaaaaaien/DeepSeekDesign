#!/usr/bin/env node
/**
 * Real-Chrome functional smoke test for the DeepSeek Design export worker.
 *
 * The unit suite drives `deepseek-design-plugin/export-worker.js` through
 * `node:vm` with fake ImageBitmap/OffscreenCanvas implementations. This script
 * instead proves the worker works in an actual browser:
 *
 *   1. serves a harness page plus the *real* export-worker.js over a local
 *      HTTP origin (mimicking the Host route: no-store + worker CSP),
 *   2. launches headless Google Chrome with a throwaway `--user-data-dir` and
 *      `--remote-debugging-port=0` (port discovered via `DevToolsActivePort`),
 *   3. drives the page over the Chrome DevTools Protocol using Node's built-in
 *      global WebSocket,
 *   4. runs a page-side harness that instantiates the worker, sends
 *      ready/start messages, decodes every transferred ImageBitmap into real
 *      pixels, and exercises the error/cancel paths,
 *   5. probes `canvas.captureStream()` + `MediaRecorder` support honestly,
 *   6. prints one PASS/FAIL/WARN line per assertion and exits non-zero on any
 *      failure, cleaning up Chrome, the HTTP server and the temp profile.
 *
 * Requirements: Node >= 22 (global fetch/WebSocket), Google Chrome.
 * No npm dependencies. Re-runnable: unique temp dir, ephemeral ports.
 *
 * Usage:
 *   node scripts/browser-smoke.mjs
 *   DSH_CHROME_BIN=/path/to/Chrome node scripts/browser-smoke.mjs
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORKER_FILE = join(ROOT, 'deepseek-design-plugin', 'export-worker.js');
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_BIN = process.env.DSH_CHROME_BIN || process.env.CHROME_BIN || DEFAULT_CHROME;
// Keep this identical to the Host's worker route so the harness exercises the
// same CSP the real plugin serves.
const WORKER_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'; img-src data: blob:";
const HARD_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Result reporting
// ---------------------------------------------------------------------------

const checks = [];
let passed = 0;
let failed = 0;
let warned = 0;

function line(status, name, detail) {
  const suffix = detail === undefined || detail === '' ? '' : ' — ' + detail;
  console.log(status.padEnd(4) + ' ' + name + suffix);
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

function warn(name, detail) {
  warned += 1;
  checks.push({ status: 'WARN', name, detail });
  line('WARN', name, detail);
}

function info(name, detail) {
  checks.push({ status: 'INFO', name, detail });
  line('INFO', name, detail);
}

function brief(value, max = 900) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (typeof text !== 'string') text = String(text);
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}

function withTimeout(promise, milliseconds, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + ' timed out after ' + milliseconds + 'ms')), milliseconds);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

// ---------------------------------------------------------------------------
// Page-side harness (evaluated inside real Chrome via CDP Runtime.evaluate)
// ---------------------------------------------------------------------------

const PAGE_SCRIPT = String.raw`
'use strict';
(function () {
  var WORKER_URL = '/export-worker.js';

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error(label + ' timed out after ' + ms + 'ms'));
      }, ms);
      promise.then(function (value) { clearTimeout(timer); resolve(value); },
        function (error) { clearTimeout(timer); reject(error); });
    });
  }

  function errorText(error) {
    return String((error && (error.stack || error.message)) || error);
  }

  function capturePixels(session, message) {
    var bitmap = message.bitmap;
    try {
      if (typeof OffscreenCanvas !== 'function') {
        session.pixels.push({ index: message.index, error: 'OffscreenCanvas unavailable' });
        return;
      }
      var width = Math.max(1, message.width | 0);
      var height = Math.max(1, message.height | 0);
      if (session.probe.canvas === null || session.probe.canvas.width !== width
        || session.probe.canvas.height !== height) {
        session.probe.canvas = new OffscreenCanvas(width, height);
        session.probe.context = session.probe.canvas.getContext('2d');
      }
      var context = session.probe.context;
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0);
      var centre = context.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data;
      var corner = context.getImageData(Math.min(2, width - 1), Math.min(2, height - 1), 1, 1).data;
      var far = context.getImageData(Math.max(0, width - 20), Math.max(0, height - 20), 1, 1).data;
      session.pixels.push({
        index: message.index,
        isImageBitmap: typeof ImageBitmap === 'function' && bitmap instanceof ImageBitmap,
        bitmapWidth: bitmap && bitmap.width,
        bitmapHeight: bitmap && bitmap.height,
        centre: [centre[0], centre[1], centre[2], centre[3]],
        corner: [corner[0], corner[1], corner[2], corner[3]],
        far: [far[0], far[1], far[2], far[3]],
      });
    } catch (error) {
      session.pixels.push({ index: message.index, error: errorText(error) });
    } finally {
      if (bitmap && typeof bitmap.close === 'function') {
        try { bitmap.close(); } catch (error) { /* Already closed. */ }
      }
    }
  }

  function createSession() {
    var session = {
      messages: [],
      pixels: [],
      workerErrors: [],
      waiters: [],
      startedAt: 0,
      settledAt: 0,
      probe: { canvas: null, context: null },
      terminal: null,
    };
    session.terminal = new Promise(function (resolve) { session.resolveTerminal = resolve; });
    session.worker = new Worker(WORKER_URL);
    session.worker.onmessage = function (event) {
      var message = event.data;
      session.messages.push(message);
      if (message && typeof message === 'object') {
        if (message.type === 'frame') capturePixels(session, message);
        if (message.type === 'done' || message.type === 'error') {
          if (session.settledAt === 0) session.settledAt = performance.now();
          session.resolveTerminal(message);
        }
      }
      var pending = session.waiters.slice();
      session.waiters.length = 0;
      for (var i = 0; i < pending.length; i += 1) {
        if (pending[i].predicate(message)) pending[i].resolve(message);
        else session.waiters.push(pending[i]);
      }
    };
    session.worker.onerror = function (event) {
      var text = String((event && (event.message || event.type)) || 'worker error');
      session.workerErrors.push(text);
      session.resolveTerminal({ type: 'workererror', message: text });
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
    };
    session.post = function (message) {
      if (message && message.type === 'start' && session.startedAt === 0) {
        session.startedAt = performance.now();
      }
      session.worker.postMessage(message);
    };
    session.waitFor = function (predicate, label, timeoutMs) {
      for (var i = 0; i < session.messages.length; i += 1) {
        if (predicate(session.messages[i])) return Promise.resolve(session.messages[i]);
      }
      return withTimeout(new Promise(function (resolve) {
        session.waiters.push({ predicate: predicate, resolve: resolve });
      }), timeoutMs || 15000, label);
    };
    session.finish = function () {
      var started = null;
      var terminal = null;
      var frames = [];
      var types = [];
      for (var i = 0; i < session.messages.length; i += 1) {
        var message = session.messages[i];
        types.push(message && typeof message === 'object' ? message.type : typeof message);
        if (!started && message && message.type === 'started') started = message;
        if (!terminal && message && (message.type === 'done' || message.type === 'error')) terminal = message;
        if (message && message.type === 'frame') {
          frames.push({ index: message.index, t: message.t, width: message.width, height: message.height });
        }
      }
      var elapsedMs = session.startedAt !== 0 && session.settledAt !== 0
        ? Math.round(session.settledAt - session.startedAt) : null;
      try { session.worker.terminate(); } catch (error) { /* Already gone. */ }
      return {
        messageTypes: types,
        started: started,
        terminal: terminal,
        done: terminal && terminal.type === 'done' ? terminal : null,
        error: terminal && terminal.type === 'error' ? terminal : null,
        frameCount: frames.length,
        frames: frames,
        pixels: session.pixels,
        workerErrors: session.workerErrors,
        elapsedMs: elapsedMs,
      };
    };
    return session;
  }

  async function startAndWait(code, options) {
    var session = createSession();
    session.post({
      type: 'start', code: code, duration: options.duration,
      width: options.width, height: options.height, fps: options.fps,
    });
    await withTimeout(session.terminal, options.timeoutMs || 20000, options.label || 'worker run');
    return session.finish();
  }

  async function startExpectingError(code, options) {
    var session = createSession();
    session.post({
      type: 'start', code: code, duration: options.duration,
      width: options.width, height: options.height, fps: options.fps,
    });
    var terminal = await withTimeout(session.terminal, options.timeoutMs || 20000, options.label || 'worker error');
    return { terminal: terminal, run: session.finish() };
  }

  async function probeRecorder() {
    var probe = {
      mediaRecorder: typeof MediaRecorder,
      canvasCaptureStream: typeof HTMLCanvasElement !== 'undefined'
        && typeof HTMLCanvasElement.prototype.captureStream,
      offscreenCanvasCaptureStream: typeof OffscreenCanvas === 'function'
        && typeof OffscreenCanvas.prototype.captureStream,
      isTypeSupported: {},
      selectedType: '',
      videoTracks: null,
      chunks: 0,
      bytes: 0,
      blobType: '',
      errors: [],
      dataUrlLength: 0,
      durationMs: 0,
    };
    var canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    var context = canvas.getContext('2d');
    context.fillStyle = 'rgb(255, 0, 0)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      probe.dataUrlLength = canvas.toDataURL('image/jpeg', 0.85).length;
    } catch (error) {
      probe.errors.push('toDataURL: ' + errorText(error));
    }
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      return probe;
    }
    var candidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        probe.isTypeSupported[candidates[i]] = MediaRecorder.isTypeSupported(candidates[i]);
      } catch (error) {
        probe.isTypeSupported[candidates[i]] = 'threw: ' + errorText(error);
      }
    }
    var mime = '';
    for (var j = 0; j < candidates.length; j += 1) {
      if (probe.isTypeSupported[candidates[j]] === true) { mime = candidates[j]; break; }
    }
    probe.selectedType = mime;
    var stream;
    try {
      stream = canvas.captureStream(30);
    } catch (error) {
      probe.errors.push('captureStream: ' + errorText(error));
      return probe;
    }
    probe.videoTracks = stream.getVideoTracks().length;
    if (probe.videoTracks === 0) return probe;
    var chunks = [];
    var recorder;
    try {
      recorder = new MediaRecorder(stream, mime === ''
        ? undefined
        : { mimeType: mime, videoBitsPerSecond: 2000000 });
    } catch (error) {
      probe.errors.push('MediaRecorder: ' + errorText(error));
      return probe;
    }
    probe.recorderState = recorder.state;
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = function (event) {
      probe.errors.push('recorder error: ' + String((event && event.error && event.error.message) || 'unknown'));
    };
    var stopped = new Promise(function (resolve) { recorder.onstop = resolve; });
    var startedAt = performance.now();
    try {
      recorder.start(100);
    } catch (error) {
      probe.errors.push('recorder.start: ' + errorText(error));
      return probe;
    }
    await new Promise(function (resolve) {
      var frames = 0;
      var timer = setInterval(function () {
        frames += 1;
        context.fillStyle = frames % 2 === 0 ? 'rgb(255, 0, 0)' : 'rgb(0, 255, 0)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (frames >= 20) { clearInterval(timer); resolve(); }
      }, 25);
    });
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch (error) {
      probe.errors.push('recorder.stop: ' + errorText(error));
    }
    await Promise.race([stopped, sleep(3000)]);
    probe.durationMs = Math.round(performance.now() - startedAt);
    probe.chunks = chunks.length;
    for (var k = 0; k < chunks.length; k += 1) probe.bytes += chunks[k].size;
    probe.blobType = chunks.length > 0 ? chunks[0].type : '';
    var tracks = stream.getVideoTracks();
    for (var t = 0; t < tracks.length; t += 1) {
      try { tracks[t].stop(); } catch (error) { /* Already stopped. */ }
    }
    return probe;
  }

  async function run() {
    var out = {
      ok: true,
      page: {
        userAgent: navigator.userAgent,
        brands: navigator.userAgentData && navigator.userAgentData.brands
          ? navigator.userAgentData.brands.map(function (brand) {
            return brand.brand + '/' + brand.version;
          }).join(', ')
          : '',
        isSecureContext: window.isSecureContext,
        worker: typeof Worker,
        offscreenCanvas: typeof OffscreenCanvas,
        imageBitmap: typeof ImageBitmap,
        mediaRecorder: typeof MediaRecorder,
      },
      cases: {},
      recorder: null,
      timings: {},
    };
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') {
      out.ok = false;
      out.reason = 'Worker or OffscreenCanvas is unavailable in this browser.';
      return out;
    }
    var startedAt = performance.now();

    // -- Case 1: ready/start handshake, frame protocol, per-frame pixels. -----
    // The colour depends on t, so the decoded pixels prove the worker passes
    // the real frame time through and transfers each ImageBitmap correctly.
    var colourCode = 'function draw(ctx, t, width, height) {\n'
      + '  var red = t < 0.05 ? 255 : 0;\n'
      + '  var green = t >= 0.05 && t < 0.15 ? 255 : 0;\n'
      + '  var blue = t >= 0.15 ? 255 : 0;\n'
      + '  ctx.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";\n'
      + '  ctx.fillRect(0, 0, width, height);\n'
      + '}';
    out.cases.colour = await startAndWait(colourCode, {
      duration: 0.3, width: 320, height: 180, fps: 10, label: 'colour run',
    });

    // -- Case 2: the canvas is cleared before every draw() call. ------------
    var clearCode = 'function draw(ctx, t, width, height) {\n'
      + '  if (t === 0) { ctx.fillStyle = "rgb(200, 30, 30)"; ctx.fillRect(0, 0, width, height); }\n'
      + '}';
    out.cases.clear = await startAndWait(clearCode, {
      duration: 0.3, width: 320, height: 180, fps: 10, label: 'clear run',
    });

    // -- Case 2b: diagnostic for context state leaking between frames. The
    //    worker clears before draw(); if draw() leaves a scale transform the
    //    next clear only covers part of the canvas. Detected, not failed: an
    //    animation is expected to paint its own frames, but stale pixels
    //    leaking across frames is a worker robustness gap worth reporting.
    var transformCode = 'function draw(ctx, t, width, height) {\n'
      + '  if (t === 0) { ctx.fillStyle = "rgb(255, 0, 0)"; ctx.fillRect(0, 0, width, height); ctx.setTransform(0.5, 0, 0, 0.5, 0, 0); }\n'
      + '  else { ctx.fillStyle = "rgb(0, 0, 255)"; ctx.fillRect(0, 0, width, height); }\n'
      + '}';
    out.cases.transformClear = await startAndWait(transformCode, {
      duration: 0.3, width: 320, height: 180, fps: 10, label: 'transform clear probe',
    });

    // -- Case 3: frame count formula boundary: Math.round(0.34 * 3) === 1. ---
    out.cases.rounding = await startAndWait('function draw(ctx) { ctx.fillRect(0, 0, 1, 1); }', {
      duration: 0.34, width: 64, height: 64, fps: 3, label: 'rounding run',
    });

    // -- Case 4: start-stage validation rejects malformed start messages. ----
    out.cases.startErrors = [];
    var startCases = [
      { label: 'duration under minimum', payload: { type: 'start', code: 'function draw() {}', duration: 0.05, width: 64, height: 64, fps: 30 } },
      { label: 'non-string code', payload: { type: 'start', code: 42, duration: 1, width: 64, height: 64, fps: 30 } },
      { label: 'zero width', payload: { type: 'start', code: 'function draw() {}', duration: 1, width: 0, height: 64, fps: 30 } },
      { label: 'fractional fps', payload: { type: 'start', code: 'function draw() {}', duration: 1, width: 64, height: 64, fps: 29.5 } },
    ];
    for (var s = 0; s < startCases.length; s += 1) {
      var startSession = createSession();
      startSession.post(startCases[s].payload);
      var startTerminal = await withTimeout(startSession.terminal, 10000, startCases[s].label);
      out.cases.startErrors.push({
        label: startCases[s].label,
        terminal: startTerminal,
        run: startSession.finish(),
      });
    }

    // -- Case 5: eval-stage errors. -----------------------------------------
    out.cases.evalErrors = [];
    var evalCases = [
      { label: 'syntax error', code: 'function draw(ctx, t) {' },
      { label: 'missing draw()', code: 'var answer = 42;' },
      { label: 'throw while loading', code: 'throw new Error("boot failure");' },
    ];
    for (var e = 0; e < evalCases.length; e += 1) {
      var evalResult = await startExpectingError(evalCases[e].code, {
        duration: 0.5, width: 160, height: 90, fps: 2, label: evalCases[e].label,
      });
      out.cases.evalErrors.push({
        label: evalCases[e].label,
        terminal: evalResult.terminal,
        run: evalResult.run,
      });
    }

    // -- Case 6: draw-stage error. ------------------------------------------
    out.cases.drawError = await startExpectingError(
      'function draw() { throw new Error("boom-xyz"); }',
      { duration: 0.5, width: 160, height: 90, fps: 2, label: 'draw error' },
    );

    // -- Case 7: the real worker has no network or script-loading globals. --
    out.cases.network = [];
    var networkCases = [
      { label: 'fetch', code: 'function draw() { fetch("https://example.com/frame"); }' },
      { label: 'XMLHttpRequest', code: 'function draw() { XMLHttpRequest(); }' },
      { label: 'WebSocket', code: 'function draw() { WebSocket("ws://127.0.0.1:1/"); }' },
      { label: 'EventSource', code: 'function draw() { EventSource("/events"); }' },
      { label: 'importScripts', code: 'function draw() { importScripts("/extra.js"); }' },
      { label: 'indexedDB', code: 'function draw() { indexedDB(); }' },
      { label: 'caches', code: 'function draw() { caches(); }' },
      { label: 'navigator', code: 'function draw() { navigator(); }' },
    ];
    for (var n = 0; n < networkCases.length; n += 1) {
      var networkResult = await startExpectingError(networkCases[n].code, {
        duration: 0.5, width: 160, height: 90, fps: 2, label: networkCases[n].label,
      });
      out.cases.network.push({
        label: networkCases[n].label,
        terminal: networkResult.terminal,
        run: networkResult.run,
      });
    }

    // -- Case 7b: prototype-chain escape and postMessage capture ----------
    out.cases.prototypeEscape = await startExpectingError(
      'function draw() { Object.getPrototypeOf(self).fetch("https://example.com/frame"); }',
      { duration: 0.5, width: 160, height: 90, fps: 2, label: 'prototype escape' },
    );
    out.cases.postMessageCapture = await startAndWait(
      'function draw(ctx, t) { self.postMessage = function () {}; ctx.fillRect(0, 0, 1, 1); }',
      { duration: 0.3, width: 64, height: 64, fps: 10, label: 'postMessage capture' },
    );
    out.cases.postMessageCaptureError = await startExpectingError(
      'function draw() { self.postMessage = function () {}; throw new Error("captured boom"); }',
      { duration: 0.5, width: 160, height: 90, fps: 2, label: 'postMessage capture error' },
    );

    // -- Case 8: cancel stops a long run promptly. --------------------------
    var cancelSession = createSession();
    cancelSession.post({
      type: 'start',
      code: 'function draw(ctx, t, width, height) { ctx.fillStyle = "rgb(18, 52, 86)"; ctx.fillRect(0, 0, 8, 8); }',
      duration: 10,
      width: 128,
      height: 72,
      fps: 30,
    });
    var firstFrame = await cancelSession.waitFor(
      function (message) { return message && message.type === 'frame'; },
      'first frame before cancel',
      10000,
    );
    cancelSession.post({ type: 'cancel' });
    var cancelTerminal = await withTimeout(cancelSession.terminal, 10000, 'cancelled run');
    out.cases.cancel = {
      firstFrameIndex: firstFrame.index,
      terminal: cancelTerminal,
      run: cancelSession.finish(),
    };

    // -- Case 9: a second start while running is rejected, then a new run
    //    after junk messages still works (worker stays usable). -------------
    var busySession = createSession();
    busySession.post({
      type: 'start', code: 'function draw() {}', duration: 10, width: 64, height: 64, fps: 30,
    });
    await busySession.waitFor(
      function (message) { return message && message.type === 'started'; },
      'busy first started',
      10000,
    );
    busySession.post({
      type: 'start', code: 'function draw() {}', duration: 1, width: 64, height: 64, fps: 30,
    });
    var busyError = await busySession.waitFor(
      function (message) { return message && message.type === 'error'; },
      'busy rejection',
      10000,
    );
    busySession.post({ type: 'cancel' });
    var busyDone = await busySession.waitFor(
      function (message) { return message && message.type === 'done'; },
      'busy cancelled done',
      10000,
    );
    out.cases.busy = { error: busyError, done: busyDone, run: busySession.finish() };

    var junkSession = createSession();
    junkSession.post(null);
    junkSession.post('garbage');
    junkSession.post({ type: 'unknown-message' });
    junkSession.post({
      type: 'start',
      code: 'function draw(ctx) { ctx.fillRect(0, 0, 2, 2); }',
      duration: 0.34,
      width: 32,
      height: 32,
      fps: 3,
    });
    await withTimeout(junkSession.terminal, 10000, 'run after junk messages');
    out.cases.afterJunk = junkSession.finish();

    // -- Case 10: MediaRecorder / canvas capture capability probe. ----------
    out.recorder = await probeRecorder();

    out.timings.totalMs = Math.round(performance.now() - startedAt);
    return out;
  }

  window.runDeepSeekSmoke = function () {
    return run().catch(function (error) {
      return { ok: false, reason: errorText(error), cases: {}, recorder: null, timings: {} };
    });
  };
})();
`;

const HARNESS_HTML = '<!doctype html>\n'
  + '<html lang="en"><head><meta charset="utf-8">'
  + '<title>DeepSeek Design export worker smoke harness</title></head>'
  + '<body><p>DeepSeek Design export-worker browser smoke harness</p>'
  + '<script>' + PAGE_SCRIPT + '</script>'
  + '</body></html>';

// ---------------------------------------------------------------------------
// Minimal CDP client over Node's global WebSocket
// ---------------------------------------------------------------------------

class CdpConnection {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.closed = false;
    this.webSocket.addEventListener('message', (event) => this.handleMessage(event));
    this.webSocket.addEventListener('close', () => {
      this.closed = true;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new Error('CDP WebSocket closed before response'));
      }
    });
  }

  static async connect(url, timeoutMs = 10000) {
    const webSocket = new WebSocket(url);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CDP WebSocket open timed out')), timeoutMs);
        webSocket.addEventListener('open', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        webSocket.addEventListener('error', () => {
          clearTimeout(timer);
          reject(new Error('CDP WebSocket connection failed for ' + url));
        }, { once: true });
      });
    } catch (error) {
      try { webSocket.close(); } catch { /* Already closed. */ }
      throw error;
    }
    return new CdpConnection(webSocket);
  }

  handleMessage(event) {
    let text;
    if (typeof event.data === 'string') text = event.data;
    else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString('utf8');
    else text = String(event.data);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    if (payload.id !== undefined) {
      const pending = this.pending.get(payload.id);
      if (pending === undefined) return;
      this.pending.delete(payload.id);
      clearTimeout(pending.timer);
      if (payload.error !== undefined) {
        pending.reject(new Error('CDP ' + payload.method + ': ' + payload.error.message));
      } else {
        pending.resolve(payload.result ?? {});
      }
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params?.exceptionDetails;
      this.consoleErrors.push('exception: ' + (details?.exception?.description || details?.text || 'unknown'));
    } else if (payload.method === 'Runtime.consoleAPICalled' && payload.params?.type === 'error') {
      this.consoleErrors.push('console.error: ' + (payload.params.args ?? [])
        .map((argument) => argument.value ?? argument.description ?? '')
        .join(' '));
    } else if (payload.method === 'Log.entryAdded') {
      const entry = payload.params?.entry;
      if (entry !== undefined && entry.level === 'error') this.consoleErrors.push('log: ' + entry.text);
    }
  }

  send(method, params = {}, timeoutMs = 20000) {
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

  async evaluate(expression, { awaitPromise = false, timeoutMs = 20000 } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs + 5000);
    if (result.exceptionDetails !== undefined) {
      const details = result.exceptionDetails;
      throw new Error('Page exception: ' + (details.exception?.description || details.text || 'unknown'));
    }
    return result.result?.value;
  }

  close() {
    this.closed = true;
    try { this.webSocket.close(); } catch { /* Already closed. */ }
  }
}

// ---------------------------------------------------------------------------
// HTTP harness server / Chrome lifecycle helpers
// ---------------------------------------------------------------------------

function loadWorkerSource() {
  if (!existsSync(WORKER_FILE)) throw new Error('export-worker.js not found at ' + WORKER_FILE);
  return readFileSync(WORKER_FILE);
}

function startHarnessServer(workerSource) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end('method not allowed');
      return;
    }
    if (url.pathname === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(HARNESS_HTML);
      return;
    }
    if (url.pathname === '/export-worker.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': WORKER_CSP,
        'content-length': String(workerSource.byteLength),
      });
      response.end(workerSource);
      return;
    }
    if (url.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

function launchChrome(profileDir) {
  const args = [
    '--headless=new',
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
    '--hide-scrollbars',
    'about:blank',
  ];
  const child = spawn(CHROME_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const stderr = { text: '' };
  child.stderr.on('data', (chunk) => {
    stderr.text = (stderr.text + chunk.toString('utf8')).slice(-8000);
  });
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return { child, stderr, exited };
}

async function waitForDevToolsPort(profileDir, chromeState, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const path = join(profileDir, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    if (chromeState.child.exitCode !== null || chromeState.child.signalCode !== null) {
      throw new Error('Chrome exited before opening the DevTools port (code='
        + chromeState.child.exitCode + ', signal=' + chromeState.child.signalCode + ')');
    }
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8').trim();
      const [portLine, wsPath = ''] = content.split('\n');
      if (/^\d+$/.test(portLine)) {
        return { port: Number(portLine), browserWsPath: wsPath.trim() };
      }
    }
    await sleep(60);
  }
  throw new Error('DevToolsActivePort was not created within ' + timeoutMs + 'ms');
}

async function createPageTarget(port) {
  // Modern Chrome requires PUT for /json/new; fall back to the existing tab.
  const base = 'http://127.0.0.1:' + port;
  try {
    const response = await fetch(base + '/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' });
    if (response.ok) {
      const target = await response.json();
      if (target.webSocketDebuggerUrl) return target;
    }
  } catch {
    // Fall through to /json/list.
  }
  const listResponse = await fetch(base + '/json/list');
  if (!listResponse.ok) throw new Error('Chrome /json/list returned HTTP ' + listResponse.status);
  const targets = await listResponse.json();
  const pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (pageTarget === undefined) throw new Error('No page target with a DevTools WebSocket URL was found');
  return pageTarget;
}

async function retryRemoveDirectory(dir) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
    } catch {
      // Chrome helpers may still be shutting down.
    }
    if (!existsSync(dir)) return true;
    await sleep(100);
  }
  return !existsSync(dir);
}

// ---------------------------------------------------------------------------
// Node-side assertions over the page harness result
// ---------------------------------------------------------------------------

function colourMatches(actual, expected, tolerance = 2) {
  return Array.isArray(actual)
    && actual.length === 4
    && actual.every((channel, index) => Math.abs(channel - expected[index]) <= tolerance);
}

function assertResult(raw) {
  if (raw === null || typeof raw !== 'object') {
    fail('page harness produced a result', 'Runtime.evaluate returned ' + brief(raw));
    return null;
  }
  if (raw.ok === false) {
    fail('page harness executed in real Chrome', raw.reason);
    return null;
  }
  const page = raw.page ?? {};
  const cases = raw.cases ?? {};

  pass('real Chrome loaded the harness page', page.userAgent);
  info('browser capabilities', brief({
    worker: page.worker,
    offscreenCanvas: page.offscreenCanvas,
    imageBitmap: page.imageBitmap,
    mediaRecorder: page.mediaRecorder,
    secureContext: page.isSecureContext,
    uaBrands: page.brands,
  }));

  // -- 1) ready/start handshake and frame protocol -------------------------
  const colour = cases.colour ?? {};
  const expectedStarted = { type: 'started', width: 320, height: 180, fps: 10, frames: 3 };
  const startedMatches = ['width', 'height', 'fps', 'frames'].every(
    (key) => colour.started !== null && colour.started !== undefined && colour.started[key] === expectedStarted[key],
  );
  if (startedMatches) pass('worker ready/start handshake', brief(colour.started));
  else fail('worker ready/start handshake', 'expected ' + brief(expectedStarted) + ' got ' + brief(colour.started));

  const orderOk = Array.isArray(colour.messageTypes)
    && colour.messageTypes[0] === 'started'
    && colour.messageTypes[colour.messageTypes.length - 1] === 'done'
    && colour.messageTypes.filter((type) => type === 'frame').length === 3;
  if (orderOk) pass('frame protocol ordering', brief(colour.messageTypes));
  else fail('frame protocol ordering', brief(colour.messageTypes));

  const frames = colour.frames ?? [];
  const frameMetadataOk = frames.length === 3
    && frames.every((frame, index) => frame.index === index
      && frame.width === 320 && frame.height === 180
      && Math.abs(frame.t - index / 10) < 1e-9);
  if (frameMetadataOk) pass('frame metadata (index/t/width/height)', brief(frames.map((frame) => [frame.index, frame.t])));
  else fail('frame metadata (index/t/width/height)', brief(frames));

  const pixels = colour.pixels ?? [];
  const transferOk = pixels.length === 3
    && pixels.every((pixel) => pixel.isImageBitmap === true
      && pixel.bitmapWidth === 320 && pixel.bitmapHeight === 180);
  if (transferOk) pass('per-frame ImageBitmap transfer', pixels.map((pixel) => pixel.isImageBitmap).join(','));
  else fail('per-frame ImageBitmap transfer', brief(pixels));

  const expectedColours = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]];
  const pixelOk = pixels.length === 3
    && pixels.every((pixel, index) => colourMatches(pixel.centre, expectedColours[index]));
  if (pixelOk) pass('real per-frame pixel output (t-dependent)', brief(pixels.map((pixel) => pixel.centre)));
  else fail('real per-frame pixel output (t-dependent)', brief(pixels.map((pixel) => pixel.centre ?? pixel.error)));

  const doneOk = colour.done !== null && colour.done !== undefined
    && colour.done.frames === 3 && colour.done.cancelled === false;
  if (doneOk) pass('done message reports painted frames', brief(colour.done));
  else fail('done message reports painted frames', brief(colour.terminal));

  const elapsed = colour.elapsedMs;
  const pacingOk = typeof elapsed === 'number' && elapsed >= 150 && elapsed <= 3000;
  if (pacingOk) pass('real-time frame pacing (1/fps wall clock)', elapsed + 'ms for 3 frames at 10fps');
  else fail('real-time frame pacing (1/fps wall clock)', 'elapsedMs=' + elapsed);

  // -- 2) cleared canvas between frames ------------------------------------
  const clear = cases.clear ?? {};
  const clearPixels = clear.pixels ?? [];
  const clearOk = clearPixels.length === 3
    && colourMatches(clearPixels[0]?.centre, [200, 30, 30, 255])
    && colourMatches(clearPixels[1]?.centre, [0, 0, 0, 0])
    && colourMatches(clearPixels[2]?.centre, [0, 0, 0, 0]);
  if (clearOk) pass('canvas clearRect before every draw()', brief(clearPixels.map((pixel) => pixel.centre)));
  else fail('canvas clearRect before every draw()', brief(clearPixels.map((pixel) => pixel.centre ?? pixel.error)));

  // -- 3) diagnostic: stale pixels when draw() leaves a transform behind -----
  const transformClear = cases.transformClear ?? {};
  const transformPixels = transformClear.pixels ?? [];
  const transformFrame = transformPixels[1];
  const staleFar = transformFrame !== undefined
    && colourMatches(transformFrame.far, [255, 0, 0, 255])
    && colourMatches(transformFrame.corner, [0, 0, 255, 255]);
  if (staleFar) {
    warn('frame clearing is not transform-safe (product robustness gap, not a harness failure)', brief({
      note: 'draw() frame 0 left setTransform(0.5,0,0,0.5,0,0); frame 1 clearRect() only cleared the scaled region',
      frame1: { corner: transformFrame.corner, far: transformFrame.far },
    }));
  } else if (transformFrame !== undefined) {
    pass('frame clearing survives context state left by draw()', brief({
      frame1: { corner: transformFrame.corner, far: transformFrame.far },
    }));
  } else {
    warn('frame clearing transform probe', 'no frame telemetry: ' + brief(transformPixels));
  }

  // -- 4) frame-count rounding boundary ------------------------------------
  const rounding = cases.rounding ?? {};
  const roundingOk = rounding.started?.frames === 1 && rounding.frameCount === 1;
  if (roundingOk) pass('frame count uses round(duration * fps)', 'duration 0.34s @ 3fps → 1 frame');
  else fail('frame count uses round(duration * fps)', brief({ started: rounding.started, frameCount: rounding.frameCount }));

  // -- 5) start-stage validation -------------------------------------------
  const startPatterns = {
    'duration under minimum': /duration/,
    'non-string code': /code must be a string/,
    'zero width': /width/,
    'fractional fps': /fps/,
  };
  for (const entry of cases.startErrors ?? []) {
    const terminal = entry.terminal ?? {};
    const pattern = startPatterns[entry.label] ?? /./;
    const ok = terminal.type === 'error' && terminal.stage === 'start'
      && typeof terminal.message === 'string' && pattern.test(terminal.message)
      && (entry.run?.frameCount ?? -1) === 0;
    if (ok) pass('start-stage error: ' + entry.label, terminal.message);
    else fail('start-stage error: ' + entry.label, brief(entry.terminal));
  }

  // -- 6) eval-stage validation --------------------------------------------
  const evalPatterns = {
    'syntax error': /could not be parsed/,
    'missing draw()': /must define function draw/,
    'throw while loading': /threw while loading[\s\S]*boot failure/,
  };
  for (const entry of cases.evalErrors ?? []) {
    const terminal = entry.terminal ?? {};
    const pattern = evalPatterns[entry.label] ?? /./;
    const ok = terminal.type === 'error' && terminal.stage === 'eval'
      && typeof terminal.message === 'string' && pattern.test(terminal.message)
      && (entry.run?.frameCount ?? -1) === 0;
    if (ok) pass('eval-stage error: ' + entry.label, terminal.message);
    else fail('eval-stage error: ' + entry.label, brief(entry.terminal));
  }

  // -- 7) draw-stage error --------------------------------------------------
  const drawError = cases.drawError ?? {};
  const drawTerminal = drawError.terminal ?? {};
  const drawOk = drawTerminal.type === 'error' && drawTerminal.stage === 'draw'
    && /frame 0/.test(drawTerminal.message ?? '') && /boom-xyz/.test(drawTerminal.message ?? '');
  if (drawOk) pass('draw-stage error with frame index and message', drawTerminal.message);
  else fail('draw-stage error with frame index and message', brief(drawTerminal));

  // -- 8) network globals are really disabled in the worker ----------------
  for (const entry of cases.network ?? []) {
    const terminal = entry.terminal ?? {};
    const ok = terminal.type === 'error' && terminal.stage === 'draw'
      && (terminal.message ?? '').includes(entry.label + ' is disabled');
    if (ok) pass('network disabled in real worker: ' + entry.label, terminal.message);
    else fail('network disabled in real worker: ' + entry.label, brief(terminal));
  }

  // -- 8b) prototype-chain escape and postMessage capture ------------------
  const prototypeEscape = cases.prototypeEscape ?? {};
  const escapeTerminal = prototypeEscape.terminal ?? {};
  const escapeBlocked = escapeTerminal.type === 'error'
    && escapeTerminal.stage === 'draw'
    && (escapeTerminal.message ?? '').includes('fetch is disabled');
  if (escapeBlocked) pass('blocked globals are shadowed on the worker prototype chain', escapeTerminal.message);
  else fail('blocked globals are shadowed on the worker prototype chain', brief(escapeTerminal));

  const capture = cases.postMessageCapture ?? {};
  const captureOk = capture.done?.type === 'done' && capture.done.frames === 3 && capture.frameCount === 3;
  if (captureOk) pass('model code cannot silence the frame protocol via postMessage', brief(capture.messageTypes));
  else fail('model code cannot silence the frame protocol via postMessage', brief({
    terminal: capture.terminal, frameCount: capture.frameCount,
  }));

  const captureError = cases.postMessageCaptureError ?? {};
  const captureErrorTerminal = captureError.terminal ?? {};
  const captureErrorOk = captureErrorTerminal.type === 'error'
    && (captureErrorTerminal.message ?? '').includes('captured boom');
  if (captureErrorOk) pass('model code cannot suppress worker error messages', captureErrorTerminal.message);
  else fail('model code cannot suppress worker error messages', brief(captureErrorTerminal));

  // -- 9) cancel ------------------------------------------------------------
  const cancel = cases.cancel ?? {};
  const cancelTerminal = cancel.terminal ?? {};
  const cancelFrames = cancel.run?.frameCount ?? -1;
  const cancelOk = cancelTerminal.type === 'done'
    && cancelTerminal.cancelled === true
    && cancelTerminal.frames === cancelFrames
    && cancelFrames >= 0 && cancelFrames < 300;
  if (cancelOk) pass('cancel stops a run and reports cancelled', brief({
    frames: cancelTerminal.frames, frameCount: cancelFrames, firstFrame: cancel.firstFrameIndex,
  }));
  else fail('cancel stops a run and reports cancelled', brief({ terminal: cancelTerminal, frameCount: cancelFrames }));

  // -- 10) busy guard + junk messages ---------------------------------------
  const busy = cases.busy ?? {};
  const busyError = busy.error ?? {};
  const busyErrorOk = busyError.type === 'error' && busyError.stage === 'start'
    && /already running/.test(busyError.message ?? '');
  if (busyErrorOk) pass('second start while running is rejected', busyError.message);
  else fail('second start while running is rejected', brief(busyError));
  const busyDone = busy.done ?? {};
  if (busyDone.type === 'done' && busyDone.cancelled === true) {
    pass('running export can still be cancelled', brief(busyDone));
  } else {
    fail('running export can still be cancelled', brief(busyDone));
  }
  const afterJunk = cases.afterJunk ?? {};
  const junkOk = afterJunk.done?.type === 'done' && afterJunk.done.frames === 1
    && afterJunk.started?.frames === 1 && afterJunk.frameCount === 1;
  if (junkOk) pass('unknown/null messages are ignored', brief(afterJunk.messageTypes));
  else fail('unknown/null messages are ignored', brief({ types: afterJunk.messageTypes, done: afterJunk.done }));

  // -- 11) MediaRecorder / canvas capture probe ---------------------------
  const recorder = raw.recorder ?? {};
  if (recorder.mediaRecorder === 'undefined') {
    warn('MediaRecorder canvas capture', 'MediaRecorder is unavailable in this headless Chrome; cannot probe recording (environment limitation, not a worker failure)');
  } else if (recorder.canvasCaptureStream === false) {
    warn('MediaRecorder canvas capture', 'HTMLCanvasElement.captureStream is unavailable in this headless Chrome');
  } else if ((recorder.dataUrlLength ?? 0) <= 100) {
    fail('canvas.toDataURL poster capture', brief(recorder.errors));
  } else {
    pass('canvas.toDataURL poster capture', 'jpeg data URL length ' + recorder.dataUrlLength);
    const supported = Object.entries(recorder.isTypeSupported ?? {})
      .filter(([, value]) => value === true)
      .map(([mime]) => mime);
    if (supported.length === 0) {
      warn('MediaRecorder canvas capture', 'no video mime type is supported: ' + brief(recorder.isTypeSupported));
    } else if ((recorder.bytes ?? 0) > 0) {
      pass('MediaRecorder canvas capture', brief({
        mime: recorder.selectedType,
        chunks: recorder.chunks,
        bytes: recorder.bytes,
        blobType: recorder.blobType,
        videoTracks: recorder.videoTracks,
        durationMs: recorder.durationMs,
        supportedMimes: supported,
      }));
    } else {
      warn('MediaRecorder canvas capture', 'MediaRecorder is exposed but produced no data in headless Chrome (environment limitation): '
        + brief({ errors: recorder.errors, supported }));
    }
  }
  if ((raw.timings?.totalMs ?? 0) > 0) info('page harness duration', raw.timings.totalMs + 'ms');
  return raw;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const checksum = (buffer) => buffer.length;

async function main() {
  console.log('[browser-smoke] DeepSeek Design export-worker — real Chrome functional smoke test');
  console.log('[browser-smoke] node ' + process.version + ' | ' + CHROME_BIN);

  if (!existsSync(CHROME_BIN)) {
    fail('Chrome binary available', CHROME_BIN + ' does not exist; set DSH_CHROME_BIN or CHROME_BIN');
    return;
  }

  let workerSource;
  try {
    workerSource = loadWorkerSource();
  } catch (error) {
    fail('export-worker.js readable', error.message);
    return;
  }

  let profileDir = null;
  let harness = null;
  let chromeState = null;
  let page = null;
  let pageTarget = null;
  let chromeVersion = 'unknown';

  try {
    profileDir = mkdtempSync(join(tmpdir(), 'dsh-design-chrome-'));
    harness = await startHarnessServer(workerSource);
    const harnessUrl = 'http://127.0.0.1:' + harness.port + '/';
    console.log('[browser-smoke] harness ' + harnessUrl + ' | profile ' + profileDir);

    chromeState = launchChrome(profileDir);
    const devtools = await withTimeout(
      waitForDevToolsPort(profileDir, chromeState, 25000),
      30000,
      'wait for Chrome DevTools port',
    );
    try {
      const versionResponse = await fetch('http://127.0.0.1:' + devtools.port + '/json/version');
      if (versionResponse.ok) {
        const version = await versionResponse.json();
        chromeVersion = version.Browser ?? 'unknown';
      }
    } catch {
      // Version is cosmetic; continue.
    }
    console.log('[browser-smoke] Chrome ' + chromeVersion + ' | DevTools port ' + devtools.port);

    pageTarget = await withTimeout(createPageTarget(devtools.port), 15000, 'create page target');
    page = await withTimeout(
      CdpConnection.connect(pageTarget.webSocketDebuggerUrl),
      15000,
      'connect CDP page WebSocket',
    );
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.navigate', { url: harnessUrl });

    // Wait for the harness page script to be ready. Runtime.evaluate can race
    // with the initial navigation, so retry until the global appears.
    let harnessReady = false;
    const readyDeadline = Date.now() + 20000;
    while (Date.now() < readyDeadline) {
      try {
        const ready = await page.evaluate(
          'document.readyState === "complete" && typeof window.runDeepSeekSmoke === "function"',
        );
        if (ready === true) {
          harnessReady = true;
          break;
        }
      } catch {
        // Execution context may still be replaced by the navigation.
      }
      await sleep(100);
    }
    if (!harnessReady) {
      fail('harness page loaded', 'window.runDeepSeekSmoke did not appear within 20s at ' + harnessUrl);
      return;
    }
    pass('harness page loaded over HTTP', harnessUrl);

    const raw = await page.evaluate('window.runDeepSeekSmoke()', {
      awaitPromise: true,
      timeoutMs: 90000,
    });
    assertResult(raw);

    if ((page.consoleErrors ?? []).length > 0) {
      info('page console errors', brief(page.consoleErrors.slice(0, 5)));
    }
  } catch (error) {
    const evidence = {
      error: String(error?.stack ?? error),
      chromeVersion,
      target: pageTarget ? { id: pageTarget.id, url: pageTarget.url } : null,
      chromeStderrTail: chromeState ? chromeState.stderr.text.split('\n').slice(-8).join('\n') : null,
      pageConsoleErrors: page ? page.consoleErrors.slice(-8) : null,
    };
    fail('real Chrome smoke execution', brief(evidence, 2500));
    if (chromeState !== null && !existsSync(join(profileDir, 'DevToolsActivePort'))) {
      fail('Chrome DevTools endpoint reachable', 'DevToolsActivePort was never created; see stderr evidence above');
    }
  } finally {
    // -- Cleanup: CDP page, Chrome, HTTP server, temp profile. -------------
    const cleanupProblems = [];
    try { page?.close(); } catch (error) { cleanupProblems.push('cdp close: ' + error.message); }
    if (chromeState !== null) {
      try {
        if (chromeState.child.exitCode === null && chromeState.child.signalCode === null) {
          chromeState.child.kill('SIGTERM');
        }
        const exited = await Promise.race([
          chromeState.exited.then(() => 'exited'),
          sleep(4000).then(() => 'timeout'),
        ]);
        if (exited === 'timeout') {
          try { chromeState.child.kill('SIGKILL'); } catch { /* Already gone. */ }
          await Promise.race([chromeState.exited, sleep(2000)]);
        }
      } catch (error) {
        cleanupProblems.push('chrome kill: ' + error.message);
      }
    }
    if (harness !== null) {
      try { await closeServer(harness.server); } catch (error) { cleanupProblems.push('server close: ' + error.message); }
    }
    if (profileDir !== null) {
      const removed = await retryRemoveDirectory(profileDir);
      if (!removed) cleanupProblems.push('temp profile still exists: ' + profileDir);
    }
    if (cleanupProblems.length === 0) pass('cleanup completed (chrome/server/temp dir)');
    else fail('cleanup completed (chrome/server/temp dir)', cleanupProblems.join('; '));
  }

  const failedChecks = checks.filter((check) => check.status === 'FAIL');
  info('worker script', WORKER_FILE + ' (' + checksum(workerSource) + ' bytes)');
  console.log('');
  if (failedChecks.length > 0) {
    console.log('[browser-smoke] FAILED checks:');
    for (const check of failedChecks) console.log('  - ' + check.name);
  }
  console.log('[browser-smoke] SUMMARY ' + passed + ' PASS / ' + failed + ' FAIL / ' + warned + ' WARN');
  console.log('[browser-smoke] RESULT: ' + (failed === 0 ? 'PASS' : 'FAIL'));
  process.exitCode = failed === 0 ? 0 : 1;
}

const watchdog = setTimeout(() => {
  console.error('[browser-smoke] FAIL: hard timeout of ' + HARD_TIMEOUT_MS + 'ms exceeded — forcing exit');
  process.exit(2);
}, HARD_TIMEOUT_MS);

try {
  await main();
} catch (error) {
  console.error('[browser-smoke] FAIL: unhandled error: ' + (error?.stack ?? error));
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
}
