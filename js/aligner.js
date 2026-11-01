/* =========================================================================
   TOKEN NORMALISATION & SIMILARITY
   ========================================================================= */
const CANONICAL_NUMBERS = {
  'zero': '0', 'one': '1', 'first': '1st', 'two': '2', 'second': '2nd',
  'three': '3', 'third': '3rd', 'four': '4', 'fourth': '4th',
  'five': '5', 'fifth': '5th', 'six': '6', 'sixth': '6th',
  'seven': '7', 'seventh': '7th', 'eight': '8', 'eighth': '8th',
  'nine': '9', 'ninth': '9th', 'ten': '10', 'tenth': '10th',
  'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14',
  'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18',
  'nineteen': '19', 'twenty': '20', 'thirty': '30', 'forty': '40',
  'fifty': '50', 'sixty': '60', 'seventy': '70', 'eighty': '80',
  'ninety': '90', 'hundred': '100', 'hundredth': '100th',
  'thousand': '1000', 'thousandth': '1000th',
  'million': '1000000', 'billion': '1000000000'
};
const MAGNITUDE_WORDS = new Set(['hundred', 'thousand', 'million', 'billion', 'trillion', 'k', 'm', 'bn', 'mn']);

const COMMON_STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'of', 'to', 'and', 'or', 'for', 'with', 'at', 'by', 'from', 'it', 'is', 'was', 'were', 'had', 'that'
]);
const FILLER_WORDS = new Set(['uh', 'um', 'uhm', 'umm', 'erm', 'er', 'ah', 'hmm', 'mm', 'mhm', 'uhh']);

