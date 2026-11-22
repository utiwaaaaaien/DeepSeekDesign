import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { createFakeIndexedDb } from './fake-indexeddb.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_PATH = join(ROOT, 'deepseek-design-plugin', 'client.js');

function loadClient(options = {}) {
  let source = readFileSync(CLIENT_PATH, 'utf8');
  source = source.replace('    // @@CORE_END', `
    globalThis.__CORE = {
      formatTimecode, formatDuration, aspectRatio, exportDimensions,
      estimatedExportBytes, normalizeSpec, sequenceDuration, trackClips,
      timelineDuration, timelineIsEmpty, placeMovedClip, splitClipAt, clampTrim, isAspect,
      closestAspectFor, linkedAudioClips, collectAudioClips,
      normalizeClip, normalizeWorkspacePath, projectScopeKey, projectScopeLabel, matchesInboxScope,
      conversationFileRefForCard, conversationDeliverableRefForCard, readConversationFileDrag,
      // Additional pure helpers exercised by the extended edge-case tests.
      MIN_CLIP_SECONDS, makeEven, videoBitrateFor, audioBitrateFor, humanBytes,
      clipEnd, overlaps, findFreeStart, insertionIndexFor, workspaceNameFromPath,
      validateAnimationToolArgs, restoreProject, serializeProject, createEmptyState, hasContent,
      sanitizeProjectIndex, renderAnimationVideo, chooseRecorderMime, animationFrameRate,
    };
    globalThis.__AUDIO_RUNTIME = () => audioRuntime;
    globalThis.__DICTIONARIES = () => ({ zh, en });
    // @@CORE_END`);
  source = source.replace('    // @@STORE_END', `
    globalThis.__STORE_FACTORY = createWorkbenchStore;
    globalThis.__LIMITS = { MAX_PROJECT_IMPORT_BYTES };
    globalThis.__PROJECT_KEYS = {
      INDEX_KEY: PROJECT_INDEX_KEY,
      LEGACY_KEY: LEGACY_STORAGE_KEY,
      PREFIX: PROJECT_DOC_PREFIX,
    };
    // @@STORE_END`);
  source = source.replace('    // @@UI_END', `
    globalThis.__UI = { ModelMenu, ExportVideoToolRow, TimelineVideoLayer, createRunSequence };
    // @@UI_END`);

  const storage = options.storage ?? new Map();
  for (const [key, value] of Object.entries(options.seedStorage ?? {})) storage.set(key, value);
  const requests = [];
  const timers = new Set();
  let intervalHandlers = [];
  let moduleRecord = null;
  let resolveGenerate = null;
  const fakeFetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('data:')) {
      const comma = url.indexOf(',');
      const metadata = comma >= 0 ? url.slice(5, comma) : 'text/plain';
      const payload = comma >= 0 ? url.slice(comma + 1) : '';
      const isBase64 = /;base64/i.test(metadata);
      let bytes;
      try {
        bytes = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
      } catch {
        bytes = Buffer.alloc(0);
      }
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob([bytes], { type: metadata.split(';')[0] || 'application/octet-stream' }),
      };
    }
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (body.action === 'models') {
      return {
        ok: true,
        json: async () => ({
          models: [
            {
              provider: 'deepseek-official',
              providerName: 'DeepSeek',
              id: 'deepseek-flash',
              name: 'DeepSeek-V4.1-Flash',
              reasoning: {
                efforts: [
                  { id: 'off', name: 'Off' },
                  { id: 'low', name: 'Low' },
                  { id: 'high', name: 'High' },
                  { id: 'max', name: 'Max' },
                ],
                defaultEffort: 'high',
              },
            },
            {
              provider: 'deepseek-account',
              providerName: 'DeepSeek Account',
              id: 'deepseek-v4-pro',
              name: 'DeepSeek-V4-Pro',
              reasoning: {
                efforts: [
                  { id: 'low', name: 'Low' },
                  { id: 'high', name: 'High' },
                ],
                defaultEffort: 'low',
              },
            },
          ],
          default: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' },
        }),
      };
    }
    if (body.action === 'skills') {
      return {
        ok: true,
        json: async () => ({ skills: [{ name: 'visible-skill', description: 'Visible', source: 'custom' }] }),
      };
    }
    if (body.action === 'generate') {
      return new Promise((resolve) => {
        resolveGenerate = () => resolve({
          ok: true,
          json: async () => ({
            reply: 'late response',
            notes: [],
            spec: {
              title: 'Late',
              palette: ['#111111', '#222222', '#333333', '#444444'],
              scenes: [{ type: 'orbit', duration: 3, intensity: 0.5 }],
            },
          }),
        });
      });
    }
    return { ok: false, status: 500, json: async () => ({ error: { message: 'unexpected request' } }) };
  };
  const window = {
    __ModuleLoader__: {
      load(record) { moduleRecord = record; },
    },
    setTimeout(fn, ms) {
      const timer = setTimeout(fn, ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      timers.delete(timer);
      clearTimeout(timer);
    },
    setInterval(fn, ms) {
      const timer = setInterval(fn, ms);
      timer.unref?.();
      timers.add(timer);
      intervalHandlers.push({ timer, ms, fn });
      return timer;
    },
    clearInterval(timer) {
      timers.delete(timer);
      intervalHandlers = intervalHandlers.filter((entry) => entry.timer !== timer);
      clearInterval(timer);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    window,
    document: { createElement: () => ({}), addEventListener() {}, removeEventListener() {} },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
      get length() { return storage.size; },
      key: (index) => {
        const keys = [...storage.keys()];
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
    },
    fetch: fakeFetch,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    AbortController,
    Blob,
    JSON,
    Date,
    Math,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    setTimeout,
    clearTimeout,
    console,
  };
  Object.assign(sandbox, options.globals ?? {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });
  assert.equal(typeof moduleRecord?.factory, 'function', 'Client module must register a factory');
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Component: class {},
    Fragment: 'fragment',
    useCallback: (fn) => fn,
    useEffect() {},
    useLayoutEffect() {},
    useMemo: (fn) => fn(),
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => [initial, () => {}],
    useSyncExternalStore: () => ({}),
  };
  moduleRecord.factory(() => React);
  const sessionId = options.sessionId ?? 's1';
  const sessionsState = {
    ids: [sessionId],
    byId: {
      [sessionId]: {
        sessionId,
        cwd: options.cwd ?? '/workspace/alpha',
      },
    },
    phase: 'ready',
  };
  const sessionListeners = new Set();
  const sessionsList = {
    getSnapshot: () => sessionsState,
    subscribe: (listener) => {
      if (typeof listener !== 'function') return () => {};
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
  };
  const sessionsService = { list: sessionsList };
  const ctx = {
    locale: {
      register: () => () => {},
      getLocale: () => ({ active: 'en' }),
      getSnapshot: () => ({ active: 'en' }),
    },
    get: (name) => (name === 'sessions' ? sessionsService : undefined),
    sessions: sessionsService,
  };
  const store = sandbox.__STORE_FACTORY(ctx);
  store.setActiveSession(sessionId);
  return {
    sandbox,
    core: sandbox.__CORE,
    store,
    requests,
    storage,
    sessionsState,
    sessionsList,
    // Deliver a session-list change (e.g. a Workspace cwd that resolved late)
    // to the store's real subscription, like the Harness sessions service does.
    emitSessionsChange: () => {
      for (const listener of [...sessionListeners]) listener();
    },
    sessionListenerCount: () => sessionListeners.size,
    resolveGenerate: () => resolveGenerate?.(),
    // Test-only timer probes: run every armed interval with this delay once
    // (simulates a minute passing) without real timers.
    runIntervals: (ms) => {
      for (const entry of intervalHandlers.filter((item) => item.ms === ms)) entry.fn();
    },
    intervalCount: (ms) => intervalHandlers.filter((item) => item.ms === ms).length,
  };
}

test('Client core helpers produce valid deterministic values', () => {
  const { core } = loadClient();
  assert.equal(core.formatTimecode(65.5, 30), '01:05:15');
  assert.equal(core.formatDuration(3661), '1:01:00');
  assert.equal(core.formatDuration(65), '01:05');
  assert.equal(core.isAspect('3:4'), true);
  assert.equal(core.isAspect('99:1'), false);
  const portrait = core.exportDimensions('3:4', '1080p');
  assert.equal(portrait.width, 1080);
  assert.equal(portrait.height, 1440);
  const landscape = core.exportDimensions('16:9', '4k');
  assert.equal(landscape.width, 3840);
  assert.equal(landscape.height, 2160);
  assert.ok(core.estimatedExportBytes(10, '1080p', 'high') > 0);
  const split = core.splitClipAt({ id: 'clip', start: 0, duration: 4 }, 2);
  assert.equal(split.left.duration, 2);
  assert.equal(split.right.start, 2);
  assert.equal(split.right.duration, 2);
  assert.equal(core.splitClipAt({ id: 'clip', start: 0, duration: 4 }, 0.2), null);
  const placed = core.placeMovedClip(
    [{ id: 'a', start: 0, duration: 2 }, { id: 'b', start: 2, duration: 2 }],
    'b', 0.5, 0.5,
  );
  assert.equal(placed.length, 2);
  assert.equal(new Set(placed.map((clip) => clip.id)).size, 2);
  assert.equal(placed.reduce((sum, clip) => sum + clip.duration, 0), 4);
  assert.equal(placed[0].start, 0);
  assert.equal(placed[1].start, 2);
  const trimmed = core.clampTrim({ start: 2, duration: 3, sourceIn: 1, sourceDuration: 10 }, 'end', 99, { nextStart: 7 });
  assert.equal(trimmed.duration, 5);
  assert.equal(trimmed.start, 2);
});

test('Client store starts blank, autosaves a rename, and round-trips a project file', async () => {
  const { store, storage, requests, sandbox } = loadClient();
  const blank = store.getSnapshot();
  assert.equal(blank.assets.length, 0);
  assert.equal(blank.generations.length, 0);
  assert.equal(blank.chat.messages.length, 0);
  assert.equal(blank.timeline.video.length, 0);
  assert.equal(blank.project.name, '');
  assert.equal(blank.project.aspect, '16:9');
  assert.equal(blank.project.aspectInitialized, false);

  store.setProjectName('Deliverable');
  assert.equal(store.getSnapshot().project.name, 'Deliverable');
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(store.getSnapshot().persistence.status, 'saved');
  const saved = JSON.parse([...storage.entries()].find(([key]) => key.startsWith(sandbox.__PROJECT_KEYS.PREFIX))[1]);
  assert.equal(saved.project.name, 'Deliverable');
  assert.equal(saved.project.aspect, '16:9');

  assert.equal(store.addBedAt(0, 'en'), true);
  assert.equal(store.getSnapshot().timeline.music.length, 1);
  store.undo();
  assert.equal(store.getSnapshot().timeline.music.length, 0);
  store.redo();
  assert.equal(store.getSnapshot().timeline.music.length, 1);

  const exported = await store.exportProjectFile();
  assert.equal(exported.data.format, 'deepseek-design.project');
  assert.equal(exported.data.version, 1);
  assert.equal(exported.data.project.name, 'Deliverable');
  const imported = await store.importProjectFile(exported.data, 'en');
  assert.equal(imported.omitted, 0);
  assert.equal(store.getSnapshot().project.name, 'Deliverable');
  assert.equal(store.getSnapshot().timeline.music.length, 1);
  await assert.rejects(() => store.importProjectFile({ version: 2 }, 'en'), /valid/i);
  assert.equal(store.getSnapshot().project.name, 'Deliverable', 'a rejected import must not replace the project');
  assert.ok(requests.every((request) => request.url === '/deepseek-design/api'));
  assert.equal(sandbox.__LIMITS.MAX_PROJECT_IMPORT_BYTES, 1536 * 1024 * 1024);
  store.dispose();
});

test('The first video or audio added to a blank timeline starts at zero', async () => {
  const videoClient = loadClient();
  await videoClient.store.importProjectFile({
    version: 1,
    project: { name: 'Blank video project', aspect: '16:9' },
    assets: [{
      id: 'asset-video-audio',
      name: 'with-audio.mp4',
      kind: 'video',
      mime: 'video/mp4',
      duration: 5,
      width: 1920,
      height: 1080,
      hasAudio: true,
      blobId: null,
    }],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  const placedVideo = videoClient.store.addAssetToTimeline('asset-video-audio', 'video', 9, 'en');
  assert.equal(placedVideo.kind, 'video');
  assert.equal(placedVideo.hasAudio, true);
  let state = videoClient.store.getSnapshot();
  assert.equal(state.timeline.video.length, 1);
  assert.equal(state.timeline.video[0].start, 0, 'first video must be anchored at the far left');
  const linked = videoClient.core.linkedAudioClips(state.timeline, state.assets);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].start, 0, 'the linked audio lane must also start at the far left');
  videoClient.store.dispose();

  const audioClient = loadClient();
  await audioClient.store.importProjectFile({
    version: 1,
    project: { name: 'Blank audio project', aspect: '16:9' },
    assets: [{
      id: 'asset-audio',
      name: 'voice.wav',
      kind: 'audio',
      mime: 'audio/wav',
      duration: 4,
      blobId: null,
    }],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  const placedAudio = audioClient.store.addAssetToTimeline('asset-audio', 'video', 8, 'en');
  assert.equal(placedAudio.kind, 'audio');
  assert.equal(placedAudio.hasAudio, true);
  state = audioClient.store.getSnapshot();
  assert.equal(state.timeline.audio.length, 1);
  assert.equal(state.timeline.audio[0].start, 0, 'first audio must be anchored at the far left');
  audioClient.store.dispose();
});

test('Client supports video asset clips, multi-selection deletion, and safe asset deletion', async () => {
  const { store } = loadClient();
  await store.importProjectFile({
    version: 1,
    project: { name: 'Video project', aspect: '3:4' },
    assets: [{
      id: 'asset-video',
      name: 'export.webm',
      kind: 'video',
      mime: 'video/webm',
      duration: 5,
      width: 1080,
      height: 1440,
      blobId: null,
    }],
    timeline: {
      video: [{
        id: 'clip-a',
        kind: 'asset',
        track: 'video',
        assetId: 'asset-video',
        start: 0,
        sourceIn: 0,
        duration: 3,
        sourceDuration: 5,
      }],
      audio: [],
      music: [],
    },
  }, 'en');
  let state = store.getSnapshot();
  assert.equal(state.assets.length, 1);
  assert.equal(state.timeline.video[0].kind, 'asset');
  assert.equal(state.timeline.video[0].assetId, 'asset-video');

  assert.equal(store.addVideoAssetToTrack('asset-video', 7, 'en'), true);
  state = store.getSnapshot();
  assert.equal(state.timeline.video.length, 2);
  const secondClip = state.timeline.video.find((clip) => clip.id !== 'clip-a');
  assert.ok(secondClip);
  assert.equal(secondClip.kind, 'asset');

  store.selectClips([
    { track: 'video', id: 'clip-a' },
    { track: 'video', id: secondClip.id },
  ]);
  state = store.getSnapshot();
  assert.equal(state.selectedClips.length, 2);
  assert.equal(state.selectedClip, null);
  assert.equal(store.deleteSelectedClips(), true);
  state = store.getSnapshot();
  assert.equal(state.timeline.video.length, 0);
  assert.equal(state.selectedClips.length, 0);
  assert.equal(store.undo(), true);
  assert.equal(store.getSnapshot().timeline.video.length, 2);

  const blocked = await store.deleteAsset('asset-video');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'in-use');
  assert.equal(blocked.count, 2);
  store.selectClips(store.getSnapshot().timeline.video.map((clip) => ({ track: 'video', id: clip.id })));
  store.deleteSelectedClips();
  const deleted = await store.deleteAsset('asset-video');
  assert.equal(deleted.ok, true);
  state = store.getSnapshot();
  assert.equal(state.assets.length, 0);
  assert.equal(state.selectedAsset, null);
  assert.equal(store.undo(), true);
  assert.equal(store.getSnapshot().timeline.video.length, 0, 'undo must not resurrect clips for a deleted asset');
  store.dispose();
});

test('Client model and Skill refresh requests include force:true', async () => {
  const { store, requests } = loadClient();
  await store.loadModels(true);
  await store.loadSkills(true);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, { action: 'models', force: true });
  assert.deepEqual(requests[1].body, { action: 'skills', force: true });
  assert.equal(store.getSnapshot().models.status, 'ready');
  assert.equal(store.getSnapshot().skills.status, 'ready');
  store.dispose();
});

test('Client mirrors Harness default effort and persists model reasoning changes', async () => {
  const { store, requests, resolveGenerate } = loadClient();
  await store.loadModels(true);
  let state = store.getSnapshot();
  assert.equal(state.preferences.model.provider, 'deepseek-official');
  assert.equal(state.preferences.model.reasoningEffort, 'max', 'the loaded Harness default effort wins on first use');
  assert.equal(state.models.items[0].description, undefined, 'model notes must not enter the picker state');
  assert.equal(state.models.items[0].reasoning.efforts.map((effort) => effort.id).join(','), 'off,low,high,max');

  const pro = state.models.items.find((item) => item.id === 'deepseek-v4-pro');
  store.selectModel(pro);
  state = store.getSnapshot();
  assert.equal(state.preferences.model.model, 'deepseek-v4-pro');
  assert.equal(state.preferences.model.reasoningEffort, 'low', 'a new model starts at its own default effort');
  assert.equal(store.selectReasoningEffort('high'), true);
  assert.equal(store.getSnapshot().preferences.model.reasoningEffort, 'high');

  const pending = store.sendPrompt('hi', 'en');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const generate = requests.find((request) => request.body.action === 'generate');
  assert.equal(generate.body.model.reasoningEffort, 'high');
  resolveGenerate();
  await pending;
  store.dispose();
});

test('Client ModelMenu renders model names and the reasoning control only', () => {
  const { sandbox } = loadClient();
  const reasoning = {
    efforts: [
      { id: 'off', name: 'Off' },
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
      { id: 'max', name: 'Max' },
    ],
    defaultEffort: 'max',
  };
  const item = {
    provider: 'deepseek-official',
    providerName: 'DeepSeek',
    id: 'deepseek-flash',
    name: 'DeepSeek-V4.1-Flash',
    description: 'SHOULD_NOT_RENDER',
    reasoning,
  };
  const state = {
    models: {
      status: 'ready',
      items: [item],
      default: { ...item, reasoningEffort: 'max' },
      error: '',
    },
    preferences: {
      model: {
        provider: item.provider,
        model: item.id,
        providerName: item.providerName,
        modelName: item.name,
        reasoningEffort: 'max',
      },
      skills: [],
    },
  };
  const tree = sandbox.__UI.ModelMenu({
    t: (key) => key,
    state,
    onSelect() {},
    onSelectEffort() {},
    onClose() {},
    onRetry() {},
    returnFocusRef: { current: null },
  });
  const flatten = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return [];
    if (typeof node === 'string' || typeof node === 'number') return [String(node)];
    if (Array.isArray(node)) return node.flatMap(flatten);
    return flatten(node.children);
  };
  const text = flatten(tree).join(' ');
  assert.match(text, /DeepSeek-V4\.1-Flash/);
  assert.match(text, /model\.reasoning/);
  assert.match(text, /Max/);
  assert.doesNotMatch(text, /SHOULD_NOT_RENDER/);
});

