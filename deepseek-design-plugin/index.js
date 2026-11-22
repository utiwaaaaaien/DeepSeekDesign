/**
 * DeepSeekDesign — Host half.
 *
 * The browser half owns the workbench, the animation renderer, and the export
 * card. This half exposes:
 *
 *   1. The global Tool `deepseek_design_export_video`, which validates one
 *      export request and returns a queued receipt. The Host never renders.
 *   2. The static Worker route GET /deepseek-design/export-worker.js that the
 *      Client export card starts to paint frames from model-supplied code.
 *   3. Same-origin media routes for attachments that appeared in the current
 *      Session conversation: a metadata listing and a byte stream per
 *      attachment. The workbench uses them to auto-fill its asset library.
 *
 * Nothing here scans the working directory, reads the model directory, or
 * writes to disk. The old chat/model/scene bridge is gone.
 */

import { createReadStream, fstatSync, readFileSync, statSync } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Wait for the tool registry and the HTTP carrier before apply(). Declaring the
// hard dependencies makes ctx.tools and ctx.webServer available synchronously.
export const inject = ['tools', 'webServer'];

const TOOL_NAME = 'deepseek_design_export_video';
const WORKER_PATH = '/deepseek-design/export-worker.js';
const WORKER_FILE = fileURLToPath(new URL('./export-worker.js', import.meta.url));
const SESSION_MEDIA_PATH = '/deepseek-design/session-media';
const SESSION_ATTACHMENT_PATH = '/deepseek-design/session-attachment';
const SESSION_OBJECT_PATH = '/deepseek-design/session-object';
const SESSION_DELIVERABLE_PATH = '/deepseek-design/session-deliverable';
const SESSION_CACHE_LIMIT = 50;
// One page of the /session-media listing; later pages are addressed with
// ?offset=. The full sorted list is never truncated, so no export becomes
// unreachable in a long Session.
const SESSION_ATTACHMENT_LIMIT = 500;
const MAX_SESSION_MEDIA_OFFSET = 1_000_000;
const DISPLAY_NAME_LIMIT = 180;
// A stored leaf name is at most 255 UTF-8 bytes (see the attachment provider's
// fileLeafName); more characters than that can never be a valid reference.
const MAX_STORED_NAME_CHARS = 255;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac']);
const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
};

const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 600;
const MAX_CODE_CHARS = 2_000_000;
const MAX_TITLE_CHARS = 200;

const ASPECTS = ['16:9', '2.39:1', '21:9', '4:3', '1:1', '3:4', '4:5', '9:16'];
const RESOLUTIONS = ['1080p', '4k'];
const FPS_OPTIONS = [24, 30, 60];
const DEFAULT_ASPECT = '16:9';
const DEFAULT_RESOLUTION = '1080p';
const DEFAULT_FPS = 30;

const WORKER_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-eval'",
  "connect-src 'none'",
  'img-src data: blob:',
].join('; ');

function readEnum(value, allowed, name) {
  if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
    throw new Error(name + ' must be one of: ' + allowed.join(', ') + '.');
  }
  return value;
}

function readNumberEnum(value, allowed, name) {
  if (typeof value !== 'number' || allowed.indexOf(value) === -1) {
    throw new Error(name + ' must be one of: ' + allowed.join(', ') + '.');
  }
  return value;
}

function formatSeconds(value) {
  const rounded = Math.round(value * 100) / 100;
  return rounded + 's';
}

/**
 * Validate one export request exactly as the Client will consume it. The model
 * may omit aspect/resolution/fps; those resolve to the documented defaults so
 * the receipt and the Client card agree. The Host still validates in execute()
 * even though the Tool parameter schema advertises the same limits.
 */
function normalizeExportArgs(raw) {
  const args = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (title.length === 0) throw new Error('title is required.');

  const duration = args.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    throw new Error('duration must be a number between 1 and 600 seconds.');
  }
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new Error('duration must be between 1 and 600 seconds.');
  }

  const code = typeof args.code === 'string' ? args.code : '';
  if (code.trim().length === 0) throw new Error('code is required.');
  if (code.length > MAX_CODE_CHARS) {
    throw new Error('code must be at most ' + MAX_CODE_CHARS.toLocaleString('en-US') + ' characters.');
  }

  const aspect = args.aspect === undefined || args.aspect === null
    ? DEFAULT_ASPECT
    : readEnum(args.aspect, ASPECTS, 'aspect');
  const resolution = args.resolution === undefined || args.resolution === null
    ? DEFAULT_RESOLUTION
    : readEnum(args.resolution, RESOLUTIONS, 'resolution');
  const fps = args.fps === undefined || args.fps === null
    ? DEFAULT_FPS
    : readNumberEnum(args.fps, FPS_OPTIONS, 'fps');

  if (resolution === '4k' && fps === 60) {
    throw new Error('4k resolution cannot be combined with 60 fps; use 24 or 30 fps, or export at 1080p for 60 fps.');
  }

  return {
    title: title.slice(0, MAX_TITLE_CHARS),
    duration,
    code,
    aspect,
    resolution,
    fps,
  };
}

