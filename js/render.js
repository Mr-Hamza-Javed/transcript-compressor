/* =========================================================================
   MANUAL FINE-TUNING (with undo)
   ========================================================================= */
// Snapshots of beat contents taken before each manual change; cleared when the alignment is recomputed
let nudgeHistory = [];

function snapshotAlignment() {
  const al = state.alignment;
  nudgeHistory.push({
    alignment: al,
    beats: al.allBeats.map(b => b.matchedWords.slice()),
    leading: al.leading.slice(),
    trailing: al.trailing.slice(),
    statuses: al.words.map(w => w.status)
  });
  if (nudgeHistory.length > 200) nudgeHistory.shift();
}

function undoNudge() {
  const snap = nudgeHistory.pop();
  if (!snap || snap.alignment !== state.alignment) { nudgeHistory = []; return; }
  const al = state.alignment;
  al.allBeats.forEach((b, i) => { b.matchedWords = snap.beats[i]; });
  al.leading = snap.leading;
  al.trailing = snap.trailing;
  al.words.forEach((w, i) => { w.status = snap.statuses[i]; });
  renderOutputFromCurrentState();
  showToast('Undone');
}

const undoAction = () => ({ label: 'Undo', onClick: undoNudge });

function nudgeBeatBoundary(beatIndex, direction) {
  const al = state.alignment;
  if (!al) return;
  const allBeats = al.allBeats;
  const currentBeat = allBeats[beatIndex];
  if (!currentBeat) return;

  const plan = {
    first_to_prev: [currentBeat, allBeats[beatIndex - 1], 'shift', 'push'],
    last_to_next: [currentBeat, allBeats[beatIndex + 1], 'pop', 'unshift'],
    pull_from_prev: [allBeats[beatIndex - 1], currentBeat, 'pop', 'unshift'],
    pull_from_next: [allBeats[beatIndex + 1], currentBeat, 'shift', 'push']
  }[direction];
  if (!plan || !plan[0] || !plan[1] || !plan[0].matchedWords.length) {
    showToast('Nothing to move in that direction', 'warn');
    return;
  }
  const [from, to, take, put] = plan;
  snapshotAlignment();
  const word = from.matchedWords[take]();
  to.matchedWords[put](word);
  renderOutputFromCurrentState();
  showToast(`Moved "${word.word}" from ${from.key} to ${to.key}`, 'success', undoAction());
}

function moveUnmatched(which) {
  const al = state.alignment;
  if (!al || !al.allBeats.length) return;
  const list = which === 'leading' ? al.leading : al.trailing;
  if (!list.length) return;
  snapshotAlignment();
  let target;
  if (which === 'leading') {
    target = al.allBeats.find(b => b.matchedWords.length) || al.allBeats[0];
    target.matchedWords.unshift(...list);
    al.leading = [];
  } else {
    const withWords = al.allBeats.filter(b => b.matchedWords.length);
    target = withWords[withWords.length - 1] || al.allBeats[al.allBeats.length - 1];
    target.matchedWords.push(...list);
    al.trailing = [];
  }
  // Inside a beat they are extra speech, not "outside the script" any more
  list.forEach(w => { w.status = 'ins'; });
  renderOutputFromCurrentState();
  showToast(`Moved ${list.length} word(s) into ${target.key}`, 'success', undoAction());
}