// Normalises any script or transcript token into a comparable form (works for any language/script)
function normalizeToken(rawStr) {
  if (rawStr === undefined || rawStr === null) return '';
  let s = String(rawStr).normalize('NFKD').replace(/[̀-ًͯ-ٰٟ]/g, '').toLowerCase();
  s = s.replace(/(\d),(\d)/g, '$1$2');
  if (s === '&') return 'and';
  if (s === '+') return 'plus';
  s = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  s = s.replace(/['’`]s$/, '').replace(/['’`]/g, '');
  if (!s) return '';
  if (CANONICAL_NUMBERS[s]) return CANONICAL_NUMBERS[s];
  return s;
}

function hasSentenceEndPunctuation(rawWord) {
  return /[.!?…]["'”’)\]]*$/.test(String(rawWord || '').trim());
}

function hasClausePunctuation(rawWord) {
  return /[,;:—\-]["'”’)\]]*$/.test(String(rawWord || '').trim());
}

let levRowA = new Int32Array(64);
let levRowB = new Int32Array(64);
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  if (n + 1 > levRowA.length) { levRowA = new Int32Array(n + 1); levRowB = new Int32Array(n + 1); }
  let prev = levRowA, cur = levRowB;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      let v = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      cur[j] = v;
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

// Similarity between a normalised script token and a normalised transcript word
function tokenSimilarityScore(normS, normT) {
  if (!normS || !normT) return -2.0;
  if (normS === normT) return COMMON_STOPWORDS.has(normS) ? 2.2 : 4.5;

  const ls = normS.length, lt = normT.length;
  if (ls >= 4 && lt >= 4) {
    const shorter = ls <= lt ? normS : normT;
    const longer = ls <= lt ? normT : normS;
    // Stem match: "store"/"stores", "crumbl"/"crumble", "cookie"/"cookies"
    if (longer.startsWith(shorter) && longer.length - shorter.length <= 3) return 3.2;
    const maxLen = Math.max(ls, lt);
    if (Math.abs(ls - lt) <= maxLen * 0.4) {
      const ratio = 1 - levenshteinDistance(normS, normT) / maxLen;
      if (ratio >= 0.75) return 3.0;
      if (ratio >= 0.60) return 1.2;
    }
  }

  // Partial number match ("2017" vs "20"/"17" from "twenty seventeen")
  if (/^\d+$/.test(normS) && /^\d+$/.test(normT) && Math.min(ls, lt) >= 2) {
    if (normS.includes(normT) || normT.includes(normS)) return 2.5;
  }
  return -2.2;
}

// Expands a beat's script text into tokens ("month-to-month" -> month, to, month; "$2 billion" -> 2 billion (dollars))
function expandScriptBeatTokens(scriptLine, beatIdx) {
  const clean = cleanScriptText(scriptLine);
  if (!clean) return [];
  const subs = [];
  clean.split(/\s+/).filter(Boolean).forEach(rawTok => {
    rawTok.split(/[-–—\/]+/).filter(Boolean).forEach(sub => subs.push(sub));
  });

  const expanded = [];
  const optional = (raw, norm, endsSentence) => ({
    raw, norm, beatIdx, isOptionalCurrencyUnit: true, endsSentence, endsClause: false
  });
  let pendingDollar = false;
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const norm = normalizeToken(sub);
    if (norm) {
      expanded.push({ raw: sub, norm, beatIdx, endsSentence: hasSentenceEndPunctuation(sub), endsClause: hasClausePunctuation(sub) });
    }
    if (pendingDollar) {
      expanded.push(optional('(dollars)', 'dollars', hasSentenceEndPunctuation(sub)));
      pendingDollar = false;
    }
    // Spoken audio usually says "dollars" after "$350,000" or after "$2 billion"
    if (/^\$\d/.test(sub)) {
      const next = subs[i + 1] ? normalizeToken(subs[i + 1]) : '';
      const nextRaw = subs[i + 1] ? subs[i + 1].toLowerCase().replace(/[^a-z]/g, '') : '';
      if (MAGNITUDE_WORDS.has(nextRaw) || ['100', '1000', '1000000', '1000000000'].includes(next)) pendingDollar = true;
      else expanded.push(optional('(dollars)', 'dollars', hasSentenceEndPunctuation(sub)));
    }
    if (/%[.,!?]*$/.test(sub)) expanded.push(optional('(percent)', 'percent', hasSentenceEndPunctuation(sub)));
  }

  expanded.forEach((t, i) => {
    t.isFirstInBeat = i === 0;
    t.isLastInBeat = i === expanded.length - 1;
  });
  return expanded;
}

/* =========================================================================
   GLOBAL SEQUENCE ALIGNER (DYNAMIC PROGRAMMING) + MISMATCH DETECTION
   ========================================================================= */
const GAP_SCRIPT = -1.1;      // a script word that was not spoken
const GAP_TRANS = -1.4;       // a spoken word that is not in the script
const GAP_FILLER = -0.3;      // "uh", "um" … cheap to skip
const MAX_DP_CELLS = 180e6;   // ~180 MB of browser memory
const LEADING = -2, TRAILING = -3;

const contentSet = (norms) => new Set(norms.filter(n => n && !COMMON_STOPWORDS.has(n) && !FILLER_WORDS.has(n)));
const overlapRatio = (a, b) => {
  if (!a.size) return 0;
  let hit = 0;
  a.forEach(x => { if (b.has(x)) hit++; });
  return hit / a.size;
};

function alignWordsToBeats(sections, words) {
  const allBeats = [];
  const scriptTokens = [];
  sections.forEach(sec => {
    sec.beats.forEach(beat => {
      beat.beatIndex = allBeats.length;
      beat.sectionTitle = sec.title;
      beat.matchedWords = [];
      beat.expectedTokens = expandScriptBeatTokens(beat.scriptLine, beat.beatIndex);
      beat.expectedTokens.forEach(t => { t.globalIdx = scriptTokens.length; scriptTokens.push(t); });
      beat.content = contentSet(beat.expectedTokens.filter(t => !t.isOptionalCurrencyUnit).map(t => t.norm));
      allBeats.push(beat);
    });
  });

  const M = scriptTokens.length;
  const N = words.length;
  const align = { allBeats, words, scriptTokens, leading: [], trailing: [], extraRuns: [], notes: [], tokWord: new Int32Array(M).fill(-1) };
  words.forEach(w => {
    w.status = 'unmatched';
    w.tok = -1;
    w.norm = normalizeToken(w.word);
    w.isFiller = FILLER_WORDS.has(w.norm);
  });
  if (!N) return align;
  if (!M) { align.leading = words.slice(); return align; }

  if ((M + 1) * (N + 1) > MAX_DP_CELLS) {
    align.notes.push({
      level: 'error',
      title: 'Too large to align in the browser',
      detail: `${M.toLocaleString()} script words × ${N.toLocaleString()} transcript words is too much memory. Split the script and transcript into parts (e.g. per section) and convert each part.`
    });
    align.leading = words.slice();
    return align;
  }

  // Map tokens to ids so similarity is computed once per unique pair
  const sMap = new Map(), tMap = new Map(), sU = [], tU = [];
  const sIds = new Int32Array(M), tIds = new Int32Array(N);
  scriptTokens.forEach((t, i) => {
    let id = sMap.get(t.norm);
    if (id === undefined) { id = sU.length; sMap.set(t.norm, id); sU.push(t.norm); }
    sIds[i] = id;
  });
  words.forEach((w, j) => {
    let id = tMap.get(w.norm);
    if (id === undefined) { id = tU.length; tMap.set(w.norm, id); tU.push(w.norm); }
    tIds[j] = id;
  });
  const UT = tU.length;
  // One similarity row per unique script word (cached while memory allows)
  const cacheRows = sU.length * UT <= 16e6;
  const rowCache = new Map();
  const simRow = (si) => {
    let row = rowCache.get(si);
    if (!row) {
      row = new Float32Array(UT);
      for (let t = 0; t < UT; t++) row[t] = tokenSimilarityScore(sU[si], tU[t]);
      if (cacheRows) rowCache.set(si, row);
    }
    return row;
  };
  const sim = (si, ti) => simRow(si)[ti];

  const tEndsS = new Uint8Array(N), tEndsC = new Uint8Array(N), tGap = new Float32Array(N);
  words.forEach((w, j) => {
    tEndsS[j] = hasSentenceEndPunctuation(w.word) ? 1 : 0;
    tEndsC[j] = hasClausePunctuation(w.word) ? 1 : 0;
    tGap[j] = w.isFiller ? GAP_FILLER : GAP_TRANS;
  });

  // DP: every transcript word is consumed; leading and trailing script beats may be skipped for free
  // (so a partial transcript of any part of the script works)
  const cols = N + 1;
  const ptr = new Uint8Array((M + 1) * cols); // 1 = match/substitute, 2 = skip script token, 3 = extra spoken word
  let prev = new Float32Array(cols), cur = new Float32Array(cols);
  for (let j = 1; j <= N; j++) { prev[j] = prev[j - 1] + tGap[j - 1]; ptr[j] = 3; }
  let bestI = 0, bestScore = prev[N];

  for (let i = 1; i <= M; i++) {
    const tok = scriptTokens[i - 1];
    const row_sim = simRow(sIds[i - 1]);
    const skip = tok.isOptionalCurrencyUnit ? -0.15 : GAP_SCRIPT;
    const isLast = tok.isLastInBeat, tokEndsS = tok.endsSentence;
    const row = i * cols;
    cur[0] = 0;
    ptr[row] = 2;
    for (let j = 1; j <= N; j++) {
      const s = row_sim[tIds[j - 1]];
      let sc = s;
      // Beat boundaries like to sit on sentence endings
      if (isLast) {
        if (tEndsS[j - 1]) sc += s > 0 ? 2.0 : 0.6;
        else if (tEndsC[j - 1]) sc += s > 0 ? 0.8 : 0.2;
      } else if (tokEndsS && tEndsS[j - 1] && s > 0) {
        sc += 1.0;
      }
      const d = prev[j - 1] + sc;
      const u = prev[j] + skip;
      const l = cur[j - 1] + tGap[j - 1];
      if (d >= u && d >= l) { cur[j] = d; ptr[row + j] = 1; }
      else if (u >= l) { cur[j] = u; ptr[row + j] = 2; }
      else { cur[j] = l; ptr[row + j] = 3; }
    }
    if (cur[N] > bestScore) { bestScore = cur[N]; bestI = i; }
    const t = prev; prev = cur; cur = t;
  }

  // Backtrack
  const op = new Uint8Array(N);       // 1 match, 2 substitution, 3 extra word
  const wTok = new Int32Array(N).fill(-1);
  let i = bestI, j = N;
  while (j > 0) {
    if (i === 0) { op[j - 1] = 3; j--; continue; }
    const mv = ptr[i * cols + j];
    if (mv === 1) {
      const s = sim(sIds[i - 1], tIds[j - 1]);
      op[j - 1] = s >= 2.0 ? 1 : 2;
      wTok[j - 1] = i - 1;
      align.tokWord[i - 1] = j - 1;
      i--; j--;
    } else if (mv === 2) {
      i--;
    } else {
      op[j - 1] = 3;
      j--;
    }
  }
  for (let x = 0; x < N; x++) {
    const w = words[x];
    w.tok = wTok[x];
    w.status = op[x] === 1 ? 'match' : op[x] === 2 ? 'sub' : 'ins';
    if (op[x] === 2) w.expected = scriptTokens[wTok[x]].raw;
  }

  // Assign each word to a beat
  const assign = new Int32Array(N).fill(-1);
  for (let x = 0; x < N; x++) if (op[x] !== 3) assign[x] = scriptTokens[wTok[x]].beatIdx;

  const beatHasTokenMatch = (b) => allBeats[b].expectedTokens.some(t => align.tokWord[t.globalIdx] >= 0);

  let x = 0;
  while (x < N) {
    if (op[x] !== 3) { x++; continue; }
    let k = x;
    while (k < N && op[k] === 3) k++;
    const run = [];
    for (let y = x; y < k; y++) run.push(y);
    const solid = run.filter(y => !words[y].isFiller).length;
    const prevTok = x > 0 ? wTok[x - 1] : -1;
    const nextTok = k < N ? wTok[k] : -1;
    const bA = prevTok >= 0 ? scriptTokens[prevTok].beatIdx : -1;
    const bB = nextTok >= 0 ? scriptTokens[nextTok].beatIdx : -1;
    const runInfo = { from: x, to: k, beatA: bA, beatB: bB, kind: 'extra' };

    if (bA < 0 && bB < 0) {
      run.forEach(y => { assign[y] = LEADING; });
    } else if (bA < 0) {
      const v = solid >= 3 ? LEADING : bB;
      run.forEach(y => { assign[y] = v; });
    } else if (bB < 0) {
      const v = solid >= 3 ? TRAILING : bA;
      run.forEach(y => { assign[y] = v; });
    } else {
      const runSet = contentSet(run.map(y => words[y].norm));
      let owner;
      if (bA === bB) {
        owner = () => bA;
      } else if (bB - bA === 2 && solid >= 3 && !beatHasTokenMatch(bA + 1)) {
        // Exactly one beat between A and B was not found: these words are most likely that beat, reworded
        owner = () => bA + 1;
        runInfo.kind = 'reworded';
        runInfo.target = bA + 1;
      } else {
        const ovA = overlapRatio(runSet, allBeats[bA].content);
        const ovB = overlapRatio(runSet, allBeats[bB].content);
        if (runSet.size >= 2 && ovB >= 0.5 && ovB >= ovA) owner = () => bB;       // false start of B
        else if (runSet.size >= 2 && ovA >= 0.5) owner = () => bA;                // repeat of A
        else {
          // Split at the last sentence ending inside the run
          let split = -1;
          for (let y = k - 1; y >= x - 1; y--) if (tEndsS[y]) { split = y; break; }
          if (split < 0) split = scriptTokens[prevTok].isLastInBeat ? x - 1 : k - 1;
          owner = (y) => (y <= split ? bA : bB);
        }
      }
      run.forEach(y => { assign[y] = owner(y); });
      if (solid >= 4 || runInfo.kind === 'reworded') align.extraRuns.push(runInfo);
    }
    x = k;
  }

  // Keep beat order monotonic
  let lastBeat = -1;
  for (let y = 0; y < N; y++) {
    if (assign[y] < 0) continue;
    if (assign[y] < lastBeat) assign[y] = lastBeat;
    else lastBeat = assign[y];
  }

  // Boundary polish: fix a single word that leaked across a beat border
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N - 1; y++) {
      const bLeft = assign[y], bRight = assign[y + 1];
      if (bLeft === bRight || bLeft < 0 || bRight < 0) continue;
      const beatA = allBeats[bLeft], beatB = allBeats[bRight];
      const firstB = beatB.expectedTokens[0]?.norm;
      const lastA = beatA.expectedTokens[beatA.expectedTokens.length - 1]?.norm;
      if (firstB && words[y].norm === firstB && y > 0 && assign[y - 1] === bLeft &&
          (tEndsS[y - 1] || words[y - 1].norm === lastA) && words[y].norm !== lastA) {
        assign[y] = bRight;
      }
      if (lastA && words[y + 1].norm === lastA && tEndsS[y + 1] && words[y + 1].norm !== firstB &&
          (y + 2 >= N || assign[y + 2] !== bLeft)) {
        assign[y + 1] = bLeft;
      }
    }
  }

  words.forEach((w, y) => {
    const b = assign[y];
    if (b === LEADING) { w.status = 'unmatched'; align.leading.push(w); }
    else if (b === TRAILING) { w.status = 'unmatched'; align.trailing.push(w); }
    else if (b >= 0) allBeats[b].matchedWords.push(w);
    else { w.status = 'unmatched'; align.leading.push(w); }
  });

  // Is an extra run a retake / repeat of some beat?
  align.extraRuns.forEach(r => {
    const runSet = contentSet(words.slice(r.from, r.to).map(w => w.norm));
    let best = -1, bestOv = 0;
    allBeats.forEach(b => {
      const ov = overlapRatio(runSet, b.content);
      if (ov > bestOv) { bestOv = ov; best = b.beatIndex; }
    });
    if (runSet.size >= 2 && bestOv >= 0.6) r.retakeOf = best;
  });

  return align;
}

// Per-beat match quality (recomputed after manual nudges)
function computeBeatStats(beat, align) {
  const inBeat = new Set(beat.matchedWords);
  const marks = [];
  let need = 0, ok = 0;
  beat.expectedTokens.forEach(t => {
    const wi = align.tokWord[t.globalIdx];
    const w = wi >= 0 ? align.words[wi] : null;
    if (t.isOptionalCurrencyUnit) {
      if (w && inBeat.has(w)) marks.push({ raw: t.raw, state: 'ok' });
      return;
    }
    need++;
    if (w && inBeat.has(w)) {
      if (w.status === 'match') { ok++; marks.push({ raw: t.raw, state: 'ok' }); }
      else marks.push({ raw: t.raw, state: 'sub', heard: w.word });
    } else {
      marks.push({ raw: t.raw, state: 'miss' });
    }
  });
  const extra = beat.matchedWords.filter(w => w.status === 'ins' && !w.isFiller).length;
  const coverage = need ? ok / need : 0;
  let status;
  if (!need) status = 'empty';
  else if (!beat.matchedWords.length) status = 'missing';
  else if (coverage < 0.5) status = 'poor';
  else if (coverage < 0.85 || extra >= 3) status = 'partial';
  else status = 'ok';
  return { need, ok, coverage, marks, extra, status };
}
