import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Readable } from 'node:stream';

import { apply, inject } from '../deepseek-design-plugin/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'deepseek-design-plugin');
const WORKER_PATH = '/deepseek-design/export-worker.js';
const SESSION_MEDIA_PATH = '/deepseek-design/session-media';
const SESSION_ATTACHMENT_PATH = '/deepseek-design/session-attachment';
const SESSION_OBJECT_PATH = '/deepseek-design/session-object';
const SESSION_DELIVERABLE_PATH = '/deepseek-design/session-deliverable';
const TOOL_NAME = 'deepseek_design_export_video';
const MAX_CODE_CHARS = 2_000_000;
const WORKER_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'; img-src data: blob:";
const VALID_CODE = 'function draw(ctx, t, width, height) {\n  ctx.fillRect(0, 0, width, height);\n}\n';
const VALID_ARGUMENTS = { title: 'Night Drive', duration: 12, code: VALID_CODE };

/** Minimal Host fake: synchronous Service registries plus effect cleanup. */
function createFakeHarness(services = {}) {
  const definitions = new Map();
  const routes = new Map();
  const cleanups = [];
  const ctx = {
    tools: {
      register(definition) {
        assert.equal(typeof definition, 'object');
        assert.equal(typeof definition.name, 'string');
        assert.equal(definitions.has(definition.name), false, 'duplicate tool registration');
        definitions.set(definition.name, definition);
        return () => {
          definitions.delete(definition.name);
        };
      },
    },
    webServer: {
      register(route) {
        assert.equal(typeof route, 'object');
        assert.equal(route.kind, 'exact');
        assert.equal(routes.has(route.path), false, 'duplicate route registration');
        routes.set(route.path, route);
        return () => {
          routes.delete(route.path);
        };
      },
    },
    effect(fn) {
      const cleanup = fn();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
    get(name) {
      return services[name];
    },
  };
  apply(ctx);
  return {
    ctx,
    definitions,
    routes,
    getTool() {
      return definitions.get(TOOL_NAME);
    },
    getRoute(path = WORKER_PATH) {
      return routes.get(path);
    },
    dispose() {
      while (cleanups.length > 0) cleanups.pop()();
    },
  };
}

async function startServer(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end('handler failed');
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    port: address.port,
    // closeAllConnections releases idle keep-alive sockets so the callback is
    // not delayed until the server keep-alive timeout during tests.
    close: () => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    }),
  };
}

function request(port, path, method = 'GET', extraOptions = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, ...extraOptions }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function raceWithTimeout(promise, label) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timed out')), 5000);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test('Host registers one global tool, the worker route, and the session media routes', () => {
  assert.deepEqual(inject, ['tools', 'webServer']);
  assert.deepEqual([...new Set(inject)], ['tools', 'webServer'], 'inject must list each service once');

  const harness = createFakeHarness();
  try {
    assert.equal(harness.definitions.size, 1, 'exactly one tool is registered');
    assert.equal(harness.routes.size, 5, 'the worker, three session media routes, and the object/deliverable routes are registered');
    assert.equal(harness.routes.has('/deepseek-design/api'), false, 'the old chat API route must be gone');
    assert.equal(harness.routes.has(WORKER_PATH), true);
    assert.equal(harness.routes.has(SESSION_MEDIA_PATH), true);
    assert.equal(harness.routes.has(SESSION_ATTACHMENT_PATH), true);
    assert.equal(harness.routes.has(SESSION_OBJECT_PATH), true);
    assert.equal(harness.routes.has(SESSION_DELIVERABLE_PATH), true);

    const tool = harness.getTool();
    assert.equal(tool.name, TOOL_NAME);
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 80, 'tool description must explain purpose, code contract, and limits');
    assert.equal(typeof tool.execute, 'function');
    assert.equal(typeof tool.output, 'object');
    assert.equal(typeof tool.output.render, 'function');

    const route = harness.getRoute();
    assert.equal(route.kind, 'exact');
    assert.equal(typeof route.handler, 'function');
  } finally {
    harness.dispose();
  }

  assert.equal(harness.definitions.size, 0, 'dispose unregisters the tool');
  assert.equal(harness.routes.size, 0, 'dispose unregisters every route');
});

test('Export tool schema advertises the documented parameters, enums, and hard limits', () => {
  const harness = createFakeHarness();
  try {
    const tool = harness.getTool();
    const parameters = tool.parameters;
    assert.equal(parameters.type, 'object');
    assert.equal(parameters.additionalProperties, false);
    assert.deepEqual(parameters.required, ['title', 'duration', 'code']);
    assert.deepEqual(Object.keys(parameters.properties), ['title', 'duration', 'code', 'aspect', 'resolution', 'fps']);

    assert.equal(parameters.properties.title.type, 'string');
    assert.equal(parameters.properties.code.type, 'string');
    assert.equal(parameters.properties.code.maxLength, MAX_CODE_CHARS);
    assert.equal(parameters.properties.duration.type, 'number');
    assert.equal(parameters.properties.duration.minimum, 1);
    assert.equal(parameters.properties.duration.maximum, 600);
    assert.deepEqual(parameters.properties.aspect.enum, ['16:9', '2.39:1', '21:9', '4:3', '1:1', '3:4', '4:5', '9:16']);
    assert.deepEqual(parameters.properties.resolution.enum, ['1080p', '4k']);
    assert.deepEqual(parameters.properties.fps.enum, [24, 30, 60]);

    const schema = tool.output.schema;
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ['status', 'message']);
    assert.deepEqual(schema.properties.status.enum, ['queued']);
    assert.equal(schema.properties.message.type, 'string');
  } finally {
    harness.dispose();
  }
});

test('Export tool normalizes defaults, returns only a queued receipt, and renders one text block', async () => {
  const harness = createFakeHarness();
  try {
    const tool = harness.getTool();

    const queued = await tool.execute({ ...VALID_ARGUMENTS }, {});
    assert.deepEqual(Object.keys(queued), ['status', 'message']);
    assert.equal(queued.status, 'queued');
    assert.equal(typeof queued.message, 'string');
    assert.match(queued.message, /Night Drive/);
    assert.match(queued.message, /12s/);
    assert.match(queued.message, /1080p/);
    assert.match(queued.message, /16:9/);
    assert.match(queued.message, /30 fps/);

    const blocks = tool.output.render({}, queued);
    assert.deepEqual(blocks, [{ type: 'text', text: queued.message }]);

    const explicit = await tool.execute({
      ...VALID_ARGUMENTS,
      title: '  Vertical Cut  ',
      aspect: '9:16',
      resolution: '4k',
      fps: 24,
    }, {});
    assert.match(explicit.message, /Vertical Cut/);
    assert.match(explicit.message, /4k/);
    assert.match(explicit.message, /9:16/);
    assert.match(explicit.message, /24 fps/);
    assert.doesNotMatch(explicit.message, /1080p/);

    const nullOptional = await tool.execute({
      ...VALID_ARGUMENTS,
      aspect: null,
      resolution: null,
      fps: null,
    }, {});
    assert.equal(nullOptional.status, 'queued');
    assert.match(nullOptional.message, /1080p/);

    const boundary = await tool.execute({ title: 'Bounds', duration: 1, code: VALID_CODE }, {});
    assert.match(boundary.message, /1s/);
    const long = await tool.execute({ title: 'Long', duration: 600, code: VALID_CODE }, {});
    assert.match(long.message, /600s/);

    const maxCode = await tool.execute({
      title: 'Max code',
      duration: 1,
      code: 'x'.repeat(MAX_CODE_CHARS),
    }, {});
    assert.equal(maxCode.status, 'queued');
  } finally {
    harness.dispose();
  }
});