function focusBeat(beatIndex) {
  if (inspectorFilter === 'review') {
    const b = state.alignment && state.alignment.allBeats[beatIndex];
    if (b && !beatNeedsReview(b)) setInspectorFilter('all');
  }
  switchOutputTab('inspector');
  const el = $(`beat-card-${beatIndex}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('beat-flash');
  void el.offsetWidth;
  el.classList.add('beat-flash');
}

/* =========================================================================
   MAIN CONVERSION & RECOMMENDED STRUCTURE GENERATOR
   ========================================================================= */
function runConversion(recomputeAlignment = true) {
  if (recomputeAlignment || !state.alignment) {
    nudgeHistory = [];
    const tx = extractTranscriptWords();
    state.transcriptNotes = tx.notes;
    const sc = parseScriptStructure();
    state.scriptNotes = sc.notes;
    state.sections = sc.sections;
    try {
      state.alignment = alignWordsToBeats(sc.sections, tx.words);
    } catch (err) {
      console.error(err);
      state.alignment = { allBeats: [], words: tx.words, scriptTokens: [], leading: tx.words.slice(), trailing: [], extraRuns: [], tokWord: new Int32Array(0),
        notes: [{ level: 'error', title: 'Alignment failed unexpectedly', detail: String(err && err.message || err) }] };
    }
  }
  renderOutputFromCurrentState();
}

const fmtWordLine = (w) => `${w.word}|${w.start}|${w.end}`;
const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// Card subtitles, step markers and empty-state hints
function updateInputStatus(sections, al, issues) {
  const scriptText = $('scriptInput').value.trim();
  const transcriptText = $('transcriptInput').value.trim();
  const beats = al.allBeats.length;
  const words = al.words.length;

  const sSub = $('scriptStatsBadge');
  sSub.textContent = !scriptText ? 'Paste your script'
    : beats ? `${plural(beats, 'beat')} in ${plural(sections.length, 'section')}` : 'No beats found — check Script settings';
  sSub.className = 'card-sub' + (scriptText && !beats ? ' err' : '');
  $('scriptStep').classList.toggle('done', beats > 0);
  $('scriptEmpty').classList.toggle('hidden', !!$('scriptInput').value);

  const tSub = $('transcriptStatsBadge');
  const txError = issues.some(i => i.level === 'error' && /transcript|json|timestamp|word list|words could/i.test(i.title));
  tSub.textContent = !transcriptText ? 'Paste a word-level transcript' : words ? plural(words, 'word') : 'No words read';
  $('transcriptSub').className = 'card-sub' + (transcriptText && (txError || !words) ? ' err' : '');
  const pill = $('detectedFormatPill');
  $('detectedFormatSep').classList.toggle('hidden', !(transcriptText && pill.textContent));
  $('transcriptStep').classList.toggle('done', words > 0 && !txError);
  $('transcriptEmpty').classList.toggle('hidden', !!$('transcriptInput').value);

  const hasOutput = !!$('outputTextarea').value;
  $('resultStep').classList.toggle('done', hasOutput && beats > 0 && words > 0);
  $('outputEmpty').classList.toggle('hidden', hasOutput);
  if (!hasOutput) {
    $('outputEmptyTitle').textContent = 'Your result appears here';
    $('outputEmptyText').textContent = !scriptText && !transcriptText
      ? 'Add a script and a transcript. They are matched automatically as you type — no button to press.'
      : !transcriptText ? 'Now add the transcript (step 2).'
      : !scriptText ? 'Now add the script (step 1).'
      : 'Nothing could be matched yet — see the Issues tab.';
  }
}

function renderOutputFromCurrentState() {
  const al = state.alignment || { allBeats: [], words: [], leading: [], trailing: [], extraRuns: [], notes: [] };
  const sections = state.sections || [];
  const layoutStyle = $('outputLayoutStyle').value;
  const hideEmptyBeats = $('hideEmptyBeatsToggle')?.checked ?? true;
  const includeUnmatched = $('includeUnmatchedToggle').checked;
  const words = al.words;

  al.allBeats.forEach(b => { b.stats = computeBeatStats(b, al); });

  const outLines = [];
  const pushBlock = (key, list) => {
    if (outLines.length) outLines.push('');
    if (layoutStyle === 'recommended') {
      outLines.push(`### ${key}`);
      list.forEach(w => outLines.push(fmtWordLine(w)));
    } else {
      outLines.push(`${key} | ${list.map(fmtWordLine).join(' ')}`);
    }
  };

  if (!al.allBeats.length) {
    if (words.length) {
      outLines.push('## 0. Transcript');
      outLines.push('');
      outLines.push('### «1»');
      words.forEach(w => outLines.push(fmtWordLine(w)));
    }
  } else {
    if (includeUnmatched && al.leading.length) pushBlock('«UNMATCHED_LEADING»', al.leading);
    sections.forEach(sec => {
      const visibleBeats = hideEmptyBeats ? sec.beats.filter(b => b.matchedWords.length > 0) : sec.beats;
      if (!visibleBeats.length && hideEmptyBeats) return;
      if (outLines.length) outLines.push('');
      outLines.push(`## ${sec.title}`);
      visibleBeats.forEach(beat => {
        if (layoutStyle === 'recommended') {
          outLines.push('');
          outLines.push(`### ${beat.key}`);
          beat.matchedWords.forEach(w => outLines.push(fmtWordLine(w)));
        } else {
          outLines.push(`${beat.key} | ${beat.matchedWords.map(fmtWordLine).join(' ')}`);
        }
      });
    });
    if (includeUnmatched && al.trailing.length) pushBlock('«UNMATCHED_TRAILING»', al.trailing);
  }

  const finalOutput = outLines.join('\n').trim();
  $('outputTextarea').value = finalOutput;

  const issues = buildIssues(al, includeUnmatched);
  updateInputStatus(sections, al, issues);
  renderAlignmentInspector(sections, al);
  renderIssues(issues);
  updateBanner(issues);
  updateCompressionTelemetry(finalOutput, al, issues);
}

