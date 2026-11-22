# DeepSeekDesign

A dark code-animation workbench for the DeepSeek Harness Web GUI. The workbench opens as a full-main overlay and keeps a **compact, fully native Harness Conversation in its right column**: the same chat stream, composer, model selector, reasoning controls, Skills, permissions, tool cards, and model context as the normal Harness Conversation, just narrower. Beyond that embedded conversation, the only extra model capability is the global tool `deepseek_design_export_video`, which turns model-authored canvas animation code into a real video file in the workbench asset library.

The workbench starts blank: no sample media, generated results, or timeline clips. The sidebar and Plugin Manager share the bundled DeepSeekDesign icon.

**V1.0.0** is the first stable release. It fixes every P1–P3 defect from the V0.9.6 review: backup restore can no longer overwrite the current project when its safety snapshot fails, backups have a bounded storage budget with a **Clear all backups** action and proactive bucket retention, restore stays reversible and cascades media cleanup, legacy session projects are adopted on every activation path, Session-media imports are epoch-safe, long filenames and re-presented deliverables are handled correctly, `/session-media` is paginated, and the overlay/timeline/preview/export interactions gained the documented accessibility and correctness fixes. See the [changelog](./CHANGELOG.md) for details.

## What it does

- **Conversation**: the right column is the native Harness Conversation rendered through the conversation Component Factory. It is the same session and the same model interaction, not a second chat implementation. The workbench no longer owns a custom ChatPanel, model selector, or generation bridge.
- **Export**: when asked for a video in that conversation, the model calls `deepseek_design_export_video` with a title, duration, aspect/resolution/FPS, and JavaScript that defines `function draw(ctx, t, width, height)`. The tool card renders it in a same-origin sandboxed Worker and records it with MediaRecorder.
- **Asset library**: exported videos are stored in IndexedDB and marked “From conversation”. The library also imports audio and video that a user-facing export action explicitly produces (`present` or an `*export*` tool); images, intermediate renders, and read-only tool echoes are ignored. Imported media is not auto-placed on the timeline. Drag any asset card into the native chat to attach it to the draft; drag a conversation file card, a pending composer attachment, or a delivered file card into the library to import it, or directly onto a timeline lane to import and place it.
- **Timeline**: drag a video or audio asset onto any lane. The first clip added to an empty timeline is anchored at 0; a video with audio fills the video track and the linked audio lane automatically. The timeline supports trim, split, move, undo/redo, playhead sync, native video preview, and export. Dragging a track's earliest clip over another clip reorders the track in place (0.9.5) instead of shifting the whole track right; a video shorter than the 0.5 s minimum clip length is placed at the minimum and a toast explains that the tail holds the last frame. Legacy scene-generation clips still load and render.
- **Video audio**: a video with an embedded audio track gets a derived audio lane aligned to its video clip; the lane follows moves/trims/splits/deletes and is mixed into preview and export. Silent videos are unchanged.
- **Selection**: box-select clips across tracks, then Delete/Backspace or the toolbar removes the selection in one undoable edit.
- **Selection and deletion**: click to select, Cmd/Ctrl-click to toggle, Shift-click for a range, **Select all** in the header or Cmd/Ctrl+A (works anywhere in the workbench), and drag a marquee over empty gallery space to box-select. Delete/Backspace or the header trash button deletes the selection; referenced timeline clips are removed in the same confirmed step. Right-click deletion is also available. Escape cancels a marquee without closing the workbench.
- **Preview**: the frame follows the first video added to the timeline once, has no border, and fills the stage on one axis. **Expand preview** (top-right of the preview bar) maximizes the preview: the asset library, timeline, and conversation column are hidden so the stage fills the window; **Collapse preview** restores the normal layout.
- **Workbench export**: export the timeline to MP4/WebM with the chosen resolution, FPS, quality, and aspect ratio. The finished delivery video is downloaded and automatically added to the asset library.
- **Projects**: the **Projects** menu manages multiple projects per **Harness Workspace**; every Session in the same Workspace shares the list. Create, switch, rename (top-bar name field), delete, import as a new project, and export the current project. Legacy projects saved under the removed Session scope are adopted into the Workspace when that Session is opened again.
- **Backups**: the Projects menu has a **minute-backup** toggle (on by default) that snapshots the active project into localStorage every 60 seconds (last 5 snapshots, deduplicated), shows the last backup time, and offers **Restore latest backup**, **Clear all backups**, and a notice when a project is too large to back up. A restore first stores the current content as a safety snapshot and is cancelled before overwriting anything if that copy cannot be stored; the pre-restore state stays reachable after the next timer tick, and media blobs are deleted only when neither the restored document nor a retained backup snapshot references them.
- **Workbench chrome**: the saved status sits immediately left of **Conversation**; the remaining top-right actions are equal icon+text buttons (Conversation, Export, Projects, Close). The right column is labelled **Current conversation**; the native Conversation header shortcut is labelled **DeepSeekDesign**. On macOS the top bar clears the traffic lights in windowed mode and returns to the left edge in fullscreen. The palette follows the Harness dark theme.

