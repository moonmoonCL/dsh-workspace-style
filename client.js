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
 *    state. It mirrors the folder's full state model: the resting tint is
 *    the chosen color (or the built-in rest-gray when the color follows
 *    system), an open variant swaps in while the row is expanded, and a
 *    filled hollow variant swaps in while the workspace holds the current
 *    session — the built-in rest-gray / active-blue logic, answered with
 *    form instead of color.
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
    // Every entry carries three glyph forms so a custom icon can mirror the
    // built-in folder's full state model:
    //
    //   svg     — collapsed/resting outline, tinted with the chosen color
    //             (or the built-in rest-gray when the color follows system);
    //   svgOpen — expanded outline, swapped in purely via CSS while the row
    //             carries aria-expanded="true";
    //   svgFill — the active form, swapped in while the row's icon slot
    //             carries the built-in folderActive marker (the workspace
    //             holds the current session): a solid silhouette with a
    //             translucent hollow interior (opacity 0.2), matching the
    //             "filled version, hollow center" spec.
    //
    // All glyphs are fill-baked compound paths (no stroke), so entries carry
    // only a viewBox. Geometry comes from Phosphor Icons (MIT,
    // phosphoricons.com / github.com/phosphor-icons/core): the regular
    // weight for the outline forms and the duotone weight for the filled
    // form. Every icon is a natural state pair (closed -> open, idle ->
    // ringing, seedling -> flower, ...).
    //
    // `folder` is the one hand-picked exception: it keeps the host's own
    // 16x16 geometry (regular weight, extracted from dsh-client-ui-
    // primitives) with both states but no filled variant, because it stays
    // hidden behind the dialog's "default" tile — choosing default plus a
    // color renders the native folder (blue-active, not filled) instead.

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
        id: 'bag',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a48,48,0,0,1-96,0,8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0Z"/>',
        svgOpen: '<path fill="black" d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V72H40V56Zm0,144H40V88H216V200Zm-40-88a48,48,0,0,1-96,0,8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0Z"/>',
        svgFill: '<path fill="black" d="M224,56V200a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H216A8,8,0,0,1,224,56Z" opacity="0.2"/><path fill="black" d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a48,48,0,0,1-96,0,8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0Z"/>',
      },
      {
        id: 'envelope',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48Zm-96,85.2L52.6,64H203.4ZM98.7,128,40,181.8V74.2Zm11.8,10.9,12,11.1a8,8,0,0,0,10.8,0l12-11,58,53.2H52.6ZM157.3,128,216,74.2V181.8Z"/>',
        svgOpen: '<path fill="black" d="M228.4,89.3l-96-64a8,8,0,0,0-8.9,0l-96,64A8,8,0,0,0,24,96V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V96A8,8,0,0,0,228.4,89.3ZM96.7,152,40,192V111.5Zm16.4,8h29.8l56.6,40H56.5Zm46.2-8L216,111.5V192ZM128,41.6l81.9,54.6-67,47.8H113.1l-67-47.8Z"/>',
        svgFill: '<path fill="black" d="M224,56l-96,88L32,56Z" opacity="0.2"/><path fill="black" d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48Zm-96,85.2L52.6,64H203.4ZM98.7,128,40,181.8V74.2Zm11.8,10.9,12,11.1a8,8,0,0,0,10.8,0l12-11,58,53.2H52.6ZM157.3,128,216,74.2V181.8Z"/>',
      },
      {
        id: 'book',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M208,24H72A32,32,0,0,0,40,56V224a8,8,0,0,0,8,8H192a8,8,0,0,0,0-16H56a16,16,0,0,1,16-16H208a8,8,0,0,0,8-8V32A8,8,0,0,0,208,24Zm-8,160H72a31.8,31.8,0,0,0-16,4.3V56A16,16,0,0,1,72,40H200Z"/>',
        svgOpen: '<path fill="black" d="M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.8,39.8,0,0,0,96,192Zm128,0H160a39.8,39.8,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z"/>',
        svgFill: '<path fill="black" d="M208,32V192H72a24,24,0,0,0-24,24V56A24,24,0,0,1,72,32Z" opacity="0.2"/><path fill="black" d="M208,24H72A32,32,0,0,0,40,56V224a8,8,0,0,0,8,8H192a8,8,0,0,0,0-16H56a16,16,0,0,1,16-16H208a8,8,0,0,0,8-8V32A8,8,0,0,0,208,24Zm-8,160H72a31.8,31.8,0,0,0-16,4.3V56A16,16,0,0,1,72,40H200Z"/>',
      },
      {
        id: 'door',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16ZM64,40H192V216H64Zm104,92a12,12,0,1,1-12-12A12,12,0,0,1,168,132Z"/>',
        svgOpen: '<path fill="black" d="M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-40,0H176V40h16ZM64,40h96V216H64Zm80,92a12,12,0,1,1-12-12A12,12,0,0,1,144,132Z"/>',
        svgFill: '<path fill="black" d="M200,40V224H56V40a8,8,0,0,1,8-8H192A8,8,0,0,1,200,40Z" opacity="0.2"/><path fill="black" d="M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16ZM64,40H192V216H64Zm104,92a12,12,0,1,1-12-12A12,12,0,0,1,168,132Z"/>',
      },
      {
        id: 'lock',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"/>',
        svgOpen: '<path fill="black" d="M208,80H96V56a32,32,0,0,1,32-32c15.4,0,29.2,11,32.2,25.6a8,8,0,0,0,15.7-3.2C171.3,24.2,151.2,8,128,8A48.1,48.1,0,0,0,80,56V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80Zm0,128H48V96H208V208Zm-80-96a28,28,0,0,0-8,54.8V184a8,8,0,0,0,16,0V166.8A28,28,0,0,0,128,112Zm0,40a12,12,0,1,1,12-12A12,12,0,0,1,128,152Z"/>',
        svgFill: '<path fill="black" d="M216,96V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V96a8,8,0,0,1,8-8H208A8,8,0,0,1,216,96Z" opacity="0.2"/><path fill="black" d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"/>',
      },
      {
        id: 'bell',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M221.8,175.9C216.3,166.4,208,139.3,208,104a80,80,0,1,0-160,0c0,35.3-8.3,62.4-13.8,71.9A16,16,0,0,0,48,200H88.8a40,40,0,0,0,78.4,0H208a16,16,0,0,0,13.8-24.1ZM128,216a24,24,0,0,1-22.6-16h45.2A24,24,0,0,1,128,216ZM48,184c7.7-13.2,16-43.9,16-80a64,64,0,1,1,128,0c0,36.1,8.3,66.7,16,80Z"/>',
        svgOpen: '<path fill="black" d="M224,71.1a8,8,0,0,1-10.8-3.4,94.1,94.1,0,0,0-33.5-36.9,8,8,0,1,1,8.5-13.5,111.5,111.5,0,0,1,39.1,43.1A8,8,0,0,1,224,71.1ZM35.7,72a8,8,0,0,0,7.1-4.3A94.1,94.1,0,0,1,76.3,30.8a8,8,0,1,0-8.5-13.5A111.5,111.5,0,0,0,28.6,60.3,8,8,0,0,0,35.7,72Zm186.1,103.9A16,16,0,0,1,208,200H167.2a40,40,0,0,1-78.4,0H48a16,16,0,0,1-13.8-24.1C43.2,160.4,48,138.3,48,112a80,80,0,0,1,160,0C208,138.3,212.8,160.4,221.8,175.9ZM150.6,200H105.4a24,24,0,0,0,45.2,0ZM208,184c-10.6-18.3-16-42.5-16-72a64,64,0,0,0-128,0c0,29.5-5.4,53.7-16,72Z"/>',
        svgFill: '<path fill="black" d="M208,192H48a8,8,0,0,1-6.9-12C47.7,168.6,56,139.8,56,104a72,72,0,0,1,144,0c0,35.8,8.3,64.6,14.9,76A8,8,0,0,1,208,192Z" opacity="0.2"/><path fill="black" d="M221.8,175.9C216.3,166.4,208,139.3,208,104a80,80,0,1,0-160,0c0,35.3-8.3,62.4-13.8,71.9A16,16,0,0,0,48,200H88.8a40,40,0,0,0,78.4,0H208a16,16,0,0,0,13.8-24.1ZM128,216a24,24,0,0,1-22.6-16h45.2A24,24,0,0,1,128,216ZM48,184c7.7-13.2,16-43.9,16-80a64,64,0,1,1,128,0c0,36.1,8.3,66.7,16,80Z"/>',
      },
      {
        id: 'plant',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M247.6,47.9a8,8,0,0,0-7.5-7.5c-51.8-3-93.3,12.7-111.2,42.2-11.8,19.5-11.8,43.2-.16,65.7a71.3,71.3,0,0,0-14.2,27L98.3,159c7.8-16.3,7.5-33.3-1-47.5-13.2-21.8-43.7-33.5-81.5-31.2a8,8,0,0,0-7.5,7.5c-2.2,37.8,9.5,68.3,31.3,81.5A45.8,45.8,0,0,0,63.4,176,54.6,54.6,0,0,0,87,170.3l25,25V224a8,8,0,0,0,16,0V194.5a55.6,55.6,0,0,1,12.3-35,73.9,73.9,0,0,0,33.3,8.4,60.9,60.9,0,0,0,31.8-8.9C234.9,141.2,250.7,99.7,247.6,47.9ZM47.8,155.6C32.5,146.3,23.8,124.3,24,96c28.3-.24,50.3,8.5,59.6,23.8,4.9,8,5.6,17.3,2.5,26.9L61.7,122.3a8,8,0,0,0-11.3,11.3l24.4,24.4C65.1,161.2,55.8,160.5,47.8,155.6Zm149.3-10.2c-13.4,8.1-29.1,8.7-45.1,2l53.7-53.7a8,8,0,0,0-11.3-11.3L140.7,136c-6.8-16-6.1-31.8,2-45.1,13.9-23,47-35.8,89.3-34.8C232.9,98.3,220.1,131.4,197.1,145.4Z"/>',
        svgOpen: '<path fill="black" d="M210.4,129.4c-.81-.47-1.7-.92-2.6-1.4.92-.44,1.8-.89,2.6-1.4a40,40,0,1,0-40-69.3c-.81.5-1.6,1-2.5,1.6.08-1,.13-2,.13-3a40,40,0,0,0-80,0c0,.94,0,1.9.13,3-.83-.57-1.7-1.1-2.5-1.6a40,40,0,1,0-40,69.3c.81.5,1.7.92,2.6,1.4-.92.4-1.8.89-2.6,1.4a40,40,0,1,0,40,69.3c.81-.47,1.7-1,2.5-1.6-.08,1-.13,2-.13,3a40,40,0,0,0,80,0c0-.94-.05-1.9-.13-2.9.83.6,1.7,1.1,2.5,1.6A39.8,39.8,0,0,0,190.3,204a40.4,40.4,0,0,0,10.4-1.4,40,40,0,0,0,9.6-73.3ZM104,128a24,24,0,1,1,24,24A24,24,0,0,1,104,128Zm74.4-56.8a24,24,0,1,1,24,41.6c-6.3,3.6-18.6,6.1-35.2,7.2A40,40,0,0,0,154.5,98.1C163.7,84.3,172.1,74.8,178.4,71.2ZM128,32a24,24,0,0,1,24,24c0,7.2-4,19.2-11.4,34.1a39.8,39.8,0,0,0-25.3,0C108,75.2,104,63.2,104,56A24,24,0,0,1,128,32ZM44.9,80a24,24,0,0,1,32.8-8.8c6.3,3.6,14.6,13.1,23.8,26.9A40,40,0,0,0,88.8,120c-16.5-1.1-28.9-3.6-35.2-7.2A24,24,0,0,1,44.9,80ZM77.7,184.8a24,24,0,1,1-24-41.6c6.3-3.6,18.6-6.1,35.2-7.2a40,40,0,0,0,12.7,21.9C92.3,171.7,83.9,181.2,77.7,184.8ZM128,224a24,24,0,0,1-24-24c0-7.2,4-19.2,11.4-34.1a39.8,39.8,0,0,0,25.3,0C148,180.8,152,192.8,152,200A24,24,0,0,1,128,224Zm83.1-48a24,24,0,0,1-32.8,8.8c-6.3-3.6-14.6-13.1-23.8-26.9A40,40,0,0,0,167.2,136c16.6,1.1,28.9,3.6,35.2,7.2A24,24,0,0,1,211.1,176Z"/>',
        svgFill: '<path fill="black" d="M138.5,149.5C106.6,96.3,149.2,43.1,239.6,48.4,245,138.8,191.8,181.4,138.5,149.5ZM16.3,88.3c-3.8,64.6,34.2,95,72.2,72.2C111.3,122.5,80.9,84.5,16.3,88.3Z" opacity="0.2"/><path fill="black" d="M247.6,47.9a8,8,0,0,0-7.5-7.5c-51.8-3-93.3,12.7-111.2,42.2-11.8,19.5-11.8,43.2-.16,65.7a71.4,71.4,0,0,0-14.2,27L98.3,159c7.8-16.3,7.5-33.4-1-47.5C84.1,89.7,53.6,78,15.8,80.3a8,8,0,0,0-7.5,7.5c-2.2,37.8,9.5,68.3,31.3,81.5A45.8,45.8,0,0,0,63.4,176,54.6,54.6,0,0,0,87,170.3l25,25V224a8,8,0,0,0,16,0V194.5a55.6,55.6,0,0,1,12.3-35,73.9,73.9,0,0,0,33.3,8.4,60.9,60.9,0,0,0,31.8-8.9C234.9,141.2,250.7,99.7,247.6,47.9ZM86.1,146.7l-24.4-24.4a8,8,0,0,0-11.3,11.3l24.4,24.4c-9.6,3.2-18.9,2.4-26.9-2.5C32.5,146.3,23.8,124.3,24,96c28.3-.25,50.3,8.5,59.6,23.8C88.5,127.8,89.2,137.1,86.1,146.7Zm111.1-1.4c-13.4,8.1-29.1,8.7-45.1,2l53.7-53.7a8,8,0,0,0-11.3-11.3L140.7,136c-6.8-16-6.1-31.8,2-45.1,13.9-23,47-35.8,89.3-34.8C232.9,98.3,220.1,131.4,197.1,145.4Z"/>',
      },
      {
        id: 'phone',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M222.4,158.5l-47.1-21.1-.13-.06a16,16,0,0,0-15.2,1.4,8.1,8.1,0,0,0-.75.6L134.9,160c-15.4-7.5-31.3-23.3-38.8-38.5l20.8-24.7c.2-.25.4-.5.6-.77a16,16,0,0,0,1.3-15.1l0-.12L97.5,33.6a16,16,0,0,0-16.6-9.5A56.3,56.3,0,0,0,32,80c0,79.4,64.6,144,144,144a56.3,56.3,0,0,0,55.9-48.9A16,16,0,0,0,222.4,158.5ZM176,208A128.1,128.1,0,0,1,48,80,40.2,40.2,0,0,1,82.9,40a.61.6,0,0,0,0,.12l21,47L83.2,111.9a6.1,6.1,0,0,0-.57.8,16,16,0,0,0-1,15.7c9.1,18.5,27.7,37.1,46.5,46.1a16,16,0,0,0,15.8-1.1,8.4,8.4,0,0,0,.74-.56L168.9,152l47,21.1h0s.08,0,.11,0A40.2,40.2,0,0,1,176,208Z"/>',
        svgOpen: '<path fill="black" d="M144.3,45.9a8,8,0,0,1,9.8-5.7,86.2,86.2,0,0,1,61.7,61.7,8,8,0,0,1-5.7,9.8A8.2,8.2,0,0,1,208,112a8,8,0,0,1-7.7-5.9,70.4,70.4,0,0,0-50.3-50.3A8,8,0,0,1,144.3,45.9Zm-2.3,41.8c13.8,3.7,22.7,12.5,26.3,26.3A8,8,0,0,0,176,120a8.2,8.2,0,0,0,2.1-.27,8,8,0,0,0,5.7-9.8c-5.1-19.2-18.5-32.5-37.7-37.7a8,8,0,1,0-4.1,15.5Zm81.9,95.4A56.3,56.3,0,0,1,168,232C88.6,232,24,167.4,24,88A56.3,56.3,0,0,1,72.9,32.1a16,16,0,0,1,16.6,9.5l21.1,47.2,0,.12A16,16,0,0,1,109.4,104c-.18.3-.37.5-.57.8L88,129.5c7.5,15.2,23.4,31,38.8,38.5l24.3-20.7a8.1,8.1,0,0,1,.75-.56,16,16,0,0,1,15.2-1.4l.13.1,47.1,21.1A16,16,0,0,1,223.9,183.1Zm-15.9-2s-.07,0-.11,0h0l-47-21-24.3,20.7a8.4,8.4,0,0,1-.74.6,16,16,0,0,1-15.7,1.1c-18.7-9-37.4-27.6-46.5-46.1a16,16,0,0,1,1-15.7,6.1,6.1,0,0,1,.57-.77L96,95.2l-21-47a.61.6,0,0,1,0-.12A40.2,40.2,0,0,0,40,88,128.1,128.1,0,0,0,168,216,40.2,40.2,0,0,0,208,181.1Z"/>',
        svgFill: '<path fill="black" d="M223.9,174.1A48.3,48.3,0,0,1,176,216,136,136,0,0,1,40,80,48.3,48.3,0,0,1,81.9,32.1a8,8,0,0,1,8.3,4.8l21.1,47.2a8,8,0,0,1-.66,7.5L89.3,117a7.9,7.9,0,0,0-.54,7.8c8.3,16.9,25.8,34.2,42.8,42.4a7.9,7.9,0,0,0,7.8-.59l25-21.3a8,8,0,0,1,7.6-.69l47.2,21.1A8,8,0,0,1,223.9,174.1Z" opacity="0.2"/><path fill="black" d="M222.4,158.5l-47.1-21.1-.13-.06a16,16,0,0,0-15.2,1.4,8.1,8.1,0,0,0-.75.6L134.9,160c-15.4-7.5-31.3-23.3-38.8-38.5l20.8-24.7c.2-.25.4-.5.6-.77a16,16,0,0,0,1.3-15.1l0-.12L97.5,33.6a16,16,0,0,0-16.6-9.5A56.3,56.3,0,0,0,32,80c0,79.4,64.6,144,144,144a56.3,56.3,0,0,0,55.9-48.9A16,16,0,0,0,222.4,158.5ZM176,208A128.1,128.1,0,0,1,48,80,40.2,40.2,0,0,1,82.9,40a.61.6,0,0,0,0,.12l21,47L83.2,111.9a6.1,6.1,0,0,0-.57.8,16,16,0,0,0-1,15.7c9.1,18.5,27.7,37.1,46.5,46.1a16,16,0,0,0,15.8-1.1,8.4,8.4,0,0,0,.74-.56L168.9,152l47,21.1h0s.08,0,.11,0A40.2,40.2,0,0,1,176,208Z"/>',
      },
      {
        id: 'chat',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M128,24A104,104,0,0,0,36.2,176.9L24.8,210.9a16,16,0,0,0,20.2,20.2l34.1-11.3A104,104,0,1,0,128,24Zm0,192a87.9,87.9,0,0,1-44.1-11.8,8,8,0,0,0-6.5-.67L40,216,52.5,178.6a8,8,0,0,0-.66-6.5A88,88,0,1,1,128,216Z"/>',
        svgOpen: '<path fill="black" d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128ZM84,116a12,12,0,1,0,12,12A12,12,0,0,0,84,116Zm88,0a12,12,0,1,0,12,12A12,12,0,0,0,172,116Zm60,12A104,104,0,0,1,79.1,219.8L45.1,231.2a16,16,0,0,1-20.2-20.2l11.4-34A104,104,0,1,1,232,128Zm-16,0A88,88,0,1,0,51.8,172.1a8,8,0,0,1,.66,6.5L40,216,77.4,203.5a7.9,7.9,0,0,1,2.5-.42,8,8,0,0,1,4,1.1A88,88,0,0,0,216,128Z"/>',
        svgFill: '<path fill="black" d="M224,128A96,96,0,0,1,79.9,211.1h0L42.5,223.6a8,8,0,0,1-10.1-10.1l12.5-37.4h0A96,96,0,1,1,224,128Z" opacity="0.2"/><path fill="black" d="M128,24A104,104,0,0,0,36.2,176.9L24.8,210.9a16,16,0,0,0,20.2,20.2l34.1-11.3A104,104,0,1,0,128,24Zm0,192a87.9,87.9,0,0,1-44.1-11.8,8,8,0,0,0-6.5-.67L40,216,52.5,178.6a8,8,0,0,0-.66-6.5A88,88,0,1,1,128,216Z"/>',
      },
      {
        id: 'cloud',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M160,40A88.1,88.1,0,0,0,81.3,88.7,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.3.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z"/>',
        svgOpen: '<path fill="black" d="M164,72a76.2,76.2,0,0,0-20.3,2.7,55.6,55.6,0,0,0-9.4-11.5l9.5-13.6a8,8,0,1,0-13.1-9.2L121.2,54A55.9,55.9,0,0,0,96,48c-.58,0-1.2,0-1.7,0L91.4,31.7a8,8,0,1,0-15.7,2.8L78.5,50.8A56.1,56.1,0,0,0,55.2,65.7L41.6,56.1a8,8,0,1,0-9.2,13.1L46,78.8A55.6,55.6,0,0,0,40,104c0,.57,0,1.2,0,1.7L23.7,108.6a8,8,0,0,0,1.4,15.9,8.2,8.2,0,0,0,1.4-.12l16.3-2.9a55.7,55.7,0,0,0,5.9,12.4A52,52,0,0,0,84,224h80a76,76,0,0,0,0-152ZM56,104a40,40,0,0,1,72.5-23.2,76.3,76.3,0,0,0-35.6,40,52.1,52.1,0,0,0-31,4.2A40,40,0,0,1,56,104ZM164,208H84a36,36,0,1,1,4.8-71.7c-.37,2.4-.63,4.8-.77,7.2a8,8,0,0,0,16,.92,58.9,58.9,0,0,1,1.9-11.8c0-.16.1-.32.1-.48A60.1,60.1,0,1,1,164,208Z"/>',
        svgFill: '<path fill="black" d="M240,128a80,80,0,0,1-80,80H72A56,56,0,1,1,85.9,97.7l0,.1A80,80,0,0,1,240,128Z" opacity="0.2"/><path fill="black" d="M160,40A88.1,88.1,0,0,0,81.3,88.7,64,64,0,1,0,72,216h88a88,88,0,0,0,0-176Zm0,160H72a48,48,0,0,1,0-96c1.1,0,2.2,0,3.3.11A88,88,0,0,0,72,128a8,8,0,0,0,16,0,72,72,0,1,1,72,72Z"/>',
      },
      {
        id: 'moon',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm72.8,97a8,8,0,0,1,1.4,8A96,96,0,1,1,95.1,37.8a8,8,0,0,1,10.6,9.1A88.1,88.1,0,0,0,209.1,150.3,8,8,0,0,1,216.8,153Zm-19.4,14.9c-1.8.09-3.6.14-5.4.14A104.1,104.1,0,0,1,88,64c0-1.8,0-3.6.14-5.4A80,80,0,1,0,197.4,167.9Z"/>',
        svgOpen: '<path fill="black" d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.1,64.1,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.1,48.1,0,0,0,176,128ZM58.3,69.7A8,8,0,0,0,69.7,58.3l-16-16A8,8,0,0,0,42.3,53.7Zm0,116.7-16,16a8,8,0,0,0,11.3,11.3l16-16a8,8,0,0,0-11.3-11.3ZM192,72a8,8,0,0,0,5.7-2.3l16-16a8,8,0,0,0-11.3-11.3l-16,16A8,8,0,0,0,192,72Zm5.7,114.3a8,8,0,0,0-11.3,11.3l16,16a8,8,0,0,0,11.3-11.3ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"/>',
        svgFill: '<path fill="black" d="M210.7,158.2A88,88,0,1,1,97.8,45.3,96.1,96.1,0,0,0,192,160,96.8,96.8,0,0,0,210.7,158.2Z" opacity="0.2"/><path fill="black" d="M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm72.8,97a8,8,0,0,1,1.4,8A96,96,0,1,1,95.1,37.8a8,8,0,0,1,10.6,9.1A88.1,88.1,0,0,0,209.1,150.3,8,8,0,0,1,216.8,153Zm-19.4,14.9c-1.8.09-3.6.14-5.4.14A104.1,104.1,0,0,1,88,64c0-1.8,0-3.6.14-5.4A80,80,0,1,0,197.4,167.9Z"/>',
      },
      {
        id: 'rocket',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M152,224a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,224ZM128,112a12,12,0,1,0-12-12A12,12,0,0,0,128,112Zm95.6,43.8-12.4,55.6a16,16,0,0,1-25.5,9.1L158.5,200h-61L70.3,220.6a16,16,0,0,1-25.5-9.1L32.4,155.8a16.1,16.1,0,0,1,3.3-13.7l28.6-34.3a123.1,123.1,0,0,1,8.6-36.7c12.9-32.3,36-52.6,45.4-59.8a16,16,0,0,1,19.6,0c9.3,7.2,32.5,27.5,45.4,59.9a123.1,123.1,0,0,1,8.6,36.7l28.6,34.3A16.1,16.1,0,0,1,223.6,155.8ZM99.4,184h57.1c21.1-37.5,25.1-73.5,11.7-106.9C156.6,47.6,134.5,29,128,24c-6.5,5-28.6,23.6-40.3,53.1C74.4,110.5,78.3,146.5,99.4,184Zm-15,5.9Q68.3,160.5,64.8,132.2L48,152.4,60.4,208l.18-.13ZM208,152.4l-16.8-20.2q-3.4,28.3-19.6,57.7l23.9,18,.18.1Z"/>',
        svgOpen: '<path fill="black" d="M223.9,47.1a16,16,0,0,0-15-15c-12.6-.75-44.7.4-71.4,27.1L132.7,64H74.4A15.9,15.9,0,0,0,63,68.7L28.7,103a16,16,0,0,0,9.1,27.2l38.5,5.4,44.2,44.2,5.4,38.5a15.9,15.9,0,0,0,10.8,12.9,16.1,16.1,0,0,0,5.1.83A15.9,15.9,0,0,0,153,227.3L187.3,193A15.9,15.9,0,0,0,192,181.6V123.3l4.8-4.8C223.5,91.9,224.6,59.7,223.9,47.1ZM74.4,80h42.3L77.2,119.5,40,114.3Zm74.4-9.4a76.7,76.7,0,0,1,59.1-22.5,76.5,76.5,0,0,1-22.4,59.2L128,164.7,91.3,128ZM176,181.6,141.7,216l-5.2-37.2L176,139.3Zm-74.2,9.5C97.3,201,82.3,224,40,224a8,8,0,0,1-8-8c0-42.3,23-57.3,32.9-61.8a8,8,0,0,1,6.6,14.6c-6.4,2.9-20.6,12.4-23.1,38.9,26.6-2.5,36-16.7,38.9-23.1a8,8,0,1,1,14.6,6.6Z"/>',
        svgFill: '<path fill="black" d="M94.8,192,65.4,214.2a8,8,0,0,1-12.8-4.5L40.2,154.1a8,8,0,0,1,1.7-6.9l30.3-36.3C71,134.3,76.7,161.4,94.8,192Zm119.3-44.8-30.3-36.3c1.2,23.3-4.5,50.5-22.6,81.1l29.5,22.2a8,8,0,0,0,12.8-4.5l12.4-55.6A8,8,0,0,0,214.2,147.2Z" opacity="0.2"/><path fill="black" d="M152,224a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,224ZM128,112a12,12,0,1,0-12-12A12,12,0,0,0,128,112Zm95.6,43.8-12.4,55.6a16,16,0,0,1-25.5,9.1L158.5,200h-61L70.3,220.6a16,16,0,0,1-25.5-9.1L32.4,155.8a16.1,16.1,0,0,1,3.3-13.7l28.6-34.3a123.1,123.1,0,0,1,8.6-36.7c12.9-32.3,36-52.6,45.4-59.8a16,16,0,0,1,19.6,0c9.3,7.2,32.5,27.5,45.4,59.9a123.1,123.1,0,0,1,8.6,36.7l28.6,34.3A16.1,16.1,0,0,1,223.6,155.8ZM99.4,184h57.1c21.1-37.5,25.1-73.5,11.7-106.9C156.6,47.6,134.5,29,128,24c-6.5,5-28.6,23.6-40.3,53.1C74.4,110.5,78.3,146.5,99.4,184Zm-15,5.9Q68.3,160.5,64.8,132.2L48,152.4,60.4,208l.18-.13ZM208,152.4l-16.8-20.2q-3.4,28.3-19.6,57.7l23.9,18,.18.1Z"/>',
      },
      {
        id: 'egg',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M186.7,59.6C168.5,32.3,146.5,16,128,16S87.5,32.3,69.3,59.6C50.7,87.5,40,121.2,40,152a88,88,0,0,0,176,0C216,121.2,205.3,87.5,186.7,59.6ZM128,224a72.1,72.1,0,0,1-72-72c0-27.7,9.7-58.1,26.7-83.6C97.2,46.6,115.4,32,128,32s30.8,14.6,45.3,36.4C190.3,93.9,200,124.3,200,152A72.1,72.1,0,0,1,128,224Z"/>',
        svgOpen: '<path fill="black" d="M186.7,59.6C168.5,32.3,146.5,16,128,16S87.5,32.3,69.3,59.6C50.7,87.5,40,121.2,40,152a88,88,0,0,0,176,0C216,121.2,205.3,87.5,186.7,59.6ZM128,224a72.1,72.1,0,0,1-72-72c0-27.7,9.7-58.1,26.7-83.6C97.2,46.6,115.4,32,128,32c9.5,0,22.2,8.3,34.1,21.8L122,98.7a8,8,0,0,0,4,13.1l24.6,6.2-6.5,32.5a8,8,0,0,0,6.3,9.4A7.8,7.8,0,0,0,152,160a8,8,0,0,0,7.8-6.4l8-40a8,8,0,0,0-5.9-9.3l-19.2-4.8L172.1,66.6c.42.6.83,1.2,1.2,1.8C190.3,93.9,200,124.3,200,152A72.1,72.1,0,0,1,128,224Z"/>',
        svgFill: '<path fill="black" d="M208,152a80,80,0,0,1-160,0C48,88,96,24,128,24S208,88,208,152Z" opacity="0.2"/><path fill="black" d="M186.7,59.6C168.5,32.3,146.5,16,128,16S87.5,32.3,69.3,59.6C50.7,87.5,40,121.2,40,152a88,88,0,0,0,176,0C216,121.2,205.3,87.5,186.7,59.6ZM128,224a72.1,72.1,0,0,1-72-72c0-27.7,9.7-58.1,26.7-83.6C97.2,46.6,115.4,32,128,32s30.8,14.6,45.3,36.4C190.3,93.9,200,124.3,200,152A72.1,72.1,0,0,1,128,224Z"/>',
      },
      {
        id: 'plugs',
        viewBox: '0 0 256 256',
        svg: '<path fill="black" d="M149.7,138.3a8,8,0,0,0-11.3,0L120,156.7,99.3,136l18.4-18.3a8,8,0,0,0-11.3-11.3L88,124.7,69.7,106.3a8,8,0,0,0-11.3,11.3L64.7,124,41.4,147.3a32,32,0,0,0,0,45.3l5.4,5.4-28.4,28.4a8,8,0,0,0,11.3,11.3l28.4-28.4,5.4,5.4a32,32,0,0,0,45.3,0L132,191.3l6.3,6.4a8,8,0,0,0,11.3-11.3L131.3,168l18.4-18.3A8,8,0,0,0,149.7,138.3Zm-52.3,65a16,16,0,0,1-22.6,0L52.7,181.3a16,16,0,0,1,0-22.6L76,135.3,120.7,180Zm140.3-185a8,8,0,0,0-11.3,0l-28.4,28.4-5.4-5.4a32.1,32.1,0,0,0-45.3,0L124,64.7l-6.3-6.3a8,8,0,0,0-11.3,11.3l80,80a8,8,0,0,0,11.3-11.3L191.3,132l23.3-23.3a32,32,0,0,0,0-45.3l-5.4-5.4,28.4-28.4A8,8,0,0,0,237.7,18.3Zm-34.3,79L180,120.7,135.3,76l23.3-23.3a16,16,0,0,1,22.6,0l22.1,22A16,16,0,0,1,203.3,97.4Z"/>',
        svgOpen: '<path fill="black" d="M237.7,18.3a8,8,0,0,0-11.3,0l-52.4,52.4-5.4-5.4a32.1,32.1,0,0,0-45.3,0L100,88.7l-6.3-6.3A8,8,0,0,0,82.3,93.7L88.7,100,65.4,123.3a32,32,0,0,0,0,45.3l5.4,5.4-52.4,52.4a8,8,0,0,0,11.3,11.3l52.4-52.4,5.4,5.4a32,32,0,0,0,45.3,0L156,167.3l6.3,6.4a8,8,0,0,0,11.3-11.3L167.3,156l23.3-23.3a32,32,0,0,0,0-45.3l-5.4-5.4,52.4-52.4A8,8,0,0,0,237.7,18.3Zm-116.3,161a16,16,0,0,1-22.6,0L76.7,157.3a16,16,0,0,1,0-22.6L100,111.3,144.7,156Zm57.9-57.9L156,144.7,111.3,100l23.3-23.3a16,16,0,0,1,22.6,0l22.1,22A16,16,0,0,1,179.3,121.4ZM88.6,35A8,8,0,0,1,103.4,29l8,20A8,8,0,0,1,96.6,55ZM24.6,93A8,8,0,0,1,35,88.6l20,8A8,8,0,0,1,49,111.4l-20-8A8,8,0,0,1,24.6,93ZM231.4,163a8,8,0,0,1-10.4,4.5l-20-8A8,8,0,1,1,207,144.6l20,8A8,8,0,0,1,231.4,163Zm-64,58.1A8,8,0,0,1,152.6,227l-8-20A8,8,0,0,1,159.4,201Z"/>',
        svgFill: '<path fill="black" d="M76,124l56,56-29,29a24,24,0,0,1-33.9,0L47,186.9A24,24,0,0,1,47,153ZM209,69.1,186.9,47A24,24,0,0,0,153,47L124,76l56,56,29-29A24,24,0,0,0,209,69.1Z" opacity="0.2"/><path fill="black" d="M149.7,138.3a8,8,0,0,0-11.3,0L120,156.7,99.3,136l18.4-18.3a8,8,0,0,0-11.3-11.3L88,124.7,69.7,106.3a8,8,0,0,0-11.3,11.3L64.7,124,41.4,147.3a32,32,0,0,0,0,45.3l5.4,5.4-28.4,28.4a8,8,0,0,0,11.3,11.3l28.4-28.4,5.4,5.4a32,32,0,0,0,45.3,0L132,191.3l6.3,6.4a8,8,0,0,0,11.3-11.3L131.3,168l18.4-18.3A8,8,0,0,0,149.7,138.3Zm-52.3,65a16,16,0,0,1-22.6,0L52.7,181.3a16,16,0,0,1,0-22.6L76,135.3,120.7,180Zm140.3-185a8,8,0,0,0-11.3,0l-28.4,28.4-5.4-5.4a32.1,32.1,0,0,0-45.3,0L124,64.7l-6.3-6.3a8,8,0,0,0-11.3,11.3l80,80a8,8,0,0,0,11.3-11.3L191.3,132l23.3-23.3a32,32,0,0,0,0-45.3l-5.4-5.4,28.4-28.4A8,8,0,0,0,237.7,18.3Zm-34.3,79L180,120.7,135.3,76l23.3-23.3a16,16,0,0,1,22.6,0l22.1,22A16,16,0,0,1,203.3,97.4Z"/>',
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
    ];

    const COLOR_IDS = new Set(COLORS.map((color) => color.id));
    const COLOR_BY_ID = new Map(COLORS.map((color) => [color.id, color]));

    // --- shared helpers -----------------------------------------------------

    const maskCache = new Map();

    /**
     * Build (and cache) the CSS mask URL for one catalogued icon form.
     * @param iconId - catalogued icon id, or an unknown id to fall back.
     * @param form - 'rest' (collapsed), 'open' (expanded) or 'fill' (active).
     * @returns a `url("data:...")` value for mask-image.
     */
    function iconMaskUrl(iconId, form) {
      const icon = ICON_BY_ID.get(iconId) ?? ICON_BY_ID.get(DEFAULT_ICON);
      const body =
        form === 'open' ? (icon.svgOpen ?? icon.svg) : form === 'fill' ? (icon.svgFill ?? icon.svg) : icon.svg;
      const key = icon.id + ':' + form;
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
      return iconMaskUrl(iconId, 'rest');
    }

    /** @param iconId - catalogued icon id. @returns an expanded-state mask, or null when the icon has none. */
    function openMaskUrl(iconId) {
      return ICON_BY_ID.get(iconId)?.svgOpen === undefined ? null : iconMaskUrl(iconId, 'open');
    }

    /** @param iconId - catalogued icon id. @returns the active-state filled mask, or null when the icon has none. */
    function fillMaskUrl(iconId) {
      return ICON_BY_ID.get(iconId)?.svgFill === undefined ? null : iconMaskUrl(iconId, 'fill');
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
            row.style.removeProperty('--dsh-ws-icon-fill');
          }
          return;
        }
        const flags = [];
        if (style.icon === null) {
          row.style.removeProperty('--dsh-ws-icon');
          row.style.removeProperty('--dsh-ws-icon-open');
          row.style.removeProperty('--dsh-ws-icon-fill');
        } else {
          flags.push('icon');
          row.style.setProperty('--dsh-ws-icon', maskUrl(style.icon));
          const openUrl = openMaskUrl(style.icon);
          if (openUrl === null) row.style.removeProperty('--dsh-ws-icon-open');
          else row.style.setProperty('--dsh-ws-icon-open', openUrl);
          const fillUrl = fillMaskUrl(style.icon);
          if (fillUrl === null) row.style.removeProperty('--dsh-ws-icon-fill');
          else row.style.setProperty('--dsh-ws-icon-fill', fillUrl);
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
        // The tile previews the resting form; the stylesheet swaps to the
        // fill preview while the tile is hovered.
        const fill = fillMaskUrl(iconId);
        const style = { '--dsws-glyph': maskUrl(iconId) };
        if (fill !== null) style['--dsws-glyph-fill'] = fill;
        return h('span', { className: 'dsws-glyph', 'aria-hidden': true, style });
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
/* While the workspace holds the current session, the host marks the icon
   slot with the folderActive class (matched by its stable local name — the
   CSS-module hash prefix changes between builds). Custom icons answer with
   their filled variant: a solid silhouette with a translucent hollow
   center. Icons without one (the native folder mirror) stay outline. */
[data-dsh-workspace-style~="icon"] > span:first-child[class*="folderActive"]::before {
  -webkit-mask-image: var(--dsh-ws-icon-fill, var(--dsh-ws-icon));
  mask-image: var(--dsh-ws-icon-fill, var(--dsh-ws-icon));
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
/* Hovering a tile previews the icon's filled active form. */
@media (hover: hover) {
  .dsws-tile:hover .dsws-glyph {
    -webkit-mask-image: var(--dsws-glyph-fill, var(--dsws-glyph));
    mask-image: var(--dsws-glyph-fill, var(--dsws-glyph));
  }
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