/* =========================================================================
   ISSUES / DIAGNOSTICS
   ========================================================================= */
function describeBeatDifferences(beat) {
  const miss = beat.stats.marks.filter(m => m.state === 'miss').map(m => m.raw);
  const subs = beat.stats.marks.filter(m => m.state === 'sub');
  const extra = beat.matchedWords.filter(w => w.status === 'ins' && !w.isFiller).map(w => w.word);
  const parts = [];
  if (miss.length) parts.push(`Not heard: "${shorten(miss.join(' '), 80)}"`);
  if (subs.length) parts.push(`Heard differently: ${subs.slice(0, 4).map(s => `"${s.heard}" for "${s.raw}"`).join(', ')}${subs.length > 4 ? ' …' : ''}`);
  if (extra.length) parts.push(`Extra spoken: "${shorten(extra.join(' '), 60)}"`);
  return parts.join(' · ');
}

function buildIssues(al, includeUnmatched) {
  const issues = [];
  const add = (level, title, detail = '', beatIndex = null) => issues.push({ level, title, detail, beatIndex });
  [...(state.schemaNotes || []), ...(state.transcriptNotes || []), ...(state.scriptNotes || []), ...(al.notes || [])]
    .forEach(n => issues.push({ beatIndex: null, detail: '', ...n }));

  const beats = al.allBeats;
  const words = al.words;
  const N = words.length;
  const scriptHasText = $('scriptInput').value.trim().length > 0;

  if (!N && !scriptHasText) return issues;
  if (!N && !issues.some(i => i.level === 'error') && $('transcriptInput').value.trim() === '') {
    add('info', 'Paste a word-by-word transcript to start aligning');
  }
  if (!beats.length || !N || !al.scriptTokens.length) return sortIssues(issues);

  const matched = words.filter(w => w.status === 'match').length;
  const rate = matched / N;
  if (rate < 0.3) {
    add('error', `Script and transcript barely match — only ${Math.round(rate * 100)}% of spoken words were found in the script`,
      'Check that this transcript is the recording of this script, and that the correct "Word field" is selected in Transcript settings.');
  }

  const covered = beats.filter(b => b.matchedWords.length > 0);
  if (!covered.length) {
    add('error', 'No beat could be matched to the transcript');
    return sortIssues(issues);
  }
  const firstIdx = covered[0].beatIndex;
  const lastIdx = covered[covered.length - 1].beatIndex;
  const firstStart = covered[0].matchedWords[0].s;
  const lastEnd = covered[covered.length - 1].matchedWords[covered[covered.length - 1].matchedWords.length - 1].e;
  const keyRange = (a, b) => (a === b ? beats[a].key : `${beats[a].key}–${beats[b].key}`);

  // Beats before / after the part the transcript covers
  const textBeats = (from, to) => beats.slice(from, to + 1).filter(b => b.stats.status !== 'empty');
  if (firstIdx > 0) {
    const before = textBeats(0, firstIdx - 1);
    if (before.length && before.length <= 2) {
      before.forEach(b => add('warn', `${b.key} was not found at the start of the transcript`,
        `The transcript begins with ${beats[firstIdx].key} at ${fmtClock(firstStart)}. The speaker may have skipped this line, or the recording starts later. Script: "${shorten(b.scriptLine)}"`, b.beatIndex));
    } else if (before.length) {
      add('info', `Transcript starts at ${beats[firstIdx].key} — beats ${keyRange(before[0].beatIndex, before[before.length - 1].beatIndex)} are not in this transcript`,
        'Fine if you pasted a partial transcript. Otherwise those beats were not recorded.');
    }
  }
  if (lastIdx < beats.length - 1) {
    const after = textBeats(lastIdx + 1, beats.length - 1);
    if (after.length && after.length <= 2) {
      after.forEach(b => add('warn', `${b.key} was not found at the end of the transcript`,
        `The transcript ends with ${beats[lastIdx].key} at ${fmtClock(lastEnd)}. Script: "${shorten(b.scriptLine)}"`, b.beatIndex));
    } else if (after.length) {
      add('info', `Transcript ends at ${beats[lastIdx].key} — ${after.length} later beats (${keyRange(after[0].beatIndex, after[after.length - 1].beatIndex)}) have no audio`,
        'Fine if you pasted a partial transcript. Otherwise those beats were not recorded.');
    }
  }

  // A transcript that starts / stops part-way through a beat (partial paste)
  const cutAtEdge = (b) => {
    const marks = b.stats.marks;
    const firstHit = marks.findIndex(m => m.state !== 'miss');
    let lastHit = -1;
    marks.forEach((m, k) => { if (m.state !== 'miss') lastHit = k; });
    if (firstHit < 0) return null;
    const inner = marks.slice(firstHit, lastHit + 1).filter(m => m.state === 'miss').length;
    if (inner > 1) return null;
    if (b.beatIndex === lastIdx && lastHit < marks.length - 1 && firstHit === 0) return 'end';
    if (b.beatIndex === firstIdx && firstHit > 0 && lastHit === marks.length - 1) return 'start';
    return null;
  };
  const extraRunBeats = new Set(al.extraRuns.map(r => beats.findIndex(bb => bb.matchedWords.includes(words[r.from]))));

  // Beats inside the covered range
  const partials = [];
  beats.forEach(b => {
    if (b.beatIndex < firstIdx || b.beatIndex > lastIdx) return;
    const st = b.stats;
    if ((st.status === 'poor' || st.status === 'partial') && (b.beatIndex === firstIdx || b.beatIndex === lastIdx)) {
      const edge = cutAtEdge(b);
      if (edge) {
        add('info', edge === 'end'
          ? `Transcript stops part-way through ${b.key} (${Math.round(st.coverage * 100)}% of it spoken)`
          : `Transcript starts part-way through ${b.key} (${Math.round(st.coverage * 100)}% of it spoken)`,
          'Fine if you pasted a partial transcript. Otherwise the recording or the JSON is cut off.', b.beatIndex);
        return;
      }
    }
    if (st.status === 'missing') {
      let prevEnd = null, nextStart = null;
      for (let k = b.beatIndex - 1; k >= 0; k--) if (beats[k].matchedWords.length) { const mw = beats[k].matchedWords; prevEnd = mw[mw.length - 1].e; break; }
      for (let k = b.beatIndex + 1; k < beats.length; k++) if (beats[k].matchedWords.length) { nextStart = beats[k].matchedWords[0].s; break; }
      let hint = 'The speaker may have skipped or completely reworded this line.';
      const similar = al.extraRuns.find(r => r.retakeOf === b.beatIndex);
      if (similar) hint = `Similar words were spoken at ${fmtClock(words[similar.from].s)}–${fmtClock(words[similar.to - 1].e)} — possibly said out of order.`;
      const window = (prevEnd !== null && nextStart !== null && Math.abs(nextStart - prevEnd) < 0.75)
        ? `Expected around ${fmtClock(prevEnd)}, but the speaker went straight from the previous beat to the next one.`
        : `Expected between ${fmtClock(prevEnd)} and ${fmtClock(nextStart)}.`;
      add('warn', `${b.key} was not found in the transcript`,
        `${window} ${hint} Script: "${shorten(b.scriptLine)}"`, b.beatIndex);
    } else if (st.status === 'poor') {
      add('warn', `${b.key} only partly matches the script (${Math.round(st.coverage * 100)}%)`, describeBeatDifferences(b), b.beatIndex);
    } else if (st.status === 'partial') {
      partials.push(b);
    }
  });
  partials.forEach(b => {
    if (b.stats.coverage < 0.85) {
      add('info', `${b.key} has small differences (${Math.round(b.stats.coverage * 100)}% match)`, describeBeatDifferences(b), b.beatIndex);
    } else if (!extraRunBeats.has(b.beatIndex)) {
      add('info', `${b.key} has ${b.stats.extra} extra spoken word(s) not in the script`, describeBeatDifferences(b), b.beatIndex);
    }
  });

  // Extra speech that is not in the script
  al.extraRuns.forEach(r => {
    const runWords = words.slice(r.from, r.to);
    const owner = beats.find(b => b.matchedWords.includes(runWords[0]));
    const span = `${fmtClock(runWords[0].s)}–${fmtClock(runWords[runWords.length - 1].e)}`;
    if (r.kind === 'reworded') {
      add('warn', `${beats[r.target].key} seems reworded — matched to different spoken words (${span})`,
        `Spoken: "${wordsText(runWords)}". Script: "${shorten(beats[r.target].scriptLine)}". Please verify in the Beats tab.`, r.target);
      return;
    }
    let hint = '';
    if (r.retakeOf !== undefined && r.retakeOf >= 0) hint = ` Looks like a repeat / retake of ${beats[r.retakeOf].key}.`;
    add('warn', `Extra speech not in the script (${span})`,
      `"${wordsText(runWords)}" — kept inside ${owner ? owner.key : 'the nearest beat'}.${hint}`, owner ? owner.beatIndex : null);
  });

  const where = includeUnmatched ? 'kept in the output' : 'left out of the output ("Unmatched words" is off)';
  if (al.leading.length) {
    add('warn', `${al.leading.length} spoken word(s) before the script starts (${fmtClock(al.leading[0].s)}–${fmtClock(al.leading[al.leading.length - 1].e)})`,
      `"${wordsText(al.leading)}" — ${where} as «UNMATCHED_LEADING». Use the Beats tab to move them into the first beat if they belong there.`);
  }
  if (al.trailing.length) {
    add('warn', `${al.trailing.length} spoken word(s) after the script ends (${fmtClock(al.trailing[0].s)}–${fmtClock(al.trailing[al.trailing.length - 1].e)})`,
      `"${wordsText(al.trailing)}" — ${where} as «UNMATCHED_TRAILING».`);
  }
  return sortIssues(issues);
}

