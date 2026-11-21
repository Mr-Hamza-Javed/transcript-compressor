/* =========================================================================
   UI HELPERS & DROPDOWNS
   ========================================================================= */
const $ = (id) => document.getElementById(id);

/* ---------- Examples menu ---------- */
const presetBtn = $('presetBtn');
const presetDropdown = $('presetDropdown');
function setMenuOpen(open) {
  presetDropdown.classList.toggle('hidden', !open);
  presetBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
presetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(presetDropdown.classList.contains('hidden'));
});
presetDropdown.addEventListener('click', () => setMenuOpen(false)); // picking an item closes it
window.addEventListener('click', () => setMenuOpen(false));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !presetDropdown.classList.contains('hidden')) { setMenuOpen(false); presetBtn.focus(); }
});

/* ---------- Toast (with an optional action, e.g. "Undo") ---------- */
let toastTimer = null;
function showToast(msg, type = 'success', action = null) {
  const toast = $('toast');
  $('toastMsg').textContent = msg;
  $('toastIcon').className = type === 'error' ? 'fa-solid fa-circle-xmark t-err'
    : type === 'warn' ? 'fa-solid fa-triangle-exclamation t-warn'
    : 'fa-solid fa-circle-check t-ok';
  const btn = $('toastAction');
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { hideToast(); action.onClick(); };
    btn.classList.remove('hidden');
  } else {
    btn.onclick = null;
    btn.classList.add('hidden');
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2600);
}
function hideToast() {
  clearTimeout(toastTimer);
  $('toast').classList.remove('show');
}

/* ---------- Settings drawers ---------- */
function setDrawer(drawerId, btnId, open) {
  $(drawerId).classList.toggle('hidden', !open);
  $(btnId).setAttribute('aria-expanded', open ? 'true' : 'false');
}
function toggleScriptConfig() {
  setDrawer('scriptConfigDrawer', 'scriptConfigBtn', $('scriptConfigDrawer').classList.contains('hidden'));
}
function toggleTranscriptConfig(forceOpen = false) {
  const open = forceOpen === true || $('transcriptConfigDrawer').classList.contains('hidden');
  setDrawer('transcriptConfigDrawer', 'transcriptConfigBtn', open);
}

/* ---------- Result tabs ---------- */
const OUTPUT_TABS = {
  text: ['tabOutputBtn', 'outputTextContainer'],
  inspector: ['tabInspectorBtn', 'outputInspectorContainer'],
  issues: ['tabIssuesBtn', 'outputIssuesContainer']
};

