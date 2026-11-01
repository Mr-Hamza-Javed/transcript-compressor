/* =========================================================================
   TIMESTAMP PARSING
   ========================================================================= */
function isClockString(v) {
  return typeof v === 'string' && v.includes(':');
}

// Returns seconds as a number, or null when the value is missing / not a time.
// Understands 3.566, "3.566", "3,566", "00:00:03.566", "00:00:03,566" (SRT), "3.566s" (Google), {seconds, nanos}
function parseTimeToSeconds(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'object') {
    if ('seconds' in v || 'nanos' in v) return (Number(v.seconds) || 0) + (Number(v.nanos) || 0) / 1e9;
    return null;
  }
  let str = String(v).trim();
  if (!str) return null;
  str = str.replace(/s$/i, '');
  const hms = str.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
  if (hms) {
    const h = parseInt(hms[1] || '0', 10);
    const m = parseInt(hms[2], 10);
    const s = parseInt(hms[3], 10);
    const frac = hms[4] ? Number('0.' + hms[4]) : 0;
    return h * 3600 + m * 60 + s + frac;
  }
  if (/^-?\d+(?:\.\d+)?(?:e-?\d+)?$/i.test(str)) return parseFloat(str);
  if (/^-?\d+,\d+$/.test(str)) return parseFloat(str.replace(',', '.'));
  return null;
}

function median(nums) {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/* =========================================================================
   FLEXIBLE JSON PARSING (with clear error messages)
   ========================================================================= */
function describeJSONError(err, text, lineOffset) {
  const msg = String((err && err.message) || err || 'Invalid JSON');
  let line = null, col = null;
  const lc = msg.match(/line (\d+) column (\d+)/i);
  const pos = msg.match(/position (\d+)/i);
  if (lc) {
    line = parseInt(lc[1], 10);
    col = parseInt(lc[2], 10);
  } else if (pos) {
    const p = Math.min(parseInt(pos[1], 10), text.length);
    const before = text.slice(0, p);
    line = (before.match(/\n/g) || []).length + 1;
    col = p - before.lastIndexOf('\n');
  }
  let snippet = '';
  if (line) {
    snippet = (text.split('\n')[line - 1] || '').trim();
    line += lineOffset;
  }
  return { message: msg.replace(/^JSON\.parse:\s*/, ''), line, col, snippet: shorten(snippet, 120) };
}

// Closes a truncated JSON document (e.g. copy-paste cut off half-way). String-aware.
function closeTruncatedJSON(s) {
  const last = s.lastIndexOf('}');
  if (last === -1) return null;
  let t = s.slice(0, last + 1);
  const stack = [];
  let inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inStr) return null;
  return t + stack.reverse().map(c => (c === '{' ? '}' : ']')).join('');
}