function queuedMessage(request) {
  return 'Queued export "' + request.title + '" - ' + formatSeconds(request.duration)
    + ' at ' + request.resolution + ', ' + request.aspect + ', ' + request.fps
    + ' fps. The animation renders in the browser and the finished file appears in the DeepSeekDesign asset library.';
}

const EXPORT_VIDEO_TOOL = {
  name: TOOL_NAME,
  description: [
    'Queue a video export of a DeepSeekDesign animation.',
    'Put the complete animation in `code`: it must define function draw(ctx, t, width, height)',
    'and paint every frame with the Canvas 2D API, where t is the frame time in seconds.',
    'The code runs in a sandboxed same-origin Worker with network access disabled.',
    'The Host only validates and queues the request; the animation renders in the browser',
    'and the finished file appears in the DeepSeekDesign asset library for the user to drag onto the timeline.',
  ].join(' '),
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short export name shown on the export card and used as the download filename.',
      },
      duration: {
        type: 'number',
        minimum: MIN_DURATION_SECONDS,
        maximum: MAX_DURATION_SECONDS,
        description: 'Animation length in seconds, from 1 to 600.',
      },
      code: {
        type: 'string',
        maxLength: MAX_CODE_CHARS,
        description: 'Complete JavaScript source for the animation. It must define function draw(ctx, t, width, height) using only the supplied Canvas 2D context, and must not fetch or create external resources. Maximum 2,000,000 characters.',
      },
      aspect: {
        type: 'string',
        enum: ASPECTS,
        description: 'Output aspect ratio. Defaults to 16:9.',
      },
      resolution: {
        type: 'string',
        enum: RESOLUTIONS,
        description: 'Output resolution: 1080p or 4k. Defaults to 1080p.',
      },
      fps: {
        type: 'number',
        enum: FPS_OPTIONS,
        description: 'Frame rate: 24, 30, or 60. Defaults to 30. 4k resolution cannot use 60 fps.',
      },
    },
    required: ['title', 'duration', 'code'],
    additionalProperties: false,
  },
  output: {
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['queued'],
          description: 'Set to "queued" once the export request is accepted.',
        },
        message: {
          type: 'string',
          description: 'Human-readable receipt shown to the user.',
        },
      },
      required: ['status', 'message'],
      additionalProperties: false,
    },
    render(_args, value) {
      const message = value !== null && typeof value === 'object' && typeof value.message === 'string' && value.message.length > 0
        ? value.message
        : 'The export is queued.';
      return [{ type: 'text', text: message }];
    },
  },
  async execute(args) {
    const request = normalizeExportArgs(args);
    return { status: 'queued', message: queuedMessage(request) };
  },
};