function sortIssues(issues) {
  const rank = { error: 0, warn: 1, info: 2 };
  return issues.map((x, i) => ({ x, i })).sort((a, b) => (rank[a.x.level] - rank[b.x.level]) || (a.i - b.i)).map(o => o.x);
}


const ISSUE_ICON = {
  error: 'fa-circle-xmark lvl-error',
  warn: 'fa-triangle-exclamation lvl-warn',
  info: 'fa-circle-info lvl-info'
};

function renderIssues(issues) {
  const count = { error: 0, warn: 0, info: 0 };
  issues.forEach(i => { count[i.level]++; });
  const badge = $('issuesCountBadge');
  badge.textContent = count.error + count.warn;
  badge.className = 'count' + (count.error ? ' err' : count.warn ? ' warn' : '');
  badge.classList.toggle('hidden', !(count.error + count.warn));

  const nothingYet = !$('scriptInput').value.trim() && !$('transcriptInput').value.trim();
  let html = '';
  if (nothingYet) {
    html = `<div class="all-good"><i class="fa-regular fa-clipboard" style="color:var(--text-3)"></i>Problems found while matching the script and transcript are listed here.</div>`;
  } else if (!issues.length) {
    html = `<div class="all-good"><i class="fa-solid fa-circle-check"></i>No problems found — every beat matches the transcript.</div>`;
  } else {
    html += `<div class="issue-summary">
      ${count.error ? `<span class="chip err">${plural(count.error, 'error')}</span>` : ''}
      ${count.warn ? `<span class="chip warn">${plural(count.warn, 'warning')}</span>` : ''}
      ${count.info ? `<span class="chip info">${plural(count.info, 'note')}</span>` : ''}
      <span class="faint">Click an item with an arrow to see that beat.</span>
    </div>`;
    issues.forEach(issue => {
      const level = ISSUE_ICON[issue.level] ? issue.level : 'info';
      const clickable = issue.beatIndex !== null && issue.beatIndex !== undefined;
      const tag = clickable ? 'button' : 'div';
      html += `
        <${tag} class="issue ${level}" ${clickable ? `onclick="focusBeat(${issue.beatIndex})" title="Show this beat"` : ''}>
          <i class="fa-solid ${ISSUE_ICON[level]}"></i>
          <span class="issue-body">
            <span class="issue-title" style="display:block">${escapeHtml(issue.title)}</span>
            ${issue.detail ? `<span class="issue-detail" style="display:block">${escapeHtml(issue.detail)}</span>` : ''}
          </span>
          ${clickable ? '<i class="fa-solid fa-arrow-right go"></i>' : ''}
        </${tag}>`;
    });
  }
  $('outputIssuesContainer').innerHTML = html;
}