function switchOutputTab(tab) {
  Object.entries(OUTPUT_TABS).forEach(([name, [btnId, contId]]) => {
    const active = name === tab;
    $(contId).classList.toggle('hidden', !active);
    $(btnId).classList.toggle('active', active);
    $(btnId).setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

/* ---------- Theme ---------- */
const LS_THEME = 'transcriptCompressor.theme';
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function applyThemeIcon() {
  const icon = $('themeIcon');
  if (icon) icon.className = currentTheme() === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}
function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(LS_THEME, next); } catch (_) { /* storage disabled */ }
  applyThemeIcon();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 72.4 -> "1:12.4"
function fmtClock(sec) {
  if (sec === null || sec === undefined || !isFinite(sec)) return '?';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

function shorten(text, max = 90) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function wordsText(words, max = 14) {
  const list = words.slice(0, max).map(w => w.word).join(' ');
  return words.length > max ? list + ' …' : list;
}

/* =========================================================================
   APP STATE
   ========================================================================= */
const state = {
  parsedJSON: null,      // parsed transcript JSON (or null)
  jsonInfo: null,        // { looksJSON, error, repaired, note }
  candidates: [],        // detected word-array locations inside the JSON
  schemaSignature: null, // used to keep the user's manual mapping while they edit
  schemaNotes: [],       // issues found while detecting the transcript format
  typeKey: null,         // optional "type" field (spacing / punctuation / audio_event)
  transcriptNotes: [],   // issues found while reading words & timestamps
  scriptNotes: [],       // issues found while reading the script
  sections: [],
  alignment: null,
  mappingMessage: null   // shown in the yellow banner
};

/* =========================================================================
   INPUT EVENTS, PERSISTENCE & FILE LOADING
   ========================================================================= */
let inputDebounceTimer = null;
const LS_SCRIPT = 'transcriptCompressor.script';
const LS_TRANSCRIPT = 'transcriptCompressor.transcript';

// Bigger inputs get a longer pause before re-aligning, so typing stays smooth
function debounceDelay() {
  const len = $('scriptInput').value.length + $('transcriptInput').value.length;
  return len > 400000 ? 900 : len > 80000 ? 450 : 200;
}

function saveInputs() {
  try {
    localStorage.setItem(LS_SCRIPT, $('scriptInput').value);
    localStorage.setItem(LS_TRANSCRIPT, $('transcriptInput').value);
  } catch (_) {
    // Storage full (big transcript) or disabled: drop both, so a reload never restores
    // a new script together with an older transcript
    try { localStorage.removeItem(LS_SCRIPT); localStorage.removeItem(LS_TRANSCRIPT); } catch (__) { /* disabled */ }
  }
}

function showAligningBadge() {
  $('alignmentHealthBadge').innerHTML = `<i class="fa-solid fa-spinner fa-spin i-wait"></i><span>Matching…</span>`;
}

// Both inputs share one debounce timer. A transcript edit leaves a "re-read the transcript" flag
// that survives a script edit made before the timer fires (otherwise the old transcript would be used).
let pendingTranscriptInspect = null; // null, or { forceReset }

function scheduleConversion() {
  clearTimeout(inputDebounceTimer);
  inputDebounceTimer = setTimeout(() => {
    saveInputs();
    showAligningBadge();
    setTimeout(() => {
      if (pendingTranscriptInspect) {
        const { forceReset } = pendingTranscriptInspect;
        pendingTranscriptInspect = null;
        inspectAndPopulateTranscriptSchema(forceReset);
      }
      runConversion(true);
    }, 0);
  }, debounceDelay());
}

function onInputChanged() {
  scheduleConversion();
}

function onTranscriptRawInput(forceReset = false) {
  pendingTranscriptInspect = { forceReset: forceReset === true || !!(pendingTranscriptInspect && pendingTranscriptInspect.forceReset) };
  scheduleConversion();
}

function setTranscriptMode(mode) {
  $('transcriptModeSelect').value = mode;
  $('modeObjectsBox').classList.toggle('hidden', mode !== 'objects');
  $('modeCombinedBox').classList.toggle('hidden', mode !== 'combined');
  $('modeTuplesBox').classList.toggle('hidden', mode !== 'tuples');
  $('arrayPathContainer').classList.toggle('hidden', mode === 'lines');
}

// Called when the user changes the "Format" select
function onTranscriptModeChange() {
  setTranscriptMode($('transcriptModeSelect').value);
  runConversion(true);
}

function onArrayPathChange() {
  const path = $('jsonArrayPathSelect').value;
  const cand = state.candidates.find(c => c.path === path);
  if (cand) applyCandidate(cand);
  runConversion(true);
}

function openFilePicker(which) {
  $(which === 'script' ? 'scriptFileInput' : 'transcriptFileInput').click();
}

function handleFileChosen(which, file) {
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) {
    showToast(`"${file.name}" is too large (over 60 MB)`, 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    if (which === 'script') {
      $('scriptInput').value = text;
      onInputChanged();
    } else {
      $('transcriptInput').value = text;
      onTranscriptRawInput(true);
    }
    showToast(`Loaded ${file.name}`);
  };
  reader.onerror = () => showToast(`Could not read "${file.name}"`, 'error');
  reader.readAsText(file);
}

function setupDragAndDrop() {
  [['scriptInput', 'script'], ['transcriptInput', 'transcript']].forEach(([id, which]) => {
    const el = $(id);
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('drag-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        e.preventDefault();
        handleFileChosen(which, file);
      }
    });
  });
}

// Restores both inputs (used by the "Undo" on clear)
function restoreInputs(script, transcript) {
  $('scriptInput').value = script;
  $('transcriptInput').value = transcript;
  saveInputs();
  inspectAndPopulateTranscriptSchema(true);
  runConversion(true);
}

function clearInputs() {
  const before = [$('scriptInput').value, $('transcriptInput').value];
  if (!before[0] && !before[1]) return;
  restoreInputs('', '');
  showToast('Cleared both inputs', 'success', { label: 'Undo', onClick: () => restoreInputs(...before) });
}

function clearOne(which) {
  const before = [$('scriptInput').value, $('transcriptInput').value];
  const idx = which === 'script' ? 0 : 1;
  if (!before[idx]) return;
  const next = before.slice();
  next[idx] = '';
  restoreInputs(...next);
  showToast(which === 'script' ? 'Script cleared' : 'Transcript cleared', 'success', { label: 'Undo', onClick: () => restoreInputs(...before) });
  $(which === 'script' ? 'scriptInput' : 'transcriptInput').focus();
}