function sendMethodNotAllowed(res) {
  const body = 'Method Not Allowed';
  res.statusCode = 405;
  res.setHeader('allow', 'GET, HEAD');
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

function sendWorkerUnavailable(res) {
  const body = 'The DeepSeekDesign export worker is unavailable.';
  res.statusCode = 500;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

/**
 * Serve the fixed worker script straight from the package directory. The route
 * is same-origin and static: the body never depends on the request or the user.
 */
function handleWorkerRequest(req, res) {
  const method = typeof req.method === 'string' ? req.method.toUpperCase() : '';
  if (method !== 'GET' && method !== 'HEAD') {
    sendMethodNotAllowed(res);
    req.resume();
    return;
  }

  let source;
  try {
    source = readFileSync(WORKER_FILE);
  } catch {
    sendWorkerUnavailable(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'text/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-security-policy', WORKER_CONTENT_SECURITY_POLICY);
  res.setHeader('content-length', source.byteLength);
  res.end(method === 'HEAD' ? undefined : source);
}

const sessionAttachmentCache = new Map();

function getService(ctx, name) {
  try {
    if (ctx !== null && ctx !== undefined && typeof ctx.get === 'function') return ctx.get(name);
  } catch {
    // Optional services stay optional.
  }
  return undefined;
}

function extensionOf(name) {
  const match = String(name || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match === null ? '' : match[1];
}

function kindForName(name) {
  const extension = extensionOf(name);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return null;
}

function mimeForName(name) {
  return MIME_BY_EXTENSION[extensionOf(name)] ?? 'application/octet-stream';
}

/**
 * The full stored leaf name carried by an attachment reference. The attachment
 * provider only accepts a ref whose name equals the stored leaf name, so this
 * value must never be shortened; only the display name may be truncated.
 */
function storedLeafName(ref) {
  if (ref === null || typeof ref !== 'object' || typeof ref.name !== 'string') return '';
  const name = ref.name.trim();
  return name.length > 0 ? name : '';
}

/** Short display name for listings and telemetry; never use it in a provider ref. */
function displayNameFor(name) {
  return String(name || '').trim().slice(0, DISPLAY_NAME_LIMIT);
}

/** Full stored leaf name used when a cached item is handed back to the provider. */
function providerRefName(item) {
  const stored = item !== null && typeof item === 'object' ? storedLeafName(item.ref) : '';
  if (stored.length > 0) return stored;
  return typeof item?.name === 'string' && item.name.length > 0 ? item.name : 'file';
}

function normalizeSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}

function normalizeAttachmentId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 260 ? value : null;
}

function attachmentCacheFor(sessionId) {
  let entry = sessionAttachmentCache.get(sessionId);
  if (entry === undefined) {
    entry = {
      initialized: false,
      refreshing: null,
      scannedSeq: null,
      items: new Map(),
      all: new Map(),
      deliverables: new Map(),
    };
    sessionAttachmentCache.set(sessionId, entry);
    while (sessionAttachmentCache.size > SESSION_CACHE_LIMIT) {
      const oldest = sessionAttachmentCache.keys().next().value;
      if (oldest === undefined) break;
      sessionAttachmentCache.delete(oldest);
    }
  }
  return entry;
}

function addAttachment(entry, item) {
  if (entry.items.has(item.attachmentId)) return;
  entry.items.set(item.attachmentId, item);
}

/**
 * Read image/file content blocks that appeared in assistant or tool messages.
 * User-uploaded prompt attachments are intentionally not listed here; they are
 * inputs, not conversation output.
 */
const EXPLICIT_EXPORT_TOOL = /(^|[_:-])(present|export)([_:-]|$)/i;

function isExplicitExportTool(name) {
  return EXPLICIT_EXPORT_TOOL.test(String(name || ''));
}

function collectMediaBlocks(events, entry) {
  if (!Array.isArray(events)) return;
  // Only user-facing exports count. Intermediate files that merely appear in
  // the transcript (screenshots, reads, temp renders) are deliberately ignored.
  const userAttachmentIds = new Set();
  const toolNameByCallId = new Map();
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    if (event.type === 'user/message') {
      const content = event.data?.message?.content ?? event.data?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block !== null && typeof block === 'object' && block.attachment !== null && typeof block.attachment === 'object'
          && typeof block.attachment.attachmentId === 'string') {
          userAttachmentIds.add(block.attachment.attachmentId);
        }
      }
      continue;
    }
    if (event.type === 'tool/call' && typeof event.data?.callId === 'string' && typeof event.data?.name === 'string') {
      toolNameByCallId.set(event.data.callId, event.data.name);
    }
  }
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'tool/result') continue;
    const message = event.data?.message;
    if (message === null || typeof message !== 'object' || message.role !== 'tool' || !Array.isArray(message.content)) continue;
    const toolName = toolNameByCallId.get(message.toolCallId) ?? '';
    if (!isExplicitExportTool(toolName)) continue;
    const createdAt = Number(event.time) || 0;
    for (const block of message.content) {
      if (block === null || typeof block !== 'object' || block.type !== 'file' || block.attachment === null || typeof block.attachment !== 'object') continue;
      const ref = block.attachment;
      if (typeof ref.attachmentId !== 'string' || ref.attachmentId.length === 0) continue;
      if (userAttachmentIds.has(ref.attachmentId)) continue;
      if (typeof ref.name !== 'string' || ref.name.trim().length === 0) continue;
      const storedName = ref.name.trim();
      const name = displayNameFor(storedName);
      const kind = kindForName(storedName);
      const bytes = Math.max(0, Number(ref.bytes) || 0);
      if ((kind !== 'video' && kind !== 'audio') || bytes <= 0) continue;
      addAttachment(entry, {
        attachmentId: ref.attachmentId,
        kind,
        name,
        bytes,
        width: 0,
        height: 0,
        mediaType: mimeForName(storedName),
        storage: 'file',
        createdAt,
        ref: { attachmentId: ref.attachmentId, name: storedName, bytes },
      });
    }
  }
}