function updateBanner(issues) {
  const banner = $('schemaAlertBanner');
  const icon = $('schemaAlertIcon');
  const text = $('schemaAlertText');
  const firstError = issues.find(i => i.level === 'error');
  if (firstError) {
    banner.className = 'banner banner-error';
    icon.className = 'fa-solid fa-circle-xmark';
    const more = issues.filter(i => i.level === 'error').length - 1;
    text.textContent = firstError.title + (more > 0 ? ` (+${more} more)` : '');
    $('bannerIssuesBtn').classList.remove('hidden');
    $('bannerMapperBtn').classList.toggle('hidden', !/transcript|json|word|timestamp|mapping/i.test(firstError.title));
  } else if (state.mappingMessage && $('transcriptInput').value.trim()) {
    banner.className = 'banner banner-warn';
    icon.className = 'fa-solid fa-triangle-exclamation';
    text.textContent = state.mappingMessage;
    $('bannerIssuesBtn').classList.add('hidden');
    $('bannerMapperBtn').classList.remove('hidden');
  } else {
    banner.className = 'hidden';
  }
}

/* =========================================================================
   BEATS VIEW (alignment check)
   ========================================================================= */
const BEAT_STATUS = {
  ok: { chip: 'ok', label: 'Matched' },
  partial: { chip: 'info', label: 'Small differences' },
  poor: { chip: 'warn', label: 'Poor match' },
  missing: { chip: 'err', label: 'Not found' },
  empty: { chip: 'muted', label: 'No script text' }
};

