<!-- Managed by agent: hand-written (not generated) — keep sections and order -->
<!-- Last updated: 2026-11-19 -->

# AGENTS.md

DSH client-plugin bundle: workspace icon/color customization, Edit dialog replacing the workspace Rename menu item. Plain ESM JavaScript, **no build step, no bundler, no deps** — files ship to the browser as committed. User docs: [README.md](README.md).

**Precedence:** closest `AGENTS.md` to changed files wins. Repo is flat; this is the only one.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Syntax check | `node --check client.js && node --check index.js` | Only compile gate; run after every client.js edit |
| Test (all) | `npm test` | `node --test test/*.test.mjs`, ~50ms |
| Test (single) | `node --test test/client.test.mjs` | — |
| Live E2E | headless Chrome + CDP vs the running GUI | Steps in [docs/DEVELOPING.md](docs/DEVELOPING.md#live-verification) |

No lint/format/typecheck configured; don't add one without asking.

## File Map

| File | Role |
|------|------|
| `package.json` | The plugin contract: `dsh.bundle` + `dsh.client` manifest |
| `client.js` | Browser half — ALL runtime behavior (single file, ~840 lines, on purpose) |
| `index.js` | Host half — stateless `apply()` stub required by the Loader entry |
| `cordis.patch.yml` | Inserts the host Loader entry |
| `locale/{zh,en}.json` | Market display copy only; UI strings live in client.js `DICT` |
| `test/client.test.mjs` | vm-sandbox harness: fake DOM + fake cordis ctx |

## Mandatory reading before editing

| Touching | Read first |
|----------|-----------|
| `client.js` (anything) | [docs/DEVELOPING.md — DSH plugin contract](docs/DEVELOPING.md#the-dsh-plugin-contract) |
| Menu / `hideBuiltinRename` / dialog | [docs/DEVELOPING.md — fragile seams](docs/DEVELOPING.md#built-in-rename-hiding-fragile-seam--keep-the-guards) + run live E2E |
| `package.json` manifest / inject list | [docs/DEVELOPING.md — HMR limits](docs/DEVELOPING.md#hmr-and-reload-rules) |
| Icons/colors/catalog | [docs/DEVELOPING.md — catalog rules](docs/DEVELOPING.md#adding-an-icon-or-color) |

## Boundaries

**Always:** run `node --check client.js` + `npm test` before committing (paste output); keep `zh`/`en` `DICT` keys identical; update test stubs when new client seams are used; live-verify anything touching menus/dialog.

**Never:** ESM imports / Node built-ins / a bundler in client.js (browser bundle served as-is); register menu ids colliding with built-ins (`workspace.rename`, `workspace.delete`, …); user-visible strings outside `DICT`/locale; assume localStorage syncs across browsers; edit `~/.dsh/profiles/web/node_modules/` (pnpm `link:` back here).

**Key decisions & why** (localStorage vs Host storage, DOM anchoring vs slots, hide-don't-replace): [docs/DEVELOPING.md — Key Decisions](docs/DEVELOPING.md#key-decisions). Terminology (bundle/profile/contribution/slot/…): [docs/DEVELOPING.md — Terminology](docs/DEVELOPING.md#terminology).