/** Drop one cached attachment identity from every listing it can appear in. */
function removeAttachment(entry, attachmentId) {
  entry.items.delete(attachmentId);
  entry.all.delete(attachmentId);
}

/**
 * Forget one delivered path whose file vanished or stopped being a regular
 * non-empty file: the cached entry and the attachment id it published must not
 * stay listed (or keep serving stale bytes) after that.
 */
function pruneDeliverable(entry, filePath) {
  const previous = entry.deliverables.get(filePath);
  if (previous === undefined) return;
  entry.deliverables.delete(filePath);
  removeAttachment(entry, previous.attachmentId);
}

function collectDeliverables(events, entry) {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'deliverables/presented') continue;
    const files = event.data?.files;
    if (!Array.isArray(files)) continue;
    const createdAt = Number(event.time) || 0;
    for (const file of files) {
      if (file === null || typeof file !== 'object' || typeof file.path !== 'string') continue;
      const filePath = file.path;
      const name = filePath.split(/[\\/]/).pop() || 'delivered-file';
      const kind = kindForName(filePath) ?? 'file';
      let stat;
      try {
        stat = statSync(filePath);
      } catch {
        pruneDeliverable(entry, filePath);
        continue;
      }
      if (!stat.isFile() || stat.size <= 0) {
        pruneDeliverable(entry, filePath);
        continue;
      }
      const attachmentId = `deliverable:${createHash('sha256').update(`${filePath}:${stat.mtimeMs}:${stat.size}`).digest('hex').slice(0, 40)}`;
      const previous = entry.deliverables.get(filePath);
      // A later delivery of the same path may carry new bytes (a re-export);
      // replace the cached record so the advertised size and id stay current.
      if (previous === undefined || previous.attachmentId !== attachmentId) {
        // Retire the superseded identity from both listings before publishing
        // the fresh one, or /session-media lists the same path twice.
        if (previous !== undefined) removeAttachment(entry, previous.attachmentId);
        entry.deliverables.set(filePath, {
          attachmentId, kind, name: displayNameFor(name), bytes: stat.size,
          width: 0, height: 0, mediaType: mimeForName(name),
          storage: 'deliverable', path: filePath, createdAt,
          ref: { attachmentId, path: filePath, name, bytes: stat.size },
        });
      }
      if (kind !== 'video' && kind !== 'audio') continue;
      addAttachment(entry, {
        attachmentId,
        kind,
        name: displayNameFor(name),
        bytes: stat.size,
        width: 0,
        height: 0,
        mediaType: mimeForName(name),
        storage: 'deliverable',
        path: filePath,
        createdAt,
        ref: { attachmentId, path: filePath, name, bytes: stat.size },
      });
    }
  }
}

function collectAnyAttachments(events, entry) {
  if (!Array.isArray(events)) return;
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    const message = event.data?.message;
    const content = Array.isArray(message?.content)
      ? message.content
      : Array.isArray(event.data?.content) ? event.data.content : null;
    if (content === null) continue;
    const createdAt = Number(event.time) || 0;
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue;
      if (block.type !== 'image' && block.type !== 'file') continue;
      const ref = block.attachment;
      if (ref === null || typeof ref !== 'object' || typeof ref.attachmentId !== 'string' || ref.attachmentId.length === 0) continue;
      const storedName = storedLeafName(ref);
      const name = storedName.length > 0 ? displayNameFor(storedName) : block.type;
      const bytes = Math.max(0, Number(ref.bytes) || 0);
      const mediaType = typeof block.mediaType === 'string' && block.mediaType.length > 0
        ? block.mediaType
        : typeof ref.mediaType === 'string' && ref.mediaType.length > 0
          ? ref.mediaType
          : mimeForName(storedName.length > 0 ? storedName : name);
      const kind = block.type === 'image' ? 'image' : (kindForName(storedName) ?? 'file');
      const width = Math.max(0, Number(ref.width) || 0);
      const height = Math.max(0, Number(ref.height) || 0);
      if (!entry.all.has(ref.attachmentId)) {
        // The attachment provider verifies an image reference's mediaType,
        // bytes, width, and height before reading it; carry the session's full
        // image reference through instead of a trimmed file-like ref. The file
        // ref must carry the full stored leaf name as well, because the
        // provider rejects any ref name that was shortened for display.
        const storedRef = block.type === 'image'
          ? {
            attachmentId: ref.attachmentId,
            mediaType: typeof ref.mediaType === 'string' && ref.mediaType.length > 0 ? ref.mediaType : mediaType,
            bytes,
            width,
            height,
            ...(storedName.length > 0 ? { name: storedName } : {}),
          }
          : { attachmentId: ref.attachmentId, name: storedName.length > 0 ? storedName : name, bytes };
        entry.all.set(ref.attachmentId, {
          attachmentId: ref.attachmentId,
          kind,
          name,
          bytes,
          width,
          height,
          mediaType,
          storage: block.type === 'image' ? 'image' : 'file',
          createdAt,
          ref: storedRef,
        });
      }
    }
  }
}