test('Export tool view renders a compact native card without model-chat chrome', () => {
  const { sandbox } = loadClient();
  const tree = sandbox.__UI.ExportVideoToolRow({
    phase: 'preparing',
    callId: 'call-1',
    block: { args: { text: () => undefined, value: () => undefined } },
    t: (key) => key,
    ctx: { get: () => undefined },
  });
  const flatten = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return [];
    if (typeof node === 'string' || typeof node === 'number') return [String(node)];
    if (Array.isArray(node)) return node.flatMap(flatten);
    return flatten(node.children);
  };
  const text = flatten(tree).join(' ');
  assert.match(text, /tool\.exporting/);
  assert.match(text, /tool\.pending/);
  assert.doesNotMatch(text, /chat\./);
});

test('An import during a generation leaves only the imported chat', async () => {
  const { store, resolveGenerate } = loadClient();
  await store.loadModels(true);
  const pending = store.sendPrompt('hi', 'en');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.importProjectFile({
    version: 1,
    project: { name: 'Imported', aspect: '3:4' },
    chat: { messages: [{ id: 'm1', role: 'user', text: 'imported' }] },
  }, 'en');
  resolveGenerate();
  await pending;
  const state = store.getSnapshot();
  assert.equal(state.project.name, 'Imported');
  assert.equal(state.chat.messages.length, 1);
  assert.equal(state.chat.messages[0].text, 'imported');
  assert.equal(state.chat.busy, false);
  store.dispose();
});

test('reasoning effort and restored settings survive catalog reloads', async () => {
  const { store } = loadClient();
  await store.importProjectFile({
    version: 1,
    project: { name: 'Settings', aspect: '3:4' },
    preferences: {
      model: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' },
      skills: ['a', 'a', 'b', 'c'],
    },
  }, 'en');
  await store.loadModels(true);
  assert.equal(store.getSnapshot().preferences.model.reasoningEffort, 'high');
  assert.equal(store.getSnapshot().preferences.skills.join(','), 'a,b');
  await store.importProjectFile({
    version: 1,
    project: { name: 'Settings', aspect: '3:4' },
    preferences: {
      model: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'bogus' },
      skills: ['a'],
    },
  }, 'en');
  await store.loadModels(true);
  assert.equal(store.getSnapshot().preferences.model.reasoningEffort, 'high', 'an unsupported restored effort falls back to the model default');
  store.dispose();
});

test('clearing the project name removes a name-only saved project document', async () => {
  const { store, storage, sandbox } = loadClient();
  store.setProjectName('OnlyName');
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.ok(storage.has(sandbox.__PROJECT_KEYS.INDEX_KEY));
  assert.ok([...storage.keys()].some((key) => key.startsWith(sandbox.__PROJECT_KEYS.PREFIX)));
  store.setProjectName('');
  assert.ok(storage.has(sandbox.__PROJECT_KEYS.INDEX_KEY), 'the empty project stays in the project index');
  assert.equal([...storage.keys()].some((key) => key.startsWith(sandbox.__PROJECT_KEYS.PREFIX)), false);
  assert.equal(store.getSnapshot().persistence.status, 'blank');
  store.dispose();
});

test('blank project files round-trip without requiring content', async () => {
  const { store } = loadClient();
  const exported = await store.exportProjectFile();
  assert.equal(exported.embedded, 0);
  await store.importProjectFile(exported.data, 'en');
  assert.equal(store.getSnapshot().project.aspect, '16:9');
  assert.equal(store.getSnapshot().persistence.status, 'blank');
  store.dispose();
});

test('restore rejects duplicate generation, clip, and message IDs', async () => {
  const { store } = loadClient();
  const scene = { type: 'orbit', duration: 3, intensity: 0.5, seed: 1, title: 'Orbit' };
  const generation = {
    id: 'generation-1',
    title: 'Duplicate test',
    spec: { title: 'Duplicate test', palette: ['#111111', '#222222', '#333333', '#444444'], scenes: [scene] },
    source: 'deepseek',
    status: 'draft',
  };
  await store.importProjectFile({
    version: 1,
    project: { name: 'Duplicate IDs', aspect: '3:4' },
    generations: [generation, { ...generation }],
    timeline: {
      video: [
        { id: 'same-clip', kind: 'generation', track: 'video', generationId: 'generation-1', sceneIndex: 0, start: 0, duration: 2 },
        { id: 'same-clip', kind: 'generation', track: 'video', generationId: 'generation-1', sceneIndex: 0, start: 3, duration: 2 },
      ],
    },
    chat: { messages: [
      { id: 'same-message', role: 'user', text: 'a' },
      { id: 'same-message', role: 'user', text: 'b' },
    ] },
  }, 'en');
  const state = store.getSnapshot();
  assert.equal(state.generations.length, 1);
  assert.equal(state.timeline.video.length, 2);
  assert.equal(new Set(state.timeline.video.map((clip) => clip.id)).size, 2);
  assert.equal(new Set(state.chat.messages.map((message) => message.id)).size, 2);
  store.dispose();
});

test('first timeline video sets the project aspect once from its native ratio', async () => {
  const { store } = loadClient();
  const project = {
    version: 1,
    project: { name: 'Aspect', aspect: '16:9', aspectInitialized: false },
    assets: [
      { id: 'portrait', name: 'Portrait.mp4', kind: 'video', mime: 'video/mp4', size: 100, duration: 5, width: 1080, height: 1920, blobId: null, createdAt: 1 },
      { id: 'landscape', name: 'Landscape.mp4', kind: 'video', mime: 'video/mp4', size: 100, duration: 5, width: 1920, height: 1080, blobId: null, createdAt: 2 },
    ],
    generations: [],
    timeline: { video: [], audio: [], music: [] },
    chat: { messages: [] },
  };
  await store.importProjectFile(project, 'en');
  assert.equal(store.addVideoAssetToTrack('portrait', 0, 'en'), true);
  assert.equal(store.getSnapshot().project.aspect, '9:16');
  assert.equal(store.getSnapshot().project.aspectInitialized, true);
  assert.equal(store.addVideoAssetToTrack('landscape', 5, 'en'), true);
  assert.equal(store.getSnapshot().project.aspect, '9:16', 'later videos must not override the first choice');
  store.dispose();
});

test('generation and asset deletion can cascade through timeline clips', async () => {
  const { store } = loadClient();
  const scene = { type: 'orbit', duration: 3, intensity: 0.5, seed: 1, title: 'Orbit' };
  await store.importProjectFile({
    version: 1,
    project: { name: 'Delete cascade', aspect: '16:9' },
    assets: [
      { id: 'video-asset', name: 'Clip.mp4', kind: 'video', mime: 'video/mp4', size: 10, duration: 4, width: 1920, height: 1080, blobId: null, createdAt: 1 },
    ],
    generations: [{
      id: 'generation-cascade',
      title: 'Generated',
      spec: { title: 'Generated', palette: ['#111111', '#222222', '#333333', '#444444'], scenes: [scene] },
      source: 'deepseek',
      status: 'applied',
      createdAt: 2,
    }],
    timeline: {
      video: [
        { id: 'gen-clip', kind: 'generation', track: 'video', generationId: 'generation-cascade', sceneIndex: 0, start: 0, duration: 3 },
        { id: 'asset-clip', kind: 'asset', track: 'video', assetId: 'video-asset', start: 4, duration: 4 },
      ],
      audio: [],
      music: [],
    },
    chat: { messages: [{ id: 'msg-1', role: 'assistant', text: 'done', generationId: 'generation-cascade' }] },
  }, 'en');
  const blockedGen = store.deleteGeneration('generation-cascade');
  assert.equal(blockedGen.ok, false);
  assert.equal(blockedGen.reason, 'in-use');
  assert.equal(blockedGen.count, 1);
  const deletedGen = store.deleteGeneration('generation-cascade', { force: true });
  assert.equal(deletedGen.ok, true);
  assert.equal(store.getSnapshot().generations.length, 0);
  assert.equal(store.getSnapshot().timeline.video.length, 1);
  const blockedAsset = await store.deleteAsset('video-asset');
  assert.equal(blockedAsset.ok, false);
  const deletedAsset = await store.deleteAsset('video-asset', { force: true });
  assert.equal(deletedAsset.ok, true);
  assert.equal(store.getSnapshot().assets.length, 0);
  assert.equal(store.getSnapshot().timeline.video.length, 0);
  store.dispose();
});

test('video assets with audio produce a linked audio timeline stream', () => {
  const { core } = loadClient();
  assert.equal(core.closestAspectFor(1920, 1080), '16:9');
  assert.equal(core.closestAspectFor(1080, 1920), '9:16');
  assert.equal(core.closestAspectFor(1000, 1000), '1:1');
  const assets = [
    { id: 'with-audio', name: 'A.mp4', kind: 'video', hasAudio: true, duration: 5, peaks: [0.2, 0.4] },
    { id: 'silent', name: 'B.mp4', kind: 'video', hasAudio: false, duration: 5, peaks: [] },
  ];
  const timeline = {
    video: [
      { id: 'clip-a', kind: 'asset', assetId: 'with-audio', start: 1, duration: 4, sourceIn: 0.5 },
      { id: 'clip-b', kind: 'asset', assetId: 'silent', start: 5, duration: 4 },
    ],
    audio: [{ id: 'audio-clip', kind: 'audio', assetId: 'audio-asset', start: 0, duration: 2 }],
    music: [],
  };
  const linked = core.linkedAudioClips(timeline, assets);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].kind, 'linked-audio');
  assert.equal(linked[0].start, 1);
  assert.equal(linked[0].duration, 4);
  assert.equal(linked[0].linkClipId, 'clip-a');
  const collected = core.collectAudioClips(timeline, assets);
  assert.equal(collected.length, 2);
  assert.ok(collected.some((clip) => clip.id === 'linked:clip-a'));
});

test('V0.9 migration removes pre-release auto-imported assets and skips their origin keys', async () => {
  const { store } = loadClient();
  await store.importProjectFile({
    version: 1,
    project: { name: 'Migration', aspect: '16:9' },
    assets: [
      { id: 'kept', name: 'Mine.png', kind: 'image', mime: 'image/png', size: 10, duration: 0, width: 10, height: 10, blobId: null, source: 'import', createdAt: 1 },
      { id: 'auto', name: 'screen.png', kind: 'image', mime: 'image/png', size: 10, duration: 0, width: 10, height: 10, blobId: null, source: 'conversation', originKey: 'attachment:sha256:screen', createdAt: 2 },
    ],
    generations: [],
    timeline: { video: [], audio: [], music: [] },
    chat: { messages: [] },
  }, 'en');
  const state = store.getSnapshot();
  assert.equal(state.autoImportVersion, 3);
  assert.equal(state.assets.length, 1);
  assert.equal(state.assets[0].id, 'kept');
  assert.ok(state.autoImportSkipped.includes('attachment:sha256:screen'));
  store.dispose();
});

test('library multi-selection can delete mixed assets and generations in one action', async () => {
  const { store } = loadClient();
  const scene = { type: 'orbit', duration: 3, intensity: 0.5, seed: 1, title: 'Orbit' };
  await store.importProjectFile({
    version: 1,
    project: { name: 'Multi delete', aspect: '16:9' },
    assets: [
      { id: 'video-a', name: 'A.mp4', kind: 'video', mime: 'video/mp4', size: 10, duration: 4, width: 1920, height: 1080, blobId: null, createdAt: 1 },
      { id: 'audio-b', name: 'B.wav', kind: 'audio', mime: 'audio/wav', size: 10, duration: 4, width: 0, height: 0, blobId: null, createdAt: 2 },
    ],
    generations: [{
      id: 'generation-multi',
      title: 'Generated',
      spec: { title: 'Generated', palette: ['#111111', '#222222', '#333333', '#444444'], scenes: [scene] },
      source: 'deepseek',
      status: 'applied',
      createdAt: 3,
    }],
    timeline: {
      video: [
        { id: 'clip-a', kind: 'asset', track: 'video', assetId: 'video-a', start: 0, duration: 4 },
        { id: 'clip-gen', kind: 'generation', track: 'video', generationId: 'generation-multi', sceneIndex: 0, start: 4, duration: 3 },
      ],
      audio: [{ id: 'clip-b', kind: 'audio', track: 'audio', assetId: 'audio-b', start: 0, duration: 4 }],
      music: [],
    },
    chat: { messages: [] },
  }, 'en');
  store.setAssetSelection([
    { type: 'asset', id: 'video-a' },
    { type: 'asset', id: 'audio-b' },
    { type: 'generation', id: 'generation-multi' },
  ], { type: 'asset', id: 'video-a' });
  let state = store.getSnapshot();
  assert.equal(state.selectedAssets.length, 3);
  assert.equal(state.selectedAsset.type, 'asset');
  assert.equal(state.selectedAsset.id, 'video-a');
  const blocked = store.deleteEntries(state.selectedAssets);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.count, 3);
  const deleted = store.deleteEntries(state.selectedAssets, { force: true });
  assert.equal(deleted.ok, true);
  state = store.getSnapshot();
  assert.equal(state.assets.length, 0);
  assert.equal(state.generations.length, 0);
  assert.equal(state.timeline.video.length, 0);
  assert.equal(state.timeline.audio.length, 0);
  assert.equal(state.selectedAssets.length, 0);
  assert.equal(state.selectedAsset, null);
  store.dispose();
});

test('Conversation file cards resolve attachment ids through their React fiber', () => {
  const { core } = loadClient();
  const element = {
    getAttribute: (name) => (name === 'title' ? 'voice.wav' : null),
  };
  const file = { attachmentId: 'sha256:voice', name: 'voice.wav', bytes: 9 };
  element['__reactFiber$test'] = {
    memoizedProps: {},
    return: {
      memoizedProps: { content: { attachments: [{ type: 'file', file }] } },
      return: null,
    },
  };
  assert.deepEqual({ ...core.conversationFileRefForCard(element) }, {
    attachmentId: 'sha256:voice',
    name: 'voice.wav',
    bytes: 9,
    kind: 'file',
  });
  const deliverable = {
    querySelector: () => ({ getAttribute: () => '/tmp/final.png' }),
  };
  assert.deepEqual({ ...core.conversationDeliverableRefForCard(deliverable) }, {
    path: '/tmp/final.png',
    name: 'final.png',
    kind: 'file',
  });
  const transfer = {
    getData: () => JSON.stringify({ attachmentId: 'sha256:voice', name: 'voice.wav' }),
  };
  assert.equal(core.readConversationFileDrag(transfer).attachmentId, 'sha256:voice');
  const pathTransfer = {
    getData: () => JSON.stringify({ path: '/tmp/final.png', name: 'final.png' }),
  };
  assert.equal(core.readConversationFileDrag(pathTransfer).path, '/tmp/final.png');
  assert.equal(core.readConversationFileDrag({ getData: () => '' }), null);
});

test('legacy global project migrates into a workspace-scoped project once', async () => {
  const legacy = {
    version: 1,
    project: { name: 'Legacy project', aspect: '3:4', aspectInitialized: true },
    assets: [{
      id: 'legacy-asset',
      name: 'legacy.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 10,
      duration: 5,
      width: 1080,
      height: 1440,
      blobId: null,
      createdAt: 1,
    }],
    timeline: { video: [], audio: [], music: [] },
    chat: { messages: [] },
  };
  const { store, storage, sandbox } = loadClient({
    cwd: '/workspace/alpha',
    seedStorage: { 'deepseek-design.project.v1': JSON.stringify(legacy) },
  });
  const state = store.getSnapshot();
  assert.equal(state.project.name, 'Legacy project');
  assert.equal(state.assets.length, 1);
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/alpha');
  assert.equal('mode' in state.projects, false, 'project scope is workspace-only since 0.9.6');
  assert.equal(state.projects.items.length, 1);
  assert.equal(state.projects.activeId, 'prj_legacy');
  assert.equal(storage.has(sandbox.__PROJECT_KEYS.LEGACY_KEY), false, 'the legacy key is removed after migration');
  const index = JSON.parse(storage.get(sandbox.__PROJECT_KEYS.INDEX_KEY));
  assert.equal(index.legacyMigrated, true);
  assert.equal(index.projects[0].id, 'prj_legacy');
  assert.equal(index.projects[0].scopeKey, 'workspace:/workspace/alpha');

  store.dispose();
  const second = loadClient({
    storage,
    cwd: '/workspace/alpha',
    seedStorage: { 'deepseek-design.project.v1': JSON.stringify(legacy) },
  });
  assert.equal(second.store.getSnapshot().project.name, 'Legacy project');
  assert.equal(second.store.getSnapshot().projects.items.length, 1, 'migration is idempotent');
  second.store.dispose();
});

test('projects are managed per workspace and shared by every session', async () => {
  const { store, sessionsState } = loadClient({ cwd: '/workspace/alpha' });
  const firstActive = store.getSnapshot().projects.activeId;
  store.setProjectName('Alpha project');
  await new Promise((resolve) => setTimeout(resolve, 80));

  sessionsState.byId.s2 = { sessionId: 's2', cwd: '/workspace/alpha' };
  sessionsState.ids.push('s2');
  store.setActiveSession('s2');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(store.getSnapshot().project.name, 'Alpha project', 'sessions in one workspace share a project');
  assert.equal(store.getSnapshot().projects.activeId, firstActive);
  assert.equal(store.getSnapshot().projects.scopeKey, 'workspace:/workspace/alpha');

  sessionsState.byId.s3 = { sessionId: 's3', cwd: '/workspace/beta' };
  sessionsState.ids.push('s3');
  store.setActiveSession('s3');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(store.getSnapshot().project.name, '');
  assert.notEqual(store.getSnapshot().projects.activeId, firstActive);
  assert.equal(store.getSnapshot().projects.scopeKey, 'workspace:/workspace/beta');

  store.setActiveSession('s1');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(store.getSnapshot().project.name, 'Alpha project', 'the workspace remembers its last active project');
  assert.equal(store.getSnapshot().projects.activeId, firstActive);
  assert.equal(typeof store.setScopeMode, 'undefined', 'the session scope API is removed');
  store.dispose();
});