test('Export tool re-validates every limited argument inside execute', async () => {
  const harness = createFakeHarness();
  try {
    const tool = harness.getTool();
    const rejected = async (args, pattern, label) => {
      await assert.rejects(() => tool.execute(args, {}), pattern, label);
    };

    await rejected({ duration: 10, code: VALID_CODE }, /title/, 'missing title');
    await rejected({ ...VALID_ARGUMENTS, title: '   ' }, /title/, 'blank title');
    await rejected({ ...VALID_ARGUMENTS, duration: undefined }, /duration/, 'missing duration');
    await rejected({ ...VALID_ARGUMENTS, duration: '10' }, /duration/, 'string duration');
    await rejected({ ...VALID_ARGUMENTS, duration: 0.5 }, /duration/, 'duration under 1s');
    await rejected({ ...VALID_ARGUMENTS, duration: 601 }, /duration/, 'duration over 600s');
    await rejected({ ...VALID_ARGUMENTS, duration: Number.NaN }, /duration/, 'NaN duration');
    await rejected({ ...VALID_ARGUMENTS, code: '' }, /code/, 'missing code');
    await rejected({ ...VALID_ARGUMENTS, code: '   ' }, /code/, 'blank code');
    await rejected({ title: 'Too big', duration: 1, code: 'x'.repeat(MAX_CODE_CHARS + 1) }, /2,000,000 characters/, 'oversized code');
    await rejected({ ...VALID_ARGUMENTS, aspect: '5:4' }, /aspect/, 'unknown aspect');
    await rejected({ ...VALID_ARGUMENTS, resolution: '8k' }, /resolution/, 'unknown resolution');
    await rejected({ ...VALID_ARGUMENTS, fps: 25 }, /fps/, 'unknown fps');
    await rejected({ ...VALID_ARGUMENTS, resolution: '4k', fps: 60 }, /4k.*60|60.*4k/, '4k must reject 60 fps');
    await assert.rejects(() => tool.execute(null, {}), /title/, 'non-object arguments');
  } finally {
    harness.dispose();
  }
});

test('Worker route serves the package worker script on GET and HEAD with static headers', async () => {
  const harness = createFakeHarness();
  const route = harness.getRoute();
  const expected = readFileSync(join(PLUGIN, 'export-worker.js'));
  const server = await startServer(route.handler);
  try {
    const get = await request(server.port, WORKER_PATH, 'GET');
    assert.equal(get.status, 200);
    assert.equal(get.body.equals(expected), true, 'GET body must be the package file byte-for-byte');
    assert.match(get.headers['content-type'], /^text\/javascript\b/);
    assert.equal(get.headers['cache-control'], 'no-store');
    assert.equal(get.headers['x-content-type-options'], 'nosniff');
    assert.equal(get.headers['content-security-policy'], WORKER_CSP);
    assert.equal(get.headers['content-length'], String(expected.byteLength));

    const head = await request(server.port, WORKER_PATH, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0, 'HEAD returns no body');
    assert.match(head.headers['content-type'], /^text\/javascript\b/);
    assert.equal(head.headers['cache-control'], 'no-store');
    assert.equal(head.headers['x-content-type-options'], 'nosniff');
    assert.equal(head.headers['content-security-policy'], WORKER_CSP);
    assert.equal(head.headers['content-length'], String(expected.byteLength));
  } finally {
    await server.close();
    harness.dispose();
  }
});

test('Worker route answers 405 with an Allow header for every other method', async () => {
  const harness = createFakeHarness();
  const route = harness.getRoute();
  const server = await startServer(route.handler);
  try {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await request(server.port, WORKER_PATH, method);
      assert.equal(response.status, 405, method + ' must be rejected');
      assert.equal(response.headers.allow, 'GET, HEAD');
    }
  } finally {
    await server.close();
    harness.dispose();
  }
});

