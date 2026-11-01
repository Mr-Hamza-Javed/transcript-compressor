/* =========================================================================
   EXTRA SAMPLE SCENARIOS (built from the Crumbl sample above)
   ========================================================================= */
// Number of transcript words per beat in SAMPLE_WORDS_LIST
const SAMPLE_BEAT_WORD_COUNTS = [14, 15, 10, 10, 9, 9, 6, 5, 10, 11, 21, 13];
const r3 = (n) => Math.round(n * 1000) / 1000;

function sampleWordsInSeconds() {
  return SAMPLE_WORDS_LIST.map(w => ({ word: w.word, start: parseTimeToSeconds(w.start_time), end: parseTimeToSeconds(w.end_time) }));
}

function groupSampleByBeat() {
  const words = sampleWordsInSeconds();
  const groups = [];
  let i = 0;
  SAMPLE_BEAT_WORD_COUNTS.forEach(c => { groups.push(words.slice(i, i + c)); i += c; });
  return groups;
}

function buildMessyTake() {
  const groups = groupSampleByBeat();
  const seq = [];
  const add = (word, dur, extra = {}) => seq.push({ word, dur, ...extra });
  ['Hey', 'guys,', 'welcome', 'back', 'to', 'the', 'channel.'].forEach(w => add(w, 0.3));
  groups.forEach((g, bi) => {
    if (bi === 3) return; // beat «4» skipped by the speaker
    if (bi === 6) ['It', 'took', 'less', 'than,', 'uh,', 'sorry.'].forEach(w => add(w, 0.3)); // false start of «7»
    g.forEach(w => add(w.word, w.end - w.start, w.word === '2025,' ? { noTime: true } : {}));
  });
  ['Make', 'sure', 'to', 'subscribe', 'for', 'more.'].forEach(w => add(w, 0.3));
  let t = 0;
  return seq.map(x => {
    const o = { word: x.word, start: x.noTime ? null : r3(t), end: x.noTime ? null : r3(t + x.dur), confidence: 0.9 };
    t += x.dur + 0.02;
    return o;
  });
}

function fmtSrtTime(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/* =========================================================================
   SCENARIO LOADER
   ========================================================================= */
function loadScenario(scenarioKey) {
  $('scriptInput').value = CRUMBL_SCRIPT_SAMPLE;
  let transcript = '';
  let msg = '';

  if (scenarioKey === 'crumbl_standard') {
    transcript = JSON.stringify({ words: SAMPLE_WORDS_LIST }, null, 2);
    msg = 'Loaded Standard Crumbl Script + Word JSON';
  } else if (scenarioKey === 'renamed_keys') {
    const renamedList = SAMPLE_WORDS_LIST.map(w => ({ token_text: w.word, t_in: w.start_time, t_out: w.end_time, speaker_id: 1 }));
    transcript = JSON.stringify({ transcript_items: renamedList }, null, 2);
    msg = 'Loaded Renamed Variables Scenario (token_text, t_in, t_out)';
  } else if (scenarioKey === 'combined_single_var') {
    const combinedList = SAMPLE_WORDS_LIST.map(w => ({ packed: `${w.word} | ${w.start_time} - ${w.end_time}` }));
    transcript = JSON.stringify({ stream: combinedList }, null, 2);
    msg = 'Loaded Single Combined Variable Scenario';
  } else if (scenarioKey === 'tuple_array') {
    transcript = JSON.stringify(SAMPLE_WORDS_LIST.map(w => [w.word, w.start_time, w.end_time]), null, 2);
    msg = 'Loaded Array of Tuples Scenario';
  } else if (scenarioKey === 'messy_take') {
    transcript = JSON.stringify({ words: buildMessyTake() }, null, 2);
    msg = 'Loaded messy recording — open the Issues tab';
  } else if (scenarioKey === 'assemblyai_ms') {
    const words = sampleWordsInSeconds();
    transcript = JSON.stringify({
      id: 'demo-transcript', status: 'completed', text: words.map(w => w.word).join(' '),
      words: words.map(w => ({ text: w.word, start: Math.round(w.start * 1000), end: Math.round(w.end * 1000), confidence: 0.98, speaker: null }))
    }, null, 2);
    msg = 'Loaded AssemblyAI format (times in milliseconds)';
  } else if (scenarioKey === 'whisper_segments') {
    const groups = groupSampleByBeat();
    transcript = JSON.stringify({
      text: groups.map(g => g.map(w => w.word).join(' ')).join(' '),
      segments: groups.map((g, i) => ({
        id: i, start: g[0].start, end: g[g.length - 1].end, text: ' ' + g.map(w => w.word).join(' '),
        words: g.map(w => ({ word: ' ' + w.word, start: w.start, end: w.end, probability: 0.95 }))
      })),
      language: 'en'
    }, null, 2);
    msg = 'Loaded Whisper format (words inside segments)';
  } else if (scenarioKey === 'deepgram') {
    const words = sampleWordsInSeconds();
    transcript = JSON.stringify({
      metadata: { request_id: 'demo', duration: 84.15, channels: 1 },
      results: { channels: [{ alternatives: [{
        transcript: words.map(w => w.word).join(' '), confidence: 0.99,
        words: words.map(w => ({ word: w.word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''), start: w.start, end: w.end, confidence: 0.99, punctuated_word: w.word }))
      }] }] }
    }, null, 2);
    msg = 'Loaded Deepgram format (deeply nested)';
  } else if (scenarioKey === 'srt_subtitles') {
    const groups = groupSampleByBeat();
    transcript = groups.map((g, i) => `${i + 1}\n${fmtSrtTime(g[0].start)} --> ${fmtSrtTime(g[g.length - 1].end)}\n${g.map(w => w.word).join(' ')}\n`).join('\n');
    msg = 'Loaded SRT subtitles (sentence-level)';
  }

  $('transcriptInput').value = transcript;
  saveInputs();
  inspectAndPopulateTranscriptSchema(true);
  runConversion(true);
  showToast(msg);
}
