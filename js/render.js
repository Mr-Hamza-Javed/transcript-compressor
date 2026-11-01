/* =========================================================================
   MANUAL FINE-TUNING
   ========================================================================= */
function nudgeBeatBoundary(beatIndex, direction) {
  const al = state.alignment;
  if (!al) return;
  const allBeats = al.allBeats;
  const currentBeat = allBeats[beatIndex];
  if (!currentBeat) return;

  if (direction === 'first_to_prev' && beatIndex > 0) {
    if (!currentBeat.matchedWords.length) return;
    const word = currentBeat.matchedWords.shift();
    allBeats[beatIndex - 1].matchedWords.push(word);
    showToast(`Moved "${word.word}" to ${allBeats[beatIndex - 1].key}`);
  } else if (direction === 'last_to_next' && beatIndex + 1 < allBeats.length) {
    if (!currentBeat.matchedWords.length) return;
    const word = currentBeat.matchedWords.pop();
    allBeats[beatIndex + 1].matchedWords.unshift(word);
    showToast(`Moved "${word.word}" to ${allBeats[beatIndex + 1].key}`);
  } else if (direction === 'pull_from_prev' && beatIndex > 0) {
    const prevBeat = allBeats[beatIndex - 1];
    if (!prevBeat.matchedWords.length) return;
    const word = prevBeat.matchedWords.pop();
    currentBeat.matchedWords.unshift(word);
    showToast(`Pulled "${word.word}" into ${currentBeat.key}`);
  } else if (direction === 'pull_from_next' && beatIndex + 1 < allBeats.length) {
    const nextBeat = allBeats[beatIndex + 1];
    if (!nextBeat.matchedWords.length) return;
    const word = nextBeat.matchedWords.shift();
    currentBeat.matchedWords.push(word);
    showToast(`Pulled "${word.word}" into ${currentBeat.key}`);
  } else {
    showToast('Nothing to move in that direction', 'warn');
    return;
  }
  renderOutputFromCurrentState();
}

function moveUnmatched(which) {
  const al = state.alignment;
  if (!al || !al.allBeats.length) return;
  if (which === 'leading' && al.leading.length) {
    const target = al.allBeats.find(b => b.matchedWords.length) || al.allBeats[0];
    target.matchedWords.unshift(...al.leading);
    showToast(`Moved ${al.leading.length} word(s) into ${target.key}`);
    al.leading = [];
  } else if (which === 'trailing' && al.trailing.length) {
    const withWords = al.allBeats.filter(b => b.matchedWords.length);
    const target = withWords[withWords.length - 1] || al.allBeats[al.allBeats.length - 1];
    target.matchedWords.push(...al.trailing);
    showToast(`Moved ${al.trailing.length} word(s) into ${target.key}`);
    al.trailing = [];
  }
  renderOutputFromCurrentState();
}

