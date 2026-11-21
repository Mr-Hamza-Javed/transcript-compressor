/*
 * Loads the app's browser scripts into a Node VM with a tiny fake DOM, so the real code
 * (parsers, aligner, rendering, issue detection) can be tested without a browser.
 *
 *   const app = loadApp();
 *   app.setScript('...'); app.setTranscript('...'); app.convert();
 *   app.output(); app.issues(); app.get('state')
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['sample-data.js', 'ui.js', 'transcript-parser.js', 'script-parser.js', 'aligner.js', 'render.js', 'presets.js', 'main.js'];

const unescapeHtml = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Default values of the form controls, read from index.html
function readDefaults() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const defaults = {};
  for (const m of html.matchAll(/<select\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const opts = [...m[2].matchAll(/<option\s+value="([^"]*)"([^>]*)>/g)];
    const sel = opts.find(o => /\bselected\b/.test(o[2])) || opts[0];
    defaults[m[1]] = { value: sel ? unescapeHtml(sel[1]) : '' };
  }
  for (const m of html.matchAll(/<input\s+id="([^"]+)"([^>]*)>/g)) {
    const attrs = m[2];
    const type = (attrs.match(/type="([^"]+)"/) || [])[1] || 'text';
    if (type === 'checkbox') defaults[m[1]] = { checked: /\bchecked\b/.test(attrs) };
    else defaults[m[1]] = { value: unescapeHtml((attrs.match(/value="([^"]*)"/) || [])[1] || '') };
  }
  return defaults;
}

function makeElement(id, init = {}) {
  const classes = new Set();
  const el = {
    id, value: '', textContent: '', checked: false, scrollTop: 0, files: null, _html: '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, force) => { const on = force === undefined ? !classes.has(c) : !!force; on ? classes.add(c) : classes.delete(c); return on; },
      contains: (c) => classes.has(c)
    },
    _attrs: {}, offsetWidth: 0,
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    addEventListener() {}, removeEventListener() {}, click() {}, select() {}, scrollIntoView() {}, focus() {},
    appendChild() {}, removeChild() {},
    ...init
  };
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); }
  });
  // Like a real <select>: replacing the options selects the first one
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (v) => {
      el._html = String(v);
      const m = /<option value="([^"]*)"/.exec(el._html);
      if (m) el.value = unescapeHtml(m[1]);
    }
  });
  return el;
}

function loadApp({ storage = {} } = {}) {
  const defaults = readDefaults();
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement(id, defaults[id] || {}));
    return elements.get(id);
  };
  const store = new Map(Object.entries(storage));
  const localStorage = {
    quota: Infinity,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem(k, v) {
      if (String(v).length > this.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
    _store: store
  };
  const toasts = [];
  const ctx = {
    console, setTimeout, clearTimeout, Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage,
    document: {
      getElementById: getEl,
      createElement: (tag) => makeElement(tag),
      body: makeElement('body'),
      execCommand: () => true
    },
    getSelection: () => ({ removeAllRanges() {} })
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  for (const file of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', file), 'utf8'), ctx, { filename: file });
  }
  // Capture toasts for assertions
  vm.runInContext('showToast = (msg, type = "success", action = null) => __toasts.push({ msg, type, action });', Object.assign(ctx, { __toasts: toasts }));

  const run = (code) => vm.runInContext(code, ctx);
  const app = {
    ctx, el: getEl, run, toasts, localStorage,
    get: (name) => run(name),
    call: (fn, ...args) => run(fn)(...args),
    setScript(text) { getEl('scriptInput').value = text; return app; },
    setTranscript(text, { inspect = true } = {}) {
      getEl('transcriptInput').value = typeof text === 'string' ? text : JSON.stringify(text);
      if (inspect) run('inspectAndPopulateTranscriptSchema')(true);
      return app;
    },
    convert() { run('runConversion')(true); return app; },
    rerender() { run('runConversion')(false); return app; },
    output: () => getEl('outputTextarea').value,
    state: () => run('state'),
    alignment: () => run('state.alignment'),
    beats: () => run('state.alignment.allBeats'),
    beat: (key) => run('state.alignment.allBeats').find(b => b.key === key),
    issues: () => run('buildIssues')(run('state.alignment'), getEl('includeUnmatchedToggle').checked),
    // Waits for the input debounce (and the setTimeout(0) after it)
    settle: (ms = 1200) => new Promise(r => setTimeout(r, ms))
  };
  return app;
}

// Helpers to build transcripts
function wordsFromText(text, { start = 0, step = 0.3, dur = 0.25 } = {}) {
  return text.split(/\s+/).filter(Boolean).map((w, i) => ({
    word: w, start: +(start + i * step).toFixed(3), end: +(start + i * step + dur).toFixed(3)
  }));
}

function scriptTable(sectionTitle, rows) {
  return `## ${sectionTitle}\n\n| Key | Line |\n| --- | --- |\n` + rows.map(([k, t]) => `| «${k}» | ${t} |`).join('\n') + '\n';
}

// Objects made inside the VM have other prototypes; compare them as plain data
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

module.exports = { loadApp, wordsFromText, scriptTable, plain };