test('legacy session-scoped projects migrate into the workspace when their session activates (0.9.6)', async () => {
  const storage = new Map();
  const sessionDoc = (name) => JSON.stringify({
    version: 1,
    project: { name, aspect: '16:9', aspectInitialized: true },
    autoImportVersion: 3,
    autoImportSince: 0,
    autoImportSkipped: [],
    assets: [],
    generations: [],
    timeline: { video: [], audio: [], music: [] },
    chat: { messages: [] },
    preferences: { model: null, skills: [] },
  });
  storage.set('deepseek-design.projects.v2', JSON.stringify({
    version: 2,
    scopeMode: 'session',
    legacyMigrated: true,
    activeByScope: { 'session:s1': 'prj_legacy_session' },
    projects: [
      { id: 'prj_legacy_session', name: 'Session project', scopeKey: 'session:s1', createdAt: 1, updatedAt: 2 },
      { id: 'prj_other_session', name: 'Other session', scopeKey: 'session:s2', createdAt: 3, updatedAt: 4 },
    ],
  }));
  storage.set('deepseek-design.project.v2.prj_legacy_session', sessionDoc('Session project'));
  storage.set('deepseek-design.project.v2.prj_other_session', sessionDoc('Other session'));

  const { store, storage: liveStorage, sandbox } = loadClient({ storage, cwd: '/workspace/alpha' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/alpha');
  assert.equal(state.projects.activeId, 'prj_legacy_session', 'the migrated project becomes active');
  assert.equal(state.project.name, 'Session project');
  assert.equal(state.projects.items.length, 1, 'other sessions keep their data until they activate');

  const index = JSON.parse(liveStorage.get(sandbox.__PROJECT_KEYS.INDEX_KEY));
  assert.equal(index.scopeMode, 'workspace', 'the persisted index is workspace-only');
  assert.equal(index.projects.find((entry) => entry.id === 'prj_legacy_session').scopeKey, 'workspace:/workspace/alpha');
  assert.equal(index.projects.find((entry) => entry.id === 'prj_other_session').scopeKey, 'session:s2', 'untouched session data is preserved');
  assert.equal(index.activeByScope['session:s1'], undefined, 'the legacy active key is removed');
  assert.equal(index.activeByScope['workspace:/workspace/alpha'], 'prj_legacy_session');

  // Re-activating the same scope is idempotent: the project is not duplicated.
  store.setActiveSession(null);
  store.setActiveSession('s1');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(store.getSnapshot().projects.items.length, 1);
  store.dispose();
});

test('legacy session projects survive the unresolved-workspace fallback and later adoption (0.9.6)', async () => {
  const storage = new Map();
  storage.set('deepseek-design.projects.v2', JSON.stringify({
    version: 2,
    scopeMode: 'session',
    legacyMigrated: true,
    activeByScope: { 'session:s1': 'prj_legacy_unresolved' },
    projects: [{ id: 'prj_legacy_unresolved', name: 'Unresolved session', scopeKey: 'session:s1', createdAt: 1, updatedAt: 2 }],
  }));
  storage.set('deepseek-design.project.v2.prj_legacy_unresolved', JSON.stringify({
    version: 1,
    project: { name: 'Unresolved session', aspect: '16:9', aspectInitialized: true },
    autoImportVersion: 3,
    autoImportSince: 0,
    autoImportSkipped: [],
    assets: [],
    generations: [],
    timeline: { video: [], audio: [], music: [] },
    chat: { messages: [] },
    preferences: { model: null, skills: [] },
  }));
  const { store, sessionsState, emitSessionsChange } = loadClient({ storage, cwd: '' });
  await new Promise((resolve) => setTimeout(resolve, 2_150));
  let state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:unresolved:s1');
  assert.equal(state.projects.activeId, 'prj_legacy_unresolved', 'the session project is adopted into the fallback scope');
  assert.equal(state.project.name, 'Unresolved session');

  sessionsState.byId.s1.cwd = '/workspace/alpha';
  emitSessionsChange();
  await new Promise((resolve) => setTimeout(resolve, 250));
  state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/alpha', 'the fallback project follows the cwd resolution');
  assert.equal(state.projects.activeId, 'prj_legacy_unresolved');
  assert.equal(state.project.name, 'Unresolved session');
  assert.equal(state.projects.items.length, 1);
  store.dispose();
});

test('multiple projects can be created, switched, and deleted in one scope', async () => {
  const { store } = loadClient({ cwd: '/workspace/alpha' });
  const first = store.getSnapshot().projects.activeId;
  store.setProjectName('First');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(store.addBedAt(0, 'en'), true);

  const second = await store.createProject();
  assert.equal(store.getSnapshot().projects.activeId, second.id);
  assert.equal(store.getSnapshot().project.name, '');
  assert.equal(store.getSnapshot().timeline.music.length, 0);
  store.setProjectName('Second');
  assert.equal(store.addBedAt(1, 'en'), true);

  assert.equal(await store.switchProject(first), true);
  assert.equal(store.getSnapshot().project.name, 'First');
  assert.equal(store.getSnapshot().timeline.music.length, 1);
  await store.switchProject(second.id);
  assert.equal(store.getSnapshot().project.name, 'Second');
  assert.equal(store.getSnapshot().timeline.music.length, 1);

  await store.deleteProject(second.id);
  assert.equal(store.getSnapshot().projects.items.length, 1);
  assert.equal(store.getSnapshot().projects.activeId, first);
  assert.equal(store.getSnapshot().project.name, 'First');

  await store.deleteProject(first);
  assert.equal(store.getSnapshot().projects.items.length, 1, 'deleting the last project leaves a blank project');
  assert.equal(store.getSnapshot().projects.activeId !== null, true);
  assert.equal(store.getSnapshot().project.name, '');
  store.dispose();
});

test('importing a project file creates a new project and keeps the old one', async () => {
  const { store } = loadClient({ cwd: '/workspace/alpha' });
  const first = store.getSnapshot().projects.activeId;
  store.setProjectName('Original');
  assert.equal(store.addBedAt(0, 'en'), true);
  const exported = await store.exportProjectFile();
  const imported = await store.importProjectFile(exported.data, 'en');
  assert.ok(imported.projectId);
  assert.equal(store.getSnapshot().projects.items.length, 2);
  assert.equal(store.getSnapshot().projects.activeId, imported.projectId);
  assert.equal(store.getSnapshot().project.name, 'Original');
  await store.switchProject(first);
  assert.equal(store.getSnapshot().projects.activeId, first);
  assert.equal(store.getSnapshot().timeline.music.length, 1);
  store.dispose();
});

test('project state survives a store reload and stays workspace-scoped', async () => {
  const first = loadClient({ cwd: '/workspace/alpha' });
  first.store.setProjectName('Persistent');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const active = first.store.getSnapshot().projects.activeId;
  first.store.dispose();

  const second = loadClient({ storage: first.storage, cwd: '/workspace/alpha' });
  assert.equal(second.store.getSnapshot().project.name, 'Persistent');
  assert.equal(second.store.getSnapshot().projects.activeId, active);
  assert.equal(second.store.getSnapshot().projects.scopeKey, 'workspace:/workspace/alpha');
  assert.equal(second.store.getSnapshot().projects.mode, undefined, 'the session scope mode is gone');
  second.store.dispose();
});

test('inbox records are matched to the active workspace', () => {
  const { core } = loadClient();
  const scope = { workspacePath: '/workspace/alpha', sessionId: 's1' };
  assert.equal(core.matchesInboxScope({ cwd: '/workspace/alpha', sessionId: 's9' }, scope), true);
  assert.equal(core.matchesInboxScope({ cwd: '/workspace/beta', sessionId: 's1' }, scope), false);
  assert.equal(core.matchesInboxScope({ id: 'legacy' }, scope), true, 'unsourced legacy records stay visible');
  assert.equal(core.matchesInboxScope({ sessionId: 's1' }, scope), false, 'a record with only a session id cannot be attributed to a workspace');
  assert.equal(core.matchesInboxScope({ cwd: '/workspace/alpha' }, null), false);
  assert.equal(core.matchesInboxScope(null, scope), false);
});

// ---------------------------------------------------------------------------
// Extended edge-case coverage (behavioural, not source-string contracts).
// ---------------------------------------------------------------------------

test('timeline free-space placement finds the nearest legal gap', () => {
  const { core } = loadClient();
  const track = [
    { id: 'a', start: 0, duration: 2 },
    { id: 'b', start: 4, duration: 2 },
  ];
  assert.equal(core.MIN_CLIP_SECONDS, 0.5);
  assert.equal(core.clipEnd(track[1]), 6);
  // Edges that merely touch do not overlap; the 1e-6 epsilon absorbs rounding.
  assert.equal(core.overlaps(2, 1, track[0]), false);
  assert.equal(core.overlaps(1.999, 1, track[0]), true);
  assert.equal(core.overlaps(6, 1, track[1]), false);
  assert.equal(core.overlaps(3.5, 2, track[1]), true);
  assert.equal(core.overlaps(0, 1, track[0], 'a'), false, 'ignoreId skips the moving clip');
  // A desired position in free space is kept and rounded to milliseconds.
  assert.equal(core.findFreeStart(track, 2.3456, 1), 2.346);
  assert.equal(core.findFreeStart(track, 100, 1), 100);
  // Occupied desired positions move into the nearest free gap.
  assert.equal(core.findFreeStart(track, 0.5, 1), 2);
  assert.equal(core.findFreeStart(track, 4, 1), 3, 'a 1s clip fits flush against the next clip start');
  // Negative positions clamp to zero before the search.
  assert.equal(core.findFreeStart(track, -5, 1), 2);
  assert.equal(core.findFreeStart([], -5, 1), 0);
  // A duration below the minimum is raised to MIN_CLIP_SECONDS.
  assert.equal(core.findFreeStart([{ id: 'x', start: 0, duration: 2 }], 0, 0), 2);
  // The ignored clip itself never blocks the requested position.
  assert.equal(core.findFreeStart(track, 4, 1, 'b'), 4);
  // insertionIndexFor compares the drop time against clip midpoints.
  assert.equal(core.insertionIndexFor(track, 0), 0);
  assert.equal(core.insertionIndexFor(track, 1), 1);
  assert.equal(core.insertionIndexFor(track, 4.9), 1);
  assert.equal(core.insertionIndexFor(track, 5.1), 2);
  assert.equal(core.insertionIndexFor(track, Number.NaN), 0);
});

test('timeline move/split/trim helpers respect anchors and source ranges', () => {
  const { core } = loadClient();
  const track = [{ id: 'a', start: 0, duration: 2 }, { id: 'b', start: 2, duration: 2 }];
  // Unknown ids leave the track untouched.
  assert.equal(core.placeMovedClip(track, 'missing', 3, 3), track);
  // A free move keeps every other clip anchored.
  const freed = core.placeMovedClip(track, 'a', 6, 6);
  assert.deepEqual([...freed.map((clip) => [clip.id, clip.start])], [['b', 2], ['a', 6]]);
  // Dropping onto occupied space reorders sequentially from the earliest anchor.
  const reordered = core.placeMovedClip(track, 'b', 0.5, 0.5);
  assert.deepEqual([...reordered.map((clip) => [clip.id, clip.start])], [['b', 0], ['a', 2]]);
  // Negative desired starts clamp to zero.
  const clamped = core.placeMovedClip([{ id: 'z', start: 1, duration: 2 }], 'z', -10, -10);
  assert.equal(clamped[0].start, 0);

  const clip = { id: 'split-me', kind: 'asset', assetId: 'asset', start: 2, duration: 4, sourceIn: 1.5, sourceDuration: 10 };
  // A split must leave at least MIN_CLIP_SECONDS on both sides.
  assert.equal(core.splitClipAt(clip, 2), null);
  assert.equal(core.splitClipAt(clip, 6), null);
  assert.equal(core.splitClipAt(clip, 2.4), null);
  assert.equal(core.splitClipAt(clip, 1), null);
  assert.equal(core.splitClipAt(clip, Number.NaN), null);
  assert.equal(core.splitClipAt(null, 3), null);
  const split = core.splitClipAt(clip, 3.25);
  assert.equal(split.left.start, 2);
  assert.equal(split.left.duration, 1.25);
  assert.equal(split.left.sourceIn, 1.5);
  assert.equal(split.left.sourceDuration, 10);
  assert.equal(split.right.start, 3.25);
  assert.equal(split.right.duration, 2.75);
  assert.equal(split.right.sourceIn, 2.75, 'the right half advances its source offset by the split delta');
  assert.match(split.left.id, /^split-me-a-/);
  assert.match(split.right.id, /^split-me-b-/);

  const trim = { start: 2, duration: 4, sourceIn: 1, sourceDuration: 10 };
  // clampTrim('end') is bounded by the next clip and by remaining source material.
  const nextBounded = core.clampTrim(trim, 'end', 99, { nextStart: 5 });
  assert.equal(nextBounded.start, 2);
  assert.equal(nextBounded.sourceIn, 1);
  assert.equal(nextBounded.duration, 3);
  const sourceBounded = core.clampTrim({ start: 2, duration: 4, sourceIn: 1, sourceDuration: 6 }, 'end', 99, {});
  assert.equal(sourceBounded.duration, 5);
  // clampTrim('start') is bounded by the previous clip and by trimmed-away source.
  const startBounded = core.clampTrim(trim, 'start', 0.5, { previousEnd: 1 });
  assert.equal(startBounded.start, 1);
  assert.equal(startBounded.sourceIn, 0);
  assert.equal(startBounded.duration, 5);
  const startLater = core.clampTrim(trim, 'start', 3.2, { previousEnd: 0 });
  assert.equal(startLater.start, 3.2);
  assert.equal(startLater.sourceIn, 2.2);
  assert.equal(startLater.duration, 2.8);
  // Neither edge may shrink the clip below the minimum length.
  const startClamped = core.clampTrim(trim, 'start', 99, {});
  assert.equal(startClamped.start, 5.5);
  assert.equal(startClamped.duration, 0.5);
  // Non-finite desired edges fall back to the current edge.
  const fallback = core.clampTrim(trim, 'end', Number.NaN, {});
  assert.equal(fallback.start, 2);
  assert.equal(fallback.duration, 4);
  // Unknown edges behave like an end trim.
  assert.equal(core.clampTrim(trim, 'sideways', 5, {}).duration, 3);
});

test('exportDimensions and estimatedExportBytes cover every aspect and tier', () => {
  const { core } = loadClient();
  const dims1080 = {
    '16:9': [1920, 1080],
    '2.39:1': [2580, 1080],
    '21:9': [2520, 1080],
    '4:3': [1440, 1080],
    '1:1': [1080, 1080],
    '3:4': [1080, 1440],
    '4:5': [1080, 1350],
    '9:16': [1080, 1920],
  };
  for (const [aspect, expected] of Object.entries(dims1080)) {
    const dimensions = core.exportDimensions(aspect, '1080p');
    assert.deepEqual([dimensions.width, dimensions.height], expected, aspect);
  }
  const portrait4k = core.exportDimensions('9:16', '4k');
  assert.deepEqual([portrait4k.width, portrait4k.height], [2160, 3840]);
  const wide4k = core.exportDimensions('2.39:1', '4k');
  assert.deepEqual([wide4k.width, wide4k.height], [5162, 2160]);
  // Every output edge is an even integer.
  for (const aspect of Object.keys(dims1080)) {
    for (const tier of ['1080p', '4k']) {
      const dimensions = core.exportDimensions(aspect, tier);
      assert.equal(dimensions.width % 2, 0, aspect + ' ' + tier + ' width');
      assert.equal(dimensions.height % 2, 0, aspect + ' ' + tier + ' height');
    }
  }
  // Unknown aspect/tier fall back to the 16:9 1080p defaults.
  const unknownAspect = core.exportDimensions('99:1', '1080p');
  assert.deepEqual([unknownAspect.width, unknownAspect.height], [1920, 1080]);
  const unknownTier = core.exportDimensions('16:9', '8k');
  assert.deepEqual([unknownTier.width, unknownTier.height], [1920, 1080]);
  assert.equal(core.makeEven(2581.2), 2580);
  assert.equal(core.makeEven(2582), 2582);
  assert.equal(core.makeEven(0), 2);

  // Bitrate tables: exact values for every tier and quality.
  assert.equal(core.videoBitrateFor('1080p', 'high'), 16_000_000);
  assert.equal(core.videoBitrateFor('1080p', 'medium'), 10_000_000);
  assert.equal(core.videoBitrateFor('1080p', 'low'), 6_000_000);
  assert.equal(core.videoBitrateFor('4k', 'high'), 48_000_000);
  assert.equal(core.videoBitrateFor('4k', 'low'), 16_000_000);
  assert.equal(core.videoBitrateFor('1080p', 'bogus'), 10_000_000);
  assert.equal(core.videoBitrateFor('bogus', 'low'), 6_000_000);
  assert.equal(core.audioBitrateFor('high'), 192_000);
  assert.equal(core.audioBitrateFor('medium'), 128_000);
  assert.equal(core.audioBitrateFor('low'), 96_000);
  assert.equal(core.audioBitrateFor('bogus'), 128_000);
  // Exact estimate = (video + audio bitrate) * seconds / 8.
  assert.equal(core.estimatedExportBytes(10, '1080p', 'high'), (16_000_000 + 192_000) * 10 / 8);
  assert.equal(core.estimatedExportBytes(600, '4k', 'low'), (16_000_000 + 96_000) * 600 / 8);
  assert.equal(core.estimatedExportBytes(0, '1080p', 'high'), 0);
  assert.equal(core.estimatedExportBytes(-3, '4k', 'high'), 0);
  assert.ok(core.estimatedExportBytes(10, '4k', 'high') > core.estimatedExportBytes(10, '1080p', 'high'));
  assert.ok(core.estimatedExportBytes(10, '1080p', 'high') > core.estimatedExportBytes(10, '1080p', 'low'));
  // humanBytes is defensive about nonsense input.
  assert.equal(core.humanBytes(Number.NaN), '—');
  assert.equal(core.humanBytes(-1), '—');
  assert.equal(core.humanBytes(512), '1 KB');
  assert.equal(core.humanBytes(1536 * 1024), '1.5 MB');
  assert.equal(core.humanBytes(150 * 1024 * 1024), '150 MB');
});

test('workspace paths and project scopes normalize malformed inputs', () => {
  const { core } = loadClient();
  assert.equal(core.normalizeWorkspacePath(undefined), '');
  assert.equal(core.normalizeWorkspacePath(null), '');
  assert.equal(core.normalizeWorkspacePath(42), '');
  assert.equal(core.normalizeWorkspacePath('   '), '');
  assert.equal(core.normalizeWorkspacePath('/'), '/');
  assert.equal(core.normalizeWorkspacePath('////'), '/');
  assert.equal(core.normalizeWorkspacePath('  /Users/me/Project/  '), '/Users/me/Project');
  assert.equal(core.normalizeWorkspacePath('C:\\Users\\Me\\proj\\'), 'C:/Users/Me/proj');
  assert.equal(core.normalizeWorkspacePath('a//b/'), 'a//b', 'interior separators are preserved');
  assert.equal(core.workspaceNameFromPath(''), 'Workspace');
  assert.equal(core.workspaceNameFromPath('/'), '/');
  assert.equal(core.workspaceNameFromPath('/workspace/alpha/'), 'alpha');
  assert.equal(core.workspaceNameFromPath('C:\\workspace\\alpha'), 'alpha');
  // Scope keys are workspace-only since 0.9.6.
  assert.equal(core.projectScopeKey('s1', '/a/b/'), 'workspace:/a/b');
  assert.equal(core.projectScopeKey('s1', ''), 'workspace:unresolved:s1');
  assert.equal(core.projectScopeKey('', ''), '');
  assert.equal(core.projectScopeKey(undefined, '/a'), 'workspace:/a');
  assert.equal(core.projectScopeLabel('/a/b/'), 'b');
  assert.equal(core.projectScopeLabel(''), 'unresolved');
  // Inbox matching: records without a source match every scope; sourced records need a workspace.
  assert.equal(core.matchesInboxScope(null, null), false);
  assert.equal(core.matchesInboxScope({ name: 'unsourced' }, null), true);
  assert.equal(core.matchesInboxScope({ cwd: '/a/' }, null), false);
  assert.equal(core.matchesInboxScope({ cwd: '/a/' }, { workspacePath: '/a' }), true);
  assert.equal(core.matchesInboxScope({ cwd: 'C:\\a\\' }, { workspacePath: 'C:/a' }), true);
  assert.equal(core.matchesInboxScope({ sessionId: 's1', cwd: '/other' }, { workspacePath: '/a' }), false);
  assert.equal(core.matchesInboxScope({ cwd: '', sessionId: '' }, { workspacePath: '/a' }), true);
});

test('client animation tool-argument validation enforces documented limits', () => {
  const { core } = loadClient();
  const valid = { title: '  Reel  ', duration: 12, code: 'function draw() {}' };
  const normalized = core.validateAnimationToolArgs({ ...valid, aspect: '9:16', resolution: '4k', fps: 30 });
  assert.equal(normalized.title, 'Reel');
  assert.equal(normalized.duration, 12);
  assert.equal(normalized.code, 'function draw() {}');
  assert.equal(normalized.aspect, '9:16');
  assert.equal(normalized.resolution, '4k');
  assert.equal(normalized.fps, 30);
  const defaults = core.validateAnimationToolArgs(valid);
  assert.equal(defaults.aspect, '16:9');
  assert.equal(defaults.resolution, '1080p');
  assert.equal(defaults.fps, 30);
  assert.equal(core.validateAnimationToolArgs({ ...valid, title: 'x'.repeat(200) }).title.length, 120);
  // Duration boundaries (1-600s inclusive) and numeric coercion.
  assert.equal(core.validateAnimationToolArgs({ ...valid, duration: 1 }).duration, 1);
  assert.equal(core.validateAnimationToolArgs({ ...valid, duration: 600 }).duration, 600);
  assert.equal(core.validateAnimationToolArgs({ ...valid, duration: '10' }).duration, 10);
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, duration: 0.999 }), /1-600/);
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, duration: 600.001 }), /1-600/);
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, duration: Number.NaN }), /1-600/);
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, duration: null }), /1-600/);
  // Title/code presence and size.
  assert.throws(() => core.validateAnimationToolArgs(null), /missing/);
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, title: '   ' }), /title is empty/);
  assert.throws(() => core.validateAnimationToolArgs({ title: 'No code', duration: 1 }), /code is empty/);
  assert.throws(() => core.validateAnimationToolArgs({ title: 'Big', duration: 1, code: 'x'.repeat(2_000_001) }), /too large/);
  assert.equal(core.validateAnimationToolArgs({ title: 'Max', duration: 1, code: 'x'.repeat(2_000_000) }).code.length, 2_000_000);
  // Resolution/fps interplay: 4K tops out at 30fps.
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, resolution: '4k', fps: 60 }), /4K export is limited to 30fps/);
  assert.equal(core.validateAnimationToolArgs({ ...valid, resolution: '4k', fps: 30 }).resolution, '4k');
  // Unknown enum values normalize instead of rejecting.
  assert.equal(core.validateAnimationToolArgs({ ...valid, aspect: '99:1' }).aspect, '16:9');
  assert.equal(core.validateAnimationToolArgs({ ...valid, resolution: '8k' }).resolution, '1080p');
  assert.equal(core.validateAnimationToolArgs({ ...valid, fps: 25 }).fps, 25);
  assert.equal(core.validateAnimationToolArgs({ ...valid, fps: 59 }).fps, 30);
  // UI-10 regressions: whitespace-only code is rejected instead of starting a
  // doomed worker/recorder session, and "4K" is normalized case-insensitively.
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, code: '   ' }), /code is empty/);
  assert.throws(() => core.validateAnimationToolArgs({ ...valid, code: '\n\t ' }), /code is empty/);
  assert.equal(core.validateAnimationToolArgs({ ...valid, resolution: '4K' }).resolution, '4k');
  assert.equal(core.validateAnimationToolArgs({ ...valid, resolution: '4k', fps: 30 }).resolution, '4k');
  assert.throws(
    () => core.validateAnimationToolArgs({ ...valid, resolution: '4K', fps: 60 }),
    /4K export is limited to 30fps/,
  );
});

