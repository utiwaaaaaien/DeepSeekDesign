window.__ModuleLoader__.load({
  id: '@local/deepseek-design-workbench',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let createPortal = null;
    try {
      createPortal = require('react-dom').createPortal;
    } catch {
      createPortal = null;
    }
    const {
      useCallback,
      useEffect,
      useLayoutEffect,
      useMemo,
      useRef,
      useState,
      useSyncExternalStore,
    } = React;

    const NS = 'deepseekDesign';
    const PANEL_ID = 'deepseek-design';
    const API_PATH = '/deepseek-design/api';
    const EXPORT_WORKER_PATH = '/deepseek-design/export-worker.js';
    const EXPORT_VIDEO_TOOL = 'deepseek_design_export_video';
    const DESIGN_CHAT_SLOT = 'deepseek-design.conversation';
    const DESIGN_OVERLAY_ID = 'deepseek-design-overlay';
    const LEGACY_STORAGE_KEY = 'deepseek-design.project.v1';
    const PROJECT_INDEX_KEY = 'deepseek-design.projects.v2';
    const PROJECT_DOC_PREFIX = 'deepseek-design.project.v2.';
    const PROJECT_INDEX_VERSION = 2;
    const LEGACY_PROJECT_ID = 'prj_legacy';
    const MAX_PROJECTS_TOTAL = 200;
    const MAX_PROJECTS_PER_SCOPE = 50;
    const MEDIA_DB = 'deepseek-design-media';
    const MEDIA_STORE = 'media';
    const INBOX_STORE = 'inbox';
    const EXPORT_STORE = 'exports';
    const MEDIA_DB_VERSION = 2;
    const MAX_HISTORY_STEPS = 100;
    const MIN_CLIP_SECONDS = 0.5;
    const MAX_TIMELINE_SECONDS = 7 * 24 * 60 * 60;
    const MAX_EXPORT_BYTES = 4 * 1024 * 1024 * 1024;
    const MAX_PROJECT_MEDIA_BYTES = 1024 * 1024 * 1024;
    const MAX_PROJECT_IMPORT_BYTES = 1536 * 1024 * 1024;
    const MAX_PROJECT_EXPORT_ENCODED_BYTES = 1536 * 1024 * 1024;
    const MAX_ANIMATION_SECONDS = 600;
    const MAX_ANIMATION_CODE = 2_000_000;
    const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
    const MAX_AUDIO_PROBE_BYTES = 300 * 1024 * 1024;
    const SESSION_MEDIA_PATH = '/deepseek-design/session-media';
    const SESSION_OBJECT_PATH = '/deepseek-design/session-object';
    const SESSION_DELIVERABLE_PATH = '/deepseek-design/session-deliverable';
    const CONVERSATION_FILE_MIME = 'application/x-deepseek-design-conversation-file';
    const SESSION_MEDIA_POLL_MS = 4000;
    const MAX_SESSION_MEDIA_PER_SYNC = 12;
    const MAX_ASSETS = 10_000;
    const MAX_GENERATIONS = 2_000;
    const MAX_CLIPS_PER_TRACK = 20_000;
    const SETTINGS_KEY = 'deepseek-design.settings.v1';
    const BACKUP_KEY_PREFIX = 'deepseek-design.backup.v1.';
    const PROJECT_BACKUP_INTERVAL_MS = 60_000;
    const MAX_PROJECT_BACKUPS = 5;
    const MAX_BACKUP_BUCKETS = 50;
    const MAX_BACKUP_DOC_BYTES = 1_048_576;
    // Total localStorage budget for backup buckets (JSON characters, roughly
    // UTF-16 units). Backups are a convenience snapshot, not durable storage:
    // keeping the total bounded prevents them from starving project autosave.
    const MAX_BACKUP_TOTAL_CHARS = 1_048_576;
    let designOverlayOpen = false;
    const designOverlayListeners = new Set();
    function setDesignOverlay(open) {
      const next = open === true;
      if (designOverlayOpen === next) return;
      designOverlayOpen = next;
      for (const listener of [...designOverlayListeners]) {
        try { listener(); } catch { /* A subscriber may already be gone. */ }
      }
    }
    function subscribeDesignOverlay(listener) {
      designOverlayListeners.add(listener);
      return () => designOverlayListeners.delete(listener);
    }
    function getDesignOverlaySnapshot() {
      return designOverlayOpen;
    }

    let activeAssetDrag = null;

    function beginAssetDrag(payload) {
      activeAssetDrag = payload === null || payload === undefined ? null : payload;
    }

    function endAssetDrag() {
      activeAssetDrag = null;
    }

    function getActiveAssetDrag() {
      return activeAssetDrag;
    }

    let activeConversationFileDrag = null;

    function beginConversationFileDrag(payload) {
      activeConversationFileDrag = payload === null || payload === undefined ? null : payload;
    }

    function endConversationFileDrag() {
      activeConversationFileDrag = null;
    }

    function getActiveConversationFileDrag() {
      return activeConversationFileDrag;
    }

    function fiberForElement(element) {
      if (element === null || element === undefined) return null;
      const keys = Object.getOwnPropertyNames(element);
      for (const key of keys) {
        if (key.startsWith('__reactFiber$')) return element[key] ?? null;
      }
      return null;
    }

    function conversationFileRefForCard(element) {
      const title = typeof element?.getAttribute === 'function' ? element.getAttribute('title') : null;
      const name = typeof title === 'string' && title.trim().length > 0 ? title.trim() : '';
      let fiber = fiberForElement(element);
      let depth = 0;
      while (fiber !== null && fiber !== undefined && depth < 40) {
        const props = fiber.memoizedProps;
        const candidates = [];
        if (Array.isArray(props?.content?.attachments)) candidates.push(...props.content.attachments);
        if (Array.isArray(props?.attachments)) candidates.push(...props.attachments);
        for (const entry of candidates) {
          if (entry === null || typeof entry !== 'object' || entry.type !== 'file') continue;
          const file = entry.file;
          if (file === null || typeof file !== 'object' || typeof file.attachmentId !== 'string') continue;
          if (name.length > 0 && typeof file.name === 'string' && file.name !== name) continue;
          return {
            attachmentId: file.attachmentId,
            name: typeof file.name === 'string' && file.name.length > 0 ? file.name : name,
            bytes: Math.max(0, Number(file.bytes) || 0),
            kind: 'file',
          };
        }
        fiber = fiber.return;
        depth += 1;
      }
      return null;
    }

    function draftFileFromProps(props, name) {
      const candidates = [];
      if (props?.attachment !== null && typeof props?.attachment === 'object') candidates.push(props.attachment);
      if (Array.isArray(props?.attachments)) candidates.push(...props.attachments);
      if (Array.isArray(props?.items)) {
        for (const item of props.items) {
          if (item?.attachment !== null && typeof item?.attachment === 'object') candidates.push(item.attachment);
        }
      }
      for (const attachment of candidates) {
        if (attachment?.kind !== 'file' && typeof attachment?.attachmentId !== 'string') continue;
        if (typeof File === 'function' && attachment.file instanceof File) {
          if (name.length > 0 && attachment.file.name !== name) continue;
          return { file: attachment.file, name: attachment.file.name, kind: 'file' };
        }
        if (typeof attachment.attachmentId === 'string' && attachment.attachmentId.length > 0) {
          const attachmentName = typeof attachment.name === 'string' && attachment.name.length > 0 ? attachment.name : name;
          return { attachmentId: attachment.attachmentId, name: attachmentName, bytes: Math.max(0, Number(attachment.bytes) || 0), kind: 'file' };
        }
      }
      return null;
    }

    function conversationDraftFileForCard(element) {
      const title = typeof element?.getAttribute === 'function' ? element.getAttribute('title') : null;
      const name = typeof title === 'string' && title.trim().length > 0 ? title.trim() : '';
      let fiber = fiberForElement(element);
      let depth = 0;
      while (fiber !== null && fiber !== undefined && depth < 40) {
        const match = draftFileFromProps(fiber.memoizedProps, name);
        if (match !== null) return match;
        fiber = fiber.return;
        depth += 1;
      }
      const composer = typeof element?.closest === 'function' ? element.closest('[data-composer-card]') : null;
      const rootFiber = fiberForElement(composer);
      if (rootFiber === null) return null;
      let found = null;
      const visit = (node, level) => {
        if (found !== null || node === null || node === undefined || level > 30) return;
        const match = draftFileFromProps(node.memoizedProps, name);
        if (match !== null) { found = match; return; }
        let child = node.child;
        while (child !== null && child !== undefined && found === null) {
          visit(child, level + 1);
          child = child.sibling;
        }
      };
      visit(rootFiber, 0);
      return found;
    }

    function conversationDeliverableRefForCard(element) {
      const titled = element?.querySelector?.('button[title], [data-file-path][title]');
      const path = typeof titled?.getAttribute === 'function' ? titled.getAttribute('title') : '';
      if (typeof path !== 'string' || path.length === 0 || path.length > 4096) return null;
      const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
      return { path, name: name || 'delivered file', kind: 'file' };
    }

    function decorateConversationFileCards(root) {
      if (root === null || root === undefined) return;
      for (const card of root.querySelectorAll('[data-presented-file]')) {
        if (card.getAttribute('data-dsd-conversation-file') === 'deliverable') continue;
        card.setAttribute('data-dsd-conversation-file', 'deliverable');
        card.setAttribute('draggable', 'true');
        try { card.style.cursor = 'grab'; } catch { /* Style is optional. */ }
      }
      const candidates = new Set([
        ...root.querySelectorAll('[data-message-attachments] [class*="fileCard"][title]'),
        ...root.querySelectorAll('[data-message-attachments] [class*="_card"][title]'),
        ...root.querySelectorAll('[class*="_attachments"] [class*="_file"][title]'),
        ...root.querySelectorAll('[class*="_rail"] [class*="_card"][title]'),
      ]);
      for (const card of candidates) {
        if (card.getAttribute('data-dsd-conversation-file') !== null) continue;
        const draft = conversationDraftFileForCard(card);
        if (draft !== null) {
          card.setAttribute('data-dsd-conversation-file', 'draft');
          card.setAttribute('draggable', 'true');
          try { card.style.cursor = 'grab'; } catch { /* Style is optional. */ }
          continue;
        }
        const ref = conversationFileRefForCard(card);
        if (ref !== null) {
          card.setAttribute('data-dsd-conversation-file', 'attachment');
          card.setAttribute('draggable', 'true');
          card.setAttribute('title', card.getAttribute('title') || '');
          try { card.style.cursor = 'grab'; } catch { /* Style is optional. */ }
        }
      }
    }

    const exportJobs = new Map();
    const exportJobListeners = new Set();
    function subscribeExportJobs(listener) {
      exportJobListeners.add(listener);
      return () => exportJobListeners.delete(listener);
    }
    function exportJobFor(key) {
      return exportJobs.get(key) ?? null;
    }
    function setExportJob(key, patch) {
      if (typeof key !== 'string' || key.length === 0) return;
      const previous = exportJobs.get(key);
      const next = { ...(previous ?? {}), ...patch };
      exportJobs.set(key, next);
      for (const listener of [...exportJobListeners]) {
        try { listener(); } catch { /* A subscriber may already be gone. */ }
      }
    }

    function closeDesignOverlay(ctx) {
      setDesignOverlay(false);
      const layout = ctx?.layout ?? ctx?.get?.('layout');
      if (layout !== null && layout !== undefined && typeof layout.selectPanel === 'function') {
        try { layout.selectPanel(null); } catch { /* The Conversation is already selected. */ }
      }
    }

    // Inlined from the bundled icon.png so the sidebar
    // glyph renders on first paint without a Host round-trip.
    const APP_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAgKADAAQAAAABAAAAgAAAAABIjgR3AAA1y0lEQVR4AaV9CbimVXFm33t7Y2uUxYR9a1YRZTEuk1GiETUTEyd55snomEwc9wVFkb2h6aabRRYRxWVMdJyM0WhiZjJGxycaBBQRN0CUxYVFjEaQJdDQ+513qapzvu//QTPz+d9z6lS99VadOudb/u/expn7H3x4ZmZmgY75BfOzCxbMe7AASou2ztc47OxoshkC3KkbH+Fu9cyCGYHAZgFqKAoThKKCTJM7yPOUw5I+NCYViSVTGB50LG0Soq+jjNRgIFsCqaMix6NSpDrsnBfzjGNg1aA0zGkhMi5wziTia2rJMz8TYeFeGcoTdUmQpzlAJNjcWXSzmal3hybSESdDIkZUvlnmc8sok5xrxM3ss5e5S1JJiz7Tdm96Vk/LpdjODWCq5UjszDwO7wYCLCcJq0aMfCDIkwoK2gUQ4kAk7HgcUPHTLAaIyWKgRhpqW14VDDyskD/oSiiu4gmTDEix9EbaGtVOaKxKISiMM7eCWlmKNgjt27c9gpXgIlhXrWO4SDBTjx9oIdqWhDRVXPsbbIA1AuEMwP5KSBElIQxDZq0RtOkhgSlERDsoN8ea3oq0hc2JNNqh2yCHCD3o2sJpXyJpkjtKl2yyyiyCYk44U6BSFYDsIdo6pkxO4eHV+1Z0CyYkSYXkAGQ4A4p+YKMdB43Q6+PrR2hkVTNQFF4eHaNJ7AVQ7i8w20JHit2hUTstO6PAhNu3+RQL3BDCQzmGC6EwkJUQ+4NHsjGFlB8rYKFFSYlIoQlQMrSUGwdxFCfxbQDsQiPglGr23RCZYTuYtLBDCEZwMgRbz0QaJqcQBpSKQ6v62NDk+RdE5dAxp5/iOsPMmSa64Edccje+mCJgzsvQntNbLRIA2bRD7DJkqJpOwUeni4G0KhU1s55uU5Alrw4Wo/pKiotR9E0qFQV6SdHipV1hOoDHiSeK/Axfn3QlqGhrQE2kFNu98LleQVV6COZpdJkGNCUaD2SAo2g9DeXIc+gWo6qVWKAklRkVSMy8BEmwjZxila6n5XkLd2PT4D5Hdg4CKemBsZ0s9AQljxiy1EEIawCKCBYkBC0SkpIiJer4ach29pYuMO7gFhDYKRGG2lX5RBipDDsThktnAgu4cbhVQhraAXqTs8UlKLVyUSMN56Cq5/mQfNAT4B9yECAwnSXQJu/IQENpUkIvkPdtpw2UGawPtuTCsNsN1nrKU8iAzFCU5DuMxpFI7C2EYWjTJikb6z0yMmTnosFUTBQqPbUMeApSbyXbZPFmYFYMEouKVQGL8yXAh7Kgye6p9zAIhLQlIqjrNZBtCkDWyxi3LmHIER44efSESdFzDngqcwmjGtiYHJpX5taHBqDnJN7bkf6MTKsR3flEnZSs6UycAUTTC0c4xVAgqQXxTAMiuJtKJeKVSasymh7deUSyZS2SBDAn5hq52MsZpmyeRLRsOzsZcJBEXDXMCzETsFLAmILwhCSefcFiF9pBrfdfYvA9wZmbvPyYRhIKG/eAjg8IOOmgKIF5hC7GHOKTxN0k7Zqehicsbe7F6AkKkKjshUIufeTGYC3btMNP4sA/B8owqoniOHMb2SaHp+4RN2jG42ZOKupSLgA5+oGHtSrJU44p4CnIRzLSIBmGFMu7CbDSM71DKBKYLBMgyVxuSWNz66mLgxPxJzVpSCeOLaOtEFKGwh493hq18UWXjnGUSA8sU+77OjPEZLoghQmSP2YpMIa0wgZeLWPyh69nCKW+iGkGimueaGPxuh1aBqZYWNHUqAlND6nBW7TSQQAkjxKhLoiNcfsxc+L8fiW96ROZl3OPl+ytSjtOL/FAhkCxvCCErI42XlcyVykNQEvBAwh5wCVPItsYAcqqHhP1uyCFnyQgGNreYJltLLAIRWsJlhLojhSAhupXPEjrT+9TsiKTiprQZhUVQbps0AcmXKwgSVqCELWIdWvzTVf18sGpA0Lt3zSay3ypK3YtGEc4mjFd1McC6FEYkEDBRGt05S0PkuEYyRqi1CZgmzLOZ2WsLRY7QAwtXIJJ0m0PoaBTcTRgo0jShuhgaddjgjDGWhTeTlAjzyq3E07v7OVl11SpOMqf+rFNqE6ZtNnLg5trdPD9P8mEQz+JsMOk3q8DbXUU05hJsibJ8RRvOcLmKwAxBrU2Li3iUxNEqAFBjZMrnQAbtAgQ4ygoBG5zhYKHhsBUDgMHU/ZtlKkPFh7FALg9bHAEtNSjw+E2BKQ+O1AIggbV7XlEIJqhNthIwQg1I9EUsUawDxXUhoakKaKWzhQK+bBaYRRRw3pImyraQMplwotwYbw8ho9yNiUDpztgGqEeSicQVvZwavQxsf3kSgUy5NXLO0XaJJqte9hAXVOKhTAriAolDfK3hQEgJYzshWT8xAliFOz4pBxo8XD1FTcYI2+MiLJHCXYMG7Q8mJZgwRpKdbZnC5Q/ZXsMwSjwFTyyqonK4LDkwJRFFVNBJ42VsHCC/JmtQumaTa382Og0kAd1+FGMArBYGFhZTjGkm2KUgQK0ph845buYYiaOSGAJ16qEqM4cbntWegmOVlbxSOnYUFJltVuoNIdARRfXC42AM3TYhzoo7Ze4TLZz7QLLaigeQ1V3uitj82iA8tU2ArqllK70sBxeGORYxaOaFKHsA1iW0ffoDKyeJ4z2C5ewDtIUb2ml7EfT6hl2MwzAHFQJmkUpd8FjCjmVmpPdpSa687Aov3ROu6cmVz2G1mUFQH+UiKtPZ3EFS4XokAGhST8pyAUDVs2lpEVHFJiyroE2RAx0GnMdhC43jeRk1hpLN4KNhgMsBi0YBhPY0UrDrmwCl3CgRMNxS5WSM+esMfKHU4VldPBVxFAlVC1KnQcdiDR2Kleq5FP4PpbTIEQf5WrXRGETJtdo6i1uARJB51SSHONuqCjNu6S84DDTIsg8EgUe7dMcY4ioHbsAhRlslESNOKhOEyNjyqxYfhFrNkvOSBxOIqI7ZxHlJaolCSlmgoxCos75pYl4EIhQREon5kAjjnIuwfouTSgivTFG0JGyHzpoxFCisPYApjzQVJpOzcbcB5WZUaVmebUpCZCt5ujFV8j4HqBwAhlpHzIEfZxTwZVZp7F6GXgOiSbUkRJUpfUU0q3UVChiaSjgBxlbZUdhCJYSTar5lod6HYXCaKztXirAFNb0hWMoQ9MzwWaj52pnaDBUFmjlFT6k5k+rJKy1EjgDMJQ9IfRLnXChIIcPMcuHrumcVo6h9Y0NUKGVgwYxJLoTI0eowpF2TkPsBgYcnT9B4YGhROt0g1KeZMmPZXrx6EpQDKWUrxrYGK9IPFZrJbY4R/gRnnCTM3sq6xwoQIXWJpiN6wPRAxKRpg4+HT9l54AOAZzDJAH49EgvvBx0fxGQDUmdZ6q08kGtcpTsgDmkF2RFz6xtg4GZ8ofsaKmXSjuWehxJREFYq1ub4PIOkj5h1lbMcjOTVaasIBnOaqKdGr3rHgBlszPDGKWyVhKwYLZpMnCbRiCNFzzpjPE0qQvK2h0dh4xxaQGMyIRxg8FbmRczUs+FJtx6SAUAAZ0Uolf2MaFnIByGkok/qZIlENKxMaDa1OhmG3Z24ARGkWf0p4mxkWKb21ZVJlw+4JeQkycL/6cKEFEHGOAjcGScJluotBV6qn7pYYferbmQoJEI04aCURfzwdLwjeb4mNQAEUqSFaFpakgL2c2HbmBJPZWdIUbWxJ8mmgAwcJgGZp8E6Tnuw6VfqAgT+48M4eQ14sCp5gmYzskdnDUsgW5B5gwDqS45sSP03b23WYYrqMg2rH4obercKm64N5M9Wg4YM7wV6ebeacGY6iZkHajhy7iCClwXH2SbvoHAsJtjGpleR9FPMtV0zA/hkQt0unqIAFjCG+tENTs2cuRhD/L7vVZjIIJOpkY7NIU+eVovH13GlB6Hg6PRhEnBAbFhhK9hCQHUPqzHUEYgTxdJAHhp/6ANAgo9kuvEpaKroaZqTEXK+RhpFUpGVJaaAyAijghNYrTkTrTNgeGkMw/mOL/CanxspWSOJJKgIpYCpHIMv04fFOM0auIddCAOHTRL+uj3AT2Q/IGF2BU9U3LuIjAwimoSuusoIRXq2zmFocOo1fpB6j9hfxy2pNb6mW1aKQeR4BOp9RmGcxKih6YHNAsNnSVF92iHVKXufCBSTSAkngFGdSGl0Obsd4BhkcpgEDp1AwM4hwkxVq+RzEhWwmr/AQt5qegdFSsbr2vmim3VIyEnrVlpDSkJPMwRA01qajOSXvUEbBCJGXaFJh0g1YKSpc8LBvQMwr8NNaqA4SZt3iZh9JGJlc+gLLCODXaANg19ipbj1o+EPMmMwT69mpCZPF6fDMRIRoNYQVbWEkZck3r6p7uYSCWlXeuyV/mOKDWEQ1vGCNK/jkaKoU2aGHZkaUlCmxLXW6lLPVEpBwadpWo1w7Yb9LBMLyGxSC09B+1bkwMDsGV59RDGmVBGDj2OsjYGHSaPnAYsHSBuAZkt3TqrRrRZJwo2HNYlSFoodHgQrFU6mgYwg6e1gLFkNg1TaXCCcmQZbSrbhgMEysS261WfTM9jSrkUf9itNKCHJXvaaxtoJQpPFvyUNSjSi0M6aDz0pKpy1IUKJML1f5gV3AU0kaJIpFRGqbMZasdgjEuVHtR4gW0yg9syGayhRdjregVNC2uS1MRo8qSBQyIrkRCkD0J31CjF0NqzK2zsMK2HMP3mGFAxLBQRO4g8jn+gUek0TGOAjoPGgEHoQhleUQDWyHgDNZpsMJWgtU2UwVuEzS0sTTGSBunJlmdwA06hbUZKJqlQyLB3ocyU62gDwQZgg8LdJ40S4qw7P70LIiqQvvxFIhGIcPwEQlugzkIodS6hpz0wmaeH8G0Rg9OUbWAkkjOyWvvSOo0i/Wk3gzQB7TS9NZym8jWXbqcPHeBHFLqeIeVGYIx900rPkiFBbn+WElNwBYbhmw/5dAkzcd8ydP5IqmDUThzmRDvVaiVaXUZa0sNMTApUqCetYni8EBN5UUGe4UuLgLW3LOREbhMRrYCRR3QWvHE7JQH4pTxBCqjO84XOZ0sY0VHyD8Bx/xABG6kK0MWFR2ZEZxweQlA+sc68mMoOa+AEVkMPmWmZsELXnCasA8VgIOrJBlyMNz0QbDQaYFBxlkB9B2lg+Q5hhPaXIFkdwn4jH5tYNJkhEMBrmlopJSr/gGXItDKo7FSEkquN66ffSFQWAvZuvSxjciePlH0z4VEhy7XBqcKPP/BMZytGOO+Y2onNml7hTtLhUQBGin8l2XRVms5JuDYusJYHHFLo/gOpwCXI0xaIs7OzC+fmGpslg9Vu2rQJuvLWRBGC/Pj8KkdlMRW/eNEik2C5t/I3mELFXBZs2bJl69atmlEXCqe4VDWLmHQHGYvg1ffzyAFdkvZZQVf/Rsz2ugt2hJx7ekcRXBZgqI8BT4gOGHzt/TsUCxfOPfTQw7fffgc9MXl+Dee+x6Tn5mYx8bnZ2YMPPgiLBDMTjZMsooKhAsPYBYuB5hbZShZKjXwXINAtN30XjoiFQiMfV5vJzs/j17N777P3smXLNm/a7HUJ16hArFUjnZB0e8Risvowxupikg5PXXfo/MECRMadIBF3mLgR9X6WfdlJLm0QgT1rEauAUUcBsfHXrXvk7NXnfuWr19ZJEHMS6+bNm1//2lcdfviTt2zezNJzjWioUirRLEYGz15GrkkAesfAzCxYvHjxtV/7+gc/9OHFi3keYKWZNsu1FXGw/X/jmKPPWXXWsmU7bNq82XGRgWYb/Blueu+6oPVKsK+j5VUqCroHSBOnma1wVBlrZCFbmbmsyI5BISlduzlhWeUAaW5ubsPGjWvOveDKq65eNDfnuqvI2I0swcYNG176e7/7yj/9Y1SBTkhdCbgKoonGsRp7qqciy5H1m1+AXf+n//kVz3/eczds2ID9vnUL6g49WwBw/n3lmmvPPmftw+vW4eSwb9JOBJS5K5LLQa2ggU+3pKFdMiavvi0ATTrg01EQhZ8kapgA94scRoE7B0wMJ/x5F1z0hS9esc02S4nSDkELFKr/yCOPPPc5v3ni2966dUvs+mSa0ivtKSmJFfpIGB3kLgsasADY9WeeccrRRx356KPrZ+c4fcDiP1oyM7N0m6VXXf2V1WvO27RxEzZN764yVHDNkck3iG0izEY+0aRHVjc2vBeAvr1/yYFGhsM1KACFWEtIPnz1icEMLugLFlx48aWf/ez/WbJkSb9eTmHjpk2HHHzQqae8A5eFrVu3FDO8PDm20rahuKFrsx/KsgdBj4ELzrAddtjhjNNO3mOP3XHRKyRgDr106dIvXXn1qnPOwyk7XAPmLraOshOTir2uQqUoUJ8yo6ECrE6sReCdBgYlAEGKbhzQ6MofCKxUhcNodhZzeM/7PvDXn/6fqH5PAkrsu82bNu26y85rz1m566674rI75I2IYMXOXbRoEbaBc0AEfyolDBl8OBcrwWmwyMmwYcPGfffdZ82qM7fZZhtf8Wpb6GyYQaqf/4cvnH/BRdgQc7PtmQ1zq4iK1c+V9AhURyKzd3bNbGz+Qqb3TMw0XdpGvQqj0msq8MQH5Vq4cOEHPvhnH/vYJ1h9lw/5RBm5GXHKrzjj1AOXL9+0cWM/JTM4Cu6cn/zUpz/28U/iUrYQyyAtabok7Gtq5+0WECNHYNxyjjzqyLefcDz0WN2OSX7zC3Ae/P3nPv/OC9/FTYpLaIco0cw1nBAYMx3Rp2icRqjE3CmnnfHLiMbM8CU3j3RV8VMZWhT9o3/xlx/80J+jarN64kTpufGVCy/2W7eeetKJLzzuBY+uX9/7mtctYuHJ/UtXXf2eyz9w66237b//frvt/ussWW1apoGDBCaptjgF0J6wpBbXnycfdiie+7/29W/EU1nsoygVds9NN333kUceffazninVsIJFlfsJiopYJQpNh0k/WWZm5k49nQsw5YB2ws03/R5fkcBgvTXYQZ/8609fetl7cQrjQgTTIP35+Y0bN7z6Va98xctfhgcS+9IxqYsWGhTi2uu+ccON37n7Jz+54oovbd685bBDDwE/TqCCNQbOJFko8zDMOdhmDRbyqKOO/Oef//y73/0eohBKM7MwDAtzww03bt6y5ZnPePrwRCGsj07f7oD741gVAXYcWIBTvQCOSJUM1WAYGjLmVRhmEVTFEiQ0qvOZz37uggsvBgx3AXM13vn59evX46HzbW998+Ytm3GO+y5OAPj40f/sxq9vC6/7xjduuP5GnFIbN2689mvXffNb1++11557770Xv1B1p0ILkb6j0AC4Lo7IgLOzv/H0Y777vVvuuuvuePRsc2I+uIl981vfRg5PP+boiTWoWY8jO4pKVJhhTjHCAugSNGlMZ+eMvFUYlz3RNQ0r7LLN0qVXXHkVnuTwfVLPeU4uUoLL+g0bnv3sZ64864y5/CLaI7SC4IMuPgsXLbzuum986/obIODhfW7hwp/+9KdfvOJLDz/88KGHHrL9dtv5RppJtd4h2zglh/MI67dk6dJjjj7qq9ded9999yOlREWPLYegX//6N7fbbrujjnwazoYC9DypdM5R9BikbVrPtwEqalt207LcklxVDLDTQjaRcQPVggWo/rXXXbfqnHP5TYfvfIyyB7HQH3zQgWetOA1IXH/7JUzCjhIqfPAFStu8wIuXLMHqfvgj//2Nb37rNV+9FndpPGtNTq+PPWmFxpHw9mm33X599dkrnvCEHbWWUHc5IAXchefmLnvP+/7mb/8XTm5TdYg+zti34trQeUVteAYA1HOUz6QwCSsNqJcuWXLjd246fcXZDz7wIM5ZmPzRfAjE5XuXXXa+4Lw1++y9d710M0Nm5lWHril4CbruG9dff6O3p/HYmLi333vPvf/whX+85557n3zYYct23GHL5rY9++TNFY6doTSo+26777bHHntceeVV+mbur0eAwpUonASQrr32a3vusdshhxzsLxB2L77M2HsG6rapOUhcCu5n+BTUmxM2pU/PKXDExgX6+9///smnnXnPPffgmZ3+SkBp0RWXa+jXrDoL30JxFYKK2i7J0NAzD1jxwnbhQjyofBuXIN0n6ZWF0Uk2f9NN37vy6i9j/x580HJcMPDGzRizjOqC0wgaANh20VHTgw9cjm8GeBuBHU9T3l0MQ7tly2ZYD9h/v+UHLucLKx1iY0D81DnqoQHVOiu3iZ2ZO21wD0hrzrCch8IYhovAj39898mnnnH3j+9evGixcgEm5k70/Dyunie/420vftEL169H9aETiUrgigxDtBEXAPeAb1/P72JSG6/bL8rCbxsPPPjgVVd9+fbb7zzwwOVP2nWX0QNS44qoVJiqTBgiw6cd8ZSHHnro+htuBGeAcpEAwLUIJ+41X/0avrrjq5xf2ImneyLSco3I+yghA8Fr+vBfykfBBBGAJUxl44RjKglFXbDrTztj5e133Ll4CaoPZIJZH6D52PMnr3jZH/7BS9dvWM/VqCzi4h5jdGnqQ0OOJyVYDWDLOOxhXYQr3uzs5z7/+Tcef8Kn//bvoI2zsKXSQjg/vALsw1HGLtm8+fg3vf75zzv20Ucf1SSIcUzHxcLg5n/m2efgsRiXXFkJAM4A3it/lSNRvAn7gKCvUxopOWmillwtHEJbjxFUixYtvO/++1H9W269dQmqn1kHEHOaX4ALznHHPf8Nr3sNXjy4+C2QohVzjSCIIRSz/jN6cHl6zEWLAhSVTg6PANv84t5frF57/kmnnHHHHXfgeoL1B7anqhCuVF40DJvBgyaesk475aSnHnHExo381RAnoK8/njVa3Hvu+8V9p61Y+YMf/BCPA6oLE3AUD3NU0R5LwLugKcVg2M6DzJFoxkGPD7bDQw+tW7lqLS7QfNmQm19WNDw2rF//tKcecfopJ+F6PfEcLQxn1pLwNOzbySqDtawHHJERShNRJFDG5Rsv9b5yzVdf94bjP/yRjyLiksWLExT+w44UIFIsAnES7LjjjmtWn7nXnnvi2yL1WsWeZNGixT/72T+fcvqZd9xxp/kr1RQKbgXatAzD43dPUyzlLTBGxaLCS4tviXijsnL1mmuu+SqeKZlnotVzhKvkHnvusfLM05ftuMxPDh1zFo9lTLXOvHKHYEPZaYKKH25MhrSLlpBgXvS4Bv/y0MOXXf6B4084EZsD78B9DgFub/J0hzO3AvLmTRv32muvM1ecumzZjvjVmazkbod+t/OjH92+4qyzf46HDt8wmrmXyrEEWx2Tp3bNrqXRJIKHI7njMeGRRx/Fr7e+/OVrlm6zjbiDJ4j52LNl++23PefsM/fbdx+czqV3/OId5FW5ZFb2UrHpNwBTITvXYLiP5vnbFZyU+M78lhPeceFF71r3yLq8jo15HILa7sBN65ijjlx11unY7P4WYmMmgD0zjzeJ37v5lnecdBq+weHM67wnxfTLYtaM4FYJFAj+VOYYfYoNzMvlvb/4hX+fFftRfoCqHur1SyiMK8ZkajDZWjGEcVEDboIGCDp2FgWAaIhanRk4HXDm4dEFAqw0DKERYFoHMO4HeCCFn5zgnvzqTcdH4XYFnUY00NETP04bItctBz2QuE7P7GlGLy2qv/3225+/dvVhhx263g8MShQ5BRT/GYrZWbxKPH3FyptvvnXpUj8wyLmP08l2VBgEiwT6PACgv39iEMikoY2IGb5kXv/o+iMOf/Jll1506iknbbvttv79u5GOYnlqiweK2267Db+WwWNb7m6VWasAd0TCt/rlB+x//rnn7PTEJ/q3m05uKmGvdJbS6OniMbLhnc6frL6AicbO2nXXXfANfm98rd2IbyVxEQiQguANwT14LFlzLm5ZeHgInj6XlM2KRcT/QERvMVCh1eAWljrulzRHKpYEt9OCjRs24Tbwhte/+r2XXYKXaKgU1gM2YApsfMYf9Nj4+HaNC+y99947N8cvBDlpCpbx+7K99tzjvLWrf+3XnsQvBElXyAFjejVlTnH0j/QMiDzdJbM4dNYBRNPMDJLYb999zz939ZOetOumTVgDYY3BWavTAXv/tu//AA/O69atw8RaBkMJnkxdPzGZmAq7lgMlG9DaiQ9DJsMY75fwaPCMZzz9/e9992tf86pFixcjSej96Z3tEp5JCiX2O347tPa8d958yy16tPOVq4D0w0Vtp52euHrVWcuXH4AXtCDXgX4AC3XaPAwEq8Qdwb/A6XE5q7EWmA6niPqjFTyo4d3IOavO3HHHZfp2XjdD7mPv38WLl+BtIu6E+BUMvi514TJzqZw+ozi4g9jUgD4PMhehBaEPdvqyZdu/7YTjL7nofF4b16/nxs/MAcAHTP7U0ELA9P75PZe//6qrv7J0yVI6kBifdmCaeO5YtXLFkU89AiFaakNYc9BTsykaEXcZR3zpUVoJMep4g8oaFbg8aOIDw9FHnXnGaXivG5dCPlUTDhy35/w8vhN99nOff+/lH8Svt7guMaeeh8pwoxiIEHsgK+K7nq5VMnnjH3vsc/7r+9/7x694OUJ0G1NsTijE6R1iYct//BOf/KtPfdrfcuvcUkQG3rplC779nLXi1N989rO66jNN5+iEhwFosR5tAHIW/k+WxeV+wnlCoUQiWFwpyIjfKf7Wsc859eQTscHxXMTwsayWOcC7gY99/K/+8hOf9HlNzOAgUmj0oByEZrbWSAo/KDXEH5jssvPO+N0y7of77LM3Hwp0diYb4ZZBSif5j2Pgbe7SpV/84j9il+DrfdxvIhID0RGv+WZmTj7p7S98wW+j+mFkprQOMk7HipUK9Vk6DBZqCv4eOMBoYPdJvYJFUGIQGwn9u995Ed6TXHzJZbNzftHfZaU/QMPfH+Lsxg3jBc9/HtZMfmbBCuVZAzrlNIiqSTZNAvjlbmbmd1503Ote+2q8HcO37o1b8IctQE/JvFRVqS4/7P3FeJd+3jsv5l9C5L3KSDnyZMA7vhPe+qY/eOnv4X1iJqNb3WNUH5iKZXyLmDnyrf3/x9FNan4el+A/+g9/iL/+xF9C4LdXLETMQDD+amkWr+zXnvvOnXfa6cinPVUvpbEZYG07QClmdi0zfvHBoa3DOQOGcHgOecPrX3vcC54PDV6fwY0BuZrTVkBszqgRS8JX2Z/+9Ger1px3//0P4M1uWPss5hfgmva6174Kv8RG2l5gpYpmcGjsSUEfG6sQiq4ZUyIBb4nmQGuh0COhrCWMAKgCsvwvr/yTV/yn/wiBfCiUd2ucdDN4MP2Xhx5auXrtnXf9WG9RppJR2d3NIzOtJ4mw8XEt/ve//5IPffDyF7/oOAxxaG7KSJQYNk0mak0xYwgsvjPj+8rqNef/8Ic/4t9OO2GSEC6y+Q0bN7z8ZX/0mle9km/oDEjOUQ8fFdjqtrGSir02iMnzX8ojjDxHbDGE1QCP6RqZOb8agZtvdN/0xtfxPNWfOwjbAJDwhH73j+9eueqc+x94wG9RqiKwmlwCJxqJoez88CqMnb7ffvu+8/w1uOjjTOK1uKsI8P1RbFCWXAUiuWgvvOTSr1339bzxAuuMSAYvXHBe+vsveetb3ohfGPgPSR0FvqNwgJemhMinLgeDTPQuqDITlKOxM32gHwA1sIZtusz4JnzSiSe86IUvaNfKNPvmtmTpkhtuuGnN2gs2bd6E5+6qSOSaHXjxgSueJjEz/r3mwjk85HzgfZcde+xzMcRF2RmkR+BraGGEgdLpQI8Lzp/9+Uc/8/ef4y97tcxoGJYXPHrjXnXcbz/v5He8HUosP1VZSmAmmQnQMTBhkBVIb43rvxua6ADmsLish09alCZYNU5uwimjLrjUnHHqyc/5t/8G50Ga2QvPguNNFv544tJ3X84FwH+/l74wJj+HcUAFDC4Chxxy0CUXnn/i296CP+7E/VaxCk8Gf6ASW3O3ZKtlY5DD3/3vz3zkv/0FLoZFpBxIAA1Or2c/6xk41fAIh0nRd8jeBxLzxJKQFz8oOyUco9sTfyVJQHeANBXy7EwhgmsUWcvaOXID4bkCf1P2nZu+e/fdP9F7CHhnFurxQvvG73xnu223PfroowYXcYUpNrztwivlw5986MoVp++3/374ZhtPuoSx7s42cx4PRVYzagIuOPjl4jlrL9iydQsWmFxJ5R5b5ylPORyPtvjnAsP0WsAK6ijTW5crodlHXjMPPLhuYseougCqH5KGFtdInqVVUEKLubmh7nidcuJJp9188y345VHEFLGJ/GR9xumnvOR3X4x3Z30sM7pd98gjT9hxR1yCeS2KQBHFADoyvi4dw1T6tCzDBTfbO+68681vfTv+rgJJYrv0MBDhEeuAA/Z710UX7L777ngzQX4eRTCYMAxKA1ZlRZTKY5dU9wXNtPUURFg7+jti01Litg1HnwIOJFCWZeAxg/fAT9p113PXnM1fYfu5KNDs4I7djaJefMm7v/3t6/3rPc0gWErGX1+Byu8VVISyaGQ4dLpsMysdUJQMRcn4KnvvL+47a9Wae35+D2RX34xukeqee+xx3ppV+EMVPc6Jjv6M4V2HUblA0C7njlScqj4wQoWveIpMQryZEXEzk8X0GYbMviuVoc1IjsyiZ4DMbaW3hnvhRNZW4sNiEBs8P48LETb4irNW//BHt+u3ygGA3R/mhoNDboFMQ7FMIpEwCYTYSHiHsHJ2FlfzCy9+F/6YBa/qRAyUiOnJp7idd+ZfzC8/4AC812v+wd4U4msB0uCaR7LihaZSs1NrYwGA4wOZD9QtRShCzDkx115Fap80DjOIhAGweGF34IHL16w+64k7PUEvTeWDNxbaKMBgDf7pn3669tzz77vvAf+NW88CBvOwPJJdr0wjso6kYhQzMbzp8Dcsc3OXXnb5FVdcid9T4kuvSeKmor+d2W67bZEqrv64CjXHJk2pJjNUxrltmWYsbXOsUpaKNzAsgH1bX/YpArD8wML5UtK8pwSjtZUIz6NHPOVwnNR4i8s/qGX18U+0vAbzuArh/eK3vnX9mrXn45TXX0UNgnOGUkBQYMWFytrEKhcOYo8407QiIqr/P/A26lN/g5cNKrr+NMKJCrzDDtuvXrni6U8/Bk9ZyV2s4FXwDNsZcqadqhOdAVandBY4nrn/wXW5bsIhhiPDmEtjAudZ0/lXCabEre/Ou+7C132sAU8kzQc8EPznbLjLHnTQcvz2Kp64uxgtKSlrKhhVYhSYvxXRdRwo99Zbb7sNfyEJGO4o+Nth/AO9ygJM2++w/QH774/X/UEbbB0HRCptDz1HUMdosmMpx9ogmbIAABdVMY/8gxHagjrASOOhnV1uXGH4W9aJw9WCAb9dwvk0QgRD1noUJcjgY5zGPaaXcdd1Jsq9ORiDk5PP+955TqJBKulhpFL/6gIJzJ7/f8LNNw1tNuNwGrOIggY+tltuQPLVtCOUZoVbHEzp7ck5AFu7BL7lRKmURdvZxaBriGE9xjFKg3+R4HWSRo6mxwXZ0IjWDyuU8cQVYdlC4+3lJZRtjDRHtu0v44rIc2WQkHi9tiylh8qvVguFTwycBGsl63ydXaXPuxAHVNspO+olwyTqMHcrIYgbGgsAGXTWQGnZbWhllaYcR+XuyYQO/uJrsysoCEPuqg/nFtpMBKlGmn13E7bZ8O4CTbUZWQj+j0OzNJdKg6YupMVCl+ArteksE4mfzlfsjFVeE1Z5OLZ9JQdHaYrTSGfNVgatb9MNMUQUfwOlNAR7I7lYiahexauRBJLzMRS9idi6uJAat9PsNXTXIigYkcLIW7KHRRyARkn2cFEvORVk19Er4NC50yyN021ASQnUoGypbZHNOHpgTDx7L35qlFNmYTaZwk6NtBi3WHayaVLr/ytD6E3U08nRHrKz1PpYl7OI642USFcMRkY6eT6kW/A6SSFpKWFa6nKBg8g16DQZselD4mVNxnTjWW1b5qKozTHUgUrQOGxPb770K6bRORX66YQ4A5ylW2C1qemTpbPMFhiH5AAHKIu1+fVKOgDiaz2d7VLBekJTDQI4THp51CKmtdebX5q4dtV8nJfdiwTh/GlknQOUXaoJyXX02NUuwgRlL39ZJYWPeKHln6U4Br9K8X8YFbAygVoUSdr1CSY25TRzbB29zZAYjOiikGFNU7pnX44lmM3DRDESNGjNU8lbb3Df2rFI7FtsElwKMCUKCnxMDR0FDse+BigfuyqlJKkY0nIBfDAaVQ0nALW68w5M6SKIJp4YklgrNYAckUU+lWsJpurblkGraVAaZsCIEKYeVFnYBSZ5EYIfI0swRi0tmQB7/BhMKyqr4ibAqg5QvqqmHJs3GQYHafyP8AHSpYIaO1BSGDT8JI10jaWGIbDDD8PrqM0jTaFhM6KClVAmg6W3cTDPUDnKqIWN5tyHXSxNcoT2NOmhiH4mJqZLYOzi6AnwKDAxYHB8yoT9ANkfr6JKg5tw5mQ2xw25vLv4pkgFgaVhvHBpczcV1AMo/QOaYrpyrKOze9wrIMew14YnQimsTLz9aBSsxpeyMyWjvodbn9a4hwU/O9JE6Og6Yy/CakByxVhbGjrfhG0cMsWKOVCZgNQeKasCJDl6IWFVQaUHvk6ELrXwyblpzeCcVGCqq0jT0Z93PXE6tYgYAwK6A4ErdanhGGb3aC0oRtqkLBOSaobw7lPqZZl7NIy2U2mptdDFPUA6GyKCzuCCWgDeHxZURSUrjugoaoaAR0FVxSExUd1RvhGj/tSgnUYIgGjFIkHhRSMDdQEoHFQmrxAEyay1bWroYqB9I9rW0KNhxwMQZsQE5VgUDggVPgkIbg65AAN82NiplgDlJ9wRkPnH/gxmYsRjsMVw6CgzVljQOTh9Q8crgMW8OjIVaPJcKR+liCYc1YuHCvNCSDMZ2oiGdiQDnFwvmFJnqTsHXPDi73hLV94sYRAFgzHhhDBcgDZqceGnB9zwLkYgcGQOZYWOkTDmHAhpW6lCSk1MQNzJoWUntF3cEq7iAxO+fdhRZj27PDMWDR0hbaOhcvbf3sVEgkAdF4YOfuzvpmeQudoFrrkisJLi/jGqUuaw//8TllNiCPanj0CV6Kg071iRWwiLBDFHFTuFimN6tSSMn7Z+sgS6OWlrcZd4VjL01ixUsTsRwIO5gQlhVDBBKb2HpZeRrhKmVblOfxiF6s6Y4ARx0UYyHPNfSToXjCxEFHUpw9IVk9rEytKwOT/bwVlBOwxFnTA0dpjM2mtHW2ybFiTo1IU2SEiqA+rYpqlpPV1qT9QcoAzeQCbEPZzawStkBG7KkkATvnTST+dt0SvEgOSKS5AZWhZNgsUDtBZqB+TS2flf18blJDhF3GXKSM7eUdUSlJUBwHC03nS0tgM4QYOTRp8uhGhUdx3fWgLYGJSASYfUPaSTY+NHWjQ81i5AqDgLub/0FBTjjk5JuoFW2aGhK0GNwspA0KTJsYPwmIknCWuETzQJR1YUc0i7DiJTKa8KWzzCJaYjIRw7P7zIUnJs/nTqYohswNg0FbpU4s4LELTYIRnOYEdgqbU50qgFILTLAO40exNRajZK+PH+kwCFdeySlTKO5peyXQSjcQSQNc6NOkXGpB0xzuCegRZwgn2Uh9QJxbYbnLpmCA926dyoU+OEPUqr+xjledmxMLZDC9NWJc7RfBVRrlgirxLwQVvxvarkoMrWdvZAFw60E0QUD3JacqtB0kAVbFAXDAKvyxyXrlG0CtK1rokCpJtYpREBgDzjOQXzooWuMTWopAzLAO3gqMvHHMlkw3iy6axqiE041Q1D/UpSm8buSgp6JBprIh+xEMaDISKYFY/dFinCj1xIEWZ2LUzHlhE7FUXllx641NJ/2hqHm6iBUelDpy7Ci3AifigKA4/HwrToipIbr7nm5D1h0QgEBC5BI1oN6Rt603DgrYOxLGF2x9ZA9VXcZpVXQKRFw2F6QfRRLqPqTwCh0I5ONztyNAGFTsnHfqc9MO7Q4hMESD6M5OqPabdV+/mMD2x69wk1uUIbjQWInd5H4tUDNMkEgWIMuw60helDmEs7U6JAPPuRaIej3FP0KRQsy1EKxeQo9j44kG3lAUMHJaVNjM1RHL0cqsQZiFHPacyE1wiS9uwz2qBvRkj534RtSmC196ApJQTP0PEqag1LU5EmNXUeEjNiT7eIqC4gw7oJCAvpCQiQ1gCKyajJXLsXEDiNjm79giICDHERuFMygSlHRVOm2EOg84fgyhOq+rOULmD9P0ADq8zCgZPVFqYw8QGBk7FJcRhtysFYw0MaOIZlEjCAy4ymOdDMLJ2BBunRLyDPpoIkgL3rOAg7xKEOtg7V5piim1wYuJOBnZKgAEecAXZnSwCO4iMSAy0nlWnw1bldo6HXwhAiOYaJL0ey+4hQGvTyUKHlH6rK3eSoOt0d1bIR1Q7ZM6WhNqaetZDvAKGLZ1GmME7PLr1jys4PbShyOfGHydK1tAZbAQOuQcWLJaCaJQaZbRaSlLoyERFBg6ZGJYwRAspqqgBa44iZEvuIJ9XQCo9UoILOz3kjZAqmClyEIis0zZ/6KEUyBiYNRHgBO0CFh9FHGZUOkqhLEO3dc1pm4gWBTcnYvWz0ceAExJMSAufuoD1/LHE4+pBIBwLAVFkalkb1VhkHOWfNcN4rqLP0nI7suYXMShu/i3GEH+6l/oBvuvdqynQxx8gi5WMZR9gYKqj8Bo+hSBUWGzOzdqFh4vaPDoOSIMCjsrAeLVRsY6YWSaLgZqOcQwDagQ2lPWV7Qho4vJRVVYehVN3kUQbmzUCici65OkATo0sNUi58sjxOD3AWhgw9sun7MvYIvQsa+CQFU+BXRyxJb3dmaDPFtmRDIN0ZyThKRLLTp2RoICeqhSrJeLlGUxPuSRKg4nviSQoTXvNnMdhHKvQhSEA0hWkrKBNxUw/6aJfkduXYbGobjyJGWjDV7LgAmVmGkCsGnLnJOrxA4e5CqEBc4NDaMcjgz3BpYm+V7aIPqLoEc0JlRIKxgdrpJHTQJntHNKlqOQxtHElDQGdiUMUdl6eLQny6ZN/MvaMn7Rwik/DFAqgmzY8rEmyN1LcXgchrZ5vF3W2pxhQon9FVzmafIpGSSKFrDaCFQi2y9wQaSpUacpGm1WZomzRVpexmgANBw3BKZwpNlT9tUZwYks/k5MmqhhGcpOUCeEah15hTr6AlGNGjKePHn0bQS0REnszn/+VwEHhGaCTkZRAhnhxCD0Tk6q5LvBOJQVU6jd1dqVRHH5330OPmbmRlAsGPNBCSJINiLJVWhN8DMJqojdXCkdQQcAWwx8PmDxP0NCKAFD6hCtF7Tp0RkExHJUbTYSTTrAPTKdLUFLxQsBBWhTFC/OVkwRDG6JxrOLyxh0cPVXLWt9bVKBIamIw+0eAxNIuafmn3GA5OSAIWS9POxUyfwpJW+AGL78/TnYYUkdZA6fjII4WwcmI6lFJ6KgpMheYerAFEuyXXcI1F1wHoFxOiQzo57C9vFZqw5pxJW+NfSQZAKGY+DEQPB7bBO8UamZJS2wznXe8f6wWcDrOjLR+oLYfSs7UbXVyBQMWdpncWYlTEoZ0szpkSZKcOUGyImort2ZpF7ZBwOEo4ezMFLcYNqcfbhApGG394D8gMOE7Z5mToJ+CSNA3HPkJAMPtpHBSQIWH3lSOGYYOQEsgslsZDTSrr7DgwBBTR0w2ilZGSusgrVQVIPhpGmA7b5hewCp8g91DzVBNTsLHLicQMiK0EKPJtaKcwV7Vk0NxyVYkewkdDudqt8ZYXdx+N7WhkkjwM/yEyPMkFd50pAtilMUriQsrA8k1F9A6aHZHjiAT1E2xyj+68EMof0Q8Cd6jeiHtAD+tRJUsgb8ctjommXLq04UQ1fpp7LETBMR3OCAcw0fTVYGRhiiLgRPsoLoeiAw3iCwg66vDT3/amwZpDkxqTPJohpIxYIevG41ybf6VBKM6Afi5ECZlbvuI4ao+FzLn0CLh67AutLjgDAAakjwIoEj0gUPY4CbtRcOjBruSGp6ptzqTpLggE4Kc2m9PTqksdWVOemLjDuJrk0bitoPFpMAOjxSmoaVUmcjeDE66bsC06ryMZToNhrOuu3YZyJXQNbZu5CpbZgIkwAINHDrZ6GqxJhEi1DML3NQ0SdIWzAGSUtQwA6SiFwlJVGQ7tGrWmoYKBHabAuSQnw1qG5I+MgOF/sOR+iNOAelay56b/6G1o0jsZBqHUnCxDqeWlXYBwqw0lB5ioh0wcZX8xCY1DVCuXGkEQcxBTD9EjbwiwhCCndCdEMMNVjvATDg0defTFkMKNks1x0oZJRUyb5qWBTyeIgmM0oM6VcMQ2LYGRJn4foJlErOq8iuam0oaijqHZwwkgEOagDwyl1GhUnuQLrL3SUZPSDmps8E9H7yTxhEfnSFHDElroxqAIBUNO4q6EZXEW1ULXErDcYE0C3l/Le3ySCMYmfkCI/zLC/wU62ehXq7au0QAAAABJRU5ErkJggg==';

    const ASPECTS = [
      { id: '16:9', ratio: 16 / 9, label: '16:9', nameKey: 'aspect.tv' },
      { id: '2.39:1', ratio: 2.39, label: '2.39:1', nameKey: 'aspect.cinemaWide' },
      { id: '21:9', ratio: 21 / 9, label: '21:9', nameKey: 'aspect.cinema' },
      { id: '4:3', ratio: 4 / 3, label: '4:3', nameKey: 'aspect.classic' },
      { id: '1:1', ratio: 1, label: '1:1', nameKey: 'aspect.square' },
      { id: '3:4', ratio: 3 / 4, label: '3:4', nameKey: 'aspect.portraitThreeFour' },
      { id: '4:5', ratio: 4 / 5, label: '4:5', nameKey: 'aspect.portrait' },
      { id: '9:16', ratio: 9 / 16, label: '9:16', nameKey: 'aspect.vertical' },
    ];
    const ASPECT_BY_ID = new Map(ASPECTS.map((aspect) => [aspect.id, aspect]));
    const FPS_OPTIONS = [24, 25, 30, 60];
    const RESOLUTIONS = ['1080p', '4k'];
    const QUALITIES = ['high', 'medium', 'low'];
    const SCENE_TYPES = new Set(['waves', 'coast', 'sun', 'type', 'orbit', 'grid', 'glass']);
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;
    const WAVEFORM_BUCKETS = 120;
    const DEFAULT_PALETTE = ['#0e1b24', '#3f8af7', '#e5c7a5', '#f3ede5'];
    const REFERENCE_KINDS = new Set(['image', 'video']);
    const AUDIO_KINDS = new Set(['audio']);

    const zh = {
      'panel.label': 'DeepSeekDesign',
      'project.untitled': '未命名项目',
      'project.namePlaceholder': '项目名称',
      'project.manage': '项目管理',
      'project.menu': '项目菜单',
      'project.load': '导入为新项目…',
      'project.export': '导出项目文件',
      'project.invalid': '不是有效的 DeepSeekDesign 项目文件',
      'project.tooLarge': '项目文件过大，无法加载',
      'project.busy': '正在导入素材，请稍候',
      'project.operationBusy': '正在处理项目文件，请稍候',
      'project.loaded': '已导入为新项目',
      'project.exported': '项目已导出',
      'project.mediaOmitted': '有素材因体积或存储原因未嵌入',
      'project.posterOmitted': '有视频封面因体积未嵌入',
      'project.scope': '项目范围',
      'project.scopeHint': '项目按工作区管理，同一工作区的所有会话共享这些项目',
      'project.backupAuto': '每分钟自动备份项目',
      'project.backupLast': '上次备份：{time}',
      'project.backupNone': '尚未生成备份',
      'project.backupTooLarge': '工程较大，备份已跳过',
      'project.backupClear': '清除所有备份',
      'project.backupClearConfirm': '清除本机保存的所有项目备份？该操作不可撤销。',
      'project.backupRestore': '恢复最近备份',
      'project.backupRestoreConfirm': '用最近一份备份覆盖当前项目？当前内容会先保存为一份备份；如果安全副本无法保存，将取消恢复。',
      'project.scope.unresolved': '工作区路径不可用，暂按未解析的工作区存放',
      'project.list': '项目列表',
      'project.current': '当前',
      'project.new': '新建项目',
      'project.delete': '删除项目',
      'project.deleteConfirm': '删除项目“{name}”？只删除工作台项目，不会删除 Harness 会话或聊天记录；素材和时间线不可恢复。',
      'project.deleted': '项目已删除',
      'project.created': '已新建项目',
      'project.switched': '已切换项目',
      'project.limit': '项目数量已达上限',
      'project.saveFailed': '项目保存失败，未切换',
      'project.unavailable': '项目数据不可用，已显示空白项目',
      'project.workspace': '工作区 · {name}',
      'preview.panel': '预览',
      'save.blank': '空白项目',
      'save.saving': '保存中',
      'save.saved': '已保存',
      'save.error': '未保存',
      'actions.export': '导出',
      'actions.import': '导入素材',
      'actions.retry': '重试',
      'actions.close': '关闭',
      'assets.title': '素材库',
      'assets.contextMenu': '素材操作',
      'assets.delete': '删除素材',
      'assets.deleteInUseConfirm': '此素材已被时间线使用 {count} 个片段，删除素材会同时移除这些片段，且无法撤销。继续？',
      'assets.selectAll': '全选',
      'assets.deselectAll': '取消全选',
      'assets.deleteSelection': '删除选中素材',
      'assets.selectionCount': '已选 {count} 项',
      'assets.deleteSelectedCount': '删除选中 ({count})',
      'assets.deleteSelectionConfirm': '删除选中的 {assets} 个素材？其中时间线上的 {clips} 个片段会被一并删除，且无法撤销。继续？',
      'assets.deletedCount': '已删除 {count} 个素材',
      'assets.autoImported': '已自动导入 {count} 个会话文件',
      'assets.autoImportFailed': '有 {count} 个会话文件导入失败',
      'assets.deleteConfirm': '删除这个素材？',
      'assets.deleteInUse': '素材已被时间线引用，请先框选删除相关片段',
      'assets.deleted': '素材已删除',
      'assets.sourceConversation': '会话素材',
      'assets.sourceExport': '项目成片',
      'session.open': '会话',
      'session.chatTitle': '当前会话',
      'session.openWorkbench': 'DeepSeekDesign',
      'assets.filterLabel': '文件类型',
      'assets.searchPlaceholder': '搜索素材',
      'assets.filter.all': '全部文件',
      'assets.filter.video': '视频',
      'assets.filter.audio': '音频',
      'assets.filter.image': '图片',
      'assets.filter.generation': '生成结果',
      'assets.drop': '松开以导入参考',
      'assets.importing': '正在导入素材',
      'assets.draft': '草稿',
      'assets.applied': '已应用',
      'assets.scenes': '个镜头',
      'assets.missing': '素材不可用',
      'preview.tab.asset': '素材',
      'preview.tab.timeline': '时间线',
      'preview.emptyTitle': '从一句话开始',
      'preview.emptyBody': '在会话里描述你想看到的动画，或者先导入一张参考图。',
      'preview.describe': '打开会话',
      'preview.import': '导入参考',
      'preview.noPicture': '时间线里还没有画面',
      'preview.audioOnly': '当前时间线只有声音',
      'preview.assetEmpty': '选择一个素材进行预览',
      'preview.expand': '展开预览',
      'preview.collapse': '退出沉浸预览',
      'preview.aspect': '画幅',
      'transport.play': '播放',
      'transport.pause': '暂停',
      'transport.start': '回到开始',
      'transport.end': '跳到结尾',
      'transport.volume': '音量',
      'transport.mute': '静音',
      'transport.unmute': '取消静音',
      'chat.modelTitle': '模型选择',
      'chat.connected': 'DeepSeek Harness 已连接',
      'chat.connecting': '正在连接模型…',
      'chat.unavailable': '模型不可用',
      'chat.selectModel': '选择模型',
      'chat.modelsEmpty': '没有可用模型',
      'chat.noModel': '暂无可用的 Harness 模型。连接模型后重试，或使用本地草图。',
      'chat.placeholder': '描述你想怎么剪…',
      'chat.send': '发送',
      'chat.stop': '停止生成',
      'chat.localSketch': '使用本地草图',
      'chat.apply': '应用到时间线',
      'chat.discard': '放弃草稿',
      'chat.applied': '已应用',
      'chat.discarded': '已放弃',
      'chat.draftCard': '动画草稿',
      'chat.generationError': '生成失败',
      'chat.stopped': '生成已停止',
      'chat.draftReady': '动画已生成。',
      'chat.localReply': '已用本地草图生成预览。连接模型后可继续细化。',
      'chat.localNote1': '本地构图与配色',
      'chat.localNote2': '可直接编辑',
      'chat.localNote3': '可继续用对话修改',
      'tool.exporting': '正在准备导出视频…',
      'tool.rendering': '正在渲染视频',
      'tool.ready': '已导出到素材库',
      'tool.failed': '视频导出失败',
      'tool.retry': '重试导出',
      'tool.openWorkbench': '打开工作台',
      'tool.duration': '时长',
      'tool.cancelled': '已取消',
      'tool.pending': '等待导出',
      'chat.refresh': '刷新模型连接',
      'chat.upload': '上传',
      'chat.resizeComposer': '拖动调整输入框高度',
      'chat.skill': 'Skill',
      'chat.skillTitle': '使用 Skill',
      'chat.skillSearch': '搜索 Skill',
      'chat.skillEmpty': '没有可用的 Skill',
      'chat.skillNoMatch': '没有匹配的 Skill',
      'chat.skillLimit': '最多选择 2 个 Skill',
      'chat.reference': '参考',
      'chat.contextTimeline': '当前时间线',
      'chat.dropAsset': '松开以添加到会话',
      'chat.assetAttached': '已添加到会话附件',
      'chat.assetAttachFailed': '无法读取素材文件',
      'chat.conversationFileImported': '会话文件已导入素材库',
      'chat.conversationFileFailed': '无法导入会话文件',
      'chat.remove': '移除',
      'chat.assistant': 'DeepSeekDesign',
      'chat.localSource': '本地草图',
      'model.default': '默认',
      'model.loading': '正在读取模型…',
      'model.reasoning': '推理等级',
      'model.back': '返回',
      'activity.composing': '正在生成动画…',
      'timeline.title': '时间线',
      'timeline.trackVideo': '视频',
      'timeline.trackAudio': '音频',
      'timeline.trackMusic': '配乐',
      'timeline.emptyVideo': '拖入生成结果',
      'timeline.emptyAudio': '拖入音频',
      'timeline.emptyMusic': '拖入音频或添加配乐',
      'timeline.addMusic': '添加配乐',
      'timeline.split': '在播放头分割',
      'timeline.undo': '撤销',
      'timeline.redo': '重做',
      'timeline.zoom': '时间线缩放',
      'timeline.zoomIn': '放大时间线',
      'timeline.zoomOut': '缩小时间线',
      'timeline.trimStart': '修剪片头',
      'timeline.trimEnd': '修剪片尾',
      'timeline.selected': '已选片段',
      'timeline.keyboardMove': '方向键移动片段，Tab 可聚焦修剪手柄',
      'timeline.delete': '删除片段',
      'timeline.deleteSelected': '删除选中片段',
      'timeline.selectedCount': '已选',
      'timeline.linkedAudio': '视频内嵌音频',
      'timeline.bedName': '程序化配乐',
      'export.title': '导出',
      'export.subtitle': '按时间线实时渲染，导出期间请保持页面可见。',
      'export.resolution': '分辨率',
      'export.fps': '帧率',
      'export.quality': '画质',
      'export.aspect': '画幅',
      'export.followTimeline': '跟随时间线',
      'export.high': '高',
      'export.medium': '中',
      'export.low': '低',
      'export.estimated': '预计大小',
      'export.start': '开始导出',
      'export.exporting': '正在导出',
      'export.cancel': '取消导出',
      'export.cancelled': '导出已取消',
      'export.libraryAdded': '已加入素材库',
      'export.libraryFailed': '成片已下载，但加入素材库失败',
      'export.tabHidden': '页面进入后台，导出已停止。请保持页面可见后重试。',
      'export.done': '导出完成',
      'export.noVideo': '请先将至少一个镜头加入时间线。',
      'export.unsupported': '当前浏览器不支持视频导出。',
      'export.failed': '导出失败',
      'export.emptyRecording': '录制没有产生任何视频数据，请重试或降低分辨率。',
      'export.tooLarge': '预计文件超过 4 GB。请缩短时间线，或降低分辨率/码率后再导出。',
      'export.audioWarning': '浏览器无法混入音频，已导出无声视频。',
      'export.willDownload': '完成后会自动下载。',
      'export.retry': '再试一次',
      'aspect.tv': '电视',
      'aspect.cinemaWide': '宽银幕',
      'aspect.cinema': '电影',
      'aspect.classic': '经典',
      'aspect.square': '社交方形',
      'aspect.portraitThreeFour': '竖版 3:4',
      'aspect.portrait': '社交竖版',
      'aspect.vertical': '短视频竖屏',
      'toast.imported': '素材已导入',
      'toast.videoAdded': '视频已加入时间线',
      'toast.videoAudioAdded': '视频和音频已加入时间线',
      'toast.shortClip': '视频短于 0.5 秒，已按最短片段放置，尾部会定格在最后一帧。',
      'toast.conversationAdded': '会话文件已加入时间线',
      'toast.importPartial': '部分素材未能导入',
      'toast.applied': '草稿已应用到时间线',
      'toast.discarded': '草稿已放弃',
      'toast.audioAdded': '音频已加入轨道',
      'toast.musicAdded': '配乐已添加',
      'toast.saveFailed': '无法保存到本机，本次会话仍可用。',
      'toast.mediaMissing': '有素材在刷新后不可用，请重新导入。',
      'toast.backupRestored': '已恢复最近备份',
      'toast.backupRestoreFailed': '恢复备份失败，请重试',
      'toast.backupRestoreUnsafe': '无法保存恢复前快照（工程过大或存储已满），已取消恢复，当前工程未改动。',
      'toast.backupFailed': '项目备份失败，请检查浏览器存储空间',
      'toast.backupTooLarge': '工程文档超过 1 MiB，分钟备份已跳过该工程。',
      'toast.backupSettingsFailed': '无法保存备份开关设置，请检查浏览器存储空间。',
      'toast.backupCleared': '已清除本地项目备份。',
      'toast.mediaSessionOnly': '本机素材存储不可用，导入的素材仅在本次会话可用。',
      'toast.exported': '视频已导出',
      'toast.exportedLibrary': '视频已导出并加入素材库',
      'toast.referenceLimit': '最多同时使用 2 个 Skill',
      'toast.fileUnsupported': '不支持的文件类型',
      'toast.fileTooLarge': '文件太大',
      'toast.audioDecode': '音频无法解码',
      'toast.videoDecode': '视频无法读取',
      'toast.imageDecode': '图片无法读取',
      'error.generic': '发生未知错误。',
      'error.request': '请求模型失败。',
      'error.parse': '模型返回的内容无法解析为动画。',
      'media.videoRef': '视频参考',
      'media.imageRef': '图片参考',
      'media.audioRef': '音频',
    };
    const en = {
      'panel.label': 'DeepSeekDesign',
      'project.untitled': 'Untitled project',
      'project.namePlaceholder': 'Project name',
      'project.manage': 'Projects',
      'project.menu': 'Project menu',
      'project.load': 'Import as new project…',
      'project.export': 'Export project file',
      'project.invalid': 'This is not a valid DeepSeekDesign project file',
      'project.tooLarge': 'This project file is too large to load',
      'project.busy': 'Media import is in progress. Try again in a moment.',
      'project.operationBusy': 'A project file operation is already in progress.',
      'project.loaded': 'Imported as a new project',
      'project.exported': 'Project exported',
      'project.mediaOmitted': 'Some media was not embedded because of its size or storage state',
      'project.posterOmitted': 'Some video posters were not embedded because of the size budget',
      'project.scope': 'Project scope',
      'project.scopeHint': 'Projects are managed per Workspace; every Session in it shares them',
      'project.backupAuto': 'Back up the project every minute',
      'project.backupLast': 'Last backup: {time}',
      'project.backupNone': 'No backup yet',
      'project.backupTooLarge': 'Project is large; backups are skipped',
      'project.backupClear': 'Clear all backups',
      'project.backupClearConfirm': 'Clear every locally stored project backup? This cannot be undone.',
      'project.backupRestore': 'Restore latest backup',
      'project.backupRestoreConfirm': 'Replace the current project with the latest backup? The current content is saved as a backup first; if that safety copy cannot be stored, the restore is cancelled.',
      'project.scope.unresolved': 'Workspace path unavailable; projects use an unresolved Workspace for now',
      'project.list': 'Project list',
      'project.current': 'Current',
      'project.new': 'New project',
      'project.delete': 'Delete project',
      'project.deleteConfirm': 'Delete “{name}”? Only the workbench project is removed; Harness Sessions and chat history are kept. Assets and timeline cannot be recovered.',
      'project.deleted': 'Project deleted',
      'project.created': 'New project created',
      'project.switched': 'Project switched',
      'project.limit': 'Project limit reached',
      'project.saveFailed': 'Project could not be saved; the switch was cancelled',
      'project.unavailable': 'Project data was unavailable; showing a blank project',
      'project.workspace': 'Workspace · {name}',
      'preview.panel': 'Preview',
      'save.blank': 'Blank project',
      'save.saving': 'Saving',
      'save.saved': 'Saved',
      'save.error': 'Not saved',
      'actions.export': 'Export',
      'actions.import': 'Import',
      'actions.retry': 'Retry',
      'actions.close': 'Close',
      'assets.title': 'Asset library',
      'assets.contextMenu': 'Asset actions',
      'assets.delete': 'Delete asset',
      'assets.deleteInUseConfirm': 'This asset is used by {count} timeline clip(s). Deleting it also removes those clips and cannot be undone. Continue?',
      'assets.selectAll': 'Select all',
      'assets.deselectAll': 'Deselect all',
      'assets.deleteSelection': 'Delete selected assets',
      'assets.selectionCount': '{count} selected',
      'assets.deleteSelectedCount': 'Delete selected ({count})',
      'assets.deleteSelectionConfirm': 'Delete the {assets} selected assets? {clips} timeline clip(s) will also be removed, and this cannot be undone. Continue?',
      'assets.deletedCount': 'Deleted {count} assets',
      'assets.autoImported': 'Imported {count} conversation file(s)',
      'assets.autoImportFailed': 'Could not import {count} conversation file(s)',
      'assets.deleteConfirm': 'Delete this asset?',
      'assets.deleteInUse': 'This asset is used on the timeline. Delete its clips first.',
      'assets.deleted': 'Asset deleted',
      'assets.sourceConversation': 'From conversation',
      'assets.sourceExport': 'Project export',
      'session.open': 'Conversation',
      'session.chatTitle': 'Current conversation',
      'session.openWorkbench': 'DeepSeekDesign',
      'assets.filterLabel': 'File type',
      'assets.searchPlaceholder': 'Search assets',
      'assets.filter.all': 'All files',
      'assets.filter.video': 'Video',
      'assets.filter.audio': 'Audio',
      'assets.filter.image': 'Image',
      'assets.filter.generation': 'Generated',
      'assets.drop': 'Drop to import references',
      'assets.importing': 'Importing assets',
      'assets.draft': 'Draft',
      'assets.applied': 'Applied',
      'assets.scenes': 'scenes',
      'assets.missing': 'Media unavailable',
      'preview.tab.asset': 'Asset',
      'preview.tab.timeline': 'Timeline',
      'preview.emptyTitle': 'Start with one sentence',
      'preview.emptyBody': 'Describe the animation you want in the conversation, or import a reference first.',
      'preview.describe': 'Open conversation',
      'preview.import': 'Import reference',
      'preview.noPicture': 'No picture in this timeline yet',
      'preview.audioOnly': 'This timeline has sound only',
      'preview.assetEmpty': 'Select an asset to preview',
      'preview.expand': 'Expand preview',
      'preview.collapse': 'Exit immersive preview',
      'preview.aspect': 'Aspect',
      'transport.play': 'Play',
      'transport.pause': 'Pause',
      'transport.start': 'Back to start',
      'transport.end': 'Skip to end',
      'transport.volume': 'Volume',
      'transport.mute': 'Mute',
      'transport.unmute': 'Unmute',
      'chat.modelTitle': 'Model',
      'chat.connected': 'DeepSeek Harness connected',
      'chat.connecting': 'Connecting to models…',
      'chat.unavailable': 'Models unavailable',
      'chat.selectModel': 'Select model',
      'chat.modelsEmpty': 'No models available',
      'chat.noModel': 'No Harness model is available. Connect a model and retry, or use a local sketch.',
      'chat.placeholder': 'Describe how to shape it…',
      'chat.send': 'Send',
      'chat.stop': 'Stop generating',
      'chat.localSketch': 'Use local sketch',
      'chat.apply': 'Apply to timeline',
      'chat.discard': 'Discard draft',
      'chat.applied': 'Applied',
      'chat.discarded': 'Discarded',
      'chat.draftCard': 'Animation draft',
      'chat.generationError': 'Generation failed',
      'chat.stopped': 'Generation stopped',
      'chat.draftReady': 'Animation ready.',
      'chat.localReply': 'A local sketch is ready. Connect a model to refine it further.',
      'chat.localNote1': 'Local composition and palette',
      'chat.localNote2': 'Directly editable',
      'chat.localNote3': 'Continue with chat',
      'tool.exporting': 'Preparing video export…',
      'tool.rendering': 'Rendering video',
      'tool.ready': 'Saved to asset library',
      'tool.failed': 'Video export failed',
      'tool.retry': 'Retry export',
      'tool.openWorkbench': 'Open workbench',
      'tool.duration': 'Duration',
      'tool.cancelled': 'Cancelled',
      'tool.pending': 'Waiting to export',
      'chat.refresh': 'Refresh model connection',
      'chat.upload': 'Upload',
      'chat.resizeComposer': 'Resize input area',
      'chat.skill': 'Skill',
      'chat.skillTitle': 'Use a skill',
      'chat.skillSearch': 'Search skills',
      'chat.skillEmpty': 'No skills available',
      'chat.skillNoMatch': 'No matching skills',
      'chat.skillLimit': 'Choose up to 2 skills',
      'chat.reference': 'Reference',
      'chat.contextTimeline': 'Current timeline',
      'chat.dropAsset': 'Drop to attach to the conversation',
      'chat.assetAttached': 'Added to conversation attachments',
      'chat.assetAttachFailed': 'Could not read the asset file',
      'chat.conversationFileImported': 'Conversation file added to the library',
      'chat.conversationFileFailed': 'Could not import the conversation file',
      'chat.remove': 'Remove',
      'chat.assistant': 'DeepSeekDesign',
      'chat.localSource': 'Local sketch',
      'model.default': 'Default',
      'model.loading': 'Reading models…',
      'model.reasoning': 'Reasoning',
      'model.back': 'Back',
      'activity.composing': 'Generating animation…',
      'timeline.title': 'Timeline',
      'timeline.trackVideo': 'Video',
      'timeline.trackAudio': 'Audio',
      'timeline.trackMusic': 'Score',
      'timeline.emptyVideo': 'Drop a generated result',
      'timeline.emptyAudio': 'Drop audio',
      'timeline.emptyMusic': 'Drop audio or add a score',
      'timeline.addMusic': 'Add score',
      'timeline.split': 'Split at playhead',
      'timeline.undo': 'Undo',
      'timeline.redo': 'Redo',
      'timeline.zoom': 'Timeline zoom',
      'timeline.zoomIn': 'Zoom in timeline',
      'timeline.zoomOut': 'Zoom out timeline',
      'timeline.trimStart': 'Trim clip start',
      'timeline.trimEnd': 'Trim clip end',
      'timeline.selected': 'Selected clip',
      'timeline.keyboardMove': 'Arrow keys move this clip; Tab reaches the trim handles',
      'timeline.delete': 'Delete clip',
      'timeline.deleteSelected': 'Delete selected clips',
      'timeline.selectedCount': 'selected',
      'timeline.linkedAudio': 'Video audio',
      'timeline.bedName': 'Procedural score',
      'export.title': 'Export',
      'export.subtitle': 'Rendered in real time. Keep this page visible while exporting.',
      'export.resolution': 'Resolution',
      'export.fps': 'Frame rate',
      'export.quality': 'Quality',
      'export.aspect': 'Aspect',
      'export.followTimeline': 'Follow timeline',
      'export.high': 'High',
      'export.medium': 'Medium',
      'export.low': 'Low',
      'export.estimated': 'Estimated size',
      'export.start': 'Start export',
      'export.exporting': 'Exporting',
      'export.cancel': 'Cancel export',
      'export.cancelled': 'Export cancelled',
      'export.libraryAdded': 'Added to asset library',
      'export.libraryFailed': 'Exported, but could not add to the asset library',
      'export.tabHidden': 'The page went to the background, so export stopped. Keep it visible and try again.',
      'export.done': 'Export complete',
      'export.noVideo': 'Add at least one shot to the timeline first.',
      'export.unsupported': 'This browser does not support video export.',
      'export.failed': 'Export failed',
      'export.emptyRecording': 'Recording produced no video data; retry or lower the resolution.',
      'export.tooLarge': 'The estimated file exceeds 4 GB. Shorten the timeline or lower the resolution/bitrate before exporting.',
      'export.audioWarning': 'Audio could not be mixed in, so the video was exported silently.',
      'export.willDownload': 'The file downloads when it is ready.',
      'export.retry': 'Try again',
      'aspect.tv': 'TV',
      'aspect.cinemaWide': 'Widescreen',
      'aspect.cinema': 'Cinema',
      'aspect.classic': 'Classic',
      'aspect.square': 'Social square',
      'aspect.portraitThreeFour': 'Portrait 3:4',
      'aspect.portrait': 'Social portrait',
      'aspect.vertical': 'Vertical video',
      'toast.imported': 'Assets imported',
      'toast.videoAdded': 'Video added to timeline',
      'toast.videoAudioAdded': 'Video and audio added to timeline',
      'toast.shortClip': 'This video is shorter than 0.5 s; it was placed at the minimum clip length and the tail holds its last frame.',
      'toast.conversationAdded': 'Conversation file added to timeline',
      'toast.importPartial': 'Some assets could not be imported',
      'toast.applied': 'Draft applied to the timeline',
      'toast.discarded': 'Draft discarded',
      'toast.audioAdded': 'Audio added to track',
      'toast.musicAdded': 'Score added',
      'toast.saveFailed': 'Could not save locally; this session is still usable.',
      'toast.mediaMissing': 'Some media is unavailable after reload. Import it again.',
      'toast.backupRestored': 'Latest backup restored',
      'toast.backupRestoreFailed': 'Could not restore the backup; try again',
      'toast.backupRestoreUnsafe': 'The pre-restore safety copy could not be stored (project too large or storage full). Restore cancelled; the current project is unchanged.',
      'toast.backupFailed': 'Project backup failed; check the browser storage quota',
      'toast.backupTooLarge': 'Project documents over 1 MiB are skipped by minute backups.',
      'toast.backupSettingsFailed': 'Could not save the backup preference; check the browser storage quota.',
      'toast.backupCleared': 'Local project backups cleared.',
      'toast.mediaSessionOnly': 'Local media storage is unavailable. Imported media is only available this session.',
      'toast.exported': 'Video exported',
      'toast.exportedLibrary': 'Video exported and added to the library',
      'toast.referenceLimit': 'Use up to 2 skills',
      'toast.fileUnsupported': 'Unsupported file type',
      'toast.fileTooLarge': 'File is too large',
      'toast.audioDecode': 'Audio could not be decoded',
      'toast.videoDecode': 'Video could not be read',
      'toast.imageDecode': 'Image could not be read',
      'error.generic': 'Something went wrong.',
      'error.request': 'The model request failed.',
      'error.parse': 'The model response could not be read as animation.',
      'media.videoRef': 'Video reference',
      'media.imageRef': 'Image reference',
      'media.audioRef': 'Audio',
    };

    function tFor(localeId) {
      const dictionary = String(localeId || '').toLowerCase().startsWith('zh') ? zh : en;
      return (key) => dictionary[key] ?? en[key] ?? key;
    }
    function pickText(localeId, key) {
      return tFor(localeId)(key);
    }
    function localeIdOf(ctx) {
      try {
        const snapshot = ctx.locale.getLocale();
        return typeof snapshot?.active === 'string' ? snapshot.active : 'en';
      } catch {
        return 'en';
      }
    }

    // ---------------------------------------------------------------------
    // Pure utilities shared by rendering, editing, persistence and export.
    // The block below is deliberately DOM-free so it can be exercised in Node.
    // @@CORE_START
    function clamp(value, min, max) {
      if (!Number.isFinite(value)) return min;
      return Math.min(max, Math.max(min, value));
    }

    function roundSeconds(value) {
      return Math.round(value * 1000) / 1000;
    }

    function uid(prefix) {
      const random = Math.random().toString(36).slice(2, 9);
      return `${prefix}-${Date.now().toString(36)}-${random}`;
    }

    function formatTimecode(seconds, framesPerSecond) {
      const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
      const totalWhole = Math.floor(safe + 1e-7);
      const minutes = Math.floor(totalWhole / 60);
      const secs = totalWhole % 60;
      const base = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (framesPerSecond === undefined || framesPerSecond === null) return base;
      const frames = Math.min(framesPerSecond - 1, Math.floor((safe - totalWhole) * framesPerSecond));
      return `${base}:${String(frames).padStart(2, '0')}`;
    }

    function formatDuration(seconds) {
      const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
      if (safe >= 3600) {
        const hours = Math.floor(safe / 3600);
        const minutes = Math.floor((safe % 3600) / 60);
        return `${hours}:${String(minutes).padStart(2, '0')}:00`;
      }
      return formatTimecode(safe);
    }

    function aspectRatio(aspectId) {
      return ASPECT_BY_ID.get(aspectId)?.ratio ?? 16 / 9;
    }

    function closestAspectFor(width, height) {
      const w = Number(width);
      const h = Number(height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
      const ratio = w / h;
      let best = ASPECTS[0];
      let bestDistance = Math.abs(Math.log(best.ratio / ratio));
      for (const aspect of ASPECTS.slice(1)) {
        const distance = Math.abs(Math.log(aspect.ratio / ratio));
        if (distance < bestDistance) {
          best = aspect;
          bestDistance = distance;
        }
      }
      return best.id;
    }

    function makeEven(value) {
      const rounded = Math.max(2, Math.round(value));
      return rounded % 2 === 0 ? rounded : rounded - 1;
    }

    function exportDimensions(aspectId, tier) {
      const ratio = aspectRatio(aspectId);
      const shortEdge = tier === '4k' ? 2160 : 1080;
      let width;
      let height;
      if (ratio >= 1) {
        height = shortEdge;
        width = shortEdge * ratio;
      } else {
        width = shortEdge;
        height = shortEdge / ratio;
      }
      return { width: makeEven(width), height: makeEven(height) };
    }

    function videoBitrateFor(tier, quality) {
      const table = tier === '4k'
        ? { high: 48_000_000, medium: 28_000_000, low: 16_000_000 }
        : { high: 16_000_000, medium: 10_000_000, low: 6_000_000 };
      return table[quality] ?? table.medium;
    }

    function audioBitrateFor(quality) {
      return quality === 'high' ? 192_000 : quality === 'low' ? 96_000 : 128_000;
    }

    function estimatedExportBytes(durationSeconds, tier, quality) {
      const video = videoBitrateFor(tier, quality);
      const audio = audioBitrateFor(quality);
      const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
      return Math.max(0, (video + audio) * duration / 8);
    }

    function humanBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '—';
      const mb = bytes / (1024 * 1024);
      if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
    }

    function hashString(value) {
      let hash = 2166136261;
      const text = String(value ?? '');
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function seededRandom(seed) {
      let state = (seed >>> 0) || 0x9e3779b9;
      return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) % 1_000_000) / 1_000_000;
      };
    }

    function pickPalette(prompt, seed) {
      const text = String(prompt ?? '').toLowerCase();
      if (/sunset|sunrise|warm|日落|黄昏|暖|夕阳/.test(text)) return ['#1b120e', '#ff9d5c', '#ffd6a0', '#fff4e8'];
      if (/night|star|space|夜|星|宇宙/.test(text)) return ['#06080f', '#4776ff', '#7fd3ff', '#eef4ff'];
      if (/forest|green|自然|森林|叶/.test(text)) return ['#07120f', '#36a47a', '#a6e3c0', '#f2fff8'];
      if (/technology|cyber|code|科技|代码|赛博/.test(text)) return ['#05080d', '#2d7dff', '#78e7ff', '#edf8ff'];
      if (/ocean|sea|wave|海|浪|水/.test(text)) return ['#07141c', '#2f81c9', '#c5e5ea', '#f4f3ea'];
      const palettes = [
        ['#0d141b', '#3f8af7', '#d6b98c', '#f6f1e7'],
        ['#121017', '#8e7dff', '#f0a8c2', '#f8f2ff'],
        ['#111411', '#78b892', '#d9d2b4', '#f7f5ea'],
        ['#151013', '#e47955', '#e9bd91', '#fff3e8'],
      ];
      return palettes[seed % palettes.length];
    }

    function normalizePalette(input, fallback) {
      const values = Array.isArray(input)
        ? input.filter((color) => typeof color === 'string' && HEX_COLOR.test(color)).slice(0, 4)
        : [];
      return values.length === 4 ? values : fallback.slice();
    }

    function normalizeSpec(input, fallbackTitle) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
      const palette = normalizePalette(input.palette, DEFAULT_PALETTE);
      const scenes = [];
      const rawScenes = Array.isArray(input.scenes) ? input.scenes.slice(0, 6) : [];
      let total = 0;
      for (const raw of rawScenes) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
        if (!SCENE_TYPES.has(raw.type)) continue;
        const duration = roundSeconds(clamp(Number(raw.duration), 2, 12));
        if (total + duration > 60) break;
        total += duration;
        scenes.push({
          type: raw.type,
          title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
          subtitle: typeof raw.subtitle === 'string' ? raw.subtitle.slice(0, 160) : '',
          duration,
          intensity: clamp(Number(raw.intensity), 0.1, 1),
          seed: Math.round(clamp(Number(raw.seed), 0, 2_147_483_647)),
        });
        if (scenes.length >= 6) break;
      }
      if (scenes.length === 0) return null;
      return {
        title: typeof input.title === 'string' && input.title.trim().length > 0
          ? input.title.trim().slice(0, 120)
          : (fallbackTitle || 'Untitled sequence'),
        palette,
        scenes,
      };
    }

    function sequenceDuration(spec) {
      if (spec === null || !Array.isArray(spec.scenes)) return 0;
      return spec.scenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
    }

    function sceneAt(spec, time) {
      if (spec === null || !Array.isArray(spec.scenes) || spec.scenes.length === 0) return null;
      let cursor = 0;
      const safeTime = Math.max(0, Number(time) || 0);
      for (let index = 0; index < spec.scenes.length; index += 1) {
        const scene = spec.scenes[index];
        const end = cursor + scene.duration;
        if (safeTime < end || index === spec.scenes.length - 1) {
          return { scene, index, localTime: Math.max(0, safeTime - cursor), sceneStart: cursor, sceneEnd: end };
        }
        cursor = end;
      }
      return null;
    }

    function sceneTypeFromPrompt(prompt) {
      const text = String(prompt ?? '').toLowerCase();
      if (/wave|sea|ocean|海|浪|水/.test(text)) return ['coast', 'waves', 'sun'];
      if (/sun|light|光|日落|日出/.test(text)) return ['sun', 'glass', 'coast'];
      if (/type|title|字|标题|排版/.test(text)) return ['type', 'grid', 'glass'];
      if (/space|night|star|星|夜|宇宙/.test(text)) return ['orbit', 'glass', 'grid'];
      if (/grid|code|tech|代码|科技/.test(text)) return ['grid', 'type', 'orbit'];
      return ['glass', 'waves', 'type'];
    }

    function localSketch(prompt, localeId) {
      const seed = hashString(prompt || 'deepseek-design');
      const palette = pickPalette(prompt, seed);
      const kinds = sceneTypeFromPrompt(prompt);
      const titles = [
        (String(prompt || '').trim().split(/[\n。.!?！？]/)[0] || '').slice(0, 18),
        '',
        '',
      ];
      const scenes = kinds.map((type, index) => ({
        type,
        title: titles[index] || '',
        subtitle: '',
        duration: index === kinds.length - 1 ? 4 : 5,
        intensity: 0.35 + (seed % 40) / 100,
        seed: (seed + index * 977) % 2_147_483_647,
      }));
      return {
        title: pickText(localeId, 'chat.localSource'),
        palette,
        scenes,
      };
    }

    function localGenerationText(localeId) {
      return {
        reply: pickText(localeId, 'chat.localReply'),
        notes: [
          pickText(localeId, 'chat.localNote1'),
          pickText(localeId, 'chat.localNote2'),
          pickText(localeId, 'chat.localNote3'),
        ],
      };
    }

    function trackClips(timeline, track) {
      return Array.isArray(timeline?.[track]) ? timeline[track] : [];
    }

    function clipsOfTimeline(timeline) {
      return [...trackClips(timeline, 'video'), ...trackClips(timeline, 'audio'), ...trackClips(timeline, 'music')];
    }

    function assetReferenceCount(timeline, assetId) {
      if (typeof assetId !== 'string' || assetId.length === 0) return 0;
      let count = 0;
      for (const track of ['video', 'audio', 'music']) {
        for (const clip of trackClips(timeline, track)) {
          if (clip.assetId === assetId) count += 1;
        }
      }
      return count;
    }

    function clipEnd(clip) {
      return (Number(clip?.start) || 0) + (Number(clip?.duration) || 0);
    }

    function timelineIsEmpty(timeline) {
      return trackClips(timeline, 'video').length === 0
        && trackClips(timeline, 'audio').length === 0
        && trackClips(timeline, 'music').length === 0;
    }

    function timelineDuration(timeline) {
      let max = 0;
      for (const clip of clipsOfTimeline(timeline)) max = Math.max(max, clipEnd(clip));
      return roundSeconds(max);
    }

    function hasVideo(timeline) {
      return trackClips(timeline, 'video').some((clip) => Number(clip.duration) > 0.05);
    }

    function overlaps(start, duration, clip, ignoreId) {
      if (clip.id === ignoreId) return false;
      const end = start + duration;
      return start < clipEnd(clip) - 1e-6 && end > (Number(clip.start) || 0) + 1e-6;
    }

    function findFreeStart(clips, desiredStart, duration, ignoreId) {
      const safeDuration = Math.max(MIN_CLIP_SECONDS, Number(duration) || 0);
      const desired = clamp(Number(desiredStart) || 0, 0, MAX_TIMELINE_SECONDS);
      const others = clips.filter((clip) => clip.id !== ignoreId);
      if (!others.some((clip) => overlaps(desired, safeDuration, clip))) return roundSeconds(desired);
      const candidates = new Set([0]);
      for (const clip of others) {
        candidates.add(roundSeconds(clipEnd(clip)));
        candidates.add(roundSeconds(Math.max(0, (Number(clip.start) || 0) - safeDuration)));
      }
      const sorted = [...candidates].filter((candidate) => candidate >= 0).sort((a, b) => {
        const distance = Math.abs(a - desired) - Math.abs(b - desired);
        return distance || a - b;
      });
      for (const candidate of sorted) {
        if (!others.some((clip) => overlaps(candidate, safeDuration, clip))) return roundSeconds(candidate);
      }
      const end = others.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
      return roundSeconds(end);
    }

    function insertionIndexFor(clips, dropTime) {
      const safeDrop = Number(dropTime) || 0;
      let index = 0;
      for (const clip of clips) {
        if (safeDrop >= (Number(clip.start) || 0) + (Number(clip.duration) || 0) / 2) index += 1;
      }
      return index;
    }

    /**
     * Place a moved clip. Free space wins; dropping over occupied space becomes a
     * track reorder. The reorder lays the affected track out sequentially so clips
     * never overlap on one track.
     */
    function placeMovedClip(clips, clipId, desiredStart, dropTime) {
      const moving = clips.find((clip) => clip.id === clipId);
      if (moving === undefined) return clips;
      const others = clips.filter((clip) => clip.id !== clipId).sort((a, b) => a.start - b.start);
      const duration = Number(moving.duration) || 0;
      const desired = clamp(Number(desiredStart) || 0, 0, MAX_TIMELINE_SECONDS);
      if (!others.some((clip) => overlaps(desired, duration, clip))) {
        return [...others, { ...moving, start: roundSeconds(desired) }].sort((a, b) => a.start - b.start);
      }
      const ordered = [...others].sort((a, b) => a.start - b.start);
      const index = Math.max(0, Math.min(ordered.length, insertionIndexFor(ordered, Number(dropTime) || desired)));
      ordered.splice(index, 0, { ...moving });
      // Lay the reordered track out from the track's original start — including the
      // moved clip — so dragging the first clip over a later clip reorders the
      // track in place instead of pushing the whole track right and adding a
      // leading gap.
      let cursor = others.length > 0
        ? Math.max(0, Math.min(Number(moving.start) || 0, ...others.map((clip) => Number(clip.start) || 0)))
        : Math.max(0, Number(moving.start) || 0);
      return ordered.map((clip) => {
        const placed = { ...clip, start: roundSeconds(cursor) };
        cursor += Math.max(MIN_CLIP_SECONDS, Number(clip.duration) || 0);
        return placed;
      });
    }

    function splitClipAt(clip, atTime) {
      if (clip === null || typeof clip !== 'object') return null;
      const start = Number(clip.start) || 0;
      const duration = Number(clip.duration) || 0;
      const local = Number(atTime) - start;
      if (!Number.isFinite(local) || local < MIN_CLIP_SECONDS || duration - local < MIN_CLIP_SECONDS) return null;
      const boundary = roundSeconds(start + local);
      const clipEndTime = roundSeconds(start + duration);
      if (boundary - start < MIN_CLIP_SECONDS || clipEndTime - boundary < MIN_CLIP_SECONDS) return null;
      const left = { ...clip, id: `${clip.id}-a-${Date.now().toString(36)}`, duration: roundSeconds(boundary - start) };
      const right = {
        ...clip,
        id: `${clip.id}-b-${Date.now().toString(36)}`,
        start: boundary,
        sourceIn: roundSeconds((Number(clip.sourceIn) || 0) + (boundary - start)),
        duration: roundSeconds(clipEndTime - boundary),
      };
      return { left, right };
    }

    function clampTrim(clip, edge, desiredEdgeTime, neighbors) {
      const start = Number(clip.start) || 0;
      const duration = Number(clip.duration) || 0;
      const sourceIn = Number(clip.sourceIn) || 0;
      const sourceDuration = Math.max(duration, Number(clip.sourceDuration) || duration);
      const previousEnd = neighbors?.previousEnd ?? 0;
      const nextStart = neighbors?.nextStart ?? Number.POSITIVE_INFINITY;
      if (edge === 'start') {
        const maxStart = start + duration - MIN_CLIP_SECONDS;
        const minStart = Math.max(previousEnd, start - sourceIn, 0);
        // A desired edge of exactly 0 is a valid trim target; `Number(x) || start`
        // would silently replace it with the current start (0.9.5 CC-1).
        const requestedStart = Number(desiredEdgeTime);
        const nextStartValue = clamp(Number.isFinite(requestedStart) ? requestedStart : start, minStart, maxStart);
        const delta = nextStartValue - start;
        return {
          start: roundSeconds(nextStartValue),
          sourceIn: roundSeconds(Math.max(0, sourceIn + delta)),
          duration: roundSeconds(Math.max(MIN_CLIP_SECONDS, duration - delta)),
        };
      }
      const minEnd = start + MIN_CLIP_SECONDS;
      const maxEnd = Math.min(nextStart, start + (sourceDuration - sourceIn));
      const requestedEnd = Number(desiredEdgeTime);
      const endValue = clamp(Number.isFinite(requestedEnd) ? requestedEnd : clipEnd(clip), minEnd, maxEnd);
      return {
        start: roundSeconds(start),
        sourceIn: roundSeconds(sourceIn),
        duration: roundSeconds(Math.max(MIN_CLIP_SECONDS, endValue - start)),
      };
    }

    function normalizeClip(raw, generationsById, assetsById) {
      if (raw === null || typeof raw !== 'object') return null;
      const track = raw.track;
      if (track !== 'video' && track !== 'audio' && track !== 'music') return null;
      const rawDuration = Number(raw.duration);
      if (!Number.isFinite(rawDuration) || rawDuration <= 0) return null;
      const duration = Math.min(rawDuration, MAX_TIMELINE_SECONDS);
      const start = clamp(Number(raw.start) || 0, 0, MAX_TIMELINE_SECONDS);
      const kind = raw.kind;
      if (track === 'video' && kind !== 'generation' && kind !== 'asset') return null;
      const generation = kind === 'generation' ? generationsById.get(raw.generationId) : null;
      if (kind === 'generation') {
        if (generation === null || generation === undefined) return null;
        const scene = generation.spec.scenes[raw.sceneIndex];
        if (scene === undefined) return null;
        const sourceIn = clamp(Number(raw.sourceIn) || 0, 0, Math.max(0, scene.duration - 0.5));
        return {
          id: typeof raw.id === 'string' ? raw.id : uid('clip'),
          kind: 'generation',
          track: 'video',
          generationId: generation.id,
          sceneIndex: raw.sceneIndex,
          name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name.slice(0, 80) : (scene.title || generation.title),
          start: roundSeconds(start),
          sourceIn: roundSeconds(sourceIn),
          duration: roundSeconds(Math.max(MIN_CLIP_SECONDS, Math.min(duration, Math.max(MIN_CLIP_SECONDS, scene.duration - sourceIn)))),
          sourceDuration: roundSeconds(scene.duration),
          seed: scene.seed,
        };
      }
      if (track === 'video' && kind === 'asset') {
        const asset = assetsById.get(raw.assetId);
        if (asset === undefined || asset.kind !== 'video') return null;
        const sourceDuration = Math.max(MIN_CLIP_SECONDS, Number(asset.duration) || Number(raw.sourceDuration) || duration);
        const sourceIn = clamp(Number(raw.sourceIn) || 0, 0, Math.max(0, sourceDuration - MIN_CLIP_SECONDS));
        return {
          id: typeof raw.id === 'string' ? raw.id : uid('clip'),
          kind: 'asset',
          track: 'video',
          assetId: asset.id,
          name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name.slice(0, 80) : asset.name,
          start: roundSeconds(start),
          sourceIn: roundSeconds(sourceIn),
          duration: roundSeconds(Math.max(MIN_CLIP_SECONDS, Math.min(duration, Math.max(MIN_CLIP_SECONDS, sourceDuration - sourceIn)))),
          sourceDuration: roundSeconds(sourceDuration),
        };
      }
      if (track === 'video') return null;
      if (kind === 'bed') {
        // A split/trim-start score clip keeps its offset inside the generated
        // bed: clamp against sourceDuration, not against the clip duration.
        const bedSourceDuration = Math.max(MIN_CLIP_SECONDS, duration, Number(raw.sourceDuration) || duration);
        const bedSourceIn = clamp(Number(raw.sourceIn) || 0, 0, Math.max(0, bedSourceDuration - MIN_CLIP_SECONDS));
        return {
          id: typeof raw.id === 'string' ? raw.id : uid('clip'),
          kind: 'bed',
          track,
          name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name.slice(0, 80) : 'Score',
          start: roundSeconds(start),
          sourceIn: roundSeconds(bedSourceIn),
          // 0.9.5 CC-2: a reloaded/imported project must keep the 0.5 s clip
          // invariant on every lane, including the background score bed.
          duration: roundSeconds(Math.max(MIN_CLIP_SECONDS, Math.min(duration, Math.max(MIN_CLIP_SECONDS, bedSourceDuration - bedSourceIn)))),
          sourceDuration: roundSeconds(bedSourceDuration),
          seed: Math.round(clamp(Number(raw.seed), 0, 2_147_483_647)),
        };
      }
      if (kind !== 'audio') return null;
      const asset = assetsById.get(raw.assetId);
      if (asset === undefined || asset.kind !== 'audio') return null;
      const sourceDuration = Math.max(MIN_CLIP_SECONDS, Number(asset.duration) || Number(raw.sourceDuration) || duration);
      const sourceIn = clamp(Number(raw.sourceIn) || 0, 0, Math.max(0, sourceDuration - MIN_CLIP_SECONDS));
      return {
        id: typeof raw.id === 'string' ? raw.id : uid('clip'),
        kind: 'audio',
        track,
        assetId: asset.id,
        name: asset.name,
        start: roundSeconds(start),
        sourceIn: roundSeconds(sourceIn),
        duration: roundSeconds(Math.max(MIN_CLIP_SECONDS, Math.min(duration, Math.max(MIN_CLIP_SECONDS, sourceDuration - sourceIn)))),
        sourceDuration: roundSeconds(sourceDuration),
      };
    }
    // @@CORE_END

    function cx(...values) {
      return values.filter(Boolean).join(' ');
    }

    function isAspect(value) {
      return typeof value === 'string' && ASPECT_BY_ID.has(value);
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    }

    function sanitizeFilename(name) {
      return String(name || 'deepseek-design').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 64);
    }

    function guessFileKind(file) {
      const type = String(file?.type || '').toLowerCase();
      if (type.startsWith('image/')) return 'image';
      if (type.startsWith('video/')) return 'video';
      if (type.startsWith('audio/')) return 'audio';
      const name = String(file?.name || '').toLowerCase();
      if (/\.(png|jpe?g|webp|gif|avif)$/.test(name)) return 'image';
      if (/\.(mp4|mov|m4v|webm)$/.test(name)) return 'video';
      if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
      return null;
    }

    function bytesForFile(file) {
      return Number(file?.size) || 0;
    }

    function chooseRecorderMime(withAudio) {
      if (typeof MediaRecorder === 'undefined') return '';
      const candidates = withAudio
        ? [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ]
        : [
          'video/mp4;codecs=avc1.42E01E',
          'video/mp4',
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
      for (const type of candidates) {
        try {
          if (MediaRecorder.isTypeSupported(type)) return type;
        } catch {
          // Continue to the next candidate.
        }
      }
      return '';
    }

    function extensionForMime(mime) {
      return String(mime || '').startsWith('video/mp4') ? 'mp4' : 'webm';
    }

    function previewBackingSize(aspectId, quality) {
      const ratio = aspectRatio(aspectId);
      const longEdge = quality < 0.8 ? 1100 : 1600;
      if (ratio >= 1) {
        return { width: makeEven(longEdge), height: makeEven(longEdge / ratio) };
      }
      return { width: makeEven(longEdge * ratio), height: makeEven(longEdge) };
    }

    function frameFits(containerWidth, containerHeight, aspectId, padding) {
      const ratio = aspectRatio(aspectId);
      const maxWidth = Math.max(80, containerWidth - padding * 2);
      const maxHeight = Math.max(60, containerHeight - padding * 2);
      let width = Math.min(maxWidth, maxHeight * ratio);
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
    }

    function clampPercent(value) {
      return clamp(Number(value) || 0, 0, 100);
    }

    const CSS_BASE = `
      .dsd-root {
        /* Fixed dark palette aligned to the Harness dark theme. */
        --dsd-bg: #151517;
        --dsd-bg-deep: #0f1115;
        --dsd-panel: #1b1b1c;
        --dsd-panel-2: #232324;
        --dsd-raised: #2c2c2e;
        --dsd-glass: rgba(35, 35, 36, 0.96);
        --dsd-line: rgba(255, 255, 255, 0.059);
        --dsd-line-strong: rgba(255, 255, 255, 0.16);
        --dsd-text: #f9fafb;
        --dsd-text-2: #cfd3d6;
        --dsd-text-3: #adb2b8;
        --dsd-blue: #5686fe;
        --dsd-blue-light: #7aaaff;
        --dsd-blue-soft: color-mix(in srgb, var(--dsd-blue) 16%, transparent);
        --dsd-green: #22c55e;
        --dsd-red: #f25a5a;
        --dsd-warn: #f59e0b;
        --dsd-radius-xl: 14px;
        --dsd-radius-lg: 12px;
        --dsd-radius-md: 10px;
        --dsd-radius-sm: 8px;
        --dsd-topbar-h: 56px;
        --dsd-assets-w: clamp(220px, 17%, 280px);
        --dsd-chat-w: clamp(340px, 31%, 440px);
        --dsd-timeline-h: 292px;
        --dsd-previewbar-h: 42px;
        --dsd-previewbar-bg: #232324;
        box-sizing: border-box;
        height: 100%;
        width: 100%;
        min-height: 0;
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        color: var(--dsd-text);
        background: var(--dsd-bg);
        font-family: var(--dsh-font-family-text, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif);
        font-size: 13px;
        line-height: 1.45;
        color-scheme: dark;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        container-type: inline-size;
      }
      .dsd-root *, .dsd-root *::before, .dsd-root *::after { box-sizing: border-box; }
      .dsd-root ::selection { background: rgba(86, 134, 254, 0.35); color: #fff; }
      .dsd-root button, .dsd-root input, .dsd-root textarea { font: inherit; color: inherit; }
      .dsd-root button { border: 0; background: transparent; padding: 0; cursor: pointer; }
      .dsd-root button:disabled { cursor: default; opacity: 0.38; }
      .dsd-root button:focus-visible, .dsd-root input:focus-visible, .dsd-root textarea:focus-visible, .dsd-root [tabindex]:focus-visible {
        outline: 2px solid var(--dsd-blue-light);
        outline-offset: 2px;
      }
      .dsd-root input, .dsd-root textarea { border: 0; outline: 0; }
      .dsd-root input::placeholder, .dsd-root textarea::placeholder { color: var(--dsd-text-3); opacity: 1; }
      .dsd-root svg { display: block; flex: none; }
      .dsd-root [hidden] { display: none !important; }
      .dsd-root * { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.14) transparent; }
      .dsd-root *::-webkit-scrollbar { width: 6px; height: 6px; }
      .dsd-root *::-webkit-scrollbar-track { background: transparent; }
      .dsd-root *::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 999px; }
      .dsd-root *::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.22); }
      .dsd-icon { color: currentColor; }
      .dsd-wordmark {
        display: flex;
        align-items: baseline;
        gap: 0.3em;
        color: var(--dsd-text);
        font-family: var(--dsh-font-family-text, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif);
        font-size: clamp(14px, 1.3cqi, 18px);
        font-weight: 620;
        line-height: 1;
        letter-spacing: -0.035em;
        white-space: nowrap;
      }
      .dsd-wordmark span {
        color: var(--dsd-text-2);
        font-weight: 380;
        letter-spacing: -0.02em;
      }

      .dsd-topbar {
        height: var(--dsd-topbar-h);
        flex: none;
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 0 16px;
        position: relative;
        z-index: 25;
        background: var(--dsd-panel);
        border-bottom: 1px solid var(--dsd-line);
        -webkit-app-region: drag;
      }
      .dsd-topbar button, .dsd-topbar input, .dsd-topbar .dsd-project { -webkit-app-region: no-drag; }
      html[data-platform="darwin"]:not([data-fullscreen]) .dsd-topbar { padding-left: 88px; }
      html[data-fullscreen] .dsd-topbar { padding-left: 16px; }
      .dsd-brand { display: flex; align-items: center; gap: 9px; min-width: 0; flex: none; }
      .dsd-topdivider { width: 1px; height: 20px; flex: none; background: var(--dsd-line); }
      .dsd-project { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 0 1 auto; position: relative; }
      .dsd-projectname {
        width: clamp(84px, 13cqi, 220px);
        min-width: 0;
        padding: 3px 5px;
        border-radius: 5px;
        background: transparent;
        color: var(--dsd-text);
        font-size: 12.5px;
        line-height: 1.3;
        font-weight: 450;
        text-overflow: ellipsis;
      }
      .dsd-projectname::placeholder { color: var(--dsd-text-2); opacity: 1; }
      .dsd-projectname:hover { background: var(--dsd-panel-2); }
      .dsd-projectname:focus { background: var(--dsd-panel-2); outline: 1px solid var(--dsd-blue); outline-offset: 0; }
      .dsd-projectmenu { position: relative; display: flex; align-items: center; flex: none; }
      .dsd-project-popover {
        top: calc(100% + 7px);
        right: 0;
        left: auto;
        width: min(320px, calc(100vw - 24px));
        max-height: min(62vh, 520px);
        overflow: auto;
        padding: 6px;
      }
      .dsd-projectitem {
        width: 100%;
        height: 32px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px;
        border-radius: 6px;
        color: var(--dsd-text-2);
        font-size: 12px;
        text-align: left;
      }
      .dsd-projectitem:hover { color: var(--dsd-text); background: var(--dsd-panel-2); }
      .dsd-projectitem .dsd-icon { color: var(--dsd-text-3); }
      .dsd-project-scope {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px 4px;
      }
      .dsd-project-scope-label {
        color: var(--dsd-text-2);
        font-size: 10.5px;
        letter-spacing: 0.02em;
      }
      .dsd-project-scope-value {
        max-width: 62%;
        color: var(--dsd-text-3);
        font-size: 10.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dsd-project-scope-hint {
        padding: 2px 8px;
        color: var(--dsd-text-3);
        font-size: 10px;
        line-height: 1.45;
      }
      .dsd-project-scope-hint + .dsd-project-scope-hint { padding-top: 0; }
      .dsd-project-scope-note { color: var(--dsd-text-2); opacity: 0.72; }
      .dsd-project-backup { padding: 6px 8px 2px; }
      .dsd-project-list {
        display: flex;
        flex-direction: column;
        gap: 1px;
        max-height: 214px;
        overflow: auto;
        margin: 6px 0 2px;
        padding: 2px 0;
      }
      .dsd-project-row {
        display: flex;
        align-items: center;
        gap: 2px;
        border-radius: 6px;
        min-width: 0;
      }
      .dsd-project-row:hover { background: var(--dsd-panel-2); }
      .dsd-project-row.is-active { background: rgba(86, 134, 254, 0.12); }
      .dsd-project-row-main {
        min-width: 0;
        flex: 1;
        height: 32px;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 0 8px;
        border-radius: 6px;
        color: var(--dsd-text-2);
        font-size: 12px;
        text-align: left;
      }
      .dsd-project-row.is-active .dsd-project-row-main { color: var(--dsd-text); }
      .dsd-project-row-main .dsd-icon { flex: none; color: var(--dsd-text-3); }
      .dsd-project-row.is-active .dsd-project-row-main .dsd-icon { color: var(--dsd-blue-light); }
      .dsd-project-row-name {
        min-width: 0;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsd-project-row-current {
        flex: none;
        color: var(--dsd-blue-light);
        font-size: 9.5px;
      }
      .dsd-project-row-delete {
        flex: none;
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border-radius: 5px;
        color: var(--dsd-text-3);
        opacity: 0;
      }
      .dsd-project-row:hover .dsd-project-row-delete,
      .dsd-project-row-delete:focus-visible { opacity: 1; }
      .dsd-project-row-delete:hover { color: var(--dsd-red); background: rgba(239, 68, 68, 0.12); }
      .dsd-project-empty {
        padding: 12px 8px;
        color: var(--dsd-text-3);
        font-size: 11px;
        text-align: center;
      }
      .dsd-project-new { color: var(--dsd-text); }
      .dsd-project-sep { height: 1px; margin: 4px 6px; background: rgba(127, 127, 127, 0.18); }
      .dsd-save {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--dsd-text-3);
        font-size: 10.5px;
        white-space: nowrap;
      }
      .dsd-save.is-saved { color: #96a5b8; }
      .dsd-save.is-error { color: var(--dsd-red); }
      .dsd-savedot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsd-text-3); }
      .dsd-save.is-saved .dsd-savedot { background: var(--dsd-green); box-shadow: 0 0 8px rgba(34, 197, 94, 0.42); }
      .dsd-save.is-saving .dsd-savedot { background: var(--dsd-blue-light); animation: dsd-pulse 1.2s ease-in-out infinite; }
      .dsd-save.is-error .dsd-savedot { background: var(--dsd-red); }
      .dsd-save-action { flex: none; height: 32px; padding: 0 4px; gap: 6px; }
      .dsd-save-action .dsd-savedot { width: 6px; height: 6px; }
      .dsd-topspacer { flex: 1; min-width: 12px; }
      .dsd-topactions { display: flex; align-items: center; gap: 8px; flex: none; }
      .dsd-topaction {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 32px;
        min-width: 96px;
        padding: 0 12px;
        border-radius: 8px;
        color: var(--dsd-text-2);
        background: transparent;
        border: 0.5px solid transparent;
        font-size: 11.5px;
        font-weight: 500;
        white-space: nowrap;
        transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
      }
      .dsd-topaction:hover:not(:disabled) { color: var(--dsd-text); background: rgba(255, 255, 255, 0.06); border-color: var(--dsd-line); }
      .dsd-topaction .dsd-icon { color: var(--dsd-text-3); }
      .dsd-topaction:hover:not(:disabled) .dsd-icon { color: var(--dsd-text-2); }
      .dsd-topaction.is-primary {
        color: #dbeafe;
        background: rgba(86, 134, 254, 0.14);
        border-color: rgba(122, 170, 255, 0.24);
      }
      .dsd-topaction.is-primary:hover:not(:disabled) { color: #f2f7ff; background: rgba(86, 134, 254, 0.22); border-color: rgba(122, 170, 255, 0.36); }
      .dsd-topaction.is-primary .dsd-icon { color: var(--dsd-blue-light); }
      .dsd-topaction.is-danger:hover:not(:disabled) { color: #ffe3e5; background: rgba(242, 90, 90, 0.15); border-color: rgba(242, 90, 90, 0.28); }
      .dsd-topaction.is-danger:hover:not(:disabled) .dsd-icon { color: #ffb9be; }

      .dsd-iconbtn {
        width: 28px; height: 28px;
        border-radius: 8px;
        display: inline-grid;
        place-items: center;
        color: var(--dsd-text-2);
        transition: color 160ms ease, background 160ms ease;
      }
      .dsd-iconbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.065); color: var(--dsd-text); }
      .dsd-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        height: 30px;
        padding: 0 13px;
        border-radius: 8px;
        color: #fff;
        background: linear-gradient(180deg, #6f9dff, #4f7ff0);
        border: 0.5px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 5px 16px rgba(47, 112, 234, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.22);
        font-size: 11.5px;
        font-weight: 550;
      }
      .dsd-primary:hover:not(:disabled) { filter: brightness(1.06); }
      .dsd-primary:active:not(:disabled) { transform: translateY(0.5px); filter: brightness(0.98); }
      .dsd-softbtn {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        height: 30px; padding: 0 11px;
        border-radius: 8px;
        color: var(--dsd-text);
        background: rgba(255, 255, 255, 0.055);
        border: 0.5px solid var(--dsd-line);
      }
      .dsd-softbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.085); }
      .dsd-narrowonly { display: none !important; }
      .dsd-drawer-backdrop { display: none; }
      .dsd-spin { animation: dsd-spin 0.9s linear infinite; }
      @keyframes dsd-spin { to { transform: rotate(360deg); } }
      @keyframes dsd-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
      @keyframes dsd-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
      @keyframes dsd-menu-in { from { opacity: 0; transform: translateY(4px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes dsd-toast-in { from { opacity: 0; transform: translateY(7px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

      .dsd-main {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: var(--dsd-assets-w) minmax(0, 1fr) var(--dsd-chat-w);
        grid-template-rows: minmax(0, 1fr) min(var(--dsd-timeline-h), 46%);
        grid-template-areas:
          "assets preview chat"
          "timeline timeline chat";
      }
      .dsd-panel { min-width: 0; min-height: 0; }
      .dsd-assets {
        grid-area: assets;
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: var(--dsd-panel);
        border-right: 1px solid var(--dsd-line);
        padding: 0 12px 0;
        position: relative;
        animation: dsd-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .dsd-preview {
        grid-area: preview;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        background: var(--dsd-bg);
        position: relative;
        animation: dsd-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .dsd-timeline {
        grid-area: timeline;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        background: var(--dsd-panel);
        border-top: 1px solid var(--dsd-line);
        border-right: 1px solid var(--dsd-line);
        animation: dsd-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
    `;

    const CSS_PANELS = `
      .dsd-panelhead {
        height: 56px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        padding: 2px 2px 0;
      }
      .dsd-paneltitle {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.01em;
        line-height: 1.2;
        color: var(--dsd-text);
      }
      .dsd-search {
        height: 34px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        border-radius: var(--dsd-radius-sm);
        color: var(--dsd-text-3);
        background: var(--dsd-panel-2);
        border: 1px solid var(--dsd-line);
        transition: border-color 160ms ease, background 160ms ease;
      }
      .dsd-search:focus-within { border-color: var(--dsd-blue); background: var(--dsd-panel-2); }
      .dsd-search input {
        min-width: 0;
        width: 100%;
        padding: 0;
        line-height: 1.3;
        background: transparent;
        color: var(--dsd-text);
        font-size: 12px;
      }
      .dsd-assetactions { margin-left: auto; display: flex; align-items: center; gap: 4px; flex: none; }
      .dsd-assetaction {
        height: 26px;
        min-width: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 0 6px;
        border-radius: 7px;
        color: var(--dsd-text-2);
        background: transparent;
        border: 0.5px solid transparent;
        font-size: 10.5px;
        white-space: nowrap;
      }
      .dsd-assetaction:hover:not(:disabled) { color: var(--dsd-text); background: rgba(255, 255, 255, 0.06); border-color: var(--dsd-line); }
      .dsd-assetaction:disabled { opacity: 0.35; }
      .dsd-assetaction.is-danger { color: #f2b7bc; }
      .dsd-assetaction.is-danger:hover:not(:disabled) { color: #ffe3e5; background: rgba(242, 90, 90, 0.14); border-color: rgba(242, 90, 90, 0.24); }
      .dsd-assetaction .dsd-icon { color: var(--dsd-text-3); }
      .dsd-assetaction.is-danger .dsd-icon { color: #ef8f98; }
      .dsd-filterwrap { position: relative; flex: none; padding: 10px 0 9px; }
      .dsd-filterbtn {
        width: 100%;
        height: 36px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 13px;
        border-radius: var(--dsd-radius-sm);
        color: var(--dsd-text);
        background: var(--dsd-panel-2);
        border: 1px solid var(--dsd-line);
        font-size: 12.5px;
        text-align: left;
      }
      .dsd-filterbtn:hover { background: var(--dsd-raised); border-color: var(--dsd-line-strong); }
      .dsd-filtericon { color: var(--dsd-text-2); flex: none; }
      .dsd-filterlabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-filtercount { color: var(--dsd-text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
      .dsd-filterchev { color: var(--dsd-text-3); flex: none; }
      .dsd-asset-filter-popover { top: calc(100% + 6px); left: 0; right: 0; z-index: 75; max-height: 260px; overflow-y: auto; }
      .dsd-filteritem {
        width: 100%;
        height: 36px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 13px;
        border-radius: 7px;
        color: var(--dsd-text-2);
        font-size: 12px;
        text-align: left;
      }
      .dsd-filteritem:hover { background: var(--dsd-panel-2); color: var(--dsd-text); }
      .dsd-filteritem.is-selected { background: var(--dsd-blue-soft); color: var(--dsd-text); }
      .dsd-filteritem-icon { color: var(--dsd-text-3); flex: none; }
      .dsd-filteritem-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-filteritem-count { color: var(--dsd-text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
      .dsd-filteritem-check { color: var(--dsd-blue-light); flex: none; }

      .dsd-asset-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        margin: 0 -12px;
        padding: 1px 12px 12px;
        position: relative;
      }
      .dsd-asset-scroll.is-marquee { user-select: none; cursor: crosshair; }
      .dsd-asset-marquee {
        position: fixed;
        z-index: 6;
        pointer-events: none;
        border: 1px solid rgba(122, 170, 255, 0.85);
        background: rgba(86, 134, 254, 0.16);
        border-radius: 4px;
        box-shadow: 0 0 0 1px rgba(86, 134, 254, 0.16);
      }
      .dsd-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .dsd-asset-card {
        min-width: 0;
        max-width: 100%;
        text-align: left;
        border-radius: 10px;
        position: relative;
        border: 1px solid transparent;
        transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
      }
      .dsd-overlay-frame { position: fixed; inset: 0; z-index: 1200; background: var(--dsd-bg); display: flex; min-width: 0; min-height: 0; }
      .dsd-overlay-frame > * { flex: 1 1 auto; min-width: 0; min-height: 0; }
      .dsd-launcher { display: none; }
      .dsd-chatpanel { position: relative; grid-area: chat; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--dsd-bg); border-left: 1px solid var(--dsd-line); }
      .dsd-chatpanelhead { height: var(--dsd-previewbar-h); flex: none; display: flex; align-items: center; gap: 7px; padding: 0 13px; border-bottom: 1px solid var(--dsd-line); color: var(--dsd-text-2); font-size: 11.5px; font-weight: 550; }
      .dsd-chatpanelhead .dsd-icon { color: var(--dsd-blue-light); }
      .dsd-chatpanelbody { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .dsd-chatpanel.is-drop-target { box-shadow: inset 0 0 0 1px rgba(122, 170, 255, 0.7); }
      .dsd-chat-dropmask {
        position: absolute; inset: 0; z-index: 30; pointer-events: none;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
        color: var(--dsd-blue-light); font-size: 12px;
        background: rgba(15, 20, 30, 0.76); backdrop-filter: blur(5px);
      }
      .dsd-chat-dropmask .dsd-icon { width: 22px; height: 22px; }
      [data-dsd-conversation-file] { cursor: grab; }
      [data-dsd-conversation-file]:active { cursor: grabbing; }
      .dsd-chat-factory { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
      .dsd-chat-factory > * { min-height: 0; flex: 1 1 auto; }
      .dsd-asset-cardwrap { position: relative; min-width: 0; }
      .dsd-asset-cardwrap .dsd-asset-card { width: 100%; }
      .dsd-contextmenu {
        position: fixed;
        z-index: 140;
        min-width: 168px;
        padding: 5px;
        border-radius: 10px;
        background: var(--dsd-panel-2);
        border: 1px solid var(--dsd-line-strong);
        box-shadow: 0 18px 52px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04);
        animation: dsd-menu-in 120ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .dsd-contextitem {
        width: 100%;
        min-height: 32px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 9px;
        border-radius: 7px;
        color: var(--dsd-text-2);
        font-size: 12px;
        text-align: left;
      }
      .dsd-contextitem:hover { color: var(--dsd-text); background: rgba(255, 255, 255, 0.06); }
      .dsd-contextitem.is-danger { color: #f6b8bd; }
      .dsd-contextitem.is-danger:hover { color: #ffe3e5; background: rgba(242, 90, 90, 0.14); }
      .dsd-contextitem .dsd-icon { color: var(--dsd-text-3); }
      .dsd-contextitem.is-danger .dsd-icon { color: #f08a94; }
      .dsd-contextmeta { padding: 5px 9px 4px; color: var(--dsd-text-3); font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-asset-delete {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 2;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        display: grid;
        place-items: center;
        color: #f2f6fb;
        background: rgba(15, 17, 21, 0.78);
        border: 0.5px solid rgba(255, 255, 255, 0.18);
        backdrop-filter: blur(10px);
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease, background 140ms ease;
      }
      .dsd-asset-cardwrap:hover .dsd-asset-delete,
      .dsd-asset-cardwrap:focus-within .dsd-asset-delete {
        opacity: 1;
        pointer-events: auto;
      }
      .dsd-asset-delete:hover { background: rgba(240, 106, 119, 0.8); }
      @media (hover: none) {
        .dsd-asset-delete { opacity: 1; pointer-events: auto; }
      }
      .dsd-asset-card:hover { background: rgba(255, 255, 255, 0.025); transform: translateY(-1px); }
      .dsd-asset-card.is-selected { border-color: rgba(92, 155, 255, 0.75); background: rgba(86, 134, 254, 0.055); box-shadow: 0 0 0 2px rgba(86, 134, 254, 0.1); }
      .dsd-asset-card.is-selected .dsd-asset-thumb { border-color: transparent; }
      .dsd-asset-thumb {
        aspect-ratio: 16 / 9;
        width: 100%;
        border-radius: 9px;
        overflow: hidden;
        position: relative;
        background: #1d2229;
        border: 0.5px solid var(--dsd-line);
      }
      .dsd-asset-thumb img, .dsd-asset-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dsd-asset-thumb canvas { width: 100%; height: 100%; display: block; }
      .dsd-asset-thumb .dsd-thumb-tint { position: absolute; inset: 0; box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.06); pointer-events: none; }
      .dsd-asset-badge {
        position: absolute;
        left: 6px;
        top: 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 17px;
        padding: 0 6px;
        border-radius: 999px;
        color: #d8eaff;
        background: rgba(8, 15, 25, 0.62);
        border: 0.5px solid rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(12px);
        font-size: 9px;
        letter-spacing: 0.01em;
      }
      .dsd-asset-badge.is-draft { color: #dceaff; }
      .dsd-asset-badge.is-draft::before { content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--dsd-blue-light); }
      .dsd-asset-badge.is-applied::before { content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--dsd-green); }
      .dsd-asset-duration {
        position: absolute;
        right: 5px;
        bottom: 5px;
        height: 16px;
        padding: 0 5px;
        display: inline-flex;
        align-items: center;
        border-radius: 4px;
        background: rgba(4, 7, 11, 0.65);
        color: #eaf0f7;
        font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace);
        font-size: 8.5px;
        letter-spacing: 0.01em;
        backdrop-filter: blur(8px);
      }
      .dsd-asset-meta { padding: 5px 2px 3px; min-width: 0; }
      .dsd-asset-name { display: block; color: var(--dsd-text); font-size: 11.5px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-asset-kind { display: flex; align-items: center; justify-content: space-between; gap: 4px; color: var(--dsd-text-3); font-size: 10px; margin-top: 3px; }
      .dsd-asset-kind span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-mini-wave { width: 100%; height: 100%; display: block; background: linear-gradient(180deg, rgba(34, 197, 94, 0.08), rgba(86, 134, 254, 0.04)); }
      .dsd-audio-thumb { display: flex; align-items: center; padding: 0 7px; }
      .dsd-audio-thumb .dsd-mini-wave { border-radius: 4px; }
      .dsd-asset-foot {
        flex: none;
        height: var(--dsd-previewbar-h);
        display: flex;
        align-items: center;
        padding: 0 12px;
        margin: 0 -12px;
        border-top: 1px solid var(--dsd-line);
      }
      .dsd-importbtn {
        width: 100%;
        height: 30px;
        border-radius: var(--dsd-radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--dsd-text);
        background: var(--dsd-panel-2);
        border: 1px solid var(--dsd-line);
        font-size: 12px;
      }
      .dsd-importbtn:hover { background: var(--dsd-raised); }
      .dsd-importbusy {
        position: absolute;
        inset: auto 12px 12px;
        z-index: 4;
        border-radius: 9px;
        background: rgba(35, 35, 36, 0.95);
        border: 0.5px solid rgba(122, 170, 255, 0.26);
        color: #c4d9fb;
        padding: 9px 11px;
        font-size: 10.5px;
        box-shadow: 0 9px 24px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .dsd-dropmask {
        position: absolute;
        inset: 57px 8px 8px;
        border-radius: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #d6e8ff;
        background: rgba(11, 21, 34, 0.8);
        border: 1px dashed rgba(122, 170, 255, 0.55);
        backdrop-filter: blur(14px);
        z-index: 7;
        font-size: 12px;
        pointer-events: none;
      }

      .dsd-previewhead {
        height: var(--dsd-previewbar-h);
        flex: none;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        padding: 0 16px;
        background: var(--dsd-previewbar-bg);
        border-bottom: 1px solid var(--dsd-line);
        position: relative;
        z-index: 6;
      }
      .dsd-previewtools { display: flex; align-items: center; gap: 5px; }
      .dsd-ratio-btn {
        height: 26px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 0 8px;
        border-radius: 7px;
        color: var(--dsd-text-2);
        font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace);
        font-size: 9.5px;
        background: rgba(255, 255, 255, 0.035);
        border: 0.5px solid var(--dsd-line);
      }
      .dsd-ratio-btn:hover { background: rgba(255, 255, 255, 0.065); color: var(--dsd-text); }
      .dsd-ratio-btn .dsd-icon { color: var(--dsd-text-3); }
      .dsd-ratio-popover { position: absolute; top: 32px; right: 0; width: 204px; }
      .dsd-ratio-option {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 8px;
        border-radius: 7px;
        color: var(--dsd-text-2);
        text-align: left;
        font-size: 11px;
      }
      .dsd-ratio-option:hover { background: rgba(255, 255, 255, 0.06); color: var(--dsd-text); }
      .dsd-ratio-option.is-current { color: #f2f7ff; background: rgba(86, 134, 254, 0.11); }
      .dsd-ratio-option .mono { font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace); font-size: 9.5px; color: var(--dsd-text-3); }
      .dsd-ratio-option.is-current .mono { color: #9fc8ff; }
      .dsd-ratio-option .dsd-icon { margin-left: auto; color: var(--dsd-blue-light); }

      .dsd-stage {
        flex: 1;
        min-height: 0;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        overflow: hidden;
        background: var(--dsd-bg);
      }
      .dsd-stage-inner { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 0; }
      .dsd-frame {
        position: relative;
        overflow: hidden;
        background: var(--dsd-bg-deep);
        border: 0;
        border-radius: 0;
        box-shadow: none;
        flex: none;
      }
      .dsd-frame > canvas, .dsd-frame > img, .dsd-frame > video { width: 100%; height: 100%; display: block; object-fit: contain; background: var(--dsd-bg-deep); }
      .dsd-frame video { outline: none; }
      .dsd-timeline-video { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: contain; background: var(--dsd-bg-deep); pointer-events: none; }
      .dsd-frame-caption {
        position: absolute;
        left: 10px;
        top: 10px;
        z-index: 2;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 20px;
        padding: 0 7px;
        border-radius: 5px;
        color: rgba(241, 247, 255, 0.82);
        background: rgba(5, 8, 12, 0.5);
        border: 0.5px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        font-size: 9px;
        letter-spacing: 0.02em;
      }
      .dsd-stage-empty {
        width: min(340px, 84%);
        min-height: 210px;
        border-radius: var(--dsd-radius-lg);
        border: 1px solid var(--dsd-line);
        background: var(--dsd-panel);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        position: relative;
      }
      .dsd-empty-orb {
        width: 38px; height: 38px;
        border-radius: var(--dsd-radius-sm);
        display: grid; place-items: center;
        color: var(--dsd-blue-light);
        background: var(--dsd-blue-soft);
        border: 1px solid var(--dsd-line);
        position: relative;
        z-index: 1;
      }
      .dsd-empty-title { position: relative; z-index: 1; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; color: var(--dsd-text); margin-top: 5px; }
      .dsd-empty-body { position: relative; z-index: 1; color: var(--dsd-text-2); font-size: 12px; line-height: 1.7; max-width: 260px; }
      .dsd-empty-actions { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; margin-top: 9px; }
      .dsd-empty-actions { gap: 8px; margin-top: 12px; }
      .dsd-empty-actions .dsd-primary { height: 34px; padding: 0 16px; font-size: 12px; }
      .dsd-empty-actions .dsd-softbtn { height: 34px; padding: 0 13px; font-size: 12px; }
      .dsd-native-media { width: 100%; height: 100%; object-fit: contain; }
      .dsd-audio-stage {
        width: 100%; height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 32px;
        background: var(--dsd-bg);
      }
      .dsd-audio-bigwave { width: min(560px, 82%); height: 78px; color: #76d9ae; opacity: 0.8; }
      .dsd-audio-stage audio { width: min(460px, 80%); height: 34px; color-scheme: dark; }

      .dsd-transportrow {
        height: var(--dsd-previewbar-h);
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        background: var(--dsd-previewbar-bg);
        border-top: 1px solid var(--dsd-line);
      }
      .dsd-transportmeta {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        color: var(--dsd-text-3);
        font-size: 9.5px;
        white-space: nowrap;
      }
      .dsd-transportmeta .dsd-icon { color: var(--dsd-text-3); }
      .dsd-transportmeta-label { overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
      .dsd-transportcenter { flex: 1; display: flex; justify-content: center; min-width: 0; }
      .dsd-transportpill {
        height: 38px;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border-radius: 999px;
        background: rgba(35, 35, 36, 0.7);
        border: 0.5px solid rgba(255, 255, 255, 0.105);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.055);
        backdrop-filter: blur(20px) saturate(150%);
        -webkit-backdrop-filter: blur(20px) saturate(150%);
      }
      .dsd-transportbtn {
        width: 30px; height: 30px;
        border-radius: 50%;
        display: grid; place-items: center;
        color: var(--dsd-text-2);
        transition: background 150ms ease, color 150ms ease, transform 150ms ease;
      }
      .dsd-transportbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.075); color: #fff; }
      .dsd-transportbtn.is-play { width: 32px; height: 32px; color: #f6fbff; background: rgba(86, 134, 254, 0.95); box-shadow: 0 3px 12px rgba(86, 134, 254, 0.32); margin: 0 2px; }
      .dsd-transportbtn.is-play:hover:not(:disabled) { background: var(--dsd-blue-light); color: #fff; }
      .dsd-transportbtn.is-play:active:not(:disabled) { transform: scale(0.94); }
      .dsd-transporttime {
        height: 30px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 9px;
        color: var(--dsd-text-3);
        font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace);
        font-size: 9.5px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        letter-spacing: 0.01em;
      }
      .dsd-transporttime strong { color: var(--dsd-text); font-weight: 500; }
      .dsd-transportright { display: flex; align-items: center; justify-content: flex-end; gap: 4px; width: 112px; flex: none; }
      .dsd-volumebtn { width: 27px; height: 27px; border-radius: 7px; display: grid; place-items: center; color: var(--dsd-text-3); }
      .dsd-volumebtn:hover { color: var(--dsd-text-2); background: rgba(255, 255, 255, 0.055); }
      .dsd-volume-range { width: 54px; height: 16px; accent-color: var(--dsd-blue); }
      .dsd-range {
        -webkit-appearance: none;
        appearance: none;
        height: 16px;
        background: transparent;
        accent-color: var(--dsd-blue);
        cursor: pointer;
      }
      .dsd-range::-webkit-slider-runnable-track { height: 3px; border-radius: 999px; background: rgba(255, 255, 255, 0.13); }
      .dsd-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 11px; height: 11px;
        border-radius: 50%;
        background: #dbe9ff;
        border: 1px solid rgba(32, 77, 150, 0.72);
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
        margin-top: -4px;
      }
      .dsd-range::-moz-range-track { height: 3px; border-radius: 999px; background: rgba(255, 255, 255, 0.13); }
      .dsd-range::-moz-range-thumb { width: 11px; height: 11px; border-radius: 50%; background: #dbe9ff; border: 1px solid rgba(32, 77, 150, 0.72); }

      .dsd-popover {
        position: absolute;
        z-index: 70;
        min-width: 150px;
        padding: 6px;
        border-radius: 12px;
        background: rgba(48, 49, 54, 0.92);
        border: 0.5px solid rgba(255, 255, 255, 0.13);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.055);
        backdrop-filter: blur(28px) saturate(155%);
        -webkit-backdrop-filter: blur(28px) saturate(155%);
        animation: dsd-menu-in 140ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .dsd-popover-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 6px 7px; color: var(--dsd-text-3); font-size: 10px; }
      .dsd-popover-title { color: var(--dsd-text-2); font-size: 10.5px; }
      .dsd-menu-group + .dsd-menu-group { margin-top: 5px; padding-top: 5px; border-top: 0.5px solid var(--dsd-line); }
      .dsd-menu-label { padding: 7px 8px 4px; color: var(--dsd-text-3); font-size: 10px; font-weight: 500; letter-spacing: 0.025em; }
      .dsd-menu-row {
        width: 100%;
        min-height: 34px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 7px;
        text-align: left;
        color: var(--dsd-text-2);
        font-size: 12.5px;
        line-height: 1.4;
      }
      .dsd-menu-row:hover { background: rgba(255, 255, 255, 0.06); color: var(--dsd-text); }
      .dsd-menu-row.is-current { color: #f2f7ff; background: rgba(86, 134, 254, 0.11); }
      .dsd-menu-row .dsd-menu-check { margin-left: auto; color: var(--dsd-blue-light); flex: none; }
      .dsd-menu-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-effort-row { min-height: 32px; }
    `;

    const CSS_CHAT = `
      .dsd-models-popover { top: 40px; left: 0; right: 0; max-height: 330px; display: flex; flex-direction: column; overflow: hidden; }
      .dsd-models-popover .dsd-popover-header { flex: none; padding: 4px 8px 7px; font-size: 11px; }
      .dsd-models-popover .dsd-popover-title { color: var(--dsd-text); font-size: 12px; font-weight: 500; }
      .dsd-models-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .dsd-models-back { width: 22px; height: 22px; margin-left: -3px; border-radius: 6px; display: grid; place-items: center; color: var(--dsd-text-3); flex: none; }
      .dsd-models-back:hover { color: var(--dsd-text); background: rgba(255, 255, 255, 0.065); }
      .dsd-models-current { color: var(--dsd-text-2); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dsd-models-effortbtn { flex: none; max-width: 170px; min-width: 0; height: 24px; display: inline-flex; align-items: center; gap: 5px; padding: 0 7px; border-radius: 999px; color: var(--dsd-text-2); background: rgba(255, 255, 255, 0.055); border: 0.5px solid var(--dsd-line); font-size: 10.5px; line-height: 1; }
      .dsd-models-effortbtn:hover { color: var(--dsd-text); background: rgba(255, 255, 255, 0.09); border-color: var(--dsd-line-strong); }
      .dsd-models-effortbtn .dsd-icon { color: var(--dsd-text-3); flex: none; }
      .dsd-models-effortval { max-width: 64px; color: #cfe2fb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dsd-models-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; min-height: 0; overflow-y: auto; }
      .dsd-models-empty { padding: 10px 8px; color: var(--dsd-text-3); font-size: 11px; line-height: 1.5; }
      .dsd-models-state { padding: 10px 8px 12px; color: var(--dsd-text-2); font-size: 11px; line-height: 1.6; }
      .dsd-models-state .dsd-softbtn { margin-top: 7px; height: 26px; font-size: 11px; }
      .dsd-missing-thumb {
        width: 100%; height: 100%;
        display: grid; place-items: center;
        color: #4c5868;
        background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02) 6px, transparent 6px, transparent 12px);
      }
      .dsd-import-notice {
        flex: none;
        margin: 8px 0 0;
        min-height: 28px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 7px;
        border-radius: 7px;
        color: #e5c3c7;
        background: rgba(255, 110, 125, 0.075);
        border: 0.5px solid rgba(255, 128, 139, 0.16);
        font-size: 9px;
        line-height: 1.35;
      }
      .dsd-import-notice > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-import-notice > button { width: 18px; height: 18px; display: grid; place-items: center; color: #c58d92; border-radius: 4px; flex: none; }
      .dsd-import-notice > button:hover { color: #fff; background: rgba(255, 255, 255, 0.07); }
      .dsd-import-notice .dsd-icon { color: var(--dsd-red); flex: none; }
    `;

    const CSS_TIMELINE = `
      .dsd-tlbar {
        height: 46px;
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        border-bottom: 1px solid var(--dsd-line);
      }
      .dsd-tltitle { display: flex; align-items: center; gap: 7px; min-width: 0; flex: none; }
      .dsd-tltitle h2 { margin: 0; color: var(--dsd-text); font-size: 13px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; white-space: nowrap; }
      .dsd-tltools { display: flex; align-items: center; gap: 1px; margin-left: 3px; }
      .dsd-tltools .dsd-iconbtn { width: 26px; height: 26px; }
      .dsd-tlselectcount {
        display: inline-flex;
        align-items: center;
        height: 22px;
        padding: 0 7px;
        border-radius: 999px;
        color: #cfe2fb;
        background: rgba(86, 134, 254, 0.12);
        border: 0.5px solid rgba(92, 155, 255, 0.3);
        font-size: 9px;
        white-space: nowrap;
      }
      .dsd-tlzoom { margin-left: auto; display: flex; align-items: center; gap: 2px; color: var(--dsd-text-3); }
      .dsd-tlzoom .dsd-iconbtn { width: 24px; height: 24px; }
      .dsd-zoom-range { width: 82px; }
      .dsd-tlbody { flex: 1; min-height: 0; display: flex; padding: 0 14px 12px; overflow: hidden; }
      .dsd-tllabels {
        width: 64px;
        flex: none;
        display: grid;
        grid-template-rows: 27px minmax(0, 1fr) minmax(0, 0.56fr) minmax(0, 0.56fr);
        row-gap: 6px;
        padding-bottom: 1px;
      }
      .dsd-tllabel {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--dsd-text-3);
        font-size: 10px;
        line-height: 1.2;
        padding-left: 2px;
      }
      .dsd-tllabel .dsd-icon { color: #748092; }
      .dsd-tllabel.is-music { color: #8290a2; }
      .dsd-tllabel.is-audio { color: #7f9a8d; }
      .dsd-tlscroll { flex: 1; min-width: 0; overflow-x: auto; overflow-y: hidden; position: relative; scrollbar-gutter: stable; }
      .dsd-tlcontent {
        min-width: 100%;
        height: 100%;
        display: grid;
        grid-template-rows: 27px minmax(0, 1fr) minmax(0, 0.56fr) minmax(0, 0.56fr);
        row-gap: 6px;
        position: relative;
        padding-bottom: 1px;
      }
      .dsd-ruler {
        position: relative;
        border-bottom: 1px solid var(--dsd-line);
        color: var(--dsd-text-3);
        font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace);
        font-size: 9px;
        cursor: ew-resize;
        user-select: none;
        overflow: hidden;
      }
      .dsd-ruler-tick { position: absolute; bottom: 0; width: 0.5px; height: 5px; background: rgba(255, 255, 255, 0.13); transform: translateX(-0.25px); pointer-events: none; }
      .dsd-ruler-tick.is-major { height: 8px; background: rgba(255, 255, 255, 0.22); }
      .dsd-ruler-label { position: absolute; bottom: 9px; transform: translateX(-1px); color: var(--dsd-text-3); font-size: 9px; pointer-events: none; white-space: nowrap; }
      .dsd-lane {
        position: relative;
        border-radius: var(--dsd-radius-sm);
        background: var(--dsd-panel-2);
        border: 1px solid var(--dsd-line);
        overflow: hidden;
        min-width: 0;
        cursor: crosshair;
      }
      .dsd-lane-video { background: var(--dsd-panel-2); }
      .dsd-lane-audio { background: var(--dsd-panel-2); }
      .dsd-lane-music { background: var(--dsd-panel-2); }
      .dsd-lane.dsd-dropover { box-shadow: inset 0 0 0 1px rgba(122, 170, 255, 0.6); background-color: rgba(86, 134, 254, 0.08); }
      .dsd-lane-hint {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--dsd-text-3);
        font-size: 10px;
        line-height: 1.2;
        pointer-events: none;
        white-space: nowrap;
      }
      .dsd-lane-music .dsd-lane-hint { pointer-events: auto; display: flex; align-items: center; gap: 6px; }
      .dsd-lane-add {
        height: 19px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 6px;
        border-radius: 4px;
        color: #7b9ac8;
        background: rgba(86, 134, 254, 0.08);
        font-size: 8.5px;
      }
      .dsd-lane-add:hover { color: #bcd8ff; background: rgba(86, 134, 254, 0.16); }
      .dsd-clip {
        position: absolute;
        top: 3px;
        bottom: 3px;
        border-radius: 6px;
        overflow: hidden;
        border: 0.5px solid rgba(255, 255, 255, 0.09);
        background: #20252d;
        cursor: grab;
        touch-action: none;
        user-select: none;
        min-width: 2px;
        transition: border-color 140ms ease, box-shadow 140ms ease, filter 140ms ease;
        display: flex;
        align-items: flex-end;
      }
      .dsd-clip:hover { border-color: rgba(255, 255, 255, 0.2); filter: brightness(1.04); }
      .dsd-clip.is-selected {
        border-color: rgba(104, 166, 255, 0.92);
        box-shadow: 0 0 0 1px rgba(86, 134, 254, 0.68), 0 5px 18px rgba(0, 0, 0, 0.32);
        z-index: 4;
      }
      .dsd-clip.is-dragging { z-index: 9; cursor: grabbing; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(86, 134, 254, 0.5); }
      .dsd-clip-video { background: #1c222a; }
      .dsd-clip-thumb { position: absolute; inset: 0; background: #1a2028; }
      .dsd-clip-thumb canvas, .dsd-clip-thumb img { width: 100%; height: 100%; object-fit: cover; opacity: 0.85; display: block; }
      .dsd-clip-video::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 35%, rgba(7, 10, 14, 0.78) 100%); pointer-events: none; }
      .dsd-clip-label {
        position: relative;
        z-index: 1;
        width: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 5px;
        padding: 0 7px 5px;
        color: #eef4fb;
        font-size: 8.5px;
        line-height: 1.2;
        pointer-events: none;
      }
      .dsd-clip-label span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55); }
      .dsd-clip-duration { color: rgba(235, 244, 255, 0.6); font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace); font-size: 8px; flex: none; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55); }
      .dsd-clip-audio, .dsd-clip-music { align-items: stretch; }
      .dsd-clip-audio { background: rgba(31, 55, 45, 0.86); border-color: rgba(34, 197, 94, 0.13); }
      .dsd-clip-linked { pointer-events: none; opacity: 0.84; border-style: dashed; background: rgba(28, 49, 41, 0.68); }
      .dsd-clip-linked .dsd-clip-wave { color: rgba(128, 228, 180, 0.55); }
      .dsd-clip-music { background: rgba(27, 40, 63, 0.88); border-color: rgba(122, 170, 255, 0.13); }
      .dsd-clip-wave { position: absolute; inset: 2px 3px 3px; width: calc(100% - 6px); height: calc(100% - 5px); color: rgba(128, 228, 180, 0.72); opacity: 0.86; pointer-events: none; }
      .dsd-clip-music .dsd-clip-wave { color: rgba(124, 174, 255, 0.7); }
      .dsd-clip-audio .dsd-clip-label, .dsd-clip-music .dsd-clip-label { position: absolute; inset: auto 0 0; padding: 1px 7px 3px; background: linear-gradient(180deg, transparent, rgba(8, 12, 13, 0.65)); }
      .dsd-clip-audio .dsd-clip-label span:first-child, .dsd-clip-music .dsd-clip-label span:first-child { font-size: 8px; }
      .dsd-trim {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 8px;
        z-index: 3;
        opacity: 0;
        cursor: ew-resize;
        transition: opacity 120ms ease, background 120ms ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dsd-clip:hover .dsd-trim, .dsd-clip.is-selected .dsd-trim { opacity: 1; }
      .dsd-trim:focus-visible { opacity: 1; outline: 2px solid var(--dsd-blue-light); outline-offset: -2px; }
      .dsd-trim::before { content: ""; width: 2px; height: 18px; border-radius: 999px; background: rgba(218, 236, 255, 0.7); box-shadow: 0 0 0 1px rgba(24, 51, 87, 0.4); }
      .dsd-trim:hover::before { background: #fff; }
      .dsd-trim-start { left: 0; border-radius: 6px 0 0 6px; background: linear-gradient(90deg, rgba(86, 134, 254, 0.24), transparent); }
      .dsd-trim-end { right: 0; border-radius: 0 6px 6px 0; background: linear-gradient(270deg, rgba(86, 134, 254, 0.24), transparent); }
      .dsd-marquee {
        position: fixed;
        z-index: 90;
        border: 1px solid rgba(122, 170, 255, 0.9);
        background: rgba(86, 134, 254, 0.13);
        border-radius: 3px;
        pointer-events: none;
        box-shadow: 0 0 0 1px rgba(86, 134, 254, 0.18), 0 0 18px rgba(86, 134, 254, 0.15);
      }
      .dsd-playhead {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--dsd-blue-light);
        z-index: 8;
        pointer-events: none;
        transform: translateX(-0.5px);
        box-shadow: 0 0 11px rgba(122, 170, 255, 0.38);
      }
      .dsd-playhead::before {
        content: "";
        position: absolute;
        top: 0;
        left: -4px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--dsd-blue-light);
        box-shadow: 0 0 0 2px #111318, 0 2px 7px rgba(86, 134, 254, 0.5);
      }
      .dsd-timeline.is-asset-preview .dsd-playhead { display: none; }
      .dsd-timeline.is-asset-preview .dsd-ruler { opacity: 0.48; }
      .dsd-timeline.is-asset-preview .dsd-lane { opacity: 0.72; }
      .dsd-timeline.is-asset-preview .dsd-tlbar::after {
        content: attr(data-preview-note);
        margin-left: auto;
        color: var(--dsd-text-3);
        font-size: 9px;
        letter-spacing: 0.02em;
      }
      .dsd-timeline.is-asset-preview .dsd-tlzoom { display: none; }
    `;

    const CSS_MODAL = `
      .dsd-toast {
        position: absolute;
        z-index: 120;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 7px;
        max-width: calc(100% - 40px);
        min-height: 32px;
        padding: 7px 12px;
        border-radius: 9px;
        color: #e7edf6;
        background: rgba(48, 49, 54, 0.94);
        border: 0.5px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 14px 38px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        font-size: 10.5px;
        animation: dsd-toast-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .dsd-toast .dsd-icon { color: var(--dsd-blue-light); }
      .dsd-toast.is-success .dsd-icon { color: var(--dsd-green); }
      .dsd-toast.is-error .dsd-icon { color: var(--dsd-red); }

      .dsd-modal-backdrop {
        position: absolute;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background: transparent;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: dsd-in 180ms ease both;
      }
      .dsd-modal {
        width: min(560px, 100%);
        max-height: min(760px, calc(100% - 24px));
        overflow-y: auto;
        border-radius: var(--dsd-radius-xl);
        background: var(--dsd-panel-2);
        border: 1px solid var(--dsd-line);
        box-shadow: 0 30px 100px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        animation: dsd-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
        position: relative;
      }
      .dsd-modalhead {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 19px 20px 11px;
      }
      .dsd-modaltitle { margin: 0; font-size: 16px; line-height: 1.2; letter-spacing: -0.02em; font-weight: 570; color: var(--dsd-text); }
      .dsd-modalsub { margin: 6px 0 0; color: var(--dsd-text-3); font-size: 10.5px; line-height: 1.6; }
      .dsd-modalclose { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; color: var(--dsd-text-3); flex: none; }
      .dsd-modalclose:hover { color: var(--dsd-text); background: rgba(255, 255, 255, 0.06); }
      .dsd-modalbody { padding: 2px 20px 20px; }
      .dsd-export-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.032);
        border: 0.5px solid var(--dsd-line);
        margin-bottom: 16px;
      }
      .dsd-export-summary-main { min-width: 0; }
      .dsd-export-name { color: var(--dsd-text); font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsd-export-meta { color: var(--dsd-text-3); font-size: 9.5px; margin-top: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .dsd-export-meta span { display: inline-flex; align-items: center; gap: 3px; }
      .dsd-export-meta .dsd-icon { color: #8290a2; }
      .dsd-export-badge { height: 22px; padding: 0 7px; border-radius: 5px; display: inline-flex; align-items: center; color: #bcd5ff; background: rgba(86, 134, 254, 0.1); border: 0.5px solid rgba(122, 170, 255, 0.14); font-family: var(--dsh-font-family-code, "SF Mono", ui-monospace, monospace); font-size: 8.5px; flex: none; }
      .dsd-optiongroup { margin-bottom: 15px; }
      .dsd-optionlabel { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--dsd-text-2); font-size: 10.5px; margin-bottom: 6px; }
      .dsd-optionlabel span { color: var(--dsd-text-3); font-size: 9px; }
      .dsd-optionrow { display: flex; gap: 5px; flex-wrap: wrap; }
      .dsd-optbtn {
        height: 32px;
        min-width: 56px;
        padding: 0 12px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        color: var(--dsd-text-2);
        background: rgba(255, 255, 255, 0.032);
        border: 0.5px solid var(--dsd-line);
        font-size: 10.5px;
        transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
      }
      .dsd-optbtn:hover { background: rgba(255, 255, 255, 0.055); color: var(--dsd-text); }
      .dsd-optbtn.is-active { color: #f2f7ff; background: rgba(86, 134, 254, 0.16); border-color: rgba(122, 170, 255, 0.32); box-shadow: inset 0 0 0 0.5px rgba(122, 170, 255, 0.12); }
      .dsd-toggle { display: flex; align-items: center; gap: 7px; color: var(--dsd-text-2); font-size: 10.5px; cursor: pointer; user-select: none; }
      .dsd-toggle input { position: absolute; opacity: 0; pointer-events: none; }
      .dsd-toggle-track { width: 26px; height: 15px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); position: relative; transition: background 160ms ease; }
      .dsd-toggle-track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: #d7e2f0; transition: transform 160ms ease; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); }
      .dsd-toggle input:checked + .dsd-toggle-track { background: var(--dsd-blue); }
      .dsd-toggle:focus-within .dsd-toggle-track { outline: 2px solid var(--dsd-blue-light); outline-offset: 2px; }
      .dsd-toggle input:checked + .dsd-toggle-track::after { transform: translateX(11px); background: #fff; }
      .dsd-aspect-select { height: 32px; padding: 0 10px; border-radius: 8px; color: var(--dsd-text); background: rgba(255, 255, 255, 0.04); border: 0.5px solid var(--dsd-line); font-size: 10.5px; }
      .dsd-export-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 13px 20px 18px;
        border-top: 0.5px solid var(--dsd-line);
      }
      .dsd-export-estimate { color: var(--dsd-text-3); font-size: 9.5px; line-height: 1.5; min-width: 0; }
      .dsd-export-estimate strong { color: var(--dsd-text); font-weight: 500; }
      .dsd-export-actions { display: flex; align-items: center; gap: 6px; flex: none; }
      .dsd-export-actions .dsd-primary { min-width: 96px; height: 32px; font-size: 11px; }
      .dsd-progress { margin-top: 12px; }
      .dsd-progress-head { display: flex; align-items: center; justify-content: space-between; color: var(--dsd-text-2); font-size: 10px; margin-bottom: 6px; }
      .dsd-progressbar { height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
      .dsd-progressfill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #3f8af7, #77d9ff); transition: width 160ms linear; box-shadow: 0 0 12px rgba(86, 134, 254, 0.45); }
      .dsd-export-error {
        margin-top: 12px;
        padding: 9px 10px;
        border-radius: 9px;
        background: rgba(255, 110, 125, 0.075);
        border: 0.5px solid rgba(255, 128, 139, 0.17);
        color: #f2c4c8;
        font-size: 10px;
        line-height: 1.55;
        display: flex;
        gap: 7px;
        align-items: flex-start;
      }
      .dsd-export-error .dsd-icon { color: var(--dsd-red); margin-top: 1px; }
      .dsd-export-warning {
        margin-top: 12px;
        padding: 9px 10px;
        border-radius: 9px;
        background: rgba(234, 192, 109, 0.07);
        border: 0.5px solid rgba(234, 192, 109, 0.15);
        color: #e8d1a2;
        font-size: 10px;
        line-height: 1.55;
      }
      .dsd-export-success {
        margin-top: 12px;
        padding: 10px 11px;
        border-radius: 9px;
        background: rgba(34, 197, 94, 0.07);
        border: 0.5px solid rgba(34, 197, 94, 0.17);
        color: #bfe8d4;
        font-size: 10.5px;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .dsd-export-success .dsd-icon { color: var(--dsd-green); }
      .dsd-modal-backdrop.is-compact .dsd-modal { width: min(480px, 100%); }

      .dsd-root.dsd-focus .dsd-main {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        grid-template-areas: "preview";
      }
      .dsd-root.dsd-focus .dsd-assets,
      .dsd-root.dsd-focus .dsd-timeline { display: none; }
      /* The conversation column has grid-area: chat, which does not exist in
         the focus template above. Left visible, it is auto-placed into an
         implicit row that eats the preview row's height, so the stage measures
         < 20px and PreviewPanel hides the frame (blank "maximized" preview). */
      .dsd-root.dsd-focus .dsd-chatpanel { display: none; }
      .dsd-root.dsd-focus .dsd-preview { border: 0; }
      .dsd-root.dsd-focus .dsd-stage { padding: 0; }
      .dsd-root.dsd-focus .dsd-stage-empty { min-height: 240px; }

      @container (max-width: 1280px) {
        .dsd-projectname { width: 160px; }
        .dsd-topbar { gap: 10px; }
      }
      @container (max-width: 1120px) {
        .dsd-main { --dsd-timeline-h: 278px; }
        .dsd-projectname { width: 120px; }
        .dsd-transportright { width: 72px; }
        .dsd-volume-range { width: 42px; }
      }
      @container (max-width: 1000px) {
        .dsd-main { --dsd-assets-w: 0px; --dsd-timeline-h: 274px; }
        .dsd-narrowonly { display: inline-grid !important; }
        .dsd-main {
          grid-template-columns: minmax(0, 1fr) var(--dsd-chat-w);
          grid-template-areas:
            "preview chat"
            "timeline chat";
        }
        .dsd-assets { display: none; }
        .dsd-assets-open .dsd-assets {
          display: flex;
          position: absolute;
          z-index: 45;
          top: var(--dsd-topbar-h);
          bottom: 0;
          left: 0;
          width: 276px;
          border-right: 0.5px solid rgba(255, 255, 255, 0.15);
          box-shadow: 20px 0 60px rgba(0, 0, 0, 0.38);
          animation: dsd-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .dsd-drawer-backdrop {
          display: none;
          position: absolute;
          inset: var(--dsd-topbar-h) 0 0 0;
          z-index: 40;
          background: rgba(3, 5, 8, 0.38);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }
        .dsd-assets-open .dsd-drawer-backdrop { display: block; }
        .dsd-root.dsd-focus .dsd-drawer-backdrop { display: none; }
        .dsd-stage { padding: 0; }
        .dsd-transportmeta { max-width: 100px; }
        .dsd-transportmeta-label { max-width: 90px; }
      }
      @container (max-width: 980px) {
        .dsd-topaction { min-width: 32px; width: 32px; padding: 0; }
        .dsd-topaction span { display: none; }
        .dsd-save-action { display: none; }
      }
      .dsd-chat-backdrop { display: none; }
      @container (max-width: 780px) {
        .dsd-main {
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas:
            "preview"
            "timeline";
        }
        /* Below 780px there is no chat grid area: the native conversation column
           becomes a right-side drawer instead of being pushed into an implicit
           clipped row (K-11 / 0.9.5 B-7). */
        .dsd-chatpanel { display: none; }
        .dsd-chat-open .dsd-chatpanel {
          display: flex;
          position: absolute;
          z-index: 46;
          top: var(--dsd-topbar-h);
          right: 0;
          bottom: 0;
          width: min(420px, 100%);
          border-left: 0.5px solid rgba(255, 255, 255, 0.15);
          box-shadow: -20px 0 60px rgba(0, 0, 0, 0.38);
          animation: dsd-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .dsd-chat-open .dsd-chat-backdrop {
          display: block;
          position: absolute;
          inset: var(--dsd-topbar-h) 0 0 0;
          z-index: 45;
          background: rgba(3, 5, 8, 0.38);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }
        .dsd-root.dsd-focus .dsd-chat-backdrop { display: none; }
        .dsd-projectname { width: 92px; }
        .dsd-topdivider { display: none; }
        .dsd-topbar { gap: 8px; }
        .dsd-tlbar { padding: 0 9px; gap: 5px; }
        .dsd-zoom-range { width: 56px; }
        .dsd-transportrow { padding: 0 10px; height: var(--dsd-previewbar-h); }
        .dsd-transportmeta { display: none; }
        .dsd-transportright { width: 60px; }
        .dsd-volume-range { width: 36px; }
        .dsd-tlbody { padding: 0 8px 8px; }
        .dsd-tllabels { width: 44px; }
        .dsd-tllabel { font-size: 8px; gap: 3px; }
        .dsd-tllabel .dsd-icon { width: 12px; height: 12px; }
        .dsd-stage-empty { width: min(300px, 94%); min-height: 190px; padding: 18px; }
        .dsd-export-footer { align-items: flex-start; flex-direction: column; }
        .dsd-export-actions { width: 100%; justify-content: flex-end; }
      }
      @container (max-width: 560px) {
        .dsd-projectname { display: none; }
        .dsd-save { display: none; }
        .dsd-topbar { gap: 6px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .dsd-root *, .dsd-root *::before, .dsd-root *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.001ms !important;
        }
      }
    `;

    const CSS = [CSS_BASE, CSS_PANELS, CSS_CHAT, CSS_TIMELINE, CSS_MODAL].join('\n');

    const ICONS = {
      plus: [['path', { d: 'M12 5v14M5 12h14' }]],
      search: [['circle', { cx: 11, cy: 11, r: 6.2 }], ['path', { d: 'm16 16 4 4' }]],
      folder: [['path', { d: 'M3.5 7.5h6l1.8 2h9.2v8.8a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z' }], ['path', { d: 'M3.5 9.5v-2a1.7 1.7 0 0 1 1.7-1.7h4.2l1.6 1.7' }]],
      video: [['rect', { x: 3.5, y: 5.5, width: 12.5, height: 13, rx: 2 }], ['path', { d: 'm16 10 4.5-2.3v8.6L16 14' }]],
      audio: [['path', { d: 'M5 10v4M8.5 7.5v9M12 9.5v5M15.5 6v12M19 9v6' }]],
      image: [['rect', { x: 3.5, y: 5, width: 17, height: 14, rx: 2 }], ['circle', { cx: 9, cy: 10, r: 1.4 }], ['path', { d: 'm4.5 17 5-5 3 3 2.2-2.2 4.8 4.2' }]],
      sparkles: [['path', { d: 'M12 3.5 13.4 8l4.6 1.5-4.6 1.5L12 15.5l-1.4-4.5L6 9.5 10.6 8z' }], ['path', { d: 'M18.5 14.5 19.2 17l2.3.8-2.3.8-.7 2.4-.7-2.4-2.3-.8 2.3-.8z' }]],
      import: [['path', { d: 'M12 3.5v11' }], ['path', { d: 'm7.5 10 4.5 4.5 4.5-4.5' }], ['path', { d: 'M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2' }]],
      play: [['path', { d: 'm8 5.2 10 6.8-10 6.8z', fill: 'currentColor', stroke: 'none' }]],
      pause: [['rect', { x: 6.5, y: 5, width: 3.5, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' }], ['rect', { x: 14, y: 5, width: 3.5, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' }]],
      rewind: [['path', { d: 'M6 5v14' }], ['path', { d: 'm18 6-8 6 8 6z' }]],
      forward: [['path', { d: 'M18 5v14' }], ['path', { d: 'm6 6 8 6-8 6z' }]],
      volume: [['path', { d: 'M4.5 9.5h3l4-3.5v12l-4-3.5h-3z' }], ['path', { d: 'M15 9a4.5 4.5 0 0 1 0 6' }], ['path', { d: 'M18 6.5a8 8 0 0 1 0 11' }]],
      mute: [['path', { d: 'M4.5 9.5h3l4-3.5v12l-4-3.5h-3z' }], ['path', { d: 'm16 10 4 4M20 10l-4 4' }]],
      expand: [['path', { d: 'M8.5 4.5h-4v4M15.5 4.5h4v4M8.5 19.5h-4v-4M15.5 19.5h4v-4' }]],
      collapse: [['path', { d: 'M4.5 8.5h4v-4M19.5 8.5h-4v-4M4.5 15.5h4v4M19.5 15.5h-4v4' }]],
      chevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
      chevronLeft: [['path', { d: 'm15 6-6 6 6 6' }]],
      check: [['path', { d: 'm5 12.5 4.2 4.2L19 6.8' }]],
      close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
      undo: [['path', { d: 'M9 7 4.5 11.5 9 16' }], ['path', { d: 'M4.5 11.5h8.2a6.3 6.3 0 0 1 0 12.6h-2' }]],
      redo: [['path', { d: 'm15 7 4.5 4.5L15 16' }], ['path', { d: 'M19.5 11.5h-8.2a6.3 6.3 0 0 0 0 12.6h2' }]],
      scissors: [['circle', { cx: 6.5, cy: 7, r: 2.2 }], ['circle', { cx: 6.5, cy: 17, r: 2.2 }], ['path', { d: 'm8.3 8.6 11 6.4M8.3 15.4l11-6.4' }]],
      trash: [['path', { d: 'M4.5 7h15M9 7V4.5h6V7M7 7l.8 12h8.4L17 7' }], ['path', { d: 'M10 11v4M14 11v4' }]],
      clock: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 7v5.2l3.3 2' }]],
      music: [['path', { d: 'M9 18V5l9-2v13' }], ['circle', { cx: 6.5, cy: 18, r: 2.5 }], ['circle', { cx: 15.5, cy: 16, r: 2.5 }]],
      model: [['path', { d: 'M12 3.5 20 8v8l-8 4.5L4 16V8z' }], ['path', { d: 'm4 8 8 4.5L20 8M12 12.5v8' }]],
      skill: [['path', { d: 'M7 4.5h10v15l-5-3.5-5 3.5z' }], ['path', { d: 'M9.5 8h5' }]],
      send: [['path', { d: 'M4.5 11.5 20 4l-5.5 16-4.1-7.4z' }], ['path', { d: 'm10.4 12.6 4.4-4.4' }]],
      square: [['rect', { x: 6.5, y: 6.5, width: 11, height: 11, rx: 1.5, fill: 'currentColor', stroke: 'none' }]],
      spinner: [['path', { d: 'M20 12a8 8 0 1 1-2.34-5.66' }]],
      alert: [['path', { d: 'M12 3.5 21 20H3z' }], ['path', { d: 'M12 9v5M12 17.2v.1' }]],
      file: [['path', { d: 'M6 3.5h8l4 4V21H6z' }], ['path', { d: 'M14 3.5v5h4M9 13h6M9 16.5h4' }]],
      download: [['path', { d: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M4.5 18.5v1.5h15v-1.5' }]],
      chevronRight: [['path', { d: 'm9 6 6 6-6 6' }]],
      refresh: [['path', { d: 'M20 11a8 8 0 1 0-2.34 5.66' }], ['path', { d: 'M20 4v7h-7' }]],
    };

    function Icon({ name, size = 16, strokeWidth = 1.7, className }) {
      const children = ICONS[name] ?? ICONS.file;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          className: cx('dsd-icon', className),
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        children.map((entry, index) => h(entry[0], { key: index, ...entry[1] })),
      );
    }

    // @@STORE_START
    const FILE_LIMITS = {
      image: 100 * 1024 * 1024,
      video: 1024 * 1024 * 1024,
      audio: 1024 * 1024 * 1024,
    };
    const audioRuntime = {
      context: null,
      playbackGain: null,
      audioBuffers: new Map(),
      bedBuffers: new Map(),
    };
    let mediaDbPromise = null;

    function openMediaDb() {
      if (mediaDbPromise !== null) return mediaDbPromise;
      mediaDbPromise = new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }
        let request;
        try {
          request = indexedDB.open(MEDIA_DB, MEDIA_DB_VERSION);
        } catch {
          resolve(null);
          return;
        }
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(MEDIA_STORE)) database.createObjectStore(MEDIA_STORE);
          if (!database.objectStoreNames.contains(INBOX_STORE)) database.createObjectStore(INBOX_STORE);
          if (!database.objectStoreNames.contains(EXPORT_STORE)) database.createObjectStore(EXPORT_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      }).then((database) => {
        if (database === null) mediaDbPromise = null;
        return database;
      });
      return mediaDbPromise;
    }

    async function mediaPut(id, record) {
      const database = await openMediaDb();
      if (database === null) return false;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(MEDIA_STORE, 'readwrite');
          transaction.objectStore(MEDIA_STORE).put(record, id);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
          transaction.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    async function mediaDelete(id) {
      const database = await openMediaDb();
      if (database === null) return false;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(MEDIA_STORE, 'readwrite');
          transaction.objectStore(MEDIA_STORE).delete(id);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
          transaction.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    async function inboxPut(record) {
      const database = await openMediaDb();
      if (database === null || record === null || typeof record !== 'object' || typeof record.id !== 'string') return false;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(INBOX_STORE, 'readwrite');
          transaction.objectStore(INBOX_STORE).put(record, record.id);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
          transaction.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    async function inboxList() {
      const database = await openMediaDb();
      if (database === null) return [];
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(INBOX_STORE, 'readonly');
          const request = transaction.objectStore(INBOX_STORE).getAll();
          request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
          request.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }

    async function inboxDelete(id) {
      const database = await openMediaDb();
      if (database === null) return false;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(INBOX_STORE, 'readwrite');
          transaction.objectStore(INBOX_STORE).delete(id);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
          transaction.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    async function exportRecordPut(callId, record) {
      const database = await openMediaDb();
      if (database === null || typeof callId !== 'string') return false;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(EXPORT_STORE, 'readwrite');
          transaction.objectStore(EXPORT_STORE).put(record, callId);
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(false);
          transaction.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }

    async function exportRecordGet(callId) {
      const database = await openMediaDb();
      if (database === null || typeof callId !== 'string') return null;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(EXPORT_STORE, 'readonly');
          const request = transaction.objectStore(EXPORT_STORE).get(callId);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    function broadcastAssetsChanged() {
      if (typeof BroadcastChannel !== 'function') return;
      try {
        const channel = new BroadcastChannel('deepseek-design-assets');
        channel.postMessage({ type: 'assets-changed', at: Date.now() });
        channel.close();
      } catch {
        // Live cross-panel refresh is an enhancement.
      }
    }

    async function mediaGet(id) {
      const database = await openMediaDb();
      if (database === null) return null;
      return new Promise((resolve) => {
        try {
          const transaction = database.transaction(MEDIA_STORE, 'readonly');
          const request = transaction.objectStore(MEDIA_STORE).get(id);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    function ensureAudioContext() {
      if (audioRuntime.context !== null) return audioRuntime.context;
      const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (typeof Ctor !== 'function') return null;
      try {
        audioRuntime.context = new Ctor({ latencyHint: 'interactive' });
      } catch {
        audioRuntime.context = null;
      }
      return audioRuntime.context;
    }

    function disposeAudioRuntime() {
      if (audioRuntime.context !== null) {
        try {
          audioRuntime.context.close();
        } catch {
          // Context may already be closed by the page.
        }
      }
      audioRuntime.context = null;
      audioRuntime.playbackGain = null;
      audioRuntime.audioBuffers.clear();
      audioRuntime.bedBuffers.clear();
    }

    async function decodeAudioBlob(blob) {
      const context = ensureAudioContext();
      if (context === null) throw new Error('WebAudio is unavailable.');
      const buffer = await blob.arrayBuffer();
      return context.decodeAudioData(buffer.slice(0));
    }

    function waveformPeaks(buffer, bucketCount) {
      const buckets = Math.max(16, Math.floor(bucketCount) || WAVEFORM_BUCKETS);
      const channel = buffer.getChannelData(0);
      const stride = Math.max(1, Math.floor(channel.length / buckets));
      const peaks = [];
      for (let bucket = 0; bucket < buckets; bucket += 1) {
        const start = bucket * stride;
        const end = Math.min(channel.length, start + stride);
        let peak = 0;
        for (let index = start; index < end; index += Math.max(1, Math.floor(stride / 90))) {
          peak = Math.max(peak, Math.abs(channel[index]));
        }
        peaks.push(Math.round(peak * 1000) / 1000);
      }
      return peaks;
    }

    function buildBedBuffer(seed, durationSeconds) {
      const key = `${seed}:${Math.round(durationSeconds * 10)}`;
      if (audioRuntime.bedBuffers.has(key)) return audioRuntime.bedBuffers.get(key);
      const context = ensureAudioContext();
      if (context === null) return null;
      const duration = clamp(Number(durationSeconds) || 12, 1, 60);
      const sampleRate = context.sampleRate;
      const frameCount = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = context.createBuffer(1, frameCount, sampleRate);
      const output = buffer.getChannelData(0);
      const random = seededRandom(seed);
      const root = 110 + (seed % 5) * 11;
      const detune = 1 + ((seed % 9) - 4) * 0.002;
      let lastNoise = 0;
      for (let index = 0; index < frameCount; index += 1) {
        const time = index / sampleRate;
        const noise = random() * 2 - 1;
        lastNoise = lastNoise * 0.985 + noise * 0.015;
        const swell = 0.5 + 0.5 * Math.sin((time / duration) * Math.PI);
        const pad = Math.sin(2 * Math.PI * root * time)
          + 0.5 * Math.sin(2 * Math.PI * root * 1.5 * detune * time + 0.4)
          + 0.25 * Math.sin(2 * Math.PI * root * 2 * time + 1.1);
        const fadeIn = Math.min(1, time / 1.2);
        const fadeOut = Math.min(1, (duration - time) / 1.4);
        output[index] = (pad * 0.022 + lastNoise * 0.02) * swell * Math.max(0, fadeIn) * Math.max(0, fadeOut);
      }
      audioRuntime.bedBuffers.set(key, buffer);
      return buffer;
    }

    function bufferForClip(clip, assetsById) {
      if (clip.kind === 'bed') return buildBedBuffer(clip.seed ?? 1, clip.sourceDuration ?? clip.duration);
      if (clip.kind !== 'audio' && clip.kind !== 'linked-audio') return null;
      const asset = assetsById.get(clip.assetId);
      if (asset === undefined || asset === null) return null;
      return audioRuntime.audioBuffers.get(asset.id) ?? null;
    }

    /**
     * Normalize, dedupe, and cap persisted state before it reaches React.
     * No demo or sample records are synthesized here.
     */
    function restoreProject(raw, options = {}) {
      if (raw === null || typeof raw !== 'object' || raw.version !== 1) return null;
      const state = createEmptyState();
      state.project.name = typeof raw.project?.name === 'string' ? raw.project.name.trim().slice(0, 80) : '';
      state.project.aspect = isAspect(raw.project?.aspect) ? raw.project.aspect : '16:9';
      state.project.aspectInitialized = typeof raw.project?.aspectInitialized === 'boolean'
        ? raw.project.aspectInitialized
        : true;
      state.autoImportSkipped = Array.isArray(raw.autoImportSkipped)
        ? raw.autoImportSkipped.filter((value) => typeof value === 'string' && value.startsWith('attachment:')).slice(-1000)
        : [];
      state.autoImportVersion = 3;
      state.autoImportSince = Math.max(0, Number(raw.autoImportSince) || 0);
      const rawAssets = Array.isArray(raw.assets) ? raw.assets.slice(-MAX_ASSETS) : [];
      const assetsById = new Map();
      for (const entry of rawAssets) {
        if (entry === null || typeof entry !== 'object') continue;
        if (typeof entry.id !== 'string' || entry.id.length > 120 || entry.kind !== 'image' && entry.kind !== 'video' && entry.kind !== 'audio') continue;
        if (typeof entry.name !== 'string' || entry.name.length === 0) continue;
        const asset = {
          id: entry.id,
          name: entry.name.slice(0, 180),
          kind: entry.kind,
          mime: typeof entry.mime === 'string' ? entry.mime.slice(0, 120) : '',
          size: Math.max(0, Number(entry.size) || 0),
          duration: Math.max(0, Number(entry.duration) || 0),
          width: Math.max(0, Number(entry.width) || 0),
          height: Math.max(0, Number(entry.height) || 0),
          palette: normalizePalette(entry.palette, DEFAULT_PALETTE),
          peaks: Array.isArray(entry.peaks) ? entry.peaks.filter((value) => Number.isFinite(value)).slice(0, 240) : [],
          blobId: typeof entry.blobId === 'string' ? entry.blobId : null,
          objectUrl: null,
          posterUrl: null,
          missing: typeof entry.blobId !== 'string',
          source: entry.source === 'conversation' ? 'conversation' : entry.source === 'export' ? 'export' : 'import',
          toolCallId: typeof entry.toolCallId === 'string' ? entry.toolCallId.slice(0, 180) : undefined,
          originKey: typeof entry.originKey === 'string' ? entry.originKey.slice(0, 220) : undefined,
          attachmentId: typeof entry.attachmentId === 'string' ? entry.attachmentId.slice(0, 220) : undefined,
          hasAudio: typeof entry.hasAudio === 'boolean' ? entry.hasAudio : undefined,
          createdAt: Number(entry.createdAt) || 0,
        };
        if (state.assets.some((item) => item.id === asset.id)) continue;
        state.assets.push(asset);
        assetsById.set(asset.id, asset);
      }
      if (raw.autoImportVersion !== 3) {
        // V0.9 migration: assets auto-imported by the pre-release workbench are
        // test artifacts. Keep the user's own imports and skip those attachments
        // so the pre-release Host list cannot add them back.
        const autoImported = state.assets.filter((asset) => typeof asset.originKey === 'string' && asset.originKey.startsWith('attachment:'));
        if (autoImported.length > 0) {
          const skipped = new Set(state.autoImportSkipped);
          for (const asset of autoImported) skipped.add(asset.originKey);
          state.autoImportSkipped = [...skipped].slice(-1000);
          const removed = new Set(autoImported.map((asset) => asset.id));
          state.assets = state.assets.filter((asset) => !removed.has(asset.id));
        }
      }
      const rawGenerations = Array.isArray(raw.generations) ? raw.generations.slice(-MAX_GENERATIONS) : [];
      const generationsById = new Map();
      for (const entry of rawGenerations) {
        if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id.length > 120 || generationsById.has(entry.id)) continue;
        const spec = normalizeSpec(entry.spec, entry.title);
        if (spec === null) continue;
        const generation = {
          id: entry.id,
          title: spec.title,
          spec,
          source: entry.source === 'local' ? 'local' : 'deepseek',
          status: entry.status === 'applied' ? 'applied' : 'draft',
          createdAt: Number(entry.createdAt) || 0,
        };
        state.generations.push(generation);
        generationsById.set(generation.id, generation);
      }
      const timeline = { video: [], audio: [], music: [] };
      const seenClipIds = new Set();
      for (const track of ['video', 'audio', 'music']) {
        const rawClips = Array.isArray(raw.timeline?.[track]) ? raw.timeline[track] : [];
        for (const clip of rawClips.slice(-MAX_CLIPS_PER_TRACK)) {
          const normalized = normalizeClip(clip, generationsById, assetsById);
          if (normalized !== null && normalized.track === track) {
            if (normalized.id.length > 120 || seenClipIds.has(normalized.id)) normalized.id = uid('clip');
            seenClipIds.add(normalized.id);
            timeline[track].push(normalized);
          }
        }
        timeline[track].sort((a, b) => a.start - b.start);
      }
      state.timeline = timeline;
      state.generations = reconcileAppliedGenerations(state.generations, timeline);
      if (state.project.aspectInitialized !== true) {
        const firstVideo = timeline.video.find((clip) => clip.kind === 'asset');
        const firstAsset = firstVideo === undefined ? undefined : assetsById.get(firstVideo.assetId);
        const derivedAspect = firstAsset === undefined ? null : closestAspectFor(firstAsset.width, firstAsset.height);
        if (derivedAspect !== null) {
          state.project.aspect = derivedAspect;
          state.project.aspectInitialized = true;
        }
      }
      const rawMessages = Array.isArray(raw.chat?.messages) ? raw.chat.messages.slice(-500) : [];
      const seenMessageIds = new Set();
      for (const entry of rawMessages) {
        if (entry === null || typeof entry !== 'object') continue;
        const role = entry.role === 'user' || entry.role === 'error' ? entry.role : 'assistant';
        if (typeof entry.text !== 'string') continue;
        const generationId = typeof entry.generationId === 'string' && generationsById.has(entry.generationId) ? entry.generationId : null;
        let messageId = typeof entry.id === 'string' && entry.id.length <= 120 ? entry.id : uid('msg');
        if (seenMessageIds.has(messageId)) messageId = uid('msg');
        seenMessageIds.add(messageId);
        state.chat.messages.push({
          id: messageId,
          role,
          text: entry.text.slice(0, 12_000),
          notes: Array.isArray(entry.notes)
            ? entry.notes
              .filter((note) => typeof note === 'string')
              .slice(0, 4)
              .map((note) => note.slice(0, 240))
            : [],
          generationId,
          source: entry.source === 'local' ? 'local' : entry.source === 'deepseek' ? 'deepseek' : null,
          localPrompt: typeof entry.localPrompt === 'string' ? entry.localPrompt.slice(0, 4_000) : '',
          stopped: entry.stopped === true,
          discarded: entry.discarded === true,
          at: Number(entry.at) || 0,
        });
      }
      const savedSkills = Array.isArray(raw.preferences?.skills)
        ? [...new Set(raw.preferences.skills
          .filter((name) => typeof name === 'string' && name.length > 0)
          .map((name) => name.slice(0, 120)))].slice(0, 2)
        : [];
      const savedModel = raw.preferences?.model;
      if (savedModel !== null && typeof savedModel === 'object'
        && typeof savedModel.provider === 'string' && typeof savedModel.model === 'string') {
        state.preferences.model = {
          provider: savedModel.provider,
          model: savedModel.model,
          providerName: typeof savedModel.providerName === 'string' ? savedModel.providerName : savedModel.provider,
          modelName: typeof savedModel.modelName === 'string' ? savedModel.modelName : savedModel.model,
          reasoningEffort: typeof savedModel.reasoningEffort === 'string' ? savedModel.reasoningEffort : undefined,
        };
      }
      state.preferences.skills = savedSkills;
      state.persistence = { started: true, status: 'saved', error: '' };
      return options.allowEmpty === true || hasContent(state) ? state : null;
    }

    function normalizeWorkspacePath(value) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text.length === 0) return '';
      const normalized = text.replace(/\\/g, '/').replace(/\/+$/, '');
      return normalized.length === 0 ? '/' : normalized;
    }

    function workspaceNameFromPath(value) {
      const normalized = normalizeWorkspacePath(value);
      if (normalized.length === 0 || normalized === '/') return normalized || 'Workspace';
      return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized;
    }

    function projectDocKey(projectId) {
      return `${PROJECT_DOC_PREFIX}${projectId}`;
    }

    function createEmptyProjectIndex() {
      return {
        version: PROJECT_INDEX_VERSION,
        scopeMode: 'workspace',
        legacyMigrated: false,
        activeByScope: {},
        projects: [],
      };
    }

    function sanitizeProjectIndex(raw) {
      if (raw === null || typeof raw !== 'object' || raw.version !== PROJECT_INDEX_VERSION) return null;
      const index = createEmptyProjectIndex();
      // Project management is Workspace-only since V0.9.6; a legacy
      // `session` mode index is read as Workspace mode. Legacy `session:<id>`
      // entries are moved into the resolved Workspace when that Session is
      // activated (see adoptSessionProjects).
      index.scopeMode = 'workspace';
      index.legacyMigrated = raw.legacyMigrated === true;
      const seen = new Set();
      for (const entry of Array.isArray(raw.projects) ? raw.projects : []) {
        if (entry === null || typeof entry !== 'object') continue;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        if (!/^prj[-_][A-Za-z0-9_-]{1,100}$/.test(id) || seen.has(id)) continue;
        const scopeKey = typeof entry.scopeKey === 'string' ? entry.scopeKey.trim() : '';
        if (scopeKey.length === 0 || scopeKey.length > 600) continue;
        seen.add(id);
        index.projects.push({
          id,
          name: typeof entry.name === 'string' ? entry.name.trim().slice(0, 80) : '',
          scopeKey,
          createdAt: Math.max(0, Number(entry.createdAt) || 0),
          updatedAt: Math.max(0, Number(entry.updatedAt) || 0),
        });
        if (index.projects.length >= 500) break;
      }
      if (raw.activeByScope !== null && typeof raw.activeByScope === 'object' && !Array.isArray(raw.activeByScope)) {
        for (const [key, value] of Object.entries(raw.activeByScope)) {
          if (typeof key !== 'string' || key.length === 0 || key.length > 600) continue;
          if (typeof value !== 'string' || !seen.has(value)) continue;
          index.activeByScope[key] = value;
        }
      }
      return index;
    }

    function readProjectIndex() {
      let raw = null;
      try {
        raw = localStorage.getItem(PROJECT_INDEX_KEY);
        if (raw === null) return null;
        const index = sanitizeProjectIndex(JSON.parse(raw));
        if (index === null) {
          // Unknown/corrupt index: keep the original bytes recoverable instead
          // of letting the first save overwrite the only copy of the project list.
          try { localStorage.setItem(`${PROJECT_INDEX_KEY}.backup`, raw); } catch { /* Best effort. */ }
        }
        return index;
      } catch {
        if (typeof raw === 'string' && raw.length > 0) {
          try { localStorage.setItem(`${PROJECT_INDEX_KEY}.backup`, raw); } catch { /* Best effort. */ }
        }
        return null;
      }
    }

    function persistProjectIndex(index) {
      try {
        localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(index));
        return true;
      } catch {
        return false;
      }
    }

    // Global workbench settings (V0.9.6+). They are not part of any project
    // document, so they survive project switches and restores.
    function readWorkbenchSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw === null) return {};
        const parsed = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    function writeWorkbenchSettings(settings) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        return true;
      } catch {
        return false;
      }
    }

    function backupDocKey(projectId) {
      return `${BACKUP_KEY_PREFIX}${projectId}`;
    }

    function readProjectBackups(projectId) {
      if (typeof projectId !== 'string' || projectId.length === 0) return null;
      try {
        const raw = localStorage.getItem(backupDocKey(projectId));
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object'
          || parsed.version !== 1 || parsed.projectId !== projectId
          || !Array.isArray(parsed.snapshots)) return null;
        const snapshots = parsed.snapshots
          .filter((snapshot) => snapshot !== null && typeof snapshot === 'object'
            && Number.isFinite(Number(snapshot.at))
            && snapshot.doc !== null && typeof snapshot.doc === 'object')
          .map((snapshot) => ({ at: Number(snapshot.at), doc: snapshot.doc }))
          .slice(-MAX_PROJECT_BACKUPS);
        if (snapshots.length === 0) return null;
        return { version: 1, projectId, snapshots };
      } catch {
        return null;
      }
    }

    function writeProjectBackups(projectId, bucket) {
      if (typeof projectId !== 'string' || projectId.length === 0) return false;
      try {
        if (bucket === null || !Array.isArray(bucket.snapshots) || bucket.snapshots.length === 0) {
          localStorage.removeItem(backupDocKey(projectId));
          return true;
        }
        localStorage.setItem(backupDocKey(projectId), JSON.stringify(bucket));
        return true;
      } catch {
        return false;
      }
    }

    function removeProjectBackups(projectId) {
      try {
        localStorage.removeItem(backupDocKey(projectId));
      } catch {
        // Storage may be unavailable; the caller continues.
      }
    }

    function listBackupProjectKeys() {
      const keys = [];
      try {
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (typeof key === 'string' && key.startsWith(BACKUP_KEY_PREFIX)) keys.push(key);
        }
      } catch {
        // Storage may not expose enumeration; skip pruning.
      }
      return keys;
    }

    // Drop the oldest whole buckets when the workspace has accumulated too many
    // project backup buckets (one bucket per visited project). Called after every
    // successful backup write, so the documented bucket cap is a real invariant
    // and not only a failure-recovery heuristic (P2-2 / C-07).
    function pruneBackupBuckets(keepProjectId) {
      const keys = listBackupProjectKeys().filter((key) => key !== backupDocKey(keepProjectId));
      if (keys.length < MAX_BACKUP_BUCKETS) return;
      const buckets = keys.map((key) => {
        const projectId = key.slice(BACKUP_KEY_PREFIX.length);
        const bucket = readProjectBackups(projectId);
        return { projectId, latest: bucket === null ? 0 : bucket.snapshots[bucket.snapshots.length - 1].at };
      }).sort((a, b) => a.latest - b.latest);
      const overflow = Math.max(0, keys.length - (MAX_BACKUP_BUCKETS - 1));
      for (let index = 0; index < overflow; index += 1) removeProjectBackups(buckets[index].projectId);
    }

    function backupStorageChars() {
      let total = 0;
      for (const key of listBackupProjectKeys()) {
        try {
          const raw = localStorage.getItem(key);
          if (raw !== null) total += key.length + raw.length;
        } catch {
          // Storage may be unavailable; treat the key as free.
        }
      }
      return total;
    }

    /**
     * Keep the total backup footprint under MAX_BACKUP_TOTAL_CHARS by evicting
     * the oldest snapshot anywhere. The active project's newest snapshot is never
     * evicted; older snapshots of it are. Returns true when a change was written.
     */
    function pruneBackupBudget(activeProjectId) {
      const activeKey = backupDocKey(activeProjectId);
      for (let guard = 0; guard < 400; guard += 1) {
        const keys = listBackupProjectKeys();
        if (keys.length === 0) return false;
        const buckets = [];
        let total = 0;
        for (const key of keys) {
          const projectId = key.slice(BACKUP_KEY_PREFIX.length);
          const bucket = readProjectBackups(projectId);
          if (bucket === null) {
            removeProjectBackups(projectId);
            continue;
          }
          try {
            const raw = localStorage.getItem(key);
            total += key.length + (raw === null ? 0 : raw.length);
          } catch {
            // Ignore unreadable buckets; they do not count against the budget.
          }
          buckets.push({ key, projectId, bucket });
        }
        if (total <= MAX_BACKUP_TOTAL_CHARS && buckets.length <= MAX_BACKUP_BUCKETS) return false;
        let victim = null;
        for (const candidate of buckets) {
          const snapshots = candidate.bucket.snapshots;
          for (let index = 0; index < snapshots.length; index += 1) {
            const isNewest = index === snapshots.length - 1;
            if (candidate.key === activeKey && isNewest) continue;
            if (victim === null || snapshots[index].at < victim.snapshot.at) {
              victim = { candidate, index, snapshot: snapshots[index] };
            }
          }
        }
        if (victim === null) return false;
        const remaining = victim.candidate.bucket.snapshots.filter((_, index) => index !== victim.index);
        if (!writeProjectBackups(victim.candidate.projectId, {
          version: 1,
          projectId: victim.candidate.projectId,
          snapshots: remaining,
        })) return false;
      }
      return false;
    }

    /** Last-resort eviction used when a project document save fails on quota:
     *  drop every non-active backup bucket and keep one snapshot of the active
     *  project. Project data always outranks convenience backups. */
    function emergencyPruneBackups(activeProjectId) {
      const activeKey = backupDocKey(activeProjectId);
      let removed = 0;
      for (const key of listBackupProjectKeys()) {
        if (key === activeKey) continue;
        removeProjectBackups(key.slice(BACKUP_KEY_PREFIX.length));
        removed += 1;
      }
      const activeBucket = readProjectBackups(activeProjectId);
      if (activeBucket !== null && activeBucket.snapshots.length > 1) {
        const latest = activeBucket.snapshots[activeBucket.snapshots.length - 1];
        if (writeProjectBackups(activeProjectId, { version: 1, projectId: activeProjectId, snapshots: [latest] })) removed += 1;
      }
      return removed;
    }

    /** Last resort when a project document still cannot be saved after the
     *  normal eviction: drop the active project's backup bucket. Project data
     *  always outranks convenience backups; a later successful save takes a
     *  fresh snapshot again. */
    function dropActiveBackupBucket(activeProjectId) {
      if (readProjectBackups(activeProjectId) === null) return false;
      return writeProjectBackups(activeProjectId, { version: 1, projectId: activeProjectId, snapshots: [] });
    }

    function removeAllProjectBackups() {
      let removed = 0;
      for (const key of listBackupProjectKeys()) {
        removeProjectBackups(key.slice(BACKUP_KEY_PREFIX.length));
        removed += 1;
      }
      return removed;
    }

    function readLegacyProject() {
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        return restoreProject(parsed, { allowEmpty: true });
      } catch {
        return null;
      }
    }

    function readProjectDocument(projectId) {
      try {
        const raw = localStorage.getItem(projectDocKey(projectId));
        if (raw === null) return null;
        const parsed = JSON.parse(raw);
        return restoreProject(parsed, { allowEmpty: true });
      } catch {
        return null;
      }
    }

    function writeProjectDocument(projectId, state) {
      try {
        localStorage.setItem(projectDocKey(projectId), JSON.stringify(serializeProject(state)));
        return true;
      } catch {
        return false;
      }
    }

    function removeProjectDocument(projectId) {
      try {
        localStorage.removeItem(projectDocKey(projectId));
      } catch {
        // Storage may be unavailable; the in-memory index is still updated.
      }
    }

    function projectScopeKey(sessionId, cwd) {
      const normalized = normalizeWorkspacePath(cwd);
      if (normalized.length > 0) return `workspace:${normalized}`;
      return typeof sessionId === 'string' && sessionId.length > 0 ? `workspace:unresolved:${sessionId}` : '';
    }

    function projectScopeLabel(cwd) {
      return normalizeWorkspacePath(cwd).length > 0 ? workspaceNameFromPath(cwd) : 'unresolved';
    }

    function matchesInboxScope(record, scope) {
      if (record === null || typeof record !== 'object') return false;
      const hasSource = (typeof record.sessionId === 'string' && record.sessionId.length > 0)
        || (typeof record.cwd === 'string' && record.cwd.length > 0);
      // Legacy inbox records without a Workspace are shared, as before.
      if (!hasSource) return true;
      if (scope === null || scope === undefined) return false;
      return typeof record.cwd === 'string'
        && normalizeWorkspacePath(record.cwd) === normalizeWorkspacePath(scope.workspacePath);
    }

    function readConversationFileDrag(dataTransfer) {
      if (dataTransfer === null || dataTransfer === undefined || typeof dataTransfer.getData !== 'function') return null;
      let raw = '';
      try { raw = dataTransfer.getData(CONVERSATION_FILE_MIME); } catch { raw = ''; }
      if (typeof raw !== 'string' || raw.length === 0) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return null;
        const attachmentId = typeof parsed.attachmentId === 'string' ? parsed.attachmentId.slice(0, 260) : '';
        const path = typeof parsed.path === 'string' ? parsed.path.slice(0, 4096) : '';
        if (attachmentId.length === 0 && path.length === 0) return null;
        return {
          attachmentId,
          path,
          name: typeof parsed.name === 'string' ? parsed.name.slice(0, 180) : '',
          bytes: Math.max(0, Number(parsed.bytes) || 0),
          kind: typeof parsed.kind === 'string' ? parsed.kind : '',
        };
      } catch {
        return null;
      }
    }

    function projectIndexItemsForScope(index, scopeKey) {
      return index.projects
        .filter((entry) => entry.scopeKey === scopeKey)
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    }

    function serializeProject(state) {
      return {
        version: 1,
        savedAt: Date.now(),
        project: { name: state.project.name, aspect: state.project.aspect, aspectInitialized: state.project.aspectInitialized === true },
        autoImportVersion: 3,
        autoImportSince: Math.max(0, Number(state.autoImportSince) || 0),
        autoImportSkipped: (state.autoImportSkipped ?? []).slice(-1000),
        assets: state.assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          kind: asset.kind,
          mime: asset.mime,
          size: asset.size,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
          palette: asset.palette,
          peaks: asset.peaks,
          blobId: asset.blobId,
          source: asset.source,
          toolCallId: asset.toolCallId,
          originKey: asset.originKey,
          attachmentId: asset.attachmentId,
          hasAudio: asset.hasAudio === true,
          createdAt: asset.createdAt,
        })),
        generations: state.generations.map((generation) => ({
          id: generation.id,
          title: generation.title,
          spec: generation.spec,
          source: generation.source,
          status: generation.status,
          createdAt: generation.createdAt,
        })),
        timeline: {
          video: state.timeline.video.map((clip) => ({ ...clip })),
          audio: state.timeline.audio.map((clip) => ({ ...clip })),
          music: state.timeline.music.map((clip) => ({ ...clip })),
        },
        chat: {
          messages: state.chat.messages.slice(-500).map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            notes: message.notes,
            generationId: message.generationId,
            source: message.source,
            localPrompt: message.localPrompt,
            stopped: message.stopped,
            discarded: message.discarded,
            at: message.at,
          })),
        },
        preferences: {
          model: state.preferences.model,
          skills: state.preferences.skills,
        },
      };
    }

    function createEmptyState() {
      return {
        project: { name: '', aspect: '16:9', aspectInitialized: false },
        autoImportVersion: 3,
        autoImportSince: 0,
        autoImportSkipped: [],
        projects: {
          ready: false,
          scopeKey: '',
          scopeLabel: '',
          workspacePath: '',
          activeId: null,
          items: [],
          busy: false,
          error: '',
          backup: { enabled: true, lastAt: 0, count: 0 },
        },
        assets: [],
        generations: [],
        selectedAsset: null,
        selectedAssets: [],
        timeline: { video: [], audio: [], music: [] },
        selectedClip: null,
        selectedClips: [],
        chat: { messages: [], busy: false },
        models: { status: 'idle', items: [], default: null, error: '' },
        skills: { status: 'idle', items: [], error: '' },
        preferences: { model: null, skills: [] },
        persistence: { started: false, status: 'blank', error: '' },
        import: { busy: false, done: 0, total: 0, error: '' },
        history: { canUndo: false, canRedo: false },
        toast: null,
      };
    }

    function hasContent(state) {
      return state.assets.length > 0
        || state.generations.length > 0
        || state.chat.messages.length > 0
        || clipsOfTimeline(state.timeline).length > 0
        || (Array.isArray(state.autoImportSkipped) && state.autoImportSkipped.length > 0)
        || (typeof state.project.name === 'string' && state.project.name.trim().length > 0);
    }

    function cloneTimeline(timeline) {
      return {
        video: timeline.video.map((clip) => ({ ...clip })),
        audio: timeline.audio.map((clip) => ({ ...clip })),
        music: timeline.music.map((clip) => ({ ...clip })),
      };
    }

    function normalizeReasoning(value) {
      if (value === null || typeof value !== 'object' || !Array.isArray(value.efforts)) return null;
      const efforts = [];
      const seen = new Set();
      for (const entry of value.efforts.slice(0, 8)) {
        if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
        const id = entry.id.trim().slice(0, 80);
        if (id.length === 0 || seen.has(id)) continue;
        seen.add(id);
        efforts.push({
          id,
          name: typeof entry.name === 'string' && entry.name.trim().length > 0
            ? entry.name.trim().slice(0, 80)
            : id,
        });
      }
      if (efforts.length === 0) return null;
      return {
        efforts,
        defaultEffort: typeof value.defaultEffort === 'string' && seen.has(value.defaultEffort)
          ? value.defaultEffort
          : undefined,
      };
    }

    function normalizeReasoningEffort(reasoning, requested) {
      if (reasoning === null || reasoning === undefined) return undefined;
      if (typeof requested === 'string' && reasoning.efforts.some((entry) => entry.id === requested)) {
        return requested;
      }
      return reasoning.defaultEffort;
    }

    function reasoningEffortLabel(reasoning, requested, t) {
      if (reasoning === null || reasoning === undefined) return '';
      const effort = normalizeReasoningEffort(reasoning, requested);
      if (effort === undefined) return t('model.default');
      const match = reasoning.efforts.find((entry) => entry.id === effort);
      return match === undefined ? t('model.default') : match.name;
    }

    function precedenceModel(state) {
      const items = state.models.items;
      const preference = state.preferences.model;
      if (preference !== null) {
        const match = items.find((item) => item.provider === preference.provider && item.id === preference.model);
        if (match !== undefined) {
          const reasoning = match.reasoning ?? null;
          return {
            provider: match.provider,
            model: match.id,
            providerName: match.providerName,
            modelName: match.name,
            reasoning,
            reasoningEffort: normalizeReasoningEffort(reasoning, preference.reasoningEffort),
          };
        }
        return preference;
      }
      const fallback = state.models.default ?? items[0];
      if (fallback === undefined) return null;
      const reasoning = fallback.reasoning ?? null;
      return {
        provider: fallback.provider,
        model: fallback.id,
        providerName: fallback.providerName,
        modelName: fallback.name,
        reasoning,
        reasoningEffort: normalizeReasoningEffort(reasoning, fallback.reasoningEffort),
      };
    }

    function compactGenerationSpec(generation) {
      if (generation === null || generation === undefined) return null;
      return {
        title: generation.spec.title,
        palette: generation.spec.palette,
        scenes: generation.spec.scenes.map((scene) => ({
          type: scene.type,
          title: scene.title,
          subtitle: scene.subtitle,
          duration: scene.duration,
          intensity: scene.intensity,
          seed: scene.seed,
        })),
      };
    }

    function chooseActiveModel(state) {
      return precedenceModel(state);
    }

    async function bridgeRequest(payload, signal) {
      const response = await fetch(API_PATH, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dsh-design': '1',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal,
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        const message = typeof data?.error?.message === 'string' ? data.error.message : `Request failed (${response.status}).`;
        const error = new Error(message);
        error.code = data?.error?.code ?? 'request-failed';
        throw error;
      }
      if (data === null || typeof data !== 'object') throw new Error('The server response was empty.');
      return data;
    }

    function readImageInfo(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve({
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          image,
        });
        image.onerror = () => reject(new Error('image-decode'));
        image.src = src;
      });
    }

    async function extractPalette(src) {
      try {
        const info = await readImageInfo(src);
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context === null) return DEFAULT_PALETTE.slice();
        context.drawImage(info.image, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        const buckets = new Map();
        for (let index = 0; index < pixels.length; index += 16) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const alpha = pixels[index + 3];
          if (alpha < 140) continue;
          const max = Math.max(red, green, blue);
          const min = Math.min(red, green, blue);
          if (max < 16 || min > 244) continue;
          const saturation = max === 0 ? 0 : (max - min) / max;
          const brightness = (max + min) / 510;
          if (saturation < 0.06 && (brightness < 0.08 || brightness > 0.92)) continue;
          const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
          const entry = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0, weight: 0 };
          entry.count += 1;
          entry.red += red;
          entry.green += green;
          entry.blue += blue;
          entry.weight += 0.3 + saturation;
          buckets.set(key, entry);
        }
        const colors = [...buckets.values()]
          .sort((a, b) => (b.count * b.weight) - (a.count * a.weight))
          .slice(0, 4)
          .map((entry) => {
            const red = Math.round(entry.red / entry.count);
            const green = Math.round(entry.green / entry.count);
            const blue = Math.round(entry.blue / entry.count);
            return `#${[red, green, blue].map((value) => clamp(value, 0, 255).toString(16).padStart(2, '0')).join('')}`;
          });
        while (colors.length < 4) colors.push(DEFAULT_PALETTE[colors.length]);
        return colors;
      } catch {
        return DEFAULT_PALETTE.slice();
      }
    }

    function probeVideo(src) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        let settled = false;
        let timer = 0;
        const cleanup = () => {
          window.clearTimeout(timer);
          video.removeEventListener('loadedmetadata', onMetadata);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('video-decode'));
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            const width = Math.max(1, video.videoWidth || 16);
            const height = Math.max(1, video.videoHeight || 9);
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 270;
            const context = canvas.getContext('2d');
            if (context === null) {
              reject(new Error('video-decode'));
              return;
            }
            const sourceRatio = width / height;
            const targetRatio = 16 / 9;
            let sx = 0;
            let sy = 0;
            let sw = width;
            let sh = height;
            if (sourceRatio > targetRatio) {
              sw = height * targetRatio;
              sx = (width - sw) / 2;
            } else {
              sh = width / targetRatio;
              sy = (height - sh) / 2;
            }
            context.drawImage(video, sx, sy, sw, sh, 0, 0, 480, 270);
            const poster = canvas.toDataURL('image/jpeg', 0.78);
            resolve({ width, height, duration: Math.max(0, Number(video.duration) || 0), poster });
          } catch {
            reject(new Error('video-decode'));
          }
        };
        const onMetadata = () => {
          const duration = Math.max(0, Number(video.duration) || 0);
          if (!Number.isFinite(duration) || duration <= 0) {
            fail();
            return;
          }
          try {
            video.currentTime = Math.min(0.12, duration / 2);
          } catch {
            finish();
          }
        };
        const onSeeked = () => finish();
        const onError = () => fail();
        video.addEventListener('loadedmetadata', onMetadata);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = src;
        timer = window.setTimeout(fail, 10_000);
        try {
          video.load();
        } catch {
          fail();
        }
      });
    }

    function reconcileAppliedGenerations(generations, timeline) {
      const used = new Set(trackClips(timeline, 'video').map((clip) => clip.generationId).filter(Boolean));
      return generations.map((generation) => {
        if (generation.status === 'applied' && !used.has(generation.id)) return { ...generation, status: 'draft' };
        if (generation.status === 'draft' && used.has(generation.id)) return { ...generation, status: 'applied' };
        return generation;
      });
    }

    function createWorkbenchStore(ctx) {
      const listeners = new Set();
      const storedProjectIndex = readProjectIndex();
      let projectIndex = storedProjectIndex ?? createEmptyProjectIndex();
      let state = createEmptyState();
      let history = [];
      let future = [];
      let initialized = false;
      let disposed = false;
      let saveTimer = 0;
      let toastTimer = 0;
      let generationController = null;
      let generationEpoch = 0;
      let projectEpoch = 0;
      let modelRetryTimer = 0;
      let modelRetryAttempt = 0;
      let skillRetryTimer = 0;
      let skillRetryAttempt = 0;
      let backupEnabled = readWorkbenchSettings().autoBackup !== false;
      let backupTimer = 0;
      let backupLastAt = 0;
      let backupCount = 0;
      let backupTooLarge = false;
      let backupFailureNotified = false;
      const ownedUrls = new Set();
      let inboxChannel = null;
      let inboxConsuming = false;
      let activeSessionId = null;
      let activeWorkspacePath = '';
      let scopeToken = 0;
      let workspaceWatchTimer = 0;
      let workspaceUnsubscribe = null;
      let sessionMediaTimer = 0;
      let sessionMediaBusy = false;
      let sessionMediaAbort = null;
      let sessionMediaQueue = [];
      const sessionMediaAttempted = new Set();
      const sessionsService = (() => {
        try {
          if (typeof ctx?.get === 'function') {
            const service = ctx.get('sessions');
            if (service !== undefined && service !== null) return service;
          }
        } catch {
          // Fall through to the direct property.
        }
        return ctx?.sessions ?? null;
      })();
      let scope = {
        key: '',
        label: '',
        workspacePath: '',
        sessionId: null,
        activeId: null,
        ready: false,
        fallback: false,
      };

      function emit() {
        for (const listener of listeners) listener();
      }

      function setState(next) {
        if (disposed) return;
        state = next;
        emit();
      }

      function syncHistoryFlags(extra = {}) {
        return { ...extra, history: { canUndo: history.length > 0, canRedo: future.length > 0 } };
      }

      function projectMetaPatch(extra = {}) {
        const items = scope.key.length > 0
          ? projectIndexItemsForScope(projectIndex, scope.key).map((entry) => ({ ...entry }))
          : [];
        return {
          ready: scope.ready,
          scopeKey: scope.key,
          scopeLabel: scope.label,
          workspacePath: scope.workspacePath,
          activeId: scope.activeId,
          items,
          busy: state.projects.busy === true,
          error: state.projects.error ?? '',
          backup: {
            enabled: backupEnabled,
            lastAt: backupLastAt,
            count: backupCount,
            tooLarge: backupTooLarge,
          },
          ...extra,
        };
      }

      function updateProjectMeta(extra = {}) {
        state = { ...state, projects: projectMetaPatch(extra) };
      }

      function refreshBackupMeta(projectId) {
        const bucket = readProjectBackups(projectId);
        backupCount = bucket === null ? 0 : bucket.snapshots.length;
        backupLastAt = bucket === null ? 0 : bucket.snapshots[bucket.snapshots.length - 1].at;
      }

      function stopBackupTimer() {
        if (backupTimer !== 0) {
          window.clearInterval(backupTimer);
          backupTimer = 0;
        }
      }

      function startBackupTimer() {
        stopBackupTimer();
        if (disposed || !backupEnabled || !scope.ready || scope.activeId === null) return;
        backupTimer = window.setInterval(() => {
          if (disposed || !scope.ready || scope.activeId === null) return;
          backupNow();
        }, PROJECT_BACKUP_INTERVAL_MS);
      }

      // Refresh the menu-facing backup metadata and restart the minute timer for
      // the project that just became active.
      function activateBackup(projectId) {
        refreshBackupMeta(projectId);
        startBackupTimer();
      }

      /** Compare project documents while ignoring the wall-clock `savedAt`
       *  stamp, so the "content unchanged" checks cannot be defeated by it. */
      function comparableProjectDoc(value) {
        if (value === null || typeof value !== 'object') return '';
        const copy = { ...value };
        delete copy.savedAt;
        return JSON.stringify(copy);
      }

      function setAutoBackup(enabled) {
        const next = enabled === true;
        if (next === backupEnabled) return true;
        // Never report a toggle change that cannot survive a reload (C-09).
        const persisted = writeWorkbenchSettings({ ...readWorkbenchSettings(), autoBackup: next });
        if (!persisted) {
          showToast(pickText(localeIdOf(ctx), 'toast.backupSettingsFailed'), 'error');
          return false;
        }
        backupEnabled = next;
        if (next) {
          backupTooLarge = false;
          startBackupTimer();
        } else {
          stopBackupTimer();
        }
        state = { ...state, projects: projectMetaPatch({}) };
        emit();
        return true;
      }

      function clearProjectBackups() {
        const removed = removeAllProjectBackups();
        backupCount = 0;
        backupLastAt = 0;
        backupTooLarge = false;
        backupFailureNotified = false;
        state = { ...state, projects: projectMetaPatch({}) };
        emit();
        return removed;
      }

      function backupNow() {
        if (disposed || !scope.ready || scope.activeId === null || !hasContent(state)) return false;
        if (saveTimer !== 0 && !flushSave()) return false;
        const projectId = scope.activeId;
        const serialized = JSON.stringify(serializeProject(state));
        if (serialized.length > MAX_BACKUP_DOC_BYTES) {
          // Backing up this project is impossible under the documented 1 MiB
          // cap; tell the user once instead of silently never snapshotting (U-04).
          if (!backupTooLarge) {
            backupTooLarge = true;
            showToast(pickText(localeIdOf(ctx), 'toast.backupTooLarge'), 'error');
            state = { ...state, projects: projectMetaPatch({}) };
            emit();
          }
          return false;
        }
        const doc = JSON.parse(serialized);
        const existing = readProjectBackups(projectId);
        const snapshots = existing === null ? [] : existing.snapshots;
        const docComparable = comparableProjectDoc(doc);
        // Compare against every retained snapshot, not only the newest: a
        // restore followed by the minute timer would otherwise append a
        // duplicate of the restored document and defeat restore reversibility
        // (P2-3).
        if (snapshots.some((snapshot) => comparableProjectDoc(snapshot.doc) === docComparable)) return false;
        const at = Date.now();
        const nextSnapshots = [...snapshots, { at, doc }].slice(-MAX_PROJECT_BACKUPS);
        let written = writeProjectBackups(projectId, { version: 1, projectId, snapshots: nextSnapshots });
        if (!written) {
          pruneBackupBuckets(projectId);
          pruneBackupBudget(projectId);
          written = writeProjectBackups(projectId, { version: 1, projectId, snapshots: nextSnapshots });
        }
        if (!written) {
          if (!backupFailureNotified) {
            backupFailureNotified = true;
            showToast(pickText(localeIdOf(ctx), 'toast.backupFailed'), 'error');
          }
          return false;
        }
        backupFailureNotified = false;
        backupTooLarge = false;
        // Proactive retention: enforce the bucket cap and the total backup budget
        // on every successful write instead of only after a quota failure (P2-2).
        pruneBackupBuckets(projectId);
        pruneBackupBudget(projectId);
        refreshBackupMeta(projectId);
        state = { ...state, projects: projectMetaPatch({}) };
        emit();
        return true;
      }

      function restoreProjectBackup() {
        if (disposed || !scope.ready || scope.activeId === null) return false;
        const projectId = scope.activeId;
        const bucket = readProjectBackups(projectId);
        if (bucket === null || bucket.snapshots.length === 0) {
          showToast(pickText(localeIdOf(ctx), 'toast.backupRestoreFailed'), 'error');
          return false;
        }
        const latest = bucket.snapshots[bucket.snapshots.length - 1];
        const restored = restoreProject(latest.doc, { allowEmpty: true });
        if (restored === null) {
          showToast(pickText(localeIdOf(ctx), 'toast.backupRestoreFailed'), 'error');
          return false;
        }
        if (saveTimer !== 0 && !flushSave()) {
          showToast(pickText(localeIdOf(ctx), 'project.saveFailed'), 'error');
          return false;
        }
        // Keep the pre-restore document as a snapshot so the restore is itself
        // reversible from the same menu. The current project must never be
        // overwritten when this safety copy cannot be stored (P1): abort before
        // touching any in-memory or persisted project state.
        const preRestoreRaw = JSON.stringify(serializeProject(state));
        if (preRestoreRaw.length > MAX_BACKUP_DOC_BYTES) {
          showToast(pickText(localeIdOf(ctx), 'toast.backupRestoreUnsafe'), 'error');
          return false;
        }
        const preRestore = { at: Date.now(), doc: JSON.parse(preRestoreRaw) };
        const preComparable = comparableProjectDoc(preRestore.doc);
        const dedupedSnapshots = bucket.snapshots
          .filter((snapshot) => comparableProjectDoc(snapshot.doc) !== preComparable)
          .slice(-(MAX_PROJECT_BACKUPS - 1));
        const nextSnapshots = [...dedupedSnapshots, preRestore];
        if (!writeProjectBackups(projectId, { version: 1, projectId, snapshots: nextSnapshots })) {
          showToast(pickText(localeIdOf(ctx), 'toast.backupRestoreUnsafe'), 'error');
          return false;
        }
        const previousAssets = state.assets;
        releaseProjectRuntime();
        restored.autoImportSince = Math.max(0, Number(restored.autoImportSince) || 0);
        restored.projects = projectMetaPatch({
          ready: true,
          activeId: projectId,
          items: projectIndexItemsForScope(projectIndex, scope.key).map((item) => ({ ...item })),
          busy: false,
          error: '',
        });
        restored.persistence = { started: true, status: 'saving', error: '' };
        state = restored;
        emit();
        const entry = activeProjectEntry();
        if (entry !== null) {
          entry.name = state.project.name;
          entry.updatedAt = Date.now();
        }
        const saved = writeProjectDocument(projectId, state);
        if (saved) {
          writeProjectIndexOrFail();
          // Delete media blobs only when neither the restored document nor a
          // retained backup snapshot references them. The pre-restore snapshot
          // keeps the undo path alive, so its blobs must survive too (B1).
          const keepBlobIds = new Set(state.assets
            .map((asset) => asset.blobId)
            .filter((blobId) => typeof blobId === 'string' && blobId.length > 0));
          const collectSnapshotBlobs = (doc) => {
            const assets = doc !== null && typeof doc === 'object' && Array.isArray(doc.assets) ? doc.assets : [];
            for (const asset of assets) {
              if (asset !== null && typeof asset === 'object' && typeof asset.blobId === 'string' && asset.blobId.length > 0) {
                keepBlobIds.add(asset.blobId);
              }
            }
          };
          for (const snapshot of nextSnapshots) collectSnapshotBlobs(snapshot.doc);
          for (const asset of previousAssets) {
            if (typeof asset.blobId === 'string' && asset.blobId.length > 0 && !keepBlobIds.has(asset.blobId)) {
              mediaDelete(asset.blobId).catch(() => {});
            }
          }
        }
        backupFailureNotified = false;
        backupTooLarge = false;
        refreshBackupMeta(projectId);
        state = {
          ...state,
          projects: projectMetaPatch({}),
          persistence: saved
            ? { started: true, status: 'saved', error: '' }
            : { started: true, status: 'error', error: 'localStorage' },
        };
        emit();
        hydrateMedia();
        startSessionMedia();
        showToast(pickText(localeIdOf(ctx), saved ? 'toast.backupRestored' : 'project.saveFailed'), saved ? 'success' : 'error');
        return saved;
      }

      function activeProjectEntry() {
        if (scope.activeId === null) return null;
        return projectIndex.projects.find((entry) => entry.id === scope.activeId) ?? null;
      }

      function projectEntryById(projectId) {
        return projectIndex.projects.find((entry) => entry.id === projectId) ?? null;
      }

      function writeProjectIndexOrFail() {
        if (persistProjectIndex(projectIndex)) return true;
        state = {
          ...state,
          projects: {
            ...state.projects,
            busy: false,
            error: pickText(localeIdOf(ctx), 'toast.saveFailed'),
          },
          persistence: {
            ...state.persistence,
            status: 'error',
            error: 'localStorage-index',
          },
        };
        emit();
        showToast(pickText(localeIdOf(ctx), 'toast.saveFailed'), 'error');
        return false;
      }

      function setProjectError(message) {
        state = {
          ...state,
          projects: {
            ...state.projects,
            ready: false,
            busy: false,
            error: message,
          },
        };
        emit();
        if (message.length > 0) showToast(message, 'error');
      }

      function releaseProjectRuntime() {
        projectEpoch += 1;
        generationEpoch += 1;
        stopSessionMedia();
        if (generationController !== null) {
          try { generationController.abort(); } catch { /* Already settled. */ }
          generationController = null;
        }
        for (const url of ownedUrls) {
          try { URL.revokeObjectURL(url); } catch { /* Already released. */ }
        }
        ownedUrls.clear();
        audioRuntime.audioBuffers.clear();
        audioRuntime.bedBuffers.clear();
        history = [];
        future = [];
      }

      function sessionCwdFor(sessionId) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return '';
        try {
          const snapshot = sessionsService?.list?.getSnapshot?.();
          const summary = snapshot?.byId?.[sessionId];
          return typeof summary?.cwd === 'string' ? normalizeWorkspacePath(summary.cwd) : '';
        } catch {
          return '';
        }
      }

      function stopWorkspaceWatch() {
        if (workspaceWatchTimer !== 0) {
          window.clearTimeout(workspaceWatchTimer);
          workspaceWatchTimer = 0;
        }
        if (workspaceUnsubscribe !== null) {
          try { workspaceUnsubscribe(); } catch { /* Already gone. */ }
          workspaceUnsubscribe = null;
        }
      }

      function migrateLegacyProject(scopeKey) {
        if (projectIndex.legacyMigrated === true) {
          try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
          return true;
        }
        let legacy = null;
        try {
          const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (raw !== null) legacy = readLegacyProject();
        } catch {
          legacy = null;
        }
        if (legacy === null) {
          projectIndex.legacyMigrated = true;
          return writeProjectIndexOrFail();
        }
        // A migrated project is a fresh project for auto-import: baseline the
        // session-media cutoff so historical conversation exports cannot flood it.
        legacy.autoImportSince = Date.now();
        let entry = projectEntryById(LEGACY_PROJECT_ID);
        if (entry === null) {
          const now = Date.now();
          entry = { id: LEGACY_PROJECT_ID, name: legacy.project.name, scopeKey, createdAt: now, updatedAt: now };
          projectIndex.projects.unshift(entry);
        } else {
          entry.scopeKey = scopeKey;
          entry.name = legacy.project.name;
          entry.updatedAt = Date.now();
        }
        if (!writeProjectDocument(LEGACY_PROJECT_ID, legacy)) {
          setProjectError(pickText(localeIdOf(ctx), 'toast.saveFailed'));
          return false;
        }
        projectIndex.activeByScope[scopeKey] = LEGACY_PROJECT_ID;
        projectIndex.legacyMigrated = true;
        if (!writeProjectIndexOrFail()) return false;
        try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* Best-effort migration cleanup. */ }
        return true;
      }

      // A Workspace scope can be created under the synthetic
      // `workspace:unresolved:<sessionId>` key when the session's cwd arrives late.
      // Once the real path resolves, move those projects into the real Workspace
      // scope so they stay visible, switchable, and deletable.
      function adoptUnresolvedProjects(sessionId, scopeKey) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return { changed: false, failed: false };
        const orphanKey = `workspace:unresolved:${sessionId}`;
        if (scopeKey === orphanKey) return { changed: false, failed: false };
        const orphans = projectIndex.projects.filter((entry) => entry.scopeKey === orphanKey);
        if (orphans.length === 0) return { changed: false, failed: false };
        let changed = false;
        const droppedIds = [];
        for (const entry of orphans) {
          // Only a never-saved project is dropped. A document that exists but is
          // unreadable/corrupt is still adopted so its bytes remain recoverable.
          let missingDocument = false;
          try {
            missingDocument = localStorage.getItem(projectDocKey(entry.id)) === null;
          } catch {
            missingDocument = false;
          }
          if (missingDocument) {
            droppedIds.push(entry.id);
            changed = true;
            continue;
          }
          entry.scopeKey = scopeKey;
          entry.updatedAt = Date.now();
          changed = true;
        }
        if (droppedIds.length > 0) {
          const dropped = new Set(droppedIds);
          projectIndex.projects = projectIndex.projects.filter((entry) => !dropped.has(entry.id));
          for (const id of droppedIds) removeProjectDocument(id);
        }
        const orphanActive = projectIndex.activeByScope[orphanKey];
        if (typeof orphanActive === 'string') {
          const adoptedActive = projectIndex.projects.some((entry) => entry.id === orphanActive && entry.scopeKey === scopeKey);
          if (adoptedActive && projectIndex.activeByScope[scopeKey] === undefined) {
            projectIndex.activeByScope[scopeKey] = orphanActive;
          }
          delete projectIndex.activeByScope[orphanKey];
          changed = true;
        }
        if (!changed) return { changed: false, failed: false };
        if (!persistProjectIndex(projectIndex)) return { changed: false, failed: true };
        return { changed: true, failed: false };
      }

      // Project management is Workspace-only since V0.9.6. Projects saved under
      // the removed per-Session scope are folded into the resolved Workspace
      // scope when their Session is activated. The synthetic
      // `workspace:unresolved:<sessionId>` fallback is migrated on to the real
      // Workspace by adoptUnresolvedProjects once the cwd resolves.
      function adoptSessionProjects(sessionId, scopeKey) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return { changed: false, failed: false };
        const sessionKey = `session:${sessionId}`;
        if (scopeKey.length === 0 || scopeKey === sessionKey) return { changed: false, failed: false };
        const sessionEntries = projectIndex.projects.filter((entry) => entry.scopeKey === sessionKey);
        const sessionActive = projectIndex.activeByScope[sessionKey];
        if (sessionEntries.length === 0 && sessionActive === undefined) return { changed: false, failed: false };
        const previousProjects = projectIndex.projects;
        const previousActiveByScope = projectIndex.activeByScope;
        projectIndex.projects = projectIndex.projects.map((entry) => (entry.scopeKey === sessionKey
          ? { ...entry, scopeKey, updatedAt: Date.now() }
          : entry));
        projectIndex.activeByScope = { ...projectIndex.activeByScope };
        if (typeof sessionActive === 'string' && projectIndex.activeByScope[scopeKey] === undefined) {
          projectIndex.activeByScope[scopeKey] = sessionActive;
        }
        delete projectIndex.activeByScope[sessionKey];
        if (!persistProjectIndex(projectIndex)) {
          projectIndex.projects = previousProjects;
          projectIndex.activeByScope = previousActiveByScope;
          return { changed: false, failed: true };
        }
        return { changed: true, failed: false };
      }

      function chooseProjectForScope(scopeKey) {
        // Snapshot the index before mutating it: when the persistence write
        // fails, the in-memory index must be restored too, otherwise later
        // renames/autosaves operate on an index that was never stored (SF-5).
        const previousProjects = projectIndex.projects;
        const previousActiveByScope = projectIndex.activeByScope;
        const rollback = () => {
          projectIndex.projects = previousProjects;
          projectIndex.activeByScope = previousActiveByScope;
          return null;
        };
        let items = projectIndexItemsForScope(projectIndex, scopeKey);
        if (items.length === 0) {
          const now = Date.now();
          const entry = { id: uid('prj'), name: '', scopeKey, createdAt: now, updatedAt: now };
          projectIndex.projects = [...projectIndex.projects, entry];
          projectIndex.activeByScope = { ...projectIndex.activeByScope, [scopeKey]: entry.id };
          if (!writeProjectIndexOrFail()) return rollback();
          items = [entry];
        }
        const storedActive = projectIndex.activeByScope[scopeKey];
        const entry = items.find((item) => item.id === storedActive) ?? items[0];
        if (projectIndex.activeByScope[scopeKey] !== entry.id) {
          projectIndex.activeByScope = { ...projectIndex.activeByScope, [scopeKey]: entry.id };
          if (!writeProjectIndexOrFail()) return rollback();
        }
        return entry;
      }

      function loadScopedProject(entry, nextScope) {
        if (disposed) return false;
        backupTooLarge = false;
        const doc = readProjectDocument(entry.id);
        const next = doc ?? createEmptyState();
        if (doc === null) next.project.name = entry.name;
        refreshBackupMeta(entry.id);
        next.projects = projectMetaPatch({
          ready: true,
          scopeKey: nextScope.key,
          scopeLabel: nextScope.label,
          workspacePath: nextScope.workspacePath,
          activeId: entry.id,
          items: projectIndexItemsForScope(projectIndex, nextScope.key).map((item) => ({ ...item })),
          busy: false,
          error: '',
        });
        next.autoImportSince = doc === null ? Date.now() : Math.max(0, Number(next.autoImportSince) || 0);
        if (doc !== null && doc.project.name !== entry.name) {
          entry.name = doc.project.name;
          entry.updatedAt = Date.now();
          persistProjectIndex(projectIndex);
        }
        scope = nextScope;
        state = next;
        emit();
        startBackupTimer();
        hydrateMedia();
        consumeExportedAssets().catch(() => {});
        startSessionMedia();
        return true;
      }

      async function activateScope(sessionId, cwd, token = scopeToken) {
        if (disposed) return false;
        const nextKey = projectScopeKey(sessionId, cwd);
        if (nextKey.length === 0) {
          setProjectError(pickText(localeIdOf(ctx), 'project.scope.unresolved'));
          return false;
        }
        const nextScope = {
          key: nextKey,
          label: projectScopeLabel(cwd),
          workspacePath: normalizeWorkspacePath(cwd),
          sessionId: typeof sessionId === 'string' ? sessionId : null,
          activeId: null,
          ready: true,
          fallback: normalizeWorkspacePath(cwd).length === 0,
        };
        if (scope.ready && scope.key === nextKey && scope.activeId !== null) {
          // The same Workspace is already active, but this may be a different
          // Session: adopt its legacy session-scoped projects before taking the
          // fast path, otherwise they stay invisible until a reload or a
          // Workspace switch (P2-1).
          const sessionAdoption = adoptSessionProjects(sessionId, nextKey);
          if (sessionAdoption.failed) {
            if (token === scopeToken) setProjectError(pickText(localeIdOf(ctx), 'toast.saveFailed'));
            return false;
          }
          if (nextScope.fallback !== true) {
            const adoption = adoptUnresolvedProjects(sessionId, nextKey);
            if (adoption.failed) {
              if (token === scopeToken) setProjectError(pickText(localeIdOf(ctx), 'toast.saveFailed'));
              return false;
            }
          }
          scope = { ...scope, ...nextScope, activeId: scope.activeId };
          activeSessionId = typeof sessionId === 'string' ? sessionId : null;
          activeWorkspacePath = nextScope.workspacePath;
          updateProjectMeta({ ready: true, error: '' });
          emit();
          startSessionMedia();
          startBackupTimer();
          return true;
        }
        if (scope.ready && scope.activeId !== null) {
          state = { ...state, autoImportSince: Date.now() };
          if (!flushSave()) {
            if (token === scopeToken) setProjectError(pickText(localeIdOf(ctx), 'project.saveFailed'));
            return false;
          }
        }
        if (token !== scopeToken) return false;
        if (!migrateLegacyProject(nextKey)) return false;
        if (token !== scopeToken) return false;
        const sessionAdoption = adoptSessionProjects(sessionId, nextKey);
        if (token !== scopeToken) return false;
        if (sessionAdoption.failed) {
          setProjectError(pickText(localeIdOf(ctx), 'toast.saveFailed'));
          return false;
        }
        if (nextScope.fallback !== true) {
          const adoption = adoptUnresolvedProjects(sessionId, nextKey);
          if (token !== scopeToken) return false;
          if (adoption.failed) {
            setProjectError(pickText(localeIdOf(ctx), 'toast.saveFailed'));
            return false;
          }
        }
        const entry = chooseProjectForScope(nextKey);
        if (entry === null) return false;
        releaseProjectRuntime();
        nextScope.activeId = entry.id;
        activeSessionId = typeof sessionId === 'string' ? sessionId : null;
        activeWorkspacePath = nextScope.workspacePath;
        return loadScopedProject(entry, nextScope);
      }

      function applySessionScope(sessionId, cwd) {
        const token = ++scopeToken;
        // Never substitute a cached Workspace path here: when a Session opens
        // before its cwd is resolved, the 1.8 s fallback must land in the
        // documented synthetic `workspace:unresolved:<sessionId>` scope instead
        // of silently reusing the previously active Session's Workspace.
        const nextCwd = normalizeWorkspacePath(cwd);
        activateScope(sessionId, nextCwd, token).catch((error) => {
          if (token === scopeToken) setProjectError(error?.message ?? pickText(localeIdOf(ctx), 'project.unavailable'));
        });
      }

      function watchSessionScope(sessionId, token) {
        stopWorkspaceWatch();
        const initial = sessionCwdFor(sessionId);
        if (initial.length > 0) {
          activeWorkspacePath = initial;
          applySessionScope(sessionId, initial);
          return;
        }
        const list = sessionsService?.list;
        if (list !== null && list !== undefined && typeof list.subscribe === 'function') {
          try {
            workspaceUnsubscribe = list.subscribe(() => {
              const cwd = sessionCwdFor(sessionId);
              if (cwd.length === 0) return;
              stopWorkspaceWatch();
              if (activeSessionId === sessionId) {
                activeWorkspacePath = cwd;
                applySessionScope(sessionId, cwd);
              }
            });
          } catch {
            workspaceUnsubscribe = null;
          }
        }
        workspaceWatchTimer = window.setTimeout(() => {
          workspaceWatchTimer = 0;
          if (token !== scopeToken || activeSessionId !== sessionId) return;
          // Keep the sessions-list subscription alive after the fallback: if the
          // Workspace path becomes available later while this Session stays open,
          // the subscriber re-activates the real scope, which adopts the projects
          // created under the synthetic `workspace:unresolved:` key.
          applySessionScope(sessionId, '');
        }, 1_800);
      }

      function markContentAndSave() {
        if (disposed) return;
        window.clearTimeout(saveTimer);
        saveTimer = 0;
        if (!hasContent(state)) {
          // An edit can empty a saved project (delete the last clip, undo to
          // empty). Persist that terminal state through flushSave() so the
          // stale project document is removed and a reload cannot resurrect
          // content the user just deleted.
          flushSave();
          return;
        }
        state = {
          ...state,
          persistence: { started: true, status: 'saving', error: '' },
        };
        emit();
        saveTimer = window.setTimeout(flushSave, 420);
      }

      function flushSave() {
        if (disposed) return false;
        if (saveTimer !== 0) {
          window.clearTimeout(saveTimer);
          saveTimer = 0;
        }
        if (!scope.ready || scope.activeId === null) {
          state = { ...state, persistence: { ...state.persistence, status: 'blank' } };
          emit();
          return true;
        }
        const entry = activeProjectEntry();
        if (entry === null) return false;
        if (!hasContent(state) && state.project.aspectInitialized !== true) {
          removeProjectDocument(scope.activeId);
          entry.name = '';
          entry.updatedAt = Date.now();
          if (!writeProjectIndexOrFail()) return false;
          state = { ...state, persistence: { started: false, status: 'blank', error: '' } };
          emit();
          return true;
        }
        let documentSaved = writeProjectDocument(scope.activeId, state);
        if (!documentSaved) {
          // Minute backups share the same origin quota as project documents.
          // When a save fails, drop convenience backups and retry so the project
          // itself always wins (P2-2).
          if (emergencyPruneBackups(scope.activeId) > 0) {
            refreshBackupMeta(scope.activeId);
            documentSaved = writeProjectDocument(scope.activeId, state);
          }
        }
        if (!documentSaved && dropActiveBackupBucket(scope.activeId)) {
          // Even a single active snapshot can be what no longer fits; dropping
          // it must be what makes the project document savable again.
          refreshBackupMeta(scope.activeId);
          documentSaved = writeProjectDocument(scope.activeId, state);
        }
        if (!documentSaved) {
          if (state.persistence.status !== 'error') {
            showToast(pickText(localeIdOf(ctx), 'toast.saveFailed'), 'error');
          }
          state = {
            ...state,
            persistence: {
              ...state.persistence,
              status: 'error',
              error: 'localStorage',
            },
          };
          emit();
          return false;
        }
        entry.name = state.project.name;
        entry.updatedAt = Date.now();
        if (!writeProjectIndexOrFail()) return false;
        state = { ...state, persistence: { started: true, status: 'saved', error: '' } };
        emit();
        return true;
      }

      function schedulePreferenceSave() {
        if (hasContent(state)) markContentAndSave();
      }

      function showToast(text, tone = 'success') {
        if (disposed) return;
        window.clearTimeout(toastTimer);
        const toast = { id: uid('toast'), text, tone };
        state = { ...state, toast };
        emit();
        toastTimer = window.setTimeout(() => {
          if (disposed) return;
          state = { ...state, toast: null };
          emit();
        }, 2_600);
      }

      async function hydrateMedia() {
        const epoch = projectEpoch;
        const pending = state.assets.filter((asset) => typeof asset.blobId === 'string' && asset.blobId.length > 0 && asset.objectUrl === null && asset.missing !== true);
        if (pending.length === 0) return;
        let missing = 0;
        for (const asset of pending) {
          if (disposed || projectEpoch !== epoch) return;
          const record = await mediaGet(asset.blobId);
          if (disposed || projectEpoch !== epoch) return;
          if (record === null || record.blob === undefined) {
            missing += 1;
            state = {
              ...state,
              assets: state.assets.map((item) => item.id === asset.id ? { ...item, missing: true } : item),
            };
            emit();
            continue;
          }
          let objectUrl = null;
          try {
            objectUrl = URL.createObjectURL(record.blob);
            ownedUrls.add(objectUrl);
          } catch {
            objectUrl = null;
          }
          if (disposed || projectEpoch !== epoch) {
            if (objectUrl !== null) {
              try { URL.revokeObjectURL(objectUrl); } catch { /* Already released. */ }
              ownedUrls.delete(objectUrl);
            }
            return;
          }
          let posterUrl = null;
          if (asset.kind === 'video') posterUrl = typeof record.poster === 'string' ? record.poster : objectUrl;
          else if (asset.kind === 'image') posterUrl = objectUrl;
          let nextHasAudio = asset.hasAudio === true;
          let nextPeaks = asset.peaks;
          if (asset.kind === 'audio') {
            try {
              const buffer = await decodeAudioBlob(record.blob);
              if (disposed || projectEpoch !== epoch) return;
              audioRuntime.audioBuffers.set(asset.id, buffer);
            } catch {
              // The asset still appears; only playback is unavailable.
            }
          } else if (asset.kind === 'video') {
            if (asset.hasAudio === false) {
              nextHasAudio = false;
              nextPeaks = [];
            } else if (Number(asset.size) > MAX_AUDIO_PROBE_BYTES) {
              nextHasAudio = false;
              nextPeaks = [];
            } else if (!audioRuntime.audioBuffers.has(asset.id)) {
              try {
                const buffer = await decodeAudioBlob(record.blob);
                if (disposed || projectEpoch !== epoch) return;
                if (buffer.duration > 0.02) {
                  nextHasAudio = true;
                  nextPeaks = waveformPeaks(buffer, WAVEFORM_BUCKETS);
                  audioRuntime.audioBuffers.set(asset.id, buffer);
                } else {
                  nextHasAudio = false;
                  nextPeaks = [];
                }
              } catch {
                nextHasAudio = false;
                nextPeaks = [];
              }
            }
          }
          if (disposed || projectEpoch !== epoch) return;
          state = {
            ...state,
            assets: state.assets.map((item) => item.id === asset.id
              ? {
                ...item,
                objectUrl,
                posterUrl,
                hasAudio: nextHasAudio,
                peaks: nextPeaks,
                missing: objectUrl === null,
              }
              : item),
          };
          emit();
        }
        if (missing > 0) showToast(pickText(localeIdOf(ctx), 'toast.mediaMissing'), 'error');
      }

      async function processImportedFile(file, localeId) {
        const kind = guessFileKind(file);
        if (kind === null || REFERENCE_KINDS.has(kind) === false && AUDIO_KINDS.has(kind) === false) {
          throw new Error(pickText(localeId, 'toast.fileUnsupported'));
        }
        if (bytesForFile(file) > FILE_LIMITS[kind]) {
          throw new Error(pickText(localeId, 'toast.fileTooLarge'));
        }
        if (bytesForFile(file) === 0) throw new Error(pickText(localeId, 'toast.fileUnsupported'));
        const id = uid('asset');
        const objectUrl = URL.createObjectURL(file);
        ownedUrls.add(objectUrl);
        let posterUrl = null;
        let width = 0;
        let height = 0;
        let duration = 0;
        let palette = DEFAULT_PALETTE.slice();
        let peaks = [];
        let hasAudio = false;
        try {
          if (kind === 'image') {
            let info;
            try {
              info = await readImageInfo(objectUrl);
            } catch {
              throw new Error(pickText(localeId, 'toast.imageDecode'));
            }
            width = info.width;
            height = info.height;
            posterUrl = objectUrl;
            palette = await extractPalette(objectUrl);
          } else if (kind === 'video') {
            let info;
            try {
              info = await probeVideo(objectUrl);
            } catch {
              throw new Error(pickText(localeId, 'toast.videoDecode'));
            }
            width = info.width;
            height = info.height;
            duration = info.duration;
            posterUrl = info.poster;
            palette = await extractPalette(info.poster);
            if (bytesForFile(file) <= MAX_AUDIO_PROBE_BYTES) {
              try {
                const buffer = await decodeAudioBlob(file);
                if (buffer.duration > 0.02) {
                  hasAudio = true;
                  peaks = waveformPeaks(buffer, WAVEFORM_BUCKETS);
                  audioRuntime.audioBuffers.set(id, buffer);
                }
              } catch {
                // Most generated videos are silent; a missing audio track is not an import error.
              }
            }
          } else {
            let buffer;
            try {
              buffer = await decodeAudioBlob(file);
            } catch {
              throw new Error(pickText(localeId, 'toast.audioDecode'));
            }
            duration = buffer.duration;
            peaks = waveformPeaks(buffer, WAVEFORM_BUCKETS);
            audioRuntime.audioBuffers.set(id, buffer);
          }
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          ownedUrls.delete(objectUrl);
          throw error;
        }
        const saved = await mediaPut(id, {
          blob: file,
          poster: kind === 'video' ? posterUrl : null,
        }).catch(() => false);
        return {
          sessionOnly: !saved,
          id,
          name: String(file.name || 'Untitled'),
          kind,
          mime: String(file.type || ''),
          size: bytesForFile(file),
          duration,
          width,
          height,
          palette,
          peaks,
          hasAudio,
          blobId: saved ? id : null,
          objectUrl,
          posterUrl,
          missing: false,
          createdAt: Date.now(),
        };
      }

      async function importFiles(files, localeId) {
        const list = [...files].filter(Boolean);
        if (list.length === 0 || state.import.busy || !scope.ready) return;
        const epoch = projectEpoch;
        state = {
          ...state,
          import: { busy: true, done: 0, total: list.length, error: '' },
          selectedAsset: state.selectedAsset,
        };
        emit();
        const errors = [];
        let succeeded = 0;
        let lastAsset = null;
        let sessionOnlyCount = 0;
        for (let index = 0; index < list.length; index += 1) {
          if (disposed || projectEpoch !== epoch) return;
          if (state.assets.length >= MAX_ASSETS) {
            errors.push({ name: list[index]?.name ?? 'file', message: pickText(localeId, 'project.limit') });
            continue;
          }
          try {
            const asset = await processImportedFile(list[index], localeId);
            if (disposed || projectEpoch !== epoch) {
              if (asset.objectUrl !== null) URL.revokeObjectURL(asset.objectUrl);
              if (typeof asset.blobId === 'string') mediaDelete(asset.blobId).catch(() => {});
              return;
            }
            succeeded += 1;
            lastAsset = asset;
            if (asset.sessionOnly) sessionOnlyCount += 1;
            state = {
              ...state,
              assets: [...state.assets, asset],
              selectedAsset: { type: 'asset', id: asset.id },
              import: { ...state.import, done: index + 1, error: '' },
            };
            emit();
          } catch (error) {
            errors.push({ name: list[index]?.name ?? 'file', message: error?.message ?? pickText(localeId, 'error.generic') });
            state = { ...state, import: { ...state.import, done: index + 1 } };
            emit();
          }
        }
        if (disposed || projectEpoch !== epoch) return;
        const storageWarning = sessionOnlyCount > 0 ? pickText(localeId, 'toast.mediaSessionOnly') : '';
        const errorText = [
          errors.map((entry) => `${entry.name}: ${entry.message}`).join('\n'),
          storageWarning,
        ].filter((part) => part.length > 0).join('\n').slice(0, 1_200);
        state = {
          ...state,
          import: { busy: false, done: list.length, total: list.length, error: errorText },
        };
        emit();
        if (succeeded > 0) {
          markContentAndSave();
          const warningTone = errors.length > 0 || sessionOnlyCount > 0;
          showToast(
            pickText(localeId, errors.length > 0 ? 'toast.importPartial' : sessionOnlyCount > 0 ? 'toast.mediaSessionOnly' : 'toast.imported'),
            warningTone ? 'error' : 'success',
          );
          if (lastAsset !== null) {
            state = { ...state, selectedAsset: { type: 'asset', id: lastAsset.id } };
            emit();
          }
        } else if (errors.length > 0) {
          showToast(pickText(localeId, 'toast.importPartial'), 'error');
        }
      }

      async function fileForAsset(assetId) {
        const asset = state.assets.find((item) => item.id === assetId);
        if (asset === undefined || asset.missing === true) return null;
        let blob = null;
        if (typeof asset.blobId === 'string' && asset.blobId.length > 0) {
          const record = await mediaGet(asset.blobId);
          if (record !== null && record.blob instanceof Blob) blob = record.blob;
        }
        if (blob === null && typeof asset.objectUrl === 'string' && asset.objectUrl.length > 0) {
          try {
            const response = await fetch(asset.objectUrl, { credentials: 'same-origin' });
            if (response.ok) blob = await response.blob();
          } catch {
            blob = null;
          }
        }
        if (blob === null || typeof File !== 'function') return null;
        const fileName = asset.name || `${asset.kind || 'asset'}-${asset.id}`;
        return new File([blob], fileName, { type: asset.mime || blob.type || 'application/octet-stream' });
      }

      async function importConversationObject(input, localeId = 'zh') {
        // Pending composer attachments are exposed by the native composer as a
        // local File with no attachmentId; import that File directly instead of
        // requiring a Host attachment route.
        if (typeof File === 'function' && input !== null && typeof input === 'object' && input.file instanceof File) {
          const draftFile = input.file;
          if (state.assets.length >= MAX_ASSETS) throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
          const originKey = `draft:${draftFile.name || 'file'}:${Number(draftFile.size) || 0}:${Number(draftFile.lastModified) || 0}`.slice(0, 220);
          const alreadyImported = state.assets.find((asset) => asset.originKey === originKey);
          if (alreadyImported !== undefined) return alreadyImported;
          const epoch = projectEpoch;
          const asset = await processImportedFile(draftFile, localeId);
          if (disposed || projectEpoch !== epoch) {
            if (typeof asset.objectUrl === 'string') {
              try { URL.revokeObjectURL(asset.objectUrl); } catch { /* Already released. */ }
              ownedUrls.delete(asset.objectUrl);
            }
            if (typeof asset.blobId === 'string') mediaDelete(asset.blobId).catch(() => {});
            throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
          }
          const next = {
            ...asset,
            source: 'conversation',
            originKey,
            createdAt: Date.now(),
          };
          state = {
            ...state,
            assets: [...state.assets, next],
            selectedAsset: { type: 'asset', id: next.id },
          };
          emit();
          markContentAndSave();
          hydrateMedia();
          showToast(pickText(localeId, 'chat.conversationFileImported'), 'success');
          return next;
        }
        const attachmentId = typeof input === 'string'
          ? input
          : typeof input?.attachmentId === 'string' ? input.attachmentId : '';
        const path = typeof input?.path === 'string' ? input.path.slice(0, 4096) : '';
        const fallbackName = path.length > 0 ? path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1) : `session-file-${attachmentId.slice(-8)}`;
        // The full stored leaf name is what the Host validates against the
        // attachment provider; only the display/file name is shortened (H-04).
        const fullName = typeof input?.name === 'string' && input.name.trim().length > 0
          ? input.name.trim()
          : fallbackName;
        const name = fullName.slice(0, 180);
        if ((attachmentId.length === 0 && path.length === 0) || attachmentId.length > 260) {
          throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
        }
        if (activeSessionId === null || !scope.ready) throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
        const originKey = path.length > 0 ? `deliverable:${path}` : `attachment:${attachmentId}`;
        const existing = state.assets.find((asset) => asset.originKey === originKey);
        if (existing !== undefined) return existing;
        if (state.assets.length >= MAX_ASSETS) throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
        const sessionId = activeSessionId;
        const epoch = projectEpoch;
        const url = path.length > 0
          ? `${SESSION_DELIVERABLE_PATH}?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`
          : `${SESSION_OBJECT_PATH}?sessionId=${encodeURIComponent(sessionId)}&attachmentId=${encodeURIComponent(attachmentId)}&name=${encodeURIComponent(fullName.slice(0, 255))}&bytes=${encodeURIComponent(String(Math.max(0, Number(input?.bytes) || 0)))}`;
        const response = await fetch(url, {
          credentials: 'same-origin',
          headers: { accept: '*/*' },
        });
        if (!response.ok) throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
        const blob = await response.blob();
        if (disposed || projectEpoch !== epoch || activeSessionId !== sessionId) return null;
        if (blob.size === 0) throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
        const file = typeof File === 'function'
          ? new File([blob], name, { type: blob.type || 'application/octet-stream' })
          : null;
        if (file === null) throw new Error(pickText(localeId, 'chat.conversationFileFailed'));
        const asset = await processImportedFile(file, localeId);
        if (disposed || projectEpoch !== epoch) {
          if (typeof asset.objectUrl === 'string') {
            try { URL.revokeObjectURL(asset.objectUrl); } catch { /* Already released. */ }
            ownedUrls.delete(asset.objectUrl);
          }
          if (typeof asset.blobId === 'string') mediaDelete(asset.blobId).catch(() => {});
          return null;
        }
        const next = {
          ...asset,
          source: 'conversation',
          originKey: originKey.slice(0, 220),
          attachmentId: attachmentId.length > 0 ? attachmentId.slice(0, 220) : undefined,
          createdAt: Date.now(),
        };
        state = {
          ...state,
          assets: [...state.assets, next],
          selectedAsset: { type: 'asset', id: next.id },
        };
        emit();
        markContentAndSave();
        hydrateMedia();
        showToast(pickText(localeId, 'chat.conversationFileImported'), 'success');
        return next;
      }

      async function addExportedVideo(input, localeId = 'zh') {
        const blob = input?.blob;
        if (blob === null || blob === undefined || typeof blob.size !== 'number' || blob.size <= 0) {
          throw new Error(pickText(localeId, 'export.libraryFailed'));
        }
        if (blob.size > MAX_VIDEO_BYTES) throw new Error(pickText(localeId, 'export.tooLarge'));
        if (state.assets.length >= MAX_ASSETS) throw new Error(pickText(localeId, 'export.libraryFailed'));
        const epoch = projectEpoch;
        const id = uid('asset');
        const poster = typeof input?.poster === 'string' && input.poster.startsWith('data:image/') ? input.poster : null;
        const saved = await mediaPut(id, { blob, poster });
        if (!saved) throw new Error(pickText(localeId, 'export.libraryFailed'));
        if (disposed || projectEpoch !== epoch) {
          mediaDelete(id).catch(() => {});
          throw new Error(pickText(localeId, 'export.libraryFailed'));
        }
        const asset = {
          id,
          name: (typeof input?.name === 'string' && input.name.trim().length > 0 ? input.name.trim() : 'DeepSeek-Design.mp4').slice(0, 180),
          kind: 'video',
          mime: typeof blob.type === 'string' && blob.type.length > 0 ? blob.type : 'video/webm',
          size: blob.size,
          duration: Math.max(0, Number(input?.duration) || 0),
          width: Math.max(0, Number(input?.width) || 0),
          height: Math.max(0, Number(input?.height) || 0),
          palette: DEFAULT_PALETTE.slice(),
          peaks: [],
          blobId: id,
          objectUrl: null,
          posterUrl: null,
          missing: false,
          source: 'export',
          createdAt: Date.now(),
        };
        state = {
          ...state,
          assets: [...state.assets, asset],
          selectedAsset: { type: 'asset', id: asset.id },
        };
        emit();
        markContentAndSave();
        hydrateMedia();
        return asset;
      }

      async function loadModels(force = false) {
        if (!force && (state.models.status === 'loading' || state.models.status === 'ready')) return;
        if (state.models.status === 'loading') return;
        if (modelRetryTimer !== 0) {
          window.clearTimeout(modelRetryTimer);
          modelRetryTimer = 0;
        }
        state = { ...state, models: { ...state.models, status: 'loading', error: '' } };
        emit();
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller === null ? 0 : window.setTimeout(() => controller.abort(), 30_000);
        try {
          const result = await bridgeRequest({ action: 'models', force }, controller?.signal);
          const items = Array.isArray(result.models)
            ? result.models.filter((item) => item !== null && typeof item === 'object'
              && typeof item.provider === 'string' && typeof item.id === 'string')
              .map((item) => ({
                provider: item.provider,
                providerName: typeof item.providerName === 'string' ? item.providerName : item.provider,
                id: item.id,
                name: typeof item.name === 'string' ? item.name : item.id,
                reasoning: normalizeReasoning(item.reasoning),
              }))
            : [];
          if (items.length === 0) throw new Error(pickText(localeIdOf(ctx), 'chat.modelsEmpty'));
          const defaultRaw = result.default;
          const defaultItem = defaultRaw !== null && typeof defaultRaw === 'object'
            ? items.find((item) => item.provider === defaultRaw.provider && item.id === defaultRaw.model)
            : undefined;
          const saved = state.preferences.model;
          const savedMatch = saved === null ? undefined : items.find((item) => item.provider === saved.provider && item.id === saved.model);
          const selected = savedMatch ?? defaultItem ?? items[0];
          const selectedEffort = selected === undefined
            ? undefined
            : savedMatch === undefined && selected === defaultItem
              ? normalizeReasoningEffort(selected.reasoning, defaultRaw.reasoningEffort)
              : normalizeReasoningEffort(selected.reasoning, savedMatch === undefined ? undefined : saved.reasoningEffort);
          state = {
            ...state,
            models: {
              status: 'ready',
              items,
              default: defaultItem === undefined ? items[0] : {
                ...defaultItem,
                reasoningEffort: typeof defaultRaw.reasoningEffort === 'string' ? defaultRaw.reasoningEffort : undefined,
              },
              error: '',
            },
            preferences: {
              ...state.preferences,
              model: selected === undefined ? null : {
                provider: selected.provider,
                model: selected.id,
                providerName: selected.providerName,
                modelName: selected.name,
                reasoningEffort: selectedEffort,
              },
            },
          };
          modelRetryAttempt = 0;
          emit();
        } catch (error) {
          state = {
            ...state,
            models: {
              ...state.models,
              status: 'error',
              error: error?.name === 'AbortError' ? pickText(localeIdOf(ctx), 'error.request') : (error?.message ?? pickText(localeIdOf(ctx), 'error.generic')),
            },
          };
          emit();
          // The Host bridge can become available a moment after the panel mounts
          // on a restarted Harness process. Recover without forcing a page reload.
          if (!disposed && error?.name !== 'AbortError' && modelRetryAttempt < 3) {
            modelRetryAttempt += 1;
            modelRetryTimer = window.setTimeout(() => {
              modelRetryTimer = 0;
              if (!disposed) loadModels(true);
            }, 1200 * modelRetryAttempt);
          }
        } finally {
          if (timer !== 0) window.clearTimeout(timer);
        }
      }

      async function loadSkills(force = false) {
        if (skillRetryTimer !== 0) {
          window.clearTimeout(skillRetryTimer);
          skillRetryTimer = 0;
        }
        if (state.skills.status === 'loading') return;
        if (!force && state.skills.status === 'ready') return;
        state = { ...state, skills: { ...state.skills, status: 'loading', error: '' } };
        emit();
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller === null ? 0 : window.setTimeout(() => controller.abort(), 30_000);
        try {
          const result = await bridgeRequest({ action: 'skills', force }, controller?.signal);
          const items = Array.isArray(result.skills)
            ? result.skills.filter((skill) => skill !== null && typeof skill === 'object' && typeof skill.name === 'string')
              .map((skill) => ({
                name: skill.name,
                description: typeof skill.description === 'string' ? skill.description : '',
                source: typeof skill.source === 'string' ? skill.source : '',
              }))
            : [];
          state = { ...state, skills: { status: 'ready', items, error: '' } };
          skillRetryAttempt = 0;
          emit();
        } catch (error) {
          state = {
            ...state,
            skills: {
              ...state.skills,
              status: 'error',
              error: error?.name === 'AbortError' ? pickText(localeIdOf(ctx), 'error.request') : (error?.message ?? pickText(localeIdOf(ctx), 'error.generic')),
            },
          };
          emit();
          if (!disposed && error?.name !== 'AbortError' && skillRetryAttempt < 3) {
            skillRetryAttempt += 1;
            skillRetryTimer = window.setTimeout(() => {
              skillRetryTimer = 0;
              if (!disposed) loadSkills(true);
            }, 1200 * skillRetryAttempt);
          }
        } finally {
          if (timer !== 0) window.clearTimeout(timer);
        }
      }

      function selectModel(model) {
        if (model === null || typeof model !== 'object') return;
        const known = state.models.items.find((item) => item.provider === model.provider && item.id === model.id);
        const reasoning = normalizeReasoning(model.reasoning ?? known?.reasoning);
        const previous = state.preferences.model;
        const wasSelected = previous !== null && previous.provider === model.provider && previous.model === model.id;
        state = {
          ...state,
          preferences: {
            ...state.preferences,
            model: {
              provider: model.provider,
              model: model.id,
              providerName: model.providerName,
              modelName: model.name,
              reasoningEffort: normalizeReasoningEffort(reasoning, wasSelected ? previous.reasoningEffort : undefined),
            },
          },
        };
        emit();
        schedulePreferenceSave();
      }

      function selectReasoningEffort(effort) {
        const current = precedenceModel(state);
        if (current === null || current.reasoning === null || current.reasoning === undefined) return false;
        const normalized = normalizeReasoningEffort(current.reasoning, typeof effort === 'string' ? effort : undefined);
        const previous = state.preferences.model;
        const base = previous !== null && previous.provider === current.provider && previous.model === current.model
          ? previous
          : {
            provider: current.provider,
            model: current.model,
            providerName: current.providerName,
            modelName: current.modelName,
          };
        state = {
          ...state,
          preferences: {
            ...state.preferences,
            model: { ...base, reasoningEffort: normalized },
          },
        };
        emit();
        schedulePreferenceSave();
        return true;
      }

      function toggleSkill(name) {
        if (typeof name !== 'string') return false;
        const selected = state.preferences.skills;
        if (selected.includes(name)) {
          state = {
            ...state,
            preferences: { ...state.preferences, skills: selected.filter((item) => item !== name) },
          };
          emit();
          schedulePreferenceSave();
          return true;
        }
        if (selected.length >= 2) return false;
        state = {
          ...state,
          preferences: { ...state.preferences, skills: [...selected, name] },
        };
        emit();
        schedulePreferenceSave();
        return true;
      }

      function normalizeAssetRefs(refs) {
        const seen = new Set();
        const out = [];
        for (const ref of Array.isArray(refs) ? refs : []) {
          if (ref === null || typeof ref !== 'object' || (ref.type !== 'asset' && ref.type !== 'generation') || typeof ref.id !== 'string' || ref.id.length === 0) continue;
          const key = `${ref.type}:${ref.id}`;
          if (seen.has(key)) continue;
          const exists = ref.type === 'asset'
            ? state.assets.some((asset) => asset.id === ref.id)
            : state.generations.some((generation) => generation.id === ref.id);
          if (!exists) continue;
          seen.add(key);
          out.push({ type: ref.type, id: ref.id });
        }
        return out;
      }

      function setAssetSelection(refs, primary = null) {
        const selectedAssets = normalizeAssetRefs(refs);
        const primaryKey = primary === null || primary === undefined ? null : `${primary.type}:${primary.id}`;
        let selectedAsset = null;
        if (primaryKey !== null) selectedAsset = selectedAssets.find((ref) => `${ref.type}:${ref.id}` === primaryKey) ?? null;
        if (selectedAsset === null && state.selectedAsset !== null && state.selectedAsset !== undefined) {
          const currentKey = `${state.selectedAsset.type}:${state.selectedAsset.id}`;
          selectedAsset = selectedAssets.find((ref) => `${ref.type}:${ref.id}` === currentKey) ?? null;
        }
        if (selectedAsset === null) selectedAsset = selectedAssets.length > 0 ? selectedAssets[selectedAssets.length - 1] : null;
        state = { ...state, selectedAssets, selectedAsset };
        emit();
      }

      function removeEntries(entries, options = {}) {
        const refs = normalizeAssetRefs(entries);
        if (refs.length === 0) return { ok: false, reason: 'missing', count: 0, entries: [] };
        const assetIds = new Set(refs.filter((ref) => ref.type === 'asset').map((ref) => ref.id));
        const generationIds = new Set(refs.filter((ref) => ref.type === 'generation').map((ref) => ref.id));
        const removedAssets = state.assets.filter((asset) => assetIds.has(asset.id));
        const removedGenerations = state.generations.filter((generation) => generationIds.has(generation.id));
        const removedRefs = new Set(refs.map((ref) => `${ref.type}:${ref.id}`));
        const count = clipsOfTimeline(state.timeline).filter((clip) => (
          (typeof clip.assetId === 'string' && assetIds.has(clip.assetId))
          || (typeof clip.generationId === 'string' && generationIds.has(clip.generationId))
        )).length;
        if (count > 0 && options?.force !== true) {
          return { ok: false, reason: 'in-use', count, entries: refs };
        }
        const nextTimeline = {
          ...state.timeline,
          video: state.timeline.video.filter((clip) => !(typeof clip.assetId === 'string' && assetIds.has(clip.assetId)) && !(typeof clip.generationId === 'string' && generationIds.has(clip.generationId))),
          audio: state.timeline.audio.filter((clip) => !(typeof clip.assetId === 'string' && assetIds.has(clip.assetId))),
          music: state.timeline.music.filter((clip) => !(typeof clip.assetId === 'string' && assetIds.has(clip.assetId))),
        };
        const pruneSnapshot = (snapshot) => {
          if (generationIds.size > 0 && trackClips(snapshot, 'video').some((clip) => typeof clip.generationId === 'string' && generationIds.has(clip.generationId))) return null;
          return {
            ...snapshot,
            video: trackClips(snapshot, 'video').filter((clip) => !(typeof clip.assetId === 'string' && assetIds.has(clip.assetId)) && !(typeof clip.generationId === 'string' && generationIds.has(clip.generationId))),
            audio: trackClips(snapshot, 'audio').filter((clip) => !(typeof clip.assetId === 'string' && assetIds.has(clip.assetId))),
            music: trackClips(snapshot, 'music').filter((clip) => !(typeof clip.assetId === 'string' && assetIds.has(clip.assetId))),
          };
        };
        if (history.length > 0) history = history.map(pruneSnapshot).filter((snapshot) => snapshot !== null);
        if (future.length > 0) future = future.map(pruneSnapshot).filter((snapshot) => snapshot !== null);
        const survivingSelections = (state.selectedClips ?? []).filter((ref) => trackClips(nextTimeline, ref.track).some((clip) => clip.id === ref.id));
        const remainingSelected = (state.selectedAssets ?? []).filter((ref) => !removedRefs.has(`${ref.type}:${ref.id}`));
        const primaryKept = state.selectedAsset !== null && state.selectedAsset !== undefined && !removedRefs.has(`${state.selectedAsset.type}:${state.selectedAsset.id}`);
        const nextPrimary = primaryKept ? state.selectedAsset : (remainingSelected.length > 0 ? remainingSelected[remainingSelected.length - 1] : null);
        const skipped = [...new Set([
          ...(state.autoImportSkipped ?? []),
          ...removedAssets
            .map((asset) => asset.originKey)
            .filter((key) => typeof key === 'string' && key.startsWith('attachment:')),
        ])].slice(-1000);
        state = {
          ...state,
          autoImportSkipped: skipped,
          timeline: nextTimeline,
          assets: state.assets.filter((asset) => !assetIds.has(asset.id)),
          generations: state.generations.filter((generation) => !generationIds.has(generation.id)),
          selectedAsset: nextPrimary,
          selectedAssets: remainingSelected,
          selectedClip: survivingSelections.length === 1 ? survivingSelections[0] : null,
          selectedClips: survivingSelections,
          history: { canUndo: history.length > 0, canRedo: future.length > 0 },
          chat: generationIds.size === 0
            ? state.chat
            : {
              ...state.chat,
              messages: state.chat.messages.map((message) => message.generationId && generationIds.has(message.generationId)
                ? { ...message, generationId: null, discarded: true }
                : message),
            },
        };
        emit();
        for (const asset of removedAssets) {
          // Deleting an asset must release its decoded PCM as well; otherwise
          // large audio/video buffers stay in RAM until the plugin reloads.
          audioRuntime.audioBuffers.delete(asset.id);
          if (typeof asset.objectUrl === 'string' && ownedUrls.has(asset.objectUrl)) {
            try { URL.revokeObjectURL(asset.objectUrl); } catch { /* Already released. */ }
            ownedUrls.delete(asset.objectUrl);
          }
          if (typeof asset.blobId === 'string') {
            mediaDelete(asset.blobId).catch(() => {});
          }
        }
        if (hasContent(state)) {
          markContentAndSave();
        } else {
          window.clearTimeout(saveTimer);
          saveTimer = 0;
          // A locked aspect is still worth persisting when the library empties;
          // otherwise a reload would silently drop the manual aspect choice.
          const keepAspectDocument = state.project.aspectInitialized === true;
          let writeFailed = false;
          if (scope.ready && scope.activeId !== null) {
            if (keepAspectDocument) {
              writeFailed = !writeProjectDocument(scope.activeId, state);
            } else {
              removeProjectDocument(scope.activeId);
            }
            const entry = activeProjectEntry();
            if (entry !== null) {
              entry.name = keepAspectDocument ? state.project.name : '';
              entry.updatedAt = Date.now();
              persistProjectIndex(projectIndex);
            }
          }
          state = {
            ...state,
            projects: projectMetaPatch({ ready: scope.ready, activeId: scope.activeId }),
            persistence: keepAspectDocument
              ? (writeFailed
                ? { started: true, status: 'error', error: 'localStorage' }
                : { started: true, status: 'saved', error: '' })
              : { started: false, status: 'blank', error: '' },
          };
          emit();
          if (writeFailed) showToast(pickText(localeIdOf(ctx), 'toast.saveFailed'), 'error');
        }
        return { ok: true, reason: 'deleted', count, assets: removedAssets, generations: removedGenerations, entries: refs };
      }

      function deleteEntries(entries, options = {}) {
        return removeEntries(entries, options);
      }

      async function deleteAsset(assetId, options = {}) {
        return removeEntries([{ type: 'asset', id: assetId }], options);
      }

      function deleteGeneration(generationId, options = {}) {
        const result = removeEntries([{ type: 'generation', id: generationId }], options);
        return {
          ok: result.ok,
          reason: result.ok ? 'deleted' : result.reason,
          count: result.count,
        };
      }

      function selectAsset(ref) {
        if (ref === null || ref === undefined) {
          setAssetSelection([], null);
          return;
        }
        setAssetSelection([ref], ref);
      }

      function clearSelectedAsset() {
        setAssetSelection([], null);
      }

      function selectClip(ref) {
        state = { ...state, selectedClip: ref, selectedClips: ref === null || ref === undefined ? [] : [ref] };
        emit();
      }

      function selectClips(refs) {
        const seen = new Set();
        const selectedClips = [];
        for (const ref of Array.isArray(refs) ? refs : []) {
          if (ref === null || typeof ref !== 'object' || typeof ref.id !== 'string') continue;
          if (ref.track !== 'video' && ref.track !== 'audio' && ref.track !== 'music') continue;
          const key = `${ref.track}:${ref.id}`;
          if (seen.has(key)) continue;
          if (!trackClips(state.timeline, ref.track).some((clip) => clip.id === ref.id)) continue;
          seen.add(key);
          selectedClips.push({ track: ref.track, id: ref.id });
        }
        state = {
          ...state,
          selectedClips,
          selectedClip: selectedClips.length === 1 ? selectedClips[0] : null,
        };
        emit();
      }

      function clearSelectedClip() {
        state = { ...state, selectedClip: null, selectedClips: [] };
        emit();
      }

      function setAspect(aspectId) {
        if (!isAspect(aspectId)) return;
        if (state.project.aspect === aspectId && state.project.aspectInitialized === true) return;
        state = {
          ...state,
          project: { ...state.project, aspect: aspectId, aspectInitialized: true },
        };
        emit();
        if (hasContent(state)) {
          markContentAndSave();
        } else if (scope.ready && scope.activeId !== null) {
          // A content-less project still has a document worth persisting when
          // the user locks an aspect; restoreProject({allowEmpty:true}) reads
          // it back, keeping the manual aspect after a reload.
          if (!writeProjectDocument(scope.activeId, state)) {
            state = { ...state, persistence: { started: true, status: 'error', error: 'localStorage' } };
            emit();
            showToast(pickText(localeIdOf(ctx), 'toast.saveFailed'), 'error');
            return;
          }
          const entry = activeProjectEntry();
          if (entry !== null) {
            entry.updatedAt = Date.now();
            persistProjectIndex(projectIndex);
          }
          state = { ...state, persistence: { started: true, status: 'saved', error: '' } };
          emit();
        }
      }

      function setProjectName(name) {
        const next = String(name || '').trim().slice(0, 80);
        if (next === state.project.name) return;
        const entry = activeProjectEntry();
        if (entry !== null) entry.name = next;
        state = {
          ...state,
          project: { ...state.project, name: next },
          projects: {
            ...state.projects,
            items: state.projects.items.map((item) => item.id === scope.activeId ? { ...item, name: next } : item),
          },
        };
        if (hasContent(state)) {
          markContentAndSave();
          return;
        }
        window.clearTimeout(saveTimer);
        saveTimer = 0;
        // Clearing the name on a content-less project must not drop a locked
        // aspect either: keep the aspect-only document, drop it otherwise.
        const keepAspectDocument = state.project.aspectInitialized === true;
        let writeFailed = false;
        if (scope.ready && scope.activeId !== null) {
          if (keepAspectDocument) {
            writeFailed = !writeProjectDocument(scope.activeId, state);
          } else {
            removeProjectDocument(scope.activeId);
          }
          const entry = activeProjectEntry();
          if (entry !== null) {
            entry.name = keepAspectDocument ? state.project.name : '';
            entry.updatedAt = Date.now();
            persistProjectIndex(projectIndex);
          }
        }
        state = {
          ...state,
          projects: projectMetaPatch({ ready: scope.ready, activeId: scope.activeId }),
          persistence: keepAspectDocument
            ? (writeFailed
              ? { started: true, status: 'error', error: 'localStorage' }
              : { started: true, status: 'saved', error: '' })
            : { started: false, status: 'blank', error: '' },
        };
        emit();
        if (writeFailed) showToast(pickText(localeIdOf(ctx), 'toast.saveFailed'), 'error');
      }

      function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
          if (typeof FileReader !== 'function') {
            reject(new Error('FileReader is unavailable.'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(reader.error ?? new Error('Could not read media.'));
          reader.readAsDataURL(blob);
        });
      }

      let projectOperationBusy = false;

      async function withProjectLock(localeId, operation) {
        if (projectOperationBusy) throw new Error(pickText(localeId, 'project.operationBusy'));
        projectOperationBusy = true;
        try {
          return await operation();
        } finally {
          projectOperationBusy = false;
        }
      }

      async function exportProjectFile() {
        return withProjectLock(localeIdOf(ctx), async () => {
        const liveById = new Map(state.assets.map((asset) => [asset.id, asset]));
        const document = serializeProject(state);
        document.format = 'deepseek-design.project';
        document.exportedAt = new Date().toISOString();
        let embedded = 0;
        let omitted = 0;
        let embeddedBytes = 0;
        let encodedChars = 0;
        let postersOmitted = 0;
        for (const asset of document.assets) {
          const live = liveById.get(asset.id);
          if (live === undefined) {
            omitted += 1;
            continue;
          }
          if (typeof live.blobId !== 'string') {
            omitted += 1;
            continue;
          }
          try {
            const record = await mediaGet(live.blobId);
            if (record === null || record.blob === undefined) {
              omitted += 1;
              continue;
            }
            const bytes = Number(record.blob.size) || 0;
            if (bytes > 0 && embeddedBytes + bytes > MAX_PROJECT_MEDIA_BYTES) {
              omitted += 1;
              continue;
            }
            const dataUrl = await blobToDataUrl(record.blob);
            if (dataUrl.length === 0) {
              omitted += 1;
              continue;
            }
            if (encodedChars + dataUrl.length > MAX_PROJECT_EXPORT_ENCODED_BYTES) {
              omitted += 1;
              continue;
            }
            asset.dataUrl = dataUrl;
            encodedChars += dataUrl.length;
            if (typeof live.posterUrl === 'string' && live.posterUrl.startsWith('data:image/')) {
              if (encodedChars + live.posterUrl.length <= MAX_PROJECT_EXPORT_ENCODED_BYTES) {
                asset.poster = live.posterUrl;
                encodedChars += live.posterUrl.length;
              } else {
                postersOmitted += 1;
              }
            }
            embeddedBytes += bytes;
            embedded += 1;
          } catch {
            omitted += 1;
          }
        }
        const name = state.project.name.trim() || 'DeepSeekDesign';
        return {
          data: document,
          filename: `${sanitizeFilename(name)}.deepseek.json`,
          embedded,
          omitted,
          postersOmitted,
          bytes: embeddedBytes,
        };
        });
      }

      function ensureProjectCapacity(localeId) {
        const scoped = projectIndexItemsForScope(projectIndex, scope.key).length;
        if (scoped >= MAX_PROJECTS_PER_SCOPE || projectIndex.projects.length >= MAX_PROJECTS_TOTAL) {
          throw new Error(pickText(localeId, 'project.limit'));
        }
      }

      async function importProjectFile(raw, localeId = 'zh') {
        if (state.import.busy) throw new Error(pickText(localeId, 'project.busy'));
        return withProjectLock(localeId, async () => {
        if (!scope.ready || scope.activeId === null) throw new Error(pickText(localeId, 'project.unavailable'));
        if (raw === null || typeof raw !== 'object' || raw.version !== 1) {
          throw new Error(pickText(localeId, 'project.invalid'));
        }
        if (raw.format !== undefined && raw.format !== 'deepseek-design.project') {
          throw new Error(pickText(localeId, 'project.invalid'));
        }
        ensureProjectCapacity(localeId);
        // Assets beyond the cap are dropped by restoreProject's truncation; count
        // them as omitted instead of hiding the loss.
        let omitted = Array.isArray(raw.assets) ? Math.max(0, raw.assets.length - MAX_ASSETS) : 0;
        const rawAssets = Array.isArray(raw.assets) ? raw.assets.slice(-MAX_ASSETS) : [];
        let embeddedChars = 0;
        for (const asset of rawAssets) {
          if (asset !== null && typeof asset === 'object') {
            const dataChars = typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith('data:') ? asset.dataUrl.length : 0;
            const posterChars = typeof asset.poster === 'string' ? asset.poster.length : 0;
            embeddedChars += dataChars + posterChars;
            if (embeddedChars > MAX_PROJECT_IMPORT_BYTES) throw new Error(pickText(localeId, 'project.tooLarge'));
          }
        }
        // Validate and normalize the complete file before touching the media store.
        const staged = restoreProject({
          version: 1,
          project: raw.project,
          autoImportVersion: raw.autoImportVersion,
          autoImportSkipped: raw.autoImportSkipped,
          assets: rawAssets.map((asset) => (asset !== null && typeof asset === 'object'
            ? { ...asset, blobId: null }
            : asset)),
          generations: raw.generations,
          timeline: raw.timeline,
          chat: raw.chat,
          preferences: raw.preferences,
        }, { allowEmpty: true });
        if (staged === null) throw new Error(pickText(localeId, 'project.invalid'));
        // An imported project is a new project: baseline its session-media
        // cutoff so the current Session's historical exports cannot flood it.
        staged.autoImportSince = Date.now();
        const stagedAssets = new Map(staged.assets.map((asset) => [asset.id, asset]));
        const writtenBlobIds = [];
        const processedAssetIds = new Set();
        try {
          for (const asset of rawAssets) {
            if (asset === null || typeof asset !== 'object' || typeof asset.id !== 'string') continue;
            const target = stagedAssets.get(asset.id);
            if (target === undefined || processedAssetIds.has(asset.id)) continue;
            processedAssetIds.add(asset.id);
            const hasEmbedded = typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith('data:');
            if (!hasEmbedded) {
              omitted += 1;
              continue;
            }
            try {
              const response = await fetch(asset.dataUrl);
              if (!response.ok) throw new Error('embedded media request failed');
              const blob = await response.blob();
              if (blob.size === 0) throw new Error('embedded media is empty');
              const blobId = uid('media');
              const saved = await mediaPut(blobId, {
                blob,
                poster: typeof asset.poster === 'string' ? asset.poster : null,
              });
              if (saved) {
                writtenBlobIds.push(blobId);
                target.blobId = blobId;
                target.missing = false;
              } else {
                target.blobId = null;
                target.missing = true;
                omitted += 1;
              }
            } catch {
              target.blobId = null;
              target.missing = true;
              omitted += 1;
            }
          }
          state = { ...state, autoImportSince: Date.now() };
          if (!flushSave()) throw new Error(pickText(localeId, 'project.saveFailed'));
          const now = Date.now();
          const entry = {
            id: uid('prj'),
            name: staged.project.name,
            scopeKey: scope.key,
            createdAt: now,
            updatedAt: now,
          };
          if (!writeProjectDocument(entry.id, staged)) throw new Error(pickText(localeId, 'toast.saveFailed'));
          projectIndex.projects.push(entry);
          projectIndex.activeByScope[scope.key] = entry.id;
          if (!persistProjectIndex(projectIndex)) {
            projectIndex.projects = projectIndex.projects.filter((item) => item.id !== entry.id);
            delete projectIndex.activeByScope[scope.key];
            removeProjectDocument(entry.id);
            throw new Error(pickText(localeId, 'toast.saveFailed'));
          }
          releaseProjectRuntime();
          backupTooLarge = false;
          scope = { ...scope, activeId: entry.id };
          refreshBackupMeta(entry.id);
          staged.models = state.models;
          staged.skills = state.skills;
          staged.persistence = hasContent(staged)
            ? { started: true, status: 'saved', error: '' }
            : { started: false, status: 'blank', error: '' };
          staged.projects = projectMetaPatch({
            ready: true,
            activeId: entry.id,
            items: projectIndexItemsForScope(projectIndex, scope.key).map((item) => ({ ...item })),
            busy: false,
            error: '',
          });
          state = staged;
          emit();
          startBackupTimer();
          hydrateMedia();
          consumeExportedAssets().catch(() => {});
          startSessionMedia();
          return { omitted, projectId: entry.id };
        } catch (error) {
          for (const blobId of writtenBlobIds) {
            try { await mediaDelete(blobId); } catch { /* Best-effort cleanup. */ }
          }
          throw error;
        }
        });
      }

      async function createProject() {
        const localeId = localeIdOf(ctx);
        return withProjectLock(localeId, async () => {
          if (!scope.ready) throw new Error(pickText(localeId, 'project.unavailable'));
          ensureProjectCapacity(localeId);
          state = { ...state, autoImportSince: Date.now() };
          if (!flushSave()) throw new Error(pickText(localeId, 'project.saveFailed'));
          const now = Date.now();
          const entry = { id: uid('prj'), name: '', scopeKey: scope.key, createdAt: now, updatedAt: now };
          projectIndex.projects.push(entry);
          projectIndex.activeByScope[scope.key] = entry.id;
          if (!persistProjectIndex(projectIndex)) {
            projectIndex.projects = projectIndex.projects.filter((item) => item.id !== entry.id);
            delete projectIndex.activeByScope[scope.key];
            throw new Error(pickText(localeId, 'project.saveFailed'));
          }
          releaseProjectRuntime();
          backupTooLarge = false;
          scope = { ...scope, activeId: entry.id };
          const next = createEmptyState();
          next.autoImportSince = now;
          refreshBackupMeta(entry.id);
          next.projects = projectMetaPatch({
            ready: true,
            activeId: entry.id,
            items: projectIndexItemsForScope(projectIndex, scope.key).map((item) => ({ ...item })),
            busy: false,
            error: '',
          });
          state = next;
          emit();
          startBackupTimer();
          consumeExportedAssets().catch(() => {});
          startSessionMedia();
          return entry;
        });
      }

      async function switchProject(projectId) {
        const localeId = localeIdOf(ctx);
        return withProjectLock(localeId, async () => {
          if (!scope.ready) throw new Error(pickText(localeId, 'project.unavailable'));
          const entry = projectEntryById(projectId);
          if (entry === null || entry.scopeKey !== scope.key) throw new Error(pickText(localeId, 'project.unavailable'));
          if (scope.activeId === entry.id) return true;
          state = { ...state, autoImportSince: Date.now() };
          if (!flushSave()) throw new Error(pickText(localeId, 'project.saveFailed'));
          const doc = readProjectDocument(entry.id);
          const next = doc ?? createEmptyState();
          if (doc === null) next.project.name = entry.name;
          if (doc !== null && doc.project.name !== entry.name) {
            entry.name = doc.project.name;
            entry.updatedAt = Date.now();
          }
          next.autoImportSince = doc === null ? Date.now() : Math.max(0, Number(next.autoImportSince) || 0);
          const previousActive = projectIndex.activeByScope[scope.key];
          projectIndex.activeByScope[scope.key] = entry.id;
          if (!persistProjectIndex(projectIndex)) {
            projectIndex.activeByScope[scope.key] = previousActive;
            throw new Error(pickText(localeId, 'project.saveFailed'));
          }
          releaseProjectRuntime();
          scope = { ...scope, activeId: entry.id };
          refreshBackupMeta(entry.id);
          next.projects = projectMetaPatch({
            ready: true,
            activeId: entry.id,
            items: projectIndexItemsForScope(projectIndex, scope.key).map((item) => ({ ...item })),
            busy: false,
            error: '',
          });
          state = next;
          emit();
          startBackupTimer();
          hydrateMedia();
          consumeExportedAssets().catch(() => {});
          startSessionMedia();
          return true;
        });
      }

      async function deleteProject(projectId) {
        const localeId = localeIdOf(ctx);
        return withProjectLock(localeId, async () => {
          if (!scope.ready) throw new Error(pickText(localeId, 'project.unavailable'));
          const entry = projectEntryById(projectId);
          if (entry === null || entry.scopeKey !== scope.key) throw new Error(pickText(localeId, 'project.unavailable'));
          const active = entry.id === scope.activeId;
          if (saveTimer !== 0) {
            if (active) {
              // The pending save belongs to the project being deleted.
              window.clearTimeout(saveTimer);
              saveTimer = 0;
            } else if (!flushSave()) {
              // Keep the active project's unsaved edit instead of dropping it.
              throw new Error(pickText(localeId, 'project.saveFailed'));
            }
          }
          // For the active project use the in-memory state: a pending save that
          // was just discarded (or any edit still inside the debounce window)
          // would leave the on-disk document stale, so its newer media blobs
          // would never be deleted (SF-2).
          const doc = active ? serializeProject(state) : readProjectDocument(entry.id);
          const previousProjects = projectIndex.projects;
          const previousActive = projectIndex.activeByScope[scope.key];
          projectIndex.projects = projectIndex.projects.filter((item) => item.id !== entry.id);
          if (projectIndex.activeByScope[scope.key] === entry.id) delete projectIndex.activeByScope[scope.key];
          if (!persistProjectIndex(projectIndex)) {
            projectIndex.projects = previousProjects;
            if (previousActive !== undefined) projectIndex.activeByScope[scope.key] = previousActive;
            throw new Error(pickText(localeId, 'project.saveFailed'));
          }
          removeProjectDocument(entry.id);
          removeProjectBackups(entry.id);
          if (!active) {
            state = { ...state, projects: projectMetaPatch({ ready: true, activeId: scope.activeId }) };
            emit();
          }
          if (active) {
            const nextEntry = chooseProjectForScope(scope.key);
            if (nextEntry === null) throw new Error(pickText(localeId, 'project.saveFailed'));
            const nextDoc = readProjectDocument(nextEntry.id);
            const next = nextDoc ?? createEmptyState();
            if (nextDoc === null) next.project.name = nextEntry.name;
            next.autoImportSince = nextDoc === null ? Date.now() : Math.max(0, Number(next.autoImportSince) || 0);
            releaseProjectRuntime();
            backupTooLarge = false;
            scope = { ...scope, activeId: nextEntry.id };
            refreshBackupMeta(nextEntry.id);
            next.projects = projectMetaPatch({
              ready: true,
              activeId: nextEntry.id,
              items: projectIndexItemsForScope(projectIndex, scope.key).map((item) => ({ ...item })),
              busy: false,
              error: '',
            });
            state = next;
            emit();
            startBackupTimer();
            hydrateMedia();
            consumeExportedAssets().catch(() => {});
            startSessionMedia();
          }
          if (doc !== null) {
            for (const asset of doc.assets) {
              if (typeof asset.blobId === 'string') mediaDelete(asset.blobId).catch(() => {});
            }
          }
          return true;
        });
      }

      function pushTimelineHistory() {
        history.push(cloneTimeline(state.timeline));
        if (history.length > MAX_HISTORY_STEPS) history.shift();
        future = [];
      }

      function commitTimeline(nextTimeline, extras = {}, save = true) {
        const wantedSelection = extras.selectedClip !== undefined ? extras.selectedClip : state.selectedClip;
        const wantedClips = Array.isArray(extras.selectedClips)
          ? extras.selectedClips
          : wantedSelection === null || wantedSelection === undefined ? [] : [wantedSelection];
        const seen = new Set();
        const survivingSelections = [];
        for (const ref of wantedClips) {
          if (ref === null || typeof ref !== 'object' || typeof ref.id !== 'string') continue;
          if (ref.track !== 'video' && ref.track !== 'audio' && ref.track !== 'music') continue;
          const key = `${ref.track}:${ref.id}`;
          if (seen.has(key)) continue;
          if (!trackClips(nextTimeline, ref.track).some((clip) => clip.id === ref.id)) continue;
          seen.add(key);
          survivingSelections.push({ track: ref.track, id: ref.id });
        }
        const nextGenerations = reconcileAppliedGenerations(extras.generations ?? state.generations, nextTimeline);
        setState({
          ...state,
          ...extras,
          generations: nextGenerations,
          timeline: nextTimeline,
          selectedClip: survivingSelections.length === 1 ? survivingSelections[0] : null,
          selectedClips: survivingSelections,
          ...syncHistoryFlags(),
        });
        if (save) markContentAndSave();
      }

      function addGenerationToTimeline(generationId, atStart = null, localeId = 'zh') {
        const generation = state.generations.find((item) => item.id === generationId);
        if (generation === undefined) return false;
        const total = sequenceDuration(generation.spec);
        if (total <= 0.1) return false;
        const empty = timelineIsEmpty(state.timeline);
        const desired = empty
          ? 0
          : atStart === null || atStart === undefined
            ? state.timeline.video.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
            : Math.max(0, Number(atStart) || 0);
        const start = findFreeStart(state.timeline.video, desired, total);
        const newClips = [];
        let cursor = start;
        generation.spec.scenes.forEach((scene, sceneIndex) => {
          newClips.push({
            id: uid('clip'),
            kind: 'generation',
            track: 'video',
            generationId: generation.id,
            sceneIndex,
            name: scene.title || generation.title,
            start: roundSeconds(cursor),
            sourceIn: 0,
            duration: roundSeconds(scene.duration),
            sourceDuration: roundSeconds(scene.duration),
            seed: scene.seed,
          });
          cursor += scene.duration;
        });
        pushTimelineHistory();
        const nextTimeline = {
          ...state.timeline,
          video: [...state.timeline.video, ...newClips].sort((a, b) => a.start - b.start),
        };
        const nextGenerations = generation.status === 'draft'
          ? state.generations.map((item) => item.id === generation.id ? { ...item, status: 'applied' } : item)
          : state.generations;
        commitTimeline(nextTimeline, {
          generations: nextGenerations,
          selectedAsset: { type: 'generation', id: generation.id },
          selectedClip: { track: 'video', id: newClips[0].id },
        });
        return true;
      }

      function discardGeneration(generationId, localeId = 'zh', options = {}) {
        const result = removeEntries([{ type: 'generation', id: generationId }], { force: options?.force === true });
        return result.ok;
      }

      function addBedAt(atStart, localeId = 'zh') {
        const duration = 12;
        const start = findFreeStart(state.timeline.music, Math.max(0, Number(atStart) || 0), duration);
        const clip = {
          id: uid('clip'),
          kind: 'bed',
          track: 'music',
          name: pickText(localeId === 'en' ? 'en' : 'zh', 'timeline.bedName'),
          start: roundSeconds(start),
          sourceIn: 0,
          duration,
          sourceDuration: duration,
          seed: (hashString(String(Date.now())) % 2_147_483_647) + 1,
        };
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          music: [...state.timeline.music, clip].sort((a, b) => a.start - b.start),
        }, { selectedClip: { track: 'music', id: clip.id } });
        return true;
      }

      function addAudioToTrack(assetId, track, atStart, localeId = 'zh') {
        const asset = state.assets.find((item) => item.id === assetId && item.kind === 'audio');
        if (asset === undefined || (track !== 'audio' && track !== 'music')) return false;
        const duration = Math.max(MIN_CLIP_SECONDS, Number(asset.duration) || 0);
        const desired = timelineIsEmpty(state.timeline) ? 0 : Math.max(0, Number(atStart) || 0);
        const start = findFreeStart(state.timeline[track], desired, duration);
        const clip = {
          id: uid('clip'),
          kind: 'audio',
          track,
          assetId: asset.id,
          name: asset.name,
          start: roundSeconds(start),
          sourceIn: 0,
          duration: roundSeconds(duration),
          sourceDuration: roundSeconds(duration),
        };
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          [track]: [...state.timeline[track], clip].sort((a, b) => a.start - b.start),
        }, { selectedClip: { track, id: clip.id } });
        return true;
      }

      function addVideoAssetToTrack(assetId, atStart, localeId = 'zh') {
        const asset = state.assets.find((item) => item.id === assetId && item.kind === 'video');
        if (asset === undefined) return false;
        const rawDuration = Number(asset.duration);
        if (!Number.isFinite(rawDuration) || rawDuration <= 0) return false;
        const duration = Math.max(MIN_CLIP_SECONDS, rawDuration);
        const derivedAspect = state.project.aspectInitialized !== true && state.timeline.video.length === 0
          ? closestAspectFor(asset.width, asset.height)
          : null;
        const desired = timelineIsEmpty(state.timeline) ? 0 : Math.max(0, Number(atStart) || 0);
        const start = findFreeStart(state.timeline.video, desired, duration);
        const clip = {
          id: uid('clip'),
          kind: 'asset',
          track: 'video',
          assetId: asset.id,
          name: asset.name,
          start: roundSeconds(start),
          sourceIn: 0,
          duration: roundSeconds(duration),
          sourceDuration: roundSeconds(duration),
        };
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          video: [...state.timeline.video, clip].sort((a, b) => a.start - b.start),
        }, {
          selectedClip: { track: 'video', id: clip.id },
          ...(derivedAspect === null ? {} : {
            project: { ...state.project, aspect: derivedAspect, aspectInitialized: true },
          }),
        });
        return true;
      }

      function addAssetToTimeline(assetId, track, atStart, localeId = 'zh') {
        const asset = state.assets.find((item) => item.id === assetId);
        if (asset === undefined) return null;
        if (asset.kind === 'video') {
          if (!addVideoAssetToTrack(asset.id, atStart, localeId)) return null;
          const rawDuration = Number(asset.duration);
          return {
            kind: 'video',
            hasAudio: asset.hasAudio === true,
            padded: Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration < MIN_CLIP_SECONDS,
          };
        }
        if (asset.kind === 'audio') {
          const target = track === 'music' ? 'music' : 'audio';
          if (!addAudioToTrack(asset.id, target, atStart, localeId)) return null;
          return { kind: 'audio', hasAudio: true };
        }
        return null;
      }

      function moveClip(clipId, track, desiredStart) {
        const clips = trackClips(state.timeline, track);
        const original = clips.find((clip) => clip.id === clipId);
        if (original === undefined) return false;
        const moved = placeMovedClip(clips, clipId, desiredStart, Number(desiredStart));
        const before = new Map(clips.map((clip) => [clip.id, clip.start]));
        const changed = moved.some((clip) => before.get(clip.id) !== clip.start);
        if (!changed) return false;
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          [track]: moved,
        }, { selectedClip: { track, id: clipId } });
        return true;
      }

      function trimClip(clipId, track, next) {
        const clips = trackClips(state.timeline, track);
        const clip = clips.find((item) => item.id === clipId);
        if (clip === undefined) return false;
        const start = Math.max(0, Number(next.start) || 0);
        const sourceIn = Math.max(0, Number(next.sourceIn) || 0);
        const duration = Math.max(MIN_CLIP_SECONDS, Number(next.duration) || 0);
        if (duration < MIN_CLIP_SECONDS) return false;
        if (sourceIn + duration > (Number(clip.sourceDuration) || duration) + 0.012) return false;
        if (clips.some((other) => other.id !== clipId && overlaps(start, duration, other))) return false;
        if (clip.start === start && clip.duration === duration && clip.sourceIn === sourceIn) return false;
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          [track]: clips.map((item) => item.id === clipId
            ? { ...item, start: roundSeconds(start), sourceIn: roundSeconds(sourceIn), duration: roundSeconds(duration) }
            : item).sort((a, b) => a.start - b.start),
        }, { selectedClip: { track, id: clipId } });
        return true;
      }

      function splitClip(clipId, track, atTime) {
        const clips = trackClips(state.timeline, track);
        const clip = clips.find((item) => item.id === clipId);
        if (clip === undefined) return false;
        const split = splitClipAt(clip, atTime);
        if (split === null) return false;
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          [track]: [...clips.filter((item) => item.id !== clipId), split.left, split.right].sort((a, b) => a.start - b.start),
        }, { selectedClip: { track, id: split.right.id } });
        return true;
      }

      function deleteClip(clipId, track) {
        const clips = trackClips(state.timeline, track);
        if (!clips.some((clip) => clip.id === clipId)) return false;
        pushTimelineHistory();
        commitTimeline({
          ...state.timeline,
          [track]: clips.filter((clip) => clip.id !== clipId),
        }, { selectedClip: null, selectedClips: [] });
        return true;
      }

      function deleteSelectedClips() {
        const refs = Array.isArray(state.selectedClips) && state.selectedClips.length > 0
          ? state.selectedClips
          : state.selectedClip === null ? [] : [state.selectedClip];
        if (refs.length === 0) return false;
        const keys = new Set(refs.map((ref) => `${ref.track}:${ref.id}`));
        const nextTimeline = { ...state.timeline };
        let removed = 0;
        for (const track of ['video', 'audio', 'music']) {
          nextTimeline[track] = trackClips(state.timeline, track).filter((clip) => {
            const remove = keys.has(`${track}:${clip.id}`);
            if (remove) removed += 1;
            return !remove;
          });
        }
        if (removed === 0) return false;
        pushTimelineHistory();
        commitTimeline(nextTimeline, { selectedClip: null, selectedClips: [] });
        return true;
      }

      function undo() {
        if (history.length === 0) return false;
        future.push(cloneTimeline(state.timeline));
        const previous = history.pop();
        setState({
          ...state,
          timeline: previous,
          generations: reconcileAppliedGenerations(state.generations, previous),
          selectedClip: null,
          selectedClips: [],
          ...syncHistoryFlags(),
        });
        markContentAndSave();
        return true;
      }

      function redo() {
        if (future.length === 0) return false;
        history.push(cloneTimeline(state.timeline));
        const next = future.pop();
        setState({
          ...state,
          timeline: next,
          generations: reconcileAppliedGenerations(state.generations, next),
          selectedClip: null,
          selectedClips: [],
          ...syncHistoryFlags(),
        });
        markContentAndSave();
        return true;
      }

      async function sendPrompt(text, localeId) {
        const prompt = String(text ?? '').trim().slice(0, 4_000);
        if (prompt.length === 0 || state.chat.busy) return;
        const requestEpoch = ++generationEpoch;
        const userMessage = {
          id: uid('msg'),
          role: 'user',
          text: prompt,
          notes: [],
          generationId: null,
          source: null,
          localPrompt: '',
          at: Date.now(),
        };
        const previousMessages = state.chat.messages.slice(-8);
        state = {
          ...state,
          chat: { messages: [...state.chat.messages, userMessage], busy: true },
        };
        emit();
        markContentAndSave();
        const activeModel = chooseActiveModel(state);
        if (activeModel === null) {
          const errorMessage = {
            id: uid('msg'),
            role: 'error',
            text: pickText(localeId, 'chat.noModel'),
            notes: [],
            generationId: null,
            source: null,
            localPrompt: prompt,
            at: Date.now(),
          };
          state = { ...state, chat: { messages: [...state.chat.messages, errorMessage], busy: false } };
          emit();
          markContentAndSave();
          return;
        }
        const latestGeneration = [...state.generations]
          .reverse()
          .find((generation) => generation.spec !== null);
        const selected = state.selectedAsset;
        const referenceAsset = selected?.type === 'asset'
          ? state.assets.find((asset) => asset.id === selected.id && (asset.kind === 'image' || asset.kind === 'video'))
          : undefined;
        const references = referenceAsset === undefined
          ? []
          : [`${referenceAsset.name} [${referenceAsset.palette.join(', ')}]`];
        const historyPayload = previousMessages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .slice(-6)
          .map((message) => ({ role: message.role, text: message.text.slice(0, 500) }));
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        generationController = controller;
        const timeout = controller === null ? 0 : window.setTimeout(() => controller.abort(), 125_000);
        try {
          const result = await bridgeRequest({
            action: 'generate',
            prompt,
            model: {
              provider: activeModel.provider,
              model: activeModel.model,
              reasoningEffort: activeModel.reasoningEffort,
            },
            skills: state.preferences.skills,
            history: historyPayload,
            currentSpec: compactGenerationSpec(latestGeneration ?? null),
            references,
            project: {
              aspect: state.project.aspect,
              duration: timelineDuration(state.timeline),
            },
            locale: localeId,
          }, controller?.signal);
          const spec = normalizeSpec(result.spec, result.spec?.title);
          if (requestEpoch !== generationEpoch || disposed) return;
          if (spec === null) throw new Error(pickText(localeId, 'error.parse'));
          const generation = {
            id: uid('generation'),
            title: spec.title,
            spec,
            source: 'deepseek',
            status: 'draft',
            createdAt: Date.now(),
          };
          const assistantMessage = {
            id: uid('msg'),
            role: 'assistant',
            text: typeof result.reply === 'string' && result.reply.trim().length > 0 ? result.reply.trim() : pickText(localeId, 'chat.draftReady'),
            notes: Array.isArray(result.notes) ? result.notes.filter((note) => typeof note === 'string').slice(0, 4) : [],
            generationId: generation.id,
            source: 'deepseek',
            localPrompt: '',
            at: Date.now(),
          };
          state = {
            ...state,
            generations: [...state.generations, generation],
            selectedAsset: { type: 'generation', id: generation.id },
            chat: { messages: [...state.chat.messages, assistantMessage], busy: false },
          };
          emit();
          markContentAndSave();
        } catch (error) {
          if (requestEpoch !== generationEpoch || disposed) return;
          const aborted = controller?.signal.aborted === true;
          const messageText = aborted
            ? pickText(localeId, 'chat.stopped')
            : (error?.message || pickText(localeId, 'error.request'));
          const errorMessage = {
            id: uid('msg'),
            role: 'error',
            text: messageText,
            notes: [],
            generationId: null,
            source: null,
            localPrompt: aborted ? '' : prompt,
            at: Date.now(),
          };
          state = { ...state, chat: { messages: [...state.chat.messages, errorMessage], busy: false } };
          emit();
          markContentAndSave();
        } finally {
          if (timeout !== 0) window.clearTimeout(timeout);
          if (generationController === controller) generationController = null;
        }
      }

      function stopGeneration() {
        if (generationController !== null) {
          try {
            generationController.abort();
          } catch {
            // Already aborted.
          }
        }
      }

      function useLocalSketchForMessage(messageId, localeId) {
        const message = state.chat.messages.find((item) => item.id === messageId);
        if (message === undefined || typeof message.localPrompt !== 'string' || message.localPrompt.length === 0) return false;
        const spec = localSketch(message.localPrompt, localeId);
        const text = localGenerationText(localeId);
        const generation = {
          id: uid('generation'),
          title: spec.title,
          spec,
          source: 'local',
          status: 'draft',
          createdAt: Date.now(),
        };
        const assistantMessage = {
          id: uid('msg'),
          role: 'assistant',
          text: text.reply,
          notes: text.notes,
          generationId: generation.id,
          source: 'local',
          localPrompt: '',
          at: Date.now(),
        };
        state = {
          ...state,
          generations: [...state.generations, generation],
          selectedAsset: { type: 'generation', id: generation.id },
          chat: {
            messages: state.chat.messages.map((item) => item.id === messageId ? assistantMessage : item),
            busy: false,
          },
        };
        emit();
        markContentAndSave();
        return true;
      }

      function clearImportError() {
        if (state.import.error.length === 0) return;
        state = { ...state, import: { ...state.import, error: '' } };
        emit();
      }

      function stopSessionMedia() {
        if (sessionMediaTimer !== 0) {
          window.clearInterval(sessionMediaTimer);
          sessionMediaTimer = 0;
        }
        if (sessionMediaAbort !== null) {
          try { sessionMediaAbort.abort(); } catch { /* Already aborted. */ }
          sessionMediaAbort = null;
        }
        sessionMediaQueue = [];
        sessionMediaBusy = false;
      }

      function startSessionMedia() {
        stopSessionMedia();
        if (disposed || activeSessionId === null || !scope.ready) return;
        sessionMediaAttempted.clear();
        syncSessionMedia();
        sessionMediaTimer = window.setInterval(() => {
          syncSessionMedia();
        }, SESSION_MEDIA_POLL_MS);
      }

      function setActiveSession(sessionId) {
        const next = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId.slice(0, 200) : null;
        if (next === activeSessionId && scope.ready) {
          startSessionMedia();
          return;
        }
        activeSessionId = next;
        // A different Session must not inherit the previous Session's resolved
        // Workspace path. Clearing it lets the unresolved-cwd fallback take the
        // documented synthetic scope instead of another Workspace's projects.
        activeWorkspacePath = '';
        stopSessionMedia();
        stopWorkspaceWatch();
        if (disposed) return;
        if (next === null) {
          scopeToken += 1;
          stopBackupTimer();
          flushSave();
          return;
        }
        const token = ++scopeToken;
        watchSessionScope(next, token);
      }

      async function syncSessionMedia() {
        if (disposed || activeSessionId === null || sessionMediaBusy || state.import.busy) return;
        if (typeof fetch !== 'function' || typeof File !== 'function') return;
        sessionMediaBusy = true;
        const sessionId = activeSessionId;
        const epoch = projectEpoch;
        const projectId = scope.activeId;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        sessionMediaAbort = controller;
        let imported = 0;
        let failed = 0;
        try {
          if (sessionMediaQueue.length === 0) {
            // Page through /session-media so a long Session's older explicit
            // exports are not silently unreachable behind the per-page cap
            // (H-10). Older Host builds omit nextOffset and stop after page one.
            const items = [];
            let offset = 0;
            for (let page = 0; page < 100; page += 1) {
              const response = await fetch(`${SESSION_MEDIA_PATH}?sessionId=${encodeURIComponent(sessionId)}&offset=${offset}`, {
                credentials: 'same-origin',
                headers: { accept: 'application/json' },
                signal: controller?.signal,
              });
              if (!response.ok) return;
              const payload = await response.json();
              if (payload?.filtered !== true || payload?.version !== 1) return;
              const pageItems = Array.isArray(payload?.items) ? payload.items : [];
              items.push(...pageItems);
              const nextOffset = Number(payload?.nextOffset);
              if (!Number.isFinite(nextOffset) || nextOffset <= offset || pageItems.length === 0) break;
              offset = nextOffset;
            }
            const existing = new Set(state.assets.map((asset) => asset.originKey).filter(Boolean));
            const since = Math.max(0, Number(state.autoImportSince) || 0);
            sessionMediaQueue = items.filter((item) => {
              if (item === null || typeof item !== 'object' || typeof item.attachmentId !== 'string') return false;
              if (item.kind !== 'video' && item.kind !== 'audio') return false;
              const key = `attachment:${item.attachmentId}`;
              const skipped = Array.isArray(state.autoImportSkipped) && state.autoImportSkipped.includes(key);
              const createdAt = Number(item.createdAt) || 0;
              if (since > 0 && createdAt > 0 && createdAt < since) return false;
              return !existing.has(key) && !skipped && !sessionMediaAttempted.has(key);
            });
          }
          while (sessionMediaQueue.length > 0 && imported < MAX_SESSION_MEDIA_PER_SYNC) {
            if (disposed || activeSessionId !== sessionId || projectEpoch !== epoch || scope.activeId !== projectId) return;
            if (state.assets.length >= MAX_ASSETS) break;
            const item = sessionMediaQueue.shift();
            const key = `attachment:${item.attachmentId}`;
            sessionMediaAttempted.add(key);
            const limit = FILE_LIMITS[item.kind] ?? 0;
            if (limit <= 0 || (Number(item.bytes) || 0) > limit) {
              failed += 1;
              continue;
            }
            try {
              const response = await fetch(String(item.url || ''), {
                credentials: 'same-origin',
                signal: controller?.signal,
              });
              if (!response.ok) throw new Error(`media request failed (${response.status})`);
              const blob = await response.blob();
              if (disposed || projectEpoch !== epoch || scope.activeId !== projectId) return;
              if (blob.size === 0 || blob.size > limit) throw new Error('media size is not importable');
              const fallbackName = `session-${item.kind}-${String(item.attachmentId).slice(-8)}`;
              const name = typeof item.name === 'string' && item.name.trim().length > 0
                ? item.name.trim().slice(0, 180)
                : fallbackName;
              const file = new File([blob], name, { type: typeof item.mediaType === 'string' ? item.mediaType : blob.type });
              const asset = await processImportedFile(file, localeIdOf(ctx));
              // The decode/import is async: re-check the project epoch after it
              // before touching assets, otherwise a project switch mid-import
              // writes the asset into the new project (SF-3).
              if (disposed || activeSessionId !== sessionId || projectEpoch !== epoch || scope.activeId !== projectId) return;
              const nextAsset = {
                ...asset,
                source: 'conversation',
                originKey: key.slice(0, 220),
                attachmentId: String(item.attachmentId).slice(0, 220),
                createdAt: Number(item.createdAt) || Date.now(),
              };
              state = { ...state, assets: [...state.assets, nextAsset] };
              emit();
              imported += 1;
            } catch {
              failed += 1;
            }
          }
          if (imported > 0) {
            markContentAndSave();
            showToast(
              pickText(localeIdOf(ctx), 'assets.autoImported').replace('{count}', String(imported)),
              'success',
            );
          } else if (failed > 0 && sessionMediaQueue.length === 0) {
            showToast(
              pickText(localeIdOf(ctx), 'assets.autoImportFailed').replace('{count}', String(failed)),
              'error',
            );
          }
        } catch {
          // Network/abort failures are retried by the next poll.
        } finally {
          if (sessionMediaAbort === controller) sessionMediaAbort = null;
          sessionMediaBusy = false;
          if (!disposed && activeSessionId === sessionId && sessionMediaQueue.length > 0) {
            window.setTimeout(() => {
              syncSessionMedia();
            }, 600);
          }
        }
      }

      async function consumeExportedAssets() {
        if (inboxConsuming || disposed || !scope.ready) return 0;
        inboxConsuming = true;
        const epoch = projectEpoch;
        const projectId = scope.activeId;
        const scopeSnapshot = { ...scope };
        try {
          const records = await inboxList();
          if (records.length === 0) return 0;
          if (disposed || projectEpoch !== epoch || scope.activeId !== projectId) return 0;
          const existing = new Set(state.assets.map((asset) => asset.id));
          const added = [];
          const addedInboxIds = [];
          const alreadyPresentInboxIds = [];
          for (const record of records) {
            if (record === null || typeof record !== 'object') continue;
            if (!matchesInboxScope(record, scopeSnapshot)) continue;
            if (typeof record.id !== 'string' || typeof record.blobId !== 'string') continue;
            if (record.kind !== 'video') continue;
            if (existing.has(record.id)) {
              // Already represented in the project; safe to drop the staged copy.
              alreadyPresentInboxIds.push(record.id);
              continue;
            }
            if (state.assets.length + added.length >= MAX_ASSETS) continue;
            const asset = {
              id: record.id.slice(0, 120),
              name: typeof record.name === 'string' && record.name.length > 0 ? record.name.slice(0, 180) : 'Exported video',
              kind: 'video',
              mime: typeof record.mime === 'string' ? record.mime.slice(0, 120) : 'video/webm',
              size: Math.max(0, Number(record.size) || 0),
              duration: Math.max(0, Number(record.duration) || 0),
              width: Math.max(0, Number(record.width) || 0),
              height: Math.max(0, Number(record.height) || 0),
              palette: DEFAULT_PALETTE.slice(),
              peaks: [],
              blobId: record.blobId,
              objectUrl: null,
              posterUrl: null,
              missing: false,
              source: 'conversation',
              toolCallId: typeof record.toolCallId === 'string' ? record.toolCallId.slice(0, 180) : undefined,
              createdAt: Number(record.createdAt) || Date.now(),
            };
            added.push(asset);
            addedInboxIds.push(record.id);
            existing.add(asset.id);
          }
          if (added.length === 0) {
            for (const id of alreadyPresentInboxIds) await inboxDelete(id);
            return 0;
          }
          if (disposed || projectEpoch !== epoch || scope.activeId !== projectId) {
            // The project changed mid-consumption: never delete staged exports
            // that were not committed to a project (SF-4).
            return 0;
          }
          state = {
            ...state,
            assets: [...state.assets, ...added],
            selectedAsset: { type: 'asset', id: added[added.length - 1].id },
          };
          emit();
          if (hasContent(state)) markContentAndSave();
          hydrateMedia();
          // Delete the inbox records only after the assets are part of the
          // active project state, so an interrupted consumption cannot lose a
          // finished export (SF-4).
          for (const id of [...addedInboxIds, ...alreadyPresentInboxIds]) await inboxDelete(id);
          return added.length;
        } finally {
          inboxConsuming = false;
        }
      }

      async function init() {
        if (initialized || disposed) return;
        initialized = true;
        if (scope.ready) {
          hydrateMedia();
          consumeExportedAssets().catch(() => {});
        }
        if (scope.ready) startBackupTimer();
        if (typeof BroadcastChannel === 'function') {
          try {
            inboxChannel = new BroadcastChannel('deepseek-design-assets');
            inboxChannel.onmessage = () => {
              if (!disposed && scope.ready) consumeExportedAssets().catch(() => {});
            };
          } catch {
            inboxChannel = null;
          }
        }
      }

      const flushOnPageHide = () => {
        if (saveTimer === 0) return;
        window.clearTimeout(saveTimer);
        saveTimer = 0;
        flushSave();
      };
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', flushOnPageHide);
      }

      function dispose() {
        if (disposed) return;
        if (saveTimer !== 0) {
          window.clearTimeout(saveTimer);
          saveTimer = 0;
          flushSave();
        }
        disposed = true;
        generationEpoch += 1;
        projectEpoch += 1;
        stopBackupTimer();
        stopSessionMedia();
        stopWorkspaceWatch();
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
          window.removeEventListener('pagehide', flushOnPageHide);
        }
        if (generationController !== null) {
          try {
            generationController.abort();
          } catch {
            // Already settled.
          }
        }
        window.clearTimeout(saveTimer);
        window.clearTimeout(toastTimer);
        if (inboxChannel !== null) {
          try { inboxChannel.close(); } catch { /* Already closed. */ }
          inboxChannel = null;
        }
        if (modelRetryTimer !== 0) window.clearTimeout(modelRetryTimer);
        if (skillRetryTimer !== 0) window.clearTimeout(skillRetryTimer);
        for (const url of ownedUrls) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Already released.
          }
        }
        ownedUrls.clear();
        disposeAudioRuntime();
        listeners.clear();
      }

      return {
        getSnapshot: () => state,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        init,
        dispose,
        setActiveSession,
        loadModels,
        loadSkills,
        importFiles,
        fileForAsset,
        importConversationObject,
        addExportedVideo,
        clearImportError,
        deleteAsset,
        deleteEntries,
        selectModel,
        selectReasoningEffort,
        toggleSkill,
        selectAsset,
        setAssetSelection,
        clearSelectedAsset,
        selectClip,
        selectClips,
        clearSelectedClip,
        deleteSelectedClips,
        setAspect,
        setProjectName,
        setAutoBackup,
        backupNow,
        restoreProjectBackup,
        clearProjectBackups,
        createProject,
        switchProject,
        deleteProject,
        exportProjectFile,
        importProjectFile,
        addGenerationToTimeline,
        discardGeneration,
        deleteGeneration,
        addBedAt,
        addAudioToTrack,
        addVideoAssetToTrack,
        addAssetToTimeline,
        moveClip,
        trimClip,
        splitClip,
        deleteClip,
        undo,
        redo,
        sendPrompt,
        stopGeneration,
        useLocalSketchForMessage,
        showToast,
      };
    }
    // @@STORE_END

    // @@RENDER_START
    function hexToRgba(hex, alpha) {
      const value = typeof hex === 'string' && HEX_COLOR.test(hex) ? hex.slice(1) : '000000';
      const red = parseInt(value.slice(0, 2), 16);
      const green = parseInt(value.slice(2, 4), 16);
      const blue = parseInt(value.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
    }

    function paintDust(context, width, height, seed, time, color, count) {
      const random = seededRandom(seed + Math.floor(time * 2) * 37);
      context.save();
      context.fillStyle = color;
      for (let index = 0; index < count; index += 1) {
        const x = random() * width;
        const y = random() * height;
        const size = 0.4 + random() * 1.6;
        context.globalAlpha = 0.08 + random() * 0.4;
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    function paintVignette(context, width, height, strength = 0.44) {
      const gradient = context.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.12, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.72, 'rgba(0,0,0,0.04)');
      gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }

    function paintEmptyFrame(context, width, height) {
      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#07090d');
      gradient.addColorStop(0.55, '#080b10');
      gradient.addColorStop(1, '#05070a');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * 0.52, height * 0.42, 0, width * 0.52, height * 0.42, Math.max(width, height) * 0.6);
      glow.addColorStop(0, 'rgba(86, 134, 254, 0.05)');
      glow.addColorStop(1, 'rgba(86, 134, 254, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.save();
      context.strokeStyle = 'rgba(255, 255, 255, 0.032)';
      context.lineWidth = Math.max(1, width * 0.0006);
      const step = Math.max(24, Math.round(width / 18));
      for (let x = step; x < width; x += step) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = step; y < height; y += step) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.restore();
      paintVignette(context, width, height, 0.3);
    }

    function preparePreviewCanvas(canvas, aspectId, quality) {
      if (canvas === null) return null;
      const { width, height } = previewBackingSize(aspectId, quality);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext('2d');
      if (context !== null) context.setTransform(1, 0, 0, 1, 0, 0);
      return { context, width, height };
    }

    function prepareExportCanvas(canvas, width, height) {
      const nextWidth = makeEven(width);
      const nextHeight = makeEven(height);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      const context = canvas.getContext('2d');
      if (context !== null) context.setTransform(1, 0, 0, 1, 0, 0);
      return { context, width: canvas.width, height: canvas.height };
    }

    function drawSceneBase(context, width, height, palette, time, seed) {
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, hexToRgba(palette[0], 1));
      gradient.addColorStop(0.55, hexToRgba(palette[0], 0.86));
      gradient.addColorStop(1, '#05070a');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * 0.72, height * 0.18, 0, width * 0.72, height * 0.18, Math.max(width, height) * 0.62);
      glow.addColorStop(0, hexToRgba(palette[1], 0.19));
      glow.addColorStop(0.55, hexToRgba(palette[1], 0.05));
      glow.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      paintDust(context, width, height, seed + 17, time, hexToRgba(palette[3], 0.7), 34);
    }

    function drawWaves(context, width, height, scene, localTime, palette, quality) {
      const intensity = clamp(scene.intensity, 0.1, 1);
      const phase = localTime * (0.22 + intensity * 0.22);
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, hexToRgba(palette[0], 1));
      sky.addColorStop(0.38, hexToRgba(palette[0], 0.84));
      sky.addColorStop(0.55, hexToRgba(palette[2], 0.24));
      sky.addColorStop(1, '#06090d');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);
      const sunX = width * 0.72;
      const sunY = height * 0.27;
      const sunRadius = Math.min(width, height) * (0.07 + intensity * 0.035);
      const halo = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 4.2);
      halo.addColorStop(0, hexToRgba(palette[3], 0.74));
      halo.addColorStop(0.2, hexToRgba(palette[2], 0.42));
      halo.addColorStop(0.58, hexToRgba(palette[1], 0.14));
      halo.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);
      context.save();
      context.fillStyle = hexToRgba(palette[3], 0.86);
      context.beginPath();
      context.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      context.fill();
      context.restore();
      const horizon = height * 0.52;
      const sea = context.createLinearGradient(0, horizon, 0, height);
      sea.addColorStop(0, hexToRgba(palette[1], 0.7));
      sea.addColorStop(0.25, hexToRgba(palette[1], 0.48));
      sea.addColorStop(0.56, hexToRgba(palette[0], 0.82));
      sea.addColorStop(1, '#04070a');
      context.fillStyle = sea;
      context.fillRect(0, horizon, width, height - horizon);
      const layers = quality < 0.8 ? 3 : 5;
      for (let layer = 0; layer < layers; layer += 1) {
        const baseY = horizon + (height - horizon) * (layer / layers) * 0.88 + height * 0.018;
        const amplitude = height * (0.012 + layer * 0.008) * (0.7 + intensity);
        const speed = 0.4 + layer * 0.1;
        context.beginPath();
        context.moveTo(-width * 0.05, height);
        for (let x = -width * 0.05; x <= width * 1.05; x += Math.max(4, width / 120)) {
          const nx = x / width;
          const y = baseY + Math.sin(nx * (5.2 + layer * 1.2) + phase * speed + layer) * amplitude
            + Math.sin(nx * 13 + phase * 1.7 + layer * 2.1) * amplitude * 0.28;
          context.lineTo(x, y);
        }
        context.lineTo(width * 1.05, height);
        context.closePath();
        context.fillStyle = hexToRgba(layer % 2 === 0 ? palette[1] : palette[0], 0.2 + layer * 0.08);
        context.fill();
        context.beginPath();
        for (let x = -width * 0.05; x <= width * 1.05; x += Math.max(6, width / 90)) {
          const nx = x / width;
          const y = baseY + Math.sin(nx * (5.2 + layer * 1.2) + phase * speed + layer) * amplitude
            + Math.sin(nx * 13 + phase * 1.7 + layer * 2.1) * amplitude * 0.28;
          if (x === -width * 0.05) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = hexToRgba(palette[3], 0.12 + layer * 0.055);
        context.lineWidth = Math.max(1, height * 0.0016);
        context.stroke();
      }
      paintDust(context, width, height, scene.seed + 3, localTime + 2, hexToRgba(palette[3], 0.8), quality < 0.8 ? 24 : 52);
      paintVignette(context, width, height, 0.48);
    }

    function drawCoast(context, width, height, scene, localTime, palette, quality) {
      const intensity = clamp(scene.intensity, 0.1, 1);
      const phase = localTime * (0.17 + intensity * 0.12);
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, hexToRgba(palette[0], 1));
      sky.addColorStop(0.34, hexToRgba(palette[0], 0.84));
      sky.addColorStop(0.58, hexToRgba(palette[2], 0.32));
      sky.addColorStop(1, '#07090c');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);
      const sunX = width * 0.22;
      const sunY = height * 0.3;
      const sun = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(width, height) * 0.55);
      sun.addColorStop(0, hexToRgba(palette[3], 0.64));
      sun.addColorStop(0.1, hexToRgba(palette[2], 0.3));
      sun.addColorStop(0.42, hexToRgba(palette[1], 0.11));
      sun.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = sun;
      context.fillRect(0, 0, width, height);
      context.fillStyle = hexToRgba(palette[3], 0.82);
      context.beginPath();
      context.arc(sunX, sunY, Math.min(width, height) * 0.052, 0, Math.PI * 2);
      context.fill();
      const seaLine = height * 0.56;
      const sea = context.createLinearGradient(0, seaLine, 0, height);
      sea.addColorStop(0, hexToRgba(palette[1], 0.65));
      sea.addColorStop(0.42, hexToRgba(palette[1], 0.36));
      sea.addColorStop(1, hexToRgba(palette[0], 0.9));
      context.fillStyle = sea;
      context.fillRect(0, seaLine, width, height - seaLine);
      const waveY = seaLine + height * 0.035;
      const amplitude = height * 0.018 * (0.7 + intensity);
      for (let band = 0; band < 4; band += 1) {
        context.beginPath();
        for (let x = -width * 0.08; x <= width * 1.08; x += Math.max(5, width / 140)) {
          const nx = x / width;
          const y = waveY + band * height * 0.062
            + Math.sin(nx * 10 + phase * (0.6 + band * 0.14) + band * 2.4) * amplitude
            + Math.sin(nx * 24 + phase * 1.5) * amplitude * 0.3;
          if (x === -width * 0.08) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = hexToRgba(palette[3], 0.12 + band * 0.055);
        context.lineWidth = Math.max(1, height * 0.002);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(0, height * 0.7);
      context.bezierCurveTo(width * 0.22, height * 0.62, width * 0.42, height * 0.76, width * 0.58, height * 0.7);
      context.bezierCurveTo(width * 0.74, height * 0.64, width * 0.86, height * 0.72, width, height * 0.67);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      const sand = context.createLinearGradient(0, height * 0.62, 0, height);
      sand.addColorStop(0, hexToRgba(palette[2], 0.48));
      sand.addColorStop(0.5, hexToRgba(palette[2], 0.2));
      sand.addColorStop(1, hexToRgba(palette[0], 0.92));
      context.fillStyle = sand;
      context.fill();
      const rocks = quality < 0.8 ? 1 : 2;
      for (let index = 0; index < rocks; index += 1) {
        const rx = width * (0.68 + index * 0.12);
        const ry = height * (0.57 + index * 0.035);
        const size = Math.min(width, height) * (0.09 + index * 0.025);
        context.beginPath();
        context.moveTo(rx - size, height);
        context.lineTo(rx - size * 0.55, ry);
        context.lineTo(rx - size * 0.18, ry - size * 0.28);
        context.lineTo(rx + size * 0.35, ry + size * 0.02);
        context.lineTo(rx + size * 0.75, height);
        context.closePath();
        context.fillStyle = hexToRgba('#000000', 0.52);
        context.fill();
      }
      paintDust(context, width, height, scene.seed + 13, localTime + 1, hexToRgba(palette[3], 0.65), 30);
      paintVignette(context, width, height, 0.46);
    }

    function drawSunScene(context, width, height, scene, localTime, palette, quality) {
      void quality;
      const intensity = clamp(scene.intensity, 0.1, 1);
      const breathe = 1 + Math.sin(localTime * 0.32) * 0.035;
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, hexToRgba(palette[0], 1));
      sky.addColorStop(0.35, hexToRgba(palette[1], 0.22));
      sky.addColorStop(0.67, hexToRgba(palette[2], 0.46));
      sky.addColorStop(1, '#07080b');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);
      const sunX = width * 0.52;
      const sunY = height * 0.46;
      const radius = Math.min(width, height) * (0.11 + intensity * 0.06) * breathe;
      const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius * 4.4);
      glow.addColorStop(0, hexToRgba(palette[3], 0.78));
      glow.addColorStop(0.12, hexToRgba(palette[2], 0.48));
      glow.addColorStop(0.48, hexToRgba(palette[1], 0.14));
      glow.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.fillStyle = hexToRgba(palette[3], 0.82);
      context.beginPath();
      context.arc(sunX, sunY, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(5, 7, 10, 0.42)';
      context.fillRect(0, height * 0.63, width, height * 0.37);
      const reflection = context.createLinearGradient(0, height * 0.63, 0, height);
      reflection.addColorStop(0, hexToRgba(palette[2], 0.2));
      reflection.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = reflection;
      context.fillRect(sunX - width * 0.08, height * 0.63, width * 0.16, height * 0.37);
      for (let index = 0; index < 6; index += 1) {
        const y = height * (0.66 + index * 0.045);
        const widthScale = (1 - index * 0.11) * (0.1 + 0.02 * Math.sin(localTime * 0.6 + index));
        context.fillStyle = hexToRgba(palette[3], 0.09 - index * 0.009);
        context.fillRect(sunX - width * widthScale, y, width * widthScale * 2, Math.max(1, height * 0.0025));
      }
      paintDust(context, width, height, scene.seed + 19, localTime, hexToRgba(palette[3], 0.7), 38);
      paintVignette(context, width, height, 0.42);
    }

    function drawTypeScene(context, width, height, scene, localTime, palette, quality, spec, sceneIndex) {
      void quality;
      drawSceneBase(context, width, height, palette, localTime, scene.seed);
      const total = Array.isArray(spec?.scenes) ? spec.scenes.length : 1;
      const reveal = clamp(localTime / 0.7, 0, 1) * (1 - clamp((localTime - (scene.duration - 0.55)) / 0.55, 0, 1));
      context.save();
      context.translate(width * 0.08, height * 0.12);
      context.fillStyle = hexToRgba(palette[3], 0.85 - reveal * 0.08);
      context.font = `500 ${Math.round(height * 0.023)}px "SF Pro Text", -apple-system, "PingFang SC", sans-serif`;
      context.fillText(`${String(sceneIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 0, 0);
      context.fillStyle = hexToRgba(palette[1], 0.72);
      context.fillRect(0, height * 0.035, width * 0.16 * reveal, Math.max(1, height * 0.002));
      const title = scene.title || spec?.title || '';
      if (title.length > 0) {
        let fontSize = Math.round(height * (title.length > 7 ? 0.112 : 0.15));
        context.font = `600 ${fontSize}px "SF Pro Display", -apple-system, "PingFang SC", sans-serif`;
        const maxWidth = width * 0.84;
        while (context.measureText(title).width > maxWidth && fontSize > height * 0.04) {
          fontSize -= Math.max(1, Math.round(height * 0.004));
          context.font = `600 ${fontSize}px "SF Pro Display", -apple-system, "PingFang SC", sans-serif`;
        }
        const targetY = height * 0.5;
        const y = targetY + (1 - reveal) * height * 0.08;
        context.fillStyle = hexToRgba(palette[3], 1);
        context.globalAlpha = 0.94;
        context.fillText(title, 0, y);
        context.globalAlpha = 1;
        context.strokeStyle = hexToRgba(palette[1], 0.18);
        context.lineWidth = Math.max(1, height * 0.0015);
        context.strokeText(title, 0, y + height * 0.012);
      }
      const subtitle = scene.subtitle || '';
      if (subtitle.length > 0) {
        context.fillStyle = hexToRgba(palette[2], 0.72);
        context.font = `400 ${Math.round(height * 0.026)}px "SF Pro Text", -apple-system, "PingFang SC", sans-serif`;
        context.fillText(subtitle, 0, height * 0.68);
      }
      context.strokeStyle = hexToRgba(palette[3], 0.16);
      context.lineWidth = Math.max(1, height * 0.0014);
      context.beginPath();
      context.moveTo(width * 0.08, height * 0.82);
      context.lineTo(width * (0.08 + 0.2 * reveal), height * 0.82);
      context.stroke();
      context.restore();
      context.save();
      context.translate(width * 0.92, height * 0.78);
      context.rotate(-Math.PI / 2);
      context.fillStyle = hexToRgba(palette[3], 0.28);
      context.font = `400 ${Math.round(height * 0.018)}px "SF Mono", "SF Pro Text", monospace`;
      context.fillText('DEEPSEEK DESIGN / CODE MOTION', 0, 0);
      context.restore();
      paintVignette(context, width, height, 0.36);
    }

    function drawOrbitScene(context, width, height, scene, localTime, palette, quality) {
      drawSceneBase(context, width, height, palette, localTime, scene.seed);
      const intensity = clamp(scene.intensity, 0.1, 1);
      const cx = width * 0.52;
      const cy = height * 0.49;
      const radius = Math.min(width, height) * (0.065 + intensity * 0.025);
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, radius * 5);
      glow.addColorStop(0, hexToRgba(palette[3], 0.55));
      glow.addColorStop(0.2, hexToRgba(palette[1], 0.25));
      glow.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.fillStyle = hexToRgba(palette[3], 0.9);
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
      const rings = quality < 0.8 ? 2 : 3;
      for (let ring = 0; ring < rings; ring += 1) {
        context.save();
        context.translate(cx, cy);
        context.rotate(-0.35 + ring * 0.38);
        context.strokeStyle = hexToRgba(palette[3], 0.13 + ring * 0.03);
        context.lineWidth = Math.max(1, height * 0.0012);
        context.beginPath();
        context.ellipse(0, 0, width * (0.17 + ring * 0.06), height * (0.055 + ring * 0.025), 0, 0, Math.PI * 2);
        context.stroke();
        const angle = localTime * (0.17 + ring * 0.05) + ring * 1.8;
        const dotX = Math.cos(angle) * width * (0.17 + ring * 0.06);
        const dotY = Math.sin(angle) * height * (0.055 + ring * 0.025);
        context.fillStyle = hexToRgba(palette[2], 0.7);
        context.beginPath();
        context.arc(dotX, dotY, Math.max(1.5, height * 0.004), 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      paintDust(context, width, height, scene.seed + 31, localTime, hexToRgba(palette[3], 0.6), quality < 0.8 ? 32 : 70);
      paintVignette(context, width, height, 0.5);
    }

    function drawGridScene(context, width, height, scene, localTime, palette, quality) {
      void quality;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, hexToRgba(palette[0], 1));
      gradient.addColorStop(0.68, hexToRgba(palette[0], 0.75));
      gradient.addColorStop(1, '#040609');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const horizon = height * 0.45;
      const glow = context.createRadialGradient(width * 0.5, horizon, 0, width * 0.5, horizon, width * 0.52);
      glow.addColorStop(0, hexToRgba(palette[1], 0.17));
      glow.addColorStop(1, hexToRgba(palette[1], 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.save();
      context.strokeStyle = hexToRgba(palette[1], 0.2);
      context.lineWidth = Math.max(1, height * 0.0012);
      const columns = 14;
      for (let column = -columns; column <= columns; column += 1) {
        const xBottom = width * 0.5 + column * width * 0.095;
        context.beginPath();
        context.moveTo(width * 0.5, horizon);
        context.lineTo(xBottom, height);
        context.stroke();
      }
      for (let row = 0; row < 11; row += 1) {
        const t = row / 10;
        const eased = t * t;
        const y = horizon + (height - horizon) * eased;
        context.strokeStyle = hexToRgba(palette[1], 0.06 + t * 0.09);
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.restore();
      const scan = horizon + ((localTime * 0.055) % 1) * (height - horizon);
      context.strokeStyle = hexToRgba(palette[2], 0.44);
      context.lineWidth = Math.max(1, height * 0.0014);
      context.beginPath();
      context.moveTo(width * 0.1, scan);
      context.lineTo(width * 0.9, scan);
      context.stroke();
      const title = scene.title || '';
      if (title.length > 0) {
        context.fillStyle = hexToRgba(palette[3], 0.82);
        context.font = `500 ${Math.round(height * 0.052)}px "SF Pro Display", -apple-system, "PingFang SC", sans-serif`;
        context.fillText(title, width * 0.1, height * 0.19);
      }
      context.strokeStyle = hexToRgba(palette[3], 0.2);
      context.beginPath();
      context.moveTo(width * 0.1, height * 0.25);
      context.lineTo(width * 0.34, height * 0.25);
      context.stroke();
      paintDust(context, width, height, scene.seed + 7, localTime, hexToRgba(palette[3], 0.55), 24);
      paintVignette(context, width, height, 0.48);
    }

    function drawGlassScene(context, width, height, scene, localTime, palette, quality) {
      drawSceneBase(context, width, height, palette, localTime, scene.seed);
      const blobs = quality < 0.8 ? 3 : 5;
      const random = seededRandom(scene.seed + 41);
      for (let index = 0; index < blobs; index += 1) {
        const radius = Math.min(width, height) * (0.12 + random() * 0.25);
        const cx = width * (0.12 + random() * 0.76) + Math.sin(localTime * (0.12 + random() * 0.15) + index) * width * 0.035;
        const cy = height * (0.15 + random() * 0.7) + Math.cos(localTime * (0.1 + random() * 0.12) + index) * height * 0.04;
        const color = palette[(index % 2) === 0 ? 1 : 2];
        const bloom = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
        bloom.addColorStop(0, hexToRgba(color, index === 0 ? 0.24 : 0.13));
        bloom.addColorStop(0.42, hexToRgba(color, 0.08));
        bloom.addColorStop(1, hexToRgba(color, 0));
        context.fillStyle = bloom;
        context.fillRect(0, 0, width, height);
      }
      context.save();
      context.strokeStyle = hexToRgba(palette[3], 0.2);
      context.lineWidth = Math.max(1, height * 0.0018);
      context.beginPath();
      context.arc(width * 0.68, height * 0.36, Math.min(width, height) * 0.2, -2.8, 0.4);
      context.stroke();
      context.strokeStyle = hexToRgba(palette[3], 0.08);
      context.beginPath();
      context.arc(width * 0.68, height * 0.36, Math.min(width, height) * 0.245, -2.5, 0.2);
      context.stroke();
      context.restore();
      const title = scene.title || '';
      if (title.length > 0) {
        context.fillStyle = hexToRgba(palette[3], 0.68);
        context.font = `450 ${Math.round(height * 0.037)}px "SF Pro Display", -apple-system, "PingFang SC", sans-serif`;
        context.fillText(title, width * 0.09, height * 0.84);
      }
      context.fillStyle = hexToRgba(palette[2], 0.3);
      context.font = `400 ${Math.round(height * 0.018)}px "SF Mono", "SF Pro Text", monospace`;
      context.fillText('LIQUID / 0' + String((scene.seed % 9) + 1), width * 0.09, height * 0.89);
      paintVignette(context, width, height, 0.38);
    }

    function drawScene(context, width, height, scene, spec, sceneIndex, localTime, quality) {
      const palette = spec?.palette ?? DEFAULT_PALETTE;
      switch (scene.type) {
        case 'waves':
          drawWaves(context, width, height, scene, localTime, palette, quality);
          break;
        case 'coast':
          drawCoast(context, width, height, scene, localTime, palette, quality);
          break;
        case 'sun':
          drawSunScene(context, width, height, scene, localTime, palette, quality);
          break;
        case 'type':
          drawTypeScene(context, width, height, scene, localTime, palette, quality, spec, sceneIndex);
          break;
        case 'orbit':
          drawOrbitScene(context, width, height, scene, localTime, palette, quality);
          break;
        case 'grid':
          drawGridScene(context, width, height, scene, localTime, palette, quality);
          break;
        default:
          drawGlassScene(context, width, height, scene, localTime, palette, quality);
          break;
      }
    }

    function renderSpecTime(canvas, spec, time, aspectId, quality) {
      if (canvas === null) return;
      const prepared = preparePreviewCanvas(canvas, aspectId, quality);
      if (prepared === null || prepared.context === null) return;
      const { context, width, height } = prepared;
      if (spec === null || spec === undefined) {
        paintEmptyFrame(context, width, height);
        return;
      }
      const found = sceneAt(spec, time);
      if (found === null) {
        paintEmptyFrame(context, width, height);
        return;
      }
      drawScene(context, width, height, found.scene, spec, found.index, found.localTime, quality);
    }

    function renderTimelineFrame(canvas, timeline, generations, time, aspectId, quality) {
      if (canvas === null) return;
      const prepared = preparePreviewCanvas(canvas, aspectId, quality);
      if (prepared === null || prepared.context === null) return;
      const { context, width, height } = prepared;
      const active = trackClips(timeline, 'video')
        .filter((clip) => time >= clip.start - 1e-6 && time < clipEnd(clip))
        .sort((a, b) => a.start - b.start)
        .pop();
      if (active === undefined) {
        paintEmptyFrame(context, width, height);
        return;
      }
      const generation = generations.find((item) => item.id === active.generationId);
      if (generation === undefined) {
        paintEmptyFrame(context, width, height);
        return;
      }
      const scene = generation.spec.scenes[active.sceneIndex];
      if (scene === undefined) {
        paintEmptyFrame(context, width, height);
        return;
      }
      const local = (Number(active.sourceIn) || 0) + Math.max(0, time - active.start);
      drawScene(context, width, height, scene, generation.spec, active.sceneIndex, local, quality);
    }

    const exportVideoElements = new Map();

    function exportVideoElement(asset) {
      if (asset === undefined || asset === null || typeof asset.objectUrl !== 'string' || asset.objectUrl.length === 0) return null;
      let element = exportVideoElements.get(asset.id);
      if (element !== undefined) return element;
      element = document.createElement('video');
      element.src = asset.objectUrl;
      element.muted = true;
      element.playsInline = true;
      element.preload = 'auto';
      exportVideoElements.set(asset.id, element);
      return element;
    }

    async function primeExportVideoElements(timeline, assets) {
      const assetIds = new Set();
      for (const clip of trackClips(timeline, 'video')) {
        if (clip.kind === 'asset' && typeof clip.assetId === 'string') assetIds.add(clip.assetId);
      }
      const waits = [];
      for (const asset of Array.isArray(assets) ? assets : []) {
        if (!assetIds.has(asset.id)) continue;
        const element = exportVideoElement(asset);
        if (element === null) continue;
        if (element.readyState >= 2) continue;
        waits.push(new Promise((resolve) => {
          const done = () => resolve();
          element.addEventListener('loadeddata', done, { once: true });
          element.addEventListener('canplay', done, { once: true });
          element.addEventListener('error', done, { once: true });
          window.setTimeout(done, 2_000);
        }));
      }
      if (waits.length > 0) await Promise.all(waits);
    }

    function cleanupExportVideoElements() {
      for (const element of exportVideoElements.values()) {
        try { element.pause(); } catch { /* Already paused. */ }
        try { element.removeAttribute('src'); element.load(); } catch { /* Already released. */ }
      }
      exportVideoElements.clear();
    }

    // Keep primed elements alive across gap/generation frames: destroying them
    // here forces a fresh decode when the next asset clip starts, which paints
    // black frames for the first few frames of that clip. Ownership of playback
    // is corrected whenever an element is reused.
    function pauseExportVideoElements() {
      for (const element of exportVideoElements.values()) {
        try { element.pause(); } catch { /* Already paused. */ }
      }
    }

    function pauseExportVideoElementsExcept(keepId) {
      for (const [id, element] of exportVideoElements) {
        if (id === keepId) continue;
        try { element.pause(); } catch { /* Already paused. */ }
      }
    }

    /** Wait for a primed video element to reach the frame the export needs.
     *  Drawing right after assigning currentTime can record the previous frame
     *  for a trimmed/repeated clip (0.9.5 R-3). Resolves on seeked or a short
     *  timeout so a non-seekable element cannot stall the export. */
    function seekExportVideoElement(element, targetTime) {
      return new Promise((resolve) => {
        if (element === null || element === undefined) {
          resolve();
          return;
        }
        let settled = false;
        let timer = 0;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          try { element.removeEventListener('seeked', finish); } catch { /* Already gone. */ }
          resolve();
        };
        if (Math.abs((Number(element.currentTime) || 0) - targetTime) <= 0.02) {
          resolve();
          return;
        }
        timer = window.setTimeout(finish, 250);
        try { element.addEventListener('seeked', finish, { once: true }); } catch { /* Not seekable. */ }
        try { element.currentTime = targetTime; } catch { finish(); }
      });
    }

    function drawContainedVideo(context, element, width, height) {
      const sourceWidth = Number(element.videoWidth) || 0;
      const sourceHeight = Number(element.videoHeight) || 0;
      if (sourceWidth <= 0 || sourceHeight <= 0) return false;
      const scale = Math.min(width / sourceWidth, height / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const x = (width - drawWidth) / 2;
      const y = (height - drawHeight) / 2;
      context.fillStyle = '#05070a';
      context.fillRect(0, 0, width, height);
      context.drawImage(element, x, y, drawWidth, drawHeight);
      return true;
    }

    async function renderExportFrame(canvas, timeline, generations, assets, time, width, height) {
      const prepared = prepareExportCanvas(canvas, width, height);
      if (prepared.context === null) return;
      const { context } = prepared;
      const active = trackClips(timeline, 'video')
        .filter((clip) => time >= clip.start - 1e-6 && time < clipEnd(clip))
        .sort((a, b) => a.start - b.start)
        .pop();
      if (active === undefined) {
        paintEmptyFrame(context, prepared.width, prepared.height);
        pauseExportVideoElements();
        return;
      }
      if (active.kind === 'asset') {
        const asset = (Array.isArray(assets) ? assets : []).find((item) => item.id === active.assetId);
        const element = exportVideoElement(asset);
        const local = Math.max(0, (Number(active.sourceIn) || 0) + (time - active.start));
        if (element !== null) {
          // Only one decoder may drive the recorder at a time: pause the
          // previously active clip before starting this one (R-1).
          pauseExportVideoElementsExcept(asset.id);
          await seekExportVideoElement(element, local);
          if (element.paused) element.play().catch(() => {});
          if (element.readyState >= 2 && element.videoWidth > 0) {
            if (drawContainedVideo(context, element, prepared.width, prepared.height)) return;
          }
        }
        paintEmptyFrame(context, prepared.width, prepared.height);
        return;
      }
      const generation = generations.find((item) => item.id === active.generationId);
      if (generation === undefined) {
        paintEmptyFrame(context, prepared.width, prepared.height);
        pauseExportVideoElements();
        return;
      }
      const scene = generation.spec.scenes[active.sceneIndex];
      if (scene === undefined) {
        paintEmptyFrame(context, prepared.width, prepared.height);
        pauseExportVideoElements();
        return;
      }
      pauseExportVideoElements();
      const local = (Number(active.sourceIn) || 0) + Math.max(0, time - active.start);
      drawScene(context, prepared.width, prepared.height, scene, generation.spec, active.sceneIndex, local, 1);
    }

    function animationDimensions(aspectId, resolution) {
      return exportDimensions(isAspect(aspectId) ? aspectId : '16:9', resolution === '4k' ? '4k' : '1080p');
    }

    function animationFrameRate(value) {
      const fps = Number(value);
      return fps === 24 || fps === 25 || fps === 30 || fps === 60 ? fps : 30;
    }

    function animationBitrate(width, height, fps) {
      const pixels = Math.max(1, Number(width) || 1) * Math.max(1, Number(height) || 1);
      return Math.round(clamp(pixels * animationFrameRate(fps) * 0.16, 2_000_000, 60_000_000));
    }

    function renderAnimationVideo({ code, duration, width, height, fps, signal, onProgress }) {
      return new Promise((resolve, reject) => {
        if (typeof Worker !== 'function' || typeof MediaRecorder !== 'function'
          || typeof document === 'undefined' || typeof document.createElement !== 'function') {
          reject(new Error('This browser cannot render model animations.'));
          return;
        }
        const mime = chooseRecorderMime(false);
        if (mime === '') {
          reject(new Error('This browser cannot record a video.'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(width));
        canvas.height = Math.max(2, Math.round(height));
        const context = canvas.getContext('2d');
        if (context === null || typeof canvas.captureStream !== 'function') {
          reject(new Error('This browser cannot capture a canvas stream.'));
          return;
        }
        const stream = canvas.captureStream(animationFrameRate(fps));
        if (stream.getVideoTracks().length === 0) {
          reject(new Error('This browser cannot capture a canvas stream.'));
          return;
        }
        let worker = null;
        let recorder = null;
        let settled = false;
        let poster = null;
        let timeout = 0;
        let stoppedResolve = () => {};
        const chunks = [];
        const stopped = new Promise((resolveStopped) => { stoppedResolve = resolveStopped; });
        const onAbort = () => fail(signal?.reason instanceof Error ? signal.reason : new Error('Animation export cancelled.'));
        const cleanup = () => {
          if (timeout !== 0) clearTimeout(timeout);
          timeout = 0;
          if (signal !== undefined && signal !== null) signal.removeEventListener('abort', onAbort);
          if (worker !== null) {
            try { worker.terminate(); } catch { /* Already gone. */ }
            worker = null;
          }
          if (recorder !== null && recorder.state !== 'inactive') {
            try { recorder.stop(); } catch { /* Already stopped. */ }
          }
          for (const track of stream.getVideoTracks()) {
            try { track.stop(); } catch { /* Already stopped. */ }
          }
        };
        function fail(error) {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        async function finish() {
          if (settled) return;
          settled = true;
          try {
            if (recorder === null || (recorder.state === 'inactive' && chunks.length === 0)) {
              // The worker finished without ever starting recording; resolving a
              // 0-byte video would stage a broken asset, so report it instead.
              throw new Error('Animation recording never started.');
            }
            if (recorder.state !== 'inactive') recorder.stop();
            else stoppedResolve();
            await stopped;
            cleanup();
            resolve({
              blob: new Blob(chunks, { type: mime }),
              mime,
              poster,
              duration,
              width: canvas.width,
              height: canvas.height,
              fps: animationFrameRate(fps),
            });
          } catch (error) {
            cleanup();
            reject(error);
          }
        }
        if (signal !== undefined && signal !== null) {
          if (signal.aborted) {
            fail(new Error('Animation export cancelled.'));
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        }
        try {
          recorder = new MediaRecorder(stream, {
            mimeType: mime,
            videoBitsPerSecond: animationBitrate(canvas.width, canvas.height, fps),
          });
          recorder.ondataavailable = (event) => {
            if (event.data !== null && event.data.size > 0) chunks.push(event.data);
          };
          recorder.onstop = () => stoppedResolve();
          recorder.onerror = (event) => fail(new Error(event?.error?.message ?? 'Video recording failed.'));
        } catch (error) {
          fail(error);
          return;
        }
        try {
          worker = new Worker(EXPORT_WORKER_PATH);
        } catch (error) {
          fail(new Error(`The animation renderer could not start: ${error?.message ?? error}`));
          return;
        }
        worker.onmessage = (event) => {
          const message = event?.data;
          if (message === null || typeof message !== 'object') return;
          if (message.type === 'started') {
            // The Worker is evaluated and about to paint frame 0. Start the
            // recorder only now, so the leading blank canvas (worker fetch,
            // script load, up to 2 MB of model code) is never recorded.
            if (settled) return;
            try {
              if (recorder !== null && recorder.state === 'inactive') recorder.start(250);
            } catch (error) {
              fail(error);
            }
            return;
          }
          if (message.type === 'frame') {
            const bitmap = message.bitmap;
            if (bitmap === undefined || bitmap === null) return;
            try {
              context.clearRect(0, 0, canvas.width, canvas.height);
              context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              if (poster === null) poster = canvas.toDataURL('image/jpeg', 0.85);
              if (typeof onProgress === 'function') {
                onProgress(clamp(Number(message.t) / Math.max(0.001, Number(duration)), 0, 1));
              }
            } finally {
              if (typeof bitmap.close === 'function') bitmap.close();
            }
            return;
          }
          if (message.type === 'error') {
            fail(new Error(typeof message.message === 'string' ? message.message : 'Animation render failed.'));
            return;
          }
          if (message.type === 'done') {
            window.setTimeout(() => { finish().catch(() => {}); }, 120);
          }
        };
        worker.onerror = (event) => {
          fail(new Error(event?.message ?? 'The animation renderer failed.'));
        };
        timeout = window.setTimeout(() => {
          fail(new Error('Animation render timed out.'));
        }, Math.max(60_000, duration * 1000 + 600_000));
        worker.postMessage({
          type: 'start',
          code,
          duration,
          width: canvas.width,
          height: canvas.height,
          fps: animationFrameRate(fps),
        });
      });
    }

    function validateAnimationToolArgs(raw) {
      if (raw === null || typeof raw !== 'object') throw new Error('Animation arguments are missing.');
      const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
      const duration = Number(raw.duration);
      const code = typeof raw.code === 'string' ? raw.code : '';
      const aspect = typeof raw.aspect === 'string' && isAspect(raw.aspect) ? raw.aspect : '16:9';
      const resolution = typeof raw.resolution === 'string' && raw.resolution.toLowerCase() === '4k' ? '4k' : '1080p';
      const fps = animationFrameRate(raw.fps);
      if (title.length === 0) throw new Error('The animation title is empty.');
      if (!Number.isFinite(duration) || duration < 1 || duration > MAX_ANIMATION_SECONDS) {
        throw new Error(`Animation duration must be 1-${MAX_ANIMATION_SECONDS} seconds.`);
      }
      if (code.trim().length === 0) throw new Error('The animation code is empty.');
      if (code.length > MAX_ANIMATION_CODE) throw new Error('The animation code is too large.');
      if (resolution === '4k' && fps > 30) throw new Error('4K export is limited to 30fps.');
      return { title, duration, code, aspect, resolution, fps };
    }

    async function persistExportedAnimation({ callId, args, result, sessionId, cwd }) {
      const dimensions = animationDimensions(args.aspect, args.resolution);
      if (result.blob.size > MAX_VIDEO_BYTES) throw new Error('The rendered video exceeds the 4 GiB asset limit.');
      const id = uid('asset');
      const extension = extensionForMime(result.mime);
      const name = `${sanitizeFilename(args.title)}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
      const saved = await mediaPut(id, { blob: result.blob, poster: result.poster });
      if (!saved) throw new Error('The rendered video could not be stored in the media library.');
      const asset = {
        id,
        name,
        kind: 'video',
        mime: result.mime,
        size: result.blob.size,
        duration: Math.max(0.1, Number(result.duration) || args.duration),
        width: dimensions.width,
        height: dimensions.height,
        palette: DEFAULT_PALETTE.slice(),
        peaks: [],
        blobId: id,
        objectUrl: null,
        posterUrl: null,
        missing: false,
        source: 'conversation',
        toolCallId: callId,
        sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId.slice(0, 200) : undefined,
        cwd: typeof cwd === 'string' && cwd.length > 0 ? cwd.slice(0, 1_000) : undefined,
        createdAt: Date.now(),
      };
      const queued = await inboxPut(asset);
      if (!queued) {
        await mediaDelete(id);
        throw new Error('The asset inbox is unavailable; the video was not added to the workbench.');
      }
      if (typeof callId === 'string' && callId.length > 0) {
        try {
          await exportRecordPut(callId, {
            callId,
            assetId: id,
            title: args.title,
            duration: asset.duration,
            width: asset.width,
            height: asset.height,
            status: 'ready',
            createdAt: asset.createdAt,
          });
        } catch {
          // The video is already staged in the inbox; the record is only a UI hint.
        }
      }
      broadcastAssetsChanged();
      return asset;
    }

    function renderPoster(canvas, spec, sceneIndex) {
      if (canvas === null) return;
      canvas.width = 480;
      canvas.height = 270;
      const context = canvas.getContext('2d');
      if (context === null) return;
      if (spec === null || spec === undefined) {
        paintEmptyFrame(context, 480, 270);
        return;
      }
      const scene = spec.scenes[sceneIndex] ?? spec.scenes[0];
      if (scene === undefined) {
        paintEmptyFrame(context, 480, 270);
        return;
      }
      drawScene(context, 480, 270, scene, spec, sceneIndex, Math.min(scene.duration * 0.36, 2.2), 0.62);
    }

    function syntheticWavePeaks(seed, buckets) {
      const random = seededRandom(seed);
      const peaks = [];
      let envelope = 0.3;
      for (let index = 0; index < buckets; index += 1) {
        envelope += (random() - 0.5) * 0.1;
        envelope = clamp(envelope, 0.16, 0.94);
        peaks.push(Math.round(clamp(envelope * (0.55 + random() * 0.55), 0.08, 1) * 1000) / 1000);
      }
      return peaks;
    }

    function wavePath(peaks) {
      const list = Array.isArray(peaks) && peaks.length > 1 ? peaks : syntheticWavePeaks(7, WAVEFORM_BUCKETS);
      const upper = [];
      const lower = [];
      for (let index = 0; index < list.length; index += 1) {
        const x = (index / (list.length - 1)) * 100;
        const amplitude = clamp(Number(list[index]) || 0, 0, 1) * 10.5;
        upper.push(`${x.toFixed(2)} ${(12 - amplitude).toFixed(2)}`);
        lower.unshift(`${x.toFixed(2)} ${(12 + amplitude).toFixed(2)}`);
      }
      return `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
    }

    function scheduleAudioSources(clips, assetsById, context, destination, fromTime) {
      const sources = [];
      let missing = false;
      if (context === null) return { sources, missing: true };
      const startAt = Math.max(0, Number(fromTime) || 0);
      for (const clip of clips) {
        const clipStart = Number(clip.start) || 0;
        const clipDuration = Number(clip.duration) || 0;
        const clipStop = clipStart + clipDuration;
        if (clipStop <= startAt + 1e-6) continue;
        const playAt = Math.max(startAt, clipStart);
        const localOffset = (Number(clip.sourceIn) || 0) + (playAt - clipStart);
        const remaining = clipDuration - (playAt - clipStart);
        if (remaining <= 0.01) continue;
        const buffer = bufferForClip(clip, assetsById);
        if (buffer === null) {
          missing = true;
          continue;
        }
        const available = Math.max(0, buffer.duration - localOffset);
        if (available <= 0.005) continue;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        source.start(context.currentTime + 0.035 + Math.max(0, clipStart - startAt), localOffset, Math.min(remaining, available));
        sources.push(source);
      }
      return { sources, missing };
    }

    function stopAudioSources(sources) {
      for (const source of sources) {
        try {
          source.stop(0);
          source.disconnect();
        } catch {
          // Already ended.
        }
      }
    }

    function linkedAudioClips(timeline, assets) {
      const byId = new Map((Array.isArray(assets) ? assets : []).map((asset) => [asset.id, asset]));
      return trackClips(timeline, 'video')
        .filter((clip) => clip.kind === 'asset' && Number(clip.duration) > 0)
        .map((clip) => {
          const asset = byId.get(clip.assetId);
          if (asset === undefined || asset.hasAudio !== true) return null;
          return {
            id: `linked:${clip.id}`,
            kind: 'linked-audio',
            track: 'audio',
            assetId: asset.id,
            name: clip.name || asset.name,
            start: Number(clip.start) || 0,
            sourceIn: Number(clip.sourceIn) || 0,
            duration: Number(clip.duration) || 0,
            sourceDuration: Number(clip.sourceDuration) || Number(clip.duration) || 0,
            linkClipId: clip.id,
          };
        })
        .filter((clip) => clip !== null);
    }

    function collectAudioClips(timeline, assets = []) {
      return [
        ...trackClips(timeline, 'audio'),
        ...trackClips(timeline, 'music'),
        ...linkedAudioClips(timeline, assets),
      ]
        .filter((clip) => Number(clip.duration) > 0)
        .sort((a, b) => a.start - b.start);
    }

    function ScenePoster({ spec, sceneIndex = 0, className }) {
      const canvasRef = useRef(null);
      useEffect(() => {
        renderPoster(canvasRef.current, spec, sceneIndex);
      }, [spec, sceneIndex]);
      return h('canvas', {
        ref: canvasRef,
        className,
        width: 480,
        height: 270,
        'aria-hidden': 'true',
      });
    }

    function Waveform({ peaks, seed, className }) {
      const path = useMemo(() => wavePath(
        Array.isArray(peaks) && peaks.length > 1 ? peaks : syntheticWavePeaks(seed ?? 7, WAVEFORM_BUCKETS),
      ), [peaks, seed]);
      return h('svg', {
        viewBox: '0 0 100 24',
        preserveAspectRatio: 'none',
        className,
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: path, fill: 'currentColor' }));
    }

    function clipPeaks(clip, assets) {
      if (clip.kind === 'bed') return syntheticWavePeaks(clip.seed ?? 7, WAVEFORM_BUCKETS);
      const asset = assets.find((item) => item.id === clip.assetId);
      if (asset === undefined || asset.peaks.length === 0) return syntheticWavePeaks(clip.seed ?? 3, WAVEFORM_BUCKETS);
      return asset.peaks;
    }

    function useDismissible(ref, open, onClose) {
      useEffect(() => {
        if (!open) return undefined;
        const onPointer = (event) => {
          if (ref.current !== null && ref.current.contains(event.target)) return;
          onClose();
        };
        const onKey = (event) => {
          if (event.key === 'Escape') {
            // Consume the Escape here: otherwise the panel-level handler also
            // treats it as "clear the asset selection" while only a popover or
            // context menu was being dismissed (K-02 / 0.9.5 A-1).
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        };
        document.addEventListener('pointerdown', onPointer, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('pointerdown', onPointer, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [open, ref, onClose]);
    }

    function useLocaleT(ctx) {
      const snapshot = useSyncExternalStore(
        useCallback((listener) => ctx.locale.subscribe(listener), [ctx]),
        useCallback(() => ctx.locale.getSnapshot(), [ctx]),
        useCallback(() => ctx.locale.getSnapshot(), [ctx]),
      );
      const active = snapshot?.active ?? 'en';
      const t = useMemo(() => ctx.locale.bind(NS), [ctx]);
      return { t, localeId: active };
    }

    function useFocusReturn(open, fallbackRef) {
      useEffect(() => {
        if (!open) return undefined;
        const previous = document.activeElement;
        const fallback = fallbackRef?.current ?? null;
        return () => {
          const current = document.activeElement;
          const focusWasLost = current === null
            || current === document.body
            || (current instanceof HTMLElement && current.closest('.dsd-popover') !== null);
          if (!focusWasLost) return;
          let target = previous;
          if (!(target instanceof HTMLElement) || !target.isConnected || target.closest('.dsd-popover') !== null) {
            target = fallback;
          }
          if (target instanceof HTMLElement && target.isConnected) {
            target.focus({ preventScroll: true });
          }
        };
      }, [open, fallbackRef]);
    }

    function useModalFocus(ref, active, onClose) {
      useEffect(() => {
        if (!active || ref.current === null) return undefined;
        const previous = document.activeElement;
        const node = ref.current;
        const focusable = () => [...node.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
          .filter((element) => element.offsetParent !== null || element === document.activeElement);
        const timer = window.setTimeout(() => {
          const first = focusable()[0];
          if (first !== undefined) first.focus({ preventScroll: true });
        }, 20);
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const items = focusable();
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
          window.clearTimeout(timer);
          document.removeEventListener('keydown', onKey, true);
          if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
        };
      }, [active, onClose, ref]);
    }
    // @@RENDER_END

    // @@UI_START
    function PanelGlyph({ size = 18, active = false }) {
      const edge = Number.isFinite(Number(size)) ? Math.max(12, Number(size)) : 18;
      return h('img', {
        src: APP_ICON_DATA_URL,
        width: edge,
        height: edge,
        alt: '',
        draggable: false,
        decoding: 'async',
        'aria-hidden': 'true',
        style: {
          display: 'block',
          width: `${edge}px`,
          height: `${edge}px`,
          objectFit: 'contain',
          borderRadius: `${Math.max(3, Math.round(edge * 0.22))}px`,
          opacity: active ? 1 : 0.82,
          pointerEvents: 'none',
          userSelect: 'none',
        },
      });
    }

    function TopBar({
      t,
      state,
      canExport,
      onExport,
      onRenameProject,
      onLoadProject,
      onExportProject,
      onToggleAssets,
      onOpenConversation,
      onCloseWorkbench,
      onSetAutoBackup,
      onRestoreBackup,
      onClearBackups,
      onNewProject,
      onSwitchProject,
      onDeleteProject,
      showAssets,
    }) {
      const [nameDraft, setNameDraft] = useState(state.project.name);
      const [projectMenuOpen, setProjectMenuOpen] = useState(false);
      const projectMenuRef = useRef(null);
      const projectMenuTriggerRef = useRef(null);
      const cancelNameBlurRef = useRef(false);
      useDismissible(projectMenuRef, projectMenuOpen, useCallback(() => setProjectMenuOpen(false), []));
      useFocusReturn(projectMenuOpen, projectMenuTriggerRef);
      useEffect(() => { setNameDraft(state.project.name); }, [state.project.name]);
      const commitName = () => {
        if (cancelNameBlurRef.current) {
          cancelNameBlurRef.current = false;
          setNameDraft(state.project.name);
          return;
        }
        const next = nameDraft.trim();
        if (next !== state.project.name) onRenameProject(next);
      };
      const started = state.persistence.started;
      const saveTone = !started ? 'blank' : state.persistence.status;
      const saveLabel = !started
        ? t('save.blank')
        : state.persistence.status === 'saving'
          ? t('save.saving')
          : state.persistence.status === 'error'
            ? t('save.error')
            : t('save.saved');
      const projects = state.projects;
      const projectItems = Array.isArray(projects.items) ? projects.items : [];
      const projectName = (entry) => (typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name : t('project.untitled'));
      const scopeLabel = projects.workspacePath.length > 0
        ? t('project.workspace').replace('{name}', projects.scopeLabel)
        : t('project.scope.unresolved');
      const closeProjectMenu = () => setProjectMenuOpen(false);
      const runProjectAction = (action) => {
        closeProjectMenu();
        if (typeof action === 'function') action();
      };
      return h(
        'header',
        { className: 'dsd-topbar' },
        h('div', { className: 'dsd-brand' },
          h('div', { className: 'dsd-wordmark' }, 'DeepSeek', h('span', null, 'Design'))),
        h('div', { className: 'dsd-topdivider' }),
        h('div', { className: 'dsd-project' },
          h('input', {
            className: 'dsd-projectname',
            value: nameDraft,
            placeholder: t('project.untitled'),
            maxLength: 80,
            'aria-label': t('project.namePlaceholder'),
            title: t('project.namePlaceholder'),
            onChange: (event) => setNameDraft(event.target.value),
            onBlur: commitName,
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                event.preventDefault();
                commitName();
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                cancelNameBlurRef.current = true;
                setNameDraft(state.project.name);
                event.currentTarget.blur();
              }
            },
          })),
        h('div', { className: 'dsd-topspacer' }),
        h('div', { className: 'dsd-topactions' },
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn dsd-narrowonly',
            'aria-label': t('assets.title'),
            'aria-pressed': showAssets,
            title: t('assets.title'),
            onClick: onToggleAssets,
          }, h(Icon, { name: 'folder', size: 16 })),
          h('span', {
            className: cx('dsd-save', 'dsd-save-action', saveTone === 'saved' && 'is-saved', saveTone === 'saving' && 'is-saving', saveTone === 'error' && 'is-error'),
            title: saveLabel,
          },
          h('span', { className: 'dsd-savedot' }),
          h('span', null, saveLabel)),
          h('button', {
            type: 'button',
            className: 'dsd-topaction',
            'aria-label': t('session.open'),
            title: t('session.open'),
            onClick: onOpenConversation,
          }, h(Icon, { name: 'sparkles', size: 14 }), h('span', null, t('session.open'))),
          h('button', {
            type: 'button',
            className: 'dsd-topaction is-primary',
            disabled: !canExport,
            'aria-label': t('actions.export'),
            title: canExport ? t('actions.export') : t('export.noVideo'),
            onClick: onExport,
          }, h(Icon, { name: 'download', size: 14 }), h('span', null, t('actions.export'))),
          h('div', { className: 'dsd-projectmenu', ref: projectMenuRef },
            h('button', {
              type: 'button',
              ref: projectMenuTriggerRef,
              className: 'dsd-topaction',
              'aria-haspopup': 'menu',
              'aria-expanded': projectMenuOpen,
              'aria-label': t('project.manage'),
              title: t('project.manage'),
              onClick: () => setProjectMenuOpen((value) => !value),
            }, h(Icon, { name: 'folder', size: 14 }), h('span', null, t('project.manage'))),
            projectMenuOpen ? h('div', {
              className: 'dsd-popover dsd-project-popover',
              role: 'menu',
              'aria-label': t('project.menu'),
            },
              h('div', { className: 'dsd-project-scope' },
                h('span', { className: 'dsd-project-scope-label' }, t('project.scope')),
                h('span', { className: 'dsd-project-scope-value' }, scopeLabel)),
              h('div', { className: 'dsd-project-scope-hint dsd-project-scope-note' }, t('project.scopeHint')),
              h('label', { className: 'dsd-toggle dsd-project-backup' },
                h('input', {
                  type: 'checkbox',
                  checked: projects.backup !== undefined && projects.backup.enabled === true,
                  onChange: (event) => onSetAutoBackup?.(event.target.checked),
                }),
                h('span', { className: 'dsd-toggle-track' }),
                h('span', null, t('project.backupAuto'))),
              h('div', { className: 'dsd-project-scope-hint' },
                projects.backup !== undefined && projects.backup.tooLarge === true
                  ? t('project.backupTooLarge')
                  : projects.backup !== undefined && projects.backup.lastAt > 0
                    ? t('project.backupLast').replace('{time}', new Date(projects.backup.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
                    : t('project.backupNone')),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'dsd-projectitem',
                disabled: projects.backup === undefined || projects.backup.count === 0,
                onClick: () => runProjectAction(onRestoreBackup),
              }, h(Icon, { name: 'refresh', size: 13 }), t('project.backupRestore')),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'dsd-projectitem',
                disabled: projects.backup === undefined || projects.backup.count === 0,
                onClick: () => runProjectAction(onClearBackups),
              }, h(Icon, { name: 'trash', size: 13 }), t('project.backupClear')),
              h('div', { className: 'dsd-project-sep', role: 'separator' }),
              h('div', { className: 'dsd-project-list', role: 'group', 'aria-label': t('project.list') },
                projectItems.length === 0
                  ? h('div', { className: 'dsd-project-empty' }, t('project.untitled'))
                  : projectItems.map((entry) => h('div', {
                    key: entry.id,
                    className: cx('dsd-project-row', entry.id === projects.activeId && 'is-active'),
                  },
                  h('button', {
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': entry.id === projects.activeId,
                    className: 'dsd-project-row-main',
                    title: projectName(entry),
                    onClick: () => runProjectAction(() => onSwitchProject?.(entry.id)),
                  },
                  h(Icon, { name: entry.id === projects.activeId ? 'check' : 'folder', size: 13 }),
                  h('span', { className: 'dsd-project-row-name' }, projectName(entry)),
                  entry.id === projects.activeId
                    ? h('span', { className: 'dsd-project-row-current' }, t('project.current'))
                    : null),
                  h('button', {
                    type: 'button',
                    className: 'dsd-project-row-delete',
                    title: t('project.delete'),
                    'aria-label': `${t('project.delete')}: ${projectName(entry)}`,
                    onClick: (event) => {
                      event.stopPropagation();
                      runProjectAction(() => onDeleteProject?.(entry.id));
                    },
                  }, h(Icon, { name: 'trash', size: 12 }))))),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'dsd-projectitem dsd-project-new',
                onClick: () => runProjectAction(onNewProject),
              }, h(Icon, { name: 'plus', size: 13 }), t('project.new')),
              h('div', { className: 'dsd-project-sep', role: 'separator' }),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'dsd-projectitem',
                onClick: () => runProjectAction(onLoadProject),
              }, h(Icon, { name: 'file', size: 13 }), t('project.load')),
              h('button', {
                type: 'button',
                role: 'menuitem',
                className: 'dsd-projectitem',
                onClick: () => runProjectAction(onExportProject),
              }, h(Icon, { name: 'download', size: 13 }), t('project.export'))) : null),
          typeof onCloseWorkbench === 'function'
            ? h('button', {
              type: 'button',
              className: 'dsd-topaction',
              'aria-label': t('actions.close'),
              title: t('actions.close'),
              onClick: onCloseWorkbench,
            }, h(Icon, { name: 'close', size: 14 }), h('span', null, t('actions.close')))
            : null),
      );
    }

    const ASSET_FILTERS = [
      { id: 'all', icon: 'folder', labelKey: 'assets.filter.all' },
      { id: 'video', icon: 'video', labelKey: 'assets.filter.video' },
      { id: 'audio', icon: 'audio', labelKey: 'assets.filter.audio' },
      { id: 'image', icon: 'image', labelKey: 'assets.filter.image' },
      { id: 'generation', icon: 'sparkles', labelKey: 'assets.filter.generation' },
    ];

    function AssetPanel({ t, state, localeId, fileDrag, onImport, onImportConversationObject, onSelect, onSetSelection, onDeleteEntries, onClearImportError }) {
      const [filter, setFilter] = useState('all');
      const [query, setQuery] = useState('');
      const [fileOver, setFileOver] = useState(false);
      const [filterOpen, setFilterOpen] = useState(false);
      const [contextMenu, setContextMenu] = useState(null);
      const [marquee, setMarquee] = useState(null);
      const filterRef = useRef(null);
      const filterTriggerRef = useRef(null);
      const contextMenuRef = useRef(null);
      const scrollRef = useRef(null);
      const anchorRef = useRef(null);
      const closeContextMenu = useCallback(() => setContextMenu(null), []);
      useDismissible(filterRef, filterOpen, useCallback(() => setFilterOpen(false), []));
      useFocusReturn(filterOpen, filterTriggerRef);
      useDismissible(contextMenuRef, contextMenu !== null, closeContextMenu);
      useEffect(() => {
        if (contextMenu === null) return undefined;
        const timer = window.setTimeout(() => {
          const first = contextMenuRef.current?.querySelector('button');
          if (first instanceof HTMLElement) first.focus({ preventScroll: true });
        }, 0);
        const close = () => setContextMenu(null);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
          window.clearTimeout(timer);
          window.removeEventListener('resize', close);
          window.removeEventListener('scroll', close, true);
        };
      }, [contextMenu]);
      const assets = state.assets;
      const generations = state.generations;
      const counts = useMemo(() => ({
        all: assets.length + generations.length,
        video: assets.filter((asset) => asset.kind === 'video').length + generations.length,
        audio: assets.filter((asset) => asset.kind === 'audio').length,
        image: assets.filter((asset) => asset.kind === 'image').length,
        generation: generations.length,
      }), [assets, generations]);
      const entries = useMemo(() => {
        const generatedEntries = generations.map((generation) => ({
          key: `generation:${generation.id}`,
          type: 'generation',
          createdAt: generation.createdAt,
          generation,
        }));
        const assetEntries = assets.map((asset) => ({
          key: `asset:${asset.id}`,
          type: 'asset',
          createdAt: asset.createdAt,
          asset,
        }));
        return [...generatedEntries, ...assetEntries].sort((a, b) => b.createdAt - a.createdAt);
      }, [assets, generations]);
      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return entries.filter((entry) => {
          if (filter === 'generation' && entry.type !== 'generation') return false;
          if (filter === 'audio' && (entry.type !== 'asset' || entry.asset.kind !== 'audio')) return false;
          if (filter === 'image' && (entry.type !== 'asset' || entry.asset.kind !== 'image')) return false;
          if (filter === 'video' && !(entry.type === 'generation' || entry.asset?.kind === 'video')) return false;
          if (needle.length === 0) return true;
          const name = entry.type === 'generation' ? entry.generation.title : entry.asset.name;
          return name.toLowerCase().includes(needle);
        });
      }, [entries, filter, query]);
      const refOfEntry = useCallback((entry) => ({
        type: entry.type,
        id: entry.type === 'generation' ? entry.generation.id : entry.asset.id,
      }), []);
      const sameRef = useCallback((a, b) => a !== null && a !== undefined && b !== null && b !== undefined
        && a.type === b.type && a.id === b.id, []);
      const selectedRefs = useMemo(() => {
        const raw = Array.isArray(state.selectedAssets) && state.selectedAssets.length > 0
          ? state.selectedAssets
          : state.selectedAsset === null || state.selectedAsset === undefined ? [] : [state.selectedAsset];
        const seen = new Set();
        return raw.filter((ref) => {
          if (ref === null || typeof ref !== 'object' || (ref.type !== 'asset' && ref.type !== 'generation') || typeof ref.id !== 'string') return false;
          const key = `${ref.type}:${ref.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }, [state.selectedAssets, state.selectedAsset]);
      const selectedKeys = useMemo(() => new Set(selectedRefs.map((ref) => `${ref.type}:${ref.id}`)), [selectedRefs]);
      const activeFilter = ASSET_FILTERS.find((item) => item.id === filter) ?? ASSET_FILTERS[0];
      const isSelected = (entry) => selectedKeys.has(`${entry.type}:${entry.type === 'generation' ? entry.generation.id : entry.asset.id}`);
      const allVisibleSelected = visible.length > 0 && visible.every(isSelected);
      const focusFilterOption = (offset) => {
        const menu = filterRef.current?.querySelector('.dsd-asset-filter-popover');
        if (menu === null || menu === undefined) return;
        const options = [...menu.querySelectorAll('[role="option"]')];
        if (options.length === 0) return;
        const index = options.indexOf(document.activeElement);
        const next = index < 0 ? 0 : (index + offset + options.length) % options.length;
        options[next].focus();
      };
      const onFilterKeyDown = (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!filterOpen) {
            setFilterOpen(true);
            window.setTimeout(() => focusFilterOption(0), 0);
          } else {
            focusFilterOption(event.key === 'ArrowDown' ? 1 : -1);
          }
          return;
        }
        if (event.key === 'Escape' && filterOpen) {
          event.preventDefault();
          setFilterOpen(false);
          filterTriggerRef.current?.focus();
        }
      };
      const handleFiles = (files) => {
        if (files !== undefined && files.length > 0) onImport(files);
      };
      const entryName = (entry) => entry.type === 'generation' ? entry.generation.title : entry.asset.name;
      const entryUsage = (entry) => entry.type === 'generation'
        ? trackClips(state.timeline, 'video').filter((clip) => clip.generationId === entry.generation.id).length
        : assetReferenceCount(state.timeline, entry.asset.id);
      const usageForRef = (ref) => {
        const entry = entries.find((item) => sameRef(refOfEntry(item), ref));
        return entry === undefined ? 0 : entryUsage(entry);
      };
      const mergeRefs = (base, extra) => {
        const seen = new Set();
        const out = [];
        for (const ref of [...base, ...extra]) {
          if (ref === null || typeof ref !== 'object' || typeof ref.id !== 'string') continue;
          const key = `${ref.type}:${ref.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ type: ref.type, id: ref.id });
        }
        return out;
      };
      const confirmDelete = (targets) => {
        const refs = mergeRefs([], Array.isArray(targets) ? targets : [targets]);
        if (refs.length === 0) return;
        const clipCount = refs.reduce((sum, ref) => sum + usageForRef(ref), 0);
        const message = refs.length > 1
          ? t('assets.deleteSelectionConfirm')
            .replace('{assets}', String(refs.length))
            .replace('{clips}', String(clipCount))
          : clipCount > 0
            ? t('assets.deleteInUseConfirm').replace('{count}', String(clipCount))
            : t('assets.deleteConfirm');
        setContextMenu(null);
        if (typeof window.confirm === 'function' && !window.confirm(message)) return;
        onDeleteEntries(refs);
      };
      const handleCardSelect = (event, entry) => {
        const ref = refOfEntry(entry);
        const additive = event.metaKey || event.ctrlKey;
        const range = event.shiftKey;
        if (range) {
          const anchor = anchorRef.current !== null && anchorRef.current !== undefined
            ? anchorRef.current
            : (selectedRefs[0] ?? ref);
          const start = visible.findIndex((item) => sameRef(refOfEntry(item), anchor));
          const end = visible.findIndex((item) => sameRef(refOfEntry(item), ref));
          if (start >= 0 && end >= 0) {
            const rangeRefs = visible.slice(Math.min(start, end), Math.max(start, end) + 1).map((item) => refOfEntry(item));
            const next = additive ? mergeRefs(selectedRefs, rangeRefs) : rangeRefs;
            anchorRef.current = ref;
            onSetSelection(next, ref);
            return;
          }
        }
        if (additive) {
          const exists = selectedRefs.some((item) => sameRef(item, ref));
          const next = exists ? selectedRefs.filter((item) => !sameRef(item, ref)) : mergeRefs(selectedRefs, [ref]);
          anchorRef.current = ref;
          onSetSelection(next, exists ? (next.length > 0 ? next[next.length - 1] : null) : ref);
          return;
        }
        anchorRef.current = ref;
        onSelect(ref);
      };
      const toggleSelectAll = () => {
        if (visible.length === 0) return;
        if (allVisibleSelected) {
          anchorRef.current = null;
          onSetSelection([], null);
          return;
        }
        const refs = mergeRefs(selectedRefs, visible.map((entry) => refOfEntry(entry)));
        anchorRef.current = refs.length > 0 ? refs[refs.length - 1] : null;
        onSetSelection(refs, refs.length > 0 ? refs[refs.length - 1] : null);
      };
      const requestDeleteSelection = () => confirmDelete(selectedRefs);
      const requestDeleteEntry = (entry) => confirmDelete([refOfEntry(entry)]);
      const targetsForEntry = (entry) => {
        const ref = refOfEntry(entry);
        return selectedRefs.some((item) => sameRef(item, ref)) && selectedRefs.length > 1 ? selectedRefs : [ref];
      };
      const showContextMenu = (entry, clientX, clientY) => {
        const width = 200;
        const height = 76;
        setContextMenu({
          entry,
          targets: targetsForEntry(entry),
          x: Math.max(8, Math.min(clientX, window.innerWidth - width - 8)),
          y: Math.max(8, Math.min(clientY, window.innerHeight - height - 8)),
        });
      };
      const openContextMenu = (event, entry) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isSelected(entry)) {
          anchorRef.current = refOfEntry(entry);
          onSetSelection([refOfEntry(entry)], refOfEntry(entry));
        }
        showContextMenu(entry, event.clientX, event.clientY);
      };
      const openContextMenuFromKeyboard = (event, entry) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault();
        event.stopPropagation();
        if (!isSelected(entry)) {
          anchorRef.current = refOfEntry(entry);
          onSetSelection([refOfEntry(entry)], refOfEntry(entry));
        }
        const rect = event.currentTarget.getBoundingClientRect();
        showContextMenu(entry, rect.left + 12, rect.top + 24);
      };
      const marqueeRect = (box) => ({
        left: Math.min(box.x1, box.x2),
        top: Math.min(box.y1, box.y2),
        width: Math.abs(box.x2 - box.x1),
        height: Math.abs(box.y2 - box.y1),
      });
      const beginMarquee = (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.dsd-asset-cardwrap, button, input, .dsd-popover, .dsd-contextmenu')) return;
        const scroll = scrollRef.current;
        if (scroll === null) return;
        const additive = event.metaKey || event.ctrlKey || event.shiftKey;
        setMarquee({ x1: event.clientX, y1: event.clientY, x2: event.clientX, y2: event.clientY, additive });
        try { scroll.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
      };
      const moveMarquee = (event) => {
        if (marquee === null) return;
        setMarquee({ ...marquee, x2: event.clientX, y2: event.clientY });
      };
      const finishMarquee = (event) => {
        if (marquee === null) return;
        const box = marqueeRect(marquee);
        const scroll = scrollRef.current;
        const hits = [];
        if (scroll !== null) {
          for (const element of scroll.querySelectorAll('[data-entry-key]')) {
            const rect = element.getBoundingClientRect();
            if (rect.bottom < box.top || rect.top > box.bottom || rect.right < box.left || rect.left > box.right) continue;
            const key = element.getAttribute('data-entry-key');
            const entry = visible.find((item) => item.key === key);
            if (entry !== undefined) hits.push(refOfEntry(entry));
          }
        }
        const tiny = box.width < 4 && box.height < 4;
        let next = marquee.additive ? [...selectedRefs] : [];
        if (!tiny) next = mergeRefs(next, hits);
        if (tiny && !marquee.additive) next = [];
        anchorRef.current = next.length > 0 ? next[next.length - 1] : null;
        onSetSelection(next, next.length > 0 ? next[next.length - 1] : null);
        setMarquee(null);
        try { scroll?.releasePointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
      };
      const onPanelKeyDown = (event) => {
        if (event.defaultPrevented) return;
        const target = event.target;
        if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          toggleSelectAll();
          return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (selectedRefs.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          requestDeleteSelection();
          return;
        }
        if (event.key === 'Escape' && selectedRefs.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          anchorRef.current = null;
          onSetSelection([], null);
        }
      };
      return h(
        'aside',
        {
          className: 'dsd-assets dsd-panel',
          'aria-label': t('assets.title'),
          'data-asset-selection': String(selectedRefs.length),
          onKeyDown: onPanelKeyDown,
          onDragOver: (event) => {
            const types = [...(event.dataTransfer?.types ?? [])];
            if (types.includes('Files') || types.includes('application/x-dsh-file') || types.includes(CONVERSATION_FILE_MIME)
              || getActiveConversationFileDrag() !== null) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setFileOver(true);
            }
          },
          onDragLeave: (event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFileOver(false);
          },
          onDrop: (event) => {
            const types = [...(event.dataTransfer?.types ?? [])];
            const conversationFile = readConversationFileDrag(event.dataTransfer) ?? getActiveConversationFileDrag();
            if (!types.includes('Files') && !types.includes('application/x-dsh-file') && conversationFile === null) return;
            event.preventDefault();
            event.stopPropagation();
            setFileOver(false);
            if (conversationFile !== null) {
              endConversationFileDrag();
              if (typeof onImportConversationObject === 'function') onImportConversationObject(conversationFile);
              return;
            }
            if (types.includes('application/x-dsh-file')) {
              const file = fileDrag?.read?.(event.dataTransfer);
              if (file instanceof File) {
                handleFiles([file]);
                return;
              }
            }
            if (types.includes('Files')) handleFiles([...event.dataTransfer.files]);
          },
        },
        fileOver ? h('div', { className: 'dsd-dropmask' }, h(Icon, { name: 'import', size: 16 }), t('assets.drop')) : null,
        h('div', { className: 'dsd-panelhead' },
          h('div', null,
            h('h2', { className: 'dsd-paneltitle' }, t('assets.title'))),
          h('div', { className: 'dsd-assetactions' },
            h('button', {
              type: 'button',
              className: 'dsd-assetaction',
              disabled: visible.length === 0,
              title: allVisibleSelected ? t('assets.deselectAll') : t('assets.selectAll'),
              'aria-label': allVisibleSelected ? t('assets.deselectAll') : t('assets.selectAll'),
              onClick: toggleSelectAll,
            }, h(Icon, { name: 'check', size: 12 }), h('span', null, allVisibleSelected ? t('assets.deselectAll') : t('assets.selectAll'))),
            h('button', {
              type: 'button',
              className: 'dsd-assetaction is-danger',
              disabled: selectedRefs.length === 0,
              title: selectedRefs.length > 0 ? t('assets.deleteSelection') : t('assets.delete'),
              'aria-label': selectedRefs.length > 0 ? t('assets.deleteSelection') : t('assets.delete'),
              onClick: requestDeleteSelection,
            }, h(Icon, { name: 'trash', size: 12 }), selectedRefs.length > 0 ? h('span', null, String(selectedRefs.length)) : null))),
        h('label', { className: 'dsd-search' },
          h(Icon, { name: 'search', size: 13 }),
          h('input', {
            type: 'search',
            value: query,
            placeholder: t('assets.searchPlaceholder'),
            'aria-label': t('assets.searchPlaceholder'),
            onChange: (event) => setQuery(event.target.value),
          })),
        h('div', { className: 'dsd-filterwrap', ref: filterRef },
          h('button', {
            type: 'button',
            ref: filterTriggerRef,
            className: 'dsd-filterbtn',
            'aria-haspopup': 'listbox',
            'aria-expanded': filterOpen,
            'aria-label': `${t('assets.filterLabel')}: ${t(activeFilter.labelKey)} (${counts[filter] ?? 0})`,
            title: t('assets.filterLabel'),
            onClick: () => setFilterOpen((value) => !value),
            onKeyDown: onFilterKeyDown,
          },
          h(Icon, { name: activeFilter.icon, size: 14, className: 'dsd-filtericon' }),
          h('span', { className: 'dsd-filterlabel' }, t(activeFilter.labelKey)),
          h('span', { className: 'dsd-filtercount' }, String(counts[filter] ?? 0)),
          h(Icon, { name: 'chevronDown', size: 12, className: 'dsd-filterchev' })),
          filterOpen ? h('div', { className: 'dsd-popover dsd-asset-filter-popover', role: 'listbox', 'aria-label': t('assets.filterLabel'), onKeyDown: onFilterKeyDown },
            ASSET_FILTERS.map((item) => h('button', {
              type: 'button',
              key: item.id,
              role: 'option',
              'aria-selected': filter === item.id,
              className: cx('dsd-filteritem', filter === item.id && 'is-selected'),
              onClick: () => {
                setFilter(item.id);
                setFilterOpen(false);
              },
            },
            h(Icon, { name: item.icon, size: 14, className: 'dsd-filteritem-icon' }),
            h('span', { className: 'dsd-filteritem-label' }, t(item.labelKey)),
            h('span', { className: 'dsd-filteritem-count' }, String(counts[item.id] ?? 0)),
            filter === item.id ? h(Icon, { name: 'check', size: 12, className: 'dsd-filteritem-check' }) : null))) : null),
        h('div', {
          className: cx('dsd-asset-scroll', marquee !== null && 'is-marquee'),
          ref: scrollRef,
          onPointerDown: beginMarquee,
          onPointerMove: moveMarquee,
          onPointerUp: finishMarquee,
          onPointerCancel: () => setMarquee(null),
        },
          h('div', { className: 'dsd-gallery' },
              visible.map((entry) => {
                if (entry.type === 'generation') {
                  const generation = entry.generation;
                  const duration = sequenceDuration(generation.spec);
                  const draggable = true;
                  return h('div', { className: 'dsd-asset-cardwrap', key: entry.key, 'data-entry-key': entry.key },
                    h('button', {
                      type: 'button',
                      draggable,
                      className: cx('dsd-asset-card', isSelected(entry) && 'is-selected'),
                      'aria-pressed': isSelected(entry),
                      title: generation.title,
                      onClick: (event) => handleCardSelect(event, entry),
                      onContextMenu: (event) => openContextMenu(event, entry),
                      onKeyDown: (event) => openContextMenuFromKeyboard(event, entry),
                      onDragStart: (event) => {
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('application/x-deepseek-design', JSON.stringify({ type: 'generation', id: generation.id }));
                        event.dataTransfer.setData('text/plain', generation.title);
                      },
                    },
                    h('div', { className: 'dsd-asset-thumb' },
                      h(ScenePoster, { spec: generation.spec, sceneIndex: 0 }),
                      h('span', { className: 'dsd-thumb-tint' }),
                      h('span', { className: 'dsd-asset-badge ' + (generation.status === 'draft' ? 'is-draft' : 'is-applied') }, generation.status === 'draft' ? t('assets.draft') : t('assets.applied')),
                      h('span', { className: 'dsd-asset-duration' }, formatDuration(duration))),
                    h('div', { className: 'dsd-asset-meta' },
                      h('span', { className: 'dsd-asset-name' }, generation.title),
                      h('span', { className: 'dsd-asset-kind' },
                        h('span', null, `${generation.spec.scenes.length} ${t('assets.scenes')}`),
                        h('span', null, generation.source === 'local' ? t('chat.localSource') : 'AI')))),
                    h('button', {
                      type: 'button',
                      className: 'dsd-asset-delete',
                      title: t('assets.delete'),
                      'aria-label': `${t('assets.delete')}: ${generation.title}`,
                      onClick: (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        requestDeleteEntry(entry);
                      },
                    }, h(Icon, { name: 'trash', size: 12 })));
                }
                const asset = entry.asset;
                const canDrag = asset.missing !== true;
                const showImage = (asset.kind === 'image' || asset.kind === 'video') && !asset.missing;
                const imageSrc = asset.kind === 'video' ? asset.posterUrl : asset.objectUrl;
                return h('div', { className: 'dsd-asset-cardwrap', key: entry.key, 'data-entry-key': entry.key },
                  h('button', {
                    type: 'button',
                    draggable: canDrag,
                    className: cx('dsd-asset-card', isSelected(entry) && 'is-selected'),
                    'aria-pressed': isSelected(entry),
                    title: asset.name,
                    onClick: (event) => handleCardSelect(event, entry),
                    onContextMenu: (event) => openContextMenu(event, entry),
                    onKeyDown: (event) => openContextMenuFromKeyboard(event, entry),
                    onDragStart: canDrag ? (event) => {
                      beginAssetDrag({ id: asset.id, kind: asset.kind, name: asset.name });
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData('application/x-deepseek-design', JSON.stringify({ type: 'asset', id: asset.id }));
                      event.dataTransfer.setData('text/plain', asset.name);
                    } : undefined,
                    onDragEnd: canDrag ? endAssetDrag : undefined,
                  },
                  h('div', { className: cx('dsd-asset-thumb', asset.kind === 'audio' && 'dsd-audio-thumb') },
                    asset.kind === 'audio'
                      ? h(Waveform, { peaks: asset.peaks, seed: hashString(asset.id), className: 'dsd-mini-wave' })
                      : showImage && imageSrc
                        ? h('img', { src: imageSrc, alt: '', draggable: false })
                        : h('div', { className: 'dsd-missing-thumb' }, h(Icon, { name: asset.kind === 'video' ? 'video' : 'image', size: 18 })),
                    h('span', { className: 'dsd-thumb-tint' }),
                    asset.kind !== 'image' && asset.duration > 0 ? h('span', { className: 'dsd-asset-duration' }, formatDuration(asset.duration)) : null),
                  h('div', { className: 'dsd-asset-meta' },
                    h('span', { className: 'dsd-asset-name' }, asset.name),
                    h('span', { className: 'dsd-asset-kind' },
                      h('span', null, asset.kind === 'audio' ? t('media.audioRef') : asset.kind === 'image' ? t('media.imageRef') : t('media.videoRef')),
                      h('span', null, asset.missing ? t('assets.missing') : asset.source === 'conversation' ? t('assets.sourceConversation') : asset.source === 'export' ? t('assets.sourceExport') : '')))),
                  h('button', {
                    type: 'button',
                    className: 'dsd-asset-delete',
                    title: t('assets.delete'),
                    'aria-label': `${t('assets.delete')}: ${asset.name}`,
                    onClick: (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      requestDeleteEntry(entry);
                    },
                  }, h(Icon, { name: 'trash', size: 12 })));

              }))),
        marquee !== null
          ? h('div', {
            className: 'dsd-asset-marquee',
            'aria-hidden': 'true',
            style: {
              left: marqueeRect(marquee).left,
              top: marqueeRect(marquee).top,
              width: marqueeRect(marquee).width,
              height: marqueeRect(marquee).height,
            },
          })
          : null,
        contextMenu !== null
          ? h('div', {
            ref: contextMenuRef,
            className: 'dsd-contextmenu',
            role: 'menu',
            'aria-label': t('assets.contextMenu'),
            style: { left: contextMenu.x, top: contextMenu.y },
          },
          h('div', { className: 'dsd-contextmeta' }, contextMenu.targets.length > 1
            ? t('assets.selectionCount').replace('{count}', String(contextMenu.targets.length))
            : entryName(contextMenu.entry)),
          h('button', {
            type: 'button',
            role: 'menuitem',
            className: 'dsd-contextitem is-danger',
            onClick: () => confirmDelete(contextMenu.targets),
          }, h(Icon, { name: 'trash', size: 13 }), contextMenu.targets.length > 1
            ? t('assets.deleteSelectedCount').replace('{count}', String(contextMenu.targets.length))
            : t('assets.delete')))
          : null,
        state.import.error.length > 0 && !state.import.busy
          ? h('div', { className: 'dsd-import-notice', role: 'status' },
            h(Icon, { name: 'alert', size: 13 }),
            h('span', { title: state.import.error }, state.import.error.split('\n')[0]),
            h('button', { type: 'button', 'aria-label': t('actions.close'), onClick: onClearImportError }, h(Icon, { name: 'close', size: 12 })))
          : null,
        h('div', { className: 'dsd-asset-foot' },
          h('button', { type: 'button', className: 'dsd-importbtn', onClick: () => onImport() },
            h(Icon, { name: 'import', size: 14 }),
            t('actions.import'))),
        state.import.busy
          ? h('div', { className: 'dsd-importbusy', role: 'status' },
            h(Icon, { name: 'spinner', size: 14, className: 'dsd-spin' }),
            `${t('assets.importing')} · ${state.import.done}/${state.import.total}`)
          : null,
      );
    }

    // @@UI_MORE2
    function seekTimelineVideo(element, localTime) {
      if (element === null || element === undefined) return;
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      const target = Math.min(Math.max(0, Number(localTime) || 0), Math.max(0, element.duration - 0.02));
      if (Math.abs(element.currentTime - target) > 0.28) {
        try { element.currentTime = target; } catch { /* Not seekable yet. */ }
      }
    }

    function TimelineVideoLayer({ timeline, assets, time, playing }) {
      const videoRef = useRef(null);
      const active = trackClips(timeline, 'video')
        .filter((clip) => clip.kind === 'asset' && time >= clip.start - 1e-6 && time < clipEnd(clip))
        .sort((a, b) => a.start - b.start)
        .pop();
      const asset = active === undefined ? undefined : assets.find((item) => item.id === active.assetId);
      const localTime = active === undefined
        ? 0
        : Math.max(0, (Number(active.sourceIn) || 0) + (time - active.start));
      const seekToCurrentTime = (element) => {
        seekTimelineVideo(element, localTime);
        if (playing) element.play().catch(() => {});
      };
      useEffect(() => {
        const element = videoRef.current;
        if (element === null || active === undefined) return;
        seekTimelineVideo(element, localTime);
        if (playing) element.play().catch(() => {});
        else element.pause();
      }, [playing, time, active]);
      if (active === undefined || asset === undefined) return null;
      if (typeof asset.objectUrl !== 'string' || asset.objectUrl.length === 0) {
        return asset.posterUrl
          ? h('img', { className: 'dsd-timeline-video', src: asset.posterUrl, alt: '', draggable: false })
          : null;
      }
      return h('video', {
        key: `${active.id}:${asset.id}`,
        ref: videoRef,
        className: 'dsd-timeline-video',
        src: asset.objectUrl,
        poster: asset.posterUrl ?? undefined,
        muted: true,
        playsInline: true,
        preload: 'auto',
        tabIndex: -1,
        'aria-hidden': 'true',
        // A freshly mounted <video> reports duration === NaN, so the mount-time
        // seek above is skipped; retry it once metadata is known instead of
        // waiting for a playhead/dependency change that may never happen.
        onLoadedMetadata: (event) => seekToCurrentTime(event.currentTarget),
        onCanPlay: (event) => seekToCurrentTime(event.currentTarget),
      });
    }

    function PreviewPanel({
      t,
      state,
      previewMode,
      timeline,
      assets,
      canvasRef,
      selectedGeneration,
      selectedUpload,
      activeDuration,
      displayTime,
      playing,
      canPlay,
      onTogglePlay,
      onSeek,
      volume,
      muted,
      onVolume,
      onMuted,
      expanded,
      onExpand,
      onDescribe,
      onImport,
      onAspect,
    }) {
      const stageRef = useRef(null);
      const mediaRef = useRef(null);
      const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
      const [ratioOpen, setRatioOpen] = useState(false);
      const ratioRef = useRef(null);
      const ratioTriggerRef = useRef(null);
      const aspectId = state.project.aspect;
      const timelineClips = clipsOfTimeline(state.timeline);
      const timelineHasClips = timelineClips.length > 0;
      const timelineHasVideo = hasVideo(state.timeline);
      let source = 'empty';
      if (previewMode === 'timeline') {
        if (timelineHasVideo) source = 'timeline';
        else if (timelineHasClips) source = 'audio';
      } else if (selectedGeneration !== null) {
        source = 'generation';
      } else if (selectedUpload !== null) {
        source = selectedUpload.missing ? 'missing' : selectedUpload.kind;
      }
      useDismissible(ratioRef, ratioOpen, useCallback(() => setRatioOpen(false), []));
      useFocusReturn(ratioOpen, ratioTriggerRef);
      // `volume` is not a React DOM property: the preview <video>/<audio> elements
      // must receive it through the DOM node, otherwise the volume control is a
      // no-op (K-03 / 0.9.5 A-3).
      useEffect(() => {
        const element = mediaRef.current;
        if (element === null || element === undefined) return;
        try {
          element.volume = clamp(Number(volume), 0, 1);
          element.muted = muted === true;
        } catch {
          // The media element may have been replaced between renders.
        }
      }, [volume, muted, previewMode, selectedUpload?.objectUrl]);
      useLayoutEffect(() => {
        const element = stageRef.current;
        if (element === null) return undefined;
        const measure = () => {
          const rect = element.getBoundingClientRect();
          setStageSize({ width: rect.width, height: rect.height });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
      }, []);
      const frame = frameFits(stageSize.width || 800, stageSize.height || 450, aspectId, 0);
      const frameReady = stageSize.width > 20 && stageSize.height > 20;
      const currentAspect = ASPECT_BY_ID.get(aspectId) ?? ASPECTS[0];
      const activeLabel = previewMode === 'timeline'
        ? t('preview.tab.timeline')
        : selectedGeneration !== null
          ? selectedGeneration.title
          : selectedUpload !== null
            ? selectedUpload.name
            : t('preview.assetEmpty');
      const renderEmpty = () => {
        const isAssetEmpty = previewMode === 'asset';
        const title = source === 'missing'
          ? t('assets.missing')
          : source === 'audio'
            ? t('preview.noPicture')
            : isAssetEmpty
              ? t('preview.assetEmpty')
              : t('preview.emptyTitle');
        const body = source === 'missing'
          ? ''
          : source === 'audio'
            ? t('preview.audioOnly')
            : isAssetEmpty
              ? t('preview.emptyBody')
              : t('preview.emptyBody');
        return h('div', { className: 'dsd-stage-empty' },
          h('div', { className: 'dsd-empty-orb' }, h(Icon, { name: source === 'audio' ? 'audio' : 'sparkles', size: 18 })),
          h('div', { className: 'dsd-empty-title' }, title),
          body.length > 0 ? h('div', { className: 'dsd-empty-body' }, body) : null,
          !isAssetEmpty && source !== 'missing'
            ? h('div', { className: 'dsd-empty-actions' },
              h('button', { type: 'button', className: 'dsd-primary', onClick: onDescribe }, h(Icon, { name: 'sparkles', size: 13 }), t('preview.describe')),
              h('button', { type: 'button', className: 'dsd-softbtn', onClick: () => onImport() }, h(Icon, { name: 'import', size: 13 }), t('preview.import')))
            : null);
      };
      const renderFrameContent = () => {
        if (source === 'timeline' || source === 'generation') {
          return [
            h('canvas', {
              key: 'canvas',
              ref: canvasRef,
              className: 'dsd-preview-canvas',
              role: 'img',
              'aria-label': activeLabel,
            }),
            previewMode === 'timeline'
              ? h(TimelineVideoLayer, { key: 'timeline-video', timeline, assets, time: displayTime, playing })
              : null,
          ];
        }
        if (source === 'image') {
          return h('img', {
            className: 'dsd-native-media',
            src: selectedUpload?.objectUrl ?? '',
            alt: selectedUpload?.name ?? t('media.imageRef'),
            draggable: false,
          });
        }
        if (source === 'video') {
          return h('video', {
            key: selectedUpload?.objectUrl ?? 'video',
            ref: mediaRef,
            className: 'dsd-native-media',
            src: selectedUpload?.objectUrl ?? '',
            poster: selectedUpload?.posterUrl ?? undefined,
            controls: true,
            playsInline: true,
            preload: 'metadata',
          });
        }
        if (source === 'audio' && selectedUpload !== null) {
          return h('div', { className: 'dsd-audio-stage' },
            h(Waveform, {
              peaks: selectedUpload.peaks,
              seed: hashString(selectedUpload.id),
              className: 'dsd-audio-bigwave',
            }),
            h('audio', { ref: mediaRef, controls: true, src: selectedUpload.objectUrl ?? '' }),
            h('div', { className: 'dsd-empty-body' }, selectedUpload.name));
        }
        return null;
      };
      const showEmpty = source === 'empty' || source === 'missing' || (source === 'audio' && previewMode === 'timeline') || (source === 'audio' && selectedUpload === null);
      const frameContent = !showEmpty ? renderFrameContent() : null;
      return h(
        'section',
        { className: 'dsd-preview', 'aria-label': t('preview.panel') },
        h('div', { className: 'dsd-previewhead' },
          h('div', { className: 'dsd-previewtools' },
            h('div', { ref: ratioRef, style: { position: 'relative' } },
              h('button', {
                ref: ratioTriggerRef,
                type: 'button',
                className: 'dsd-ratio-btn',
                'aria-haspopup': 'menu',
                'aria-expanded': ratioOpen,
                onClick: () => setRatioOpen((value) => !value),
              }, currentAspect.label, h(Icon, { name: 'chevronDown', size: 11 })),
              ratioOpen ? h('div', { className: 'dsd-popover dsd-ratio-popover', role: 'menu' },
                h('div', { className: 'dsd-popover-header' }, h('span', { className: 'dsd-popover-title' }, t('preview.aspect'))),
                ASPECTS.map((aspect) => h('button', {
                  type: 'button',
                  key: aspect.id,
                  role: 'menuitemradio',
                  'aria-checked': aspect.id === aspectId,
                  className: cx('dsd-ratio-option', aspect.id === aspectId && 'is-current'),
                  onClick: () => {
                    onAspect(aspect.id);
                    setRatioOpen(false);
                  },
                },
                h('span', { className: 'mono' }, aspect.label),
                h('span', null, t(aspect.nameKey)),
                aspect.id === aspectId ? h(Icon, { name: 'check', size: 12 }) : null))) : null),
            h('button', {
              type: 'button',
              className: 'dsd-iconbtn',
              'aria-label': expanded ? t('preview.collapse') : t('preview.expand'),
              title: expanded ? t('preview.collapse') : t('preview.expand'),
              onClick: onExpand,
            }, h(Icon, { name: expanded ? 'collapse' : 'expand', size: 15 })))),
        h('div', { className: 'dsd-stage', ref: stageRef },
          h('div', { className: 'dsd-stage-inner' },
            showEmpty
              ? renderEmpty()
              : h('div', {
                className: 'dsd-frame',
                style: {
                  width: frame.width,
                  height: frame.height,
                  visibility: frameReady ? 'visible' : 'hidden',
                },
                'aria-hidden': frameReady ? undefined : 'true',
              },
              frameContent,
              source === 'generation' && selectedGeneration !== null
                ? h('div', { className: 'dsd-frame-caption' }, h(Icon, { name: 'sparkles', size: 10 }), selectedGeneration.title)
                : null))),
        h('div', { className: 'dsd-transportrow' },
          h('div', { className: 'dsd-transportmeta' },
            h(Icon, { name: previewMode === 'timeline' ? 'video' : 'sparkles', size: 12 }),
            h('span', { className: 'dsd-transportmeta-label' }, activeLabel)),
          h('div', { className: 'dsd-transportcenter' },
            h('div', { className: 'dsd-transportpill' },
              h('button', {
                type: 'button',
                className: 'dsd-transportbtn',
                disabled: !canPlay || activeDuration <= 0,
                'aria-label': t('transport.start'),
                title: t('transport.start'),
                onClick: () => onSeek(0),
              }, h(Icon, { name: 'rewind', size: 13 })),
              h('button', {
                type: 'button',
                className: 'dsd-transportbtn is-play',
                disabled: !canPlay || activeDuration <= 0,
                'aria-label': playing ? t('transport.pause') : t('transport.play'),
                title: playing ? t('transport.pause') : t('transport.play'),
                onClick: onTogglePlay,
              }, h(Icon, { name: playing ? 'pause' : 'play', size: 14 })),
              h('button', {
                type: 'button',
                className: 'dsd-transportbtn',
                disabled: !canPlay || activeDuration <= 0,
                'aria-label': t('transport.end'),
                title: t('transport.end'),
                onClick: () => onSeek(activeDuration),
              }, h(Icon, { name: 'forward', size: 13 })),
              h('div', { className: 'dsd-transporttime', 'aria-live': 'off' },
                h('strong', null, formatTimecode(displayTime)),
                h('span', null, '/'),
                h('span', null, formatTimecode(activeDuration)))),
            h('div', { className: 'dsd-transportright' },
              h('button', {
                type: 'button',
                className: 'dsd-volumebtn',
                'aria-label': muted ? t('transport.unmute') : t('transport.mute'),
                title: muted ? t('transport.unmute') : t('transport.mute'),
                onClick: onMuted,
              }, h(Icon, { name: muted ? 'mute' : 'volume', size: 14 })),
              h('input', {
                type: 'range',
                className: 'dsd-range dsd-volume-range',
                min: 0,
                max: 1,
                step: 0.01,
                value: muted ? 0 : volume,
                'aria-label': t('transport.volume'),
                onChange: (event) => onVolume(Number(event.target.value)),
              })))),
      );
    }
    // @@UI_MORE3

    function ModelMenu({ t, state, onSelect, onSelectEffort, onClose, onRetry, returnFocusRef }) {
      useFocusReturn(true, returnFocusRef);
      const [pane, setPane] = useState('models');
      const paneTouchedRef = useRef(false);
      const modelListRef = useRef(null);
      const effortListRef = useRef(null);
      useEffect(() => {
        if (!paneTouchedRef.current) {
          paneTouchedRef.current = true;
          return;
        }
        const list = pane === 'effort' ? effortListRef.current : modelListRef.current;
        const target = list?.querySelector('button.is-current') ?? list?.querySelector('button');
        if (target !== undefined && target !== null) target.focus({ preventScroll: true });
      }, [pane]);
      if (state.models.status === 'loading' || state.models.status === 'idle') {
        return h('div', { className: 'dsd-popover dsd-models-popover', role: 'dialog', 'aria-label': t('chat.modelTitle') },
          h('div', { className: 'dsd-popover-header' }, h('span', { className: 'dsd-popover-title' }, t('chat.modelTitle'))),
          h('div', { className: 'dsd-models-state' }, h(Icon, { name: 'spinner', size: 13, className: 'dsd-spin' }), ` ${t('model.loading')}`));
      }
      if (state.models.status === 'error') {
        return h('div', { className: 'dsd-popover dsd-models-popover', role: 'dialog', 'aria-label': t('chat.modelTitle') },
          h('div', { className: 'dsd-popover-header' }, h('span', { className: 'dsd-popover-title' }, t('chat.modelTitle'))),
          h('div', { className: 'dsd-models-state' }, state.models.error,
            h('div', null, h('button', { type: 'button', className: 'dsd-softbtn', onClick: () => { onClose(); onRetry(); } }, t('actions.retry')))));
      }
      const byProvider = new Map();
      for (const item of state.models.items) {
        if (!byProvider.has(item.provider)) byProvider.set(item.provider, { name: item.providerName, items: [] });
        byProvider.get(item.provider).items.push(item);
      }
      const providerRank = (providerId) => providerId === 'deepseek-account' ? 0 : providerId === 'deepseek-official' ? 1 : 2;
      const groups = [...byProvider.keys()].sort((left, right) => providerRank(left) - providerRank(right));
      const active = precedenceModel(state);
      const activeItem = active === null
        ? undefined
        : state.models.items.find((item) => item.provider === active.provider && item.id === active.model);
      const reasoning = activeItem?.reasoning ?? active?.reasoning ?? null;
      const effortLabel = reasoning === null ? '' : reasoningEffortLabel(reasoning, active?.reasoningEffort, t);
      const effortChoices = reasoning === null
        ? []
        : [
          ...(reasoning.defaultEffort === undefined ? [{ id: undefined, key: 'default', label: t('model.default') }] : []),
          ...reasoning.efforts.map((effort) => ({ id: effort.id, key: effort.id, label: effort.name })),
        ];
      if (pane === 'effort') {
        return h('div', { className: 'dsd-popover dsd-models-popover', role: 'dialog', 'aria-label': t('model.reasoning') },
          h('div', { className: 'dsd-popover-header' },
            h('div', { className: 'dsd-models-head' },
              h('button', {
                type: 'button',
                className: 'dsd-models-back',
                'aria-label': t('model.back'),
                onClick: () => setPane('models'),
              }, h(Icon, { name: 'chevronLeft', size: 13 })),
              h('span', { className: 'dsd-popover-title' }, t('model.reasoning'))),
            h('span', { className: 'dsd-models-current' }, effortLabel)),
          h('div', { className: 'dsd-models-list', ref: effortListRef, role: 'listbox', 'aria-label': t('model.reasoning') },
            effortChoices.length === 0
              ? h('div', { className: 'dsd-models-empty' }, t('model.default'))
              : effortChoices.map((level) => {
                const selected = level.id === normalizeReasoningEffort(reasoning, active?.reasoningEffort);
                return h('button', {
                  type: 'button',
                  key: level.key,
                  role: 'option',
                  'aria-selected': selected,
                  className: cx('dsd-menu-row', 'dsd-effort-row', selected && 'is-current'),
                  title: level.label,
                  onClick: () => onSelectEffort(level.id),
                },
                h('span', { className: 'dsd-menu-name' }, level.label),
                selected ? h(Icon, { name: 'check', size: 13, className: 'dsd-menu-check' }) : null);
              })));
      }
      return h('div', { className: 'dsd-popover dsd-models-popover', role: 'dialog', 'aria-label': t('chat.modelTitle') },
        h('div', { className: 'dsd-popover-header' },
          h('span', { className: 'dsd-popover-title' }, t('chat.modelTitle')),
          reasoning === null
            ? null
            : h('button', {
              type: 'button',
              className: 'dsd-models-effortbtn',
              'aria-label': `${t('model.reasoning')}: ${effortLabel}`,
              title: `${t('model.reasoning')}: ${effortLabel}`,
              onClick: () => setPane('effort'),
            },
            h('span', null, t('model.reasoning')),
            h('span', { className: 'dsd-models-effortval' }, effortLabel),
            h(Icon, { name: 'chevronRight', size: 10 }))),
        h('div', { className: 'dsd-models-list', ref: modelListRef, role: 'listbox', 'aria-label': t('chat.modelTitle') },
          groups.map((providerId) => {
            const group = byProvider.get(providerId);
            return h('div', { className: 'dsd-menu-group', key: providerId },
              h('div', { className: 'dsd-menu-label' }, group.name),
              group.items.map((item) => {
                const selected = active?.provider === item.provider && active?.model === item.id;
                return h('button', {
                  type: 'button',
                  key: `${item.provider}/${item.id}`,
                  role: 'option',
                  'aria-selected': selected,
                  className: cx('dsd-menu-row', 'dsd-model-row', selected && 'is-current'),
                  title: item.name,
                  onClick: () => onSelect(item),
                },
                h('span', { className: 'dsd-menu-name' }, item.name),
                selected ? h(Icon, { name: 'check', size: 13, className: 'dsd-menu-check' }) : null);
              }));
          })));
    }



    function toolArgText(block, name) {
      try {
        const value = block?.args?.text(name);
        return typeof value === 'string' ? value : '';
      } catch {
        return '';
      }
    }

    function toolArgValue(block, name) {
      try {
        return block?.args?.value(name);
      } catch {
        return undefined;
      }
    }

    function toolResultText(block) {
      if (!Array.isArray(block?.content)) return '';
      return block.content
        .filter((item) => item !== null && item !== undefined && item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
        .trim();
    }

    function DesignChatHeaderButton({ t, onClick }) {
      return h('button', {
        type: 'button',
        className: 'dsd-chat-headerbtn',
        title: t('session.openWorkbench'),
        'aria-label': t('session.openWorkbench'),
        onClick,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 24,
          padding: '0 8px',
          borderRadius: 7,
          border: '0.5px solid rgba(127, 127, 127, 0.28)',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          fontSize: 11,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        },
      }, h(Icon, { name: 'sparkles', size: 13 }), h('span', null, t('session.openWorkbench')));
    }

    function DesignConversationPanel({ sessionId, useSession, renderFactorySlot, store }) {
      const session = useSession((snapshot) => snapshot);
      const blank = session === undefined || session.blank === true;
      const settling = session?.openState === 'loading';
      const phase = settling ? 'settling' : blank ? 'hero' : 'active';
      const resolvedSessionId = typeof sessionId === 'string' && sessionId.length > 0
        ? sessionId
        : typeof session?.sessionId === 'string' && session.sessionId.length > 0
          ? session.sessionId
          : null;
      useEffect(() => {
        if (store === null || store === undefined || typeof store.setActiveSession !== 'function') return undefined;
        store.setActiveSession(resolvedSessionId);
        return () => {
          store.setActiveSession(null);
        };
      }, [store, resolvedSessionId]);
      return h('div', { className: 'dsd-chat-factory' },
        renderFactorySlot('conversation.content', {
          variant: 'embedded',
          phase,
          hero: blank,
        }));
    }

    function WorkbenchLauncher({ ctx }) {
      useEffect(() => {
        setDesignOverlay(true);
        return () => {
          // Leaving the main panel must not leave the overlay mounted over a
          // different panel; only the overlay state is cleared here (the panel
          // selection itself is owned by the caller) (K-05 / 0.9.5 A-5).
          setDesignOverlay(false);
        };
      }, [ctx]);
      return h('div', { className: 'dsd-launcher', 'aria-hidden': 'true' });
    }

    function WorkbenchOverlay({ ctx, store, fileDrag, renderSlot, SessionProvider }) {
      const open = useSyncExternalStore(subscribeDesignOverlay, getDesignOverlaySnapshot, getDesignOverlaySnapshot);
      if (!open) return null;
      const chatPanel = renderSlot(DESIGN_CHAT_SLOT, {});
      const workbench = h(Workbench, {
        ctx,
        store,
        chatPanel,
        fileDrag,
        onCloseWorkbench: () => closeDesignOverlay(ctx),
      });
      const frame = h('div', { className: 'dsd-overlay-frame' },
        typeof SessionProvider === 'function' ? h(SessionProvider, null, workbench) : workbench);
      if (typeof createPortal === 'function' && typeof document !== 'undefined' && document.body !== null) {
        return createPortal(frame, document.body);
      }
      return frame;
    }

    function ExportVideoToolRow({ phase, block, callId, t: translate, ctx, sessionId, cwd }) {
      const t = useMemo(() => {
        if (typeof translate === 'function') return translate;
        try {
          if (ctx?.locale !== undefined && typeof ctx.locale.bind === 'function') return ctx.locale.bind(NS);
        } catch {
          // Fall back to readable keys if the locale registry is unavailable.
        }
        return (key) => key;
      }, [translate, ctx]);
      const localKeyRef = useRef(`local:${Date.now()}:${Math.random().toString(36).slice(2)}`);
      const jobKey = typeof callId === 'string' && callId.length > 0 ? callId : localKeyRef.current;
      const readJob = useCallback(() => exportJobFor(jobKey), [jobKey]);
      const job = useSyncExternalStore(subscribeExportJobs, readJob, readJob);
      const ownerRef = useRef(`owner:${Date.now()}:${Math.random().toString(36).slice(2)}`);
      const [title, setTitle] = useState('');
      const [duration, setDuration] = useState(0);
      const startedRef = useRef(false);
      const mountedRef = useRef(true);
      const controllerRef = useRef(null);
      const openWorkbench = useCallback(() => {
        const layout = ctx?.layout ?? ctx?.get?.('layout');
        if (layout !== null && layout !== undefined && typeof layout.selectPanel === 'function') {
          try { layout.selectPanel(PANEL_ID); } catch { /* The panel is already selected. */ }
        }
      }, [ctx]);
      const beginExport = useCallback(async () => {
        if (startedRef.current) return;
        startedRef.current = true;
        const existing = exportJobFor(jobKey);
        if (existing !== null && (existing.status === 'rendering' || existing.status === 'ready')) return;
        let args;
        try {
          args = validateAnimationToolArgs({
            title: toolArgText(block, 'title'),
            duration: toolArgValue(block, 'duration'),
            code: toolArgText(block, 'code'),
            aspect: toolArgText(block, 'aspect'),
            resolution: toolArgText(block, 'resolution'),
            fps: toolArgValue(block, 'fps'),
          });
        } catch (validationError) {
          setExportJob(jobKey, { status: 'error', error: validationError?.message ?? t('tool.failed'), owner: null, progress: 0 });
          return;
        }
        setTitle(args.title);
        setDuration(args.duration);
        setExportJob(jobKey, { status: 'rendering', progress: 0, error: '', asset: null, owner: ownerRef.current });
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        controllerRef.current = controller;
        try {
          const dimensions = animationDimensions(args.aspect, args.resolution);
          const result = await renderAnimationVideo({
            code: args.code,
            duration: args.duration,
            width: dimensions.width,
            height: dimensions.height,
            fps: args.fps,
            signal: controller?.signal,
            onProgress: (value) => {
              setExportJob(jobKey, { progress: clamp(value, 0, 1) });
            },
          });
          const savedAsset = await persistExportedAnimation({ callId: jobKey, args, result, sessionId, cwd });
          setExportJob(jobKey, { status: 'ready', progress: 1, error: '', asset: savedAsset, owner: null });
        } catch (renderError) {
          const current = exportJobFor(jobKey);
          // A Host-reported tool error (delta/result) is more actionable than the
          // abort rejection caused by locally cancelling the render; never let
          // the late rejection overwrite it (K-04 / 0.9.5 A-4).
          if (current !== null && current.status === 'error'
            && typeof current.error === 'string' && current.error.length > 0) return;
          setExportJob(jobKey, {
            status: renderError?.name === 'AbortError' ? 'cancelled' : 'error',
            error: renderError?.message ?? t('tool.failed'),
            owner: null,
          });
        } finally {
          controllerRef.current = null;
        }
      }, [block, jobKey, t]);
      const beginRef = useRef(beginExport);
      beginRef.current = beginExport;
      useEffect(() => {
        mountedRef.current = true;
        return () => {
          // The render belongs to the shared per-call job, not to this card: the
          // same tool call can be rendered in both the native conversation and
          // the workbench's embedded conversation. Keep it running on unmount
          // (closing the workbench) so a finished asset is not discarded; the
          // remaining card and the library pick the result up.
          mountedRef.current = false;
        };
      }, [jobKey]);
      useEffect(() => {
        if (phase !== 'preparing') {
          const nextTitle = toolArgText(block, 'title');
          const nextDuration = Number(toolArgValue(block, 'duration')) || 0;
          if (nextTitle.length > 0) setTitle(nextTitle);
          if (nextDuration > 0) setDuration(nextDuration);
        }
        if (phase === 'start') {
          beginRef.current().catch(() => {});
        }
        if (phase === 'result' && block?.isError === true) {
          startedRef.current = true;
          if (controllerRef.current !== null) {
            try { controllerRef.current.abort(); } catch { /* Already settled. */ }
            controllerRef.current = null;
          }
          setExportJob(jobKey, { status: 'error', error: toolResultText(block) || t('tool.failed'), owner: null });
        }
        if (phase === 'result' && block?.isError !== true) {
          const checkRecord = typeof callId === 'string'
            ? exportRecordGet(callId)
            : Promise.resolve(null);
          checkRecord.then((record) => {
            if (!mountedRef.current) return;
            if (record !== null) {
              startedRef.current = true;
              setExportJob(jobKey, {
                status: 'ready',
                progress: 1,
                error: '',
                owner: null,
                asset: { id: record.assetId, title: record.title ?? '', name: record.title ?? '' },
              });
              return;
            }
            const currentJob = exportJobFor(jobKey);
            if (currentJob !== null && (currentJob.status === 'rendering' || currentJob.status === 'ready')) return;
            if (currentJob !== null && (currentJob.status === 'error' || currentJob.status === 'cancelled')) return;
            if (!startedRef.current) beginRef.current().catch(() => {});
          }).catch(() => {
            const currentJob = exportJobFor(jobKey);
            if (currentJob !== null) return;
            if (!startedRef.current) beginRef.current().catch(() => {});
          });
        }
      }, [phase, callId, block, jobKey, t]);
      const retry = () => {
        startedRef.current = false;
        setExportJob(jobKey, { status: 'idle', progress: 0, error: '', asset: null, owner: null });
        beginRef.current().catch(() => {});
      };
      const status = job?.status ?? 'idle';
      const progress = job?.progress ?? 0;
      const error = job?.error ?? '';
      const rowStyle = {
        border: '1px solid rgba(127, 127, 127, 0.28)',
        borderRadius: 10,
        background: 'rgba(127, 127, 127, 0.08)',
        color: 'inherit',
        padding: '10px 12px',
        margin: '6px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        minWidth: 0,
      };
      const titleStyle = { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontWeight: 550 };
      const metaStyle = { opacity: 0.68, fontSize: 11.5, lineHeight: 1.45 };
      const buttonStyle = {
        alignSelf: 'flex-start',
        border: '1px solid rgba(127, 127, 127, 0.35)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: 7,
        padding: '5px 9px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 11.5,
      };
      const progressStyle = { height: 5, borderRadius: 999, background: 'rgba(127,127,127,.22)', overflow: 'hidden' };
      const progressFill = { height: '100%', width: `${Math.round(clamp(progress, 0, 1) * 100)}%`, background: 'currentColor', opacity: 0.65, transition: 'width 140ms linear' };
      const label = status === 'ready'
        ? t('tool.ready')
        : status === 'error'
          ? t('tool.failed')
          : status === 'cancelled'
            ? t('tool.cancelled')
            : status === 'rendering'
              ? t('tool.rendering')
              : phase === 'preparing'
                ? t('tool.exporting')
                : t('tool.pending');
      return h('div', { style: rowStyle, 'data-tool': EXPORT_VIDEO_TOOL, 'data-state': status },
        h('div', { style: titleStyle },
          h(Icon, { name: 'video', size: 14 }),
          h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title || t('tool.pending'))),
        h('div', { style: metaStyle }, `${label}${duration > 0 ? ` · ${t('tool.duration')} ${Math.round(duration)}s` : ''}`),
        status === 'rendering' ? h('div', { style: progressStyle }, h('div', { style: progressFill })) : null,
        status === 'rendering' ? h('div', { style: metaStyle }, `${Math.round(progress * 100)}%`) : null,
        error.length > 0 ? h('div', { style: { ...metaStyle, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, error) : null,
        status === 'ready'
          ? h('button', { type: 'button', style: buttonStyle, onClick: openWorkbench }, t('tool.openWorkbench'))
          : phase !== 'preparing' && (status === 'error' || status === 'cancelled')
            ? h('button', { type: 'button', style: buttonStyle, onClick: retry }, t('tool.retry'))
            : null);
    }

    // @@UI_MORE4
    function TimelinePanel({
      t,
      state,
      store,
      playing,
      previewMode,
      displayTime,
      onSeek,
      onSelectClip,
      onSelectClips,
      onDropItem,
      onAddBed,
      onSplit,
      onDelete,
      onUndo,
      onRedo,
      onPause,
    }) {
      const [zoom, setZoom] = useState(1);
      const [dropTrack, setDropTrack] = useState(null);
      const [clipDrag, setClipDrag] = useState(null);
      const [clipGhost, setClipGhost] = useState(null);
      const [marqueeStart, setMarqueeStart] = useState(null);
      const [marqueeRect, setMarqueeRect] = useState(null);
      const scrollRef = useRef(null);
      const contentRef = useRef(null);
      const generationsById = useMemo(() => new Map(state.generations.map((generation) => [generation.id, generation])), [state.generations]);
      const duration = timelineDuration(state.timeline);
      const viewDuration = Math.max(30, Math.ceil(duration / 5) * 5);
      const majorStep = viewDuration <= 30 ? 5 : viewDuration <= 90 ? 10 : Math.max(20, Math.ceil(viewDuration / 30 / 5) * 5);
      const minorStep = majorStep / 5;
      const majorTicks = useMemo(() => {
        const ticks = [];
        for (let time = 0; time <= viewDuration + 0.001; time += majorStep) ticks.push(time);
        if (ticks[ticks.length - 1] !== viewDuration) ticks.push(viewDuration);
        return ticks;
      }, [majorStep, viewDuration]);
      const minorTicks = useMemo(() => {
        const ticks = [];
        for (let time = 0; time <= viewDuration + 0.001; time += minorStep) ticks.push(time);
        return ticks;
      }, [minorStep, viewDuration]);
      const selectedClip = state.selectedClip;
      const selectedClips = Array.isArray(state.selectedClips) && state.selectedClips.length > 0
        ? state.selectedClips
        : selectedClip === null ? [] : [selectedClip];
      const selectedClipCount = selectedClips.length;
      const selectedClipExists = selectedClipCount === 1 && selectedClip !== null
        && trackClips(state.timeline, selectedClip.track).some((clip) => clip.id === selectedClip.id);
      const ghostFor = useCallback((session, clientX) => {
        const original = session.original;
        const seconds = session.laneWidth > 0
          ? ((clientX - session.startX) / session.laneWidth) * viewDuration
          : 0;
        if (session.mode === 'move') {
          const desired = clamp(original.start + seconds, 0, Math.max(0, MAX_TIMELINE_SECONDS - original.duration));
          // The commit goes through placeMovedClip (track reorder). Preview the
          // final position here too, otherwise the clip visibly jumps away from
          // the drag ghost on release (K-08 / 0.9.5 B-4).
          const trackClipsNow = trackClips(state.timeline, session.track);
          const placed = placeMovedClip(trackClipsNow, original.id, desired, desired);
          const moved = placed.find((clip) => clip.id === original.id);
          return {
            start: moved !== undefined ? moved.start : desired,
            sourceIn: original.sourceIn,
            duration: original.duration,
          };
        }
        if (session.mode === 'trim-start') {
          return clampTrim(original, 'start', original.start + seconds, {
            previousEnd: session.previousEnd,
            nextStart: session.nextStart,
          });
        }
        return clampTrim(original, 'end', clipEnd(original) + seconds, {
          previousEnd: session.previousEnd,
          nextStart: session.nextStart,
        });
      }, [state.timeline, viewDuration]);
      const beginClipDrag = (event, clip, track, mode) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onPause();
        onSelectClip({ track, id: clip.id });
        const lane = event.currentTarget.closest('.dsd-lane');
        const laneWidth = lane !== null ? lane.getBoundingClientRect().width : 1;
        const others = trackClips(state.timeline, track).filter((item) => item.id !== clip.id);
        const previousEnd = others
          .filter((item) => item.start < clip.start)
          .reduce((max, item) => Math.max(max, clipEnd(item)), 0);
        const nextStart = others
          .filter((item) => item.start >= clip.start)
          .reduce((min, item) => Math.min(min, item.start), Number.POSITIVE_INFINITY);
        setClipDrag({
          mode,
          track,
          original: { ...clip },
          startX: event.clientX,
          laneWidth,
          previousEnd,
          nextStart,
        });
        setClipGhost({ ...ghostFor({
          mode,
          track,
          original: { ...clip },
          startX: event.clientX,
          laneWidth,
          previousEnd,
          nextStart,
        }, event.clientX), clipId: clip.id, track });
      };
      useEffect(() => {
        if (clipDrag === null) return undefined;
        const cancelDrag = () => {
          setClipDrag(null);
          setClipGhost(null);
        };
        const onMove = (event) => {
          if (event.buttons === 0) {
            cancelDrag();
            return;
          }
          const visual = ghostFor(clipDrag, event.clientX);
          setClipGhost({ ...visual, clipId: clipDrag.original.id, track: clipDrag.track });
        };
        const onUp = (event) => {
          const visual = ghostFor(clipDrag, event.clientX);
          if (clipDrag.mode === 'move') {
            store.moveClip(clipDrag.original.id, clipDrag.track, visual.start);
          } else {
            store.trimClip(clipDrag.original.id, clipDrag.track, {
              start: visual.start,
              sourceIn: visual.sourceIn,
              duration: visual.duration,
            });
          }
          setClipDrag(null);
          setClipGhost(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', cancelDrag);
        window.addEventListener('blur', cancelDrag);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', cancelDrag);
          window.removeEventListener('blur', cancelDrag);
        };
      }, [clipDrag, store, ghostFor]);
      useEffect(() => {
        if (zoom > 1 && scrollRef.current !== null) {
          scrollRef.current.style.scrollLeft = Math.min(scrollRef.current.scrollLeft, scrollRef.current.scrollWidth);
        }
      }, [zoom]);
      const seekInLane = (lane, clientX) => {
        if (lane === null || lane === undefined) return;
        const rect = lane.getBoundingClientRect();
        const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
        onSeek(ratio * viewDuration);
      };
      const seekAtPointer = (event) => {
        seekInLane(event.currentTarget, event.clientX);
      };
      // Only a ruler-initiated scrub may seek on pointermove. Without this gate a
      // clip/trim drag that crosses the 27px ruler would also move the playhead
      // (K-07 / 0.9.5 B-3).
      const scrubPointerRef = useRef(null);
      const startScrub = (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('.dsd-clip')) return;
        event.preventDefault();
        scrubPointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        seekAtPointer(event);
      };
      const moveScrub = (event) => {
        if (scrubPointerRef.current !== event.pointerId || event.buttons !== 1) return;
        seekAtPointer(event);
      };
      const endScrub = (event) => {
        if (scrubPointerRef.current !== event.pointerId) return;
        scrubPointerRef.current = null;
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          // The pointer was already released.
        }
      };
      const startLaneGesture = (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('.dsd-clip, button, [role="slider"]') !== null) return;
        event.preventDefault();
        onPause();
        seekInLane(event.currentTarget, event.clientX);
        setMarqueeStart({
          x0: event.clientX,
          y0: event.clientY,
          lane: event.currentTarget,
          base: selectedClips.slice(),
          shift: event.shiftKey,
        });
        setMarqueeRect(null);
      };
      useEffect(() => {
        if (marqueeStart === null) return undefined;
        let dragging = false;
        let lastRect = null;
        const selectionRefs = (rect) => {
          const content = contentRef.current;
          if (content === null) return [];
          const found = [];
          const seen = new Set();
          for (const node of content.querySelectorAll('[data-clip-id]')) {
            const box = node.getBoundingClientRect();
            if (box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom) continue;
            const track = node.getAttribute('data-track');
            const id = node.getAttribute('data-clip-id');
            if (track === null || id === null) continue;
            const key = `${track}:${id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            found.push({ track, id });
          }
          return found;
        };
        const finish = (commit) => {
          if (commit && lastRect !== null) {
            const refs = selectionRefs(lastRect);
            const base = marqueeStart.shift ? marqueeStart.base : [];
            const seen = new Set();
            const merged = [];
            for (const ref of [...base, ...refs]) {
              const key = `${ref.track}:${ref.id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              merged.push(ref);
            }
            onSelectClips(merged);
          }
          setMarqueeStart(null);
          setMarqueeRect(null);
        };
        const onMove = (event) => {
          if (event.buttons === 0) {
            finish(false);
            return;
          }
          const x = event.clientX;
          const y = event.clientY;
          if (!dragging && Math.abs(x - marqueeStart.x0) + Math.abs(y - marqueeStart.y0) < 4) return;
          dragging = true;
          const left = Math.min(marqueeStart.x0, x);
          const top = Math.min(marqueeStart.y0, y);
          const right = Math.max(marqueeStart.x0, x);
          const bottom = Math.max(marqueeStart.y0, y);
          lastRect = { left, top, right, bottom };
          setMarqueeRect(lastRect);
          const refs = selectionRefs(lastRect);
          const base = marqueeStart.shift ? marqueeStart.base : [];
          const seen = new Set();
          const merged = [];
          for (const ref of [...base, ...refs]) {
            const key = `${ref.track}:${ref.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(ref);
          }
          onSelectClips(merged);
        };
        const onUp = () => {
          finish(dragging);
        };
        const cancel = () => {
          onSelectClips(marqueeStart.base);
          setMarqueeStart(null);
          setMarqueeRect(null);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            // Window capture runs before the Workbench's document capture
            // handler, so Escape cancels the marquee instead of closing the
            // whole workbench.
            event.stopPropagation();
            cancel();
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('blur', cancel);
        window.addEventListener('keydown', onKey, true);
        return () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', cancel);
          window.removeEventListener('blur', cancel);
          window.removeEventListener('keydown', onKey, true);
        };
      }, [marqueeStart, onSelectClips, onPause]);
      const onLaneDrop = (event, track) => {
        event.preventDefault();
        setDropTrack(null);
        const rect = event.currentTarget.getBoundingClientRect();
        const time = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1) * viewDuration;
        const conversationFile = readConversationFileDrag(event.dataTransfer) ?? getActiveConversationFileDrag();
        if (conversationFile !== null) {
          endConversationFileDrag();
          onDropItem(track, { type: 'conversation', ...conversationFile }, time);
          return;
        }
        let payload = null;
        try {
          const raw = event.dataTransfer.getData('application/x-deepseek-design');
          if (raw.length > 0) payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
        if (payload === null) {
          const active = getActiveAssetDrag();
          if (active === null || active === undefined) return;
          payload = { type: 'asset', id: active.id };
        }
        onDropItem(track, payload, time);
      };
      const visualFor = (clip) => {
        if (clipGhost !== null && clipGhost.clipId === clip.id) return clipGhost;
        return { start: clip.start, sourceIn: clip.sourceIn, duration: clip.duration };
      };
      const laneLabel = (track) => t(track === 'video' ? 'timeline.trackVideo' : track === 'audio' ? 'timeline.trackAudio' : 'timeline.trackMusic');
      const neighborsFor = (clip, track) => {
        const others = trackClips(state.timeline, track).filter((item) => item.id !== clip.id);
        return {
          previousEnd: others.filter((item) => item.start < clip.start).reduce((max, item) => Math.max(max, clipEnd(item)), 0),
          nextStart: others.filter((item) => item.start >= clip.start).reduce((min, item) => Math.min(min, item.start), Number.POSITIVE_INFINITY),
        };
      };
      const moveClipByKeyboard = (event, clip, track) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 1 : 0.1;
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        onSelectClip({ track, id: clip.id });
        store.moveClip(clip.id, track, Math.max(0, clip.start + direction * step));
      };
      const trimClipByKeyboard = (event, clip, track, mode) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 1 : 0.1;
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const neighbors = neighborsFor(clip, track);
        const next = mode === 'trim-start'
          ? clampTrim(clip, 'start', clip.start + direction * step, neighbors)
          : clampTrim(clip, 'end', clipEnd(clip) + direction * step, neighbors);
        if (next === null) return;
        onSelectClip({ track, id: clip.id });
        store.trimClip(clip.id, track, next);
      };
      const renderClip = (clip, track) => {
        const visual = visualFor(clip);
        const isSelected = selectedClips.some((ref) => ref.track === track && ref.id === clip.id);
        const neighbors = neighborsFor(clip, track);
        const startMin = Math.max(0, neighbors.previousEnd, clip.start - (Number(clip.sourceIn) || 0));
        const startMax = clip.start + clip.duration - MIN_CLIP_SECONDS;
        const endMin = clip.start + MIN_CLIP_SECONDS;
        const endMax = Math.min(neighbors.nextStart, clip.start + ((Number(clip.sourceDuration) || clip.duration) - (Number(clip.sourceIn) || 0)));
        const left = clampPercent((visual.start / viewDuration) * 100);
        const width = clampPercent((visual.duration / viewDuration) * 100);
        const generation = clip.kind === 'generation' ? generationsById.get(clip.generationId) : undefined;
        return h('div', {
          key: clip.id,
          className: cx('dsd-clip', `dsd-clip-${track}`, `dsd-clip-${clip.kind === 'generation' ? 'video' : track}`, isSelected && 'is-selected', clipDrag?.original.id === clip.id && 'is-dragging'),
          style: { left: `${left}%`, width: `${Math.max(0.35, width)}%` },
          role: 'button',
          tabIndex: 0,
          'data-clip-id': clip.id,
          'data-track': track,
          'aria-label': `${clip.name || t('timeline.selected')} · ${laneLabel(track)} · ${formatDuration(visual.duration)}`,
          'aria-description': t('timeline.keyboardMove'),
          title: `${laneLabel(track)} · ${t('timeline.keyboardMove')}`,
          onPointerDown: (event) => beginClipDrag(event, clip, track, 'move'),
          onKeyDown: (event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              moveClipByKeyboard(event, clip, track);
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onSelectClip({ track, id: clip.id });
            }
          },
        },
        clip.kind === 'generation' && generation !== undefined
          ? h('div', { className: 'dsd-clip-thumb' }, h(ScenePoster, { spec: generation.spec, sceneIndex: clip.sceneIndex }))
          : clip.kind === 'asset'
            ? (() => {
              const asset = state.assets.find((item) => item.id === clip.assetId);
              return asset !== undefined && asset.posterUrl
                ? h('div', { className: 'dsd-clip-thumb' }, h('img', { src: asset.posterUrl, alt: '', draggable: false }))
                : h('div', { className: 'dsd-clip-thumb dsd-missing-thumb' }, h(Icon, { name: 'video', size: 16 }));
            })()
            : h(Waveform, { peaks: clipPeaks(clip, state.assets), seed: clip.seed ?? 1, className: 'dsd-clip-wave' }),
        h('div', {
          className: 'dsd-trim dsd-trim-start',
          role: 'slider',
          tabIndex: isSelected ? 0 : -1,
          'aria-label': t('timeline.trimStart'),
          'aria-orientation': 'horizontal',
          'aria-valuemin': Math.round(Math.max(0, startMin) * 10) / 10,
          'aria-valuemax': Math.round(Math.max(Math.max(0, startMin), startMax) * 10) / 10,
          'aria-valuenow': Math.round(clip.start * 10) / 10,
          onPointerDown: (event) => beginClipDrag(event, clip, track, 'trim-start'),
          onKeyDown: (event) => trimClipByKeyboard(event, clip, track, 'trim-start'),
        }),
        h('div', { className: 'dsd-clip-label' },
          h('span', null, clip.kind === 'bed' ? t('timeline.bedName') : clip.name),
          h('span', { className: 'dsd-clip-duration' }, formatDuration(visual.duration))),
        h('div', {
          className: 'dsd-trim dsd-trim-end',
          role: 'slider',
          tabIndex: isSelected ? 0 : -1,
          'aria-label': t('timeline.trimEnd'),
          'aria-orientation': 'horizontal',
          'aria-valuemin': Math.round(Math.max(0, endMin) * 10) / 10,
          'aria-valuemax': Math.round(Math.max(endMin, Number.isFinite(endMax) ? endMax : endMin) * 10) / 10,
          'aria-valuenow': Math.round(clipEnd(clip) * 10) / 10,
          onPointerDown: (event) => beginClipDrag(event, clip, track, 'trim-end'),
          onKeyDown: (event) => trimClipByKeyboard(event, clip, track, 'trim-end'),
        }),
      );
      };
      const renderLinkedAudioClip = (clip) => {
        const left = clampPercent((clip.start / viewDuration) * 100);
        const width = clampPercent((clip.duration / viewDuration) * 100);
        return h('div', {
          key: clip.id,
          className: 'dsd-clip dsd-clip-audio dsd-clip-linked',
          style: { left: `${left}%`, width: `${Math.max(0.35, width)}%` },
          'aria-hidden': 'true',
          title: t('timeline.linkedAudio'),
        },
        h(Waveform, {
          peaks: clipPeaks(clip, state.assets),
          seed: hashString(clip.assetId),
          className: 'dsd-clip-wave',
        }),
        h('div', { className: 'dsd-clip-label' },
          h('span', null, clip.name),
          h('span', { className: 'dsd-clip-duration' }, formatDuration(clip.duration))));
      };
      const renderLane = (track, emptyKey, iconName) => {
        const clips = trackClips(state.timeline, track);
        const linked = track === 'audio' ? linkedAudioClips(state.timeline, state.assets) : [];
        const hasAny = clips.length + linked.length > 0;
        return h('div', {
          className: cx('dsd-lane', `dsd-lane-${track}`, dropTrack === track && 'dsd-dropover'),
          role: 'group',
          'aria-label': laneLabel(track),
          onPointerDown: startLaneGesture,
          onDragOver: (event) => {
            event.preventDefault();
            if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
            setDropTrack(track);
          },
          onDragLeave: (event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDropTrack(null);
          },
          onDrop: (event) => onLaneDrop(event, track),
        },
        !hasAny
          ? h('div', { className: 'dsd-lane-hint' },
            h(Icon, { name: iconName, size: 11 }),
            h('span', null, t(emptyKey)),
            track === 'music'
              ? h('button', {
                type: 'button',
                className: 'dsd-lane-add',
                onPointerDown: (event) => event.stopPropagation(),
                onClick: () => onAddBed((displayTime / Math.max(1, viewDuration)) * viewDuration),
              }, h(Icon, { name: 'plus', size: 9 }), t('timeline.addMusic'))
              : null)
          : [
            ...clips.map((clip) => renderClip(clip, track)),
            ...linked.map((clip) => renderLinkedAudioClip(clip)),
          ],
        );
      };
      const playheadLeft = previewMode === 'timeline' && duration > 0
        ? clampPercent((displayTime / viewDuration) * 100)
        : null;
      return h('section', {
        className: cx('dsd-timeline', previewMode === 'asset' && 'is-asset-preview'),
        'aria-label': t('timeline.title'),
      },
      h('div', { className: 'dsd-tlbar', 'data-preview-note': t('preview.tab.asset') },
        h('div', { className: 'dsd-tltitle' },
          h('h2', null, t('timeline.title'))),
        h('div', { className: 'dsd-tltools' },
          selectedClipCount > 1
            ? h('span', { className: 'dsd-tlselectcount' }, `${t('timeline.selectedCount')} ${selectedClipCount}`)
            : null,
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn',
            title: t('timeline.split'),
            'aria-label': t('timeline.split'),
            // Splitting targets the hidden timeline playhead; only offer it while
            // the timeline (not an asset preview) is the visible stage (K-10).
            disabled: !selectedClipExists || previewMode !== 'timeline',
            onClick: onSplit,
          }, h(Icon, { name: 'scissors', size: 14 })),
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn',
            title: selectedClipCount > 1 ? t('timeline.deleteSelected') : t('timeline.delete'),
            'aria-label': selectedClipCount > 1 ? t('timeline.deleteSelected') : t('timeline.delete'),
            disabled: selectedClipCount === 0,
            onClick: onDelete,
          }, h(Icon, { name: 'trash', size: 14 })),
          h('span', { style: { width: 1, height: 14, background: 'rgba(255,255,255,.08)', margin: '0 2px' } }),
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn',
            title: t('timeline.undo'),
            'aria-label': t('timeline.undo'),
            disabled: !state.history.canUndo,
            onClick: onUndo,
          }, h(Icon, { name: 'undo', size: 14 })),
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn',
            title: t('timeline.redo'),
            'aria-label': t('timeline.redo'),
            disabled: !state.history.canRedo,
            onClick: onRedo,
          }, h(Icon, { name: 'redo', size: 14 }))),
        h('div', { className: 'dsd-tlzoom' },
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn',
            'aria-label': t('timeline.zoomOut'),
            title: t('timeline.zoomOut'),
            onClick: () => setZoom((value) => clamp(Number((value - 0.25).toFixed(2)), 1, 4)),
          }, '−'),
          h('input', {
            type: 'range',
            className: 'dsd-range dsd-zoom-range',
            min: 1,
            max: 4,
            step: 0.25,
            value: zoom,
            'aria-label': t('timeline.zoom'),
            onChange: (event) => setZoom(Number(event.target.value)),
          }),
          h('button', {
            type: 'button',
            className: 'dsd-iconbtn',
            'aria-label': t('timeline.zoomIn'),
            title: t('timeline.zoomIn'),
            onClick: () => setZoom((value) => clamp(Number((value + 0.25).toFixed(2)), 1, 4)),
          }, h(Icon, { name: 'plus', size: 12 })))),
      h('div', { className: 'dsd-tlbody' },
        h('div', { className: 'dsd-tllabels', 'aria-hidden': 'true' },
          h('div', null),
          h('div', { className: 'dsd-tllabel' }, h(Icon, { name: 'video', size: 12 }), t('timeline.trackVideo')),
          h('div', { className: 'dsd-tllabel is-audio' }, h(Icon, { name: 'audio', size: 12 }), t('timeline.trackAudio')),
          h('div', { className: 'dsd-tllabel is-music' }, h(Icon, { name: 'music', size: 12 }), t('timeline.trackMusic'))),
        h('div', { className: 'dsd-tlscroll', ref: scrollRef },
          h('div', { className: 'dsd-tlcontent', ref: contentRef, style: { width: `${zoom * 100}%` } },
            h('div', {
              className: 'dsd-ruler',
              onPointerDown: startScrub,
              onPointerMove: moveScrub,
              onPointerUp: endScrub,
              onPointerCancel: endScrub,
            },
            minorTicks.map((time) => h('span', {
              key: `minor-${time}`,
              className: 'dsd-ruler-tick',
              style: { left: `${(time / viewDuration) * 100}%` },
            })),
            majorTicks.map((time) => h('span', {
              key: `major-${time}`,
              className: 'dsd-ruler-tick is-major',
              style: { left: `${(time / viewDuration) * 100}%` },
            })),
            majorTicks.map((time) => h('span', {
              key: `label-${time}`,
              className: 'dsd-ruler-label',
              style: { left: `${(time / viewDuration) * 100}%` },
            }, formatTimecode(time)))),
            renderLane('video', 'timeline.emptyVideo', 'video'),
            renderLane('audio', 'timeline.emptyAudio', 'audio'),
            renderLane('music', 'timeline.emptyMusic', 'music'),
            playheadLeft !== null ? h('div', { className: 'dsd-playhead', style: { left: `${playheadLeft}%` }, 'aria-hidden': 'true' }) : null,
            marqueeRect !== null ? h('div', { className: 'dsd-marquee', style: { left: `${marqueeRect.left}px`, top: `${marqueeRect.top}px`, width: `${Math.max(1, marqueeRect.right - marqueeRect.left)}px`, height: `${Math.max(1, marqueeRect.bottom - marqueeRect.top)}px` }, 'aria-hidden': 'true' }) : null)),
        ));
    }
    // @@UI_MORE5
    // A per-run token makes one export run own its cleanup and completion: a
    // cancel/retry invalidates the token, so the stale run that is still
    // awaiting the browser can never resume as if it had not been cancelled.
    function createRunSequence() {
      let generation = 0;
      return {
        begin() {
          generation += 1;
          return generation;
        },
        invalidate() {
          generation += 1;
        },
        isCurrent(token) {
          return token === generation;
        },
      };
    }

    function ExportModal({ t, state, localeId, onClose, onToast, onBeforeExport, onAddExportedAsset }) {
      const [tier, setTier] = useState('1080p');
      const [fps, setFps] = useState(30);
      const [quality, setQuality] = useState('high');
      const [follow, setFollow] = useState(true);
      const [aspect, setAspect] = useState(state.project.aspect);
      const [busy, setBusy] = useState(false);
      const [progress, setProgress] = useState(0);
      const [error, setError] = useState('');
      const [warning, setWarning] = useState('');
      const [result, setResult] = useState(null);
      const dialogRef = useRef(null);
      const busyRef = useRef(false);
      const cancelledRef = useRef(false);
      const mountedRef = useRef(true);
      const cleanupRef = useRef(() => {});
      const runSeqRef = useRef(null);
      if (runSeqRef.current === null) runSeqRef.current = createRunSequence();
      const duration = timelineDuration(state.timeline);
      const hasPicture = hasVideo(state.timeline);
      const outputAspect = follow ? state.project.aspect : aspect;
      const dimensions = exportDimensions(outputAspect, tier);
      const hasAudio = useMemo(() => collectAudioClips(state.timeline, state.assets).length > 0, [state.timeline, state.assets]);
      const mime = useMemo(() => chooseRecorderMime(hasAudio), [hasAudio]);
      const extension = extensionForMime(mime);
      const estimate = estimatedExportBytes(duration, tier, quality);
      const tooLarge = estimate > MAX_EXPORT_BYTES;
      const assetsById = useMemo(() => new Map(state.assets.map((asset) => [asset.id, asset])), [state.assets]);
      useEffect(() => () => {
        mountedRef.current = false;
        cancelledRef.current = true;
        runSeqRef.current.invalidate();
        cleanupRef.current();
      }, []);
      useEffect(() => {
        const onVisibility = () => {
          if (!document.hidden || !busyRef.current) return;
          cancelledRef.current = true;
          runSeqRef.current.invalidate();
          try {
            cleanupRef.current();
          } catch {
            // Cleanup is best-effort.
          }
          // A cancellation while the export is still priming has no per-run
          // cleanup closure yet; release the primed elements explicitly so a
          // retry (or a close) does not inherit them.
          cleanupExportVideoElements();
          busyRef.current = false;
          if (mountedRef.current) {
            setBusy(false);
            setProgress(0);
            setError(t('export.tabHidden'));
            setWarning('');
          }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
      }, [t]);
      const cancelExport = useCallback(() => {
        cancelledRef.current = true;
        runSeqRef.current.invalidate();
        try {
          cleanupRef.current();
        } catch {
          // Cleanup is best-effort.
        }
        // Release primed <video> elements too: while an export is still priming
        // they have no per-run cleanup closure yet.
        cleanupExportVideoElements();
        busyRef.current = false;
        if (mountedRef.current) {
          setBusy(false);
          setProgress(0);
          setError(t('export.cancelled'));
          setWarning('');
        }
      }, [t]);
      const handleClose = useCallback(() => {
        if (busyRef.current) cancelExport();
        onClose();
      }, [cancelExport, onClose]);
      useModalFocus(dialogRef, true, handleClose);
      const startExport = async () => {
        if (busyRef.current) return;
        if (!hasPicture || duration <= 0.05) {
          setError(t('export.noVideo'));
          return;
        }
        if (tooLarge) {
          setError(t('export.tooLarge'));
          return;
        }
        if (mime.length === 0 || typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
          setError(t('export.unsupported'));
          return;
        }
        setError('');
        setWarning('');
        setResult(null);
        setProgress(0);
        setBusy(true);
        busyRef.current = true;
        cancelledRef.current = false;
        const runId = runSeqRef.current.begin();
        const isCurrent = () => runSeqRef.current.isCurrent(runId);
        onBeforeExport();
        await primeExportVideoElements(state.timeline, state.assets);
        if (!isCurrent()) return;
        if (cancelledRef.current) {
          cleanupExportVideoElements();
          busyRef.current = false;
          if (mountedRef.current) setBusy(false);
          return;
        }
        const canvas = document.createElement('canvas');
        try {
          const output = prepareExportCanvas(canvas, dimensions.width, dimensions.height);
          if (output.context === null) throw new Error(t('export.unsupported'));
          await renderExportFrame(canvas, state.timeline, state.generations, state.assets, 0, dimensions.width, dimensions.height);
        } catch (caught) {
          cleanupExportVideoElements();
          busyRef.current = false;
          setBusy(false);
          setError(caught?.message ?? t('export.failed'));
          return;
        }
        let audioContext = null;
        let audioClips = [];
        let audioGain = null;
        let audioDestination = null;
        let sources = [];
        let recorder = null;
        let raf = 0;
        let settleStart = null;
        cleanupRef.current = () => {
          cleanupExportVideoElements();
          if (settleStart !== null) {
            const resolveStart = settleStart;
            settleStart = null;
            resolveStart();
          }
          if (raf !== 0) cancelAnimationFrame(raf);
          raf = 0;
          stopAudioSources(sources);
          sources = [];
          if (audioGain !== null) {
            try {
              audioGain.disconnect();
            } catch {
              // Already disconnected.
            }
            audioGain = null;
          }
          if (recorder !== null && recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch {
              // Already stopped.
            }
          }
          if (audioDestination !== null) {
            try {
              for (const track of audioDestination.stream.getAudioTracks()) track.stop();
            } catch {
              // Tracks may already be ended.
            }
            audioDestination = null;
          }
        };
        try {
          audioClips = collectAudioClips(state.timeline, state.assets);
          if (audioClips.length > 0) {
            const context = ensureAudioContext();
            if (context !== null) {
              try {
                await context.resume();
                if (!isCurrent()) return;
                if (cancelledRef.current) return;
                audioContext = context;
                audioDestination = context.createMediaStreamDestination();
                audioGain = context.createGain();
                audioGain.gain.value = 1;
                audioGain.connect(audioDestination);
              } catch {
                if (mountedRef.current) setWarning(t('export.audioWarning'));
                if (audioGain !== null) {
                  try {
                    audioGain.disconnect();
                  } catch {
                    // Ignore a graph that never started.
                  }
                  audioGain = null;
                }
              }
            } else if (mountedRef.current) {
              setWarning(t('export.audioWarning'));
            }
          }
          if (audioContext !== null) {
            for (const clip of audioClips) {
              try {
                bufferForClip(clip, assetsById);
              } catch {
                // A missing buffer simply makes that clip silent.
              }
            }
          }
          const stream = canvas.captureStream(fps);
          if (audioDestination !== null) {
            for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
          }
          const options = {
            mimeType: mime,
            videoBitsPerSecond: videoBitrateFor(tier, quality),
          };
          if (audioDestination !== null) options.audioBitsPerSecond = audioBitrateFor(quality);
          recorder = new MediaRecorder(stream, options);
          const chunks = [];
          recorder.ondataavailable = (event) => {
            if (event.data !== null && event.data.size > 0) chunks.push(event.data);
          };
          const stopped = new Promise((resolve, reject) => {
            recorder.onstop = () => resolve();
            recorder.onerror = (event) => reject(new Error(event?.error?.message ?? 'recorder-error'));
          });
          recorder.start(220);
          // Start audio after the recorder is live. Scheduling before MediaRecorder
          // setup lets the sound run ahead of the captured video by an unpredictable
          // setup interval (and clips the first frames when the setup is slow).
          if (audioGain !== null && audioDestination !== null && audioContext !== null) {
            try {
              const scheduled = scheduleAudioSources(audioClips, assetsById, audioContext, audioGain, 0);
              sources = scheduled.sources;
              if (scheduled.missing && mountedRef.current) setWarning(t('export.audioWarning'));
            } catch {
              if (mountedRef.current) setWarning(t('export.audioWarning'));
            }
          }
          const startedAt = performance.now();
          let lastProgress = -1;
          const started = new Promise((resolve) => {
            settleStart = resolve;
            const tick = async () => {
              if (cancelledRef.current) {
                resolve();
                return;
              }
              const elapsed = Math.min(duration, (performance.now() - startedAt) / 1000);
              const frameTime = Math.max(0, Math.min(elapsed, duration - 0.001));
              await renderExportFrame(canvas, state.timeline, state.generations, state.assets, frameTime, dimensions.width, dimensions.height);
              if (cancelledRef.current) {
                resolve();
                return;
              }
              const ratio = clamp(elapsed / duration, 0, 1);
              if (ratio - lastProgress > 0.012 || ratio >= 1) {
                lastProgress = ratio;
                if (mountedRef.current) setProgress(ratio);
              }
              if (elapsed >= duration - 0.001) {
                resolve();
                return;
              }
              raf = requestAnimationFrame(tick);
            };
            tick().catch(() => resolve());
          });
          await started;
          settleStart = null;
          if (!isCurrent()) return;
          if (cancelledRef.current) {
            cleanupRef.current();
            cleanupRef.current = () => {};
            if (mountedRef.current) {
              busyRef.current = false;
              setBusy(false);
            }
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 90));
          if (!isCurrent()) return;
          if (recorder.state !== 'inactive') recorder.stop();
          await stopped;
          if (!isCurrent()) return;
          cleanupRef.current();
          cleanupRef.current = () => {};
          if (cancelledRef.current) {
            if (mountedRef.current) {
              busyRef.current = false;
              setBusy(false);
            }
            return;
          }
          if (!isCurrent()) return;
          const recordedBytes = chunks.reduce((sum, chunk) => sum + (Number(chunk?.size) || 0), 0);
          if (recordedBytes <= 0) throw new Error(t('export.emptyRecording'));
          const blob = new Blob(chunks, { type: mime });
          // Name the finished file after the project instead of a constant
          // (K-06 / 0.9.5 B-2).
          const projectLabel = typeof state.project.name === 'string' && state.project.name.trim().length > 0
            ? state.project.name.trim()
            : t('project.untitled');
          const filename = `${sanitizeFilename(projectLabel)}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${extension}`;
          let poster = null;
          try { poster = canvas.toDataURL('image/jpeg', 0.82); } catch { poster = null; }
          downloadBlob(blob, filename);
          let libraryAdded = false;
          let libraryFailed = false;
          if (typeof onAddExportedAsset === 'function') {
            try {
              await onAddExportedAsset({
                blob,
                name: filename,
                duration,
                width: dimensions.width,
                height: dimensions.height,
                poster,
              });
              libraryAdded = true;
            } catch {
              libraryFailed = true;
            }
          }
          if (!isCurrent()) return;
          if (mountedRef.current) {
            setResult({ filename, bytes: blob.size, format: extension.toUpperCase(), duration, libraryAdded });
            setProgress(1);
            setBusy(false);
            busyRef.current = false;
            if (libraryFailed) setWarning(t('export.libraryFailed'));
            onToast(libraryAdded ? t('toast.exportedLibrary') : t('toast.exported'), libraryFailed ? 'error' : 'success');
          }
        } catch (caught) {
          if (!isCurrent()) return;
          cleanupRef.current();
          cleanupRef.current = () => {};
          if (mountedRef.current) {
            busyRef.current = false;
            setBusy(false);
            if (!cancelledRef.current) setError(caught?.message ?? t('export.failed'));
          }
        } finally {
          // Cleanup is owned by the explicit success/cancel paths and by unmount.
        }
      };
      const aspectOptions = ASPECTS;
      const formatLabel = extension.toUpperCase();
      return h('div', {
        className: 'dsd-modal-backdrop',
        onPointerDown: (event) => {
          if (event.target === event.currentTarget) handleClose();
        },
      },
      h('div', {
        ref: dialogRef,
        className: 'dsd-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('export.title'),
        tabIndex: -1,
      },
      h('div', { className: 'dsd-modalhead' },
        h('div', null,
          h('h2', { className: 'dsd-modaltitle' }, t('export.title')),
          h('p', { className: 'dsd-modalsub' }, t('export.subtitle'))),
        h('button', { type: 'button', className: 'dsd-modalclose', 'aria-label': t('actions.close'), onClick: handleClose }, h(Icon, { name: 'close', size: 14 }))),
      h('div', { className: 'dsd-modalbody' },
        h('div', { className: 'dsd-export-summary' },
          h('div', { className: 'dsd-export-summary-main' },
            h('div', { className: 'dsd-export-name' },
              typeof state.project.name === 'string' && state.project.name.trim().length > 0
                ? state.project.name.trim()
                : t('project.untitled')),
            h('div', { className: 'dsd-export-meta' },
              h('span', null, h(Icon, { name: 'clock', size: 11 }), formatDuration(duration)),
              h('span', null, `${fps} FPS`),
              h('span', null, ASPECT_BY_ID.get(outputAspect)?.label ?? outputAspect),
              h('span', null, `${dimensions.width}×${dimensions.height}`))),
          h('span', { className: 'dsd-export-badge' }, formatLabel)),
        hasPicture && mime.length > 0
          ? h(React.Fragment, null,
            h('div', { className: 'dsd-optiongroup' },
              h('div', { className: 'dsd-optionlabel' }, t('export.resolution'), h('span', null, 'MP4 / WebM')),
              h('div', { className: 'dsd-optionrow' },
                RESOLUTIONS.map((item) => h('button', {
                  type: 'button', key: item, className: cx('dsd-optbtn', tier === item && 'is-active'),
                  'aria-pressed': tier === item, disabled: busy, onClick: () => setTier(item),
                }, item === '4k' ? '4K' : '1080P')))),
            h('div', { className: 'dsd-optiongroup' },
              h('div', { className: 'dsd-optionlabel' }, t('export.fps')),
              h('div', { className: 'dsd-optionrow' },
                FPS_OPTIONS.map((item) => h('button', {
                  type: 'button', key: item, className: cx('dsd-optbtn', fps === item && 'is-active'),
                  'aria-pressed': fps === item, disabled: busy, onClick: () => setFps(item),
                }, `${item} FPS`)))),
            h('div', { className: 'dsd-optiongroup' },
              h('div', { className: 'dsd-optionlabel' }, t('export.quality')),
              h('div', { className: 'dsd-optionrow' },
                QUALITIES.map((item) => h('button', {
                  type: 'button', key: item, className: cx('dsd-optbtn', quality === item && 'is-active'),
                  'aria-pressed': quality === item, disabled: busy, onClick: () => setQuality(item),
                }, t(`export.${item}`))))),
            h('div', { className: 'dsd-optiongroup' },
              h('div', { className: 'dsd-optionlabel' }, t('export.aspect'),
                h('label', { className: 'dsd-toggle' },
                  h('input', {
                    type: 'checkbox', checked: follow, disabled: busy,
                    onChange: (event) => {
                      const checked = event.target.checked;
                      setFollow(checked);
                      if (!checked) setAspect(state.project.aspect);
                    },
                  }),
                  h('span', { className: 'dsd-toggle-track' }),
                  t('export.followTimeline'))),
              h('select', {
                className: 'dsd-aspect-select',
                value: outputAspect,
                disabled: follow || busy,
                'aria-label': t('export.aspect'),
                onChange: (event) => setAspect(event.target.value),
              }, aspectOptions.map((option) => h('option', { key: option.id, value: option.id },
                `${option.label} · ${t(option.nameKey)}`)))),
          )
          : h('div', { className: 'dsd-export-error' },
            h(Icon, { name: 'alert', size: 13 }),
            h('span', null, !hasPicture ? t('export.noVideo') : t('export.unsupported'))),
        tooLarge && hasPicture ? h('div', { className: 'dsd-export-warning' }, t('export.tooLarge')) : null,
        busy ? h('div', { className: 'dsd-progress' },
          h('div', { className: 'dsd-progress-head' },
            h('span', null, t('export.exporting')),
            h('span', null, `${Math.round(progress * 100)}%`)),
          h('div', { className: 'dsd-progressbar', role: 'progressbar', 'aria-label': t('export.exporting'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress * 100) }, h('div', { className: 'dsd-progressfill', style: { width: `${Math.round(progress * 100)}%` } }))) : null,
        warning.length > 0 ? h('div', { className: 'dsd-export-warning' }, warning) : null,
        error.length > 0 ? h('div', { className: 'dsd-export-error' }, h(Icon, { name: 'alert', size: 13 }), h('span', null, error)) : null,
        result !== null ? h('div', { className: 'dsd-export-success' },
          h(Icon, { name: 'check', size: 13 }),
          h('span', null, `${t('export.done')} · ${humanBytes(result.bytes)} · ${result.format}${result.libraryAdded === true ? ` · ${t('export.libraryAdded')}` : ''}`)) : null),
      h('div', { className: 'dsd-export-footer' },
        h('div', { className: 'dsd-export-estimate' },
          h('div', null, t('export.willDownload')),
          h('div', null, `${t('export.estimated')}: `, h('strong', null, humanBytes(estimate)), h('span', null, ` · ${formatLabel}`))),
        h('div', { className: 'dsd-export-actions' },
          busy
            ? h('button', { type: 'button', className: 'dsd-softbtn', onClick: cancelExport }, t('export.cancel'))
            : h('button', { type: 'button', className: 'dsd-softbtn', onClick: handleClose }, t('actions.close')),
          busy
            ? h('button', { type: 'button', className: 'dsd-primary', disabled: true }, h(Icon, { name: 'spinner', size: 12, className: 'dsd-spin' }), t('export.exporting'))
            : h('button', {
              type: 'button',
              className: 'dsd-primary',
              disabled: !hasPicture || duration <= 0.05 || mime.length === 0 || tooLarge,
              onClick: startExport,
            }, h(Icon, { name: 'download', size: 13 }), result === null ? t('export.start') : t('export.retry'))))));
    }
    // @@UI_MORE6
    function Toast({ toast }) {
      if (toast === null || toast === undefined) return null;
      return h('div', {
        className: cx('dsd-toast', toast.tone === 'error' && 'is-error', toast.tone === 'success' && 'is-success'),
        role: 'status',
        'aria-live': 'polite',
      },
      h(Icon, { name: toast.tone === 'error' ? 'alert' : 'check', size: 13 }),
      h('span', null, toast.text));
    }

    function Workbench({ ctx, store, chatPanel, fileDrag, onCloseWorkbench }) {
      const { t, localeId } = useLocaleT(ctx);
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
      const [previewMode, setPreviewMode] = useState('timeline');
      const [playing, setPlaying] = useState(false);
      const [displayTime, setDisplayTime] = useState(0);
      const [seekTick, setSeekTick] = useState(0);
      const [audioRestart, setAudioRestart] = useState(0);
      const [volume, setVolume] = useState(0.78);
      const [muted, setMuted] = useState(false);
      const [expanded, setExpanded] = useState(false);
      const [exportOpen, setExportOpen] = useState(false);
      const [showAssets, setShowAssets] = useState(false);
      const [showChat, setShowChat] = useState(false);
      const canvasRef = useRef(null);
      const rootRef = useRef(null);
      const chatPanelRef = useRef(null);
      const previousFocusRef = useRef(null);
      // The workbench is a full-main modal surface: contain focus inside it,
      // mark the covered app inert, and return focus to the invoking control on
      // close (U-03).
      useEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const appRoot = typeof document === 'undefined' ? null : document.getElementById('root');
        const previousAria = appRoot === null ? null : appRoot.getAttribute('aria-hidden');
        if (appRoot !== null) {
          appRoot.setAttribute('inert', '');
          appRoot.setAttribute('aria-hidden', 'true');
        }
        return () => {
          if (appRoot !== null) {
            appRoot.removeAttribute('inert');
            if (previousAria === null) appRoot.removeAttribute('aria-hidden');
            else appRoot.setAttribute('aria-hidden', previousAria);
          }
          const previousFocus = previousFocusRef.current;
          if (previousFocus !== null && previousFocus.isConnected === true && typeof previousFocus.focus === 'function') {
            try { previousFocus.focus({ preventScroll: true }); } catch { /* Focus is best effort. */ }
          }
        };
      }, []);
      const focusableInRoot = useCallback(() => {
        const root = rootRef.current;
        if (root === null) return [];
        return [...root.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
          .filter((element) => element.offsetParent !== null || element === document.activeElement);
      }, []);
      const fileInputRef = useRef(null);
      const projectInputRef = useRef(null);
      const positionsRef = useRef({ timeline: 0, asset: 0 });
      const volumeRef = useRef(volume);
      const mutedRef = useRef(muted);
      const modeRef = useRef(previewMode);
      const selectedKeyRef = useRef('');
      const [chatDropActive, setChatDropActive] = useState(false);
      volumeRef.current = volume;
      mutedRef.current = muted;

      useEffect(() => {
        store.init();
      }, [store]);
      const activeProjectId = state.projects.activeId;
      useEffect(() => {
        setPlaying(false);
        setPreviewMode('timeline');
        setExportOpen(false);
        setShowAssets(false);
        positionsRef.current = { timeline: 0, asset: 0 };
        setDisplayTime(0);
        setSeekTick((value) => value + 1);
      }, [activeProjectId]);
      useEffect(() => {
        const root = document.body ?? chatPanelRef.current;
        if (root === null) return undefined;
        let scheduledFrame = 0;
        const scheduleDecorate = () => {
          if (scheduledFrame !== 0) return;
          if (typeof requestAnimationFrame !== 'function') {
            decorateConversationFileCards(root);
            return;
          }
          scheduledFrame = requestAnimationFrame(() => {
            scheduledFrame = 0;
            decorateConversationFileCards(root);
          });
        };
        decorateConversationFileCards(root);
        const observer = typeof MutationObserver === 'function' ? new MutationObserver(scheduleDecorate) : null;
        observer?.observe(root, { childList: true, subtree: true });
        const onDragStart = (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          let card = target.closest('[data-dsd-conversation-file]');
          let fallbackDraft = false;
          if (card === null) {
            card = target.closest('[class*="_rail"] [class*="_card"]');
            fallbackDraft = card !== null;
          }
          if (card === null) return;
          const kind = card.getAttribute('data-dsd-conversation-file') ?? (fallbackDraft ? 'draft' : '');
          if (kind === 'draft') {
            const draft = conversationDraftFileForCard(card);
            if (draft === null) return;
            beginConversationFileDrag(draft);
            try {
              event.dataTransfer.effectAllowed = 'copy';
              if (draft.file instanceof File) {
                event.dataTransfer.items.add(draft.file);
              } else {
                event.dataTransfer.setData(CONVERSATION_FILE_MIME, JSON.stringify(draft));
              }
              event.dataTransfer.setData('text/plain', draft.name || 'conversation file');
            } catch {
              // A browser without writable drag data keeps the drag inert.
            }
            return;
          }
          const ref = kind === 'deliverable' ? conversationDeliverableRefForCard(card) : conversationFileRefForCard(card);
          if (ref === null) return;
          try {
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(CONVERSATION_FILE_MIME, JSON.stringify(ref));
            event.dataTransfer.setData('text/plain', ref.name || 'conversation file');
          } catch {
            // A browser without writable drag data keeps the drag inert.
          }
        };
        const onMouseDown = (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const card = target.closest('[data-dsd-conversation-file="draft"]')
            ?? target.closest('[class*="_rail"] [class*="_card"]');
          if (card === null || target.closest('button') !== null) return;
          event.stopPropagation();
        };
        const onDragEnd = () => {
          activeAssetDrag = null;
          endConversationFileDrag();
        };
        document.addEventListener('dragstart', onDragStart, true);
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('dragend', onDragEnd, true);
        return () => {
          observer?.disconnect();
          if (scheduledFrame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scheduledFrame);
          document.removeEventListener('dragstart', onDragStart, true);
          document.removeEventListener('mousedown', onMouseDown, true);
          document.removeEventListener('dragend', onDragEnd, true);
        };
      }, [chatPanel]);
      useEffect(() => {
        const onVisibility = () => {
          if (document.hidden) setPlaying(false);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
      }, []);
      const timelineDur = timelineDuration(state.timeline);
      const timelineClips = clipsOfTimeline(state.timeline);
      const hasPicture = hasVideo(state.timeline);
      const selectedGeneration = state.selectedAsset?.type === 'generation'
        ? state.generations.find((generation) => generation.id === state.selectedAsset.id) ?? null
        : null;
      const selectedUpload = state.selectedAsset?.type === 'asset'
        ? state.assets.find((asset) => asset.id === state.selectedAsset.id) ?? null
        : null;
      const selectedAssetDuration = selectedGeneration !== null
        ? sequenceDuration(selectedGeneration.spec)
        : selectedUpload !== null && (selectedUpload.kind === 'video' || selectedUpload.kind === 'audio')
          ? selectedUpload.duration
          : 0;
      const activeDuration = previewMode === 'timeline' ? timelineDur : selectedAssetDuration;
      const canPlay = previewMode === 'timeline'
        ? timelineClips.length > 0 && activeDuration > 0
        : selectedGeneration !== null && activeDuration > 0;
      const canExport = hasPicture && timelineDur > 0.05;
      const assetsById = useMemo(() => new Map(state.assets.map((asset) => [asset.id, asset])), [state.assets]);
      useEffect(() => {
        if (modeRef.current === previewMode) return;
        modeRef.current = previewMode;
        setPlaying(false);
        setDisplayTime(roundSeconds(positionsRef.current[previewMode] ?? 0));
        setSeekTick((value) => value + 1);
      }, [previewMode]);

      const selectedKey = state.selectedAsset === null || state.selectedAsset === undefined
        ? ''
        : `${state.selectedAsset.type}:${state.selectedAsset.id}`;
      useEffect(() => {
        if (selectedKeyRef.current === selectedKey) return;
        selectedKeyRef.current = selectedKey;
        positionsRef.current.asset = 0;
        setPlaying(false);
        if (previewMode === 'asset') {
          setDisplayTime(0);
          setSeekTick((value) => value + 1);
        }
      }, [selectedKey, previewMode]);

      useEffect(() => {
        if (positionsRef.current[previewMode] <= activeDuration) return;
        positionsRef.current[previewMode] = activeDuration;
        setDisplayTime(activeDuration);
        setSeekTick((value) => value + 1);
      }, [activeDuration, previewMode]);

      useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return undefined;
        const canvasSource = previewMode === 'timeline' ? hasPicture : selectedGeneration !== null;
        if (!canvasSource) return undefined;
        let cancelled = false;
        let raf = 0;
        let last = performance.now();
        let lastUi = 0;
        let quality = 1;
        let slowFrames = 0;
        let fastFrames = 0;
        let finished = false;
        const drawFrame = () => {
          if (cancelled) return;
          const now = performance.now();
          if (playing) {
            const dt = Math.min(0.12, Math.max(0, (now - last) / 1000));
            const key = previewMode;
            const next = Math.min(activeDuration, positionsRef.current[key] + dt);
            positionsRef.current[key] = next;
            if (next >= activeDuration - 0.002) finished = true;
            if (now - lastUi > 80 || finished) {
              setDisplayTime(roundSeconds(next));
              lastUi = now;
            }
          }
          const drawStarted = performance.now();
          const frameTime = Math.min(
            positionsRef.current[previewMode],
            Math.max(0, activeDuration - 0.001),
          );
          if (previewMode === 'timeline') {
            renderTimelineFrame(canvas, state.timeline, state.generations, frameTime, state.project.aspect, quality);
          } else if (selectedGeneration !== null) {
            renderSpecTime(canvas, selectedGeneration.spec, frameTime, state.project.aspect, quality);
          }
          const cost = performance.now() - drawStarted;
          if (playing) {
            if (cost > 22) {
              slowFrames += 1;
              fastFrames = 0;
              if (slowFrames > 10 && quality > 0.7) {
                quality = 0.7;
                slowFrames = 0;
              }
            } else if (cost < 10) {
              fastFrames += 1;
              slowFrames = 0;
              if (fastFrames > 100 && quality < 1) {
                quality = 1;
                fastFrames = 0;
              }
            }
            last = now;
            if (finished) {
              setPlaying(false);
              setDisplayTime(roundSeconds(positionsRef.current[previewMode]));
            } else {
              raf = requestAnimationFrame(drawFrame);
            }
          }
        };
        if (playing) {
          last = performance.now();
          lastUi = 0;
          raf = requestAnimationFrame(drawFrame);
        } else {
          drawFrame();
        }
        return () => {
          cancelled = true;
          if (raf !== 0) cancelAnimationFrame(raf);
        };
      }, [playing, previewMode, activeDuration, seekTick, hasPicture, selectedGeneration, state.timeline, state.generations, state.project.aspect]);

      useEffect(() => {
        if (!playing || previewMode !== 'timeline') return undefined;
        const clips = collectAudioClips(state.timeline, state.assets);
        if (clips.length === 0) return undefined;
        const context = ensureAudioContext();
        if (context === null) return undefined;
        let cancelled = false;
        let gain = null;
        let sources = [];
        const start = async () => {
          try {
            await context.resume();
            if (cancelled) return;
            const fromTime = positionsRef.current.timeline;
            gain = context.createGain();
            gain.gain.value = mutedRef.current ? 0 : volumeRef.current;
            gain.connect(context.destination);
            audioRuntime.playbackGain = gain;
            const result = scheduleAudioSources(clips, assetsById, context, gain, fromTime);
            sources = result.sources;
            if (cancelled) stopAudioSources(sources);
          } catch {
            // Audio is best-effort; video preview keeps running.
          }
        };
        start();
        return () => {
          cancelled = true;
          stopAudioSources(sources);
          sources = [];
          if (gain !== null) {
            try {
              gain.disconnect();
            } catch {
              // Already disconnected.
            }
            if (audioRuntime.playbackGain === gain) audioRuntime.playbackGain = null;
          }
        };
      }, [playing, previewMode, audioRestart, state.timeline, assetsById]);

      useEffect(() => {
        if (!playing || previewMode !== 'timeline' || hasPicture || timelineDur <= 0) return undefined;
        let raf = 0;
        let last = performance.now();
        let lastUi = 0;
        let cancelled = false;
        const tick = (now) => {
          if (cancelled) return;
          const dt = Math.min(0.12, Math.max(0, (now - last) / 1000));
          last = now;
          const next = Math.min(timelineDur, positionsRef.current.timeline + dt);
          positionsRef.current.timeline = next;
          if (now - lastUi > 80 || next >= timelineDur) {
            setDisplayTime(roundSeconds(next));
            lastUi = now;
          }
          if (next >= timelineDur - 0.002) {
            setPlaying(false);
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => {
          cancelled = true;
          if (raf !== 0) cancelAnimationFrame(raf);
        };
      }, [playing, previewMode, hasPicture, timelineDur]);

      useEffect(() => {
        const gain = audioRuntime.playbackGain;
        if (gain !== null) gain.gain.value = muted ? 0 : volume;
      }, [volume, muted]);

      const pause = useCallback(() => {
        setPlaying(false);
      }, []);

      const seekActive = useCallback((value) => {
        const next = clamp(value, 0, activeDuration);
        positionsRef.current[previewMode] = next;
        setDisplayTime(roundSeconds(next));
        setSeekTick((tick) => tick + 1);
        if (playing) setAudioRestart((value2) => value2 + 1);
      }, [activeDuration, previewMode, playing]);

      const seekTimeline = useCallback((value) => {
        const next = clamp(value, 0, timelineDur);
        positionsRef.current.timeline = next;
        if (previewMode !== 'timeline') {
          setPlaying(false);
          setPreviewMode('timeline');
        }
        setDisplayTime(roundSeconds(next));
        setSeekTick((tick) => tick + 1);
        if (playing) setAudioRestart((value2) => value2 + 1);
      }, [timelineDur, playing, previewMode]);

      const togglePlay = useCallback(() => {
        if (!canPlay || activeDuration <= 0) return;
        if (playing) {
          setPlaying(false);
          setDisplayTime(roundSeconds(positionsRef.current[previewMode]));
          return;
        }
        const context = ensureAudioContext();
        if (context !== null && context.state === 'suspended') context.resume().catch(() => {});
        if (positionsRef.current[previewMode] >= activeDuration - 0.02) {
          positionsRef.current[previewMode] = 0;
          setDisplayTime(0);
        }
        setSeekTick((value) => value + 1);
        setPlaying(true);
      }, [canPlay, activeDuration, playing, previewMode]);

      const requestImport = useCallback((files) => {
        if (files !== undefined && files !== null && files.length > 0) {
          store.importFiles(files, localeId);
          return;
        }
        if (fileInputRef.current !== null) fileInputRef.current.click();
      }, [store, localeId]);

      const handleProjectExport = useCallback(async () => {
        setPlaying(false);
        try {
          const result = await store.exportProjectFile();
          const blob = new Blob([JSON.stringify(result.data)], { type: 'application/json' });
          downloadBlob(blob, result.filename);
          const mediaSuffix = result.omitted > 0 ? ` · ${t('project.mediaOmitted')} (${result.omitted})` : '';
          const posterSuffix = result.postersOmitted > 0 ? ` · ${t('project.posterOmitted')} (${result.postersOmitted})` : '';
          store.showToast(`${t('project.exported')}${mediaSuffix}${posterSuffix}`, result.omitted > 0 || result.postersOmitted > 0 ? 'error' : 'success');
        } catch (error) {
          store.showToast(error?.message ?? t('project.invalid'), 'error');
        }
      }, [store, t]);

      const handleProjectImport = useCallback(async (file) => {
        if (file === undefined || file === null) return;
        if (Number(file.size) > MAX_PROJECT_IMPORT_BYTES) {
          store.showToast(t('project.tooLarge'), 'error');
          return;
        }
        setPlaying(false);
        try {
          const text = await file.text();
          let parsed;
          try { parsed = JSON.parse(text); } catch { throw new Error(t('project.invalid')); }
          const result = await store.importProjectFile(parsed, localeId);
          setPreviewMode('timeline');
          const suffix = result.omitted > 0 ? ` · ${t('project.mediaOmitted')} (${result.omitted})` : '';
          store.showToast(`${t('project.loaded')}${suffix}`, result.omitted > 0 ? 'error' : 'success');
        } catch (error) {
          store.showToast(error?.message ?? t('project.invalid'), 'error');
        }
      }, [store, localeId, t]);

      const handleSetAutoBackup = useCallback((enabled) => {
        store.setAutoBackup(enabled);
      }, [store]);

      const handleRestoreBackup = useCallback(() => {
        if (typeof window.confirm === 'function' && !window.confirm(t('project.backupRestoreConfirm'))) return;
        setPlaying(false);
        const restored = store.restoreProjectBackup();
        if (restored) setPreviewMode('timeline');
      }, [store, t]);

      const handleClearBackups = useCallback(() => {
        if (typeof window.confirm === 'function' && !window.confirm(t('project.backupClearConfirm'))) return;
        const removed = store.clearProjectBackups();
        store.showToast(t('toast.backupCleared'), 'success');
        return removed;
      }, [store, t]);

      const handleNewProject = useCallback(async () => {
        setPlaying(false);
        try {
          await store.createProject();
          setPreviewMode('timeline');
          store.showToast(t('project.created'), 'success');
        } catch (error) {
          store.showToast(error?.message ?? t('project.saveFailed'), 'error');
        }
      }, [store, t]);

      const handleSwitchProject = useCallback(async (projectId) => {
        setPlaying(false);
        try {
          await store.switchProject(projectId);
          setPreviewMode('timeline');
          store.showToast(t('project.switched'), 'success');
        } catch (error) {
          store.showToast(error?.message ?? t('project.saveFailed'), 'error');
        }
      }, [store, t]);

      const handleDeleteProject = useCallback(async (projectId) => {
        const entry = state.projects.items.find((item) => item.id === projectId);
        const displayName = entry !== undefined && typeof entry.name === 'string' && entry.name.trim().length > 0
          ? entry.name.trim()
          : t('project.untitled');
        const message = t('project.deleteConfirm').replace('{name}', displayName);
        if (typeof window.confirm === 'function' && !window.confirm(message)) return;
        setPlaying(false);
        try {
          await store.deleteProject(projectId);
          setPreviewMode('timeline');
          store.showToast(t('project.deleted'), 'success');
        } catch (error) {
          store.showToast(error?.message ?? t('project.saveFailed'), 'error');
        }
      }, [store, state.projects.items, t]);

      const requestProjectLoad = useCallback(() => {
        if (projectInputRef.current !== null) projectInputRef.current.click();
      }, []);
      const handleImportConversationObject = useCallback(async (ref) => {
        try {
          await store.importConversationObject(ref, localeId);
        } catch (error) {
          store.showToast(error?.message ?? t('chat.conversationFileFailed'), 'error');
        }
      }, [store, localeId, t]);
      const handleChatDragOver = useCallback((event) => {
        const types = [...(event.dataTransfer?.types ?? [])];
        // Conversation-file drags are owned by the native composer. Prevent the
        // browser default here so a rejected drop cannot navigate the SPA to the
        // file/blob URL when the composer declines (K-01/B-8).
        if (types.includes(CONVERSATION_FILE_MIME) || getActiveConversationFileDrag() !== null) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer !== null && event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'copy';
          setChatDropActive(true);
          return;
        }
        const payload = getActiveAssetDrag();
        if (payload === null) return;
        if (!types.includes('application/x-deepseek-design')) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setChatDropActive(true);
      }, []);
      const handleChatDragLeave = useCallback((event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && event.currentTarget.contains(related)) return;
        setChatDropActive(false);
      }, []);
      const handleChatDrop = useCallback(async (event) => {
        const types = [...(event.dataTransfer?.types ?? [])];
        if (types.includes(CONVERSATION_FILE_MIME) || getActiveConversationFileDrag() !== null) {
          // Let the native composer consume the file. Preventing the browser
          // default is the whole point: a composer rejection must not navigate
          // the page away from the workbench (K-01/B-8).
          event.preventDefault();
          event.stopPropagation();
          setChatDropActive(false);
          return;
        }
        const payload = getActiveAssetDrag();
        if (payload === null) return;
        if (!types.includes('application/x-deepseek-design')) return;
        event.preventDefault();
        event.stopPropagation();
        endAssetDrag();
        setChatDropActive(false);
        try {
          if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function') {
            throw new Error(t('chat.assetAttachFailed'));
          }
          const file = await store.fileForAsset(payload.id);
          if (file === null) throw new Error(t('chat.assetAttachFailed'));
          const panel = chatPanelRef.current;
          const target = panel?.querySelector('[data-composer-card]') ?? panel;
          if (target === null || target === undefined) throw new Error(t('chat.assetAttachFailed'));
          const transfer = new DataTransfer();
          transfer.items.add(file);
          const composerCardCount = () => (panel === null || panel === undefined ? 0 : panel.querySelectorAll('[data-composer-card] [class*="_rail"] > *, [data-composer-card] [class*="_card"]').length);
          const cardsBefore = composerCardCount();
          target.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }));
          // The native composer may silently reject the drop (limit reached or an
          // upload in flight), so only report success after the attachment rail
          // actually shows the new file.
          const confirmAttached = () => {
            try {
              if (composerCardCount() > cardsBefore) store.showToast(t('chat.assetAttached'), 'success');
            } catch {
              // Feedback is best effort; the composer owns attachment state.
            }
          };
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(confirmAttached));
          } else {
            confirmAttached();
          }
        } catch (error) {
          store.showToast(error?.message ?? t('chat.assetAttachFailed'), 'error');
        }
      }, [store, t]);
      const focusChat = useCallback(() => {
        // On narrow layouts the conversation lives in a drawer; open it first.
        setShowChat(true);
        const root = rootRef.current;
        if (root === null) return;
        const focusField = () => {
          const field = root.querySelector('.dsd-chatpanel [contenteditable="true"], .dsd-chatpanel textarea');
          if (field instanceof HTMLElement) field.focus({ preventScroll: true });
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusField);
        else focusField();
      }, []);
      const focusComposer = focusChat;
      const chooseAsset = useCallback((ref) => {
        setPlaying(false);
        store.selectAsset(ref);
        setPreviewMode('asset');
        setShowAssets(false);
      }, [store]);
      const handleSetAssetSelection = useCallback((refs, primary) => {
        setPlaying(false);
        store.setAssetSelection(refs, primary);
      }, [store]);
      const handleDeleteEntries = useCallback((refs) => {
        if (!Array.isArray(refs) || refs.length === 0) return;
        const current = state.selectedAsset;
        const removedCurrent = current !== null && current !== undefined
          && refs.some((ref) => ref.type === current.type && ref.id === current.id);
        const result = store.deleteEntries(refs, { force: true });
        if (!result.ok) {
          store.showToast(result.reason === 'in-use'
            ? `${t('assets.deleteInUse')} (${result.count})`
            : t('assets.missing'), 'error');
          return;
        }
        if (removedCurrent) setPreviewMode('timeline');
        store.showToast(refs.length > 1
          ? t('assets.deletedCount').replace('{count}', String(refs.length))
          : t('assets.deleted'), 'success');
      }, [store, t, state.selectedAsset]);
      const handleSelectClip = useCallback((ref) => {
        setPlaying(false);
        store.selectClip(ref);
        setPreviewMode('timeline');
      }, [store]);
      const handleSelectClips = useCallback((refs) => {
        setPlaying(false);
        store.selectClips(refs);
        setPreviewMode('timeline');
      }, [store]);
      const handleDropItem = useCallback(async (track, payload, time) => {
        setPlaying(false);
        const dropAsset = (asset) => {
          if (asset === null || asset === undefined) return false;
          const placed = store.addAssetToTimeline(asset.id, track, time, localeId);
          if (placed === null) return false;
          setPreviewMode('timeline');
          if (placed.kind === 'video') {
            if (placed.padded === true) {
              store.showToast(t('toast.shortClip'), 'success');
            } else {
              store.showToast(placed.hasAudio ? t('toast.videoAudioAdded') : t('toast.videoAdded'), 'success');
            }
          } else {
            store.showToast(t('toast.audioAdded'), 'success');
          }
          return true;
        };
        if (payload?.type === 'conversation') {
          try {
            const asset = await store.importConversationObject(payload, localeId);
            if (asset === null) return;
            if (dropAsset(asset)) {
              store.showToast(t('toast.conversationAdded'), 'success');
            } else {
              store.showToast(t('toast.fileUnsupported'), 'error');
            }
          } catch (error) {
            store.showToast(error?.message ?? t('chat.conversationFileFailed'), 'error');
          }
          return;
        }
        if (payload?.type === 'generation' && track === 'video') {
          if (store.addGenerationToTimeline(payload.id, time, localeId)) {
            setPreviewMode('timeline');
            store.showToast(t('toast.applied'), 'success');
          }
          return;
        }
        if (payload?.type === 'asset') {
          const asset = state.assets.find((item) => item.id === payload.id);
          if (dropAsset(asset)) return;
        }
        store.showToast(t('toast.fileUnsupported'), 'error');
      }, [store, localeId, state.assets, t]);
      const handleAddBed = useCallback((atTime) => {
        setPlaying(false);
        // Use the time the button was rendered at (the visible playhead/stage
        // position) instead of the hidden timeline playhead (K-09 / 0.9.5 B-5).
        const requested = Number(atTime);
        const start = Number.isFinite(requested) ? requested : positionsRef.current.timeline;
        if (store.addBedAt(start, localeId)) {
          setPreviewMode('timeline');
          store.showToast(t('toast.musicAdded'), 'success');
        }
      }, [store, localeId, t]);
      const handleSplit = useCallback(() => {
        const selected = state.selectedClip;
        if (selected === null) return;
        setPlaying(false);
        if (store.splitClip(selected.id, selected.track, positionsRef.current.timeline)) {
          setPreviewMode('timeline');
        }
      }, [state.selectedClip, store]);
      const handleDelete = useCallback(() => {
        const selected = state.selectedClips ?? (state.selectedClip === null ? [] : [state.selectedClip]);
        if (selected.length === 0) return;
        setPlaying(false);
        store.deleteSelectedClips();
      }, [state.selectedClips, state.selectedClip, store]);
      const handleUndo = useCallback(() => {
        setPlaying(false);
        store.undo();
      }, [store]);
      const handleRedo = useCallback(() => {
        setPlaying(false);
        store.redo();
      }, [store]);
      const closeExport = useCallback(() => setExportOpen(false), []);
      const openExport = useCallback(() => {
        if (!canExport) return;
        setPlaying(false);
        setExportOpen(true);
      }, [canExport]);
      const toggleMute = useCallback(() => setMuted((value) => !value), []);
      const changeVolume = useCallback((value) => {
        setVolume(clamp(value, 0, 1));
        setMuted(false);
      }, []);

      useEffect(() => {
        const onKey = (event) => {
          if (exportOpen) return;
          const root = rootRef.current;
          if (root === null || root.offsetParent === null) return;
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body && !root.contains(active)) {
            // Focus escaped the overlay (for example by tabbing from a covered
            // control): keep Escape/close working and pull focus back in.
            if (event.key === 'Escape') {
              event.preventDefault();
              if (typeof onCloseWorkbench === 'function') onCloseWorkbench();
              return;
            }
            if (event.key === 'Tab') {
              const items = focusableInRoot();
              if (items.length > 0) {
                event.preventDefault();
                const targetFocus = event.shiftKey ? items[items.length - 1] : items[0];
                targetFocus.focus({ preventScroll: true });
              }
            }
            return;
          }
          if (event.key === 'Tab') {
            const items = focusableInRoot();
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus({ preventScroll: true });
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus({ preventScroll: true });
            }
            return;
          }
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          // Only a nested modal dialog (the export dialog) owns shortcuts; the
          // workbench overlay itself is role="dialog" and must not suppress them.
          if (target.closest('.dsd-modal') !== null) return;
          if (event.key === 'Escape') {
            if (root.querySelector('.dsd-popover, .dsd-contextmenu') !== null) return;
            if (showChat) {
              const chatColumn = root.querySelector('.dsd-chatpanel');
              const drawerVisible = chatColumn !== null && typeof getComputedStyle === 'function'
                && getComputedStyle(chatColumn).position === 'absolute';
              setShowChat(false);
              if (drawerVisible) return;
            }
            const assetsPanel = root.querySelector('.dsd-assets');
            if (target.closest('.dsd-assets') !== null && assetsPanel !== null
              && Number(assetsPanel.getAttribute('data-asset-selection') ?? 0) > 0) return;
            setExpanded(false);
            setShowAssets(false);
            if (typeof onCloseWorkbench === 'function') onCloseWorkbench();
            return;
          }

          const inField = target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
          if (inField) return;
          if ((target.closest('.dsd-assets') !== null || target.closest('.dsd-chatpanel') !== null)
            && (event.key === 'Delete' || event.key === 'Backspace'
              || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a'))) return;
          const interactive = target.closest('button, a, [role="button"], input, textarea, select, [contenteditable="true"], [role="textbox"], [role="separator"], [tabindex]') !== null;
          const onClip = target.closest('.dsd-clip') !== null;
          const command = event.metaKey || event.ctrlKey;
          if (command && event.key.toLowerCase() === 'a') {
            const assetsPanel = root.querySelector('.dsd-assets');
            if (assetsPanel instanceof HTMLElement && assetsPanel !== target) {
              event.preventDefault();
              assetsPanel.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'a',
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                bubbles: true,
              }));
            }
            return;
          }
          if (command && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) handleRedo();
            else handleUndo();
            return;
          }
          if (event.code === 'Space') {
            if (target.closest('button, a, [role="button"], [role="separator"], [tabindex]')) return;
            event.preventDefault();
            togglePlay();
            return;
          }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            if (interactive) return;
            event.preventDefault();
            const step = event.shiftKey ? 5 : 1;
            seekActive(positionsRef.current[previewMode] + (event.key === 'ArrowLeft' ? -step : step));
            return;
          }
          if (interactive && !onClip) return;
          if (!command && event.key.toLowerCase() === 's') {
            event.preventDefault();
            if (previewMode === 'timeline') handleSplit();
            return;
          }
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            handleDelete();
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [exportOpen, focusableInRoot, handleDelete, handleRedo, handleSplit, handleUndo, onCloseWorkbench, previewMode, seekActive, showChat, togglePlay]);

      return h('div', {
        ref: rootRef,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('panel.label'),
        className: cx('dsd-root', 'dsd-overlay', expanded && 'dsd-focus', showAssets && 'dsd-assets-open', showChat && 'dsd-chat-open'),
      },
      h('style', null, CSS),
      h('div', {
        className: 'dsd-chat-backdrop',
        'aria-hidden': 'true',
        onClick: () => setShowChat(false),
      }),
      h(TopBar, {
        t,
        state,
        canExport,
        onExport: openExport,
        onRenameProject: (name) => store.setProjectName(name),
        onLoadProject: requestProjectLoad,
        onExportProject: handleProjectExport,
        onSetAutoBackup: handleSetAutoBackup,
        onRestoreBackup: handleRestoreBackup,
        onClearBackups: handleClearBackups,
        onNewProject: handleNewProject,
        onSwitchProject: handleSwitchProject,
        onDeleteProject: handleDeleteProject,
        onToggleAssets: () => {
          setShowAssets((value) => !value);
        },
        onOpenConversation: focusComposer,
        onCloseWorkbench,
        showAssets,
      }),
      h('main', { className: 'dsd-main' },
        h(AssetPanel, {
          t,
          state,
          localeId,
          fileDrag,
          onImport: requestImport,
          onImportConversationObject: handleImportConversationObject,
          onSelect: chooseAsset,
          onSetSelection: handleSetAssetSelection,
          onDeleteEntries: handleDeleteEntries,
          onClearImportError: () => store.clearImportError(),
        }),
        h(PreviewPanel, {
          t,
          state,
          previewMode,
          timeline: state.timeline,
          assets: state.assets,
          canvasRef,
          selectedGeneration,
          selectedUpload,
          activeDuration,
          displayTime,
          playing,
          canPlay,
          onTogglePlay: togglePlay,
          onSeek: seekActive,
          volume,
          muted,
          onVolume: changeVolume,
          onMuted: toggleMute,
          expanded,
          onExpand: () => setExpanded((value) => !value),
          onDescribe: focusComposer,
          onImport: requestImport,
          onAspect: (next) => store.setAspect(next),
        }),
        h('aside', {
          ref: chatPanelRef,
          className: cx('dsd-chatpanel', 'dsd-panel', chatDropActive && 'is-drop-target'),
          'aria-label': t('session.chatTitle'),
          onDragOver: handleChatDragOver,
          onDragLeave: handleChatDragLeave,
          onDrop: handleChatDrop,
        },
          chatDropActive
            ? h('div', { className: 'dsd-chat-dropmask', 'aria-hidden': 'true' },
              h(Icon, { name: 'sparkles', size: 18 }),
              h('span', null, t('chat.dropAsset')))
            : null,
          h('div', { className: 'dsd-chatpanelhead' },
            h(Icon, { name: 'sparkles', size: 13 }),
            h('span', null, t('session.chatTitle'))),
          h('div', { className: 'dsd-chatpanelbody' }, chatPanel ?? null)),
        h(TimelinePanel, {
          t,
          state,
          store,
          playing,
          previewMode,
          displayTime,
          onSeek: seekTimeline,
          onSelectClip: handleSelectClip,
          onSelectClips: handleSelectClips,
          onDropItem: handleDropItem,
          onAddBed: handleAddBed,
          onSplit: handleSplit,
          onDelete: handleDelete,
          onUndo: handleUndo,
          onRedo: handleRedo,
          onPause: pause,
        })),
      h('div', {
        className: 'dsd-drawer-backdrop',
        'aria-hidden': 'true',
        onClick: () => {
          setShowAssets(false);
        },
      }),
      h('input', {
        ref: fileInputRef,
        type: 'file',
        accept: 'image/*,video/*,audio/*',
        multiple: true,
        hidden: true,
        'aria-label': t('actions.import'),
        onChange: (event) => {
          const files = event.target.files === null ? [] : [...event.target.files];
          event.target.value = '';
          requestImport(files);
        },
      }),
      h('input', {
        ref: projectInputRef,
        type: 'file',
        accept: '.deepseek.json,application/json,.json',
        hidden: true,
        'aria-label': t('project.load'),
        onChange: (event) => {
          const file = event.target.files === null ? null : event.target.files[0];
          event.target.value = '';
          handleProjectImport(file);
        },
      }),
      h(Toast, { toast: state.toast }),
      exportOpen ? h(ExportModal, {
        t,
        state,
        localeId,
        onClose: closeExport,
        onToast: (text, tone) => store.showToast(text, tone),
        onBeforeExport: pause,
        onAddExportedAsset: (payload) => store.addExportedVideo(payload, localeId),
      }) : null);
    }
    // @@UI_END

    function apply(ctx) {
      const dictionaryDisposers = [];
      try {
        dictionaryDisposers.push(ctx.locale.register(NS, 'zh', zh));
        dictionaryDisposers.push(ctx.locale.register(NS, 'en', en));
      } catch (error) {
        console.error('[deepseek-design] locale registration failed', error);
      }
      ctx.effect(() => () => {
        for (const dispose of dictionaryDisposers) {
          try {
            dispose();
          } catch {
            // The registry already withdrew it.
          }
        }
      }, 'deepseek-design: dictionaries');

      const store = createWorkbenchStore(ctx);
      ctx.effect(() => () => store.dispose(), 'deepseek-design: workbench store');
      let fileDrag = null;
      try {
        fileDrag = ctx.get?.('fileDrag') ?? ctx.fileDrag ?? null;
      } catch {
        fileDrag = null;
      }

      const chatTitle = ctx.locale.bind(NS);
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: DESIGN_OVERLAY_ID,
        order: 40,
        locale: NS,
        children: {
          [DESIGN_CHAT_SLOT]: { kind: 'single', scope: 'session' },
        },
      }, (props) => h(WorkbenchOverlay, { ...props, ctx, store, fileDrag })));
      ctx.slots.inject(DESIGN_CHAT_SLOT, () => ctx.slots.register({
        name: DESIGN_CHAT_SLOT,
        locale: NS,
      }, (props) => h(DesignConversationPanel, { ...props, store })));

      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'deepseek-design-open',
        order: 5,
        label: () => chatTitle('session.openWorkbench'),
        locale: NS,
      }, (props) => h(DesignChatHeaderButton, { ...props, onClick: () => setDesignOverlay(true) })));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        label: () => ctx.locale.bind(NS)('panel.label'),
      }, (props) => h(PanelGlyph, { ...props })));

      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: EXPORT_VIDEO_TOOL,
        locale: NS,
      }, (props) => h(ExportVideoToolRow, { ...props, ctx })));

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, (props) => h(WorkbenchLauncher, { ...props, ctx })));
    }

    return {
      inject: ['slots', 'locale', 'layout', 'sessions', 'fileDrag'],
      apply,
    };
  },
});
