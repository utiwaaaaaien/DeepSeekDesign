# Test suite

Run from the workspace root:

```bash
node --test tests/*.test.mjs
```

No external packages are required. The suite covers:

- `manifest.test.mjs`: manifest/client inject list, icon bytes/dimensions, locale metadata, worker file packaging, and stale-resource checks.
- `host.test.mjs`: global export tool registration/schema/limits/queued receipt, worker route GET/HEAD/405 headers and body, explicit-export-only Session attachment listing/bytes routes, conversation object/delivered-file routes, old bridge removal, and the worker protocol with a fake Worker.
- `client-core.test.mjs`: pure helpers, blank state, autosave/rename, timeline operations, project export/import, raised media limits, video-asset clips, timeline multi-selection deletion, library multi-selection and cascade asset/generation deletion, first-video aspect locking, blank-timeline zero anchoring, linked video-audio streams, conversation-file timeline drops, V0.9.1 auto-import migration, legacy migration into scoped projects, Workspace/Session scope sharing and isolation, multi-project create/switch/delete, import-as-new, reload persistence, inbox scope matching, conversation drag payload parsing, the native export tool view, and legacy conversation/model data compatibility.
- `ui-contract.test.mjs`: no workbench-owned chat implementation, full-main workbench overlay, embedded native conversation factory/right column, export tool-view registration, sidebar app icon, saved-status/top-bar ordering, traffic-light clearance, 42px aligned bars, multi-select/select-all/box-select/cascade deletion, borderless preview, DSH-aligned fixed palette, blur-only export modal, explicit-export auto-import wiring, linked video-audio lane, Current conversation/DeepSeekDesign labels, project scope/list/create/delete controls, bidirectional drag/drop wiring including timeline conversation drops, video+audio track selection, blank-timeline anchoring, auto-imported delivery videos, and locale parity.

Real-browser smoke test (not part of `node --test`, requires Google Chrome):

```bash
node scripts/browser-smoke.mjs
```

`scripts/browser-smoke.mjs` serves a harness page plus the real `deepseek-design-plugin/export-worker.js` over HTTP and drives headless Chrome through the DevTools protocol (no npm dependencies). It verifies the ready/start handshake, per-frame ImageBitmap transfer and real decoded pixel output, per-frame clearing, frame pacing and count, start/eval/draw-stage error messages, disabled network globals, cancel and busy-guard behaviour, and probes `canvas.captureStream()` + `MediaRecorder` support. It prints PASS/FAIL/WARN lines and exits non-zero on failure (`DSH_CHROME_BIN`/`CHROME_BIN` overrides the Chrome path).

Browser-rendered layout, pointer drag/marquee, WebAudio playback, and full end-to-end file export still require a connected browser and must be accepted manually. The `scripts/browser-smoke.mjs` script covers the real Worker/ImageBitmap/MediaRecorder pipeline (including decoded pixels), but not the workbench UI or a persisted output file.
