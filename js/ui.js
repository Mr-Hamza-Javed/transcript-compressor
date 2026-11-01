/* =========================================================================
   UI HELPERS & DROPDOWNS
   ========================================================================= */
const $ = (id) => document.getElementById(id);

const presetBtn = $('presetBtn');
const presetDropdown = $('presetDropdown');
presetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  presetDropdown.classList.toggle('hidden');
});
window.addEventListener('click', () => {
  if (!presetDropdown.classList.contains('hidden')) presetDropdown.classList.add('hidden');
});

let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = $('toast');
  const icon = $('toastIcon');
  $('toastMsg').textContent = msg;
  icon.className = type === 'error'
    ? 'fa-solid fa-circle-xmark text-rose-400'
    : type === 'warn'
    ? 'fa-solid fa-triangle-exclamation text-amber-400'
    : 'fa-solid fa-circle-check text-emerald-400';
  toast.classList.remove('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
  }, 2600);
}

function toggleScriptConfig() {
  $('scriptConfigDrawer').classList.toggle('hidden');
}

function toggleTranscriptConfig(forceOpen = false) {
  const drawer = $('transcriptConfigDrawer');
  if (forceOpen) drawer.classList.remove('hidden');
  else drawer.classList.toggle('hidden');
}

const TAB_ACTIVE = 'px-2.5 py-1 rounded-md bg-emerald-600 text-white font-medium transition';
const TAB_IDLE = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-slate-200 transition';
const OUTPUT_TABS = {
  text: ['tabOutputBtn', 'outputTextContainer'],
  inspector: ['tabInspectorBtn', 'outputInspectorContainer'],
  issues: ['tabIssuesBtn', 'outputIssuesContainer']
};

function switchOutputTab(tab) {
  Object.entries(OUTPUT_TABS).forEach(([name, [btnId, contId]]) => {
    const active = name === tab;
    $(contId).classList.toggle('hidden', !active);
    $(btnId).className = active ? TAB_ACTIVE : TAB_IDLE;
  });
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
  } catch (_) { /* storage full or disabled: ignore */ }
}

function showAligningBadge() {
  $('alignmentHealthBadge').innerHTML = `<i class="fa-solid fa-spinner fa-spin text-cyan-400"></i><span>Aligning…</span>`;
}

function onInputChanged() {
  clearTimeout(inputDebounceTimer);
  inputDebounceTimer = setTimeout(() => {
    saveInputs();
    showAligningBadge();
    setTimeout(() => runConversion(true), 0);
  }, debounceDelay());
}

function onTranscriptRawInput(forceReset = false) {
  clearTimeout(inputDebounceTimer);
  inputDebounceTimer = setTimeout(() => {
    saveInputs();
    showAligningBadge();
    setTimeout(() => {
      inspectAndPopulateTranscriptSchema(forceReset === true);
      runConversion(true);
    }, 0);
  }, debounceDelay());
}

function setTranscriptMode(mode) {
  $('transcriptModeSelect').value = mode;
  $('modeObjectsBox').classList.toggle('hidden', mode !== 'objects');
  $('modeCombinedBox').classList.toggle('hidden', mode !== 'combined');
  $('modeTuplesBox').classList.toggle('hidden', mode !== 'tuples');
  $('arrayPathContainer').classList.toggle('hidden', mode === 'lines');
}

// Called when the user changes the "Data Structure Mode" select
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
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('ring-2', 'ring-emerald-500/60'); });
    el.addEventListener('dragleave', () => el.classList.remove('ring-2', 'ring-emerald-500/60'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('ring-2', 'ring-emerald-500/60');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        e.preventDefault();
        handleFileChosen(which, file);
      }
    });
  });
}

function clearInputs() {
  $('scriptInput').value = '';
  $('transcriptInput').value = '';
  saveInputs();
  inspectAndPopulateTranscriptSchema(true);
  runConversion(true);
  showToast('Cleared both inputs');
}