let inspectorFilter = 'all'; // 'all' | 'review'

function beatNeedsReview(b) {
  const st = b.stats;
  return !!st && (st.status === 'missing' || st.status === 'poor' || (st.status === 'partial' && st.coverage < 0.85));
}

function setInspectorFilter(f) {
  inspectorFilter = f;
  if (state.alignment) renderAlignmentInspector(state.sections || [], state.alignment);
}

function wordChip(w) {
  let cls = '';
  let title = `${w.start} – ${w.end}`;
  if (w.status === 'sub') { cls = 'sub'; title += ` · heard "${w.word}" where the script says "${w.expected}"`; }
  else if (w.status === 'ins') { cls = w.isFiller ? 'filler' : 'ins'; title += w.isFiller ? ' · filler word' : ' · extra word (not in the script)'; }
  else if (w.status === 'unmatched') { cls = 'unmatched'; title += ' · outside the script'; }
  if (w.estimated) { cls += ' est'; title += ' · time estimated'; }
  return `<span class="w ${cls}" title="${escapeHtml(title)}">${escapeHtml(w.word)}<span class="t">${w.estimated ? '~' : ''}${escapeHtml(w.start)}</span></span>`;
}

function unmatchedCard(kind, list) {
  if (!list.length) return '';
  const label = kind === 'leading' ? 'Spoken before the script starts' : 'Spoken after the script ends';
  const btn = kind === 'leading' ? 'Move into first beat' : 'Move into last beat';
  return `
    <div class="unmatched-card">
      <div class="head">
        <span><i class="fa-solid fa-comment-slash"></i> ${label} <span class="faint" style="font-weight:400">· ${plural(list.length, 'word')}</span></span>
        <button class="btn btn-sm" onclick="moveUnmatched('${kind}')">${btn}</button>
      </div>
      <div class="words">${list.map(wordChip).join('')}</div>
    </div>`;
}

function nudgeBtn(bIdx, dir, icon, title) {
  return `<button class="nudge" onclick="nudgeBeatBoundary(${bIdx}, '${dir}')" title="${title}" aria-label="${title}">${icon}</button>`;
}