function lastEventSeq(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const seq = events[events.length - 1]?.seq;
  return typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
}

function collectSessionEvents(events, entry) {
  collectMediaBlocks(events, entry);
  collectDeliverables(events, entry);
  collectAnyAttachments(events, entry);
}

async function refreshSessionAttachments(ctx, sessionId) {
  const entry = attachmentCacheFor(sessionId);
  if (entry.refreshing !== null) return entry.refreshing;
  const query = getService(ctx, 'sessionQuery');
  if (query === undefined || query === null) return [];
  const readSession = typeof query.readSession === 'function' ? () => query.readSession(sessionId) : null;
  const readSurface = typeof query.readSurface === 'function' ? () => query.readSurface(sessionId) : null;
  const task = (async () => {
    let loaded = false;
    try {
      if (entry.initialized !== true) {
        if (readSession !== null) {
          const snapshot = await readSession();
          collectSessionEvents(snapshot?.events, entry);
          entry.scannedSeq = lastEventSeq(snapshot?.events);
          entry.initialized = true;
          loaded = true;
        } else if (readSurface !== null) {
          const surface = await readSurface();
          collectSessionEvents(surface?.events, entry);
          entry.scannedSeq = Number.isSafeInteger(surface?.capturedThroughSeq)
            ? surface.capturedThroughSeq
            : lastEventSeq(surface?.events);
          entry.initialized = true;
          loaded = true;
        }
      }
      if (entry.initialized === true && readSurface !== null) {
        const surface = await readSurface();
        collectSessionEvents(surface?.events, entry);
        if (readSession !== null) {
          // readSurface returns model-surface events only: tool/call and
          // deliverables/presented are not surface-eligible, so a surface
          // refresh can never attribute a new export to its tool or learn a
          // new delivered path. Re-read the full log when it advanced past the
          // last complete scan so new exports and deliveries stay visible.
          const capturedSeq = Number.isSafeInteger(surface?.capturedThroughSeq)
            ? surface.capturedThroughSeq
            : null;
          const advanced = capturedSeq === null
            || entry.scannedSeq === null
            || capturedSeq > entry.scannedSeq;
          if (advanced) {
            const snapshot = await readSession();
            collectSessionEvents(snapshot?.events, entry);
            entry.scannedSeq = lastEventSeq(snapshot?.events) ?? capturedSeq;
          }
        }
      }
    } catch {
      // A persisted/partial session may resist the full read; the current
      // surface is still useful and much smaller.
      if (loaded !== true && readSurface !== null) {
        try {
          const surface = await readSurface();
          collectSessionEvents(surface?.events, entry);
          if (entry.scannedSeq === null) {
            entry.scannedSeq = Number.isSafeInteger(surface?.capturedThroughSeq)
              ? surface.capturedThroughSeq
              : lastEventSeq(surface?.events);
          }
          entry.initialized = true;
        } catch {
          // Leave the cache uninitialized so a later request can retry.
        }
      }
    }
    // The full sorted list is returned: /session-media pages it with ?offset=
    // and the attachment/object/deliverable routes must be able to find any
    // cached item, including ones older than the first page.
    return [...entry.items.values()]
      .sort((a, b) => a.createdAt - b.createdAt || a.attachmentId.localeCompare(b.attachmentId));
  })();
  entry.refreshing = task;
  try {
    return await task;
  } finally {
    if (entry.refreshing === task) entry.refreshing = null;
  }
}

function sendJson(res, statusCode, payload, method) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(method === 'HEAD' ? undefined : body);
}

function sendNotFound(res, message = 'Attachment not found.', method = 'GET') {
  const body = message;
  res.statusCode = 404;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(method === 'HEAD' ? undefined : body);
}

function sendBadRequest(res, message = 'Invalid request.', method = 'GET') {
  const body = message;
  res.statusCode = 400;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(method === 'HEAD' ? undefined : body);
}

function publicAttachment(sessionId, item) {
  return {
    attachmentId: item.attachmentId,
    kind: item.kind,
    name: item.name,
    bytes: item.bytes,
    width: item.width,
    height: item.height,
    mediaType: item.mediaType,
    createdAt: item.createdAt,
    url: `${SESSION_ATTACHMENT_PATH}?sessionId=${encodeURIComponent(sessionId)}&attachmentId=${encodeURIComponent(item.attachmentId)}`,
  };
}

