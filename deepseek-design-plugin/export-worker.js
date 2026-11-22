/**
 * DeepSeekDesign — video export worker.
 *
 * Served by the plugin Host at GET /deepseek-design/export-worker.js and started
 * by the Client tool view as a classic same-origin Worker. This file is
 * deliberately self-contained: no imports, no network, no DOM, no filesystem.
 * Animation code supplied by the model is evaluated here, but this worker only
 * paints frames into an OffscreenCanvas and posts them back as ImageBitmaps.
 *
 * Parent -> worker:
 *   { type: 'start', code, duration, width, height, fps }
 *   { type: 'cancel' }
 *
 * Worker -> parent:
 *   { type: 'started', width, height, fps, frames }
 *   { type: 'frame', index, t, width, height, bitmap }   // bitmap is transferred
 *   { type: 'done', frames, cancelled }
 *   { type: 'error', message, stage }
 *
 * `t` is the frame time in seconds (`index / fps`). `stage` is one of `start`,
 * `eval`, `draw`, or `render`. Frame count is `max(1, round(duration * fps))`.
 * Frames are released on a 1/fps wall-clock schedule, because the Client
 * records the canvas in real time; bursting them would shorten the video.
 */

'use strict';

const MAX_CODE_CHARS = 2_000_000;
const MIN_DURATION_SECONDS = 0.1;
const MAX_DURATION_SECONDS = 600;
const MAX_DIMENSION = 8192;
const MIN_FPS = 1;
const MAX_FPS = 240;
const MAX_MESSAGE_CHARS = 2_000;

// Network, storage, and script-loading entry points are removed before any
// model code is evaluated, so a drawing function cannot reach the network,
// touch the workbench's IndexedDB media library, or load more code.
const BLOCKED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'indexedDB',
  'caches',
  'navigator',
];

class ExportWorkerError extends Error {
  constructor(message, stage) {
    super(message);
    this.name = 'ExportWorkerError';
    this.stage = stage;
  }
}

function messageOf(error) {
  if (error === null || error === undefined) return 'unknown error';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.length > 0) return error.message;
  return String(error);
}

// Captured before model code runs: a draw() that overwrites self.postMessage
// must not be able to silence the worker's own frame/error protocol messages.
const workerPostMessage = typeof self.postMessage === 'function' ? self.postMessage.bind(self) : null;

function post(message, transfer) {
  if (workerPostMessage === null) return;
  if (Array.isArray(transfer) && transfer.length > 0) {
    workerPostMessage(message, transfer);
    return;
  }
  workerPostMessage(message);
}

function postError(error) {
  const message = messageOf(error).slice(0, MAX_MESSAGE_CHARS);
  const stage = error instanceof ExportWorkerError ? error.stage : 'render';
  post({ type: 'error', message, stage });
}

function blockGlobal(name) {
  const blocked = function blockedInExportWorker() {
    throw new Error(name + ' is disabled in the DeepSeekDesign export worker.');
  };
  // Shadow the global scope binding and also replace any prototype that owns
  // the member: `Object.getPrototypeOf(self).fetch` must not reach the real
  // platform binding behind the shadow.
  const targets = [self];
  let prototype = Object.getPrototypeOf(self);
  while (prototype !== null && prototype !== Object.prototype) {
    if (Object.hasOwn(prototype, name)) targets.push(prototype);
    prototype = Object.getPrototypeOf(prototype);
  }
  for (const target of targets) {
    try {
      Object.defineProperty(target, name, {
        value: blocked,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    } catch {
      try {
        target[name] = blocked;
      } catch {
        // The platform binding stays as-is; the worker never calls it itself.
      }
    }
  }
}

function lockDownGlobals() {
  for (const name of BLOCKED_GLOBALS) blockGlobal(name);
}

function requireFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExportWorkerError(name + ' must be a finite number.', 'start');
  }
  return value;
}

function requireIntegerInRange(value, name, min, max) {
  const number = requireFiniteNumber(value, name);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ExportWorkerError(
      name + ' must be an integer between ' + min + ' and ' + max + '.',
      'start',
    );
  }
  return number;
}