function beatCard(beat, bIdx, total) {
  const st = beat.stats || { status: 'missing', marks: [], coverage: 0, extra: 0 };
  const style = BEAT_STATUS[st.status] || BEAT_STATUS.missing;
  const mw = beat.matchedWords;
  const hasWords = mw.length > 0;
  const statusLabel = st.status === 'partial' && st.coverage >= 0.85 ? `${plural(st.extra, 'extra word')}` : style.label;
  const pct = st.status !== 'empty' && st.status !== 'missing' ? ` · ${Math.round(st.coverage * 100)}%` : '';
  const scriptHtml = st.marks.length
    ? st.marks.map(m => m.state === 'ok' ? escapeHtml(m.raw)
        : m.state === 'sub' ? `<span class="m-sub" title="heard &quot;${escapeHtml(m.heard)}&quot;">${escapeHtml(m.raw)}</span>`
        : `<span class="m-miss" title="not heard in the transcript">${escapeHtml(m.raw)}</span>`).join(' ')
    : `<span class="faint">${escapeHtml(beat.scriptLine) || '(no script text)'}</span>`;

  const left = bIdx > 0
    ? (hasWords ? nudgeBtn(bIdx, 'first_to_prev', '<i class="fa-solid fa-arrow-left"></i>', 'Send this first word to the previous beat') : '') +
      nudgeBtn(bIdx, 'pull_from_prev', '<i class="fa-solid fa-plus"></i>', 'Pull the last word of the previous beat into this one')
    : '';
  const right = bIdx < total - 1
    ? nudgeBtn(bIdx, 'pull_from_next', '<i class="fa-solid fa-plus"></i>', 'Pull the first word of the next beat into this one') +
      (hasWords ? nudgeBtn(bIdx, 'last_to_next', '<i class="fa-solid fa-arrow-right"></i>', 'Send this last word to the next beat') : '')
    : '';

  return `
    <div id="beat-card-${bIdx}" class="beat st-${st.status}">
      <div class="beat-head">
        <span class="beat-key">${escapeHtml(beat.key)}</span>
        <span class="beat-time">${hasWords ? `${escapeHtml(mw[0].start)} → ${escapeHtml(mw[mw.length - 1].end)}` : '—'}</span>
        <span class="chip ${style.chip}">${statusLabel}${pct}</span>
        ${hasWords ? `<span class="beat-count">${plural(mw.length, 'word')}</span>` : ''}
      </div>
      <div class="beat-script">${scriptHtml}</div>
      <div class="words">
        ${left}
        ${mw.map(wordChip).join('')}
        ${!hasWords ? '<span class="no-words">No spoken words matched this beat</span>' : ''}
        ${right}
      </div>
    </div>`;
}

