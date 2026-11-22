# Changelog

## 1.0.0 — 2026-11-22

First stable release: the V0.9.6 review's P1–P3 defects are fixed and covered by regression tests.
No P0 was found; the changes are behavioural only, with no data-format or manifest break.
Plugin version is `1.0.0`.

### Backup safety (P1/P2)

- **Restoring a backup can no longer destroy the current project.** The restore now aborts with a
  localized error before touching any state when the pre-restore safety snapshot cannot be written
  (quota, oversized document), instead of overwriting the project document and reporting success.
  The confirmation text says so explicitly.
- The pre-restore safety snapshot enforces the documented 1 MiB per-document cap.
- Backups now have a total storage budget (2 MiB) and the 50-bucket cap is enforced after every
  successful write, not only after a quota failure. When a project document save fails on quota, the
  workbench evicts backups and retries once so project data always wins; the Projects menu gains a
  confirmed **Clear all backups** action.
- Restore stays reversible: minute backups compare against every retained snapshot, so the timer no
  longer appends a duplicate of the restored content and buries the pre-restore state. Restore also
  deletes media blobs only when neither the restored document nor any retained backup snapshot references them (keeping the pre-restore snapshot's media alive for the undo path).
- Projects over 1 MiB are reported in the Projects menu and with a one-time toast instead of silently
  never being backed up; a failed backup-preference write is surfaced instead of reverting silently.
- Restoring from the asset-preview state now returns the workbench to the timeline.

### Projects and persistence (P2/P3)

- Legacy session-scoped projects are adopted even when the Session is switched inside the
  already-active Workspace (the fast path previously skipped adoption, making projects look lost).
- Deleting the active project inside its autosave window uses the in-memory document for the media
  cascade, so the newest blobs are no longer orphaned.
- Session-media auto-import re-checks the project epoch after the async decode/import, so a project
  switch mid-import cannot write an asset into the new project or import it twice.
- Inbox consumption deletes staged export records only after the assets are committed to the active
  project; an interrupted consumption keeps the finished exports for the next consumer.
- `chooseProjectForScope` rolls the in-memory index back when its persistence write fails.
- Clip invariant fixes: trim-start can reach 0, reloaded/imported clips keep the 0.5 s minimum on
  every lane, and placement uses the 7-day timeline limit instead of a hard-coded 24 hours.

### Host and Session media (P3)

- Long (or long-CJK) conversation file names keep their full leaf name in attachment-provider refs,
  so legal long names import instead of resetting the connection; display names stay truncated.
- Re-presenting or rewriting a delivered file replaces its previous `/session-media` entry instead of
  listing the same path twice with stale bytes, and stale deliverable records are pruned.
- `/deepseek-design/session-media` is paginated (`offset` + `nextOffset`); the browser half pages
  through it, so Sessions with more than 500 media items no longer silently hide older exports.
- Provider failures before headers are sent answer a normal 404 and destroy any opened stream.
- The Host metadata description no longer claims the plugin package ships smoke tests.

### Workbench UI/UX and accessibility (P3)

- The workbench overlay is a real modal dialog: `role="dialog"`, `aria-modal`, an inert/hidden
  backdrop app, a Tab trap, Escape that still works after focus escapes, and focus returned to the
  invoking control on close.
- Below 780 px the conversation column becomes a right-side drawer opened from the Conversation
  action (backdrop/Escape close it) instead of being clipped into an implicit grid row.
- Conversation-file drags over the chat column always `preventDefault()`, so a native-composer
  rejection cannot navigate the SPA to the file/blob URL.
- Asset-preview volume now reaches the `<video>`/`<audio>` element (previously a dead control);
  dismissing a popover with Escape no longer clears the asset multi-selection.
- Timeline: ruler scrubbing only seeks during a ruler gesture (clip drags no longer move the
  playhead), splitting is disabled during asset preview, "+ Add music" uses the visible position, and
  the drag ghost previews the actual track-reorder result.
- Export: the summary and download filename use the project name, a zero-chunk recording is rejected
  instead of producing a 0-byte file, frame rendering awaits video seeks and pauses the previous
  decoder, and a Host-reported tool error is no longer overwritten by a late abort rejection.
- Leaving the launcher's main panel closes the overlay instead of leaving it mounted.

### Verification and release

- Node suite: **140 tests, 0 failures** (adds regression tests for every fix above).
- Real-Chrome export-worker smoke: **38 PASS / 0 FAIL**.
- Real-GUI UI smoke: **24 PASS / 0 FAIL** (adds modal-semantics and backup-menu checks).
- Independent review of the V1.0.0 change set, with a release record under `review/100/`.
- Install note: the plugin is installed from a profile-local tarball built from this source; strip
  macOS extended attributes before packing a local tarball (`xattr -cr`), otherwise AppleDouble
  `._*` files can hide Plugin Manager display metadata.

## 0.9.6 — 2026-11-09

### Preview

- **Fixed:** maximizing the preview ("展开预览 / Expand preview") could render a blank stage. In the
  focus layout the conversation column kept `grid-area: chat`, which does not exist in the
  single-area focus grid, so it was auto-placed into an implicit row that collapsed the preview row
  below the 20 px measurement threshold and the workbench hid the frame. The conversation column is
  now hidden while the preview is maximized, so the stage fills the window and the frame stays
  visible; collapsing restores the column.

### Projects (workspace-only)

- Project management is now **Workspace-only**: the Session scope option and its selector were
  removed. Every Session in the same Harness Workspace shares the project list, as before for the
  Workspace mode.
- Legacy projects saved under the removed per-Session scope are **adopted into the resolved
  Workspace** as soon as their Session is activated (a project created while the Workspace path was
  unresolved goes through the existing `workspace:unresolved:` adoption path). No project data is
  deleted; projects of Sessions that are never opened stay in storage untouched.
- The project index is always read and written as Workspace mode; a legacy `scopeMode: "session"`
  index is migrated on read.

### Backups (new)

- **Per-minute project backup**: while enabled, the active project is snapshotted into localStorage
  every 60 seconds (last 5 snapshots per project, deduplicated, capped at 1 MiB per document).
  Backups are local-only, keep the project document shape only (media stays in IndexedDB by blob id),
  and are removed with their project.
- **Projects menu**: a toggle turns the minute backup on/off (default on, persisted in
  `deepseek-design.settings.v1`), the menu shows the last backup time, and
  **Restore latest backup** (with confirmation) restores the newest snapshot while keeping the
  pre-restore state as a backup.
- Storage-quota failures degrade gracefully: old backup buckets are pruned, a failure toast is
  shown, and the workbench keeps working.

### Verification and release

- Node suite **116 tests / 116 pass** (scope migration, backup timer/retention/restore/quota/pruning, focus
  layout and menu contracts included).
- Real-Chrome export-worker smoke **38/38**; real-GUI UI smoke **22/22** (adds maximized-preview
  layout and workspace-only/backup-menu checks over CDP).
- Plugin version is `0.9.6`.

### Review fixes carried into this release (from the 0.9.5 audit)

The P2 fixes and the dead-code removal from the 0.9.5 audit were never released on their own; they
ship in 0.9.6. Full audit and evidence: `review/095/REVIEW-0.9.5.md`.

#### Fixed (P2, each with a regression test)

- **Workspace scope inheritance**: switching to a Session whose `cwd` is unresolved no longer reuses
  the previous Session's Workspace scope. The 1.8 s fallback goes to the documented
  `workspace:unresolved:<sessionId>` scope, and a later cwd resolution still adopts the project in
  place.
- **Non-Latin-1 / control-character media names**: `Content-Disposition` is now ASCII-safe with an
  RFC 5987 `filename*` parameter, so Chinese-named deliverables, attachments, and conversation
  objects are served instead of answering 404 (which also removes the related stream-leak trigger).
- **Paused timeline-video preview**: the layer retries its seek when `loadedmetadata`/`canplay`
  arrives, so a paused preview shows the correct frame instead of the clip's first frame.
- **Export cancel→retry**: each run owns a per-run token; cancelling invalidates the stale run, so a
  retry can no longer be resumed by it (no duplicate downloads/library assets, no truncated file).

#### Removed

- Dead legacy chat UI and helpers (`ChatPanel`, `ChatMessage`, `SkillMenu`, `DraftCard` and their
  stylesheet), zero-reference `Workbench` locals, 44 unused locale keys, 5 unused icons, dead CSS
  rules, and dead renderer code — **937 lines** in total (including the post-verification CSS
  residue cleanup). `ModelMenu` and the project-data compatibility paths are intentionally retained;
  see `review/095/safe-deletions.md` for the reviewed recipe.

#### Tests

- Node suite grew from 98 to 103 with the 0.9.5 follow-up regressions; V0.9.6 adds the scope
  migration, backup and layout contracts for a total of **116**.

## 0.9.0 — 2026-11-07

### Workbench chrome

- Preview top and bottom bars are now 42px, matching the compact conversation header; the asset import footer uses the same height and a full-width top rule.
- The top-right actions are four equal “icon + text” buttons in the order **Conversation / Export / Projects / Close**. Project management moved out of the project-name area to the action group.
- The workbench overlay starts at the top of the window: the 48px grey strip is gone. On macOS windowed mode, top-bar content starts 88px from the left so it clears the traffic lights; fullscreen returns to the normal 16px left inset. The top bar is draggable.
- The fixed palette, borders, text colours, and blue accent are aligned to the Harness dark theme.

### Preview and assets

- The preview frame has no border or radius and fills the stage on one axis without padding.
- The project aspect follows the first video added to the timeline once. Later videos do not override it; manually choosing an aspect also locks it.
- Every asset card and generated asset card supports right-click deletion. Deleting an asset or generation that is still on the timeline confirms first, then removes the referenced clips in the same step. Delete remains irreversible.
- The export dialog backdrop is now blur-only; its surface is a solid Harness layer instead of a tinted glass panel.

### Conversation media and audio

- The asset library auto-imports images, videos, and audio that appear as attachment/file content blocks in the current Session conversation (assistant and tool messages). Imported assets are deduplicated by attachment id and stay deleted after a user removes them.
- Auto-import fills the library only; it does not place media on the timeline.
- Imported videos with an embedded audio track are detected and play through a derived audio lane aligned to the video clip. The lane follows video moves, trims, splits, and deletions; preview playback and timeline export mix that audio. Silent videos are unchanged.
- Audio probing is limited to videos up to 300 MiB to avoid excessive memory use; larger videos still import as silent video.

### Release

- Plugin version is `0.9.0`.

## 0.9.1 — 2026-11-07

### Workbench

- The green “Saved” status moved out of the project-name row to the left of the **Conversation** top-bar action.
- The asset library supports multi-selection: click to select, Cmd/Ctrl-click to toggle, Shift-click for a range, **Select all** in the library header or Cmd/Ctrl+A, and drag a marquee over empty gallery space to box-select. Delete/Backspace or the header trash button deletes the selection (with one confirmation and cascade through timeline clips).

### Auto-import

- Auto-import is narrowed to **explicitly exported video/audio files**: tool results from `present` or `*export*` tools only. Images, intermediate renders, screenshots, read-only tool echoes, and user-supplied files are no longer imported.
- The V0.9.1 migration removes earlier auto-imported artifacts and records their origin keys as skipped.

### Release

- Plugin version is `0.9.1`.

## 0.9.2 — 2026-11-07

### Projects

- Project storage is now scoped by **Workspace** or **Session**, selectable in the Projects menu. Workspace scope shares projects across Sessions in the same Harness Workspace; Session scope isolates each Session.
- Added multi-project management: project list, new project, switch, rename via the top bar, delete, import as a new project, export, and per-scope active-project restore.
- The existing global V0.9.1 project is migrated once into the current Workspace scope; the legacy key is removed only after a successful write.
- Importing a project file no longer replaces the current project; it creates a new project and keeps the current project and its media intact.
- Inbox animation records carry their Session and Workspace, so cross-scope projects do not consume each other’s exports. New and switched-away projects use an `autoImportSince` baseline to avoid historical conversation-media floods.
- UI labels: the right column is now **当前会话 / Current conversation**; the native Conversation header shortcut is **DeepSeek Design**.

### Verification

- Project migration, scope sharing/isolation, multi-project lifecycle, import-as-new, reload persistence, and inbox scope matching are covered by unit tests.
- Renderer review confirms the animation worker is packaged with the plugin; timeline video and WebAudio audio rendering remain in `client.js` and do not depend on the workspace or ffmpeg.

### Release

- Plugin version is `0.9.2`.

## 0.9.3 — 2026-11-08

### Drag and drop

- Asset cards can be dragged directly into the native conversation column. The plugin converts the IndexedDB asset to a browser File and dispatches it through the native composer drop path, so native attachment validation, upload, and removal still apply.
- Conversation file cards, pending composer attachments, and delivered-file cards can be dragged directly into the asset library. File cards resolve their attachment id from the native message tree; delivered cards use their recorded path. The Host streams only validated Session attachments or an uploaded pending-composer attachment ref.
- Conversation file cards and pending composer attachments can also be dropped directly onto a timeline lane; the plugin imports the file once into the project library and places it on the correct track.
- Native image gallery drags are accepted through the `fileDrag` service token.
- Host routes for conversation objects and delivered paths only serve files that appear in the current Session event log; arbitrary paths are rejected.

### Timeline placement

- A new video or audio file dropped anywhere on a blank timeline is anchored at 0, the far left, instead of the pointer position.
- A video asset with an audio stream fills both the video track and the linked audio lane by default; the toast reports that both were added. Audio-only files dropped on any lane go to the audio track.

### Project delivery

- A finished timeline export is automatically added to the active project's asset library, with its duration, dimensions, MIME type, and a poster, in addition to downloading the file.
- The exported asset is labelled **项目成片 / Project export** and is saved to the current project automatically.

### Release

- Plugin version is `0.9.3`.
## 0.9.4 — 2026-11-08

Review release: a full code/UX review of V0.9.3. Version bumped to 0.9.4 because the fixes below are behavioural.

### Persistence and projects

- An edit that empties a saved project (deleting the last clip, undoing back to empty) now flushes the empty state, so deleted timeline content no longer comes back after a refresh and the UI stops claiming “Saved” for stale data.
- Deleting one project no longer drops another project's pending autosave within the 420 ms autosave window.
- Imported project files and the one-time legacy migration now start with an `autoImportSince` baseline instead of `0`, so historical Session exports can no longer flood a fresh project.
- A manually chosen aspect on a project with no media yet is persisted, survives a reload, and is kept when switching to another project and back.
- The `MAX_ASSETS` library cap is enforced when importing files and when adding a finished export to the library, so a reload can no longer truncate the oldest assets and drop their timeline clips.
- Videos shorter than 0.5 s (and exactly 0.5 s) can now be placed on the timeline; a 0-duration asset is still rejected.
- Importing a project file no longer turns a truncated/empty embedded media payload into a “healthy” 0-byte asset, and assets removed by the >10,000-asset cap are counted as omitted.
- A split or trim-start score clip now restores its offset inside the generated bed on reload (it previously shifted by up to several seconds and played the wrong segment).
- A corrupt or unknown-version project index is copied to `deepseek-design.projects.v2.backup` before a new index can overwrite it.

### Animation export (`deepseek_design_export_video`)

- Recording now starts when the Worker reports it is ready, not before: generated videos no longer begin with a blank lead-in, and a Worker that fails before its first frame can no longer leave the card hanging.
- The Worker resets the 2D context state before every frame (`save` → `reset` → identity transform → `clearRect`), so a `draw()` that leaves a transform or clip behind can no longer leak pixels between frames.
- Whitespace-only `code` is rejected by the card validator, and `"4K"` is accepted as 4K instead of silently downgrading to 1080p.
- A Worker that finishes without ever starting the recorder now reports an error instead of staging a 0-byte asset.
- Closing the workbench no longer cancels an in-flight animation render that the embedded conversation card owns; the shared job finishes and lands in the asset library.
- The Worker sandbox additionally blocks same-origin storage (`indexedDB`, `caches`, `navigator`/OPFS), closes the worker-global prototype escape for blocked globals, and captures `postMessage` so model code cannot silence the frame protocol. Message shapes and the CSP are unchanged.

### Timeline export

- Primed `<video>` elements are kept alive across gap and legacy-scene frames, so exported clips no longer start with black frames after a gap.
- Cancelling (or failing) an export while video elements are being primed now releases those elements instead of retaining decoded frames until the next export.

### Drag, drop, and keyboard

- Pending composer attachments (local `File`, no attachment id) can now be dropped into the asset library or onto a timeline lane, as documented for 0.9.3. Draft imports are de-duplicated by name, size, and last-modified time.
- Escape while dragging a timeline marquee cancels the selection instead of closing the whole workbench.
- Delete/Backspace typed while the embedded conversation column has focus no longer deletes the selected timeline clip.
- Cmd/Ctrl+A now works from anywhere in the workbench, not only when focus is inside the asset library.
- The “Added to conversation attachments” toast is shown only after the native composer actually accepted the file (file and image attachments).
- Asset-preview volume and mute controls now affect the previewed video/audio instead of only timeline playback.
- Asset deletion releases decoded `AudioBuffer`s, and the “estimated file exceeds …” warning now matches the 4 GB export limit.

### Host and Session media

- `/deepseek-design/session-media` and `/session-deliverable` now refresh when the Session log advances, so exports and presented files created *after* the workbench opened appear in the library (previously they never did until the plugin reloaded).
- Delivered-file responses take `Content-Length` from the opened file instead of a cached stat, and `HEAD` no longer leaks a file descriptor; this fixes corrupted responses when a file is re-exported in place.
- Session image attachments pass the full image reference (`mediaType`/`bytes`/`width`/`height`) to the attachment provider, so image bytes are served by providers without a host-path fallback.
- 400/404/405 responses consistently set `x-content-type-options: nosniff`.

### Verification and release

- Node suite grew from 59 to the final count below and now includes behavioural regression tests for the fixes above.
- Added `scripts/browser-smoke.mjs`, a dependency-free real-Chrome (CDP) smoke test for the export Worker: start/frame/done protocol, real `ImageBitmap` pixels, frame pacing, error stages, blocked globals, cancel, and MediaRecorder support.
- Added `scripts/package-release.mjs`, which re-runs syntax checks and the Node suite, validates version/locale/README/CHANGELOG consistency, and builds a checksummed release ZIP.
- `npm`-style package metadata, locale titles, and documentation are aligned at 0.9.4.

### Known limits (unchanged)

- Reordering a track by dragging its earliest clip rightwards still re-lays the track from the earliest remaining clip, which can add a leading gap; this is documented behaviour, not a regression.
- An unresolved Workspace path can still leave an orphan project entry for a Session whose `cwd` arrives later.
- Session media routes remain unauthenticated by DSH design (`sessionId` trusted, same-origin GUI only); `/session-object` still serves a pending-composer attachment id when the caller knows it; `/session-deliverable` serves paths recorded by `present`.
- `self.onmessage` in the export Worker is still replaceable by model code (the Client only terminates the Worker, so there is no product impact today).
- Generated animation videos remain silent by design; imported external videos keep their derived audio lane.

## 0.9.5 — 2026-11-08

Follow-up release for the residual items recorded after the V0.9.3/V0.9.4 review.

### Project persistence

- A manually chosen aspect now also survives the remaining empty-project paths: deleting the last
  library asset or clearing the project name keeps an aspect-only project document instead of
  dropping it. Projects without a locked aspect still remove the stale document when emptied, so
  deleted content never resurrects.
- A project created under the synthetic `workspace:unresolved:<sessionId>` fallback (the session's
  Workspace path was still loading) is now adopted into the real Workspace scope as soon as the path
  resolves — including while the same Session stays open, because the sessions-list watch is kept
  alive after the 1.8 s fallback. It stays visible in the Projects menu, is switchable normally, its
  content is preserved, and blank fallback entries are removed instead of silently occupying the
  project index.

### Timeline

- Dragging a track's earliest clip over another clip now reorders the track in place, anchored at
  the track's original start: the whole track is no longer pushed right with a leading gap and a
  longer total duration. Free moves and non-earliest reorders are unchanged, and intentional leading
  gaps (a track whose first clip starts later than 0) are preserved.
- Dropping a video that is shorter than the 0.5 s minimum clip length now shows a localized toast
  explaining that the clip was placed at the minimum length and that its tail holds the last frame
  (previously the clip silently froze at the end with no explanation).

### Verification and release

- Added the real-browser UI smoke test (repo `scripts/ui-smoke.mjs`): it boots an isolated real
  DeepSeek Harness Web instance and drives the real workbench over CDP — workbench open/close, asset
  import, timeline placement (empty-timeline anchoring), marquee selection, delete/undo, Escape
  handling, playback with a running AudioContext and real audio sources, and the export dialog — in
  addition to the existing export-worker smoke test.
- Verification for this release: Node regression suite 98/98 pass, real-Chrome export-worker smoke
  38/38 pass, real-GUI UI smoke 18/18 pass.
- Plugin version is `0.9.5`.