test('restoreProject drops malformed records and keeps valid ones', () => {
  const { core } = loadClient();
  assert.equal(core.restoreProject(null), null);
  assert.equal(core.restoreProject('not a document'), null);
  assert.equal(core.restoreProject({ version: 2 }), null);
  assert.equal(core.restoreProject({ version: 1 }), null, 'an empty document is not a project');
  const blank = core.restoreProject({ version: 1 }, { allowEmpty: true });
  assert.ok(blank !== null, 'allowEmpty keeps a blank document');
  assert.equal(blank.project.aspect, '16:9');

  const scene = { type: 'orbit', duration: 3, intensity: 0.5, seed: 7, title: 'Orbit' };
  const spec = { title: 'Generated', palette: ['#111111', '#222222', '#333333', '#444444'], scenes: [scene] };
  const restored = core.restoreProject({
    version: 1,
    project: { name: '  Spaced  ', aspect: 'nope', aspectInitialized: 'yes' },
    assets: [
      null,
      'not-an-asset',
      {
        id: 'ok-asset',
        name: 'ok.png',
        kind: 'image',
        mime: 'image/png',
        size: '-5',
        duration: '2',
        width: '640',
        height: 'x',
        blobId: 42,
        palette: 'nope',
        peaks: ['x', 0.2, Number.NaN, Number.POSITIVE_INFINITY],
      },
      { id: 'bad-kind', name: 'bad', kind: 'document' },
      { id: 'no-name', name: '', kind: 'image' },
      { id: 'ok-asset', name: 'duplicate.png', kind: 'image' },
      { id: 7, name: 'numeric-id', kind: 'image' },
    ],
    generations: [
      { id: 'gen-ok', title: 'Generated', spec, source: 'local', status: 'applied' },
      { id: 'gen-bad-spec', title: 'Bad', spec: { scenes: [] } },
      { id: 'gen-ok', spec },
      null,
    ],
    timeline: {
      video: [
        { id: 'clip-ok', kind: 'generation', track: 'video', generationId: 'gen-ok', sceneIndex: 0, start: 0, duration: 2 },
        { id: 'clip-missing-gen', kind: 'generation', track: 'video', generationId: 'missing', sceneIndex: 0, start: 2, duration: 2 },
        { id: 'clip-wrong-track', kind: 'asset', track: 'music', assetId: 'ok-asset', start: 0, duration: 1 },
        { id: 'clip-bad-kind', kind: 'document', track: 'video', start: 0, duration: 1 },
      ],
      music: [{ id: 'clip-bed', kind: 'bed', track: 'music', start: 1, duration: 12, seed: 5 }],
    },
    chat: {
      messages: [
        { id: 'msg-ok', role: 'user', text: 'hello', at: '3', notes: ['a', 7, 'b'] },
        { id: 'msg-bad-role', role: 'system', text: 'hi' },
        { id: 'msg-no-text', role: 'user' },
        { id: 'msg-ok', role: 'user', text: 'duplicate id' },
        null,
      ],
    },
  }, { allowEmpty: true });
  assert.ok(restored !== null);
  assert.equal(restored.project.name, 'Spaced');
  assert.equal(restored.project.aspect, '16:9', 'an invalid aspect falls back to 16:9');
  assert.equal(restored.project.aspectInitialized, true, 'a non-boolean flag falls back to initialized');
  // Assets: only the one well-formed record survives and is normalized.
  assert.equal(restored.assets.length, 1);
  const asset = restored.assets[0];
  assert.equal(asset.id, 'ok-asset');
  assert.equal(asset.size, 0);
  assert.equal(asset.duration, 2);
  assert.equal(asset.width, 640);
  assert.equal(asset.height, 0);
  assert.equal(asset.blobId, null);
  assert.equal(asset.missing, true);
  assert.deepEqual([...asset.peaks], [0.2]);
  assert.equal(asset.palette.length, 4);
  // Generations: duplicate ids and unusable specs are dropped.
  assert.equal(restored.generations.length, 1);
  assert.equal(restored.generations[0].id, 'gen-ok');
  assert.equal(restored.generations[0].status, 'applied');
  assert.equal(restored.generations[0].source, 'local');
  // Timeline: clips that reference missing records or the wrong track are dropped.
  assert.equal(restored.timeline.video.length, 1);
  assert.equal(restored.timeline.video[0].id, 'clip-ok');
  assert.equal(restored.timeline.video[0].kind, 'generation');
  assert.equal(restored.timeline.music.length, 1);
  assert.equal(restored.timeline.music[0].kind, 'bed');
  assert.equal(restored.timeline.audio.length, 0);
  // Chat: missing text is dropped, unknown roles fall back to assistant, duplicate ids are replaced.
  assert.equal(restored.chat.messages.length, 3);
  assert.equal(restored.chat.messages[0].id, 'msg-ok');
  assert.deepEqual([...restored.chat.messages[0].notes], ['a', 'b']);
  assert.equal(restored.chat.messages[0].at, 3);
  assert.equal(restored.chat.messages[1].role, 'assistant');
  assert.notEqual(restored.chat.messages[2].id, 'msg-ok');
  assert.equal(restored.persistence.status, 'saved');
});

test('serializeProject caps history and round-trips through restoreProject', async () => {
  const { core } = loadClient();
  const state = core.createEmptyState();
  state.project = { name: ' Document ', aspect: '1:1', aspectInitialized: true };
  state.autoImportSince = -4;
  state.autoImportSkipped = Array.from({ length: 1010 }, (_, index) => 'attachment:' + index);
  state.assets = [{
    id: 'a1',
    name: 'a.mp4',
    kind: 'video',
    mime: 'video/mp4',
    size: 10,
    duration: 1,
    width: 1920,
    height: 1080,
    palette: ['#111111', '#222222', '#333333', '#444444'],
    peaks: [],
    blobId: 'blob-1',
    source: 'import',
    createdAt: 1,
  }];
  const scene = { type: 'orbit', duration: 3, intensity: 0.5, seed: 1, title: 'Orbit' };
  state.generations = [{
    id: 'g1',
    title: 'Sequence',
    spec: { title: 'Sequence', palette: ['#111111', '#222222', '#333333', '#444444'], scenes: [scene] },
    source: 'deepseek',
    status: 'draft',
    createdAt: 2,
  }];
  state.timeline.video = [{ id: 'c1', kind: 'asset', track: 'video', assetId: 'a1', start: 0, duration: 1 }];
  state.chat.messages = Array.from({ length: 510 }, (_, index) => ({
    id: 'm' + index, role: 'user', text: 't' + index, at: index,
  }));
  state.preferences.model = { provider: 'p', model: 'm', providerName: 'P', modelName: 'M', reasoningEffort: 'high' };
  state.preferences.skills = ['a', 'b'];

  const document = core.serializeProject(state);
  assert.equal(document.version, 1);
  assert.equal(typeof document.savedAt, 'number');
  assert.equal(document.project.name, ' Document ');
  assert.equal(document.project.aspect, '1:1');
  assert.equal(document.project.aspectInitialized, true);
  assert.equal(document.autoImportSince, 0);
  assert.equal(document.autoImportSkipped.length, 1000);
  assert.equal(document.autoImportSkipped[0], 'attachment:10');
  assert.equal(document.chat.messages.length, 500);
  assert.equal(document.chat.messages[0].id, 'm10');
  assert.equal(document.assets.length, 1);
  assert.equal(document.assets[0].blobId, 'blob-1');
  assert.equal(document.generations.length, 1);
  assert.equal(document.timeline.video.length, 1);
  assert.equal(document.timeline.video[0].assetId, 'a1');
  assert.equal(document.preferences.model.reasoningEffort, 'high');
  assert.deepEqual([...document.preferences.skills], ['a', 'b']);

  const restored = core.restoreProject(document, { allowEmpty: true });
  assert.ok(restored !== null, 'a serialized document must always restore');
  assert.equal(restored.project.name, 'Document');
  assert.equal(restored.project.aspect, '1:1');
  assert.equal(restored.assets.length, 1);
  assert.equal(restored.generations.length, 1);
  assert.equal(restored.timeline.video.length, 1);
  assert.equal(restored.chat.messages.length, 500);
  assert.equal(restored.preferences.skills.join(','), 'a,b');
});

test('project index sanitizer accepts only well-formed scoped entries', () => {
  const { core } = loadClient();
  assert.equal(core.sanitizeProjectIndex(null), null);
  assert.equal(core.sanitizeProjectIndex({ version: 1 }), null);
  const index = core.sanitizeProjectIndex({
    version: 2,
    scopeMode: 'session',
    legacyMigrated: 'yes',
    projects: [
      { id: 'prj_ok', name: '  Keep  ', scopeKey: ' workspace:/a ', createdAt: -5, updatedAt: '7' },
      { id: 'prj_ok', name: 'Duplicate', scopeKey: 'workspace:/a' },
      { id: 'bad id', name: 'Bad', scopeKey: 'workspace:/a' },
      { id: 'prj_bad-scope', name: 'No scope', scopeKey: '' },
      { id: 'prj_no-name', scopeKey: 'workspace:/b', name: 42 },
      { id: 'prj_long-scope', scopeKey: 'x'.repeat(601) },
      null,
      'nope',
    ],
    activeByScope: {
      'workspace:/a': 'prj_ok',
      'workspace:/b': 'prj_missing',
      'workspace:/c': 42,
      ['x'.repeat(601)]: 'prj_ok',
    },
  });
  assert.equal(index.scopeMode, 'workspace', 'a legacy session-mode index is read as workspace-only');
  assert.equal(index.legacyMigrated, false, 'only a literal true migrates');
  assert.equal(index.projects.length, 2);
  assert.equal(index.projects[0].id, 'prj_ok');
  assert.equal(index.projects[0].name, 'Keep');
  assert.equal(index.projects[0].createdAt, 0);
  assert.equal(index.projects[0].updatedAt, 7);
  assert.equal(index.projects[1].id, 'prj_no-name');
  assert.equal(index.projects[1].name, '');
  assert.deepEqual({ ...index.activeByScope }, { 'workspace:/a': 'prj_ok' });

  const legacySession = core.sanitizeProjectIndex({
    version: 2,
    scopeMode: 'session',
    projects: [{ id: 'prj_session_legacy', name: 'Session', scopeKey: 'session:s1', createdAt: 1, updatedAt: 2 }],
    activeByScope: { 'session:s1': 'prj_session_legacy' },
  });
  assert.equal(legacySession.scopeMode, 'workspace');
  assert.equal(legacySession.projects[0].scopeKey, 'session:s1', 'legacy session keys are preserved for the activation migration');
  assert.equal(legacySession.activeByScope['session:s1'], 'prj_session_legacy');
});

test('client store survives corrupt localStorage and recovers project entries', async () => {
  const corrupt = loadClient({
    cwd: '/workspace/alpha',
    seedStorage: {
      'deepseek-design.projects.v2': '{broken json',
      'deepseek-design.project.v1': '[]',
      'deepseek-design.project.v2.prj_orphan': '<html>',
    },
  });
  const corruptState = corrupt.store.getSnapshot();
  assert.equal(corruptState.project.name, '');
  assert.equal(corruptState.assets.length, 0);
  assert.equal(corruptState.timeline.music.length, 0);
  // The store stays usable after discarding the corrupt index.
  assert.equal(corrupt.store.addBedAt(0, 'en'), true);
  assert.equal(corrupt.store.getSnapshot().timeline.music.length, 1);
  corrupt.store.dispose();

  // A corrupt active project document falls back to the project-index name.
  const index = JSON.stringify({
    version: 2,
    scopeMode: 'workspace',
    legacyMigrated: true,
    activeByScope: { 'workspace:/workspace/alpha': 'prj_corrupt' },
    projects: [{
      id: 'prj_corrupt',
      name: 'Recovered',
      scopeKey: 'workspace:/workspace/alpha',
      createdAt: 1,
      updatedAt: 2,
    }],
  });
  const recovered = loadClient({
    cwd: '/workspace/alpha',
    seedStorage: {
      'deepseek-design.projects.v2': index,
      'deepseek-design.project.v2.prj_corrupt': '{not valid json',
    },
  });
  const recoveredState = recovered.store.getSnapshot();
  assert.equal(recoveredState.projects.activeId, 'prj_corrupt');
  assert.equal(recoveredState.project.name, 'Recovered', 'the index name survives a corrupt document');
  assert.equal(recoveredState.assets.length, 0);
  assert.equal(recoveredState.projects.items.length, 1);
  recovered.store.dispose();
});

