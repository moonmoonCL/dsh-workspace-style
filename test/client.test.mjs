import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

// --- tiny DOM -------------------------------------------------------------

class FakeStyle {
  constructor() {
    this.props = new Map();
  }
  setProperty(name, value) {
    this.props.set(name, value);
  }
  removeProperty(name) {
    this.props.delete(name);
  }
  getPropertyValue(name) {
    return this.props.get(name) ?? '';
  }
  get display() {
    return this.props.get('display') ?? '';
  }
  set display(value) {
    this.props.set('display', value);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.style = new FakeStyle();
    this.children = [];
    this.parentElement = null;
    this.textContent = '';
    this.dataset = {};
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value = '') {
    this.attributes.set(name, String(value));
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentElement === null) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  closest(selector) {
    if (selector !== '[role="menu"]') return null;
    let node = this;
    while (node !== null) {
      if (node.getAttribute('role') === 'menu') return node;
      node = node.parentElement;
    }
    return null;
  }
  querySelectorAll(selector) {
    if (selector === 'button[role="menuitem"]') {
      return this.children
        .flatMap((child) => [child, ...child.children])
        .filter((child) => child.getAttribute('role') === 'menuitem');
    }
    return [];
  }
}

// --- scenario -------------------------------------------------------------

const head = new FakeElement('head');
const body = new FakeElement('body');

// One decorated Workspace row and one row whose saved style is invalid.
const styledRow = new FakeElement('div');
styledRow.setAttribute('data-row-key', 'workspace:ws-styled');
const brokenRow = new FakeElement('div');
brokenRow.setAttribute('data-row-key', 'workspace:ws-broken');
const rows = [styledRow, brokenRow];

// A workspace menu carrying our Edit entry plus the built-in Rename entry,
// and an unrelated menu that also says Rename.
const menu = new FakeElement('div');
menu.setAttribute('role', 'menu');
const editWrap = new FakeElement('div');
const editButton = new FakeElement('button');
editButton.setAttribute('role', 'menuitem');
editButton.textContent = '编辑';
editWrap.appendChild(editButton);
const renameWrap = new FakeElement('div');
const renameButton = new FakeElement('button');
renameButton.setAttribute('role', 'menuitem');
renameButton.textContent = '重命名';
renameWrap.appendChild(renameButton);
menu.appendChild(editWrap);
menu.appendChild(renameWrap);

const otherMenu = new FakeElement('div');
otherMenu.setAttribute('role', 'menu');
const otherWrap = new FakeElement('div');
const otherRename = new FakeElement('button');
otherRename.setAttribute('role', 'menuitem');
otherRename.textContent = '重命名';
otherWrap.appendChild(otherRename);
otherMenu.appendChild(otherWrap);

const menuButtons = [editButton, renameButton, otherRename];

const document = {
  head,
  body,
  createElement: (tag) => new FakeElement(tag),
  querySelectorAll(selector) {
    if (selector.startsWith('[data-row-key^=')) return rows;
    if (selector === 'button[role="menuitem"]') return menuButtons;
    return [];
  },
};

const storage = new Map([
  [
    'dsh-workspace-style:styles:v1',
    JSON.stringify({
      v: 1,
      styles: {
        'ws-styled': { icon: 'ghost', color: 'coral' },
        'ws-broken': { icon: 'not-an-icon', color: 'coral' },
      },
    }),
  ],
]);

const window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame: (callback) => {
    callback();
    return 1;
  },
};

let registration = null;
window.__ModuleLoader__ = {
  load(value) {
    registration = value;
  },
};

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

// --- fake modules ---------------------------------------------------------

const React = {
  createElement: () => null,
  Fragment: Symbol('Fragment'),
  useSyncExternalStore: () => null,
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
};
const primitives = { Modal: () => null, Button: () => null };

const require = (id) => {
  if (id === 'react') return React;
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
  throw new Error(`unexpected require: ${id}`);
};

// --- run the bundle -------------------------------------------------------

vm.runInNewContext(source, {
  window,
  document,
  MutationObserver: FakeMutationObserver,
  encodeURIComponent,
  console,
  setTimeout,
  clearTimeout,
});