/** Validate one start message before allocating a canvas. */
function readStart(message) {
  if (typeof message.code !== 'string') {
    throw new ExportWorkerError('code must be a string.', 'start');
  }
  const code = message.code;
  if (code.trim().length === 0) {
    throw new ExportWorkerError('code must not be empty.', 'start');
  }
  if (code.length > MAX_CODE_CHARS) {
    throw new ExportWorkerError(
      'code must be at most ' + MAX_CODE_CHARS.toLocaleString('en-US') + ' characters.',
      'start',
    );
  }
  const duration = requireFiniteNumber(message.duration, 'duration');
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new ExportWorkerError(
      'duration must be between ' + MIN_DURATION_SECONDS + ' and ' + MAX_DURATION_SECONDS + ' seconds.',
      'start',
    );
  }
  return {
    code,
    duration,
    width: requireIntegerInRange(message.width, 'width', 1, MAX_DIMENSION),
    height: requireIntegerInRange(message.height, 'height', 1, MAX_DIMENSION),
    fps: requireIntegerInRange(message.fps, 'fps', MIN_FPS, MAX_FPS),
  };
}

function createDrawFunction(code) {
  let factory;
  try {
    // The animation source must declare `function draw(ctx, t, width, height)`.
    factory = new Function(code + '\n;return typeof draw === "function" ? draw : undefined;');
  } catch (error) {
    throw new ExportWorkerError('The animation code could not be parsed: ' + messageOf(error), 'eval');
  }
  let draw;
  try {
    draw = factory();
  } catch (error) {
    throw new ExportWorkerError('The animation code threw while loading: ' + messageOf(error), 'eval');
  }
  if (typeof draw !== 'function') {
    throw new ExportWorkerError(
      'The animation code must define function draw(ctx, t, width, height).',
      'eval',
    );
  }
  return draw;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.ceil(milliseconds)));
  });
}

let running = false;
let cancelled = false;

async function run(message) {
  const start = readStart(message);
  cancelled = false;

  let canvas;
  try {
    canvas = new OffscreenCanvas(start.width, start.height);
  } catch (error) {
    throw new ExportWorkerError('The export canvas could not be created: ' + messageOf(error), 'start');
  }
  const context = canvas.getContext('2d');
  if (context === null || context === undefined) {
    throw new ExportWorkerError('A 2D canvas context is unavailable in this browser.', 'start');
  }

  const draw = createDrawFunction(start.code);
  const frameCount = Math.max(1, Math.round(start.duration * start.fps));
  post({
    type: 'started',
    width: start.width,
    height: start.height,
    fps: start.fps,
    frames: frameCount,
  });

  // The Client records the canvas in real time (MediaRecorder/captureStream), so
  // each frame is released on a wall-clock schedule of one frame per 1/fps.
  // Bursting all frames would shorten the captured video.
  const startedAt = Date.now();
  let dueAt = startedAt;
  for (let index = 0; index < frameCount; index += 1) {
    const wait = dueAt - Date.now();
    if (wait > 0) await delay(wait);
    dueAt = startedAt + ((index + 1) * 1000) / start.fps;
    if (cancelled) {
      post({ type: 'done', frames: index, cancelled: true });
      return;
    }
    const t = index / start.fps;
    // Model code may leave a transform or clip path behind; a plain clearRect
    // would then cover only part of the canvas and leak pixels from earlier
    // frames. `reset()` clears all drawing state (and the state stack, so the
    // restore() below is a no-op on browsers that have it); the explicit
    // identity transform keeps the same guarantee for browsers without reset(),
    // where a left-behind clip path cannot be undone. A throwing draw() still
    // reports stage 'draw' as before.
    try {
      context.save();
      try {
        if (typeof context.reset === 'function') context.reset();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, start.width, start.height);
        draw(context, t, start.width, start.height);
      } finally {
        context.restore();
      }
    } catch (error) {
      throw new ExportWorkerError(
        'draw() failed at frame ' + index + ' (t=' + t.toFixed(3) + 's): ' + messageOf(error),
        'draw',
      );
    }
    let bitmap;
    try {
      bitmap = await createImageBitmap(canvas);
    } catch (error) {
      throw new ExportWorkerError('Frame ' + index + ' could not be captured: ' + messageOf(error), 'render');
    }
    post({
      type: 'frame',
      index,
      t,
      width: start.width,
      height: start.height,
      bitmap,
    }, [bitmap]);
  }

  post({ type: 'done', frames: frameCount, cancelled: false });
}

self.onmessage = function onMessage(event) {
  const message = event === null || event === undefined ? undefined : event.data;
  if (message === null || typeof message !== 'object') return;
  if (message.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (message.type !== 'start') return;
  if (running) {
    postError(new ExportWorkerError('An export is already running in this worker.', 'start'));
    return;
  }
  running = true;
  cancelled = false;
  run(message)
    .catch((error) => {
      postError(error);
    })
    .finally(() => {
      running = false;
    });
};

lockDownGlobals();