test('store timeline edits stay ordered and reject overlapping trims', async () => {
  const { store } = loadClient();
  await store.importProjectFile({
    version: 1,
    project: { name: 'Edits', aspect: '16:9' },
    assets: [
      { id: 'v1', name: 'one.mp4', kind: 'video', duration: 2, width: 1920, height: 1080, blobId: null, createdAt: 1 },
      { id: 'v2', name: 'two.mp4', kind: 'video', duration: 3, width: 1920, height: 1080, blobId: null, createdAt: 2 },
    ],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  assert.equal(store.addAssetToTimeline('v1', 'video', 0, 'en').kind, 'video');
  assert.equal(store.addAssetToTimeline('v2', 'video', 0, 'en').kind, 'video');
  assert.equal(store.addAssetToTimeline('missing-asset', 'video', 0, 'en'), null);
  let state = store.getSnapshot();
  assert.deepEqual([...state.timeline.video.map((clip) => clip.start)], [0, 2]);
  const first = state.timeline.video[0];
  const second = state.timeline.video[1];
  // Dropping onto occupied space reorders the whole track instead of overlapping.
  assert.equal(store.moveClip(second.id, 'video', 0.2), true);
  state = store.getSnapshot();
  assert.deepEqual([...state.timeline.video.map((clip) => clip.id)], [second.id, first.id]);
  assert.deepEqual([...state.timeline.video.map((clip) => clip.start)], [0, 3]);
  // A move into free space keeps its requested position.
  assert.equal(store.moveClip(first.id, 'video', 8), true);
  state = store.getSnapshot();
  assert.equal(state.timeline.video.find((clip) => clip.id === first.id).start, 8);
  // Split in the middle produces two adjacent clips.
  assert.equal(store.splitClip(second.id, 'video', 1), true);
  state = store.getSnapshot();
  assert.equal(state.timeline.video.length, 3);
  const left = state.timeline.video.find((clip) => clip.start === 0);
  const right = state.timeline.video.find((clip) => clip.start === 1);
  assert.equal(left.duration, 1);
  assert.equal(right.duration, 2);
  // Invalid trims are rejected without changing the state.
  const big = state.timeline.video.find((clip) => clip.id === first.id);
  assert.equal(store.trimClip(big.id, 'video', { start: 8, sourceIn: 0, duration: 99 }), false);
  assert.equal(store.trimClip(left.id, 'video', { start: 0.5, sourceIn: 0, duration: 2 }), false, 'trims may not overlap the next clip');
  assert.equal(store.trimClip(big.id, 'video', { start: 7.5, sourceIn: 0, duration: 2 }), true);
  state = store.getSnapshot();
  assert.equal(state.timeline.video.find((clip) => clip.id === big.id).start, 7.5);
  // Unknown ids are no-ops; deletes are undoable.
  assert.equal(store.moveClip('missing-clip', 'video', 1), false);
  assert.equal(store.splitClip('missing-clip', 'video', 1), false);
  assert.equal(store.deleteClip('missing-clip', 'video'), false);
  assert.equal(store.deleteClip(left.id, 'video'), true);
  assert.equal(store.undo(), true);
  assert.equal(store.getSnapshot().timeline.video.length, 3);
  // Invalid aspects are ignored; valid ones mark the aspect initialized.
  store.setAspect('99:1');
  assert.equal(store.getSnapshot().project.aspect, '16:9');
  store.setAspect('1:1');
  assert.equal(store.getSnapshot().project.aspect, '1:1');
  assert.equal(store.getSnapshot().project.aspectInitialized, true);
  store.dispose();
});

// ---------------------------------------------------------------------------
// Regressions for the client fixes landed for V0.9.4 (client.js is frozen).
// Each test mirrors the final implementation and fails on the pre-fix code.
// ---------------------------------------------------------------------------

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function raceWithTimeout(promise, label, timeoutMs = 5000) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timed out')), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function projectDocumentKeys(storage, prefix) {
  return [...storage.keys()].filter((key) => key.startsWith(prefix));
}

test('Emptying a project flushes the empty state and cannot resurrect content (CC-1)', async () => {
  const first = loadClient();
  const { store, storage, sandbox } = first;
  const prefix = sandbox.__PROJECT_KEYS.PREFIX;
  assert.equal(store.addBedAt(0, 'en'), true);
  await pause(550);
  assert.equal(store.getSnapshot().persistence.status, 'saved');
  assert.equal(projectDocumentKeys(storage, prefix).length, 1, 'a saved project has a document');

  store.selectClip({ track: 'music', id: store.getSnapshot().timeline.music[0].id });
  assert.equal(store.deleteSelectedClips(), true);
  assert.equal(store.getSnapshot().timeline.music.length, 0);
  assert.equal(store.getSnapshot().persistence.status, 'blank');
  assert.equal(
    projectDocumentKeys(storage, prefix).length,
    0,
    'deleting the last clip must remove the stale project document immediately',
  );
  store.dispose();

  const reloaded = loadClient({ storage, cwd: '/workspace/alpha' });
  assert.equal(reloaded.store.getSnapshot().timeline.music.length, 0, 'deleted clips must not resurrect after reload');
  assert.equal(reloaded.store.getSnapshot().persistence.status, 'blank');
  reloaded.store.dispose();

  // Undoing back to an empty timeline must flush the empty state too.
  const undoClient = loadClient();
  undoClient.store.addBedAt(0, 'en');
  await pause(550);
  assert.equal(projectDocumentKeys(undoClient.storage, prefix).length, 1);
  assert.equal(undoClient.store.undo(), true);
  assert.equal(undoClient.store.getSnapshot().timeline.music.length, 0);
  assert.equal(undoClient.store.getSnapshot().persistence.status, 'blank');
  assert.equal(projectDocumentKeys(undoClient.storage, prefix).length, 0);
  undoClient.store.dispose();
  const undoReloaded = loadClient({ storage: undoClient.storage, cwd: '/workspace/alpha' });
  assert.equal(undoReloaded.store.getSnapshot().timeline.music.length, 0);
  undoReloaded.store.dispose();
});

test('Deleting a non-active project flushes the active pending edit (CC-2)', async () => {
  const client = loadClient({ cwd: '/workspace/alpha' });
  const { store, storage } = client;
  const firstProject = store.getSnapshot().projects.activeId;
  store.setProjectName('First');
  await pause(80);
  const secondProject = await store.createProject();
  store.setProjectName('Second');
  await pause(80);
  // Schedule a pending autosave in the active project, then delete the other one.
  assert.equal(store.addBedAt(0, 'en'), true);
  await store.deleteProject(firstProject);
  assert.equal(store.getSnapshot().projects.items.length, 1);
  store.dispose();

  const reloaded = loadClient({ storage, cwd: '/workspace/alpha' });
  const state = reloaded.store.getSnapshot();
  assert.equal(state.projects.activeId, secondProject.id);
  assert.equal(state.project.name, 'Second');
  assert.equal(state.timeline.music.length, 1, 'the active project pending edit must survive the other deletion');
  reloaded.store.dispose();
});

test('Imported and legacy-migrated projects baseline session auto-import (CC-3)', async () => {
  const importedClient = loadClient();
  const startedAt = Date.now();
  await importedClient.store.importProjectFile({
    version: 1,
    project: { name: 'Imported project' },
    assets: [],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  const imported = importedClient.store.getSnapshot();
  assert.ok(imported.autoImportSince > 0, 'an imported project must baseline its session-media cutoff');
  assert.ok(imported.autoImportSince >= startedAt);
  importedClient.store.dispose();

  const legacy = {
    version: 1,
    project: { name: 'Legacy project', aspect: '3:4', aspectInitialized: true },
    assets: [],
    timeline: { video: [], audio: [], music: [] },
    chat: { messages: [] },
  };
  const legacyClient = loadClient({
    cwd: '/workspace/alpha',
    seedStorage: { 'deepseek-design.project.v1': JSON.stringify(legacy) },
  });
  const migrated = legacyClient.store.getSnapshot();
  assert.equal(migrated.project.name, 'Legacy project');
  assert.ok(migrated.autoImportSince > 0, 'a legacy-migrated project must baseline its session-media cutoff');
  assert.ok(migrated.autoImportSince >= startedAt);
  legacyClient.store.dispose();
});

test('An aspect locked on a blank project survives a reload (CC-4)', async () => {
  const first = loadClient({ cwd: '/workspace/alpha' });
  assert.equal(first.store.getSnapshot().project.aspect, '16:9');
  first.store.setAspect('9:16');
  assert.equal(first.store.getSnapshot().project.aspect, '9:16');
  assert.equal(first.store.getSnapshot().persistence.status, 'saved');
  first.store.dispose();

  const second = loadClient({ storage: first.storage, cwd: '/workspace/alpha' });
  assert.equal(second.store.getSnapshot().project.aspect, '9:16', 'the manual aspect lock must persist without content');
  assert.equal(second.store.getSnapshot().project.aspectInitialized, true);
  second.store.dispose();
});

test('Asset capacity limits and truncated-import accounting are enforced (CC-5/CC-8)', async () => {
  const { store } = loadClient({ cwd: '/workspace/alpha' });
  const MAX = 10_000;
  const assets = Array.from({ length: MAX + 5 }, (_, index) => ({
    id: 'asset-' + index,
    name: 'file-' + index + '.png',
    kind: 'image',
    mime: 'image/png',
    blobId: null,
  }));
  const result = await store.importProjectFile({
    version: 1,
    project: { name: 'Full library' },
    assets,
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  const state = store.getSnapshot();
  assert.equal(state.assets.length, MAX, 'the library is capped at MAX_ASSETS');
  assert.equal(result.omitted, MAX + 5, 'assets beyond the cap are counted as omitted');
  assert.ok(result.omitted > MAX, 'truncation must be visible in the omitted count');

  // importFiles must not push the library past the cap.
  await store.importFiles([{ name: 'one-more.png' }], 'en');
  assert.equal(store.getSnapshot().assets.length, MAX);
  assert.match(store.getSnapshot().import.error, /Project limit reached/, 'the rejected import reports the limit');

  // addExportedVideo must refuse to exceed the cap.
  await assert.rejects(
    () => store.addExportedVideo({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
      name: 'export.mp4',
      duration: 1,
      width: 320,
      height: 180,
    }, 'en'),
    /asset library/,
    'an export over the capacity limit is rejected',
  );
  assert.equal(store.getSnapshot().assets.length, MAX);
  store.dispose();
});

test('Very short video assets are placed with the minimum clip length (CC-6)', async () => {
  const { store } = loadClient();
  const video = (id, duration) => ({
    id,
    name: id + '.mp4',
    kind: 'video',
    mime: 'video/mp4',
    duration,
    width: 1920,
    height: 1080,
    blobId: null,
  });
  await store.importProjectFile({
    version: 1,
    project: { name: 'Short videos', aspect: '16:9', aspectInitialized: true },
    assets: [video('v0', 0), video('v04', 0.4), video('v05', 0.5), video('v06', 0.6)],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  assert.equal(store.addVideoAssetToTrack('v0', 0, 'en'), false, 'a zero-duration video cannot be placed');
  assert.equal(store.addVideoAssetToTrack('v04', 0, 'en'), true, 'a 0.4s video is placeable');
  let state = store.getSnapshot();
  assert.equal(state.timeline.video.length, 1);
  assert.equal(state.timeline.video[0].duration, 0.5, 'short clips are padded to MIN_CLIP_SECONDS');
  assert.equal(store.addVideoAssetToTrack('v05', 0, 'en'), true, 'a 0.5s video is placeable');
  assert.equal(store.addVideoAssetToTrack('v06', 0, 'en'), true);
  state = store.getSnapshot();
  assert.equal(state.timeline.video.length, 3);
  const half = state.timeline.video.find((clip) => clip.assetId === 'v05');
  const longer = state.timeline.video.find((clip) => clip.assetId === 'v06');
  assert.equal(half.duration, 0.5);
  assert.equal(longer.duration, 0.6, 'clips longer than the minimum keep their duration');
  store.dispose();
});

test('Empty embedded project media is omitted and never stored (CC-7)', async () => {
  const fakeDb = createFakeIndexedDb();
  const { store } = loadClient({ globals: { indexedDB: fakeDb } });
  const result = await store.importProjectFile({
    version: 1,
    project: { name: 'Embedded media' },
    assets: [
      {
        id: 'empty-video',
        name: 'empty.webm',
        kind: 'video',
        mime: 'video/webm',
        duration: 3,
        dataUrl: 'data:video/webm;base64,',
      },
      {
        id: 'good-image',
        name: 'frame.png',
        kind: 'image',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,' + Buffer.from([1, 2, 3, 4]).toString('base64'),
      },
    ],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  const state = store.getSnapshot();
  assert.equal(result.omitted, 1, 'the empty embedded media is counted as omitted');
  const empty = state.assets.find((asset) => asset.id === 'empty-video');
  assert.equal(empty.missing, true);
  assert.equal(empty.blobId, null, 'empty embedded media must not get a media record');
  const good = state.assets.find((asset) => asset.id === 'good-image');
  assert.equal(good.missing, false);
  assert.equal(typeof good.blobId, 'string');
  const mediaStore = fakeDb._stores('deepseek-design-media').get('media');
  assert.equal(mediaStore.size, 1, 'only the healthy embedded media reaches IndexedDB');
  store.dispose();
});

test('A corrupt project index is backed up before the first replacement (CC-9)', async () => {
  const corruptIndex = JSON.stringify({ version: 3, projects: [{ id: 'prj_old', scopeKey: 'workspace:/workspace/alpha' }] });
  const first = loadClient({
    cwd: '/workspace/alpha',
    seedStorage: { 'deepseek-design.projects.v2': corruptIndex },
  });
  assert.equal(first.storage.get('deepseek-design.projects.v2.backup'), corruptIndex, 'the unknown-version index is preserved');
  first.store.setProjectName('Recovered');
  await pause(550);
  const savedIndex = JSON.parse(first.storage.get('deepseek-design.projects.v2'));
  assert.equal(savedIndex.version, 2, 'a fresh index is written after the backup');
  assert.equal(first.storage.get('deepseek-design.projects.v2.backup'), corruptIndex, 'the backup is not overwritten');
  first.store.dispose();

  const garbage = '{not valid json';
  const second = loadClient({
    cwd: '/workspace/alpha',
    seedStorage: { 'deepseek-design.projects.v2': garbage },
  });
  assert.equal(second.storage.get('deepseek-design.projects.v2.backup'), garbage, 'unparseable index bytes are preserved');
  second.store.dispose();
});

test('Animation recording starts after the worker handshake and cannot hang on worker death (UI-1)', async () => {
  const order = [];
  const recorders = [];
  const workers = [];
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = 'inactive';
      this.timeslice = 0;
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      recorders.push(this);
    }
    start(timeslice) {
      this.state = 'recording';
      this.timeslice = timeslice;
      order.push('recorder.start');
    }
    stop() {
      this.state = 'inactive';
      if (typeof this.onstop === 'function') this.onstop();
    }
  }
  class FakeWorker {
    constructor(path) {
      this.path = path;
      this.posted = null;
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
      workers.push(this);
    }
    postMessage(message) { this.posted = message; }
    terminate() { this.terminated = true; }
    emit(data) { if (typeof this.onmessage === 'function') this.onmessage({ data }); }
  }
  const canvases = [];
  const createCanvas = () => {
    const context = {
      clearRect() {},
      drawImage() { order.push('frame.draw'); },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: (type) => (type === '2d' ? context : null),
      captureStream: () => ({ getVideoTracks: () => [{ stop() {} }] }),
      toDataURL: () => 'data:image/jpeg;base64,AAAA',
    };
    canvases.push(canvas);
    return canvas;
  };
  const client = loadClient({
    globals: {
      MediaRecorder: FakeMediaRecorder,
      Worker: FakeWorker,
      document: { createElement: () => createCanvas(), addEventListener() {}, removeEventListener() {} },
    },
  });
  const { core } = client;

  const renderPromise = core.renderAnimationVideo({
    code: 'function draw() {}',
    duration: 1,
    width: 320,
    height: 180,
    fps: 30,
  });
  assert.equal(workers.length, 1);
  const worker = workers[0];
  assert.equal(worker.path, '/deepseek-design/export-worker.js');
  assert.equal(worker.posted.type, 'start');
  assert.equal(worker.posted.width, 320);
  assert.equal(worker.posted.height, 180);
  assert.equal(worker.posted.fps, 30);
  assert.equal(recorders.length, 1);
  assert.equal(recorders[0].state, 'inactive', 'recording must not start before the worker is evaluated');

  worker.emit({ type: 'started', width: 320, height: 180, fps: 30, frames: 30 });
  assert.equal(recorders[0].state, 'recording', 'the recorder starts on the worker ready handshake');
  assert.equal(recorders[0].timeslice, 250);
  assert.equal(order.filter((entry) => entry === 'recorder.start').length, 1);

  worker.emit({ type: 'frame', index: 0, t: 0, width: 320, height: 180, bitmap: { close() {} } });
  assert.ok(order.indexOf('recorder.start') < order.indexOf('frame.draw'), 'frame 0 is painted after the recorder starts');
  const chunk = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });
  recorders[0].ondataavailable({ data: chunk });
  worker.emit({ type: 'done', frames: 1, cancelled: false });
  const result = await raceWithTimeout(renderPromise, 'animation render');
  assert.equal(result.mime, 'video/mp4;codecs=avc1.42E01E');
  assert.equal(result.blob.size, 3);
  assert.equal(result.poster, 'data:image/jpeg;base64,AAAA');
  assert.equal(result.width, 320);
  assert.equal(result.height, 180);
  assert.equal(result.fps, 30);
  assert.equal(worker.terminated, true, 'the worker is terminated after the render finishes');

  // A worker that dies before the ready handshake must reject instead of hanging.
  const deathPromise = core.renderAnimationVideo({
    code: 'function draw() {}',
    duration: 1,
    width: 320,
    height: 180,
    fps: 30,
  });
  const dyingWorker = workers[workers.length - 1];
  assert.equal(recorders[recorders.length - 1].state, 'inactive');
  dyingWorker.onerror({ message: 'worker crashed' });
  await assert.rejects(() => raceWithTimeout(deathPromise, 'animation render failure'), /worker crashed/);
  assert.equal(dyingWorker.terminated, true, 'a failed render still terminates the worker');

  // A worker that reports done without ever starting the recorder must reject
  // instead of resolving a 0-byte video (finish() guard).
  const guardPromise = core.renderAnimationVideo({
    code: 'function draw() {}',
    duration: 1,
    width: 320,
    height: 180,
    fps: 30,
  });
  const guardWorker = workers[workers.length - 1];
  const guardRecorder = recorders[recorders.length - 1];
  guardWorker.emit({ type: 'done', frames: 1, cancelled: false });
  await assert.rejects(
    () => raceWithTimeout(guardPromise, 'animation recording guard', 5000),
    /recording never started/,
    'done before the recorder starts must reject, not resolve a 0-byte blob',
  );
  assert.equal(guardRecorder.state, 'inactive');
  assert.equal(guardWorker.terminated, true, 'the guarded render still terminates the worker');
  client.store.dispose();
});

test('Deleting an audio-bearing asset releases its decoded buffer (UI-5)', async () => {
  const client = loadClient();
  const { store } = client;
  await store.importProjectFile({
    version: 1,
    project: { name: 'Audio cache', aspect: '16:9', aspectInitialized: true },
    assets: [
      {
        id: 'clip-with-audio',
        name: 'take.mp4',
        kind: 'video',
        mime: 'video/mp4',
        duration: 4,
        width: 1920,
        height: 1080,
        hasAudio: true,
        blobId: null,
      },
    ],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  const audioRuntime = client.sandbox.__AUDIO_RUNTIME();
  audioRuntime.audioBuffers.set('clip-with-audio', { getChannelData: () => new Float32Array(8) });
  audioRuntime.bedBuffers.set('unrelated', {});
  assert.equal(audioRuntime.audioBuffers.size, 1);
  const deleted = await store.deleteAsset('clip-with-audio');
  assert.equal(deleted.ok, true);
  assert.equal(
    audioRuntime.audioBuffers.has('clip-with-audio'),
    false,
    'deleting the asset must release its decoded AudioBuffer',
  );
  assert.equal(audioRuntime.bedBuffers.size, 1, 'unrelated cached buffers stay intact');
  store.dispose();
});

test('Bed clips keep their sourceIn through a split and reload (CC-12)', async () => {
  const client = loadClient();
  const { store, storage } = client;
  assert.equal(store.addBedAt(0, 'en'), true);
  const bed = store.getSnapshot().timeline.music[0];
  assert.equal(bed.kind, 'bed');
  assert.equal(bed.duration, 12);
  assert.equal(bed.sourceIn, 0);
  assert.equal(store.splitClip(bed.id, 'music', 6), true);
  let state = store.getSnapshot();
  assert.equal(state.timeline.music.length, 2);
  const right = state.timeline.music.find((clip) => clip.start === 6);
  assert.ok(right !== undefined);
  assert.equal(right.sourceIn, 6, 'the right half of a split score starts 6s into the bed');
  assert.equal(right.duration, 6);
  assert.equal(right.sourceDuration, 12);
  await pause(550);
  assert.equal(store.getSnapshot().persistence.status, 'saved');
  store.dispose();

  const reloaded = loadClient({ storage, cwd: '/workspace/alpha' });
  const reloadedState = reloaded.store.getSnapshot();
  assert.equal(reloadedState.timeline.music.length, 2);
  const reloadedRight = reloadedState.timeline.music.find((clip) => clip.start === 6);
  assert.ok(reloadedRight !== undefined);
  assert.equal(
    reloadedRight.sourceIn,
    6,
    'restoreProject must not clamp a split bed sourceIn against the clip duration',
  );
  assert.equal(reloadedRight.sourceDuration, 12);
  assert.equal(reloadedRight.duration, 6);
  const reloadedLeft = reloadedState.timeline.music.find((clip) => clip.start === 0);
  assert.equal(reloadedLeft.sourceIn, 0);
  reloaded.store.dispose();
});

test('restoreProject keeps bed sourceIn up to the source duration (CC-12)', () => {
  const { core } = loadClient();
  const restored = core.restoreProject({
    version: 1,
    project: { name: 'Bed restore', aspect: '16:9', aspectInitialized: true },
    timeline: {
      video: [],
      audio: [],
      music: [
        { id: 'bed-left', kind: 'bed', track: 'music', start: 0, duration: 6, sourceIn: 0, sourceDuration: 12, seed: 7 },
        { id: 'bed-right', kind: 'bed', track: 'music', start: 6, duration: 6, sourceIn: 6, sourceDuration: 12, seed: 7 },
      ],
    },
  }, { allowEmpty: true });
  assert.ok(restored !== null);
  const right = restored.timeline.music.find((clip) => clip.id === 'bed-right');
  assert.equal(right.sourceIn, 6);
  assert.equal(right.sourceDuration, 12);
  assert.equal(right.duration, 6);
  const left = restored.timeline.music.find((clip) => clip.id === 'bed-left');
  assert.equal(left.sourceIn, 0);

  // Clamped against sourceDuration - MIN_CLIP_SECONDS (11.5), not duration (2).
  const clamped = core.restoreProject({
    version: 1,
    project: { name: 'Clamped bed' },
    timeline: {
      music: [
        { id: 'bed-over', kind: 'bed', track: 'music', start: 0, duration: 2, sourceIn: 20, sourceDuration: 12, seed: 1 },
      ],
    },
  }, { allowEmpty: true });
  assert.equal(clamped.timeline.music[0].sourceIn, 11.5);
  assert.equal(clamped.timeline.music[0].sourceDuration, 12);
});

test('Aspect-only projects survive switching and reload (CC-4 completeness/CC-1 guard)', async () => {
  const client = loadClient({ cwd: '/workspace/alpha' });
  const { store, storage } = client;
  const firstProject = store.getSnapshot().projects.activeId;
  store.setAspect('9:16');
  assert.equal(store.getSnapshot().project.aspect, '9:16');
  assert.equal(store.getSnapshot().project.aspectInitialized, true);
  assert.equal(store.getSnapshot().persistence.status, 'saved');

  const secondProject = await store.createProject();
  assert.notEqual(secondProject.id, firstProject);
  assert.equal(store.getSnapshot().project.aspect, '16:9', 'a new project starts from the default aspect');
  assert.equal(await store.switchProject(firstProject), true);
  assert.equal(
    store.getSnapshot().project.aspect,
    '9:16',
    'a manually locked aspect must survive switching away and back',
  );
  assert.equal(store.getSnapshot().project.aspectInitialized, true);
  store.dispose();

  const reloaded = loadClient({ storage, cwd: '/workspace/alpha' });
  assert.equal(reloaded.store.getSnapshot().project.aspect, '9:16');
  assert.equal(reloaded.store.getSnapshot().project.aspectInitialized, true);
  reloaded.store.dispose();

  // CC-1 guard: without a locked aspect, emptying a project removes its
  // document so deleted content cannot resurrect after a reload.
  const plain = loadClient();
  const prefix = plain.sandbox.__PROJECT_KEYS.PREFIX;
  plain.store.addBedAt(0, 'en');
  await pause(550);
  assert.equal(plain.store.getSnapshot().project.aspectInitialized, false);
  assert.equal([...plain.storage.keys()].filter((key) => key.startsWith(prefix)).length, 1);
  const bed = plain.store.getSnapshot().timeline.music[0];
  plain.store.selectClip({ track: 'music', id: bed.id });
  assert.equal(plain.store.deleteSelectedClips(), true);
  assert.equal(plain.store.getSnapshot().persistence.status, 'blank');
  assert.equal(
    [...plain.storage.keys()].filter((key) => key.startsWith(prefix)).length,
    0,
    'an unlocked empty project still removes its document (CC-1)',
  );
  plain.store.dispose();
});

// ---------------------------------------------------------------------------
// Regressions for the V0.9.5 fixes (client.js frozen after these patches).
// ---------------------------------------------------------------------------

test('A locked aspect survives the remaining empty-project paths (0.9.5 aspect empty-out)', async () => {
  const projectDocumentKeys = (storage, prefix) => [...storage.keys()].filter((key) => key.startsWith(prefix));

  // 1) Deleting the last library asset keeps an aspect-only document.
  const lockedWithAsset = loadClient({ cwd: '/workspace/alpha' });
  const lockedPrefix = lockedWithAsset.sandbox.__PROJECT_KEYS.PREFIX;
  await lockedWithAsset.store.importProjectFile({
    version: 1,
    project: { name: '', aspect: '9:16', aspectInitialized: true },
    assets: [{ id: 'only-image', name: 'frame.png', kind: 'image', mime: 'image/png', blobId: null }],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  let state = lockedWithAsset.store.getSnapshot();
  assert.equal(state.project.aspect, '9:16');
  assert.equal(state.project.aspectInitialized, true);
  assert.equal(state.timeline.video.length, 0, 'no timeline clip, so restore must keep the explicit aspect flag');
  assert.equal(projectDocumentKeys(lockedWithAsset.storage, lockedPrefix).length, 1);
  const assetRemoval = lockedWithAsset.store.deleteEntries([{ type: 'asset', id: 'only-image' }], { force: true });
  assert.equal(assetRemoval.ok, true);
  state = lockedWithAsset.store.getSnapshot();
  assert.equal(state.assets.length, 0);
  assert.equal(state.persistence.status, 'saved', 'the aspect-only document is kept and saved');
  assert.equal(projectDocumentKeys(lockedWithAsset.storage, lockedPrefix).length, 1, 'an aspect-only document is not removed');
  lockedWithAsset.store.dispose();
  const lockedReload = loadClient({ storage: lockedWithAsset.storage, cwd: '/workspace/alpha' });
  assert.equal(lockedReload.store.getSnapshot().project.aspect, '9:16', 'the locked aspect survives a reload after the library empties');
  assert.equal(lockedReload.store.getSnapshot().project.aspectInitialized, true);
  lockedReload.store.dispose();

  // 2) A project without a locked aspect still drops its blank document.
  const plainWithAsset = loadClient({ cwd: '/workspace/alpha' });
  const plainPrefix = plainWithAsset.sandbox.__PROJECT_KEYS.PREFIX;
  await plainWithAsset.store.importProjectFile({
    version: 1,
    project: { name: '', aspect: '16:9', aspectInitialized: false },
    assets: [{ id: 'only-image', name: 'frame.png', kind: 'image', mime: 'image/png', blobId: null }],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  assert.equal(plainWithAsset.store.getSnapshot().project.aspectInitialized, false);
  plainWithAsset.store.deleteEntries([{ type: 'asset', id: 'only-image' }], { force: true });
  state = plainWithAsset.store.getSnapshot();
  assert.equal(state.persistence.status, 'blank');
  assert.equal(projectDocumentKeys(plainWithAsset.storage, plainPrefix).length, 0, 'an unlocked blank project still drops its document');
  plainWithAsset.store.dispose();
  const plainReload = loadClient({ storage: plainWithAsset.storage, cwd: '/workspace/alpha' });
  assert.equal(plainReload.store.getSnapshot().project.aspect, '16:9');
  plainReload.store.dispose();

  // 3) Clearing the project name keeps the aspect-only document when locked.
  const lockedName = loadClient();
  const lockedNamePrefix = lockedName.sandbox.__PROJECT_KEYS.PREFIX;
  lockedName.store.setAspect('9:16');
  assert.equal(lockedName.store.getSnapshot().persistence.status, 'saved');
  lockedName.store.setProjectName('Locked project');
  await pause(550);
  assert.equal(projectDocumentKeys(lockedName.storage, lockedNamePrefix).length, 1);
  lockedName.store.setProjectName('');
  state = lockedName.store.getSnapshot();
  assert.equal(state.project.name, '');
  assert.equal(state.persistence.status, 'saved', 'clearing the name of an aspect-locked project keeps a saved document');
  assert.equal(projectDocumentKeys(lockedName.storage, lockedNamePrefix).length, 1);
  lockedName.store.dispose();
  const lockedNameReload = loadClient({ storage: lockedName.storage, cwd: '/workspace/alpha' });
  assert.equal(lockedNameReload.store.getSnapshot().project.aspect, '9:16');
  lockedNameReload.store.dispose();

  // 4) Clearing the name without a locked aspect still removes the document.
  const plainName = loadClient();
  const plainNamePrefix = plainName.sandbox.__PROJECT_KEYS.PREFIX;
  plainName.store.setProjectName('Temporary');
  await pause(550);
  assert.equal(projectDocumentKeys(plainName.storage, plainNamePrefix).length, 1);
  plainName.store.setProjectName('');
  state = plainName.store.getSnapshot();
  assert.equal(state.persistence.status, 'blank');
  assert.equal(projectDocumentKeys(plainName.storage, plainNamePrefix).length, 0);
  plainName.store.dispose();
  const plainNameReload = loadClient({ storage: plainName.storage, cwd: '/workspace/alpha' });
  assert.equal(plainNameReload.store.getSnapshot().project.name, '');
  assert.equal(plainNameReload.store.getSnapshot().project.aspect, '16:9');
  plainNameReload.store.dispose();
});

test('A project created under the unresolved Workspace fallback is adopted when the cwd resolves (0.9.5)', async () => {
  // Without a cwd the store creates a project under the synthetic scope after
  // the 1.8 s fallback.
  const fallback = loadClient({ cwd: '' });
  const { store, storage, sandbox, sessionsState } = fallback;
  await pause(2_100);
  let state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:unresolved:s1', 'the fallback project lives under the synthetic scope');
  const orphanId = state.projects.activeId;
  assert.equal(typeof orphanId, 'string');
  store.setProjectName('Fallback project');
  assert.equal(store.addBedAt(0, 'en'), true);
  await pause(600);
  state = store.getSnapshot();
  assert.equal(state.persistence.status, 'saved');
  assert.equal(storage.has(sandbox.__PROJECT_KEYS.PREFIX + orphanId), true, 'the fallback project document is saved');

  // Note: since 0.9.5 the 1.8 s fallback keeps the sessions-list subscription
  // alive, so a late cwd can promote the scope in-session (see the dedicated
  // late-cwd test). The switch-away-and-back trigger below is the other
  // reachable activation path and is kept as an independent regression.
  sessionsState.ids.push('s2');
  sessionsState.byId.s2 = { sessionId: 's2', cwd: '/workspace/other' };
  sessionsState.byId.s1.cwd = '/workspace/real';
  store.setActiveSession('s2');
  await pause(150);
  assert.equal(store.getSnapshot().projects.scopeKey, 'workspace:/workspace/other');
  store.setActiveSession('s1');
  await pause(150);

  state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/real');
  assert.equal(state.projects.activeId, orphanId, 'the adopted project stays active');
  assert.equal(state.project.name, 'Fallback project');
  assert.equal(state.timeline.music.length, 1, 'the adopted project keeps its timeline content');
  assert.equal(state.projects.items.length, 1, 'the adopted project is listed exactly once');
  assert.equal(state.projects.items[0].id, orphanId);
  assert.equal(state.projects.items[0].scopeKey, 'workspace:/workspace/real');

  const index = JSON.parse(storage.get(sandbox.__PROJECT_KEYS.INDEX_KEY));
  assert.equal(
    index.projects.filter((entry) => String(entry.scopeKey).startsWith('workspace:unresolved:')).length,
    0,
    'no orphan entries remain in the index',
  );
  assert.equal(
    index.projects.filter((entry) => entry.scopeKey === 'workspace:/workspace/real').length,
    1,
    'exactly one real-scope entry, no duplicates',
  );
  assert.equal(index.activeByScope['workspace:unresolved:s1'], undefined, 'the synthetic active key is cleaned up');
  assert.equal(index.activeByScope['workspace:/workspace/real'], orphanId);
  assert.equal(storage.has(sandbox.__PROJECT_KEYS.PREFIX + orphanId), true, 'the project document keeps the same id');

  // The adopted project is switchable normally.
  const second = await store.createProject();
  assert.notEqual(second.id, orphanId);
  assert.equal(await store.switchProject(orphanId), true);
  assert.equal(store.getSnapshot().project.name, 'Fallback project');
  assert.equal(store.getSnapshot().timeline.music.length, 1);
  store.dispose();

  // Persistence: reloading with the resolved cwd keeps the adopted project.
  const reloaded = loadClient({ storage, cwd: '/workspace/real' });
  const reloadedState = reloaded.store.getSnapshot();
  assert.equal(reloadedState.projects.scopeKey, 'workspace:/workspace/real');
  assert.equal(reloadedState.projects.activeId, orphanId);
  assert.equal(reloadedState.project.name, 'Fallback project');
  assert.equal(reloadedState.timeline.music.length, 1, 'the adopted project survives a reload');
  assert.equal(reloadedState.projects.items.some((entry) => entry.id === orphanId), true);
  reloaded.store.dispose();

  // A blank fallback entry (never saved) is dropped on adoption instead of
  // silently occupying the real Workspace scope.
  const blankStorage = new Map();
  blankStorage.set('deepseek-design.projects.v2', JSON.stringify({
    version: 2,
    scopeMode: 'workspace',
    legacyMigrated: true,
    activeByScope: { 'workspace:unresolved:s1': 'prj_blank' },
    projects: [{ id: 'prj_blank', name: '', scopeKey: 'workspace:unresolved:s1', createdAt: 1, updatedAt: 2 }],
  }));
  const blankClient = loadClient({ storage: blankStorage, cwd: '/workspace/real' });
  const blankState = blankClient.store.getSnapshot();
  assert.equal(blankState.projects.scopeKey, 'workspace:/workspace/real');
  assert.equal(blankState.projects.items.length, 1, 'the real scope ends up with exactly one blank project');
  assert.equal(
    blankState.projects.items.some((entry) => entry.id === 'prj_blank'),
    false,
    'a never-saved fallback entry is dropped',
  );
  const blankIndex = JSON.parse(blankStorage.get('deepseek-design.projects.v2'));
  assert.equal(blankIndex.projects.filter((entry) => String(entry.scopeKey).startsWith('workspace:unresolved:')).length, 0);
  assert.equal(blankIndex.projects.length, 1);
  assert.equal(blankStorage.has('deepseek-design.project.v2.prj_blank'), false);
  blankClient.store.dispose();
});

test('Short videos are padded and the localized hint keys exist (0.9.5 short-clip hint)', async () => {
  const client = loadClient();
  const { store, sandbox } = client;
  await store.importProjectFile({
    version: 1,
    project: { name: 'Short clips', aspect: '16:9', aspectInitialized: true },
    assets: [
      { id: 'short', name: 'short.mp4', kind: 'video', duration: 0.4, width: 1920, height: 1080, blobId: null },
      { id: 'borderline', name: 'borderline.mp4', kind: 'video', duration: 0.5, width: 1920, height: 1080, blobId: null },
      { id: 'zero', name: 'zero.mp4', kind: 'video', duration: 0, width: 1920, height: 1080, blobId: null },
      { id: 'normal', name: 'normal.mp4', kind: 'video', duration: 2, width: 1920, height: 1080, blobId: null },
    ],
    timeline: { video: [], audio: [], music: [] },
  }, 'en');
  assert.equal(store.addAssetToTimeline('zero', 'video', 0, 'en'), null, 'a 0-duration video is still rejected');
  const shortPlacement = store.addAssetToTimeline('short', 'video', 0, 'en');
  assert.equal(shortPlacement.kind, 'video');
  assert.equal(shortPlacement.padded, true, 'a sub-minimum video reports padded for the toast');
  const borderlinePlacement = store.addAssetToTimeline('borderline', 'video', 0, 'en');
  assert.equal(borderlinePlacement.padded, false, 'exactly MIN_CLIP_SECONDS is not padded');
  const normalPlacement = store.addAssetToTimeline('normal', 'video', 6, 'en');
  assert.equal(normalPlacement.padded, false, 'a normal-duration video is not padded');
  const clips = store.getSnapshot().timeline.video;
  assert.equal(clips.find((clip) => clip.assetId === 'short').duration, 0.5, 'the short video is placed at the minimum length');

  // Both runtime dictionaries carry the hint, and their key sets stay in parity.
  const dictionaries = sandbox.__DICTIONARIES();
  assert.equal(typeof dictionaries.zh['toast.shortClip'], 'string');
  assert.equal(typeof dictionaries.en['toast.shortClip'], 'string');
  assert.ok(dictionaries.zh['toast.shortClip'].length > 0);
  assert.ok(dictionaries.en['toast.shortClip'].length > 0);
  assert.match(dictionaries.en['toast.shortClip'], /0\.5 s/);
  assert.match(dictionaries.zh['toast.shortClip'], /0\.5/);
  assert.deepEqual([...Object.keys(dictionaries.zh)].sort(), [...Object.keys(dictionaries.en)].sort(), 'zh/en dictionaries stay in parity including toast.shortClip');

  // The workbench drop handler shows the hint only for padded drops (wiring guard).
  const source = readFileSync(CLIENT_PATH, 'utf8');
  assert.match(source, /placed\.padded === true/);
  assert.match(source, /store\.showToast\(t\('toast\.shortClip'\), 'success'\)/);
  store.dispose();
});

test('Earliest-clip reorders stay compact and preserve intentional gaps (0.9.5 reorder semantics)', () => {
  const { core } = loadClient();
  const pairs = () => [
    { id: 'a', start: 0, duration: 2 },
    { id: 'b', start: 4, duration: 2 },
  ];
  // Earliest clip dropped onto a later clip: compact in-place reorder.
  const onto = core.placeMovedClip(pairs(), 'a', 3, 3);
  assert.deepEqual([...onto.map((clip) => [clip.id, clip.start])], [['a', 0], ['b', 2]]);
  // Earliest clip dropped after the other clip: insert-after, still no gap.
  const after = core.placeMovedClip(pairs(), 'a', 5, 5);
  assert.deepEqual([...after.map((clip) => [clip.id, clip.start])], [['b', 0], ['a', 2]]);
  // Old pinned case stays: b@2 moved onto a@0 → b@0, a@2.
  const oldCase = core.placeMovedClip([
    { id: 'a', start: 0, duration: 2 },
    { id: 'b', start: 2, duration: 2 },
  ], 'b', 0.5, 0.5);
  assert.deepEqual([...oldCase.map((clip) => [clip.id, clip.start])], [['b', 0], ['a', 2]]);
  // Non-earliest moves: middle reorder keeps the compact layout.
  const three = () => [
    { id: 'a', start: 0, duration: 2 },
    { id: 'b', start: 2, duration: 2 },
    { id: 'c', start: 4, duration: 2 },
  ];
  const middle = core.placeMovedClip(three(), 'b', 4.5, 4.5);
  assert.deepEqual([...middle.map((clip) => [clip.id, clip.start])], [['a', 0], ['b', 2], ['c', 4]]);
  // Moving the last clip to the front compacts the track.
  const lastToFront = core.placeMovedClip(three(), 'c', 0.5, 0.5);
  assert.deepEqual([...lastToFront.map((clip) => [clip.id, clip.start])], [['c', 0], ['a', 2], ['b', 4]]);
  // Intentional leading gaps are preserved as the reorder anchor.
  const gapped = [{ id: 'a', start: 5, duration: 2 }, { id: 'b', start: 8, duration: 2 }];
  const gapReorder = core.placeMovedClip(gapped, 'a', 9, 9);
  assert.deepEqual([...gapReorder.map((clip) => [clip.id, clip.start])], [['b', 5], ['a', 7]]);
  // A free move to empty space is unchanged.
  const free = core.placeMovedClip(pairs(), 'a', 10, 10);
  assert.deepEqual([...free.map((clip) => [clip.id, clip.start])], [['b', 4], ['a', 10]]);

  // Fuzz invariants: ids and durations survive, layouts never overlap, and a
  // reorder anchors at the track's original first start.
  let seed = 123456789;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const durationSum = (list) => list.reduce((sum, clip) => sum + clip.duration, 0);
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const count = 1 + Math.floor(random() * 5);
    const original = [];
    let cursor = Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const duration = 0.5 + Math.floor(random() * 8) / 2;
      original.push({ id: 'clip-' + index, start: cursor, duration });
      cursor += duration + (random() < 0.25 ? 0.5 : 0);
    }
    const target = original[Math.floor(random() * original.length)];
    const desired = Math.floor(random() * 14);
    const placed = core.placeMovedClip(original, target.id, desired, desired);
    assert.equal(placed.length, original.length, 'clip count preserved');
    assert.equal(new Set(placed.map((clip) => clip.id)).size, original.length, 'clip ids preserved');
    assert.ok(Math.abs(durationSum(placed) - durationSum(original)) < 1e-9, 'total clip duration cannot grow or shrink');
    for (let leftIndex = 0; leftIndex < placed.length; leftIndex += 1) {
      const left = placed[leftIndex];
      assert.ok(left.start >= 0, 'clip starts stay non-negative');
      for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex += 1) {
        const right = placed[rightIndex];
        assert.ok(left.start + left.duration <= right.start + 1e-6, 'reordered clips never overlap');
      }
    }
    const collides = original.some((clip) => clip.id !== target.id
      && desired < clip.start + clip.duration - 1e-6
      && desired + target.duration > clip.start + 1e-6);
    if (collides) {
      const anchor = Math.min(...original.map((clip) => clip.start));
      assert.ok(Math.abs(placed[0].start - anchor) < 1e-9, 'a reorder anchors at the original track start');
    }
  }
});

test('A late-resolving Workspace path promotes the fallback project in-session (0.9.5 adoption trigger)', async () => {
  const client = loadClient({ cwd: '' });
  const { store, storage, sandbox, sessionsState, emitSessionsChange, sessionListenerCount } = client;
  await pause(2_100);
  let state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:unresolved:s1', 'the fallback project lives under the synthetic scope');
  const adoptedId = state.projects.activeId;
  assert.equal(typeof adoptedId, 'string');
  assert.equal(sessionListenerCount(), 1, 'the sessions-list subscription stays alive after the 1.8 s fallback');
  store.setProjectName('Late Workspace project');
  assert.equal(store.addBedAt(0, 'en'), true);
  await pause(600);
  state = store.getSnapshot();
  assert.equal(state.persistence.status, 'saved');
  assert.equal(storage.has(sandbox.__PROJECT_KEYS.PREFIX + adoptedId), true, 'the fallback project document is saved');

  // The Workspace path resolves while the user stays in the same Session: a
  // sessions-list notification promotes the synthetic scope in place.
  sessionsState.byId.s1.cwd = '/workspace/late';
  emitSessionsChange();
  await pause(200);
  state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/late', 'the real scope is active after the notification');
  assert.equal(state.projects.activeId, adoptedId, 'the fallback project is adopted, not recreated');
  assert.equal(state.project.name, 'Late Workspace project');
  assert.equal(state.timeline.music.length, 1, 'the adopted project content is preserved');
  assert.equal(state.projects.items.length, 1, 'the adopted project is listed exactly once');
  assert.equal(state.projects.items[0].id, adoptedId);
  assert.equal(state.projects.items[0].scopeKey, 'workspace:/workspace/late');

  const index = JSON.parse(storage.get(sandbox.__PROJECT_KEYS.INDEX_KEY));
  assert.equal(
    index.projects.filter((entry) => String(entry.scopeKey).startsWith('workspace:unresolved:')).length,
    0,
    'the synthetic entry is re-keyed, not duplicated',
  );
  assert.equal(index.projects.filter((entry) => entry.scopeKey === 'workspace:/workspace/late').length, 1);
  assert.equal(index.activeByScope['workspace:unresolved:s1'], undefined, 'the synthetic active key is cleaned up');
  assert.equal(index.activeByScope['workspace:/workspace/late'], adoptedId);
  assert.equal(storage.has(sandbox.__PROJECT_KEYS.PREFIX + adoptedId), true, 'the project document keeps the same id');

  // stopWorkspaceWatch cleanup: the notification subscription is released after
  // adoption, so later Session notifications cannot re-scope or duplicate it.
  assert.equal(sessionListenerCount(), 0, 'the sessions-list subscription is released once the real scope is active');
  sessionsState.byId.s1.cwd = '/workspace/moved-again';
  emitSessionsChange();
  await pause(150);
  state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/late', 'later notifications do not re-scope an already-activated project');
  assert.equal(state.projects.items.length, 1, 'no duplicate project entries from repeated notifications');
  const stableIndex = JSON.parse(storage.get(sandbox.__PROJECT_KEYS.INDEX_KEY));
  assert.equal(stableIndex.projects.length, 1, 'the index stays stable after repeat notifications');
  assert.equal(stableIndex.projects[0].id, adoptedId);
  store.dispose();
});

test('A failed adoption persist aborts activation and can be retried (0.9.5 NB-1)', async () => {
  const orphanId = 'prj_orphan_nb1';
  const docKey = 'deepseek-design.project.v2.' + orphanId;
  const orphanDocument = {
    version: 1,
    project: { name: 'Orphan target', aspect: '3:4', aspectInitialized: true },
    assets: [],
    generations: [],
    timeline: {
      video: [],
      audio: [],
      music: [{ id: 'bed-1', kind: 'bed', track: 'music', start: 0, duration: 12, sourceIn: 0, sourceDuration: 12, seed: 1 }],
    },
    chat: { messages: [] },
  };
  const orphanDocumentRaw = JSON.stringify(orphanDocument);
  const storage = new Map();
  storage.set('deepseek-design.projects.v2', JSON.stringify({
    version: 2,
    scopeMode: 'workspace',
    legacyMigrated: true,
    activeByScope: { 'workspace:unresolved:s1': orphanId },
    projects: [{ id: orphanId, name: 'Orphan target', scopeKey: 'workspace:unresolved:s1', createdAt: 1, updatedAt: 2 }],
  }));
  storage.set(docKey, orphanDocumentRaw);

  const client = loadClient({ storage, cwd: '' });
  const indexKey = client.sandbox.__PROJECT_KEYS.INDEX_KEY;
  const originalSet = storage.set.bind(storage);
  // Make only the re-keyed (real-scope) index write fail, leaving the earlier
  // autosave/index writes working.
  storage.set = (key, value) => {
    if (key === indexKey && typeof value === 'string' && value.includes('workspace:/workspace/late')) {
      throw new Error('quota exceeded');
    }
    return originalSet(key, value);
  };
  client.sessionsState.byId.s1.cwd = '/workspace/late';
  client.emitSessionsChange();
  await pause(150);

  const failedState = client.store.getSnapshot();
  assert.equal(failedState.projects.ready, false, 'a failed adoption must not report a ready project scope');
  assert.equal(typeof failedState.projects.error, 'string');
  assert.ok(failedState.projects.error.length > 0, 'the adoption persist failure is surfaced on projects.error');
  assert.equal(storage.get(docKey), orphanDocumentRaw, 'the orphan project document must not be deleted on failure');
  const persistedAfterFailure = JSON.parse(storage.get(indexKey));
  assert.equal(
    persistedAfterFailure.projects.find((entry) => entry.id === orphanId).scopeKey,
    'workspace:unresolved:s1',
    'the failed re-key is not half-persisted',
  );
  assert.equal(persistedAfterFailure.projects.length, 1);
  client.store.dispose();

  // Retry with working storage: the adoption completes exactly once.
  storage.set = originalSet;
  const retry = loadClient({ storage, cwd: '/workspace/late' });
  const retryState = retry.store.getSnapshot();
  assert.equal(retryState.projects.ready, true);
  assert.equal(retryState.projects.error, '');
  assert.equal(retryState.projects.scopeKey, 'workspace:/workspace/late');
  assert.equal(retryState.projects.activeId, orphanId);
  assert.equal(retryState.project.name, 'Orphan target');
  assert.equal(retryState.timeline.music.length, 1, 'the adopted project content survives the retry');
  assert.equal(retryState.projects.items.length, 1, 'the retry yields a single project entry');
  assert.equal(storage.get(docKey), orphanDocumentRaw, 'the project document is preserved across the failed attempt and retry');
  const retryIndex = JSON.parse(storage.get(indexKey));
  assert.equal(retryIndex.projects.filter((entry) => entry.scopeKey === 'workspace:/workspace/late').length, 1);
  assert.equal(
    retryIndex.projects.filter((entry) => String(entry.scopeKey).startsWith('workspace:unresolved:')).length,
    0,
    'the retry cleans the synthetic scope out of the index',
  );
  assert.equal(retryIndex.projects.length, 1);
  retry.store.dispose();
});

test('A corrupt orphan document is adopted without deleting its bytes (0.9.5 NB-2)', async () => {
  const corruptId = 'prj_orphan_corrupt';
  const corruptDocKey = 'deepseek-design.project.v2.' + corruptId;
  const corruptRaw = '{"version":1,"project":{"name":"Broken","aspect":"3:4"'; // invalid JSON
  const missingId = 'prj_orphan_missing';
  const missingDocKey = 'deepseek-design.project.v2.' + missingId;
  const storage = new Map();
  storage.set('deepseek-design.projects.v2', JSON.stringify({
    version: 2,
    scopeMode: 'workspace',
    legacyMigrated: true,
    activeByScope: { 'workspace:unresolved:s1': corruptId },
    projects: [
      { id: corruptId, name: 'Corrupt project', scopeKey: 'workspace:unresolved:s1', createdAt: 1, updatedAt: 2 },
      { id: missingId, name: 'Missing project', scopeKey: 'workspace:unresolved:s1', createdAt: 3, updatedAt: 4 },
    ],
  }));
  storage.set(corruptDocKey, corruptRaw);

  const client = loadClient({ storage, cwd: '/workspace/late' });
  const state = client.store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/late');
  assert.equal(state.projects.activeId, corruptId, 'the corrupt-document orphan becomes the active project');
  assert.equal(state.projects.ready, true);
  assert.equal(state.projects.items.length, 1, 'the corrupt-document orphan is visible and the never-saved orphan is dropped');
  assert.equal(state.projects.items[0].id, corruptId);
  assert.equal(state.projects.items[0].scopeKey, 'workspace:/workspace/late');
  assert.equal(state.project.name, 'Corrupt project', 'the project name is recovered from the project index');
  assert.equal(storage.has(corruptDocKey), true, 'the corrupt project document bytes are preserved');
  assert.equal(storage.get(corruptDocKey), corruptRaw, 'the raw corrupt document is untouched');
  assert.equal(storage.has(missingDocKey), false, 'a truly missing document entry is still dropped');
  const index = JSON.parse(storage.get('deepseek-design.projects.v2'));
  assert.equal(index.projects.length, 1, 'no duplicate entries after adoption');
  assert.equal(index.projects[0].id, corruptId);
  assert.equal(index.projects[0].scopeKey, 'workspace:/workspace/late');
  assert.equal(
    index.projects.filter((entry) => String(entry.scopeKey).startsWith('workspace:unresolved:')).length,
    0,
  );
  assert.equal(index.activeByScope['workspace:/workspace/late'], corruptId);
  assert.equal(index.activeByScope['workspace:unresolved:s1'], undefined);
  client.store.dispose();

  // A wrong-version document takes the same raw-presence adoption path.
  const wrongVersionRaw = JSON.stringify({ version: 2, project: { name: 'Wrong version' } });
  const wrongId = 'prj_orphan_wrong_version';
  const wrongDocKey = 'deepseek-design.project.v2.' + wrongId;
  const wrongStorage = new Map();
  wrongStorage.set('deepseek-design.projects.v2', JSON.stringify({
    version: 2,
    scopeMode: 'workspace',
    legacyMigrated: true,
    activeByScope: { 'workspace:unresolved:s1': wrongId },
    projects: [{ id: wrongId, name: 'Wrong version', scopeKey: 'workspace:unresolved:s1', createdAt: 1, updatedAt: 2 }],
  }));
  wrongStorage.set(wrongDocKey, wrongVersionRaw);
  const wrongClient = loadClient({ storage: wrongStorage, cwd: '/workspace/late' });
  const wrongState = wrongClient.store.getSnapshot();
  assert.equal(wrongState.projects.scopeKey, 'workspace:/workspace/late');
  assert.equal(wrongState.projects.activeId, wrongId);
  assert.equal(wrongStorage.get(wrongDocKey), wrongVersionRaw, 'an unreadable wrong-version document is preserved, not deleted');
  wrongClient.store.dispose();
});

test('Switching to a Session with an unresolved cwd starts its own synthetic scope (SF-1 regression)', async () => {
  const client = loadClient();
  const { store, sessionsState, emitSessionsChange } = client;
  await pause(150);
  const alphaId = store.getSnapshot().projects.activeId;
  assert.equal(store.getSnapshot().projects.scopeKey, 'workspace:/workspace/alpha');
  store.setProjectName('Alpha project');
  await pause(600);
  assert.equal(store.getSnapshot().persistence.status, 'saved');

  // s2 opens before its Workspace path is known. It must not inherit alpha.
  sessionsState.ids.push('s2');
  sessionsState.byId.s2 = { sessionId: 's2' };
  store.setActiveSession('s2');
  await pause(2_200);
  let state = store.getSnapshot();
  assert.equal(
    state.projects.scopeKey,
    'workspace:unresolved:s2',
    'an unresolved Session must fall back to its own synthetic scope, not the previous Workspace',
  );
  assert.notEqual(state.projects.activeId, alphaId, 'the previous Workspace project must not stay active');
  assert.notEqual(state.project.name, 'Alpha project', 'the previous Workspace project must not leak into the new Session');
  assert.ok(
    state.projects.items.every((entry) => entry.scopeKey === 'workspace:unresolved:s2'),
    'no project from the previous Workspace may be listed',
  );

  // The cwd resolves later: the synthetic scope is adopted into the real one.
  sessionsState.byId.s2.cwd = '/workspace/beta';
  emitSessionsChange();
  await pause(250);
  state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, 'workspace:/workspace/beta');
  store.dispose();
});

test('Timeline video preview retries its seek once metadata is known (A-2 regression)', () => {
  const { sandbox } = loadClient();
  const timeline = {
    video: [{ id: 'clip-v', kind: 'asset', track: 'video', assetId: 'asset-v', start: 2, duration: 6, sourceIn: 1 }],
    audio: [],
    music: [],
  };
  const assets = [{ id: 'asset-v', kind: 'video', objectUrl: 'blob:timeline-video', posterUrl: '' }];
  const tree = sandbox.__UI.TimelineVideoLayer({ timeline, assets, time: 5, playing: false });
  assert.equal(tree.type, 'video');

  // A freshly mounted <video> reports duration === NaN, so the mount-time seek
  // is skipped; the metadata handler must retry it once the duration is known.
  const lateElement = { duration: NaN, currentTime: 0, play: () => Promise.resolve(), pause() {} };
  assert.equal(typeof tree.props.onLoadedMetadata, 'function', 'a metadata-ready retry handler is required');
  lateElement.duration = 10; // loadedmetadata has just fired
  tree.props.onLoadedMetadata({ currentTarget: lateElement });
  assert.equal(lateElement.currentTime, 4, 'sourceIn + (time - start) = 1 + (5 - 2)');

  // Clamp inside the media duration and do not play while paused.
  const shortElement = { duration: 3, currentTime: 0, play() { throw new Error('must not play while paused'); }, pause() {} };
  tree.props.onLoadedMetadata({ currentTarget: shortElement });
  assert.equal(shortElement.currentTime, 2.98);
});

test('Export run tokens invalidate a cancelled run before a retry (B-1 regression)', () => {
  const { sandbox } = loadClient();
  const runs = sandbox.__UI.createRunSequence();
  const first = runs.begin();
  assert.equal(runs.isCurrent(first), true);

  // The user cancels while the first run is still awaiting the browser.
  runs.invalidate();
  assert.equal(runs.isCurrent(first), false);

  // The user retries: the stale run must never become current again.
  const second = runs.begin();
  assert.equal(runs.isCurrent(first), false, 'the stale run must not be resumed by a retry');
  assert.equal(runs.isCurrent(second), true);

  runs.invalidate();
  assert.equal(runs.isCurrent(second), false);
});

test('ExportModal owns every asynchronous run with a per-run token (B-1 wiring regression)', () => {
  const source = readFileSync(CLIENT_PATH, 'utf8');
  assert.match(source, /function createRunSequence\(\)/, 'the per-run token helper must exist');
  assert.match(source, /const runSeqRef = useRef\(null\);/, 'ExportModal must keep the run sequence');
  assert.match(source, /runSeqRef\.current\.begin\(\)/, 'each startExport run takes a token');
  assert.match(source, /runSeqRef\.current\.invalidate\(\)/, 'cancel/unmount/visibilitychange invalidate the token');
  const currentChecks = source.match(/if \(!isCurrent\(\)\) return;/g) ?? [];
  assert.ok(currentChecks.length >= 6, 'the export loop must re-check the run token after each await, found ' + currentChecks.length);
});

// ---------------------------------------------------------------------------
// V0.9.6: per-minute project backups
// ---------------------------------------------------------------------------

const BACKUP_KEY_PREFIX = 'deepseek-design.backup.v1.';
const SETTINGS_KEY = 'deepseek-design.settings.v1';
const readBucket = (client) => {
  const projectId = client.store.getSnapshot().projects.activeId;
  const raw = client.storage.get(BACKUP_KEY_PREFIX + projectId);
  return raw === undefined ? null : JSON.parse(raw);
};

test('Project backups are enabled by default there is a 60s timer, and the toggle persists', async () => {
  const first = loadClient();
  const initial = first.store.getSnapshot().projects;
  assert.equal(initial.backup.enabled, true, 'backups are on by default');
  assert.ok(first.intervalCount(60_000) >= 1, 'a 60 second backup timer is armed');
  assert.equal(first.store.getSnapshot().projects.backup.count, 0, 'no snapshot yet');

  assert.equal(first.store.setAutoBackup(false), true);
  assert.equal(first.store.getSnapshot().projects.backup.enabled, false);
  assert.equal(first.intervalCount(60_000), 0, 'disabling stops the timer');
  assert.equal(JSON.parse(first.storage.get(SETTINGS_KEY)).autoBackup, false);
  first.store.dispose();

  const second = loadClient({ storage: first.storage });
  assert.equal(second.store.getSnapshot().projects.backup.enabled, false, 'the off setting survives a reload');
  assert.equal(second.intervalCount(60_000), 0);
  second.store.dispose();
});

test('The minute timer backs up the active project while enabled (0.9.6)', async () => {
  const client = loadClient();
  const { store, runIntervals, intervalCount } = client;
  store.setProjectName('Timer project');
  assert.ok(intervalCount(60_000) >= 1);
  runIntervals(60_000);
  const bucket = readBucket(client);
  assert.ok(bucket !== null, 'the timer wrote a backup bucket');
  assert.equal(bucket.snapshots.length, 1);
  assert.equal(bucket.snapshots[0].doc.project.name, 'Timer project');
  assert.ok(store.getSnapshot().projects.backup.lastAt > 0);
  assert.equal(store.getSnapshot().projects.backup.count, 1);

  assert.equal(store.setAutoBackup(false), true);
  store.setProjectName('Timer project again');
  runIntervals(60_000);
  assert.equal(readBucket(client).snapshots.length, 1, 'a disabled timer does not write more snapshots');
  store.dispose();
});

test('Manual backups snapshot the document, deduplicate, and retain the last five (0.9.6)', async () => {
  const client = loadClient();
  const { store } = client;
  store.setProjectName('Backup me');
  assert.equal(store.addBedAt(0, 'en'), true);
  assert.equal(store.backupNow(), true);
  const first = readBucket(client);
  assert.equal(first.version, 1);
  assert.equal(first.projectId, store.getSnapshot().projects.activeId);
  assert.equal(first.snapshots.length, 1);
  assert.equal(first.snapshots[0].doc.project.name, 'Backup me');
  assert.equal(first.snapshots[0].doc.timeline.music.length, 1);
  assert.equal(store.getSnapshot().projects.backup.lastAt, first.snapshots[0].at);

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(store.backupNow(), false, 'an unchanged document is not backed up twice even after savedAt changes');
  assert.equal(readBucket(client).snapshots.length, 1);

  for (let index = 0; index < 7; index += 1) {
    store.setProjectName('Version ' + index);
    assert.equal(store.backupNow(), true);
  }
  const bucket = readBucket(client);
  assert.equal(bucket.snapshots.length, 5, 'only the five newest snapshots are kept');
  assert.equal(bucket.snapshots.at(-1).doc.project.name, 'Version 6');
  assert.equal(bucket.snapshots[0].doc.project.name, 'Version 2');
  store.dispose();
});

test('Restoring the latest backup restores content and keeps the pre-restore state (0.9.6)', async () => {
  const client = loadClient();
  const { store } = client;
  store.setProjectName('First');
  assert.equal(store.addBedAt(0, 'en'), true);
  assert.equal(store.backupNow(), true);

  store.setProjectName('Second');
  assert.equal(store.addBedAt(2, 'en'), true);
  assert.equal(store.getSnapshot().timeline.music.length, 2);

  assert.equal(store.restoreProjectBackup(), true);
  let state = store.getSnapshot();
  assert.equal(state.project.name, 'First');
  assert.equal(state.timeline.music.length, 1, 'the timeline is restored with the backup');
  assert.equal(state.persistence.status, 'saved');
  const bucket = readBucket(client);
  assert.equal(bucket.snapshots.length, 2, 'the pre-restore document is kept as a snapshot');
  assert.equal(bucket.snapshots.at(-1).doc.project.name, 'Second');
  assert.equal(state.projects.backup.count, 2);

  // Undoing the restore is possible by restoring again.
  assert.equal(store.restoreProjectBackup(), true);
  state = store.getSnapshot();
  assert.equal(state.project.name, 'Second');
  assert.equal(state.timeline.music.length, 2);
  store.dispose();
});

test('Restoring without a backup fails with an error toast (0.9.6)', () => {
  const client = loadClient();
  const { store } = client;
  store.setProjectName('No backup');
  assert.equal(store.restoreProjectBackup(), false);
  const toast = store.getSnapshot().toast;
  assert.ok(toast !== null);
  assert.equal(toast.tone, 'error');
  assert.equal(toast.text, 'Could not restore the backup; try again', 'the failure is localized, not a raw key');
  store.dispose();
});

test('An empty project is not backed up and deleting a project removes its bucket (0.9.6)', async () => {
  const client = loadClient();
  const { store, storage } = client;
  assert.equal(store.backupNow(), false, 'a blank project creates no snapshot');
  store.setProjectName('Delete me');
  assert.equal(store.backupNow(), true);
  const projectId = store.getSnapshot().projects.activeId;
  assert.ok(storage.has(BACKUP_KEY_PREFIX + projectId));
  await store.deleteProject(projectId);
  assert.equal(storage.has(BACKUP_KEY_PREFIX + projectId), false, 'deleting the project removes its backups');
  assert.equal(store.getSnapshot().projects.backup.count, 0, 'the new blank project starts with no backups');
  store.dispose();
});

test('Backups are not part of the serialized project document (0.9.6)', async () => {
  const client = loadClient();
  const { store } = client;
  store.setProjectName('Serialized');
  store.backupNow();
  const exported = await store.exportProjectFile();
  assert.equal('backup' in exported.data.project, false);
  assert.equal('settings' in exported.data, false);
  const docKey = 'deepseek-design.project.v2.' + store.getSnapshot().projects.activeId;
  const parsed = JSON.parse(client.storage.get(docKey));
  assert.equal('backup' in parsed, false, 'backup metadata stays out of the project document');
  assert.equal(parsed.projects, undefined, 'the project meta (including backup state) is not serialized');
  store.dispose();
});

test('A storage quota failure during backup degrades gracefully (0.9.6)', () => {
  const client = loadClient();
  const { store, sandbox } = client;
  store.setProjectName('Quota test');
  const storageApi = sandbox.localStorage;
  const originalSetItem = storageApi.setItem;
  storageApi.setItem = (key, value) => {
    if (typeof key === 'string' && key.startsWith(BACKUP_KEY_PREFIX)) throw new Error('QuotaExceededError');
    return originalSetItem(key, value);
  };
  try {
    assert.equal(store.backupNow(), false);
    const toast = store.getSnapshot().toast;
    assert.ok(toast !== null);
    assert.equal(toast.tone, 'error', 'the failure is surfaced');
    assert.equal(store.getSnapshot().projects.backup.count, 0);
  } finally {
    storageApi.setItem = originalSetItem;
    store.dispose();
  }
});

test('Backup bucket pruning drops the oldest bucket when storage is tight (0.9.6)', () => {
  // 50 pre-existing project buckets + the active project's write failing once:
  // the first attempt must prune the oldest bucket and the retry must succeed.
  const seed = new Map();
  const seededBuckets = [];
  for (let index = 0; index < 50; index += 1) {
    const projectId = 'prj_seed_' + index;
    const key = BACKUP_KEY_PREFIX + projectId;
    seed.set(key, JSON.stringify({
      version: 1,
      projectId,
      snapshots: [{ at: 1000 + index, doc: { version: 1, savedAt: 1000 + index, project: { name: 'Seed ' + index } } }],
    }));
    seededBuckets.push({ projectId, key, at: 1000 + index });
  }
  const client = loadClient({ seedStorage: Object.fromEntries(seed) });
  const { store, sandbox, storage } = client;
  store.setProjectName('Prune me');
  const activeId = store.getSnapshot().projects.activeId;
  const activeKey = BACKUP_KEY_PREFIX + activeId;
  const storageApi = sandbox.localStorage;
  const originalSetItem = storageApi.setItem;
  let failedOnce = false;
  storageApi.setItem = (key, value) => {
    if (key === activeKey && !failedOnce) {
      failedOnce = true;
      throw new Error('QuotaExceededError');
    }
    return originalSetItem(key, value);
  };
  try {
    assert.equal(store.backupNow(), true, 'the retry after pruning succeeds');
  } finally {
    storageApi.setItem = originalSetItem;
  }
  assert.equal(storage.has(activeKey), true, 'the active project snapshot is written');
  const oldest = seededBuckets.reduce((min, entry) => (entry.at < min.at ? entry : min));
  assert.equal(storage.has(oldest.key), false, 'the oldest bucket is pruned to make room');
  const remainingSeeds = seededBuckets.filter((entry) => entry.key !== oldest.key && storage.has(entry.key));
  assert.equal(remainingSeeds.length, 49, 'the other seeded buckets are untouched');
  store.dispose();
});


// ---------------------------------------------------------------------------
// V1.0.0: backup safety, restore reversibility, quota pressure, adoption fast
// path, and the 0.9.5 core residuals (CC-1/CC-2/CC-3).
// ---------------------------------------------------------------------------

const INDEX_KEY = 'deepseek-design.projects.v2';
const DOC_PREFIX = 'deepseek-design.project.v2.';

test('Restoring a backup aborts when the pre-restore safety snapshot cannot be stored (V1.0.0)', async () => {
  const client = loadClient();
  const { store, sandbox, storage } = client;
  store.setProjectName('Alpha');
  assert.equal(store.addBedAt(0, 'en'), true);
  assert.equal(store.backupNow(), true);
  store.setProjectName('Beta');
  assert.equal(store.addBedAt(2, 'en'), true);
  await new Promise((resolve) => setTimeout(resolve, 550));
  const projectId = store.getSnapshot().projects.activeId;
  const docKey = DOC_PREFIX + projectId;
  const storageApi = sandbox.localStorage;
  const originalSetItem = storageApi.setItem;
  storageApi.setItem = (key, value) => {
    if (typeof key === 'string' && key.startsWith(BACKUP_KEY_PREFIX)) throw new Error('QuotaExceededError');
    return originalSetItem(key, value);
  };
  try {
    assert.equal(store.restoreProjectBackup(), false, 'the restore is aborted, not reported as successful');
    const state = store.getSnapshot();
    assert.equal(state.project.name, 'Beta', 'the current project is unchanged in memory');
    assert.equal(state.timeline.music.length, 2);
    assert.equal(state.toast.tone, 'error');
    assert.match(state.toast.text, /safety copy could not be stored/i);
    assert.equal(JSON.parse(storage.get(docKey)).project.name, 'Beta', 'the persisted document is unchanged');
  } finally {
    storageApi.setItem = originalSetItem;
    store.dispose();
  }
});

test('The minute timer no longer buries the pre-restore snapshot (V1.0.0)', async () => {
  const client = loadClient();
  const { store, runIntervals } = client;
  store.setProjectName('First');
  assert.equal(store.addBedAt(0, 'en'), true);
  assert.equal(store.backupNow(), true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  store.setProjectName('Second');
  assert.equal(store.addBedAt(2, 'en'), true);
  await new Promise((resolve) => setTimeout(resolve, 550));

  assert.equal(store.restoreProjectBackup(), true);
  assert.equal(store.getSnapshot().project.name, 'First');
  runIntervals(60_000);
  let bucket = readBucket(client);
  assert.equal(bucket.snapshots.length, 2, 'the timer does not append a duplicate of the restored document');
  assert.equal(bucket.snapshots.at(-1).doc.project.name, 'Second', 'the pre-restore snapshot is still newest');

  assert.equal(store.restoreProjectBackup(), true);
  assert.equal(store.getSnapshot().project.name, 'Second', 'restore remains reversible after a timer tick');
  bucket = readBucket(client);
  assert.equal(bucket.snapshots.at(-1).doc.project.name, 'First', 'the next restore can toggle back');
  store.dispose();
});

test('Backups over the 1 MiB cap are reported and flagged in the menu state (V1.0.0)', () => {
  const scopeKey = 'workspace:/workspace/alpha';
  const projectId = 'prj_large';
  const clips = [];
  for (let index = 0; index < 12_000; index += 1) {
    clips.push({ id: 'clip-' + index, kind: 'bed', track: 'music', name: 'Score', start: index * 12, sourceIn: 0, duration: 12, sourceDuration: 12, seed: index + 1 });
  }
  const doc = JSON.stringify({
    version: 1,
    savedAt: 1,
    project: { name: 'Large project', aspect: '16:9', aspectInitialized: true },
    assets: [],
    generations: [],
    timeline: { video: [], audio: [], music: clips },
    chat: { messages: [] },
  });
  const seed = {
    [INDEX_KEY]: JSON.stringify({
      version: 2,
      scopeMode: 'workspace',
      legacyMigrated: true,
      activeByScope: { [scopeKey]: projectId },
      projects: [{ id: projectId, name: 'Large project', scopeKey, createdAt: 1, updatedAt: 1 }],
    }),
    [DOC_PREFIX + projectId]: doc,
  };
  const client = loadClient({ seedStorage: seed });
  const { store } = client;
  assert.equal(store.backupNow(), false, 'the oversized document is not snapshotted');
  const state = store.getSnapshot();
  assert.equal(state.projects.backup.tooLarge, true, 'the menu state reports the skipped backup');
  assert.equal(state.toast.tone, 'error');
  assert.match(state.toast.text, /1 MiB/);
  store.dispose();
});

test('Clearing backups removes every bucket and resets the menu state (V1.0.0)', () => {
  const client = loadClient();
  const { store, storage } = client;
  store.setProjectName('Clear me');
  assert.equal(store.backupNow(), true);
  const projectId = store.getSnapshot().projects.activeId;
  assert.ok(storage.has(BACKUP_KEY_PREFIX + projectId));
  assert.ok(store.clearProjectBackups() >= 1);
  assert.equal(storage.has(BACKUP_KEY_PREFIX + projectId), false);
  assert.equal(store.getSnapshot().projects.backup.count, 0);
  assert.equal(store.getSnapshot().projects.backup.lastAt, 0);
  store.dispose();
});

test('A failed backup-preference write is reported instead of silently reverting (V1.0.0)', () => {
  const client = loadClient();
  const { store, sandbox } = client;
  const storageApi = sandbox.localStorage;
  const originalSetItem = storageApi.setItem;
  storageApi.setItem = (key, value) => {
    if (key === SETTINGS_KEY) throw new Error('QuotaExceededError');
    return originalSetItem(key, value);
  };
  try {
    assert.equal(store.setAutoBackup(false), false);
    assert.equal(store.getSnapshot().projects.backup.enabled, true, 'the old preference stays active');
    assert.match(store.getSnapshot().toast.text, /backup preference/i);
  } finally {
    storageApi.setItem = originalSetItem;
    store.dispose();
  }
});

test('Successful backups enforce the 50-bucket cap proactively (V1.0.0)', () => {
  const seed = new Map();
  for (let index = 0; index < 60; index += 1) {
    const projectId = 'prj_seed_' + index;
    seed.set(BACKUP_KEY_PREFIX + projectId, JSON.stringify({
      version: 1,
      projectId,
      snapshots: [{ at: 1000 + index, doc: { version: 1, savedAt: 1000 + index, project: { name: 'Seed ' + index } } }],
    }));
  }
  const client = loadClient({ seedStorage: Object.fromEntries(seed) });
  const { store, storage } = client;
  store.setProjectName('Cap me');
  assert.equal(store.backupNow(), true);
  const buckets = [...storage.keys()].filter((key) => key.startsWith(BACKUP_KEY_PREFIX));
  assert.ok(buckets.length <= 50, 'the active bucket plus at most 49 others remain, got ' + buckets.length);
  store.dispose();
});

test('Legacy session projects are adopted on a same-Workspace Session switch (V1.0.0)', async () => {
  const scopeKey = 'workspace:/workspace/alpha';
  const seed = {
    [INDEX_KEY]: JSON.stringify({
      version: 2,
      scopeMode: 'workspace',
      legacyMigrated: true,
      activeByScope: { [scopeKey]: 'prj_s1' },
      projects: [
        { id: 'prj_s1', name: 'S1 project', scopeKey, createdAt: 1, updatedAt: 1 },
        { id: 'prj_s2', name: 'S2 project', scopeKey: 'session:s2', createdAt: 2, updatedAt: 2 },
      ],
    }),
  };
  const client = loadClient({ seedStorage: seed });
  const { store, sessionsState } = client;
  assert.equal(store.getSnapshot().projects.items.map((item) => item.name).join('|'), 'S1 project');
  sessionsState.byId.s2 = { sessionId: 's2', cwd: '/workspace/alpha' };
  store.setActiveSession('s2');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const state = store.getSnapshot();
  assert.equal(state.projects.scopeKey, scopeKey);
  assert.equal(state.projects.items.map((item) => item.name).sort().join('|'), 'S1 project|S2 project', 'the legacy session project is visible after the switch');
  assert.equal(state.projects.activeId, 'prj_s1', 'the active project is unchanged');
  store.dispose();
});

test('Trim-start can reach 0 and no longer swallows a zero target (CC-1, V1.0.0)', () => {
  const { core } = loadClient();
  const trimmed = core.clampTrim({ start: 1, duration: 2, sourceIn: 1, sourceDuration: 10 }, 'start', 0, { previousEnd: 0 });
  assert.equal(trimmed.start, 0);
  assert.equal(trimmed.sourceIn, 0);
  assert.equal(trimmed.duration, 3);
});

test('Restoring a backup keeps the media needed by the retained pre-restore snapshot (B1, V1.0.0)', async () => {
  const fakeDb = createFakeIndexedDb();
  const client = loadClient({ globals: { indexedDB: fakeDb } });
  const { store } = client;
  const media = () => fakeDb._stores('deepseek-design-media').get('media');

  const addVideo = async (name, bytes) => store.addExportedVideo({
    blob: new Blob([bytes], { type: 'video/webm' }),
    name,
    duration: 2,
  }, 'en');

  await addVideo('A.webm', [1, 2, 3]);
  const assetA = store.getSnapshot().assets.find((asset) => asset.name === 'A.webm');
  assert.ok(assetA && typeof assetA.blobId === 'string');
  assert.equal(store.backupNow(), true, 'snapshot with A only');

  await addVideo('B.webm', [4, 5, 6]);
  const assetB = store.getSnapshot().assets.find((asset) => asset.name === 'B.webm');
  assert.ok(assetB && typeof assetB.blobId === 'string');
  assert.equal(media().has(assetB.blobId), true, 'B media exists before the restore');
  await new Promise((resolve) => setTimeout(resolve, 550));

  // Restoring A takes the project back to [A] while the pre-restore [A, B]
  // document is kept as a snapshot; B's blob must survive for the undo path.
  assert.equal(store.restoreProjectBackup(), true);
  assert.equal(store.getSnapshot().assets.length, 1);
  // The restore's media deletion is scheduled asynchronously; give it a beat so
  // the assertion actually observes whether the blob was deleted.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(media().has(assetB.blobId), true, 'B is referenced by the retained pre-restore snapshot');
  assert.equal(store.restoreProjectBackup(), true, 'restoring again undoes the restore');
  assert.equal(store.getSnapshot().assets.length, 2);
  store.dispose();
});

test('A failed project save drops backups and retries so the document is saved (P2-2c, V1.0.0)', async () => {
  const client = loadClient();
  const { store, sandbox, storage } = client;
  store.setProjectName('Quota project');
  assert.equal(store.addBedAt(0, 'en'), true);
  assert.equal(store.backupNow(), true);
  const projectId = store.getSnapshot().projects.activeId;
  const docKey = DOC_PREFIX + projectId;
  const backupKey = BACKUP_KEY_PREFIX + projectId;
  const storageApi = sandbox.localStorage;
  const originalSetItem = storageApi.setItem;
  // Simulate a full origin: the project document cannot be written while the
  // backup bucket still occupies space, but succeeds once it is evicted.
  storageApi.setItem = (key, value) => {
    if (key === docKey && storage.has(backupKey)) throw new Error('QuotaExceededError');
    return originalSetItem(key, value);
  };
  try {
    store.setProjectName('Edited after quota');
    await new Promise((resolve) => setTimeout(resolve, 550));
    const state = store.getSnapshot();
    assert.equal(state.persistence.status, 'saved', 'the retrying save succeeds');
    assert.equal(storage.has(backupKey), false, 'the backup bucket was evicted as the last resort');
    assert.equal(JSON.parse(storage.get(docKey)).project.name, 'Edited after quota');
  } finally {
    storageApi.setItem = originalSetItem;
    store.dispose();
  }
});

test('Reloaded clips keep the 0.5 s minimum on every lane (CC-2, V1.0.0)', () => {
  const { core } = loadClient();
  const assets = new Map([
    ['asset-video', { id: 'asset-video', kind: 'video', duration: 10, name: 'v.mp4' }],
    ['asset-audio', { id: 'asset-audio', kind: 'audio', duration: 10, name: 'a.wav' }],
  ]);
  const generations = new Map([
    ['gen-1', { id: 'gen-1', title: 'Gen', spec: { scenes: [{ type: 'orbit', duration: 3, title: 'Scene', seed: 1 }] } }],
  ]);
  const shortBed = core.normalizeClip({ id: 'c1', kind: 'bed', track: 'music', duration: 0.1, sourceDuration: 5 }, generations, assets);
  assert.ok(shortBed.duration >= 0.5);
  const shortAudio = core.normalizeClip({ id: 'c2', kind: 'audio', track: 'audio', assetId: 'asset-audio', duration: 0.1 }, generations, assets);
  assert.ok(shortAudio.duration >= 0.5);
  const shortAsset = core.normalizeClip({ id: 'c3', kind: 'asset', track: 'video', assetId: 'asset-video', duration: 0.1 }, generations, assets);
  assert.ok(shortAsset.duration >= 0.5);
  const shortGeneration = core.normalizeClip({ id: 'c4', kind: 'generation', track: 'video', generationId: 'gen-1', sceneIndex: 0, duration: 0.1 }, generations, assets);
  assert.ok(shortGeneration.duration >= 0.5);
});

test('Placement is no longer clamped to 24 hours on 7-day timelines (CC-3, V1.0.0)', () => {
  const { core } = loadClient();
  const clips = [{ id: 'a', kind: 'bed', track: 'music', start: 25 * 3600, duration: 5, sourceIn: 0, sourceDuration: 5 }];
  const start = core.findFreeStart(clips, 25 * 3600 + 10, 5);
  assert.ok(start > 24 * 3600 + 10, 'a free 25 h+ position is preserved, got ' + start);
  const placed = core.placeMovedClip(clips, 'a', 26 * 3600, 26 * 3600);
  assert.equal(placed[0].start, 26 * 3600);
});