function tryParseFlexibleJSON(rawText) {
  if (!rawText || !rawText.trim()) return { value: null, looksJSON: false };
  const lineOffset = (rawText.match(/^\s*/)[0].match(/\n/g) || []).length;
  let s = rawText.trim().replace(/^﻿/, '');

  // `"words": [ ... ]` pasted without the outer { }
  if (/^"[^"\n]+"\s*:/.test(s)) s = '{' + s.replace(/,\s*$/, '') + '}';

  const looksJSON = /^[\[{]/.test(s);
  let firstErr = null;
  try {
    return { value: JSON.parse(s), looksJSON: true };
  } catch (e) {
    firstErr = e;
  }

  // JSON Lines (one JSON object per line)
  const lines = s.split(/\r?\n/).filter(l => l.trim());
  if (lines.length > 1 && lines.every(l => /^\s*[\[{]/.test(l))) {
    try {
      return { value: lines.map(l => JSON.parse(l)), looksJSON: true, note: 'jsonl' };
    } catch (_) { /* fall through */ }
  }

  if (!looksJSON) return { value: null, looksJSON: false };

  // Repair 1: trailing commas like [1, 2, ]
  const noTrailing = s.replace(/,\s*([\]}])/g, '$1');
  try {
    return { value: JSON.parse(noTrailing), looksJSON: true, repaired: 'trailing-commas' };
  } catch (_) { /* fall through */ }

  // Repair 2: truncated paste
  const closed = closeTruncatedJSON(noTrailing);
  if (closed) {
    try {
      return { value: JSON.parse(closed), looksJSON: true, repaired: 'truncated' };
    } catch (_) { /* fall through */ }
  }

  return { value: null, looksJSON: true, error: describeJSONError(firstErr, s, lineOffset) };
}

/* =========================================================================
   TRANSCRIPT SCHEMA DETECTION (finds the word list anywhere in the JSON)
   ========================================================================= */
function getByKeyPath(obj, keyPath) {
  if (obj === null || obj === undefined) return undefined;
  if (!keyPath.includes('.')) return obj[keyPath];
  let cur = obj;
  for (const p of keyPath.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

// Resolves "segments.*.words" (all segments' words, flattened) or "results.channels.0.alternatives.0.words"
function resolvePath(root, pathStr) {
  if (root === null || root === undefined) return [];
  if (!pathStr || pathStr === '__root__') return Array.isArray(root) ? root : [];
  let nodes = [root];
  for (const p of pathStr.split('.')) {
    const next = [];
    for (const n of nodes) {
      if (n === null || typeof n !== 'object') continue;
      if (p === '*') {
        if (Array.isArray(n)) for (const x of n) next.push(x);
      } else if (p in n) {
        next.push(n[p]);
      }
    }
    nodes = next;
  }
  const out = [];
  for (const n of nodes) if (Array.isArray(n)) for (const x of n) out.push(x);
  return out;
}

function discoverArrayPaths(root) {
  const found = [];
  const seen = new Set();
  function walk(node, parts, depth) {
    if (depth > 8 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (!node.length) return;
      const pathStr = parts.length ? parts.join('.') : '__root__';
      if (!seen.has(pathStr)) { seen.add(pathStr); found.push(pathStr); }
      const objs = node.slice(0, 5).filter(x => x && typeof x === 'object' && !Array.isArray(x));
      if (!objs.length) return;
      const lastPart = parts[parts.length - 1] || '';
      const idx = (node.length === 1 || /^alternatives$/i.test(lastPart)) ? '0' : '*';
      const keys = new Set();
      objs.forEach(o => Object.keys(o).forEach(k => keys.add(k)));
      keys.forEach(k => {
        if (k.includes('.')) return;
        const child = objs.map(o => o[k]).find(v => v && typeof v === 'object');
        if (child) walk(child, [...parts, idx, k], depth + 1);
      });
      return;
    }
    Object.keys(node).forEach(k => {
      if (k.includes('.')) return;
      const v = node[k];
      if (v && typeof v === 'object') walk(v, [...parts, k], depth + 1);
    });
  }
  walk(root, [], 0);
  return found;
}

// Lists keys of word objects, including small nested ones like "alternatives.0.content" (AWS Transcribe)
function collectKeyPaths(objs) {
  const keys = [];
  const add = (k) => { if (!keys.includes(k)) keys.push(k); };
  objs.forEach(o => {
    Object.keys(o).forEach(k => {
      const v = o[k];
      if (v && typeof v === 'object') {
        if (Array.isArray(v)) {
          if (v.length && v.length <= 5 && v[0] && typeof v[0] === 'object' && !Array.isArray(v[0])) {
            Object.keys(v[0]).forEach(sub => {
              if (typeof v[0][sub] !== 'object') add(`${k}.0.${sub}`);
            });
          }
        } else if ('seconds' in v || 'nanos' in v) {
          add(k); // Google style {seconds, nanos} timestamp
        } else {
          Object.keys(v).forEach(sub => { if (typeof v[sub] !== 'object') add(`${k}.${sub}`); });
        }
      } else {
        add(k);
      }
    });
  });
  return keys;
}

const WORD_KEY_NAMES = ['punctuated_word', 'word', 'text', 'token', 'token_text', 'value', 'content', 'w', 'label', 'transcript'];
const START_KEY_NAMES = ['start_time', 'start', 'starttime', 'start_ms', 'startms', 'start_sec', 'start_seconds', 't_in', 'tin', 'ts', 'begin', 'from', 's', 'startoffset', 'start_offset', 'offset', 'start_ts'];
const END_KEY_NAMES = ['end_time', 'end', 'endtime', 'end_ms', 'endms', 'end_sec', 'end_seconds', 't_out', 'tout', 'end_ts', 'finish', 'to', 'e', 'endoffset', 'end_offset', 'stop'];

function guessObjectMapping(keys, objs) {
  const valuesOf = (k) => objs.map(o => getByKeyPath(o, k)).filter(v => v !== undefined && v !== null);
  const isWordy = (k) => {
    const v = valuesOf(k);
    return v.length > 0 && v.filter(x => typeof x === 'string').length / v.length >= 0.6 && v.some(x => /[\p{L}\p{N}]/u.test(String(x)));
  };
  const isTimey = (k) => {
    const v = valuesOf(k);
    return v.length >= Math.max(1, Math.floor(objs.length * 0.3)) && v.filter(x => parseTimeToSeconds(x) !== null).length / v.length >= 0.8;
  };
  const pick = (names, rx, ok, exclude) => {
    for (const name of names) {
      const k = keys.find(key => !exclude.includes(key) && (key.toLowerCase() === name || key.split('.').pop().toLowerCase() === name) && ok(key));
      if (k) return k;
    }
    return keys.find(key => !exclude.includes(key) && rx.test(key.split('.').pop()) && ok(key)) || null;
  };
  const word = pick(WORD_KEY_NAMES, /word|text|tok|content|value/i, isWordy, []);
  const start = pick(START_KEY_NAMES, /start|begin|^t_?in$/i, isTimey, [word]);
  const end = pick(END_KEY_NAMES, /end|stop|finish|^t_?out$/i, isTimey, [word, start]);
  const typeKey = keys.find(k => /^(type|kind|element_type)$/i.test(k)) || null;

  // A single string variable that packs word + times together, e.g. {"packed": "There | 0.000 - 0.297"}
  let combinedKey = null;
  if (!start || !end) {
    combinedKey = keys.find(k => {
      const v = valuesOf(k).filter(x => typeof x === 'string');
      return v.length && v.filter(x => parseCombinedString(x)).length / v.length >= 0.6;
    }) || null;
  }
  return { word, start, end, typeKey, combinedKey };
}

function guessTupleIndexes(arrays) {
  const width = Math.max(...arrays.map(a => a.length));
  const textScore = new Array(width).fill(0);
  const timeScore = new Array(width).fill(0);
  arrays.forEach(a => a.forEach((v, i) => {
    if (typeof v === 'string' && /[\p{L}]/u.test(v) && parseTimeToSeconds(v) === null) textScore[i]++;
    else if (parseTimeToSeconds(v) !== null) timeScore[i]++;
  }));
  let w = textScore.indexOf(Math.max(...textScore));
  if (textScore[w] === 0) w = 0;
  const timeIdx = [];
  for (let i = 0; i < width; i++) if (i !== w && timeScore[i] >= arrays.length * 0.6) timeIdx.push(i);
  if (timeIdx.length < 2) return null;
  return { w, s: timeIdx[0], e: timeIdx[1] };
}

function analyzeCandidate(path) {
  const arr = resolvePath(state.parsedJSON, path);
  const count = arr.length;
  const sample = arr.slice(0, 300);
  const label = (path === '__root__' ? '[Root Array]' : path.replace(/\.\*\./g, '[*].').replace(/\.(\d+)\./g, '[$1].'));
  const res = { path, count, label, mode: null, score: 0, keys: [], mapping: {}, wordLevel: true };
  if (!count) return res;

  const arrays = sample.filter(Array.isArray);
  const strings = sample.filter(x => typeof x === 'string');
  const objs = sample.filter(x => x && typeof x === 'object' && !Array.isArray(x));
  const avgTokens = (vals) => vals.length ? vals.reduce((a, v) => a + String(v).trim().split(/\s+/).length, 0) / vals.length : 99;

  if (arrays.length >= sample.length * 0.6) {
    const t = guessTupleIndexes(arrays);
    res.mode = 'tuples';
    res.mapping = { tuple: t || { w: 0, s: 1, e: 2 } };
    res.wordLevel = t ? avgTokens(arrays.map(a => a[t.w])) <= 1.6 : false;
    res.score = (t ? 1 : 0.05) * (res.wordLevel ? 1 : 0.02) * count;
  } else if (strings.length >= sample.length * 0.6) {
    const okRate = strings.filter(x => parseCombinedString(x)).length / strings.length;
    res.mode = 'combined';
    res.mapping = { combinedKey: '__self__' };
    res.score = (okRate >= 0.6 ? 0.9 : 0.01) * count;
  } else if (objs.length) {
    res.keys = collectKeyPaths(objs);
    const m = guessObjectMapping(res.keys, objs);
    res.mapping = m;
    if (m.word && (m.start || m.end)) {
      res.mode = 'objects';
      res.wordLevel = avgTokens(objs.map(o => getByKeyPath(o, m.word)).filter(v => typeof v === 'string')) <= 1.6;
      res.score = (m.start && m.end ? 1 : 0.4) * (res.wordLevel ? 1 : 0.02) * count;
    } else if (m.combinedKey) {
      res.mode = 'combined';
      res.score = 0.9 * count;
    } else {
      res.mode = 'objects';
      res.score = 0.001 * count;
    }
  }
  if (!res.wordLevel) res.label += ' · sentence-level';
  return res;
}

function fillSelect(sel, keys, value) {
  sel.innerHTML = keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
  if (value !== null && value !== undefined && keys.includes(value)) sel.value = value;
}

function applyCandidate(cand) {
  const pill = $('detectedFormatPill');
  state.typeKey = null;
  state.mappingMessage = null;

  if (cand.mode === 'tuples') {
    setTranscriptMode('tuples');
    const t = cand.mapping.tuple;
    $('tupleWordIdx').value = t.w;
    $('tupleStartIdx').value = t.s;
    $('tupleEndIdx').value = t.e;
    pill.textContent = `Tuple Array [${t.w},${t.s},${t.e}]`;
    if (t.w !== 0 || t.s !== 1 || t.e !== 2) state.mappingMessage = `Array-of-arrays detected. Word is item ${t.w}, start ${t.s}, end ${t.e}.`;
    return;
  }

  if (cand.mode === 'combined') {
    setTranscriptMode('combined');
    const key = cand.mapping.combinedKey || '__self__';
    const sel = $('mapCombinedSourceKey');
    sel.innerHTML = `<option value="__self__">[Item is String itself]</option>` +
      cand.keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
    sel.value = key;
    $('combinedDelimiterInput').value = 'auto';
    pill.textContent = key === '__self__' ? 'Combined String Array' : `Single Variable (${key})`;
    state.mappingMessage = key === '__self__'
      ? 'Each item is one text string. Word and timestamps are split out automatically.'
      : `Single-variable format detected ("${key}"). Word and timestamps are split out automatically.`;
    return;
  }

  // Separate variables (objects)
  setTranscriptMode('objects');
  const m = cand.mapping;
  const keys = cand.keys.length ? cand.keys : ['word', 'start_time', 'end_time'];
  fillSelect($('mapWordKey'), keys, m.word || keys[0]);
  fillSelect($('mapStartKey'), keys, m.start || keys[1] || keys[0]);
  fillSelect($('mapEndKey'), keys, m.end || keys[2] || keys[0]);
  $('mapCombinedSourceKey').innerHTML = `<option value="__self__">[Item is String itself]</option>` +
    keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
  state.typeKey = m.typeKey || null;

  const isStandard = ['word', 'text', 'punctuated_word'].includes(m.word) &&
    ['start_time', 'start'].includes(m.start) && ['end_time', 'end'].includes(m.end);
  if (!m.word || !m.start || !m.end) {
    pill.textContent = 'Needs mapping';
    state.mappingMessage = `Could not find ${[!m.word && 'a word', !m.start && 'a start-time', !m.end && 'an end-time'].filter(Boolean).join(', ')} variable automatically in: ${keys.join(', ')}. Please pick it in the Schema Mapper.`;
  } else if (isStandard) {
    pill.textContent = `Mapped: ${m.word} / ${m.start} / ${m.end}`;
  } else {
    pill.textContent = `Mapped: ${m.word} / ${m.start} / ${m.end}`;
    state.mappingMessage = `Custom JSON variables detected at "${cand.label}". Auto-mapped word = ${m.word}, start = ${m.start}, end = ${m.end}.`;
  }
}

function inspectAndPopulateTranscriptSchema(forceReset = false) {
  const raw = $('transcriptInput').value;
  const pill = $('detectedFormatPill');
  const info = tryParseFlexibleJSON(raw);
  state.jsonInfo = info;
  state.parsedJSON = info.value;
  state.schemaNotes = [];

  if (!raw.trim()) {
    state.schemaSignature = null;
    state.candidates = [];
    state.mappingMessage = null;
    pill.textContent = 'Waiting for transcript';
    return;
  }

  if (state.parsedJSON === null || state.parsedJSON === undefined) {
    state.candidates = [];
    state.mappingMessage = null;
    if (info.looksJSON) {
      // Broken JSON: do NOT silently fall back to text mode
      state.schemaSignature = null;
      pill.textContent = 'JSON error';
      setTranscriptMode('objects');
      return;
    }
    state.schemaSignature = 'lines';
    setTranscriptMode('lines');
    pill.textContent = /-->/.test(raw) ? 'Subtitles (SRT/VTT)' : 'Delimited Text Mode';
    return;
  }

  if (info.repaired === 'truncated') {
    state.schemaNotes.push({ level: 'warn', title: 'Transcript JSON looked cut off — repaired automatically', detail: 'The end of the pasted JSON was incomplete. The app closed it so it can be read, but the last word(s) may be missing. Paste the full file if possible.' });
  } else if (info.repaired === 'trailing-commas') {
    state.schemaNotes.push({ level: 'info', title: 'Transcript JSON had trailing commas — fixed automatically' });
  } else if (info.note === 'jsonl') {
    state.schemaNotes.push({ level: 'info', title: 'Read transcript as JSON Lines (one object per line)' });
  }

  const paths = discoverArrayPaths(state.parsedJSON);
  const cands = paths.map(analyzeCandidate).filter(c => c.count > 0).sort((a, b) => b.score - a.score);
  const signature = cands.map(c => `${c.path}:${c.mode}:${c.keys.join(',')}`).join('|');
  const keepUserChoices = !forceReset && signature === state.schemaSignature && signature !== '';
  state.schemaSignature = signature;
  state.candidates = cands;

  const pathSelect = $('jsonArrayPathSelect');
  const prevPath = pathSelect.value;
  pathSelect.innerHTML = cands.map(c => `<option value="${escapeHtml(c.path)}">${escapeHtml(c.label)} (${c.count} items)</option>`).join('');

  if (!cands.length) {
    state.schemaNotes.push({
      level: 'error',
      title: 'No list of words found in the transcript JSON',
      detail: 'The JSON was read, but it does not contain any array of words. A word-by-word transcript needs a list like "words": [{"word": "Hi", "start": 0.0, "end": 0.3}, …].'
    });
    pill.textContent = 'No word list';
    return;
  }

  if (keepUserChoices && cands.some(c => c.path === prevPath)) {
    pathSelect.value = prevPath; // keep the user's manual mapping while they edit the text
    return;
  }

  const best = cands[0];
  pathSelect.value = best.path;
  applyCandidate(best);
  if (!best.wordLevel) {
    state.schemaNotes.push({
      level: 'warn',
      title: 'Transcript seems to be sentence-level, not word-by-word',
      detail: `The best list found ("${best.label}") has several words per item, so every "word" will hold a whole phrase. Export the transcript with word-level timestamps for accurate beat timings.`
    });
  }
}

/* =========================================================================
   TRANSCRIPT WORD EXTRACTION
   ========================================================================= */
// Splits strings like "There | 0.000 - 0.297", "1,000th,21.36,21.92", "0.000 0.297 There"
const TS_PART = '(\\d+(?::\\d{1,2}){0,2}(?:[.,]\\d+)?)s?';
const SEP_PART = '[\\s|,;\\-–—>\\[\\]()\\t]+';
const COMBINED_WORD_FIRST = new RegExp('^(.*?)' + SEP_PART + TS_PART + SEP_PART + TS_PART + '[\\s\\])]*$');
const COMBINED_TIME_FIRST = new RegExp('^[\\s\\[(]*' + TS_PART + SEP_PART + TS_PART + SEP_PART + '(.+)$');

function parseCombinedString(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  let m = s.match(COMBINED_WORD_FIRST);
  if (m) {
    const word = m[1].replace(/^[\s|,;:\-–—]+|[\s|,;:\-–—]+$/g, '');
    if (word) return { word, start: m[2], end: m[3] };
  }
  m = s.match(COMBINED_TIME_FIRST);
  if (m) {
    const word = m[3].replace(/^[\s|,;:\-–—]+|[\s|,;:\-–—]+$/g, '');
    if (word && parseTimeToSeconds(word) === null) return { word, start: m[1], end: m[2] };
  }
  return null;
}

function parseSubtitleCues(raw) {
  const items = [];
  let cues = 0, multiWordCues = 0;
  const blocks = raw.replace(/\r/g, '').split(/\n\s*\n/);
  for (const block of blocks) {
    const ls = block.split('\n').map(x => x.trim()).filter(Boolean);
    const ti = ls.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const m = ls[ti].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!m) continue;
    const s = parseTimeToSeconds(m[1]);
    const e = parseTimeToSeconds(m[2]);
    const text = ls.slice(ti + 1).join(' ').replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').trim();
    const toks = text.split(/\s+/).filter(Boolean);
    if (!toks.length || s === null || e === null) continue;
    cues++;
    if (toks.length > 1) multiWordCues++;
    // Spread the cue duration over its words by character length
    const total = toks.reduce((a, t) => a + t.length + 1, 0);
    let acc = 0;
    toks.forEach(t => {
      const ws = s + (e - s) * acc / total;
      acc += t.length + 1;
      const we = s + (e - s) * acc / total;
      items.push({ word: t, startNum: ws, endNum: we, estimated: toks.length > 1 });
    });
  }
  return { items, cues, multiWordCues };
}

function extractTranscriptWords() {
  const notes = [];
  const raw = $('transcriptInput').value;
  if (!raw.trim()) return { words: [], notes };

  const mode = $('transcriptModeSelect').value;
  const policy = $('timeFormatPolicy').value;
  const items = [];

  if (mode === 'lines') {
    if (/-->/.test(raw)) {
      const sub = parseSubtitleCues(raw);
      sub.items.forEach(it => items.push(it));
      if (!sub.cues) {
        notes.push({ level: 'error', title: 'Could not read the subtitle file', detail: 'Lines with "-->" were found, but no cue had both a valid time range and text.' });
      } else if (sub.multiWordCues) {
        notes.push({
          level: 'warn',
          title: 'Subtitle file (SRT/VTT) is sentence-level — word times are estimated',
          detail: `${sub.multiWordCues} of ${sub.cues} cues contain several words. Each word's time was spread evenly across its cue, so beat start/end times are approximate. Use a word-level JSON export for exact timings.`
        });
      }
    } else {
      const unparsed = [];
      let firstContent = true;
      raw.split(/\r?\n/).forEach((line, i) => {
        const t = line.trim();
        if (!t || t.startsWith('#') || /^WEBVTT/i.test(t)) return;
        const p = parseCombinedString(t);
        if (p) {
          items.push({ word: p.word, startRaw: p.start, endRaw: p.end });
        } else if (!(firstContent && !/\d/.test(t))) { // allow one header line like "word,start,end"
          unparsed.push({ line: i + 1, text: t });
        }
        firstContent = false;
      });
      if (unparsed.length) {
        const examples = unparsed.slice(0, 3).map(u => `line ${u.line}: "${shorten(u.text, 60)}"`).join('; ');
        if (!items.length) {
          notes.push({
            level: 'error',
            title: 'Transcript format not recognised',
            detail: `No line looked like "word | start | end". Examples: ${examples}. Paste word-level JSON, or lines such as "There|0.000|0.297".`
          });
        } else {
          notes.push({
            level: 'warn',
            title: `${unparsed.length} transcript line(s) could not be read and were skipped`,
            detail: `Expected "word | start | end". ${examples}${unparsed.length > 3 ? ' …' : ''}`
          });
        }
      }
    }
    return finalizeWords(items, policy, notes);
  }

  // JSON based modes
  const info = state.jsonInfo || tryParseFlexibleJSON(raw);
  if (state.parsedJSON === null || state.parsedJSON === undefined) {
    if (info.error) {
      const where = info.error.line ? ` at line ${info.error.line}${info.error.col ? `, column ${info.error.col}` : ''}` : '';
      notes.push({
        level: 'error',
        title: `Transcript JSON has a syntax error${where}`,
        detail: `${info.error.message}${info.error.snippet ? ` — near: ${info.error.snippet}` : ''}. Common causes: a missing comma between items, a missing quote, or an unfinished copy-paste.`
      });
    } else {
      notes.push({ level: 'error', title: 'Transcript could not be read', detail: 'Switch "Data Structure Mode" to Plain Text if this is not JSON.' });
    }
    return { words: [], notes };
  }

  const pathStr = $('jsonArrayPathSelect').value || '__root__';
  const arr = resolvePath(state.parsedJSON, pathStr);
  if (!arr.length) {
    notes.push({ level: 'error', title: 'The selected "JSON Array Location" has no items', detail: 'Pick another location in the Schema Mapper.' });
    return { words: [], notes };
  }

  let wrongShape = 0;
  if (mode === 'objects') {
    const wKey = $('mapWordKey').value;
    const sKey = $('mapStartKey').value;
    const eKey = $('mapEndKey').value;
    const tKey = state.typeKey;
    arr.forEach(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { wrongShape++; return; }
      const w = getByKeyPath(item, wKey);
      if (w === undefined || w === null || typeof w === 'object') return;
      let kind = 'word';
      if (tKey) {
        const t = String(getByKeyPath(item, tKey) || '').toLowerCase();
        if (/spacing|whitespace/.test(t)) return;
        if (/audio_event|event|sound|noise|music/.test(t)) kind = 'skip';
        else if (/punct/.test(t)) kind = 'punct';
      }
      items.push({ word: w, startRaw: getByKeyPath(item, sKey), endRaw: getByKeyPath(item, eKey), kind });
    });
    if (wKey && sKey && wKey === sKey) notes.push({ level: 'warn', title: 'Word and Start Time use the same variable', detail: 'Check the Schema Mapper.' });
  } else if (mode === 'combined') {
    const srcKey = $('mapCombinedSourceKey').value;
    const delim = ($('combinedDelimiterInput').value || 'auto').trim();
    let regex = null;
    if (delim && delim.toLowerCase() !== 'auto') {
      try { regex = new RegExp(delim); } catch (e) {
        notes.push({ level: 'warn', title: 'Split regex is invalid — using automatic splitting', detail: e.message });
      }
    }
    const wIdx = parseInt($('combWordIdx').value || '0', 10);
    const sIdx = parseInt($('combStartIdx').value || '1', 10);
    const eIdx = parseInt($('combEndIdx').value || '2', 10);
    let failed = 0, firstFail = null;
    arr.forEach(item => {
      const strVal = (srcKey === '__self__' || typeof item === 'string')
        ? (typeof item === 'string' ? item : '')
        : (item && getByKeyPath(item, srcKey) !== undefined ? String(getByKeyPath(item, srcKey)) : '');
      if (!strVal.trim()) return;
      if (regex) {
        const parts = strVal.trim().split(regex).filter(Boolean);
        if (parts.length > Math.max(wIdx, sIdx, eIdx)) {
          items.push({ word: parts[wIdx], startRaw: parts[sIdx], endRaw: parts[eIdx] });
        } else { failed++; firstFail = firstFail || strVal; }
      } else {
        const p = parseCombinedString(strVal);
        if (p) items.push({ word: p.word, startRaw: p.start, endRaw: p.end });
        else { failed++; firstFail = firstFail || strVal; }
      }
    });
    if (failed) {
      notes.push({
        level: items.length ? 'warn' : 'error',
        title: `${failed} combined value(s) could not be split into word + start + end`,
        detail: `Example: "${shorten(firstFail, 60)}". Check "Source Variable" and the split settings.`
      });
    }
  } else if (mode === 'tuples') {
    const wIdx = parseInt($('tupleWordIdx').value || '0', 10);
    const sIdx = parseInt($('tupleStartIdx').value || '1', 10);
    const eIdx = parseInt($('tupleEndIdx').value || '2', 10);
    arr.forEach(item => {
      if (!Array.isArray(item)) { wrongShape++; return; }
      if (item[wIdx] === undefined || item[wIdx] === null) return;
      items.push({ word: item[wIdx], startRaw: item[sIdx], endRaw: item[eIdx] });
    });
  }
  if (wrongShape) {
    notes.push({ level: 'warn', title: `${wrongShape} item(s) in the word list have a different shape and were skipped`, detail: 'Check "Data Structure Mode" in the Schema Mapper.' });
  }
  if (!items.length && !notes.some(n => n.level === 'error')) {
    notes.push({ level: 'error', title: 'No words could be read with the current mapping', detail: 'Open the Schema Mapper and check which variable holds the word and the timestamps.' });
  }
  return finalizeWords(items, policy, notes);
}

// Cleans words, merges stray punctuation, converts units, fills missing timestamps and checks order
function finalizeWords(items, policy, notes) {
  const words = [];
  let attachedPunct = 0, skippedEvents = 0, firstEvent = null;

  for (const it of items) {
    const text = String(it.word ?? '').replace(/\s+/g, ' ').trim();
    if (it.kind === 'skip') { skippedEvents++; firstEvent = firstEvent || text; continue; }
    if (!text) continue;
    const isPunctOnly = !/[\p{L}\p{N}&%$€£@#]/u.test(text);
    if (isPunctOnly || it.kind === 'punct') {
      if (words.length) { words[words.length - 1].word += text; attachedPunct++; }
      continue;
    }
    words.push({
      word: text,
      sRaw: it.startRaw,
      eRaw: it.endRaw,
      s: it.startNum !== undefined ? it.startNum : parseTimeToSeconds(it.startRaw),
      e: it.endNum !== undefined ? it.endNum : parseTimeToSeconds(it.endRaw),
      estimated: !!it.estimated,
      inSeconds: it.startNum !== undefined
    });
  }

  if (skippedEvents) {
    notes.push({ level: 'info', title: `${skippedEvents} non-speech event(s) skipped`, detail: firstEvent ? `e.g. "${shorten(firstEvent, 40)}"` : '' });
  }

  // Unit detection (milliseconds / 100-ns ticks)
  const convertible = (w) => !w.inSeconds && !isClockString(w.sRaw) && !isClockString(w.eRaw);
  let factor = 1;
  if (policy === 'ms_to_sec') {
    factor = 0.001;
  } else if (policy === 'auto') {
    const durs = [];
    const gaps = [];
    let prevS = null;
    words.forEach(w => {
      if (!convertible(w)) return;
      if (w.s !== null && w.e !== null && w.e > w.s) durs.push(w.e - w.s);
      if (w.s !== null && prevS !== null && w.s > prevS) gaps.push(w.s - prevS);
      if (w.s !== null) prevS = w.s;
    });
    const med = median(durs.length ? durs : gaps);
    if (med !== null && med > 20000) {
      factor = 1e-7;
      notes.push({ level: 'info', title: 'Timestamps look like 100-nanosecond ticks — converted to seconds', detail: 'Change "Timestamp Precision" if this is wrong.' });
    } else if (med !== null && med > 20) {
      factor = 0.001;
      notes.push({ level: 'info', title: 'Timestamps look like milliseconds — converted to seconds', detail: `A typical word lasted ${Math.round(med)} units, which only makes sense in milliseconds. Change "Timestamp Precision" if this is wrong.` });
    }
  }
  if (factor !== 1) {
    words.forEach(w => {
      if (!convertible(w)) return;
      if (w.s !== null) w.s *= factor;
      if (w.e !== null) w.e *= factor;
    });
  }

  // Fill missing timestamps from neighbouring words (instead of a misleading 0.000)
  let missing = 0, firstMissing = null;
  words.forEach(w => {
    if (w.s === null || w.e === null) {
      missing++;
      firstMissing = firstMissing || w;
      w.estimated = true;
    }
  });
  if (missing === words.length && words.length) {
    notes.push({
      level: 'error',
      title: 'No timestamps could be read',
      detail: 'Every word is missing its start/end time. Check the Start/End Time variables in the Schema Mapper.'
    });
    words.forEach((w, i) => { w.s = 0; w.e = 0; });
  } else if (missing) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.s === null) {
        const prev = words[i - 1];
        let next = null;
        for (let k = i + 1; k < words.length; k++) if (words[k].s !== null) { next = words[k].s; break; }
        w.s = prev ? (prev.e ?? prev.s) : (next ?? 0);
      }
    }
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.e === null) {
        const next = words[i + 1];
        w.e = Math.max(w.s, next ? next.s : w.s);
      }
    }
    notes.push({
      level: 'warn',
      title: `${missing} word(s) had no timestamp — estimated from neighbouring words`,
      detail: `First one: "${firstMissing.word}" (now ~${firstMissing.s.toFixed(3)}s). These are marked with ~ in Alignment Check. Speech tools often drop times on numbers or names.`
    });
  }

  // Order / sanity checks
  let backwards = 0, firstBack = null, negative = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.e < w.s) { negative++; w.e = w.s; }
    if (i > 0 && w.s < words[i - 1].s - 0.0005) {
      backwards++;
      firstBack = firstBack || { w, prev: words[i - 1] };
    }
  }
  if (backwards) {
    notes.push({
      level: 'warn',
      title: `Timestamps jump backwards ${backwards} time(s)`,
      detail: `First at "${firstBack.w.word}" (${firstBack.w.s.toFixed(3)}s) right after "${firstBack.prev.word}" (${firstBack.prev.s.toFixed(3)}s). The transcript may be merged from several files or out of order — beat times could be wrong.`
    });
  }
  if (negative) {
    notes.push({ level: 'info', title: `${negative} word(s) ended before they started — end time set to start time` });
  }

  words.forEach((w, i) => {
    w.idx = i;
    w.word = w.word.replace(/\|/g, '/'); // keep the Word|Start|End format unambiguous
    if (policy === 'raw' && !w.estimated && w.sRaw !== undefined && w.sRaw !== null && w.eRaw !== undefined && w.eRaw !== null && typeof w.sRaw !== 'object') {
      w.start = String(w.sRaw).trim();
      w.end = String(w.eRaw).trim();
    } else {
      w.start = w.s.toFixed(3);
      w.end = w.e.toFixed(3);
    }
  });
  return { words, notes };
}