test('Session media routes import only explicitly exported video/audio files', async () => {
  const videoRef = { attachmentId: 'sha256:video-1', name: 'final.mp4', bytes: 3 };
  const audioRef = { attachmentId: 'sha256:audio-1', name: 'score.wav', bytes: 3 };
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-media-'));
  const deliveredVideo = join(tempDir, 'presented.mp4');
  writeFileSync(deliveredVideo, Buffer.from([7, 8, 9]));
  const sessionQuery = {
    async readSession() {
      return {
        events: [
          {
            type: 'assistant/message',
            time: 50,
            data: { message: { role: 'assistant', content: [{ type: 'image', attachment: { attachmentId: 'assistant-image', mediaType: 'image/png', bytes: 3, width: 10, height: 10, name: 'frame.png' } }] } },
          },
          { type: 'tool/call', time: 90, data: { callId: 'call-present-video', name: 'present', arguments: '{}' } },
          { type: 'tool/result', time: 100, data: { message: { role: 'tool', toolCallId: 'call-present-video', content: [{ type: 'file', attachment: videoRef }] } } },
          { type: 'tool/call', time: 120, data: { callId: 'call-generate-video', name: 'generate_video', arguments: '{}' } },
          { type: 'tool/result', time: 130, data: { message: { role: 'tool', toolCallId: 'call-generate-video', content: [{ type: 'file', attachment: { attachmentId: 'intermediate-video', name: 'temp.mp4', bytes: 3 } }] } } },
          { type: 'tool/call', time: 140, data: { callId: 'call-read', name: 'read_image', arguments: '{}' } },
          { type: 'tool/result', time: 150, data: { message: { role: 'tool', toolCallId: 'call-read', content: [{ type: 'image', attachment: { attachmentId: 'read-only', mediaType: 'image/png', bytes: 3, width: 10, height: 10, name: 'screen.png' } }] } } },
          { type: 'tool/call', time: 160, data: { callId: 'call-present-audio', name: 'deepseek_design_export_audio', arguments: '{}' } },
          { type: 'tool/result', time: 170, data: { message: { role: 'tool', toolCallId: 'call-present-audio', content: [{ type: 'file', attachment: audioRef }] } } },
          { type: 'deliverables/presented', time: 180, data: { files: [{ path: deliveredVideo, description: 'final video' }] } },
          {
            type: 'user/message',
            time: 300,
            data: { message: { role: 'user', content: [{ type: 'image', attachment: { attachmentId: 'user-only', mediaType: 'image/png', bytes: 3, width: 10, height: 10, name: 'user.png' } }] } },
          },
        ],
      };
    },
    async readSurface() {
      return { events: [] };
    },
  };
  const attachments = {
    async readImage(ref) {
      return { ref, data: new Uint8Array([1, 2, 3]) };
    },
    async *readFileStream() {
      yield new Uint8Array([4, 5, 6]);
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const listRoute = harness.getRoute(SESSION_MEDIA_PATH);
  const attachmentRoute = harness.getRoute(SESSION_ATTACHMENT_PATH);
  assert.equal(typeof listRoute.handler, 'function');
  assert.equal(typeof attachmentRoute.handler, 'function');
  const listServer = await startServer(listRoute.handler);
  const attachmentServer = await startServer(attachmentRoute.handler);
  try {
    const list = await request(listServer.port, SESSION_MEDIA_PATH + '?sessionId=session-1');
    assert.equal(list.status, 200);
    const payload = JSON.parse(list.body.toString('utf8'));
    assert.equal(payload.ok, true);
    assert.equal(payload.version, 1);
    assert.equal(payload.filtered, true);
    assert.equal(payload.items.length, 3);
    assert.deepEqual(payload.items.map((item) => item.kind), ['video', 'audio', 'video']);
    assert.equal(payload.items[0].name, 'final.mp4');
    assert.equal(payload.items[1].name, 'score.wav');
    assert.equal(payload.items[2].name, 'presented.mp4');
    const video = await request(attachmentServer.port, payload.items[0].url);
    assert.equal(video.status, 200);
    assert.equal(video.headers['content-type'], 'video/mp4');
    assert.deepEqual([...video.body], [4, 5, 6]);
    const audio = await request(attachmentServer.port, payload.items[1].url);
    assert.equal(audio.status, 200);
    assert.equal(audio.headers['content-type'], 'audio/wav');
    assert.deepEqual([...audio.body], [4, 5, 6]);
    const delivered = await request(attachmentServer.port, payload.items[2].url);
    assert.equal(delivered.status, 200);
    assert.equal(delivered.headers['content-type'], 'video/mp4');
    assert.deepEqual([...delivered.body], [7, 8, 9]);
    const missing = await request(attachmentServer.port, SESSION_ATTACHMENT_PATH + '?sessionId=session-1&attachmentId=sha256:nope');
    assert.equal(missing.status, 404);
    const badMethod = await request(listServer.port, SESSION_MEDIA_PATH, 'POST');
    assert.equal(badMethod.status, 405);
    assert.equal(badMethod.headers.allow, 'GET, HEAD');
  } finally {
    await listServer.close();
    await attachmentServer.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Host source no longer contains the old chat, model, scene, or skill bridge', () => {
  const source = readFileSync(join(PLUGIN, 'index.js'), 'utf8');
  assert.doesNotMatch(source, /deepseek-design\/api/, 'the old HTTP API path must be gone');
  assert.doesNotMatch(source, /MOTION_SKILL|createHostBridge|systemPrompt/);
  assert.doesNotMatch(source, /llm\.listProviders|resolveModelInfo|model-directory/);
  assert.doesNotMatch(source, /skills\.register|skills\.list|skill-directory/);
  assert.doesNotMatch(source, /SCENE_TYPES|sanitizeSpec|generation-timeout/);
});

/*
 * The worker is verified against a fake Worker global scope (OffscreenCanvas,
 * createImageBitmap, postMessage). This proves the protocol, the frame math, and
 * the lockdown; it does not claim real browser rendering.
 */

test('Conversation object routes stream user files, user images, and delivered files', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-object-'));
  const deliveredPng = join(tempDir, 'delivered.png');
  writeFileSync(deliveredPng, Buffer.from([9, 9, 9]));
  const sessionQuery = {
    async readSession() {
      return {
        events: [
          {
            type: 'user/message',
            time: 10,
            data: { message: { role: 'user', content: [
              { type: 'file', attachment: { attachmentId: 'sha256:user-file', name: 'notes.txt', bytes: 3 } },
              { type: 'image', attachment: { attachmentId: 'sha256:user-image', name: 'photo.png', bytes: 3, mediaType: 'image/png', width: 4, height: 4 } },
            ] } },
          },
          { type: 'deliverables/presented', time: 20, data: { files: [{ path: deliveredPng, description: 'delivered image' }] } },
        ],
      };
    },
    async readSurface() {
      return { events: [] };
    },
  };
  const attachments = {
    async readImage(ref) {
      return { ref, data: new Uint8Array([1, 2, 3]) };
    },
    async *readFileStream() {
      yield new Uint8Array([4, 5, 6]);
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const objectRoute = harness.getRoute(SESSION_OBJECT_PATH);
  const deliverableRoute = harness.getRoute(SESSION_DELIVERABLE_PATH);
  assert.equal(typeof objectRoute.handler, 'function');
  assert.equal(typeof deliverableRoute.handler, 'function');
  const objectServer = await startServer(objectRoute.handler);
  const deliverableServer = await startServer(deliverableRoute.handler);
  try {
    const userFile = await request(objectServer.port, SESSION_OBJECT_PATH + '?sessionId=session-1&attachmentId=sha256:user-file');
    assert.equal(userFile.status, 200);
    assert.deepEqual([...userFile.body], [4, 5, 6]);
    const userImage = await request(objectServer.port, SESSION_OBJECT_PATH + '?sessionId=session-1&attachmentId=sha256:user-image');
    assert.equal(userImage.status, 200);
    assert.equal(userImage.headers['content-type'], 'image/png');
    assert.deepEqual([...userImage.body], [1, 2, 3]);
    const delivered = await request(deliverableServer.port, SESSION_DELIVERABLE_PATH + '?sessionId=session-1&path=' + encodeURIComponent(deliveredPng));
    assert.equal(delivered.status, 200);
    assert.deepEqual([...delivered.body], [9, 9, 9]);
    const draft = await request(objectServer.port, SESSION_OBJECT_PATH + '?sessionId=session-1&attachmentId=draft-attachment&name=draft.wav&bytes=3');
    assert.equal(draft.status, 200);
    assert.deepEqual([...draft.body], [4, 5, 6]);
    const missing = await request(objectServer.port, SESSION_OBJECT_PATH + '?sessionId=session-1&attachmentId=missing');
    assert.equal(missing.status, 404);
    const missingPath = await request(deliverableServer.port, SESSION_DELIVERABLE_PATH + '?sessionId=session-1&path=/tmp/not-presented');
    assert.equal(missingPath.status, 404);
  } finally {
    await objectServer.close();
    await deliverableServer.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function createWorkerDriver() {
  const messages = [];
  const canvases = [];
  let settleResolve;
  const settled = new Promise((resolve) => {
    settleResolve = resolve;
  });

  function createContext2D() {
    const calls = [];
    const context = new Proxy({ calls }, {
      get(target, property) {
        if (property in target) return target[property];
        if (typeof property !== 'string') return undefined;
        return (...args) => {
          calls.push({ method: property, args });
        };
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    });
    return context;
  }

  class FakeOffscreenCanvas {
    constructor(width, height) {
      if (!Number.isInteger(width) || !Number.isInteger(height)) {
        throw new TypeError('OffscreenCanvas needs integer dimensions');
      }
      this.width = width;
      this.height = height;
      this.context = createContext2D();
      canvases.push(this);
    }

    getContext(type) {
      return type === '2d' ? this.context : null;
    }
  }

  const bitmaps = [];
  async function createImageBitmap(canvas) {
    const bitmap = {
      width: canvas.width,
      height: canvas.height,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    bitmaps.push(bitmap);
    return bitmap;
  }

  const sandbox = {
    self: null,
    console,
    setTimeout,
    clearTimeout,
    OffscreenCanvas: FakeOffscreenCanvas,
    createImageBitmap,
    postMessage(message, transfer) {
      messages.push({
        message,
        transfer: Array.isArray(transfer) ? [...transfer] : [],
        at: Date.now(),
      });
      if (message !== null && typeof message === 'object' && (message.type === 'done' || message.type === 'error')) {
        settleResolve(message);
      }
    },
  };
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(PLUGIN, 'export-worker.js'), 'utf8'), context, {
    filename: 'export-worker.js',
  });

  return {
    sandbox,
    messages,
    bitmaps,
    canvases,
    settled,
    send(data) {
      sandbox.onmessage({ data });
    },
    frames() {
      return messages.filter(({ message }) => message.type === 'frame').map(({ message }) => message);
    },
    started() {
      return messages.find(({ message }) => message.type === 'started')?.message ?? null;
    },
  };
}

test('Export worker paints, clears, and transfers one ImageBitmap per frame', async () => {
  const driver = createWorkerDriver();
  const code = 'function draw(ctx, t, width, height) { ctx.fillRect(t, width, height); }';
  driver.send({ type: 'start', code, duration: 0.5, width: 320, height: 180, fps: 4 });
  const result = await raceWithTimeout(driver.settled, 'worker run');

  assert.equal(result.type, 'done');
  assert.equal(result.frames, 2);
  assert.equal(result.cancelled, false);
  assert.deepEqual({ ...driver.started() }, { type: 'started', width: 320, height: 180, fps: 4, frames: 2 });

  const frames = driver.frames();
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map((frame) => frame.index), [0, 1]);
  assert.deepEqual(frames.map((frame) => frame.t), [0, 0.25]);
  for (const [index, frame] of frames.entries()) {
    assert.equal(frame.width, 320);
    assert.equal(frame.height, 180);
    assert.equal(frame.bitmap, driver.bitmaps[index], 'the bitmap is the transferred ImageBitmap');
    const entry = driver.messages.filter(({ message }) => message.type === 'frame')[index];
    assert.deepEqual(entry.transfer, [frame.bitmap]);
  }

  const context = driver.canvases[0].context;
  const clears = context.calls.filter((call) => call.method === 'clearRect');
  assert.equal(clears.length, 2, 'every frame starts from a cleared canvas');
  assert.deepEqual(clears.map((call) => call.args), [[0, 0, 320, 180], [0, 0, 320, 180]]);
  const fills = context.calls.filter((call) => call.method === 'fillRect');
  assert.deepEqual(fills.map((call) => call.args), [[0, 320, 180], [0.25, 320, 180]], 'draw receives t, width, height');

  const frameEntries = driver.messages.filter(({ message }) => message.type === 'frame');
  assert.ok(
    frameEntries[1].at - frameEntries[0].at >= 180,
    'frames are paced to the frame rate so a real-time recording keeps the requested duration',
  );
});

test('Export worker posts a start-stage error for invalid start messages', async () => {
  const cases = [
    { code: '', duration: 5, width: 100, height: 100, fps: 30 },
    { code: 'function draw() {}', duration: 0, width: 100, height: 100, fps: 30 },
    { code: 'function draw() {}', duration: 5, width: 0, height: 100, fps: 30 },
    { code: 'function draw() {}', duration: 5, width: 100, height: 10.5, fps: 30 },
    { code: 'function draw() {}', duration: 5, width: 100, height: 100, fps: 0 },
    { code: 'x'.repeat(MAX_CODE_CHARS + 1), duration: 5, width: 100, height: 100, fps: 30 },
  ];
  for (const start of cases) {
    const driver = createWorkerDriver();
    driver.send({ type: 'start', ...start });
    const result = await raceWithTimeout(driver.settled, 'invalid start');
    assert.equal(result.type, 'error');
    assert.equal(result.stage, 'start');
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0);
    assert.equal(driver.frames().length, 0, 'invalid start must not paint frames');
  }
});

test('Export worker posts an eval-stage error when the code is invalid or has no draw()', async () => {
  const cases = [
    { code: 'const answer = 42;', pattern: /must define function draw/ },
    { code: 'function draw(ctx, t) {', pattern: /could not be parsed/ },
    { code: 'throw new Error("boot failure");', pattern: /threw while loading.*boot failure/ },
    { code: 'const draw = 7;', pattern: /must define function draw/ },
  ];
  for (const item of cases) {
    const driver = createWorkerDriver();
    driver.send({ type: 'start', code: item.code, duration: 5, width: 100, height: 100, fps: 30 });
    const result = await raceWithTimeout(driver.settled, 'eval error');
    assert.equal(result.type, 'error');
    assert.equal(result.stage, 'eval');
    assert.match(result.message, item.pattern);
    assert.equal(driver.frames().length, 0);
  }
});

test('Export worker blocks network globals and reports errors thrown by draw()', async () => {
  const driver = createWorkerDriver();
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
    assert.equal(typeof driver.sandbox[name], 'function', name + ' must be shadowed with a block');
    assert.throws(() => driver.sandbox[name](), new RegExp(name + ' is disabled'));
  }
  assert.equal(typeof driver.sandbox.postMessage, 'function', 'postMessage must stay available');

  driver.send({
    type: 'start',
    code: 'function draw() { fetch("https://example.com/frame.png"); }',
    duration: 0.5,
    width: 160,
    height: 90,
    fps: 2,
  });
  const result = await raceWithTimeout(driver.settled, 'draw error');
  assert.equal(result.type, 'error');
  assert.equal(result.stage, 'draw');
  assert.match(result.message, /frame 0/);
  assert.match(result.message, /fetch is disabled/);
});

test('Export worker stops on cancel and reports a cancelled run', async () => {
  const driver = createWorkerDriver();
  driver.send({
    type: 'start',
    code: 'function draw(ctx) { ctx.fillRect(0, 0, 1, 1); }',
    duration: 10,
    width: 64,
    height: 64,
    fps: 30,
  });
  assert.ok(driver.started() !== null, 'the run must start before it can be cancelled');
  driver.send({ type: 'cancel' });
  const result = await raceWithTimeout(driver.settled, 'cancelled run');
  assert.equal(result.type, 'done');
  assert.equal(result.cancelled, true);
  assert.ok(result.frames < 300, 'cancel must stop before all frames are painted');
});

async function waitForWorkerMessage(driver, predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = driver.messages.find((entry) => predicate(entry.message));
    if (found !== undefined) return found.message;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(label + ' timed out');
}

test('Export tool execute accepts schema boundaries and formats the receipt', async () => {
  const harness = createFakeHarness();
  try {
    const tool = harness.getTool();
    const fractional = await tool.execute({ title: 'Cut', duration: 1.5, code: VALID_CODE }, {});
    assert.equal(fractional.status, 'queued');
    assert.match(fractional.message, /1\.5s/);
    assert.match(fractional.message, /1080p, 16:9, 30 fps/);

    const longTitle = await tool.execute({ title: 'x'.repeat(250), duration: 1, code: VALID_CODE }, {});
    assert.equal(longTitle.message.includes('x'.repeat(200)), true, 'titles are capped at 200 characters');
    assert.equal(longTitle.message.includes('x'.repeat(201)), false);

    const wide4k = await tool.execute({ ...VALID_ARGUMENTS, aspect: '21:9', resolution: '4k', fps: 24 }, {});
    assert.match(wide4k.message, /4k, 21:9, 24 fps/);
    const sixty = await tool.execute({ ...VALID_ARGUMENTS, resolution: '1080p', fps: 60 }, {});
    assert.match(sixty.message, /1080p, 16:9, 60 fps/);

    for (const raw of [[], 'args', 42, true]) {
      await assert.rejects(() => tool.execute(raw, {}), /title/, 'non-object arguments are treated as empty');
    }
    // The renderer always returns one text block, even for a malformed value.
    assert.deepEqual(tool.output.render({}, null), [{ type: 'text', text: 'The export is queued.' }]);
    assert.deepEqual(tool.output.render({}, { message: '' }), [{ type: 'text', text: 'The export is queued.' }]);
  } finally {
    harness.dispose();
  }
});

test('Export worker ignores junk messages and early cancels', async () => {
  const driver = createWorkerDriver();
  driver.send(null);
  driver.send(undefined);
  driver.send('start');
  driver.send({ type: 'unknown' });
  driver.send({ type: 'cancel' });
  assert.equal(driver.messages.length, 0, 'junk messages must not produce worker output');
  driver.send({
    type: 'start',
    code: 'function draw(ctx) { ctx.fillRect(0, 0, 1, 1); }',
    duration: 0.25,
    width: 64,
    height: 64,
    fps: 4,
  });
  const result = await raceWithTimeout(driver.settled, 'run after junk');
  assert.equal(result.type, 'done');
  assert.equal(result.cancelled, false, 'a cancel sent before start must not cancel the next run');
  assert.equal(result.frames, 1);
  assert.equal(driver.frames().length, 1);
  assert.equal(driver.frames()[0].index, 0);
});

test('Export worker rejects a second start while a run is active', async () => {
  const driver = createWorkerDriver();
  driver.send({ type: 'start', code: 'function draw() {}', duration: 10, width: 64, height: 64, fps: 30 });
  assert.ok(driver.started() !== null, 'the first run must start');
  driver.send({ type: 'start', code: 'function draw() {}', duration: 1, width: 64, height: 64, fps: 30 });
  const busy = await waitForWorkerMessage(driver, (message) => message.type === 'error', 'busy rejection');
  assert.equal(busy.stage, 'start');
  assert.match(busy.message, /already running/);
  assert.equal(
    driver.messages.filter((entry) => entry.message.type === 'started').length,
    1,
    'the rejected start must not begin a second run',
  );
  driver.send({ type: 'cancel' });
  const done = await waitForWorkerMessage(driver, (message) => message.type === 'done', 'cancelled run');
  assert.equal(done.cancelled, true);
  assert.equal(done.frames, driver.frames().length, 'done.frames must equal the frames that were painted');
});

// ---------------------------------------------------------------------------
// Regressions for the Host fixes (index.js): session attachment refresh after
// the first scan, delivered-file stream lifecycle / fresh Content-Length, and
// full image-reference passthrough. Product files are frozen; these mirror the
// final implementation in index.js.
// ---------------------------------------------------------------------------

function openDescriptorCount() {
  try {
    return readdirSync('/dev/fd').length;
  } catch {
    return null;
  }
}

async function waitForCondition(predicate, label, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(label + ' timed out after ' + timeoutMs + 'ms');
}

/** A Readable whose lifecycle is observable; it has no backing file descriptor. */
function trackedReadable(chunks) {
  const events = [];
  const state = { events, readCalls: 0, stream: null };
  state.stream = new Readable({
    read() {
      state.readCalls += 1;
      for (const chunk of chunks) this.push(chunk);
      this.push(null);
    },
    destroy(error, callback) {
      events.push('destroy');
      callback(error);
    },
  });
  state.stream.on('close', () => events.push('close'));
  return state;
}

test('Session media refresh surfaces exports added after the first scan (regression)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-refresh-'));
  const deliveredOne = join(tempDir, 'presented-one.mp4');
  writeFileSync(deliveredOne, Buffer.from([7, 8, 9]));
  const deliveredTwo = join(tempDir, 'presented-two.mp4');
  const baseEvents = [
    { seq: 1, type: 'tool/call', time: 90, data: { callId: 'call-first', name: 'deepseek_design_export_video' } },
    {
      seq: 2,
      type: 'tool/result',
      time: 100,
      data: {
        message: {
          role: 'tool',
          toolCallId: 'call-first',
          content: [{ type: 'file', attachment: { attachmentId: 'sha256:first-export', name: 'first.mp4', bytes: 3 } }],
        },
      },
    },
    { seq: 3, type: 'deliverables/presented', time: 110, data: { files: [{ path: deliveredOne }] } },
    {
      seq: 4,
      type: 'assistant/message',
      time: 120,
      data: { message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } },
    },
  ];
  const surfaceEvents = [baseEvents[3]];
  let appendedEvents = [];
  let capturedThroughSeq = 4;
  let readSessionCalls = 0;
  let readSurfaceCalls = 0;
  const sessionQuery = {
    async readSession() {
      readSessionCalls += 1;
      return { events: [...baseEvents, ...appendedEvents] };
    },
    async readSurface() {
      readSurfaceCalls += 1;
      // Surface reads never contain tool/call, tool/result, or deliverables.
      return { capturedThroughSeq, events: surfaceEvents };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments: {} });
  const sessionId = 'refresh-regression-1';
  const mediaServer = await startServer(harness.getRoute(SESSION_MEDIA_PATH).handler);
  const deliverableServer = await startServer(harness.getRoute(SESSION_DELIVERABLE_PATH).handler);
  try {
    const firstList = JSON.parse((await request(mediaServer.port, SESSION_MEDIA_PATH + '?sessionId=' + sessionId)).body.toString('utf8'));
    assert.deepEqual([...firstList.items.map((item) => item.name)], ['first.mp4', 'presented-one.mp4']);
    const firstDeliverable = await request(
      deliverableServer.port,
      SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(deliveredOne),
    );
    assert.equal(firstDeliverable.status, 200);
    assert.deepEqual([...firstDeliverable.body], [7, 8, 9]);
    assert.equal(readSessionCalls, 1, 'the first scan reads the full session once');

    // Polling an unchanged transcript stays on the cheap surface read.
    const steadyList = JSON.parse((await request(mediaServer.port, SESSION_MEDIA_PATH + '?sessionId=' + sessionId)).body.toString('utf8'));
    assert.equal(steadyList.items.length, 2);
    assert.equal(readSessionCalls, 1, 'an unchanged capturedThroughSeq must not re-read the full log');
    assert.ok(readSurfaceCalls >= 2, 'later polls use the surface read');

    // New exports and deliveries appear only in the full transcript log.
    writeFileSync(deliveredTwo, Buffer.from([1, 2, 3, 4]));
    appendedEvents = [
      { seq: 5, type: 'tool/call', time: 200, data: { callId: 'call-second', name: 'present_export_video' } },
      {
        seq: 6,
        type: 'tool/result',
        time: 210,
        data: {
          message: {
            role: 'tool',
            toolCallId: 'call-second',
            content: [{ type: 'file', attachment: { attachmentId: 'sha256:second-export', name: 'second.mp4', bytes: 3 } }],
          },
        },
      },
      { seq: 7, type: 'deliverables/presented', time: 220, data: { files: [{ path: deliveredTwo }] } },
    ];
    capturedThroughSeq = 7;
    const refreshedList = JSON.parse((await request(mediaServer.port, SESSION_MEDIA_PATH + '?sessionId=' + sessionId)).body.toString('utf8'));
    assert.deepEqual(
      [...refreshedList.items.map((item) => item.name)],
      ['first.mp4', 'presented-one.mp4', 'second.mp4', 'presented-two.mp4'],
    );
    assert.equal(readSessionCalls, 2, 'an advanced capturedThroughSeq re-reads the full log exactly once');
    const secondDeliverable = await request(
      deliverableServer.port,
      SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(deliveredTwo),
    );
    assert.equal(secondDeliverable.status, 200);
    assert.deepEqual([...secondDeliverable.body], [1, 2, 3, 4]);
    assert.equal(readSessionCalls, 2, 'the refreshed cache already holds the new delivered path');
    // Kept behaviour: non-GET/HEAD is 405, unknown deliverables stay 404.
    const badMethod = await request(mediaServer.port, SESSION_MEDIA_PATH, 'POST');
    assert.equal(badMethod.status, 405);
    assert.equal(badMethod.headers.allow, 'GET, HEAD');
    assert.equal(badMethod.headers['x-content-type-options'], 'nosniff', '405 responses are nosniff');
    const badRequest = await request(mediaServer.port, SESSION_MEDIA_PATH);
    assert.equal(badRequest.status, 400);
    assert.equal(badRequest.headers['x-content-type-options'], 'nosniff', '400 responses are nosniff');
    const unknownDeliverable = await request(
      deliverableServer.port,
      SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(join(tempDir, 'nope.mp4')),
    );
    assert.equal(unknownDeliverable.status, 404);
    assert.equal(unknownDeliverable.headers['x-content-type-options'], 'nosniff', '404 responses are nosniff');
  } finally {
    await mediaServer.close();
    await deliverableServer.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Session deliverable HEAD closes the read descriptor and GET streams the file (regression)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-head-'));
  const delivered = join(tempDir, 'delivered.mp4');
  writeFileSync(delivered, Buffer.from([7, 8, 9]));
  const sessionQuery = {
    async readSession() {
      return { events: [{ seq: 1, type: 'deliverables/presented', time: 10, data: { files: [{ path: delivered }] } }] };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments: {} });
  const sessionId = 'head-regression-1';
  const server = await startServer(harness.getRoute(SESSION_DELIVERABLE_PATH).handler);
  const url = SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(delivered);
  try {
    const first = await request(server.port, url, 'HEAD');
    assert.equal(first.status, 200);
    assert.equal(first.headers['content-length'], '3');
    assert.equal(first.body.length, 0, 'HEAD returns no body');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Descriptor-leak check (macOS/Linux /dev/fd): a leaked read stream would
    // keep one descriptor per HEAD request open.
    const before = openDescriptorCount();
    if (before !== null) {
      for (let index = 0; index < 8; index += 1) {
        const head = await request(server.port, url, 'HEAD');
        assert.equal(head.status, 200);
        assert.equal(head.body.length, 0);
      }
      await waitForCondition(() => {
        const current = openDescriptorCount();
        return current !== null && current <= before + 2;
      }, 'HEAD descriptor cleanup', 4000);
      const after = openDescriptorCount();
      assert.ok(
        after - before <= 2,
        'HEAD must destroy the file stream, but ' + (after - before) + ' descriptors stayed open',
      );
    }

    const get = await request(server.port, url);
    assert.equal(get.status, 200);
    assert.equal(get.headers['content-length'], '3');
    assert.deepEqual([...get.body], [7, 8, 9]);
    if (before !== null) {
      await waitForCondition(() => {
        const current = openDescriptorCount();
        return current !== null && current <= before + 2;
      }, 'GET descriptor cleanup', 4000);
    }
  } finally {
    await server.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Session object streams are destroyed on HEAD, closed on GET, and torn down on abort (regression)', async () => {
  const chunkBytes = 16 * 1024;
  const bigBytes = 256 * chunkBytes;
  const sessionQuery = {
    async readSession() {
      return {
        events: [{
          seq: 1,
          type: 'assistant/message',
          time: 10,
          data: {
            message: {
              role: 'assistant',
              content: [
                { type: 'file', attachment: { attachmentId: 'sha256:stream-small', name: 'notes.txt', bytes: 3 } },
                { type: 'file', attachment: { attachmentId: 'sha256:stream-big', name: 'big.bin', bytes: bigBytes } },
              ],
            },
          },
        }],
      };
    },
  };
  const queue = [];
  const readFileStreamCalls = [];
  const attachments = {
    async readFileStream(ref) {
      readFileStreamCalls.push({ ...ref });
      const next = queue.shift();
      if (next === undefined) throw new Error('no queued stream for ' + ref.attachmentId);
      return next.stream;
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const sessionId = 'stream-lifecycle-1';
  const server = await startServer(harness.getRoute(SESSION_OBJECT_PATH).handler);
  const smallUrl = SESSION_OBJECT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + encodeURIComponent('sha256:stream-small');
  const bigUrl = SESSION_OBJECT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + encodeURIComponent('sha256:stream-big');
  try {
    // HEAD: destroy the stream without pulling a single byte.
    const headTracked = trackedReadable([Buffer.from([4, 5, 6])]);
    queue.push(headTracked);
    const head = await request(server.port, smallUrl, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-length'], '3');
    assert.equal(head.body.length, 0);
    await waitForCondition(() => headTracked.stream.destroyed, 'HEAD stream destruction', 3000);
    assert.equal(headTracked.stream.destroyed, true, 'HEAD must destroy the read stream');
    assert.ok(headTracked.events.includes('close'), 'HEAD must close the read stream');
    assert.equal(headTracked.readCalls, 0, 'HEAD must not consume stream bytes');

    // GET: fully consume and close after completion.
    const getTracked = trackedReadable([Buffer.from([4, 5, 6])]);
    queue.push(getTracked);
    const get = await request(server.port, smallUrl);
    assert.equal(get.status, 200);
    assert.equal(get.headers['content-length'], '3');
    assert.deepEqual([...get.body], [4, 5, 6]);
    await waitForCondition(() => getTracked.stream.destroyed, 'GET stream close', 3000);
    assert.ok(getTracked.events.includes('close'), 'GET must close the read stream after completion');

    // Aborted GET: the upstream stream must be torn down as well.
    const abortTracked = trackedReadable(Array.from({ length: 256 }, () => Buffer.alloc(chunkBytes, 7)));
    queue.push(abortTracked);
    await new Promise((resolve) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.port, path: bigUrl, method: 'GET', agent: false }, (res) => {
        res.once('data', () => {
          req.destroy();
          res.destroy();
          resolve();
        });
        res.on('error', () => resolve());
      });
      req.on('error', () => resolve());
      req.end();
    });
    await waitForCondition(() => abortTracked.stream.destroyed, 'aborted GET stream teardown', 5000);
    assert.equal(abortTracked.stream.destroyed, true, 'aborting the response must destroy the upstream stream');
    assert.ok(
      abortTracked.events.includes('close') || abortTracked.events.includes('destroy'),
      'aborted stream must be released',
    );
    assert.ok(readFileStreamCalls.length >= 3, 'each request reaches the attachment provider');
  } finally {
    await server.close();
    harness.dispose();
  }
});

test('Delivered file responses use the opened stream size, not the stale cached size (regression)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-size-'));
  const delivered = join(tempDir, 'replaced.mp4');
  writeFileSync(delivered, Buffer.from([1, 2, 3, 4]));
  // No readSurface: after the first scan the cached metadata (bytes=4) is reused.
  const sessionQuery = {
    async readSession() {
      return { events: [{ seq: 1, type: 'deliverables/presented', time: 10, data: { files: [{ path: delivered }] } }] };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments: {} });
  const sessionId = 'fresh-length-1';
  const server = await startServer(harness.getRoute(SESSION_DELIVERABLE_PATH).handler);
  const url = SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(delivered);
  try {
    const firstHead = await request(server.port, url, 'HEAD');
    assert.equal(firstHead.status, 200);
    assert.equal(firstHead.headers['content-length'], '4', 'the cached listing advertises the original size');

    // Rewrite the delivered file in place: the cached item stays at 4 bytes.
    writeFileSync(delivered, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const response = await request(server.port, url);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-length'], '9', 'Content-Length must match the bytes actually streamed');
    assert.equal(response.body.length, 9);
    assert.deepEqual([...response.body], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  } finally {
    await server.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Session object routes forward the full image reference to attachments.readImage (regression)', async () => {
  const imageRef = {
    attachmentId: 'sha256:image-ref',
    name: 'frame.png',
    mediaType: 'image/png',
    bytes: 3,
    width: 640,
    height: 480,
  };
  const sessionQuery = {
    async readSession() {
      return {
        events: [{
          seq: 1,
          type: 'assistant/message',
          time: 10,
          data: { message: { role: 'assistant', content: [{ type: 'image', attachment: imageRef }] } },
        }],
      };
    },
  };
  const readImageCalls = [];
  const attachments = {
    async readImage(ref) {
      readImageCalls.push({ ...ref });
      return { ref: { ...ref, mediaType: 'image/png' }, data: new Uint8Array([1, 2, 3]) };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const sessionId = 'image-ref-1';
  const server = await startServer(harness.getRoute(SESSION_OBJECT_PATH).handler);
  const url = SESSION_OBJECT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + encodeURIComponent('sha256:image-ref');
  try {
    const response = await request(server.port, url);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.deepEqual([...response.body], [1, 2, 3]);
    assert.equal(readImageCalls.length, 1);
    assert.deepEqual(readImageCalls[0], imageRef, 'the provider must receive mediaType/width/height/name');
    assert.equal(readImageCalls[0].mediaType, 'image/png');
    assert.equal(readImageCalls[0].width, 640);
    assert.equal(readImageCalls[0].height, 480);

    const head = await request(server.port, url, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);

    // Kept behaviour: non-GET/HEAD is 405, unknown object ids stay 404.
    const badMethod = await request(server.port, url, 'POST');
    assert.equal(badMethod.status, 405);
    assert.equal(badMethod.headers.allow, 'GET, HEAD');
    const unknown = await request(
      server.port,
      SESSION_OBJECT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + encodeURIComponent('sha256:unknown-image'),
      'HEAD',
    );
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.length, 0);
    assert.equal(unknown.headers['x-content-type-options'], 'nosniff');
  } finally {
    await server.close();
    harness.dispose();
  }
});

test('Export worker blocks network/storage globals and captures postMessage (regression)', async () => {
  const blocked = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'navigator'];
  const driver = createWorkerDriver();
  for (const name of blocked) {
    assert.equal(typeof driver.sandbox[name], 'function', name + ' must be shadowed with a throwing block');
    assert.throws(() => driver.sandbox[name](), new RegExp(name + ' is disabled'), name + ' must throw when called');
  }
  assert.equal(typeof driver.sandbox.postMessage, 'function', 'the real postMessage must stay available');

  // A draw() that overwrites self.postMessage must not silence the protocol:
  // the worker captures the original postMessage before model code runs.
  const captureDriver = createWorkerDriver();
  captureDriver.send({
    type: 'start',
    code: 'function draw(ctx, t) { self.postMessage = function () {}; ctx.fillRect(0, 0, 1, 1); }',
    duration: 0.5,
    width: 64,
    height: 64,
    fps: 4,
  });
  const done = await raceWithTimeout(captureDriver.settled, 'postMessage capture run');
  assert.equal(done.type, 'done');
  assert.equal(done.frames, 2);
  assert.equal(captureDriver.frames().length, 2, 'frames must still be delivered after draw() replaces postMessage');

  const errorDriver = createWorkerDriver();
  errorDriver.send({
    type: 'start',
    code: 'function draw() { self.postMessage = function () {}; throw new Error("silenced boom"); }',
    duration: 0.5,
    width: 64,
    height: 64,
    fps: 4,
  });
  const failure = await raceWithTimeout(errorDriver.settled, 'postMessage capture error');
  assert.equal(failure.type, 'error');
  assert.match(failure.message, /silenced boom/);
});

test('Session routes serve non-ASCII and control-character file names (H1 regression)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-unicode-'));
  const cjkDelivered = join(tempDir, '最终成片.mp4');
  const controlDelivered = join(tempDir, 'cut\u0001take.mp4');
  writeFileSync(cjkDelivered, Buffer.from([1, 2, 3]));
  writeFileSync(controlDelivered, Buffer.from([4, 5]));
  const imageBytes = Buffer.from([9, 8, 7]);
  const imageAttachmentId = 'img-cjk-1';
  const sessionQuery = {
    async readSession() {
      return {
        events: [
          {
            seq: 1,
            type: 'deliverables/presented',
            time: 10,
            data: { files: [{ path: cjkDelivered }, { path: controlDelivered }] },
          },
          {
            seq: 2,
            type: 'assistant/message',
            time: 11,
            data: {
              message: {
                role: 'assistant',
                content: [{
                  type: 'image',
                  attachment: {
                    attachmentId: imageAttachmentId,
                    name: '设计稿.png',
                    bytes: imageBytes.length,
                    mediaType: 'image/png',
                    width: 1,
                    height: 1,
                  },
                }],
              },
            },
          },
        ],
      };
    },
  };
  const attachments = {
    async readImage() {
      return { data: imageBytes, ref: { mediaType: 'image/png' } };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const sessionId = 'unicode-name-regression-1';
  const server = await startServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname === SESSION_DELIVERABLE_PATH) return harness.getRoute(SESSION_DELIVERABLE_PATH).handler(req, res);
    if (url.pathname === SESSION_OBJECT_PATH) return harness.getRoute(SESSION_OBJECT_PATH).handler(req, res);
    res.statusCode = 404;
    res.end('unexpected route');
  });
  try {
    const cjkUrl = SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(cjkDelivered);
    const cjk = await request(server.port, cjkUrl);
    assert.equal(cjk.status, 200, 'a Chinese-named deliverable must be served, not answered with 404');
    assert.deepEqual([...cjk.body], [1, 2, 3]);
    const cjkDisposition = cjk.headers['content-disposition'];
    assert.match(
      cjkDisposition,
      /^inline; filename="____\.mp4"; filename\*=UTF-8''%E6%9C%80%E7%BB%88%E6%88%90%E7%89%87\.mp4$/,
    );
    assert.doesNotMatch(cjkDisposition, /[^\x20-\x7e]/, 'Content-Disposition must stay header-safe');

    const controlUrl = SESSION_DELIVERABLE_PATH + '?sessionId=' + sessionId + '&path=' + encodeURIComponent(controlDelivered);
    const control = await request(server.port, controlUrl);
    assert.equal(control.status, 200, 'a control-character name must be served with an escaped filename');
    assert.deepEqual([...control.body], [4, 5]);
    const controlDisposition = control.headers['content-disposition'];
    assert.match(controlDisposition, /filename="cut_take\.mp4"/);
    assert.match(controlDisposition, /filename\*=UTF-8''cut%01take\.mp4/);
    assert.doesNotMatch(controlDisposition, /[\x00-\x1f\x7f]/);

    const image = await request(
      server.port,
      SESSION_OBJECT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + imageAttachmentId,
    );
    assert.equal(image.status, 200, 'a Chinese-named image attachment must be served');
    assert.deepEqual([...image.body], [9, 8, 7]);
    const imageDisposition = image.headers['content-disposition'];
    assert.match(imageDisposition, /^inline; filename="___\.png"; filename\*=UTF-8''%E8%AE%BE%E8%AE%A1%E7%A8%BF\.png$/);
    assert.doesNotMatch(imageDisposition, /[^\x20-\x7e]/);
  } finally {
    await server.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Session media lists and serves long stored names with the full provider reference (H-04 regression)', async () => {
  const longVideoName = 'v'.repeat(196) + '.mp4';
  const longAudioName = 'a'.repeat(196) + '.wav';
  const longCjkName = '长'.repeat(200) + '.mp4';
  assert.equal(longVideoName.length, 200, 'the long ASCII name keeps its extension after char 180');
  assert.ok(Buffer.byteLength(longCjkName) > 255, 'the long CJK name exceeds the provider byte limit');
  const expectedNames = new Map([
    ['sha256:long-video', longVideoName],
    ['sha256:long-audio', longAudioName],
    ['sha256:long-cjk-video', longCjkName],
  ]);
  const readFileStreamCalls = [];
  const attachments = {
    async *readFileStream(ref) {
      readFileStreamCalls.push({ attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes });
      if (ref.name !== expectedNames.get(ref.attachmentId)) throw new Error('INVALID_ATTACHMENT_REF');
      yield Buffer.from([4, 5, 6]);
    },
  };
  const sessionQuery = {
    async readSession() {
      return {
        events: [
          { seq: 1, type: 'tool/call', time: 10, data: { callId: 'call-long-video', name: 'deepseek_design_export_video' } },
          {
            seq: 2,
            type: 'tool/result',
            time: 11,
            data: {
              message: {
                role: 'tool',
                toolCallId: 'call-long-video',
                content: [{ type: 'file', attachment: { attachmentId: 'sha256:long-video', name: longVideoName, bytes: 3 } }],
              },
            },
          },
          { seq: 3, type: 'tool/call', time: 12, data: { callId: 'call-long-audio', name: 'deepseek_design_export_audio' } },
          {
            seq: 4,
            type: 'tool/result',
            time: 13,
            data: {
              message: {
                role: 'tool',
                toolCallId: 'call-long-audio',
                content: [{ type: 'file', attachment: { attachmentId: 'sha256:long-audio', name: longAudioName, bytes: 3 } }],
              },
            },
          },
          { seq: 5, type: 'tool/call', time: 14, data: { callId: 'call-long-cjk', name: 'present' } },
          {
            seq: 6,
            type: 'tool/result',
            time: 15,
            data: {
              message: {
                role: 'tool',
                toolCallId: 'call-long-cjk',
                content: [{ type: 'file', attachment: { attachmentId: 'sha256:long-cjk-video', name: longCjkName, bytes: 3 } }],
              },
            },
          },
        ],
      };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const sessionId = 'long-name-regression-1';
  const mediaServer = await startServer(harness.getRoute(SESSION_MEDIA_PATH).handler);
  const attachmentServer = await startServer(harness.getRoute(SESSION_ATTACHMENT_PATH).handler);
  try {
    const list = await request(mediaServer.port, SESSION_MEDIA_PATH + '?sessionId=' + sessionId);
    assert.equal(list.status, 200);
    const payload = JSON.parse(list.body.toString('utf8'));
    assert.deepEqual([...payload.items.map((item) => item.kind)], ['video', 'audio', 'video']);
    assert.deepEqual([...payload.items.map((item) => item.mediaType)], ['video/mp4', 'audio/wav', 'video/mp4']);
    assert.deepEqual([...payload.items.map((item) => item.name.length)], [180, 180, 180], 'display names stay truncated');
    assert.equal(payload.nextOffset, null);

    for (const item of payload.items) {
      const served = await request(attachmentServer.port, item.url);
      assert.equal(served.status, 200, item.attachmentId + ' must be served with its full stored leaf name');
      assert.equal(served.headers['content-type'], item.mediaType);
      assert.equal(served.headers['content-length'], '3');
      assert.deepEqual([...served.body], [4, 5, 6]);
    }

    assert.equal(readFileStreamCalls.length, 3);
    assert.equal(readFileStreamCalls[0].name, longVideoName);
    assert.equal(readFileStreamCalls[1].name, longAudioName);
    assert.equal(readFileStreamCalls[2].name, longCjkName);
    assert.equal(readFileStreamCalls[0].name.length, 200);
    assert.equal(Buffer.byteLength(readFileStreamCalls[2].name), Buffer.byteLength(longCjkName));
  } finally {
    await mediaServer.close();
    await attachmentServer.close();
    harness.dispose();
  }
});

test('A re-presented or rewritten deliverable is listed once and vanished paths are pruned (H-05 regression)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsd-host-dedupe-'));
  const delivered = join(tempDir, 'rerendered.mp4');
  writeFileSync(delivered, Buffer.from([1, 2, 3]));
  let currentEvents = [
    { seq: 1, type: 'deliverables/presented', time: 10, data: { files: [{ path: delivered }] } },
  ];
  let capturedThroughSeq = 1;
  const sessionQuery = {
    async readSession() {
      return { events: currentEvents };
    },
    async readSurface() {
      return { capturedThroughSeq, events: [] };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments: {} });
  const sessionId = 'dedupe-deliverable-regression-1';
  const mediaServer = await startServer(harness.getRoute(SESSION_MEDIA_PATH).handler);
  const attachmentServer = await startServer(harness.getRoute(SESSION_ATTACHMENT_PATH).handler);
  const listUrl = SESSION_MEDIA_PATH + '?sessionId=' + sessionId;
  try {
    const first = JSON.parse((await request(mediaServer.port, listUrl)).body.toString('utf8'));
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0].bytes, 3);
    const staleId = first.items[0].attachmentId;

    // Re-export the same path with new bytes; a later scan sees a new identity.
    writeFileSync(delivered, Buffer.from([1, 2, 3, 4, 5]));
    currentEvents = [
      ...currentEvents,
      { seq: 2, type: 'deliverables/presented', time: 20, data: { files: [{ path: delivered }] } },
    ];
    capturedThroughSeq = 2;
    const second = JSON.parse((await request(mediaServer.port, listUrl)).body.toString('utf8'));
    assert.equal(second.items.length, 1, 'a rewritten deliverable must be listed exactly once');
    assert.equal(second.items.filter((item) => item.name === 'rerendered.mp4').length, 1);
    assert.equal(second.items[0].bytes, 5);
    assert.notEqual(second.items[0].attachmentId, staleId, 'the fresh stat-derived id must replace the old one');
    const stale = await request(
      attachmentServer.port,
      SESSION_ATTACHMENT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + encodeURIComponent(staleId),
    );
    assert.equal(stale.status, 404, 'the superseded attachment id must not stay reachable');
    const fresh = await request(attachmentServer.port, second.items[0].url);
    assert.equal(fresh.status, 200);
    assert.deepEqual([...fresh.body], [1, 2, 3, 4, 5]);

    // A delivered path that no longer stats as a regular non-empty file is pruned.
    rmSync(delivered);
    currentEvents = [
      ...currentEvents,
      {
        seq: 3,
        type: 'assistant/message',
        time: 30,
        data: { message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } },
      },
    ];
    capturedThroughSeq = 3;
    const third = JSON.parse((await request(mediaServer.port, listUrl)).body.toString('utf8'));
    assert.equal(third.items.length, 0, 'a vanished deliverable must be pruned from the listing');
    const missing = await request(attachmentServer.port, second.items[0].url);
    assert.equal(missing.status, 404);
  } finally {
    await mediaServer.close();
    await attachmentServer.close();
    harness.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Session media pages through more than one page with offset/nextOffset (H-10 regression)', async () => {
  const total = 501;
  const events = [];
  for (let index = 0; index < total; index += 1) {
    const callId = 'call-page-' + index;
    const attachmentId = 'sha256:page-' + String(index).padStart(4, '0');
    const name = 'clip-' + String(index).padStart(3, '0') + '.mp4';
    events.push({
      seq: events.length + 1,
      type: 'tool/call',
      time: index * 2 + 1,
      data: { callId, name: 'deepseek_design_export_video' },
    });
    events.push({
      seq: events.length + 1,
      type: 'tool/result',
      time: index * 2 + 2,
      data: {
        message: {
          role: 'tool',
          toolCallId: callId,
          content: [{ type: 'file', attachment: { attachmentId, name, bytes: 3 } }],
        },
      },
    });
  }
  const sessionQuery = {
    async readSession() {
      return { events };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments: {} });
  const sessionId = 'pagination-regression-1';
  const server = await startServer(harness.getRoute(SESSION_MEDIA_PATH).handler);
  const pageUrl = (offset) => SESSION_MEDIA_PATH + '?sessionId=' + sessionId + '&offset=' + String(offset);
  try {
    const first = await request(server.port, SESSION_MEDIA_PATH + '?sessionId=' + sessionId);
    assert.equal(first.status, 200);
    const firstPayload = JSON.parse(first.body.toString('utf8'));
    assert.equal(firstPayload.ok, true);
    assert.equal(firstPayload.version, 1);
    assert.equal(firstPayload.filtered, true);
    assert.equal(firstPayload.items.length, 500, 'one page holds SESSION_ATTACHMENT_LIMIT items');
    assert.equal(firstPayload.nextOffset, 500);
    assert.equal(firstPayload.items[0].attachmentId, 'sha256:page-0000');
    assert.equal(firstPayload.items[499].attachmentId, 'sha256:page-0499');

    const second = JSON.parse((await request(server.port, pageUrl(500))).body.toString('utf8'));
    assert.equal(second.items.length, 1);
    assert.equal(second.nextOffset, null, 'the last page announces no further page');
    assert.equal(second.items[0].attachmentId, 'sha256:page-0500');

    const seen = new Set();
    let offset = 0;
    let pages = 0;
    while (pages < 10) {
      const page = JSON.parse((await request(server.port, pageUrl(offset))).body.toString('utf8'));
      pages += 1;
      for (const item of page.items) {
        assert.equal(seen.has(item.attachmentId), false, 'each item must be reachable exactly once');
        seen.add(item.attachmentId);
      }
      if (page.nextOffset === null) break;
      assert.ok(
        Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset,
        'nextOffset must advance beyond the current page',
      );
      offset = page.nextOffset;
    }
    assert.equal(pages, 2, 'a 501-item Session needs exactly two pages');
    assert.equal(seen.size, total, 'chaining every page reaches every item');
    assert.equal(seen.has('sha256:page-0000'), true);
    assert.equal(seen.has('sha256:page-0500'), true);

    const beyond = JSON.parse((await request(server.port, pageUrl(1_000_000))).body.toString('utf8'));
    assert.equal(beyond.items.length, 0, 'an offset beyond the end is a valid empty page');
    assert.equal(beyond.nextOffset, null);

    for (const value of ['', '-1', 'abc', '1.5', '1000001', ' 5', '1e3']) {
      const bad = await request(
        server.port,
        SESSION_MEDIA_PATH + '?sessionId=' + sessionId + '&offset=' + encodeURIComponent(value),
      );
      assert.equal(bad.status, 400, 'offset=' + JSON.stringify(value) + ' must be rejected');
      assert.equal(bad.headers['x-content-type-options'], 'nosniff');
    }
  } finally {
    await server.close();
    harness.dispose();
  }
});