## Open and close

- Click **DeepSeekDesign** in the left sidebar, or **DeepSeekDesign** in the native Conversation header.
- The workbench opens over the app content as a focused overlay. Close it with the topbar **Close** button or Escape; closing returns to that same native Conversation.
- The embedded right-column conversation stays bound to the current Session. Its compact header reads **当前会话 / Current conversation**. Closing the workbench returns to that same native Conversation.
- The right-column chat is the native Harness Conversation; the workbench never starts a second chat or a second model context.

## Drag and drop

- **Asset library → conversation**: drag an image, video, or audio asset card over the right conversation column and release. The plugin builds a browser File from the IndexedDB blob and hands it to the native composer's drop path; native attachment validation and upload still apply.
- **Conversation → timeline or asset library**: drag a user-message file card, a pending composer attachment, or a delivered-file card directly onto a timeline lane, or into the asset library. File cards resolve their attachment id through the native message tree; pending composer attachments are imported straight from the local `File`; delivered cards use the recorded path. The Host only serves attachments or delivered paths that appear in the current Session's event log, plus the uploaded attachment id of a pending composer file.
- **Live Session updates**: while the workbench is open, new explicit conversation exports and newly presented files are discovered on the next poll once the Session log advances; no reload is needed.
- **Empty timeline anchor**: the first video or audio dropped on an empty timeline starts at 0, regardless of the pointer position; a video with audio also creates its linked audio lane at 0.
- **Native image gallery → asset library**: the native `ui-file-drag` token is read through the plugin's `fileDrag` service; a dragged image becomes a normal asset.
- Dropping a file into the library stops propagation so the native composer does not also attach it.

## Export tool contract

```text
deepseek_design_export_video({
  title: string,
  duration: 1..600 seconds,
  code: string (max 2,000,000 characters),
  aspect?: "16:9" | "2.39:1" | "21:9" | "4:3" | "1:1" | "3:4" | "4:5" | "9:16",
  resolution?: "1080p" | "4k",
  fps?: 24 | 30 | 60
})
```

- `code` must define `function draw(ctx, t, width, height)`, use only the supplied Canvas 2D context, and must not fetch or create external resources.
- The Host validates and returns a queued receipt; the browser tool card owns rendering, progress, cancellation, asset storage, and the export record.
- Defaults: 16:9, 1080p, 30fps. 4K is limited to 24/30fps.
- A shared per-call job store makes the card idempotent even when the same tool call is rendered in both the native conversation and the workbench’s embedded conversation. Unmounting one card (for example by closing the workbench) does not cancel a render owned by the shared job.
- The Worker resets the 2D context state before every frame, so a `draw()` that leaves a transform or clip behind cannot leak pixels into the next frame.
- `MediaRecorder` starts only when the Worker reports it is ready, so generated files do not begin with a blank lead-in.

## Sandbox and limits

- Model code runs only inside the fixed, same-origin `export-worker.js` Worker, not in the page main thread.
- The Worker has no DOM or filesystem access; `fetch`, XHR, WebSocket, EventSource, and `importScripts` are disabled, together with same-origin storage (`indexedDB`, `caches`, `navigator.storage`/OPFS). Blocked globals cannot be reached through the worker-global prototype either, and the Worker captures `postMessage` before running model code so a `draw()` cannot silence the frame/error protocol. The Worker response sets a restrictive CSP; the parent can terminate a timed-out or cancelled render.
- Limits: 600 seconds, 2,000,000 code characters, 4K on the long edge, real-time recording, 4GiB per rendered asset, duration + 10 minutes render timeout. Browser MediaRecorder/Blob/IndexedDB quota is the final limit and failures are reported on the card.
- This is not an external text-to-video integration: the model authors canvas code and the workbench records it locally.

## Projects and persistence

- Local projects save automatically, including an edit that empties a saved project (deleting the last clip or undoing back to empty removes the stale project document instead of resurrecting it on reload). The project index is `deepseek-design.projects.v2`; each project body is `deepseek-design.project.v2.<id>`; media stays in `deepseek-design-media` IndexedDB (`media`, `inbox`, `exports`). An unreadable or unknown-version project index is copied to `deepseek-design.projects.v2.backup` before it can be replaced.
- Projects are keyed by the current Session's normalized Harness Workspace path (`cwd`), so every Session in that Workspace shares the project list and the active project restores across reloads. The per-Session scope mode was removed in 0.9.6; legacy `session:<id>` projects are adopted into their Workspace whenever their Session is activated, including when another Session of the same Workspace was already active.
- **Minute backups** are stored under `deepseek-design.backup.v1.<projectId>` (at most five snapshots, 1 MiB per document, at most 50 project buckets, 2 MiB total backup budget enforced after every write); the on/off preference is stored in `deepseek-design.settings.v1`. Media bytes stay in IndexedDB and are referenced by blob id, so a backup is a project-document snapshot rather than a media copy. If a project document cannot be saved because backups filled the quota, the workbench evicts backups and retries once so project data wins.
- The first V0.9.2 open migrates the existing global `deepseek-design.project.v1` project into the current Workspace scope once; the legacy key is removed only after the new project body and index are written.
- Each project owns its media blob ids. Importing a project file creates a new project with fresh media keys; the current project is not replaced and its media is not deleted.
- Project files include project metadata, assets, timeline, and legacy generation data. Generated video assets are embedded under a 1GiB source-media budget; imports validate before any media writes. The format remains version 1 with optional new asset fields.
- Animation exports are tagged with their Session and Workspace in the inbox, so an asset exported in one scope is not consumed by another scope's project.
- Auto-import is project-local: a newly created, imported, legacy-migrated, or switched-away project records an `autoImportSince` baseline so older conversation exports do not flood it.