function readOnlyMethod(req, res) {
  const method = typeof req.method === 'string' ? req.method.toUpperCase() : '';
  if (method === 'GET' || method === 'HEAD') return method;
  sendMethodNotAllowed(res);
  req.resume();
  return null;
}

/**
 * Read the optional `/session-media` `offset` page cursor. An absent parameter
 * means the first page; anything that is not a plain decimal non-negative safe
 * integer within the documented bound is rejected rather than silently coerced.
 */
function readSessionMediaOffset(url) {
  const raw = url.searchParams.get('offset');
  if (raw === null) return 0;
  if (!/^[0-9]+$/.test(raw)) return null;
  const offset = Number(raw);
  if (!Number.isSafeInteger(offset) || offset > MAX_SESSION_MEDIA_OFFSET) return null;
  return offset;
}

async function handleSessionMediaRequest(ctx, req, res) {
  const method = readOnlyMethod(req, res);
  if (method === null) return;
  let url;
  try {
    url = new URL(req.url ?? '', 'http://localhost');
  } catch {
    sendBadRequest(res, 'Invalid request URL.', method);
    return;
  }
  const sessionId = normalizeSessionId(url.searchParams.get('sessionId'));
  if (sessionId === null) {
    sendBadRequest(res, 'sessionId is required.', method);
    return;
  }
  const offset = readSessionMediaOffset(url);
  if (offset === null) {
    sendBadRequest(res, 'offset must be a non-negative integer no greater than ' + MAX_SESSION_MEDIA_OFFSET + '.', method);
    return;
  }
  const items = await refreshSessionAttachments(ctx, sessionId);
  const pageItems = items.slice(offset, offset + SESSION_ATTACHMENT_LIMIT);
  const nextOffset = offset + pageItems.length < items.length ? offset + pageItems.length : null;
  sendJson(res, 200, {
    ok: true,
    version: 1,
    filtered: true,
    sessionId,
    items: pageItems.map((item) => publicAttachment(sessionId, item)),
    nextOffset,
  }, method);
}

/**
 * Build a header-safe `Content-Disposition` value.
 *
 * HTTP header values must be Latin-1 safe: node:http throws ERR_INVALID_CHAR for
 * any character outside it, which would turn a perfectly valid Chinese-named
 * deliverable into a 404 (and leak the already-opened stream). The plain
 * `filename=` fallback is therefore ASCII-only, while the real name is carried
 * in the RFC 5987 `filename*=` parameter.
 */
