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
  showToast('Recommended Structure copied to clipboard!');
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
  a.download = 'compressed_script_transcript.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Downloaded compressed_script_transcript.txt');
}

// Start: restore the user's last inputs, otherwise load the Crumbl sample
window.onload = function () {
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