function focusBeat(beatIndex) {
  switchOutputTab('inspector');
  const el = $(`beat-card-${beatIndex}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('beat-flash');
  setTimeout(() => el.classList.remove('beat-flash'), 1600);
}

/* =========================================================================
   MAIN CONVERSION & RECOMMENDED STRUCTURE GENERATOR
   ========================================================================= */
function runConversion(recomputeAlignment = true) {
  if (recomputeAlignment || !state.alignment) {
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

function renderOutputFromCurrentState() {
  const al = state.alignment || { allBeats: [], words: [], leading: [], trailing: [], extraRuns: [], notes: [] };
  const sections = state.sections || [];
  const layoutStyle = $('outputLayoutStyle').value;
  const hideEmptyBeats = $('hideEmptyBeatsToggle')?.checked ?? true;
  const includeUnmatched = $('includeUnmatchedToggle').checked;
  const words = al.words;

  al.allBeats.forEach(b => { b.stats = computeBeatStats(b, al); });

  $('scriptStatsBadge').textContent = `${sections.length} Sec · ${al.allBeats.length} Beats`;
  $('transcriptStatsBadge').textContent = `${words.length} Words`;

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
      'Check that this transcript is the recording of this script, and that the correct "Word Variable" is selected in the Schema Mapper.');
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
        `Spoken: "${wordsText(runWords)}". Script: "${shorten(beats[r.target].scriptLine)}". Please verify in Alignment Check.`, r.target);
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
      `"${wordsText(al.leading)}" — ${where} as «UNMATCHED_LEADING». Use Alignment Check to move them into the first beat if they belong there.`);
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

const ISSUE_STYLE = {
  error: { icon: 'fa-circle-xmark text-rose-400', box: 'border-rose-500/40 bg-rose-500/10', label: 'Error' },
  warn: { icon: 'fa-triangle-exclamation text-amber-400', box: 'border-amber-500/30 bg-amber-500/5', label: 'Warning' },
  info: { icon: 'fa-circle-info text-cyan-400', box: 'border-slate-700 bg-slate-900', label: 'Note' }
};

function renderIssues(issues) {
  const count = { error: 0, warn: 0, info: 0 };
  issues.forEach(i => { count[i.level]++; });
  const badge = $('issuesCountBadge');
  badge.textContent = count.error + count.warn;
  badge.className = 'ml-0.5 px-1.5 rounded-full text-[10px] ' + (count.error ? 'bg-rose-600 text-white' : count.warn ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-200');

  let html = `
    <div class="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex flex-wrap items-center gap-3">
      <span class="font-semibold text-slate-200"><i class="fa-solid fa-stethoscope text-emerald-400 mr-1.5"></i>Script ↔ Transcript check</span>
      <span class="text-rose-300">${count.error} error(s)</span>
      <span class="text-amber-300">${count.warn} warning(s)</span>
      <span class="text-cyan-300">${count.info} note(s)</span>
    </div>`;
  if (!issues.length) {
    html += `<div class="px-3 py-6 text-center text-xs text-emerald-300"><i class="fa-solid fa-circle-check mr-1.5"></i>No problems found — every beat matches the transcript.</div>`;
  }
  issues.forEach(issue => {
    const st = ISSUE_STYLE[issue.level] || ISSUE_STYLE.info;
    const clickable = issue.beatIndex !== null && issue.beatIndex !== undefined;
    html += `
      <div ${clickable ? `onclick="focusBeat(${issue.beatIndex})" title="Show this beat in Alignment Check"` : ''} class="px-3 py-2 rounded-lg border ${st.box} text-[11px] ${clickable ? 'cursor-pointer hover:brightness-125' : ''}">
        <div class="flex items-start gap-2">
          <i class="fa-solid ${st.icon} mt-0.5"></i>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-100">${escapeHtml(issue.title)}</div>
            ${issue.detail ? `<div class="text-slate-400 mt-0.5 break-words">${escapeHtml(issue.detail)}</div>` : ''}
          </div>
          ${clickable ? '<i class="fa-solid fa-arrow-right text-slate-500 mt-0.5"></i>' : ''}
        </div>
      </div>`;
  });
  $('outputIssuesContainer').innerHTML = html;
}

function updateBanner(issues) {
  const banner = $('schemaAlertBanner');
  const icon = $('schemaAlertIcon');
  const text = $('schemaAlertText');
  const firstError = issues.find(i => i.level === 'error');
  if (firstError) {
    banner.className = 'bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 flex items-center justify-between gap-3 text-xs text-rose-200 shrink-0';
    icon.className = 'fa-solid fa-circle-xmark text-rose-400';
    const more = issues.filter(i => i.level === 'error').length - 1;
    text.textContent = firstError.title + (more > 0 ? ` (+${more} more)` : '');
    $('bannerIssuesBtn').classList.remove('hidden');
    $('bannerMapperBtn').classList.toggle('hidden', !/transcript|json|word|timestamp|mapping/i.test(firstError.title));
  } else if (state.mappingMessage && $('transcriptInput').value.trim()) {
    banner.className = 'bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3 text-xs text-amber-200 shrink-0';
    icon.className = 'fa-solid fa-triangle-exclamation text-amber-400';
    text.textContent = state.mappingMessage;
    $('bannerIssuesBtn').classList.add('hidden');
    $('bannerMapperBtn').classList.remove('hidden');
  } else {
    banner.className = 'hidden';
  }
}

/* =========================================================================
   ALIGNMENT INSPECTOR
   ========================================================================= */
const BEAT_STATUS_STYLE = {
  ok: { chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Matched' },
  partial: { chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', label: 'Small differences' },
  poor: { chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Poor match' },
  missing: { chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Not found' },
  empty: { chip: 'bg-slate-800 text-slate-500 border-slate-700', label: 'No script text' }
};

function wordChip(w) {
  let cls = 'bg-slate-950 text-cyan-300 border-slate-800';
  let title = `${w.start} – ${w.end}`;
  if (w.status === 'sub') { cls = 'bg-amber-950/50 text-amber-300 border-amber-500/50'; title += ` · heard "${w.word}" where the script says "${w.expected}"`; }
  else if (w.status === 'ins') { cls = w.isFiller ? 'bg-slate-950 text-slate-500 border-slate-800' : 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-500/60 border-dashed'; title += w.isFiller ? ' · filler word' : ' · extra word (not in script)'; }
  else if (w.status === 'unmatched') { cls = 'bg-rose-950/50 text-rose-300 border-rose-500/50'; title += ' · not part of the script'; }
  if (w.estimated) title += ' · timestamp estimated';
  return `<span class="px-1.5 py-0.5 rounded border ${cls} text-[10px] font-mono ${w.estimated ? 'italic' : ''}" title="${escapeHtml(title)}">${escapeHtml(w.word)}<span class="text-slate-500">|${w.estimated ? '~' : ''}${escapeHtml(w.start)}</span></span>`;
}

function unmatchedCard(kind, list) {
  if (!list.length) return '';
  const label = kind === 'leading' ? '«UNMATCHED_LEADING» — spoken before the script starts' : '«UNMATCHED_TRAILING» — spoken after the script ends';
  const btn = kind === 'leading' ? 'Move into first beat' : 'Move into last beat';
  return `
    <div class="bg-rose-950/20 border border-rose-500/30 rounded-xl p-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span class="text-[11px] font-semibold text-rose-300">${label}</span>
        <button onclick="moveUnmatched('${kind}')" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition">${btn}</button>
      </div>
      <div class="flex flex-wrap gap-1">${list.map(wordChip).join('')}</div>
    </div>`;
}

function renderAlignmentInspector(sections, al) {
  const container = $('outputInspectorContainer');
  let html = `
    <div class="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
      <span><i class="fa-solid fa-sliders text-emerald-400 mr-1.5"></i>Verify or fine-tune word boundaries per beat</span>
      <button onclick="runConversion(true)" class="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition">
        <i class="fa-solid fa-rotate-right mr-1"></i>Reset Auto-Align
      </button>
    </div>
    <div class="px-2.5 text-[10px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
      <span><span class="text-cyan-300">■</span> matched</span>
      <span><span class="text-amber-300">■</span> heard differently</span>
      <span><span class="text-fuchsia-300">■</span> extra (not in script)</span>
      <span><span class="text-rose-300 line-through">abc</span> script word not heard</span>
      <span class="italic">~ estimated time</span>
    </div>`;

  html += unmatchedCard('leading', al.leading || []);

  sections.forEach(sec => {
    const problems = sec.beats.filter(b => b.stats && ['missing', 'poor'].includes(b.stats.status)).length;
    html += `
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div class="px-3 py-2 bg-slate-800/70 border-b border-slate-800 text-xs font-bold text-emerald-400 flex items-center justify-between">
          <span>## ${escapeHtml(sec.title)}</span>
          <span class="text-[10px] font-normal ${problems ? 'text-amber-300' : 'text-slate-400'}">${sec.beats.length} beats${problems ? ` · ${problems} need review` : ''}</span>
        </div>
        <div class="divide-y divide-slate-800/60 p-2 space-y-2">`;

    sec.beats.forEach(beat => {
      const st = beat.stats || { status: 'missing', marks: [], coverage: 0 };
      const style = BEAT_STATUS_STYLE[st.status];
      const hasWords = beat.matchedWords.length > 0;
      const firstTime = hasWords ? beat.matchedWords[0].start : '—';
      const lastTime = hasWords ? beat.matchedWords[beat.matchedWords.length - 1].end : '—';
      const bIdx = beat.beatIndex;
      const scriptHtml = st.marks.length
        ? st.marks.map(m => m.state === 'ok' ? escapeHtml(m.raw)
            : m.state === 'sub' ? `<span class="text-amber-300 not-italic underline decoration-dotted" title="heard &quot;${escapeHtml(m.heard)}&quot;">${escapeHtml(m.raw)}</span>`
            : `<span class="text-rose-300 line-through" title="not heard in the transcript">${escapeHtml(m.raw)}</span>`).join(' ')
        : `<span class="text-slate-500">${escapeHtml(beat.scriptLine) || '(no script text)'}</span>`;

      html += `
        <div id="beat-card-${bIdx}" class="pt-2.5 first:pt-0 px-1.5 rounded">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded text-xs font-bold font-mono ${style.chip} border" title="${style.label}">${escapeHtml(beat.key)}</span>
              <span class="text-[11px] text-slate-400 font-mono">${escapeHtml(firstTime)} ➔ ${escapeHtml(lastTime)}</span>
              <span class="text-[10px] px-1.5 rounded ${style.chip} border">${st.status === 'partial' && st.coverage >= 0.85 ? `${st.extra} extra word(s)` : style.label}${st.status !== 'empty' && st.status !== 'missing' ? ` · ${Math.round(st.coverage * 100)}%` : ''}</span>
              ${hasWords ? `<span class="text-[10px] text-slate-500">${beat.matchedWords.length} words</span>` : ''}
            </div>
            <div class="flex items-center gap-1">
              <button onclick="nudgeBeatBoundary(${bIdx}, 'first_to_prev')" title="Send 1st word to previous beat" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition">⬅ 1st</button>
              <button onclick="nudgeBeatBoundary(${bIdx}, 'pull_from_prev')" title="Pull last word from previous beat" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition">+Prev</button>
              <button onclick="nudgeBeatBoundary(${bIdx}, 'pull_from_next')" title="Pull 1st word from next beat" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition">+Next</button>
              <button onclick="nudgeBeatBoundary(${bIdx}, 'last_to_next')" title="Send last word to next beat" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700 transition">Last ➡</button>
            </div>
          </div>
          <div class="text-[11px] text-slate-300 mb-1.5 italic bg-slate-950/60 px-2 py-1 rounded border border-slate-800/80">"${scriptHtml}"</div>
          <div class="flex flex-wrap gap-1">
            ${beat.matchedWords.map(wordChip).join('')}
            ${!hasWords ? `<span class="text-[10px] text-slate-500">No transcript words in range for this beat</span>` : ''}
          </div>
        </div>`;
    });
    html += `</div></div>`;
  });

  html += unmatchedCard('trailing', al.trailing || []);
  const scrollTop = container.scrollTop;
  container.innerHTML = html;
  container.scrollTop = scrollTop;
}

/* =========================================================================
   TELEMETRY
   ========================================================================= */
function updateCompressionTelemetry(finalOutput, al, issues) {
  const totalRawChars = $('scriptInput').value.length + $('transcriptInput').value.length;
  const outChars = finalOutput.length;
  const savedPct = totalRawChars > 0 ? Math.max(0, Math.round((1 - outChars / totalRawChars) * 100)) : 0;

  $('compressionRatioBadge').textContent = `${savedPct}% Context Saved`;
  $('tokenCountCompare').textContent = `~${Math.round(totalRawChars / 4).toLocaleString()} ➔ ~${Math.round(outChars / 4).toLocaleString()} est. tokens`;

  const healthEl = $('alignmentHealthBadge');
  const errors = issues.filter(i => i.level === 'error').length;
  const warns = issues.filter(i => i.level === 'warn').length;
  const N = al.words.length;
  if (errors) {
    healthEl.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-400"></i><span class="text-rose-300">${errors} error(s) — click to see</span>`;
    return;
  }
  if (!N) {
    healthEl.innerHTML = `<i class="fa-solid fa-circle-minus text-slate-500"></i><span>Awaiting Transcript</span>`;
    return;
  }
  const beats = al.allBeats.filter(b => b.stats && b.stats.status !== 'empty');
  const found = beats.filter(b => b.matchedWords.length > 0).length;
  const matchPct = Math.round(al.words.filter(w => w.status === 'match').length / N * 100);
  const summary = beats.length ? `${found}/${beats.length} beats · ${matchPct}% words match script` : `${N} words`;
  if (warns) {
    healthEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-400"></i><span>${summary} · <span class="text-amber-300">${warns} warning(s)</span></span>`;
  } else {
    healthEl.innerHTML = `<i class="fa-solid fa-check-double text-emerald-400"></i><span>${summary}</span>`;
  }
}
