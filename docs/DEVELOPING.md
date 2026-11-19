<!-- Deep-dive companion to AGENTS.md. Read AGENTS.md first; it tells you when to come here. -->
<!-- Last updated: 2026-11-19 -->

# Developing dsh-workspace-style

Everything an agent needs to change this plugin safely. Facts below were verified against DSH `0.2.2-rc.1` package docs (`@deepseek-ai/dsh-client-modules`, `dsh-client-locale`, `dsh-client-ui-context-menu`, `dsh-client-ui-workspace`, `dsh-api-workspace-controller`) and against a live GUI during development. User-facing docs: [../README.md](../README.md).

## The DSH plugin contract

- `package.json → dsh.bundle.patch` points at `cordis.patch.yml`; `dsh.client` declares `platform: "web"`, `immediately: true`, and the `inject` list (client services the plugin needs: remote-access, workspace-controller, locale, ui-context-menu, ui-layout).
- **`client.js` must be a self-contained browser bundle.** It registers itself via `window.__ModuleLoader__.load({ id, factory(require) })`. Top-level `require` may only hit the platform module table: `react`, `react/jsx-runtime`, `react-dom`, and `@deepseek-ai/dsh-client-*` packages. No ESM imports, no Node built-ins, no `fs` — this file runs in the browser.
- `index.js` runs on the Host (Node ESM). Here it is an empty `apply()` — the entry exists so the client module graph has a Loader row.
- No bundler: the Host serves `client.js` bytes as-is over `/plugins`. That is why `test/client.test.mjs` loads it with `vm.runInNewContext` instead of importing it.
- Install into a profile (already done for `~/.dsh/profiles/web`): pnpm `link:` dependency + the bundle name in the profile `package.json → dsh.profile.bundles`. Plugin-manager install handles both.
- **`engines.dsh` is checked with `includePrerelease: true`** (`dsh-app-boot`'s `evaluatePluginCompatibility`). That is *not* default semver: under default options a bare range such as `>=0.2.0-rc.2` silently excludes `0.2.2-rc.1` (a prerelease version only satisfies a comparator set that carries a prerelease tag *on its own `major.minor.patch` tuple*). Do not "fix" this range by adding explicit per-tuple `||` branches — measure first, with the same option the host uses: `semver.satisfies(rt, range, { includePrerelease: true })`. A mismatch here makes DSH skip the whole bundle silently (stdout only), which a `link:` install does not necessarily reveal.

### Client seams used by this plugin

| Seam | API | Gotcha |
|------|-----|--------|
| Locale | `ctx.locale.register(ns, {zh, en})`, `ctx.locale.bind(ns)` | Duplicate ns+locale throws; `bind` falls back to the bare key when the namespace is missing — `hideBuiltinRename` relies on this (`renameLabel === 'rename'` = not ready) |
| Menus | `ctx.contextMenus.register({id, target, order, resolve})` | Duplicate id within a target fails — **built-in contributions cannot be unregistered or overridden from another plugin** |
| Slots | `ctx.slots.inject('shell.overlay', …)`, `ctx.slots.register({name, id, locale}, Component)` | `shell.overlay` is `list` kind: additive entries with distinct `id`; `contextMenu.icon` is keyed by `key` |
| Workspace state | `ctx.workspaces.list.getSnapshot().items`, `ctx.workspaces.rename(id, title)` | `rename` throws on Host refusal (name conflict); items are `WorkspaceView` rows with stable `workspaceId` |
| Permissions | `ctx.remoteAccess.source('workspace', id, 'workspace/rename').getSnapshot()` | Returns boolean; call inside `run`/render, not once at apply time |

UI primitives come from `require('@deepseek-ai/dsh-client-ui-primitives')` (`Modal`, `Button`). Reuse them for dialogs; do not hand-roll overlays — the Modal owns focus trap, return-focus, and `data-modal-autofocus`.

### DOM decoration contract (sidebar)

The Host has no icon/color fields on a Workspace record and ui-workspace exposes **no decoration slot** for workspace rows, so styling is DOM-anchored:

- Sidebar workspace rows carry a stable `data-row-key="workspace:<id>"`. `decorateRow` matches that prefix and writes `data-dsh-workspace-style` **with word flags** — `icon` and/or `color` — plus the matching custom properties:
  - `icon` hides the built-in folder `<svg>` (via the stylesheet's `~="icon"` selectors) and paints a data-URI CSS mask from `--dsh-ws-icon` (and `--dsh-ws-icon-open` when the icon has an open variant). The mask's `background-color` falls back to `currentColor`, so a follow-system color inherits the built-in rest-gray / active-blue logic.
  - `color` alone keeps the native folder `<svg>` and its two states untouched, only tinting the slot via `color: var(--dsh-ws-color) !important` (beats the built-in `.folderActive` blue by intent: a chosen color wins).
  - A fully-default selection (both axes `null`) is not a style: the attribute, the properties, and the storage entry all disappear.
- Expanded/collapsed states: rows carry `aria-expanded`, so the stylesheet swaps the mask to `--dsh-ws-icon-open` purely in CSS — no observer needed. Active state: the host adds the `folderActive` CSS-module class to the icon slot when the workspace holds the current session; the stylesheet matches it with the substring selector `[class*="folderActive"]` (the local class name is stable, the `YDXeBa_` hash prefix is not) and swaps to `--dsh-ws-icon-fill`. The rule sits after the expanded rule, so active wins the tie — the filled form shows in both expansion states, mirroring how the built-in folder turns blue regardless.
- Every catalog icon except the `folder` mirror carries three glyph forms (`svg` collapsed outline, `svgOpen` expanded outline, `svgFill` filled duotone with a 0.2-opacity hollow interior). The `folder` entry keeps the host's own 16x16 geometry (regular weight, extracted from the `dsh-client-ui-primitives` sprite data in `dsh-web-frontend`), closed and open, with NO filled variant: it stays hidden behind the default tile, and "default icon + custom color" renders the native folder (blue-active, not filled) instead.
- If DSH renames the local `folderActive` class, the active-filled swap silently stops (icons stay outline) — acceptable degradation, never throws. Verify after host upgrades.
- React re-renders preserve unknown attributes/inline styles (verified live). A `MutationObserver` on `document.body` (attributeFilter `data-row-key`) re-decorates.
- If DSH renames or drops `data-row-key`, decoration silently stops working — acceptable failure mode, never throws.

### Persistence

`localStorage` key `dsh-workspace-style:styles:v1` → `{"v":1,"styles":{<workspaceId>:{icon,color}}}` where **`null` on an axis means "system default" for it** and a both-null entry is never stored (saving it resets the row and deletes the entry). Styles are **browser-local** (per-origin), keyed by stable Workspace id (Host never reuses ids). Cross-tab via `storage` event. `readStyles` drops unknown icon/color ids and both-null entries, so catalog changes degrade gracefully. The v1 shape is forward-compatible with the pre-null schema (old entries have two non-null strings). Bump the key (`:v2`) on breaking schema changes — old data is then ignored, not migrated.

## HMR and reload rules

- Editing `client.js` hot-applies: entry revision derives from mtime+ctime+size, so any rewrite is seen. Verify by checking the injected `<style data-plugin-css>` content, or just reload the page.
- **Manifest edits (`package.json`) are not noticed** until the Loader entry restarts or the Host restarts. A client-code-only change loop never needs a restart.
- Never restart the host session just to iterate on this plugin.

## Built-in Rename hiding (fragile seam — keep the guards)

ui-workspace registers the `workspace.rename` contribution; another plugin cannot unregister it. `hideBuiltinRename` therefore hides the rendered row **in place**. All three guards matter:

1. `ctx.contextMenus.active.getSnapshot()?.kind === 'workspace'` — never touch Session or other menus (Session menus have their own Rename with a shortcut).
2. Only inside a menu that also contains our Edit item (label match against the plugin dictionary).
3. Label matched against the built-in `workspace` locale namespace's `rename` value; the bare key `'rename'` means "namespace not ready" → bail.

When editing this function, re-verify the Session menu case (its Rename must stay visible).

## Adding an icon or color

Icons: add `{ id, svg, svgOpen, svgFill }` to `ICONS` in client.js — every entry needs all three forms, in the Phosphor style: `svg`/`svgOpen` are outline compound paths (fill-baked, no stroke) for the collapsed/expanded states, `svgFill` is the filled active form (solid silhouette plus a 0.2-opacity interior so the center reads hollow under the mask). Set `viewBox` to the geometry's frame (Phosphor art is `0 0 256 256`); the wrapper handles the rest. Icons are state pairs by design — pick geometry that has a natural closed/open story (envelope/envelope-open, bell/bell-ringing), never a rotation or opacity stand-in. Test renders: dialog tile + sidebar mask (data-URI round-trip through `iconMaskUrl` for all three forms). Colors: append to `COLORS` (`{id, hex}`); storage stores ids, never hex, so retuning the palette doesn't rewrite saved data. The first dialog tile on each axis is fixed ("system default" icon / "follow system" color); the catalog `folder` is hidden behind the default tile because it renders identically — keep the id valid for legacy saved data and revisit the alias in the menu `run` if the host ever changes its folder art. Removed catalog ids degrade gracefully: saved styles referencing them drop out (rows revert to the default look).

## Live verification

Unit tests cover wiring only (fake DOM, fake cordis ctx). Real checks need a running GUI:

1. Get the authed URL from the `dsh web:` line of the host output (or `tmux capture-pane`), e.g. `http://127.0.0.1:3080/?token=…`.
2. Headless Chrome with `--remote-debugging-port=9333`, then drive via CDP WebSocket (`Runtime.evaluate`, `Input.dispatchMouseEvent`, `Page.captureScreenshot`).
3. Assert at minimum: Workspace menu shows Edit and hides 重命名/Rename; Session menu still shows Rename (right-click a **non-blank** session row — blank "新会话" rows have no menu); dialog opens with seeded values and both default tiles pressed on an unstyled workspace; save updates the row immediately (no reload); reload persists; duplicate/empty name disables save. State/color assertions: folder icon swaps masks on expand/collapse (`getComputedStyle(span, '::before').maskImage` length changes with `aria-expanded`); color-only keeps the native `<svg>` visible with the slot tinted; follow-system inherits the slot's gray; both-default clears the attribute and the storage entry.
4. Kill the Chrome job and delete temp artifacts (cookies, screenshots, profile dir) when done — the URL token authenticates the GUI.

## Distribution & listing

Where users actually find DSH plugins, in order of reach (verified 2026-11):

| Channel | Requirement | State |
|---------|-------------|-------|
| npm | `npm publish` from the **official** registry — a mirror registry in `npm config get registry` breaks publishing | **published**: `dsh-workspace-style@0.1.0`. npm stages a `0.0.0-stage` placeholder first, then promotes the real version; poll `registry.npmjs.org/dsh-workspace-style` rather than trusting the "may take a few minutes" notice |
| [dsh-plugin.org](https://dsh-plugin.org/zh/submit) (DSH Plugin Hub, 20k+ indexed) | public repo, topic `dsh-plugin`, README install command, root `package.json`, `apply(ctx)`; **listable in the in-app 插件中心 only with an npm package**; then open the prefilled Issue | **submitted**: [issue #847](https://github.com/dshplugin/dsh-plugin-hub/issues/847) |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) registry (feeds most storefronts) | one file `data/plugins/<owner>__<repo>.yml` (`url`/`name`/`category`/`description.en` ending in a period; quote descriptions containing `: `), topic `dsh-plugin`, repo ≥ 1 day old, `dsh.bundle` declared (not just `dsh.client`), ≤ 3 entries per PR | **PR open**: [#16936](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/16936) — the repo-age gate (created 2026-11-19T07:03Z) fails at first and re-runs itself; do not push an empty commit |
| [Open Plugin Market](https://github.com/polang233/dsh-plugin-index) (dshopen.org, own format-1 index of ~1.3k plugins) | open the `plugin-add.yml` issue form: plugin link, summary, screenshots, extra details — no PR, no fixed schema | **submitted**: [issue #572](https://github.com/polang233/dsh-plugin-index/issues/572). Once listed, its badge endpoint `https://dshopen.org/badge/dsh-workspace-style.json` returns "已收录" instead of "未收录" — only add that badge after it flips |
| dsh-market Themes tab | `category: theme` in that registry — **not** ours; this plugin is `ui` | n/a |

`category: ui` is the right bucket (UI enhancement, not an app theme/skin).

### Publishing to npm

The local `npm config get registry` points at a mirror, so publishing needs the official registry spelled out (a mirror silently rejects the publish) and an interactive login:

```sh
npm login --registry=https://registry.npmjs.org/        # once per machine
npm publish --registry=https://registry.npmjs.org/ \
  --access public --otp=<code-if-2fa>
```

Check the tarball before publishing — `screenshots.json` and the screenshot must be in it, or the marketplace detail page comes up empty:

```sh
npm pack --dry-run --registry=https://registry.npmjs.org/
```

If `npm` fails with `EPERM` on `~/.npm/_cacache`, that cache is root-owned from an older npm; either fix it once (`sudo chown -R "$(id -u):$(id -g)" ~/.npm`) or point `--cache` at a temp directory. Do not add a build step for any of this.

**`screenshots.json`** at repo root is how marketplace detail pages get their screenshots (1–8 paths, relative to that file, GitHub-hosted only). Keep the image in `docs/assets/` and list it there — never an absolute URL, which rots silently. Update it whenever the dialog changes; a stale screenshot is worse than none.

**A merged registry entry is a snapshot, not a subscription.** Any capability change needs a fresh PR to that entry, and reviewers check every claim in the description against the code — no superlatives, and no number you have not counted.

## Key Decisions

- **localStorage over Host storage**: no Remote method exists to persist per-workspace style; a Host-side store would need a new typert resource. Documented as a known limitation (no cross-browser sync) instead of inventing a parallel Host schema.
- **DOM anchoring over slot injection**: no workspace-row slot exists; the row's `data-row-key` is stable and React-safe. Cheaper and reversible (`removeAttribute` restores the folder icon).
- **Null as "system default", per axis**: icon and color are independent choices; `null` restores that axis's built-in behavior. "Default icon + custom color" tints the native folder (both states kept); "custom icon + follow system" keeps the built-in rest-gray / active-blue selection logic via the mask's `currentColor` fallback. A both-null save is a reset that deletes the entry.
- **Three-form icons over fake transforms**: every catalog icon is a hand-picked state pair (closed/open/…) with a Phosphor duotone filled form for the active state, keyed off `aria-expanded` and the `folderActive` local class name. Rotation/opacity stand-ins read as glitches; the catalog instead answers the built-in folder's full state model with real geometry. The `folder` mirror keeps the native look (blue-active, no fill) so "default + color" stays pixel-faithful.
- **Hide-don't-replace for Rename**: impossible to unregister built-ins; hiding by label+target-kind is the least invasive workaround and self-disables if DSH changes labels.
- **Dialog width `max-content`**: grows to exactly one row of tiles, wraps only when the viewport can't fit it (user-requested behavior).
- **One file, no deps**: DSH client bundles are served unbundled; splitting would require a build pipeline this repo deliberately avoids.

## Terminology

| Term | Means |
|------|-------|
| DSH | DeepSeek Harness — the host app this plugin extends |
| Bundle | npm package whose `dsh.bundle.patch` adds Loader rows to a profile |
| Profile | A DSH runtime tree (`~/.dsh/profiles/<name>`); this plugin is installed in `web` via pnpm `link:` |
| Host / Client half | `index.js` (Node) / `client.js` (browser) faces of the same package |
| Loader entry | A row in the cordis patch that activates one plugin module |
| Contribution | Structured ctx.contextMenus registration; ids unique per target |
| Slot | Named React injection point (`shell.overlay`, `contextMenu.icon`, …) |
| WorkspaceView | Client projection of a workspace: `workspaceId`, `title`, `sessionIds`, … |
