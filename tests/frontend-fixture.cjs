const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this._text = '';
    this.hidden = false;
    this.style = { setProperty() {} };
    this.className = '';
    this.classList = {
      add: (...names) => { this.className += ' ' + names.join(' '); },
      remove() {},
      toggle() {},
      contains: name => this.className.split(/\s+/).includes(name),
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent ?? String(child)).join(''); }
  append(...children) { for (const child of children) { if (child && typeof child === 'object') child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(name, listener) { (this.listeners[name] ??= []).push(listener); }
  removeEventListener() {}
  querySelectorAll(selector) {
    return this.children.flatMap(child => child instanceof Element
      ? [(selector.startsWith('.') ? child.className.split(/\s+/).includes(selector.slice(1))
        : selector.startsWith('[') ? Object.hasOwn(child.attributes, selector.slice(1, -1))
          : child.tagName === selector.toUpperCase()) ? child : null,
         ...child.querySelectorAll(selector)].filter(Boolean) : []);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest() { return null; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function fixture() {
  const elements = new Map();
  const get = selector => {
    if (!elements.has(selector)) {
      const element = new Element(selector.endsWith('Table') ? 'table' : 'div');
      if (selector.startsWith('[data-single-select=')) {
        for (const part of ['button', 'label', 'menu']) {
          const child = new Element(part === 'button' ? 'button' : 'div');
          child.setAttribute('data-single-select-' + part, '');
          element.append(child);
        }
      }
      elements.set(selector, element);
    }
    return elements.get(selector);
  };
  const document = {
    readyState: 'loading',
    querySelector: get,
    querySelectorAll: () => [],
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: value => { const node = new Element('#text'); node.textContent = value; return node; },
    addEventListener() {},
    body: new Element('body'),
  };
  const context = vm.createContext({
    document, Node: Element, navigator: {}, console, URL, URLSearchParams,
    location: { origin: 'http://stats.test', pathname: '/', search: '' },
    fetch: async () => { throw new Error('Unexpected fetch'); },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout, requestAnimationFrame: callback => callback(),
    Charts: new Proxy({}, { get: () => () => {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  });
  context.window = context;
  const run = source => vm.runInContext(source, context);
  for (const file of ['app.js', 'overview.js', 'history.js', 'patterns.js', 'analysis-tabs.js', 'ui.js', 'milestones.js', 'fun.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'wwwroot', file), 'utf8').replace(/^export /gm, '');
    vm.runInContext(source, context, { filename: file });
  }
  get('#taskFlowEventType').value = 'all';
  get('#taskFlowOrder').value = 'latest';
  get('#milestoneSort').value = 'chronological';
  const snapshot = data => {
    context.payload = { version: 'test', lists: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      deletedLists: [], items: [], events: [], highestUniversalId: 0, eventLogAvailable: true, ...data };
    run('state.snapshot = normalizeSnapshot(payload); state.eventsLoaded = true; state.eventsNeedRefresh = false; allRecordedEvents();');
  };
  const json = source => JSON.parse(run('JSON.stringify(' + source + ')'));
  const rows = selector => get(selector).querySelectorAll('tbody')[0]?.children.map(row => row.children.map(cell => cell.textContent)) ?? [];
  return { context, run, json, get, snapshot, rows };
}

function event(id, extra = {}) {
  return { id, universalId: id, eventType: 'Created', eventAt: '2026-10-14T12:00:00Z',
    listId: 1, displayId: String(id), parentDisplayId: null, title: 'task', fromStatus: null,
    toStatus: 'Open', source: 'live', ...extra };
}

function item(uid, extra = {}) {
  return { universalId: uid, listId: 1, displayId: String(uid), parentDisplayId: null,
    title: 'task', status: 'Open', description: '', createdAt: '2026-10-14T12:00:00Z',
    updatedAt: null, completedAt: null, cancelledAt: null, reopenedAt: null, ...extra };
}

module.exports = { fixture, event, item };
