/**
 * Client half of dsh-workspace-style.
 *
 * Two jobs:
 *
 * 1. Replace the Workspace row menu's built-in Rename entry with an Edit entry
 *    that opens one dialog covering name, icon, and color. The Host has no
 *    icon/color fields on a Workspace record, so the style is a browser-owned
 *    decoration keyed by the stable Workspace id (`localStorage`). Either axis
 *    may stay at its system default: the first tiles in the dialog mean
 *    "keep the native folder icon" and "follow the system coloring".
 * 2. Paint those styles onto the sidebar's Workspace rows. ui-workspace does
 *    not expose a Workspace-row decoration slot, so rows are decorated through
 *    their stable `data-row-key="workspace:<id>"` attribute and one injected
 *    stylesheet. A custom icon is drawn with a CSS mask, which keeps it
 *    aligned with the built-in folder glyph in both themes and on every hover
 *    state; icons that define an open variant swap it while the row is
 *    expanded, mirroring the built-in folder's two states. A custom color is
 *    either a fixed tint or "follow system", which inherits the built-in
 *    rest-gray / active-blue logic instead of overriding it.
 *
 * The built-in Rename item cannot be unregistered from another plugin
 * (`ctx.contextMenus` rejects duplicate contribution ids and only owns its own
 * disposers), so the menu mutation observer hides it in place while our Edit
 * entry is present. The hide is scoped to a menu that actually contains our
 * entry and matches the label resolved from the built-in `workspace` locale
 * namespace, so Session menus and other targets are untouched.
 */