assert.equal(registration.id, 'dsh-workspace-style');
const exports = registration.factory(require);
assert.deepEqual(Array.from(exports.inject), [
  'contextMenus',
  'locale',
  'remoteAccess',
  'slots',
  'workspaces',
]);

// --- fake services --------------------------------------------------------

const dictionaries = new Map();
const contributions = [];
const slotRegistrations = [];
let overlayComponent = null;

const activeLocale = { id: 'zh' };
const workspaceDict = { rename: '重命名' };
const locale = {
  bind(ns) {
    return (key, params) => {
      const dict =
        ns === 'dsh-workspace-style'
          ? dictionaries.get(ns)?.[activeLocale.id] ?? {}
          : ns === 'workspace'
            ? workspaceDict
            : {};
      const template = dict[key] ?? key;
      if (params === undefined) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match,
      );
    };
  },
  register(ns, dict) {
    dictionaries.set(ns, dict);
    return () => dictionaries.delete(ns);
  },
};

const ctx = {
  effect(callback) {
    return callback();
  },
  locale,
  contextMenus: {
    active: { getSnapshot: () => ({ kind: 'workspace', value: { workspaceId: 'ws-styled' } }) },
    register(contribution) {
      contributions.push(contribution);
      return () => {};
    },
  },
  slots: {
    inject(name, factory) {
      factory();
    },
    register(options, component) {
      slotRegistrations.push({ options, component });
      if (options.name === 'shell.overlay') overlayComponent = component;
      return () => {};
    },
  },
  workspaces: {
    list: {
      getSnapshot: () => ({
        items: [
          { workspaceId: 'ws-styled', title: 'Styled workspace' },
          { workspaceId: 'ws-broken', title: 'Broken workspace' },
        ],
      }),
    },
    rename: async () => {},
  },
  remoteAccess: {
    source: () => ({ getSnapshot: () => true }),
  },
};

exports.apply(ctx);

// Locale dictionaries exist and are complete enough for the rendered labels.
assert.equal(dictionaries.get('dsh-workspace-style').zh['menu.edit'], '编辑');
assert.equal(dictionaries.get('dsh-workspace-style').en['menu.edit'], 'Edit');

// A stylesheet was injected and carries the row decoration rule.
const injectedStyle = head.children.find((child) => child.tagName === 'STYLE');
assert.ok(injectedStyle);
assert.ok(injectedStyle.textContent.includes('[data-dsh-workspace-style]'));
assert.ok(injectedStyle.textContent.includes('dsws-modal'));

// The Workspace menu contribution resolves to one Edit action.
assert.equal(contributions.length, 1);
assert.equal(contributions[0].target, 'workspace');
const actions = contributions[0].resolve({
  workspaceId: 'ws-styled',
  path: '/tmp/ws',
  displayTitle: 'Styled workspace',
});
assert.equal(actions.length, 1);
assert.equal(actions[0].label, '编辑');
assert.doesNotThrow(() => actions[0].run());

// The valid saved style decorates its row; the invalid one is ignored.
assert.equal(styledRow.getAttribute('data-dsh-workspace-style'), '');
assert.equal(styledRow.style.getPropertyValue('--dsh-ws-color'), '#E85C4A');
assert.match(styledRow.style.getPropertyValue('--dsh-ws-icon'), /^url\("data:image\/svg\+xml,/);
assert.equal(brokenRow.hasAttribute('data-dsh-workspace-style'), false);
assert.equal(brokenRow.style.getPropertyValue('--dsh-ws-color'), '');

// The built-in Rename entry is hidden only inside the menu with our Edit row.
assert.equal(renameWrap.getAttribute('data-dsh-workspace-style-hidden'), '');
assert.equal(renameWrap.style.display, 'none');
assert.equal(otherWrap.hasAttribute('data-dsh-workspace-style-hidden'), false);
assert.equal(otherWrap.style.display, '');

// A dialog entry was registered into the frame overlay.
assert.ok(overlayComponent);
assert.ok(
  slotRegistrations.some(
    (entry) => entry.options.name === 'shell.overlay' && entry.options.locale === 'dsh-workspace-style',
  ),
);

console.log('client bundle: ok');