## Renderer review

- The animation renderer is packaged in `export-worker.js` and served from the plugin, not from the workspace or an external renderer.
- Timeline video preview uses native `<video>` elements plus the Canvas scene renderer; timeline export draws both through `renderExportFrame` and records with MediaRecorder.
- Audio is browser WebAudio in `client.js` (decode, waveform, scheduling, `MediaStreamDestination`); there is no separate audio-renderer file or ffmpeg dependency.
- `scripts/browser-smoke.mjs` (repository root) is a real-Chrome smoke test of the packaged worker: start/frame/done protocol, real `ImageBitmap` pixels, frame pacing, error stages, blocked globals, cancellation, and MediaRecorder capabilities. Generated animation videos remain silent by design.
- `scripts/ui-smoke.mjs` (repository root) boots an isolated real DeepSeek Harness Web instance in headless Chrome and drives the real workbench over CDP: open, asset import, timeline placement, maximized-preview layout, workspace-only Projects menu plus the minute-backup toggle, marquee select/Delete/undo, Escape handling, playback with a running AudioContext, and the export modal. OS-level drags, model conversation, the actual timeline download, and cross-browser support remain manual acceptance items.

## Known limits

- Generated animation videos are silent because the export tool records canvas frames only. Imported external videos can carry audio and get the derived audio lane.
- The browser must support Worker, OffscreenCanvas, ImageBitmap, MediaRecorder, and canvas capture. If one is unavailable, the card reports it and does not run code on the page thread.
- Long/4K renders can exhaust browser memory or IndexedDB quota; the card reports failure and leaves no claimed asset.
- The embedded right column uses the native conversation body and composer; it intentionally omits the native Conversation header/title row. Use the app header or close the workbench for session-level controls.
- The page-level CSP must allow the same-origin Worker. The Worker response CSP itself is restrictive and tested.
- Multi-tab project state remains last-write-wins for localStorage; generated export staging merges on the next workbench open.
- A track reorder lays the clips out contiguously from the track's original start: dragging the earliest clip over a later clip reorders in place, while intentional leading gaps (a track that starts later than 0) are preserved.
- If a Session's Workspace path is still unresolved after the 1.8 s fallback, a project can be created under a synthetic `workspace:unresolved:<session>` scope; it is adopted into the real Workspace scope as soon as the path resolves (even while the Session stays open, via the retained sessions-list watch), so it stays visible and deletable.
- Session media routes are same-origin and trust `sessionId` (DSH `session-query` has no caller authorization by design); `/session-object` can serve a pending-composer attachment id when it is known, and `/session-deliverable` streams paths recorded by `present`.
- The export Worker's `self.onmessage` is still replaceable by model code; the Client only terminates the Worker, so this has no product impact today.
- Auto-import covers only explicit `present`/`*export*` video/audio files. A file written directly to the working directory, an image, or an intermediate render is not imported.
- Audio probing is skipped above 300 MiB; larger videos import as silent video.
- Minute backups are local-only (browser localStorage): they do not protect against clearing site data, and they contain the project document rather than media bytes. Projects from other Workspaces are not copied; export/import remains the transfer path. Backups are bounded (2 MiB total, 50 buckets, five snapshots per project) and the oldest snapshots/buckets are evicted first. Media referenced by a retained snapshot stays in IndexedDB; blobs are only deleted when a restore can prove no retained snapshot references them (there is no background garbage collector after snapshot eviction).
- Below 780 px window width the native conversation column is a right-side drawer opened from the **Conversation** action; on wider layouts it stays docked.
- A Workspace is keyed by its normalized path. Moving or renaming that folder is treated as a new workspace.

## Files

- `index.js` — Host: global export tool, static Worker route, and Session attachment media routes.
- `export-worker.js` — fixed sandboxed animation frame worker.
- `client.js` — sidebar entry, workbench overlay, embedded native Conversation column, export tool view, asset library, timeline, preview, and export.
- `locale/` — Plugin Manager metadata.
- `icon.png` — DeepSeekDesign icon.
- `CHANGELOG.md` — release notes; current release is 1.0.0. Tests, the real-browser UI/worker smoke tests, and the release packager live in the repository root (`tests/`, `scripts/`).