test('Provider stream failures answer a normal 404 and release the stream (H-04 regression)', async () => {
  const erroringStreams = new Map();
  const attachments = {
    readFileStream(ref) {
      if (ref.attachmentId === 'sha256:provider-throw') {
        throw new Error('provider rejected the stored name');
      }
      if (ref.attachmentId === 'sha256:provider-generator') {
        return (async function* () {
          throw new Error('provider rejected the stored name');
        })();
      }
      if (ref.attachmentId === 'sha256:provider-stream-error') {
        const stream = new Readable({
          read() {
            this.destroy(new Error('provider stream failed'));
          },
        });
        stream.on('error', () => {});
        erroringStreams.set(ref.attachmentId, stream);
        return stream;
      }
      if (ref.attachmentId === 'sha256:provider-ok') {
        return (async function* () {
          yield Buffer.from([4, 5, 6]);
        })();
      }
      throw new Error('unexpected attachment id ' + ref.attachmentId);
    },
  };
  const sessionQuery = {
    async readSession() {
      return {
        events: [{
          seq: 1,
          type: 'assistant/message',
          time: 10,
          data: {
            message: {
              role: 'assistant',
              content: [
                { type: 'file', attachment: { attachmentId: 'sha256:provider-throw', name: 'throw.mp4', bytes: 3 } },
                { type: 'file', attachment: { attachmentId: 'sha256:provider-generator', name: 'generator.mp4', bytes: 3 } },
                { type: 'file', attachment: { attachmentId: 'sha256:provider-stream-error', name: 'error.mp4', bytes: 3 } },
                { type: 'file', attachment: { attachmentId: 'sha256:provider-ok', name: 'ok.mp4', bytes: 3 } },
              ],
            },
          },
        }],
      };
    },
  };
  const harness = createFakeHarness({ sessionQuery, attachments });
  const sessionId = 'provider-failure-regression-1';
  const server = await startServer(harness.getRoute(SESSION_OBJECT_PATH).handler);
  const objectUrl = (attachmentId) => SESSION_OBJECT_PATH + '?sessionId=' + sessionId + '&attachmentId=' + encodeURIComponent(attachmentId);
  try {
    for (const attachmentId of ['sha256:provider-throw', 'sha256:provider-generator', 'sha256:provider-stream-error']) {
      const response = await request(server.port, objectUrl(attachmentId));
      assert.equal(response.status, 404, attachmentId + ' must answer a normal 404 instead of a socket hang-up');
      assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.match(response.body.toString('utf8'), /unavailable/i);
      assert.equal(response.headers['content-disposition'], undefined, 'staged media headers must not leak into the 404');
    }

    const erroring = erroringStreams.get('sha256:provider-stream-error');
    assert.notEqual(erroring, undefined);
    await waitForCondition(() => erroring.destroyed, 'provider error stream release', 3000);
    assert.equal(erroring.destroyed, true, 'a stream opened before the failure must be released');

    const healthy = await request(server.port, objectUrl('sha256:provider-ok'));
    assert.equal(healthy.status, 200, 'the handler must stay usable after provider failures');
    assert.deepEqual([...healthy.body], [4, 5, 6]);
  } finally {
    await server.close();
    harness.dispose();
  }
});