window.__ModuleLoader__.load({
  id: 'dsh-workspace-style',
  factory(require) {
    const React = require('react');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const { Modal, Button } = primitives;
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-workspace-style';
    /**
     * Browser-owned style map: one entry per stable Workspace id, each an
     * `{icon, color}` pair where `null` on an axis means "system default"
     * for it. A both-null pair is never stored — saving it resets the row.
     */
    const STORAGE_KEY = 'dsh-workspace-style:styles:v1';
    /** Row decoration attribute; also the stylesheet's selector hook. */
    const STYLE_ATTR = 'data-dsh-workspace-style';
    /** Inline menu hiding attribute (belt-and-braces with display:none). */
    const HIDDEN_ATTR = 'data-dsh-workspace-style-hidden';
    /** Workspace rows carry exactly this prefix in the sidebar DOM. */
    const ROW_PREFIX = 'workspace:';
    /**
     * Fallback glyph when an unknown icon id reaches a renderer (defensive
     * only; storage validation drops unknown ids). `null` in a saved style
     * is the real "system default" marker for that axis.
     */
    const DEFAULT_ICON = 'folder';

    // --- dictionaries -------------------------------------------------------

    const DICT = {
      zh: {
        'menu.edit': '编辑',
        'dialog.title': '编辑工作区',
        'field.name': '工作区名称',
        'field.icon': '工作区图标',
        'field.color': '工作区颜色',
        'icon.default': '系统默认图标',
        'color.followSystem': '跟随系统（默认灰色，选中时高亮蓝色）',
        'action.cancel': '取消',
        'action.save': '保存',
        'action.saving': '保存中…',
        'error.nameConflict': '已有同名工作区：{name}',
        'error.renameFailed': '保存失败：{message}',
        'error.storage': '无法保存工作区外观：浏览器存储不可用。',
      },
      en: {
        'menu.edit': 'Edit',
        'dialog.title': 'Edit workspace',
        'field.name': 'Workspace name',
        'field.icon': 'Workspace icon',
        'field.color': 'Workspace color',
        'icon.default': 'Default (system) icon',
        'color.followSystem': 'Follow system (gray at rest, blue when active)',
        'action.cancel': 'Cancel',
        'action.save': 'Save',
        'action.saving': 'Saving…',
        'error.nameConflict': 'A workspace with that name already exists: {name}',
        'error.renameFailed': 'Could not save: {message}',
        'error.storage': 'Could not save the workspace style: browser storage is unavailable.',
      },
    };

    // --- icon catalogue -----------------------------------------------------
    //
    // Line art, 24x24 with a 1.5 stroke by default; entries may override
    // `viewBox`/`strokeWidth` to reuse geometry drawn at another scale. The
    // same markup feeds two renderers: inline masked glyphs in the dialog
    // and a data-URI mask for the sidebar row. Filled details are explicit
    // `fill="black"` so they stay opaque under the mask.
    //
    // `svgOpen` (optional) is the expanded-state glyph: the sidebar swaps to
    // it while the row carries aria-expanded="true", the same way the
    // built-in folder shows open/closed. Icons with no natural open form
    // omit it; the hover chevron and the visible child rows keep carrying
    // the expansion state for them.
    //
    // `folder` copies the host's own 16x16 geometry (regular weight, from
    // dsh-client-ui-primitives) so the plugin folder and the built-in one
    // are the same drawing, with both states. The dialog hides it behind
    // the explicit "default" tile: choosing default plus a color renders
    // identically, and only that combination can keep tracking the host if
    // its folder art ever changes.

    const ICONS = [
      {
        id: 'folder',
        viewBox: '0 0 16 16',
        strokeWidth: 1,
        svg: '<path d="M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z"/><path d="M3.63501 7.66614H12.3647"/>',
        svgOpen:
          '<path d="M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z" fill="black" opacity="0.16"/>' +
          '<path d="M13.6491 6.69446C14.6346 6.69453 15.3522 7.62895 15.0983 8.58118L13.9245 12.9845C13.7494 13.6412 13.1539 14.0988 12.4743 14.0988H2.35126C1.36574 14.0988 0.648153 13.1643 0.902044 12.212L2.07587 7.80774C2.25102 7.15128 2.84567 6.69455 3.52509 6.69446H13.6491ZM3.52509 7.69446C3.29865 7.69455 3.10004 7.84674 3.04169 8.06555L1.86786 12.4698C1.78345 12.7872 2.02285 13.0988 2.35126 13.0988H12.4743C12.7007 13.0988 12.8992 12.9463 12.9577 12.7277L14.1325 8.32336C14.2171 8.00598 13.9776 7.69453 13.6491 7.69446H3.52509Z" fill="black"/>' +
          '<path d="M4.7666 1.90137C5.13227 1.90144 5.48571 2.03525 5.75977 2.27734L7.27246 3.61328C7.36379 3.69382 7.48174 3.73828 7.60352 3.73828H12.3994C13.2276 3.73841 13.8993 4.41005 13.8994 5.23828V6.7168C13.8183 6.70327 13.735 6.69436 13.6494 6.69434H12.8994V5.23828C12.8993 4.96233 12.6754 4.73841 12.3994 4.73828H7.60352C7.23781 4.73828 6.88446 4.60438 6.61035 4.3623L5.09766 3.02637C5.00636 2.94576 4.88838 2.90144 4.7666 2.90137H2.0498C1.77366 2.90137 1.5498 3.12523 1.5498 3.40137V9.78223L0.902344 12.2119C0.648452 13.1642 1.36604 14.0986 2.35156 14.0986H2.0498C1.2214 14.0986 0.549838 13.427 0.549805 12.5986V3.40137C0.549805 2.57294 1.22138 1.90137 2.0498 1.90137H4.7666Z" fill="black"/>',
      },
      {
        id: 'cup',
        svg: '<path d="M5 8.5h10.5v5.2a4.3 4.3 0 0 1-4.3 4.3H9.3A4.3 4.3 0 0 1 5 13.7z"/><path d="M15.5 9.8h1.4a2.6 2.6 0 0 1 0 5.2h-1.4"/><path d="M8 4.5c.7.8.7 1.6 0 2.4M11.5 4.5c.7.8.7 1.6 0 2.4"/>',
      },
      {
        id: 'martini',
        svg: '<path d="M4 5h16l-8 8z"/><path d="M12 13v6M8.5 19h7"/>',
      },
      {
        id: 'cupcake',
        svg: '<path d="M7 12.5h10l-1.2 5.8a2 2 0 0 1-2 1.6h-3.6a2 2 0 0 1-2-1.6z"/><path d="M7.4 12.5a2.4 2.4 0 0 1 .7-4.7A3 3 0 0 1 12 5.5a3 3 0 0 1 3.9 2.3 2.4 2.4 0 0 1 .7 4.7"/><path d="M12 5.5V4"/>',
      },
      {
        id: 'moon',
        svg: '<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z"/>',
      },
      {
        id: 'flower',
        svg: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(45 12 12)"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(90 12 12)"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(135 12 12)"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(180 12 12)"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(225 12 12)"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(270 12 12)"/><ellipse cx="12" cy="5.6" rx="1.7" ry="2.5" transform="rotate(315 12 12)"/>',
      },
      {
        id: 'chip',
        svg: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M15 2v2M15 20v2M9 2v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/>',
      },
      {
        id: 'frame',
        svg: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
      },
      {
        id: 'gear',
        svg: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
      },
      {
        id: 'plug',
        svg: '<path d="M9 3.5v5M15 3.5v5"/><path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v3.5"/>',
      },
      {
        id: 'bear',
        svg: '<circle cx="12" cy="13" r="5.2"/><circle cx="7.6" cy="8.4" r="2"/><circle cx="16.4" cy="8.4" r="2"/><circle cx="10.2" cy="12.2" r=".7" fill="black" stroke="none"/><circle cx="13.8" cy="12.2" r=".7" fill="black" stroke="none"/><path d="M10.5 14.8c.9.8 2.1.8 3 0"/>',
      },
      {
        id: 'ghost',
        svg: '<path d="M6.5 18.5V11a5.5 5.5 0 0 1 11 0v7.5l-1.8-1.4-1.8 1.4-1.9-1.4-1.8 1.4-1.9-1.4z"/><circle cx="10" cy="10.5" r=".8" fill="black" stroke="none"/><circle cx="14" cy="10.5" r=".8" fill="black" stroke="none"/>',
      },
      {
        id: 'alien',
        svg: '<path d="M12 3.5c3.6 0 6 2.7 6 6.3 0 4.2-3.2 8.1-6 10.7-2.8-2.6-6-6.5-6-10.7 0-3.6 2.4-6.3 6-6.3Z"/><path d="M9 10.5l1.8-1.4M15 10.5l-1.8-1.4"/>',
      },
      {
        id: 'bell',
        svg: '<path d="M6.5 16.5h11l-1.3-1.9V10a4.2 4.2 0 0 0-8.4 0v4.6z"/><path d="M10 18.5a2 2 0 0 0 4 0"/><path d="M12 4v1.5"/>',
      },
      {
        id: 'flask',
        svg: '<path d="M9.5 3.5h5M10 3.5v5L5.5 17a2.5 2.5 0 0 0 2.2 3.5h8.6a2.5 2.5 0 0 0 2.2-3.5L14 8.5v-5"/><path d="M8 14.5h8"/>',
      },
    ];

    const ICON_IDS = new Set(ICONS.map((icon) => icon.id));
    const ICON_BY_ID = new Map(ICONS.map((icon) => [icon.id, icon]));

    // --- color catalogue ----------------------------------------------------
    //
    // Colors are stored by id, never by hex: the palette can be retuned
    // without rewriting every saved Workspace. Values mirror the dialog's
    // reference palette.

    const COLORS = [
      { id: 'teal', hex: '#4E9C8B' },
      { id: 'green', hex: '#5A9E6F' },
      { id: 'blue', hex: '#2F6FED' },
      { id: 'amber', hex: '#E7A33C' },
      { id: 'coral', hex: '#E85C4A' },
      { id: 'pink', hex: '#D5478F' },
      { id: 'indigo', hex: '#6B5BE0' },
      { id: 'yellow', hex: '#E4B23C' },
      { id: 'orange', hex: '#D97A2B' },
      { id: 'sea', hex: '#4C9B93' },
      { id: 'sky', hex: '#2F8DF0' },
      { id: 'gray', hex: '#9AA0A6' },
      { id: 'ink', hex: '#1F2328' },
      { id: 'lavender', hex: '#B7A6F4' },
      { id: 'moss', hex: '#5E9E7C' },
    ];

    const COLOR_IDS = new Set(COLORS.map((color) => color.id));
    const COLOR_BY_ID = new Map(COLORS.map((color) => [color.id, color]));

    // --- shared helpers -----------------------------------------------------

    const maskCache = new Map();

    /**
     * Build (and cache) the CSS mask URL for one catalogued icon state.
     * @param iconId - catalogued icon id, or an unknown id to fall back.
     * @param open - true for the expanded-state glyph when the icon has one.
     * @returns a `url("data:...")` value for mask-image.
     */
    function iconMaskUrl(iconId, open) {
      const icon = ICON_BY_ID.get(iconId) ?? ICON_BY_ID.get(DEFAULT_ICON);
      const body = open ? (icon.svgOpen ?? icon.svg) : icon.svg;
      const key = icon.id + (open ? ':open' : '');
      let url = maskCache.get(key);
      if (url === undefined) {
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (icon.viewBox ?? '0 0 24 24') +
          '" fill="none" stroke="black" stroke-width="' + (icon.strokeWidth ?? 1.5) +
          '" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
        url = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
        maskCache.set(key, url);
      }
      return url;
    }

    /** @param iconId - catalogued icon id. @returns its collapsed-state mask. */
    function maskUrl(iconId) {
      return iconMaskUrl(iconId, false);
    }

    /** @param iconId - catalogued icon id. @returns an expanded-state mask, or null when the icon has none. */
    function openMaskUrl(iconId) {
      const icon = ICON_BY_ID.get(iconId);
      return icon !== undefined && icon.svgOpen !== undefined ? iconMaskUrl(iconId, true) : null;
    }

    /**
     * @param value - unknown persisted icon/color pair. `null` on either axis
     * means "system default" for that axis; a both-default entry is not a
     * style at all. @returns a validated style or null.
     */
    function normalizeStyle(value) {
      if (value === null || typeof value !== 'object') return null;
      const icon = value.icon ?? null;
      const color = value.color ?? null;
      if (icon === null && color === null) return null;
      if (icon !== null && !ICON_IDS.has(icon)) return null;
      if (color !== null && !COLOR_IDS.has(color)) return null;
      return { icon, color };
    }

    /** @returns the saved style map, dropping unreadable or stale entries. */
    function readStyles() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || parsed.v !== 1) return {};
        const source = parsed.styles;
        if (source === null || typeof source !== 'object') return {};
        const styles = {};
        for (const [workspaceId, value] of Object.entries(source)) {
          const style = normalizeStyle(value);
          if (style !== null) styles[workspaceId] = style;
        }
        return styles;
      } catch {
        return {};
      }
    }

    /** @param styles - complete style map. @returns true when the write succeeded. */
    function writeStyles(styles) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, styles }));
        return true;
      } catch {
        return false;
      }
    }

    /** @param value - rendered label text. @returns collapsed, trimmed text for label matching. */
    function normalizeText(value) {
      return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    // --- plugin -------------------------------------------------------------

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      const workspaceT = ctx.locale.bind('workspace');
      /** Saved styles, replaced wholesale on external storage changes. */
      let styles = readStyles();

      // --- editor state -----------------------------------------------------

      const editorListeners = new Set();
      let editorTarget = null;
      let openSeq = 0;

      /** @param next - the captured Workspace and seeded form values. */
      function openEditor(next) {
        // The key remounts the form per open, so its inputs seed from the
        // captured Workspace without a stale-value frame.
        editorTarget = { ...next, key: ++openSeq };
        for (const listener of editorListeners) listener();
      }

      function closeEditor() {
        if (editorTarget === null) return;
        editorTarget = null;
        for (const listener of editorListeners) listener();
      }

      const editorStore = {
        subscribe(listener) {
          editorListeners.add(listener);
          return () => editorListeners.delete(listener);
        },
        getSnapshot() {
          return editorTarget;
        },
      };

      // --- sidebar decoration ----------------------------------------------

      /**
       * Attach or clear the style of one rendered Workspace row. The row
       * attribute carries word flags — `icon` swaps the built-in glyph for a
       * mask, `color` tints whatever glyph is showing — so each axis stays
       * independently restorable: "default icon + custom color" keeps the
       * native folder with both its states and only recolors it, and
       * "custom icon + follow system" keeps the built-in rest-gray /
       * active-blue coloring.
       * @param row - the `[data-row-key^="workspace:"]` element.
       */
      function decorateRow(row) {
        const key = row.getAttribute('data-row-key') ?? '';
        if (!key.startsWith(ROW_PREFIX)) return;
        const workspaceId = key.slice(ROW_PREFIX.length);
        const style = workspaceId === '' ? undefined : styles[workspaceId];
        if (style === undefined) {
          if (row.hasAttribute(STYLE_ATTR)) {
            row.removeAttribute(STYLE_ATTR);
            row.style.removeProperty('--dsh-ws-color');
            row.style.removeProperty('--dsh-ws-icon');
            row.style.removeProperty('--dsh-ws-icon-open');
          }
          return;
        }
        const flags = [];
        if (style.icon === null) {
          row.style.removeProperty('--dsh-ws-icon');
          row.style.removeProperty('--dsh-ws-icon-open');
        } else {
          flags.push('icon');
          row.style.setProperty('--dsh-ws-icon', maskUrl(style.icon));
          const openUrl = openMaskUrl(style.icon);
          if (openUrl === null) row.style.removeProperty('--dsh-ws-icon-open');
          else row.style.setProperty('--dsh-ws-icon-open', openUrl);
        }
        if (style.color === null) row.style.removeProperty('--dsh-ws-color');
        else {
          flags.push('color');
          row.style.setProperty('--dsh-ws-color', COLOR_BY_ID.get(style.color).hex);
        }
        row.setAttribute(STYLE_ATTR, flags.join(' '));
      }

      /** Refresh every Workspace row currently in the document. */
      function decorateAll() {
        const rows = document.querySelectorAll('[data-row-key^="' + ROW_PREFIX + '"]');
        for (const row of rows) decorateRow(row);
      }

      // --- built-in Rename hiding ------------------------------------------
      //
      // The built-in Workspace menu registers the `workspace.rename`
      // contribution; another plugin cannot unregister it. Hide only the item
      // whose label equals the built-in `workspace` dictionary's `rename`
      // entry, and only inside a menu that contains our Edit item. That keeps
      // Session menus and the Delete item untouched.

      function hideBuiltinRename() {
        // Only the Workspace menu can contain the built-in Rename entry; this
        // also keeps a Session menu with an "Edit"-looking item untouched.
        if (ctx.contextMenus.active.getSnapshot()?.kind !== 'workspace') return;
        const editLabel = normalizeText(t('menu.edit'));
        const renameLabel = normalizeText(workspaceT('rename'));
        if (editLabel === '' || renameLabel === '' || editLabel === renameLabel) return;
        // `bind` falls back to the key when the namespace is not loaded; the
        // real English label is "Rename", so the bare key means "not ready".
        if (renameLabel === 'rename') return;

        const menus = new Set();
        for (const button of document.querySelectorAll('button[role="menuitem"]')) {
          if (normalizeText(button.textContent) !== editLabel) continue;
          const menu = button.closest('[role="menu"]');
          if (menu !== null) menus.add(menu);
        }
        for (const menu of menus) {
          for (const button of menu.querySelectorAll('button[role="menuitem"]')) {
            if (normalizeText(button.textContent) !== renameLabel) continue;
            const wrapper = button.parentElement ?? button;
            wrapper.setAttribute(HIDDEN_ATTR, '');
            wrapper.style.display = 'none';
          }
        }
      }

      // --- mutation observation --------------------------------------------

      let scheduled = false;
      function scheduleSync() {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          decorateAll();
          hideBuiltinRename();
        });
      }

      // --- persistence -----------------------------------------------------

      /**
       * Persist one Workspace's style. A fully-default selection (both null)
       * is a reset: the entry drops out of the map instead of being stored.
       * @param workspaceId - stable Workspace id. @param style - icon/color selection.
       */
      function saveStyle(workspaceId, style) {
        const next = { ...styles };
        if (style.icon === null && style.color === null) delete next[workspaceId];
        else next[workspaceId] = style;
        if (!writeStyles(next)) return false;
        styles = next;
        decorateAll();
        return true;
      }

      function onStorage(event) {
        if (event.key !== STORAGE_KEY) return;
        styles = readStyles();
        decorateAll();
      }

      // --- plugins wiring --------------------------------------------------

      ctx.effect(
        () => ctx.locale.register(NS, DICT),
        'dsh-workspace-style: dictionaries',
      );

      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin-css', NS);
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      }, 'dsh-workspace-style: stylesheet');

      ctx.effect(() => {
        window.addEventListener('storage', onStorage);
        const observer = new MutationObserver(scheduleSync);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-row-key'],
        });
        scheduleSync();
        return () => {
          window.removeEventListener('storage', onStorage);
          observer.disconnect();
        };
      }, 'dsh-workspace-style: row decoration');

      // Menu icon: a pencil, matching the built-in Rename affordance.
      function EditMenuIcon() {
        return h(
          'svg',
          {
            width: 16,
            height: 16,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z' }),
          h('path', { d: 'M13.5 5.5l3 3' }),
        );
      }

      ctx.slots.inject('contextMenu.icon', () =>
        ctx.slots.register(
          { name: 'contextMenu.icon', key: 'workspace.style.edit' },
          EditMenuIcon,
        ),
      );

      ctx.effect(
        () =>
          ctx.contextMenus.register({
            id: 'workspace.style',
            target: 'workspace',
            order: 100,
            resolve: ({ workspaceId, displayTitle }) => [
              {
                id: 'edit',
                label: t('menu.edit'),
                icon: { key: 'workspace.style.edit' },
                run: () => {
                  const items = ctx.workspaces.list.getSnapshot().items;
                  const row = items.find((item) => item.workspaceId === workspaceId);
                  const saved = styles[workspaceId];
                  const savedIcon = saved === undefined ? null : saved.icon;
                  openEditor({
                    workspaceId,
                    title: displayTitle,
                    storedTitle: row?.title ?? displayTitle,
                    // A saved `folder` renders exactly like the default
                    // icon, so the dialog presents it as the default choice.
                    icon: savedIcon === null || savedIcon === DEFAULT_ICON ? null : savedIcon,
                    color: saved === undefined ? null : saved.color,
                    canRename: canRename(workspaceId),
                  });
                },
              },
            ],
          }),
        'dsh-workspace-style: workspace menu',
      );

      /** @param workspaceId - target Workspace. @returns whether this peer may rename it. */
      function canRename(workspaceId) {
        try {
          return ctx.remoteAccess.source('workspace', workspaceId, 'workspace/rename').getSnapshot();
        } catch {
          return true;
        }
      }

      // --- dialog ----------------------------------------------------------

      function glyph(iconId) {
        return h('span', {
          className: 'dsws-glyph',
          'aria-hidden': true,
          style: { '--dsws-glyph': maskUrl(iconId) },
        });
      }

      function EditorDialog({ target, translate }) {
        const [draft, setDraft] = React.useState(target.title);
        const [icon, setIcon] = React.useState(target.icon);
        const [color, setColor] = React.useState(target.color);
        const [busy, setBusy] = React.useState(false);
        const [error, setError] = React.useState(null);
        const composing = React.useRef(false);

        const trimmed = draft.trim();
        const workspaces = ctx.workspaces.list.getSnapshot().items;
        const duplicate =
          trimmed !== '' &&
          workspaces.some(
            (workspace) =>
              workspace.workspaceId !== target.workspaceId && workspace.title === trimmed,
          );
        const blocked = busy || trimmed === '' || duplicate;

        const close = () => {
          if (busy) return;
          closeEditor();
        };

        const save = async () => {
          if (blocked) return;
          setBusy(true);
          setError(null);
          try {
            if (target.canRename && trimmed !== target.storedTitle) {
              await ctx.workspaces.rename(target.workspaceId, trimmed);
            }
            if (!saveStyle(target.workspaceId, { icon, color })) {
              setBusy(false);
              setError(translate('error.storage'));
              return;
            }
            closeEditor();
          } catch (reason) {
            setBusy(false);
            setError(
              translate('error.renameFailed', {
                message: reason instanceof Error ? reason.message : String(reason),
              }),
            );
          }
        };

        const nameRow = h(
          'div',
          { className: 'dsws-section' },
          h(
            'label',
            { className: 'dsws-label', htmlFor: 'dsws-name' },
            translate('field.name'),
          ),
          h('input', {
            id: 'dsws-name',
            className: 'dsws-input',
            value: draft,
            readOnly: !target.canRename,
            disabled: busy,
            'data-modal-autofocus': true,
            onFocus: (event) => event.target.select(),
            onChange: (event) => {
              setDraft(event.target.value);
              setError(null);
            },
            onCompositionStart: () => {
              composing.current = true;
            },
            onCompositionEnd: () => {
              composing.current = false;
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !composing.current) {
                event.preventDefault();
                void save();
              }
            },
          }),
          duplicate
            ? h(
                'div',
                { className: 'dsws-error', role: 'alert' },
                translate('error.nameConflict', { name: trimmed }),
              )
            : null,
          error !== null
            ? h('div', { className: 'dsws-error', role: 'alert' }, error)
            : null,
        );

        const iconRow = h(
          'div',
          { className: 'dsws-section' },
          h('div', { className: 'dsws-label' }, translate('field.icon')),
          h(
            'div',
            {
              className: 'dsws-grid',
              role: 'group',
              'aria-label': translate('field.icon'),
            },
            // First tile: the system default icon — the native folder, with
            // its open/closed states and the built-in rest-gray / active-blue
            // coloring left alone unless a color is chosen below.
            h(
              'button',
              {
                key: 'default',
                type: 'button',
                className: 'dsws-tile',
                'aria-pressed': icon === null,
                'aria-label': translate('icon.default'),
                disabled: busy,
                onClick: () => setIcon(null),
              },
              glyph(DEFAULT_ICON),
            ),
            // The catalog's folder is hidden: it is the same drawing as the
            // default tile (legacy saved ids stay valid through the alias).
            ICONS.filter((entry) => entry.id !== DEFAULT_ICON).map((entry, index) =>
              h(
                'button',
                {
                  key: entry.id,
                  type: 'button',
                  className: 'dsws-tile',
                  'aria-pressed': icon === entry.id,
                  'aria-label': translate('field.icon') + ' ' + (index + 1),
                  disabled: busy,
                  onClick: () => setIcon(entry.id),
                },
                glyph(entry.id),
              ),
            ),
          ),
        );

        const colorRow = h(
          'div',
          { className: 'dsws-section' },
          h('div', { className: 'dsws-label' }, translate('field.color')),
          h(
            'div',
            {
              className: 'dsws-grid',
              role: 'group',
              'aria-label': translate('field.color'),
            },
            // First tile: follow the system — gray at rest, highlighted
            // blue while the workspace holds the current session. The
            // split dot shows both of those system colors at once.
            h(
              'button',
              {
                key: 'follow-system',
                type: 'button',
                className: 'dsws-tile dsws-swatch',
                'aria-pressed': color === null,
                'aria-label': translate('color.followSystem'),
                disabled: busy,
                onClick: () => setColor(null),
              },
              h('span', { className: 'dsws-dot dsws-dot-system', 'aria-hidden': true }),
            ),
            COLORS.map((entry, index) =>
              h(
                'button',
                {
                  key: entry.id,
                  type: 'button',
                  className: 'dsws-tile dsws-swatch',
                  'aria-pressed': color === entry.id,
                  'aria-label': translate('field.color') + ' ' + (index + 1),
                  disabled: busy,
                  onClick: () => setColor(entry.id),
                },
                h('span', {
                  className: 'dsws-dot',
                  'aria-hidden': true,
                  style: { backgroundColor: entry.hex },
                }),
              ),
            ),
          ),
        );

        return h(
          Modal,
          {
            open: true,
            onClose: close,
            closeLabel: translate('action.cancel'),
            title: translate('dialog.title'),
            className: 'dsws-modal',
            footer: h(
              React.Fragment,
              null,
              h(
                Button,
                { variant: 'outline', disabled: busy, onClick: close },
                translate('action.cancel'),
              ),
              h(
                Button,
                { variant: 'primary', disabled: blocked, onClick: () => void save() },
                translate(busy ? 'action.saving' : 'action.save'),
              ),
            ),
          },
          h('div', { className: 'dsws-body' }, nameRow, iconRow, colorRow),
        );
      }

      function WorkspaceStyleDialog({ t: translate }) {
        const target = React.useSyncExternalStore(
          editorStore.subscribe,
          editorStore.getSnapshot,
          editorStore.getSnapshot,
        );
        if (target === null) return null;
        return h(EditorDialog, { key: target.key, target, translate });
      }

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'dsh-workspace-style',
            order: 900,
            locale: NS,
          },
          WorkspaceStyleDialog,
        ),
      );
    }

    // --- stylesheet ---------------------------------------------------------

    const CSS = `
/* ---- sidebar Workspace row decoration ---- */
/* The row attribute carries word flags. \`icon\` hides the built-in folder
   glyph and paints the chosen icon through a mask; \`color\` tints whatever
   glyph is showing. Each flag can appear alone, so "default icon + custom
   color" keeps the native folder (with both its states) and only recolors
   it, and "custom icon + follow system" keeps the built-in rest-gray /
   active-blue selection logic. Clearing the attribute restores it all. */
[data-dsh-workspace-style~="icon"] > span:first-child > svg {
  display: none;
}
[data-dsh-workspace-style~="icon"] > span:first-child::before {
  content: "";
  display: block;
  width: 16px;
  height: 16px;
  background-color: var(--dsh-ws-color, currentColor);
  -webkit-mask-image: var(--dsh-ws-icon);
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-image: var(--dsh-ws-icon);
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
}
/* Icons with an open variant follow the row's expansion state, the way the
   built-in folder swaps open/closed. */
[data-dsh-workspace-style~="icon"][aria-expanded="true"] > span:first-child::before {
  -webkit-mask-image: var(--dsh-ws-icon-open, var(--dsh-ws-icon));
  mask-image: var(--dsh-ws-icon-open, var(--dsh-ws-icon));
}
/* A chosen color beats the built-in rest-gray / active-blue coloring; the
   hover chevron (a different span) keeps its own tint either way. */
[data-dsh-workspace-style~="color"] > span:first-child {
  color: var(--dsh-ws-color) !important;
}

/* The built-in Rename row we hide while our Edit row is present. */
[data-dsh-workspace-style-hidden] {
  display: none !important;
}

/* ---- Edit dialog ---- */
.dsws-modal {
  /* Shrink to the width of one full row of icon/color tiles. The viewport
     clamp only takes over when that row cannot fit, and the grid then wraps. */
  width: max-content !important;
  max-width: calc(100vw - 48px) !important;
  max-height: calc(100vh - 64px) !important;
}
.dsws-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.dsws-section {
  display: flex;
  flex-direction: column;
}
.dsws-label {
  display: block;
  margin-bottom: 10px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.dsws-input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  border: 1px solid var(--dsw-alias-border-l4);
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  padding: 0 14px;
  font: inherit;
  font-size: 15px;
  line-height: 22px;
  outline: none;
}
.dsws-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}
.dsws-input[readonly] {
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}
.dsws-input:disabled {
  opacity: 0.6;
}
.dsws-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dsws-tile {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
@media (hover: hover) {
  .dsws-tile:hover {
    color: var(--dsw-alias-label-primary);
  }
}
.dsws-tile[aria-pressed="true"] {
  border-color: var(--dsw-alias-state-business-primary);
  background: transparent;
  color: var(--dsw-alias-label-primary);
}
.dsws-tile:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
.dsws-tile:disabled {
  opacity: 0.55;
  cursor: default;
}
.dsws-glyph {
  display: block;
  width: 22px;
  height: 22px;
  background-color: currentColor;
  -webkit-mask-image: var(--dsws-glyph);
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-image: var(--dsws-glyph);
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
}
.dsws-swatch .dsws-dot {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  /* The app sets a global superellipse corner shape; the palette uses true circles. */
  corner-shape: round;
}
.dsws-dot-system {
  /* Follow-system: gray at rest, blue while selected, shown as one split dot. */
  background: linear-gradient(
    135deg,
    var(--dsw-alias-state-business-primary) 0%,
    var(--dsw-alias-state-business-primary) 50%,
    var(--dsw-alias-label-tertiary) 50%,
    var(--dsw-alias-label-tertiary) 100%
  );
}
.dsws-error {
  margin-top: 8px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
`;

    return {
      inject: ['contextMenus', 'locale', 'remoteAccess', 'slots', 'workspaces'],
      apply,
    };
  },
});
