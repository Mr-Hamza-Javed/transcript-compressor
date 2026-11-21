/* =========================================================================
   COPY & DOWNLOAD UTILITIES
   ========================================================================= */
async function copyOutput() {
  const out = $('outputTextarea');
  if (!out.value) {
    showToast('No output to copy', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(out.value);
  } catch (_) {
    out.select();
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
  }
  showToast('Result copied — paste it into your AI chat');
  const btn = $('copyBtn');
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied</span>';
    clearTimeout(copyOutput.timer);
    copyOutput.timer = setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i><span>Copy</span>'; }, 1600);
  }
}

/* ---------- Download file name ---------- */
const DOWNLOAD_BASE_NAME = 'Word level Transcription';

// Finds a "project" value in the transcript JSON: at the top first, then in nested objects
// (not inside the word lists). e.g. { "project": "Sause Downfall", "words": [...] }
function findProjectName(json) {
  if (!json || typeof json !== 'object') return '';
  const queue = [{ node: json, depth: 0 }];
  while (queue.length) {
    const { node, depth } = queue.shift();
    if (Array.isArray(node)) {
      // JSON Lines: a header object in the first line may carry the project
      if (depth === 0 && node[0] && typeof node[0] === 'object' && !Array.isArray(node[0])) queue.push({ node: node[0], depth: 1 });
      continue;
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (/^project(_?name)?$/i.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v).trim();
    }
    if (depth < 3) {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) queue.push({ node: v, depth: depth + 1 });
      }
    }
  }
  return '';
}

function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 120);
}

// "Word level Transcription.txt", or "Word level Transcription - Sause Downfall.txt" when the JSON has a project
function downloadFileName() {
  const project = safeFileName(findProjectName(state.parsedJSON));
  return `${project ? `${DOWNLOAD_BASE_NAME} - ${project}` : DOWNLOAD_BASE_NAME}.txt`;
}

function downloadOutput() {
  const text = $('outputTextarea').value;
  if (!text) {
    showToast('Nothing to download', 'error');
    return;
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = downloadFileName();
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded "${fileName}"`);
}

// Start: restore the user's last inputs, otherwise load the Crumbl sample
window.onload = function () {
  applyThemeIcon();
  setupDragAndDrop();
  let restored = false;
  try {
    const s = localStorage.getItem(LS_SCRIPT);
    const t = localStorage.getItem(LS_TRANSCRIPT);
    if ((s && s.trim()) || (t && t.trim())) {
      $('scriptInput').value = s || '';
      $('transcriptInput').value = t || '';
      inspectAndPopulateTranscriptSchema(true);
      runConversion(true);
      restored = true;
    }
  } catch (_) { /* storage disabled */ }
  if (!restored) loadScenario('crumbl_standard');
};
