/* =========================================================================
   SCRIPT PARSER (Markdown tables, inline beats, heading beats)
   ========================================================================= */
const DEFAULT_SECTION_REGEX = '^#{1,4}\\s+(.+)$';

function autoDetectScriptStructure() {
  $('scriptParseMode').value = 'auto';
  $('scriptKeyCol').value = 'auto';
  $('scriptTextCol').value = 'auto';
  $('sectionRegexInput').value = DEFAULT_SECTION_REGEX;
  runConversion(true);
  showToast('Auto-detected script table structure');
}

function formatBeatKey(rawKey, mode) {
  const trimmed = String(rawKey || '').trim();
  if (!trimmed) return '«?»';
  if (mode === 'raw') return trimmed;
  const inner = trimmed.replace(/^[«<\[\(]+|[»>\]\)]+$/g, '').trim();
  return `«${inner}»`;
}

// Splits "| a | b \| c | d |" into cells (supports escaped pipes and rows without a trailing pipe)
function splitTableRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const isSeparatorRow = (cells) => cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')) || c === '');
const looksLikeBeatKey = (c) => /«[^»]+»/.test(c || '') || /^\[?\d+[a-z]?\]?$/i.test(String(c || '').trim());

function analyzeHeaderRow(cells) {
  const keyIdx = cells.findIndex(c => /^(key|beat|beat key|beat #|#|id|no\.?|num(ber)?)$/i.test(c.replace(/[*_`]/g, '').trim()));
  const textIdx = cells.findIndex(c => /script|line|narration|voice|\bvo\b|dialogue|spoken|copy|text/i.test(c) && !/visual|b-?roll|note|type|key/i.test(c));
  return { keyIdx, textIdx };
}

// Removes things that are written in the script but not spoken (markdown, [B-ROLL] tags, inline code)
function cleanScriptText(t) {
  return String(t || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseScriptStructure() {
  const notes = [];
  const rawScript = $('scriptInput').value || '';
  const lines = rawScript.split(/\r?\n/);

  const parseMode = $('scriptParseMode').value;
  const keyColSetting = $('scriptKeyCol').value;
  const textColSetting = $('scriptTextCol').value;
  const keyFormatMode = $('beatKeyFormat').value;

  const regexStr = ($('sectionRegexInput').value || '').trim() || DEFAULT_SECTION_REGEX;
  const customRegex = regexStr !== DEFAULT_SECTION_REGEX;
  let secRegex;
  try {
    secRegex = new RegExp(regexStr);
  } catch (e) {
    notes.push({ level: 'warn', title: 'Section heading regex is invalid — using default "## Heading"', detail: e.message });
    secRegex = new RegExp(DEFAULT_SECTION_REGEX);
  }

  const usesH2 = lines.some(l => /^\s*#{2,6}\s+\S/.test(l));
  const sections = [];
  let currentSection = null;
  let currentTable = null;
  let headingBeat = null; // a "### «1»" beat that collects the lines below it

  const ensureSection = () => {
    if (!currentSection) {
      currentSection = { title: '0. Main Section', beats: [] };
      sections.push(currentSection);
    }
    return currentSection;
  };
  const pushBeat = (rawKey, text, lineNo) => {
    const beat = { key: formatBeatKey(rawKey, keyFormatMode), scriptLine: String(text || '').trim(), lineNo, matchedWords: [] };
    ensureSection().beats.push(beat);
    return beat;
  };
  const startSection = (title) => {
    currentSection = { title: cleanScriptText(title) || title, beats: [] };
    sections.push(currentSection);
    headingBeat = null;
  };

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim();
    if (!trimmed) continue;
    if (/^LAST\s+KEY\s*:/i.test(trimmed)) continue;
    const isTableLine = trimmed.startsWith('|');
    if (!isTableLine) currentTable = null;

    // Markdown headings
    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      const content = heading[2].trim();
      const beatHeading = content.match(/^(«[^»]+»|\[\d+[a-z]?\])\s*[:\-–—|.]?\s*(.*)$/i);
      if (beatHeading && level >= 2 && parseMode !== 'table') {
        headingBeat = pushBeat(beatHeading[1], beatHeading[2], li + 1);
        continue;
      }
      if (!customRegex && level === 1 && usesH2) { headingBeat = null; continue; } // document title
      const m = trimmed.match(secRegex);
      if (m) { startSection((m[1] || m[0]).trim()); continue; }
      if (!customRegex) { startSection(content); continue; }
      headingBeat = null;
      continue; // heading that the custom regex does not accept
    }

    // Custom section patterns that are not markdown headings (e.g. "SECTION 2: Backstory")
    if (customRegex && !isTableLine) {
      const m = trimmed.match(secRegex);
      if (m) { startSection((m[1] || m[0]).trim()); continue; }
    }

    // Markdown table rows
    if (isTableLine) {
      if (parseMode === 'inline') continue;
      headingBeat = null;
      const cells = splitTableRow(trimmed);
      if (isSeparatorRow(cells)) continue;
      const nextLine = (lines[li + 1] || '').trim();
      if (nextLine.startsWith('|') && isSeparatorRow(splitTableRow(nextLine))) {
        currentTable = analyzeHeaderRow(cells); // header row
        continue;
      }
      if (!currentTable && /^(key|beat|#|id)$/i.test(cells[0].replace(/[^\w#]/g, '')) && cells.some(c => /script|line|text/i.test(c))) {
        currentTable = analyzeHeaderRow(cells); // header row without separator
        continue;
      }

      let keyIdx;
      if (keyColSetting === 'auto') {
        keyIdx = currentTable && currentTable.keyIdx >= 0 && looksLikeBeatKey(cells[currentTable.keyIdx])
          ? currentTable.keyIdx
          : cells.findIndex(looksLikeBeatKey);
      } else {
        keyIdx = parseInt(keyColSetting, 10);
      }
      if (keyIdx < 0 || keyIdx >= cells.length || !cells[keyIdx]) continue; // not a beat row

      let textIdx;
      if (textColSetting === 'auto') {
        textIdx = currentTable && currentTable.textIdx >= 0 && currentTable.textIdx !== keyIdx ? currentTable.textIdx : keyIdx + 1;
      } else {
        textIdx = parseInt(textColSetting, 10);
      }
      const text = textIdx !== keyIdx && textIdx < cells.length ? cells[textIdx] : '';
      pushBeat(cells[keyIdx], text, li + 1);
      continue;
    }

    // Inline beats: "«1» There was a time…"  /  "- [1]: There was…"
    if (parseMode !== 'table') {
      const im = trimmed.match(/^(?:[-*]\s+)?(«[^»]+»|\[\d+[a-z]?\])\s*[|:\-–—.)]*\s*(.+)$/i);
      if (im) {
        pushBeat(im[1], im[2], li + 1);
        headingBeat = null;
        continue;
      }
      // Text lines under a "### «1»" heading belong to that beat (skip visual notes)
      if (headingBeat && !/^(`|\[|>|<!--|---)/.test(trimmed) && !/^(type|visuals?|notes?|b-?roll|on-?screen|overlay|sources?)\s*:/i.test(trimmed)) {
        headingBeat.scriptLine += (headingBeat.scriptLine ? ' ' : '') + trimmed;
      }
    }
  }

  const finalSections = sections.filter(s => s.beats.length > 0);
  const allBeats = [];
  finalSections.forEach(s => s.beats.forEach(b => allBeats.push(b)));

  // Script checks
  const emptyBeats = allBeats.filter(b => !cleanScriptText(b.scriptLine));
  if (emptyBeats.length) {
    notes.push({
      level: 'warn',
      title: `${emptyBeats.length} beat(s) have no script text, so they cannot be matched: ${emptyBeats.slice(0, 8).map(b => b.key).join(', ')}${emptyBeats.length > 8 ? ' …' : ''}`,
      detail: `First one is on script line ${emptyBeats[0].lineNo}. If the text is in another column, set "Script Text Col #" in Map Script.`
    });
  }
  const seen = new Map();
  const dups = [];
  allBeats.forEach(b => {
    if (seen.has(b.key)) dups.push(b);
    else seen.set(b.key, b);
  });
  if (dups.length) {
    notes.push({
      level: 'warn',
      title: `Duplicate beat key(s) in the script: ${[...new Set(dups.map(b => b.key))].slice(0, 8).join(', ')}`,
      detail: `e.g. ${dups[0].key} appears again on script line ${dups[0].lineNo}. The AI will not be able to tell these beats apart.`
    });
  }
  if (!allBeats.length && rawScript.trim()) {
    notes.push({
      level: 'error',
      title: 'No beats found in the script',
      detail: 'Expected markdown table rows like "| «1» | Script line |", inline lines like "«1» Script line", or headings like "### «1»". Use "Map Script" to choose the key and text columns.'
    });
  }
  return { sections: finalSections, notes };
}