function renderAlignmentInspector(sections, al) {
  const container = $('outputInspectorContainer');
  const beats = al.allBeats || [];
  if (!beats.length) {
    container.innerHTML = `<div class="all-good"><i class="fa-solid fa-list-check" style="color:var(--text-3)"></i>Each script beat and the spoken words matched to it are shown here, so you can check and fix the boundaries.</div>`;
    return;
  }
  const review = beats.filter(beatNeedsReview).length;
  const filter = inspectorFilter;
  let html = `
    <div class="view-toolbar" style="margin:-12px -14px 0; position:sticky; top:-12px; z-index:2; background:var(--surface)">
      <div class="toolbar-group">
        <div class="seg seg-sm" role="group" aria-label="Show beats">
          <button class="${filter === 'all' ? 'active' : ''}" onclick="setInspectorFilter('all')">All ${beats.length}</button>
          <button class="${filter === 'review' ? 'active' : ''}" onclick="setInspectorFilter('review')">Needs review ${review}</button>
        </div>
      </div>
      <div class="toolbar-group">
        <button class="btn btn-sm btn-ghost" onclick="undoNudge()" ${nudgeHistory.length ? '' : 'disabled'} title="Undo the last manual change"><i class="fa-solid fa-rotate-left"></i>Undo</button>
        <button class="btn btn-sm btn-ghost" onclick="runConversion(true)" title="Throw away manual changes and match again"><i class="fa-solid fa-arrows-rotate"></i>Re-match</button>
      </div>
    </div>
    <div class="legend">
      <span><span class="w">word<span class="t">0.0</span></span> matched</span>
      <span><span class="w sub">word</span> heard differently</span>
      <span><span class="w ins">word</span> extra (not in script)</span>
      <span><span class="m-miss" style="color:var(--err);text-decoration:line-through">word</span> script word not heard</span>
      <span>Hover a beat for <i class="fa-solid fa-arrow-left"></i> <i class="fa-solid fa-plus"></i> buttons to move words across the border.</span>
    </div>`;
  if (nudgeHistory.length) {
    html += `<div class="notice"><i class="fa-solid fa-circle-info"></i>Manual changes are kept until you edit the script or transcript.</div>`;
  }

  if (filter === 'all') html += unmatchedCard('leading', al.leading || []);
  let shown = 0;
  sections.forEach(sec => {
    const list = filter === 'review' ? sec.beats.filter(beatNeedsReview) : sec.beats;
    if (!list.length) return;
    shown += list.length;
    const problems = sec.beats.filter(beatNeedsReview).length;
    html += `
      <div class="section-block">
        <div class="section-head">${escapeHtml(sec.title)}<span class="${problems ? 'warn' : ''}">${plural(sec.beats.length, 'beat')}${problems ? ` · ${problems} to review` : ''}</span></div>
        ${list.map(b => beatCard(b, b.beatIndex, beats.length)).join('')}
      </div>`;
  });
  if (filter === 'review' && !shown) {
    html += `<div class="all-good"><i class="fa-solid fa-circle-check"></i>Nothing to review — every beat matches well.</div>`;
  }
  if (filter === 'all') html += unmatchedCard('trailing', al.trailing || []);

  const scrollTop = container.scrollTop;
  container.innerHTML = html;
  container.scrollTop = scrollTop;
}

/* =========================================================================
   SUMMARY BAR
   ========================================================================= */
function updateCompressionTelemetry(finalOutput, al, issues) {
  const totalRawChars = $('scriptInput').value.length + $('transcriptInput').value.length;
  const outChars = finalOutput.length;
  const savedPct = totalRawChars > 0 ? Math.max(0, Math.round((1 - outChars / totalRawChars) * 100)) : 0;

  $('compressionRatioBadge').textContent = `${savedPct}% smaller`;
  $('compressionRatioBadge').className = 'chip ok';
  $('savingsBox').classList.toggle('hidden', !outChars);
  $('copyBtn').disabled = !outChars;
  $('downloadBtn').disabled = !outChars;
  $('tokenCountCompare').textContent = `~${Math.round(totalRawChars / 4).toLocaleString()} → ~${Math.round(outChars / 4).toLocaleString()} tokens`;

  const healthEl = $('alignmentHealthBadge');
  const errors = issues.filter(i => i.level === 'error').length;
  const warns = issues.filter(i => i.level === 'warn').length;
  const N = al.words.length;
  const setHealth = (icon, html, clickable) => {
    healthEl.innerHTML = `<i class="fa-solid ${icon}"></i><span>${html}</span>`;
    healthEl.classList.toggle('clickable', clickable);
    healthEl.onclick = clickable ? () => switchOutputTab('issues') : null;
    healthEl.title = clickable ? 'Show issues' : '';
  };
  if (errors) {
    setHealth('fa-circle-xmark i-err', `<span class="err-text">${plural(errors, 'error')}</span> — click to see`, true);
    return;
  }
  if (!N) {
    setHealth('fa-circle-minus i-wait', $('scriptInput').value.trim() ? 'Waiting for the transcript' : 'Waiting for script and transcript', false);
    return;
  }
  const beats = al.allBeats.filter(b => b.stats && b.stats.status !== 'empty');
  const found = beats.filter(b => b.matchedWords.length > 0).length;
  const matchPct = Math.round(al.words.filter(w => w.status === 'match').length / N * 100);
  const summary = beats.length ? `<b style="color:var(--text);font-weight:600">${found}/${beats.length}</b> beats found · ${matchPct}% of words match the script` : plural(N, 'word');
  if (warns) setHealth('fa-triangle-exclamation i-warn', `${summary} · <span class="warn-text">${plural(warns, 'warning')}</span>`, true);
  else setHealth('fa-circle-check i-ok', summary, false);
}