function contentDisposition(name) {
  const original = String(name || 'media').replace(/[\r\n"]/g, '').slice(0, 180) || 'media';
  const fallback = original.replace(/[^\x20-\x7e]/g, '_') || 'media';
  const encoded = encodeURIComponent(original).replace(/['()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Release a stream that will not be consumed (HEAD, or an aborted response). */
async function discardStream(stream) {
  if (stream === null || stream === undefined) return;
  try {
    if (typeof stream.destroy === 'function') stream.destroy();
    else if (typeof stream.return === 'function') await stream.return();
  } catch {
    // The stream is already gone.
  }
}

/** Byte length of a file-backed stream, read from its opened descriptor so a
 * delivered file rewritten after it was listed is advertised at its real size. */
function streamFileBytes(stream, fallbackBytes) {
  if (stream === null || typeof stream !== 'object' || typeof stream.fd !== 'number') return fallbackBytes;
  try {
    const stat = fstatSync(stream.fd);
    return stat.isFile() ? stat.size : fallbackBytes;
  } catch {
    return fallbackBytes;
  }
}

/** Wait for backpressure to clear, or for the response to close or abort. */
function waitForDrain(res) {
  return new Promise((resolve) => {
    const settle = () => {
      res.off('drain', settle);
      res.off('close', settle);
      res.off('error', settle);
      resolve();
    };
    res.on('drain', settle);
    res.on('close', settle);
    res.on('error', settle);
  });
}

/** Stage the media response headers; nothing is committed until the first write. */
function writeMediaHeaders(res, stream, item, contentType) {
  res.statusCode = 200;
  res.setHeader('content-type', contentType || 'application/octet-stream');
  res.setHeader('content-length', String(streamFileBytes(stream, item.bytes)));
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-disposition', contentDisposition(item.name));
}

/** True while a normal error status can still be written to this response. */
function canSendStatus(res) {
  return res.headersSent !== true && res.destroyed !== true;
}

/** Remove staged headers after a stream failed before a header was committed. */
function resetResponseHeaders(res) {
  for (const name of res.getHeaderNames()) res.removeHeader(name);
}

/**
 * Stream one provider file into the response.
 *
 * The first chunk is pulled before a header is committed, so a provider that
 * still rejects the reference (for example a stored leaf name the local backend
 * refuses) is answered with a normal 404 instead of a destroyed response, which
 * the browser reports as a socket hang-up. A stream that was opened is always
 * released. Returns false only when no header was committed, so the caller can
 * still answer with a normal error status; true once the response was committed
 * or completed.
 */
async function streamToResponse(res, stream, item, contentType, method) {
  if (method === 'HEAD') {
    try {
      writeMediaHeaders(res, stream, item, contentType);
    } finally {
      await discardStream(stream);
    }
    res.end();
    return true;
  }

  let iterator;
  let current;
  try {
    iterator = stream[Symbol.asyncIterator]();
    current = await iterator.next();
  } catch {
    await discardStream(stream);
    return false;
  }

  try {
    writeMediaHeaders(res, stream, item, contentType);
  } catch {
    await discardStream(stream);
    resetResponseHeaders(res);
    return false;
  }

  let failedBeforeHeaders = false;
  try {
    while (current.done !== true) {
      if (res.destroyed) break;
      if (!res.write(current.value)) {
        await waitForDrain(res);
        if (res.destroyed) break;
      }
      current = await iterator.next();
    }
    if (!res.destroyed) res.end();
  } catch {
    failedBeforeHeaders = !res.headersSent && !res.destroyed;
    if (!failedBeforeHeaders && !res.destroyed) res.destroy();
  } finally {
    await discardStream(stream);
  }
  if (failedBeforeHeaders) {
    resetResponseHeaders(res);
    return false;
  }
  return true;
}

async function handleSessionAttachmentRequest(ctx, req, res) {
  const method = readOnlyMethod(req, res);
  if (method === null) return;
  let url;
  try {
    url = new URL(req.url ?? '', 'http://localhost');
  } catch {
    sendBadRequest(res, 'Invalid request URL.', method);
    return;
  }
  const sessionId = normalizeSessionId(url.searchParams.get('sessionId'));
  const attachmentId = normalizeAttachmentId(url.searchParams.get('attachmentId'));
  if (sessionId === null || attachmentId === null) {
    sendBadRequest(res, 'sessionId and attachmentId are required.', method);
    return;
  }
  const items = await refreshSessionAttachments(ctx, sessionId);
  const item = items.find((candidate) => candidate.attachmentId === attachmentId);
  if (item === undefined) {
    sendNotFound(res, 'Attachment not found.', method);
    return;
  }
  await serveAttachmentItem(ctx, res, item, method);
}

async function serveAttachmentItem(ctx, res, item, method) {
  const attachments = getService(ctx, 'attachments');
  if (attachments === undefined || attachments === null) {
    sendNotFound(res, 'Attachment storage is unavailable.', method);
    return;
  }

  if (item.storage === 'deliverable' && typeof item.path === 'string' && item.path.length > 0) {
    let stream;
    try {
      stream = createReadStream(item.path);
      await once(stream, 'open');
      if (await streamToResponse(res, stream, item, item.mediaType, method)) return;
    } catch {
      await discardStream(stream);
    }
    if (canSendStatus(res)) sendNotFound(res, 'Delivered file is unavailable.', method);
    return;
  }

  if (item.storage === 'image' && item.kind === 'image' && typeof item.mediaType === 'string' && item.mediaType.startsWith('image/')) {
    try {
      const stored = await attachments.readImage(item.ref);
      const data = Buffer.from(stored.data);
      res.statusCode = 200;
      res.setHeader('content-type', stored.ref?.mediaType ?? item.mediaType);
      res.setHeader('content-length', String(data.length));
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('content-disposition', contentDisposition(item.name));
      res.end(method === 'HEAD' ? undefined : data);
      return;
    } catch {
      // Fall through to the host-path fallback.
    }
    try {
      if (typeof attachments.imageHostPath === 'function') {
        const hostPath = attachments.imageHostPath(item.ref);
        if (typeof hostPath === 'string' && hostPath.length > 0) {
          const stream = createReadStream(hostPath);
          try {
            await once(stream, 'open');
          } catch (error) {
            await discardStream(stream);
            throw error;
          }
          if (await streamToResponse(res, stream, item, item.mediaType, method)) return;
        }
      }
    } catch {
      // Report the normal 404 below.
    }
    if (canSendStatus(res)) sendNotFound(res, 'Attachment bytes are unavailable.', method);
    return;
  }

  // The provider accepts only a ref whose name equals the full stored leaf
  // name; item.name is display text and may be shortened, so it cannot be used
  // to build the reference.
  const fileRef = { attachmentId: item.attachmentId, name: providerRefName(item), bytes: item.bytes };
  if (typeof attachments.readFileStream === 'function') {
    try {
      const stream = await attachments.readFileStream(fileRef);
      if (await streamToResponse(res, stream, item, item.mediaType, method)) return;
    } catch {
      // Fall back to a host-owned file path when the backend has no byte stream.
    }
  }
  try {
    if (typeof attachments.fileHostPath === 'function') {
      const hostPath = attachments.fileHostPath(fileRef);
      if (typeof hostPath === 'string' && hostPath.length > 0) {
        const stream = createReadStream(hostPath);
        try {
          await once(stream, 'open');
        } catch (error) {
          await discardStream(stream);
          throw error;
        }
        if (await streamToResponse(res, stream, item, item.mediaType, method)) return;
      }
    }
  } catch {
    // Report the normal 404 below.
  }
  if (canSendStatus(res)) sendNotFound(res, 'Attachment bytes are unavailable.', method);
}

async function handleSessionObjectRequest(ctx, req, res) {
  const method = readOnlyMethod(req, res);
  if (method === null) return;
  let url;
  try {
    url = new URL(req.url ?? '', 'http://localhost');
  } catch {
    sendBadRequest(res, 'Invalid request URL.', method);
    return;
  }
  const sessionId = normalizeSessionId(url.searchParams.get('sessionId'));
  const attachmentId = normalizeAttachmentId(url.searchParams.get('attachmentId'));
  if (sessionId === null || attachmentId === null) {
    sendBadRequest(res, 'sessionId and attachmentId are required.', method);
    return;
  }
  const entry = attachmentCacheFor(sessionId);
  await refreshSessionAttachments(ctx, sessionId);
  let item = entry.all.get(attachmentId);
  if (item === undefined) {
    const name = url.searchParams.get('name');
    const requestedName = typeof name === 'string' ? name.trim() : '';
    const bytes = Number(url.searchParams.get('bytes'));
    if (requestedName.length > 0 && requestedName.length <= MAX_STORED_NAME_CHARS) {
      // The query name is the full stored leaf name of a not-yet-cached
      // attachment. Keep it intact in the provider reference and shorten only
      // the display name, because the provider rejects a truncated ref name.
      const fileRef = { attachmentId, name: requestedName, bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0 };
      item = {
        attachmentId,
        kind: kindForName(requestedName) ?? 'file',
        name: displayNameFor(requestedName),
        bytes: fileRef.bytes,
        width: 0,
        height: 0,
        mediaType: mimeForName(requestedName),
        storage: 'file',
        createdAt: 0,
        ref: fileRef,
      };
    }
  }
  if (item === undefined) {
    sendNotFound(res, 'Conversation file not found.', method);
    return;
  }
  await serveAttachmentItem(ctx, res, item, method);
}

async function handleSessionDeliverableRequest(ctx, req, res) {
  const method = readOnlyMethod(req, res);
  if (method === null) return;
  let url;
  try {
    url = new URL(req.url ?? '', 'http://localhost');
  } catch {
    sendBadRequest(res, 'Invalid request URL.', method);
    return;
  }
  const sessionId = normalizeSessionId(url.searchParams.get('sessionId'));
  const filePath = url.searchParams.get('path');
  if (sessionId === null || typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 4096) {
    sendBadRequest(res, 'sessionId and path are required.', method);
    return;
  }
  const entry = attachmentCacheFor(sessionId);
  await refreshSessionAttachments(ctx, sessionId);
  const item = entry.deliverables.get(filePath);
  if (item === undefined) {
    sendNotFound(res, 'Delivered file not found.', method);
    return;
  }
  await serveAttachmentItem(ctx, res, item, method);
}

export function apply(ctx) {
  ctx.effect(() => ctx.tools.register(EXPORT_VIDEO_TOOL));
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: WORKER_PATH,
    handler: handleWorkerRequest,
  }));
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SESSION_MEDIA_PATH,
    handler: (req, res) => handleSessionMediaRequest(ctx, req, res),
  }));
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SESSION_ATTACHMENT_PATH,
    handler: (req, res) => handleSessionAttachmentRequest(ctx, req, res),
  }));
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SESSION_OBJECT_PATH,
    handler: (req, res) => handleSessionObjectRequest(ctx, req, res),
  }));
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SESSION_DELIVERABLE_PATH,
    handler: (req, res) => handleSessionDeliverableRequest(ctx, req, res),
  }));
  ctx.effect(() => () => {
    sessionAttachmentCache.clear();
  });
}
