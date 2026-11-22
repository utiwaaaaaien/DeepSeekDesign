import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = readFileSync(join(ROOT, 'deepseek-design-plugin', 'client.js'), 'utf8');
const ICON = readFileSync(join(ROOT, 'deepseek-design-plugin', 'icon.png'));

test('sidebar panel glyph uses the inlined DeepSeek Harness app icon', () => {
  const match = CLIENT.match(/const APP_ICON_DATA_URL = 'data:image\/png;base64,([A-Za-z0-9+/=]+)';/);
  assert.ok(match, 'sidebar icon data URL is missing');
  const bytes = Buffer.from(match[1], 'base64');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, createHash('sha256').update(ICON).digest('hex'), 'sidebar icon must be byte-identical to icon.png');

  const glyph = CLIENT.match(/function PanelGlyph[\s\S]*?\n    \}/);
  assert.ok(glyph, 'PanelGlyph is missing');
  assert.match(glyph[0], /h\('img',/);
  assert.match(glyph[0], /src: APP_ICON_DATA_URL/);
  assert.match(glyph[0], /alt: ''/);
  assert.doesNotMatch(glyph[0], /h\('rect'/);
});

test('workbench embeds the native conversation in its right column and opens from a full-main overlay', () => {
  assert.doesNotMatch(CLIENT, /h\(ChatPanel, \{/, 'the workbench must not render its own chat');
  assert.doesNotMatch(CLIENT, /sidebarRightTabs|sidebarRight\.openTab/, 'the rightbar chat experiment must not return');
  assert.match(CLIENT, /name: 'shell\.overlay'/);
  assert.match(CLIENT, /\[DESIGN_CHAT_SLOT\]: \{ kind: 'single', scope: 'session' \}/);
  assert.match(CLIENT, /renderFactorySlot\('conversation\.content'/);
  assert.match(CLIENT, /function WorkbenchOverlay/);
  assert.match(CLIENT, /createPortal\(frame, document\.body\)/);
  assert.match(CLIENT, /function DesignConversationPanel/);
  assert.match(CLIENT, /function WorkbenchLauncher/);
  assert.match(CLIENT, /cx\('dsd-chatpanel', 'dsd-panel'/);
  assert.match(CLIENT, /onCloseWorkbench/);
  assert.match(CLIENT, /layout\.selectPanel\(null\)/);
  assert.match(CLIENT, /name: 'tool\.call\.toolview'/);
  assert.match(CLIENT, /key: EXPORT_VIDEO_TOOL/);
  assert.match(CLIENT, /function ExportVideoToolRow/);
  assert.match(CLIENT, /new Worker\(EXPORT_WORKER_PATH\)/);
  assert.match(CLIENT, /\/deepseek-design\/export-worker\.js/);
  assert.match(CLIENT, /tool\.ready/);
  assert.match(CLIENT, /tool\.openWorkbench/);
  assert.match(CLIENT, /const exportJobs = new Map\(\)/);
  assert.match(CLIENT, /setExportJob\(jobKey/);
});

test('asset library uses the approved title, default dropdown, and no empty module', () => {
  assert.match(CLIENT, /'assets\.title': '素材库'/);
  assert.match(CLIENT, /'assets\.filter\.all': '全部文件'/);
  assert.match(CLIENT, /className: 'dsd-filterbtn'/);
  assert.match(CLIENT, /const \[filter, setFilter\] = useState\('all'\)/);
  assert.doesNotMatch(CLIENT, /dsd-empty-assets/);
  assert.doesNotMatch(CLIENT, /dsd-categories/);
  assert.doesNotMatch(CLIENT, /assets\.empty/);
});

test('workbench stays on a fixed dark palette aligned to the Harness theme', () => {
  assert.match(CLIENT, /--dsd-bg: #151517;/);
  assert.match(CLIENT, /--dsd-panel: #1b1b1c;/);
  assert.match(CLIENT, /--dsd-previewbar-bg: #232324;/);
  assert.match(CLIENT, /--dsd-text: #f9fafb;/);
  assert.match(CLIENT, /--dsd-blue: #5686fe;/);
  assert.match(CLIENT, /color-scheme: dark;/);
  assert.doesNotMatch(CLIENT, /var\(--dsw-[^)]+\)/);
  assert.doesNotMatch(CLIENT, /prefers-color-scheme/);
});

test('preview bars align with the conversation header at 42px and stay borderless', () => {
  assert.match(CLIENT, /--dsd-previewbar-h: 42px;/);
  assert.doesNotMatch(CLIENT, /\.dsd-projecttitle/, 'dead responsive project-title selector remains');
  assert.match(CLIENT, /useFocusReturn\(filterOpen, filterTriggerRef\)/);
  assert.match(CLIENT, /useFocusReturn\(projectMenuOpen, projectMenuTriggerRef\)/);
  assert.match(CLIENT, /\.dsd-chatpanelhead \{[^}]*height: var\(--dsd-previewbar-h\);/s);
  assert.match(CLIENT, /\.dsd-previewhead \{[^}]*height: var\(--dsd-previewbar-h\);[^}]*background: var\(--dsd-previewbar-bg\);/s);
  assert.match(CLIENT, /\.dsd-transportrow \{[^}]*height: var\(--dsd-previewbar-h\);[^}]*background: var\(--dsd-previewbar-bg\);/s);
  assert.doesNotMatch(CLIENT, /\.dsd-root\.dsd-focus \{ --dsd-previewbar-h: 56px; \}/);
  assert.match(CLIENT, /\.dsd-stage \{[\s\S]*?padding: 0;[\s\S]*?background: var\(--dsd-bg\);/);
  assert.match(CLIENT, /\.dsd-frame \{[^}]*border: 0;/s);
  assert.match(CLIENT, /frameFits\(stageSize\.width \|\| 800, stageSize\.height \|\| 450, aspectId, 0\)/);
});

test('maximized preview lays out the stage alone so its frame is visible', () => {
  // The focus grid only places "preview"; the conversation column must be
  // hidden too or it is auto-placed into an implicit row and collapses the
  // preview row to zero height (blank maximized preview).
  assert.match(CLIENT, /\.dsd-root\.dsd-focus \.dsd-main \{[^}]*grid-template-areas: "preview";/s);
  assert.match(CLIENT, /\.dsd-root\.dsd-focus \.dsd-assets,\s*\n\s*\.dsd-root\.dsd-focus \.dsd-timeline \{ display: none; \}/);
  assert.match(CLIENT, /\.dsd-root\.dsd-focus \.dsd-chatpanel \{ display: none; \}/);
  assert.match(CLIENT, /expanded && 'dsd-focus'/);
  assert.match(CLIENT, /setExpanded\(\(value\) => !value\)/);
});

test('project limits, asset deletion, video clips, and marquee selection are wired', () => {
  assert.match(CLIENT, /const MAX_PROJECT_IMPORT_BYTES = 1536 \* 1024 \* 1024;/);
  assert.match(CLIENT, /const MAX_ANIMATION_SECONDS = 600;/);
  assert.match(CLIENT, /const MAX_ANIMATION_CODE = 2_000_000;/);
  assert.match(CLIENT, /const MAX_VIDEO_BYTES = 4 \* 1024 \* 1024 \* 1024;/);
  assert.match(CLIENT, /project\.tooLarge/);
  assert.match(CLIENT, /embeddedChars > MAX_PROJECT_IMPORT_BYTES/);
  assert.match(CLIENT, /Number\(file\.size\) > MAX_PROJECT_IMPORT_BYTES/);
  const importStart = CLIENT.indexOf('async function importProjectFile');
  const stagedAt = CLIENT.indexOf('const staged = restoreProject', importStart);
  const mediaPutAt = CLIENT.indexOf('await mediaPut', importStart);
  assert.ok(importStart >= 0 && stagedAt > importStart && mediaPutAt > stagedAt, 'project validation must precede media writes');
  assert.match(CLIENT, /const blobId = uid\('media'\)/, 'imports must write import-scoped media keys');
  assert.match(CLIENT, /MAX_PROJECT_EXPORT_ENCODED_BYTES/);
  assert.match(CLIENT, /mediaDelete\(blobId\)/);
  assert.match(CLIENT, /withProjectLock/);
  assert.match(CLIENT, /projectOperationBusy/);
  assert.match(CLIENT, /PROJECT_INDEX_KEY = 'deepseek-design\.projects\.v2'/);
  assert.match(CLIENT, /PROJECT_DOC_PREFIX = 'deepseek-design\.project\.v2\.'/);
  assert.match(CLIENT, /function migrateLegacyProject/);
  assert.match(CLIENT, /function createProject/);
  assert.match(CLIENT, /function switchProject/);
  assert.match(CLIENT, /function deleteProject/);
  assert.doesNotMatch(CLIENT, /function setScopeMode/, 'the removable session scope API is gone');
  assert.match(CLIENT, /function adoptSessionProjects/, 'legacy session-scoped projects migrate on activation');
  assert.match(CLIENT, /projectScopeKey/);
  assert.match(CLIENT, /matchesInboxScope/);
  assert.match(CLIENT, /const liveById = new Map/);

  assert.match(CLIENT, /async function deleteAsset\(assetId, options = \{\}\)/);
  assert.match(CLIENT, /function removeEntries\(entries, options = \{\}\)/);
  assert.match(CLIENT, /clipsOfTimeline\(state\.timeline\)\.filter/);
  assert.match(CLIENT, /options\?\.force !== true/);
  assert.match(CLIENT, /className: 'dsd-asset-delete'/);
  assert.match(CLIENT, /const handleDeleteEntries = useCallback/);
  assert.match(CLIENT, /store\.deleteEntries\(refs, \{ force: true \}\)/);
  assert.match(CLIENT, /function deleteGeneration\(generationId, options = \{\}\)/);
  assert.match(CLIENT, /function deleteEntries\(entries, options = \{\}\)/);
  assert.match(CLIENT, /\.dsd-asset-cardwrap/);
  assert.match(CLIENT, /const openContextMenu = \(event, entry\) =>/);
  assert.match(CLIENT, /onContextMenu: \(event\) => openContextMenu\(event, entry\)/);
  assert.match(CLIENT, /className: 'dsd-contextmenu'/);
  assert.match(CLIENT, /assets\.deleteInUseConfirm/);
  assert.match(CLIENT, /function setAssetSelection\(refs, primary = null\)/);
  assert.match(CLIENT, /const \[marquee, setMarquee\] = useState\(null\)/);
  assert.match(CLIENT, /className: 'dsd-asset-marquee'/);
  assert.match(CLIENT, /data-entry-key/);
  assert.match(CLIENT, /assets\.deleteSelectionConfirm/);
  assert.match(CLIENT, /assets\.selectAll/);

  assert.match(CLIENT, /function addVideoAssetToTrack\(assetId, atStart/);
  assert.match(CLIENT, /kind: 'asset'/);
  assert.match(CLIENT, /function TimelineVideoLayer/);
  assert.match(CLIENT, /function renderExportFrame\(canvas, timeline, generations, assets/);
  assert.match(CLIENT, /function primeExportVideoElements/);

  assert.match(CLIENT, /function selectClips\(refs\)/);
  assert.match(CLIENT, /function deleteSelectedClips\(\)/);
  assert.match(CLIENT, /const startLaneGesture = \(event\) =>/);
  assert.match(CLIENT, /className: 'dsd-marquee'/);
  assert.match(CLIENT, /\.dsd-marquee \{/);
  assert.match(CLIENT, /onSelectClips/);
});

test('top bar uses four equal icon-and-text actions and moves project management to the right', () => {
  assert.match(CLIENT, /className: 'dsd-topaction'/);
  assert.match(CLIENT, /className: 'dsd-topaction is-primary'/);
  assert.match(CLIENT, /t\('project\.manage'\)/);
  assert.match(CLIENT, /t\('actions\.close'\)/);
  assert.match(CLIENT, /dsd-projectmenu/);
  const savedStatus = CLIENT.indexOf("'dsd-save-action'");
  const sessionButton = CLIENT.indexOf("t('session.open')");
  const exportButton = CLIENT.indexOf("t('actions.export')", sessionButton);
  const projectButton = CLIENT.indexOf("t('project.manage')", exportButton);
  const closeButton = CLIENT.indexOf("t('actions.close')", projectButton);
  assert.ok(savedStatus >= 0 && savedStatus < sessionButton, 'saved status must sit left of conversation');
  assert.ok(sessionButton >= 0 && exportButton > sessionButton && projectButton > exportButton && closeButton > projectButton,
    'action order must be conversation, export, project management, close');
  assert.match(CLIENT, /\.dsd-topaction \{[\s\S]*?height: 32px;[\s\S]*?min-width: 96px;[\s\S]*?gap: 6px;/s);
});

test('window chrome removes the top strip and offsets content beside traffic lights', () => {
  assert.doesNotMatch(CLIENT, /padding-top: var\(--dsh-frame-top-clearance/);
  assert.match(CLIENT, /html\[data-platform="darwin"\]:not\(\[data-fullscreen\]\) \.dsd-topbar \{ padding-left: 88px; \}/);
  assert.match(CLIENT, /html\[data-fullscreen\] \.dsd-topbar \{ padding-left: 16px; \}/);
  assert.match(CLIENT, /-webkit-app-region: drag/);
  assert.match(CLIENT, /-webkit-app-region: no-drag/);
});

test('export modal uses blur only around a solid Harness surface', () => {
  assert.match(CLIENT, /\.dsd-modal-backdrop \{[^}]*background: transparent;[^}]*backdrop-filter: blur\(10px\);/s);
  assert.doesNotMatch(CLIENT, /backdrop-filter: blur\(16px\) saturate\(125%\)/);
  assert.match(CLIENT, /\.dsd-modal \{[^}]*background: var\(--dsd-panel-2\);/s);
});

test('first timeline video sets aspect once, and video audio produces a linked audio lane', () => {
  assert.match(CLIENT, /function closestAspectFor\(width, height\)/);
  assert.match(CLIENT, /aspectInitialized: false/);
  assert.match(CLIENT, /aspectInitialized: true/);
  assert.match(CLIENT, /state\.project\.aspectInitialized !== true && state\.timeline\.video\.length === 0/);
  assert.match(CLIENT, /function linkedAudioClips\(timeline, assets\)/);
  assert.match(CLIENT, /kind: 'linked-audio'/);
  assert.match(CLIENT, /className: 'dsd-clip dsd-clip-audio dsd-clip-linked'/);
  assert.match(CLIENT, /collectAudioClips\(state\.timeline, state\.assets\)/);
  assert.match(CLIENT, /hasAudio/);
  assert.match(CLIENT, /function timelineIsEmpty\(timeline\)/);
  assert.match(CLIENT, /const desired = timelineIsEmpty\(state\.timeline\) \? 0/);
  assert.match(CLIENT, /toast\.videoAudioAdded/);
  assert.match(CLIENT, /readConversationFileDrag\(event\.dataTransfer\)/);
  assert.match(CLIENT, /payload\?\.type === 'conversation'/);
  assert.match(CLIENT, /store\.importConversationObject\(payload, localeId\)/);
  assert.match(CLIENT, /store\.addAssetToTimeline\(asset\.id, track, time, localeId\)/);
  assert.match(CLIENT, /getActiveConversationFileDrag\(\)/);
  assert.match(CLIENT, /getActiveAssetDrag\(\)/);
  assert.match(CLIENT, /payload = \{ type: 'asset', id: active\.id \}/);
});

test('conversation attachment auto-import is wired end to end', () => {
  assert.match(CLIENT, /const SESSION_MEDIA_PATH = '\/deepseek-design\/session-media'/);
  assert.match(CLIENT, /function setActiveSession\(sessionId\)/);
  assert.match(CLIENT, /store\.setActiveSession\(resolvedSessionId\)/);
  assert.match(CLIENT, /function syncSessionMedia\(\)/);
  assert.match(CLIENT, /originKey: key\.slice\(0, 220\)/);
  assert.match(CLIENT, /autoImportSkipped/);
  assert.match(CLIENT, /autoImportVersion: 3/);
  assert.match(CLIENT, /payload\?\.filtered !== true \|\| payload\?\.version !== 1/);
  assert.match(CLIENT, /if \(item\.kind !== 'video' && item\.kind !== 'audio'\) return false;/);
  assert.match(CLIENT, /assets\.autoImported/);
});

test('Chinese and English UI dictionaries stay in parity', () => {
  const zhStart = CLIENT.indexOf('    const zh = {');
  const enStart = CLIENT.indexOf('    const en = {');
  const enEnd = CLIENT.indexOf('    function tFor', enStart);
  assert.ok(zhStart >= 0 && enStart > zhStart && enEnd > enStart);
  const zh = CLIENT.slice(zhStart, enStart);
  const en = CLIENT.slice(enStart, enEnd);
  const zhKeys = [...zh.matchAll(/^\s+'([^']+)':/gm)].map((match) => match[1]);
  const enKeys = [...en.matchAll(/^\s+'([^']+)':/gm)].map((match) => match[1]);
  assert.equal(new Set(zhKeys).size, zhKeys.length, 'duplicate zh key');
  assert.equal(new Set(enKeys).size, enKeys.length, 'duplicate en key');
  assert.deepEqual([...new Set(zhKeys)].sort(), [...new Set(enKeys)].sort());
});

test('assets and conversation files are draggable both ways, and final exports enter the library', () => {
  assert.match(CLIENT, /CONVERSATION_FILE_MIME/);
  assert.match(CLIENT, /data-dsd-conversation-file/);
  assert.match(CLIENT, /function conversationFileRefForCard/);
  assert.match(CLIENT, /function conversationDeliverableRefForCard/);
  assert.match(CLIENT, /function decorateConversationFileCards/);
  assert.match(CLIENT, /onDragStart: canDrag/);
  assert.match(CLIENT, /beginAssetDrag/);
  assert.match(CLIENT, /onImportConversationObject/);
  assert.match(CLIENT, /data-composer-card/);
  assert.match(CLIENT, /\[class\*="_rail"\] \[class\*="_card"\]\[title\]/);
  assert.match(CLIENT, /new DataTransfer\(\)/);
  assert.match(CLIENT, /onAddExportedAsset/);
  assert.match(CLIENT, /addExportedVideo/);
  assert.match(CLIENT, /source: 'export'/);
  assert.match(CLIENT, /assets\.sourceExport/);
  assert.match(CLIENT, /SESSION_OBJECT_PATH/);
  assert.match(CLIENT, /SESSION_DELIVERABLE_PATH/);
  assert.match(CLIENT, /dsd-chat-dropmask/);
  assert.match(CLIENT, /application\/x-dsh-file/);
});

test('current conversation and DeepSeekDesign labels replace the old workbench wording', () => {
  assert.match(CLIENT, /'session\.chatTitle': '当前会话'/);
  assert.match(CLIENT, /'session\.openWorkbench': 'DeepSeekDesign'/);
  assert.doesNotMatch(CLIENT, /'session\.chatTitle': '设计会话'/);
  assert.doesNotMatch(CLIENT, /'session\.openWorkbench': '打开设计工作台'/);
  assert.match(CLIENT, /t\('session\.chatTitle'\)/);
  assert.match(CLIENT, /title: t\('session\.openWorkbench'\)/);
  assert.match(CLIENT, /aria-label': t\('session\.openWorkbench'\)/);
});

test('project menu exposes the per-minute backup toggle and restore action', () => {
  assert.match(CLIENT, /const PROJECT_BACKUP_INTERVAL_MS = 60_000;/);
  assert.match(CLIENT, /const MAX_PROJECT_BACKUPS = 5;/);
  assert.match(CLIENT, /const SETTINGS_KEY = 'deepseek-design\.settings\.v1';/);
  assert.match(CLIENT, /const BACKUP_KEY_PREFIX = 'deepseek-design\.backup\.v1\.'/);
  assert.match(CLIENT, /function backupNow\(\)/);
  assert.match(CLIENT, /function restoreProjectBackup\(\)/);
  assert.match(CLIENT, /function setAutoBackup\(enabled\)/);
  assert.match(CLIENT, /className: 'dsd-toggle dsd-project-backup'/);
  assert.match(CLIENT, /project\.backupAuto/);
  assert.match(CLIENT, /project\.backupLast/);
  assert.match(CLIENT, /project\.backupNone/);
  assert.match(CLIENT, /project\.backupRestore/);
  assert.match(CLIENT, /project\.backupRestoreConfirm/);
  assert.match(CLIENT, /onSetAutoBackup/);
  assert.match(CLIENT, /onRestoreBackup/);
  assert.match(CLIENT, /writeWorkbenchSettings/);
  assert.match(CLIENT, /removeProjectBackups\(entry\.id\)/);
  assert.match(CLIENT, /toast\.backupRestored/);
  assert.match(CLIENT, /toast\.backupFailed/);
});

test('project menu is workspace-only and keeps list, new project, import, and delete', () => {
  assert.match(CLIENT, /className: 'dsd-project-scope'/);
  assert.match(CLIENT, /className: 'dsd-project-scope-value'/);
  assert.doesNotMatch(CLIENT, /dsd-project-scope-options/, 'the scope selector is removed');
  assert.doesNotMatch(CLIENT, /project\.scope\.session/, 'the Session scope option is removed');
  assert.doesNotMatch(CLIENT, /project\.scope\.sessionHint/);
  assert.doesNotMatch(CLIENT, /project\.scopeChanged/);
  assert.match(CLIENT, /t\('project\.scopeHint'\)/);
  assert.match(CLIENT, /t\('project\.workspace'\)/);
  assert.match(CLIENT, /className: 'dsd-project-list'/);
  assert.match(CLIENT, /cx\('dsd-project-row'/);
  assert.match(CLIENT, /className: 'dsd-project-row-delete'/);
  assert.match(CLIENT, /t\('project\.new'\)/);
  assert.match(CLIENT, /t\('project\.deleteConfirm'\)/);
  assert.doesNotMatch(CLIENT, /onScopeMode/);
  assert.match(CLIENT, /onNewProject/);
  assert.match(CLIENT, /onSwitchProject/);
  assert.match(CLIENT, /onDeleteProject/);
  assert.match(CLIENT, /'project\.load': '导入为新项目…'/);
  assert.doesNotMatch(CLIENT, /project\.replaceConfirm/);
});

test('V1.0.0: the workbench overlay is a modal dialog with focus containment and inert background', () => {
  assert.match(CLIENT, /role: 'dialog'/);
  assert.match(CLIENT, /'aria-modal': 'true'/);
  assert.match(CLIENT, /appRoot\.setAttribute\('inert', ''\)/);
  assert.match(CLIENT, /appRoot\.removeAttribute\('inert'\)/);
  assert.match(CLIENT, /const focusableInRoot = useCallback/);
  assert.match(CLIENT, /previousFocusRef\.current = document\.activeElement/);
  assert.match(CLIENT, /previousFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(CLIENT, /if \(event\.key === 'Tab'\)/);
  assert.match(CLIENT, /if \(event\.key === 'Escape'\)[\s\S]{0,120}onCloseWorkbench/);
});

test('V1.0.0: the conversation column becomes a drawer on narrow layouts', () => {
  assert.match(CLIENT, /const \[showChat, setShowChat\] = useState\(false\)/);
  assert.match(CLIENT, /showChat && 'dsd-chat-open'/);
  assert.match(CLIENT, /className: 'dsd-chat-backdrop'/);
  assert.match(CLIENT, /\.dsd-chat-open \.dsd-chatpanel \{/);
  assert.match(CLIENT, /\.dsd-chat-open \.dsd-chat-backdrop \{/);
  assert.match(CLIENT, /setShowChat\(true\);[\s\S]{0,600}requestAnimationFrame\(focusField\)/);
  assert.match(CLIENT, /if \(showChat\) \{[\s\S]{0,260}setShowChat\(false\);/);
});

test('V1.0.0: conversation-file drags never fall through to the browser default on the chat column', () => {
  const start = CLIENT.indexOf('const handleChatDragOver = useCallback');
  const end = CLIENT.indexOf('const focusChat = useCallback', start);
  assert.ok(start >= 0 && end > start, 'chat drag handlers are missing');
  const handler = CLIENT.slice(start, end);
  assert.match(handler, /types\.includes\(CONVERSATION_FILE_MIME\) \|\| getActiveConversationFileDrag\(\) !== null/);
  assert.match(handler, /event\.preventDefault\(\)/);
  assert.match(handler, /event\.stopPropagation\(\)/);
});

test('V1.0.0: the asset-preview volume control drives the media element through the DOM', () => {
  assert.match(CLIENT, /element\.volume = clamp\(Number\(volume\), 0, 1\)/);
  assert.match(CLIENT, /ref: mediaRef,[\s\S]{0,200}className: 'dsd-native-media'/);
  assert.match(CLIENT, /h\('audio', \{ ref: mediaRef,/);
  assert.match(CLIENT, /\[volume, muted, previewMode, selectedUpload\?\.objectUrl\]/);
});

test('V1.0.0: export summary and filename use the project name, and 0-byte recordings are rejected', () => {
  assert.match(CLIENT, /const projectLabel = typeof state\.project\.name === 'string'/);
  assert.match(CLIENT, /const recordedBytes = chunks\.reduce/);
  assert.match(CLIENT, /if \(recordedBytes <= 0\) throw new Error\(t\('export\.emptyRecording'\)\)/);
  assert.match(CLIENT, /className: 'dsd-export-name' \},\n              typeof state\.project\.name/);
});

test('V1.0.0: timeline interactions use the visible state (scrub gate, split gate, add-music time, ghost preview)', () => {
  assert.match(CLIENT, /const scrubPointerRef = useRef\(null\)/);
  assert.match(CLIENT, /if \(scrubPointerRef\.current !== event\.pointerId \|\| event\.buttons !== 1\) return/);
  assert.match(CLIENT, /disabled: !selectedClipExists \|\| previewMode !== 'timeline'/);
  assert.match(CLIENT, /if \(previewMode === 'timeline'\) handleSplit\(\)/);
  assert.match(CLIENT, /const handleAddBed = useCallback\(\(atTime\) =>/);
  assert.match(CLIENT, /const placed = placeMovedClip\(trackClipsNow, original\.id, desired, desired\)/);
});

test('V1.0.0: export frame rendering awaits seeks and pauses the previous decoder; Host tool errors win', () => {
  assert.match(CLIENT, /async function renderExportFrame\(/);
  assert.match(CLIENT, /await seekExportVideoElement\(element, local\)/);
  assert.match(CLIENT, /pauseExportVideoElementsExcept\(asset\.id\)/);
  assert.match(CLIENT, /if \(current !== null && current\.status === 'error'[\s\S]{0,120}return;/);
  assert.match(CLIENT, /if \(target\.closest\('\.dsd-modal'\) !== null\) return;/);
  assert.doesNotMatch(CLIENT, /tick\(\)\.catch\(\(\) => resolve\(\)\);\n            tick\(\);/, 'only one export render loop may start');
});

test('V1.0.0: backup restore keeps current content safe and the Projects menu can clear backups', () => {
  assert.match(CLIENT, /const preRestoreRaw = JSON\.stringify\(serializeProject\(state\)\)/);
  assert.match(CLIENT, /if \(preRestoreRaw\.length > MAX_BACKUP_DOC_BYTES\)/);
  assert.match(CLIENT, /if \(!writeProjectBackups\(projectId, \{ version: 1, projectId, snapshots: nextSnapshots \}\)\) \{[\s\S]{0,160}backupRestoreUnsafe/);
  assert.match(CLIENT, /if \(restored\) setPreviewMode\('timeline'\)/);
  assert.match(CLIENT, /t\('project\.backupClear'\)/);
  assert.match(CLIENT, /t\('project\.backupTooLarge'\)/);
  assert.match(CLIENT, /emergencyPruneBackups\(scope\.activeId\)/);
});
