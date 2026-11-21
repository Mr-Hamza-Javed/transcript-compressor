// End-to-end tests: script + transcript in, aligned "Recommended Structure" + issues out.
// Uses the real app code with a fake DOM (see harness.js).
// Run: npm test   (or: node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, wordsFromText, scriptTable, plain } = require('./harness');
const eq = (a, b, msg) => assert.deepEqual(plain(a), b, msg);

const SCRIPT_3 = scriptTable('1. Intro', [
  ['1', 'There was a time when cookies ruled the mall.'],
  ['2', 'Then a small shop changed everything.'],
  ['3', 'Nobody saw it coming.']
]);
const SPOKEN_3 = 'There was a time when cookies ruled the mall. Then a small shop changed everything. Nobody saw it coming.';

const fresh = () => loadApp();
const keysOf = (app, w) => app.beats().find(b => b.matchedWords.includes(w))?.key;
const beatText = (app, key) => app.beat(key).matchedWords.map(w => w.word).join(' ');
const hasIssue = (app, rx, level) => app.issues().some(i => rx.test(i.title) && (!level || i.level === level));

/* ---------- built-in sample formats ---------- */
const SCENARIOS = ['crumbl_standard', 'renamed_keys', 'combined_single_var', 'tuple_array', 'assemblyai_ms', 'whisper_segments', 'deepgram', 'srt_subtitles'];
for (const s of SCENARIOS) {
  test(`sample "${s}" aligns every beat with no errors`, () => {
    const app = fresh();
    app.call('loadScenario', s);
    const beats = app.beats().filter(b => b.stats.status !== 'empty');
    assert.ok(beats.length > 0);
    assert.equal(beats.filter(b => !b.matchedWords.length).length, 0, 'every beat has words');
    assert.equal(app.issues().filter(i => i.level === 'error').length, 0);
    assert.match(app.output(), /^## /m);
    assert.match(app.output(), /^### «1»$/m);
    assert.match(app.output(), /^\S+\|\d+\.\d{3}\|\d+\.\d{3}$/m, 'Word|start|end lines');
  });
}

test('sample "messy_take" reports the retake / missing beat as warnings', () => {
  const app = fresh();
  app.call('loadScenario', 'messy_take');
  const issues = app.issues();
  assert.ok(issues.some(i => i.level === 'warn'));
  assert.equal(issues.filter(i => i.level === 'error').length, 0);
});

/* ---------- basic alignment ---------- */
test('clean read: each sentence lands in its own beat, 100% coverage', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: wordsFromText(SPOKEN_3) }).convert();
  assert.equal(beatText(app, '«1»'), 'There was a time when cookies ruled the mall.');
  assert.equal(beatText(app, '«2»'), 'Then a small shop changed everything.');
  assert.equal(beatText(app, '«3»'), 'Nobody saw it coming.');
  app.beats().forEach(b => assert.equal(b.stats.status, 'ok'));
  assert.equal(app.issues().filter(i => i.level !== 'info').length, 0);
});

test('hyphenated word kept whole by the transcript matches the script (beat «69» bug)', () => {
  const app = fresh()
    .setScript(scriptTable('3. Peak', [['69', "By 2014, Huy Fong was a 100-million-dollar company. That's two thirds more than just two years earlier."]]))
    .setTranscript({ words: wordsFromText("By 2014, Huy Fong was a 100-million-dollar company. That's two thirds more than just two years earlier.") })
    .convert();
  const b = app.beat('«69»');
  assert.equal(b.stats.coverage, 1);
  assert.equal(b.stats.status, 'ok');
});

test('hyphenated word split by the transcript still matches', () => {
  const app = fresh()
    .setScript(scriptTable('S', [['1', 'A month-to-month deal.']]))
    .setTranscript({ words: wordsFromText('A month to month deal.') }).convert();
  assert.equal(app.beat('«1»').stats.coverage, 1);
});

test('numbers written vs spoken: "$350,000" ~ "350,000 dollars", "twenty" ~ "20"', () => {
  const app = fresh()
    .setScript(scriptTable('S', [['1', 'They paid $350,000 for twenty stores.']]))
    .setTranscript({ words: wordsFromText('They paid 350,000 dollars for 20 stores.') }).convert();
  assert.equal(app.beat('«1»').stats.coverage, 1);
});

test('filler words are kept in the output but do not count as extra speech', () => {
  const app = fresh().setScript(SCRIPT_3)
    .setTranscript({ words: wordsFromText('There was uh a time when cookies um ruled the mall. Then a small shop changed everything. Nobody saw it coming.') })
    .convert();
  assert.match(app.output(), /^uh\|/m);
  assert.equal(app.beat('«1»').stats.extra, 0);
  assert.equal(app.beat('«1»').stats.status, 'ok');
});

test('skipped beat is reported as "not found"', () => {
  const app = fresh().setScript(SCRIPT_3)
    .setTranscript({ words: wordsFromText('There was a time when cookies ruled the mall. Nobody saw it coming.') }).convert();
  assert.equal(app.beat('«2»').stats.status, 'missing');
  assert.ok(hasIssue(app, /«2» was not found/, 'warn'));
});

test('extra speech before / after the script goes to UNMATCHED blocks and can be moved in', () => {
  const app = fresh().setScript(SCRIPT_3)
    .setTranscript({ words: wordsFromText('Hey guys welcome back to the channel. ' + SPOKEN_3 + ' Like and subscribe for more videos.') })
    .convert();
  const al = app.alignment();
  assert.ok(al.leading.length >= 3, 'leading words');
  assert.ok(al.trailing.length >= 3, 'trailing words');
  assert.match(app.output(), /### «UNMATCHED_LEADING»/);
  assert.match(app.output(), /### «UNMATCHED_TRAILING»/);

  app.el('includeUnmatchedToggle').checked = false;
  app.rerender();
  assert.doesNotMatch(app.output(), /UNMATCHED/);
  assert.ok(hasIssue(app, /before the script starts/));

  app.el('includeUnmatchedToggle').checked = true;
  const n = al.leading.length;
  app.call('moveUnmatched', 'leading');
  assert.equal(app.alignment().leading.length, 0);
  assert.equal(app.beat('«1»').matchedWords[0].word, 'Hey');
  assert.ok(app.beat('«1»').matchedWords.length >= n);
});

test('partial transcript (only the middle beat) is a note, not an error', () => {
  const app = fresh().setScript(SCRIPT_3)
    .setTranscript({ words: wordsFromText('Then a small shop changed everything.') }).convert();
  assert.equal(beatText(app, '«2»'), 'Then a small shop changed everything.');
  assert.equal(app.issues().filter(i => i.level === 'error').length, 0);
  // Empty beats hidden by default
  assert.doesNotMatch(app.output(), /«1»/);
  app.el('hideEmptyBeatsToggle').checked = false;
  app.rerender();
  assert.match(app.output(), /### «1»/);
});

test('wrong transcript for this script is flagged as an error', () => {
  const app = fresh().setScript(SCRIPT_3)
    .setTranscript({ words: wordsFromText('Completely unrelated sentence about rockets and planets orbiting distant suns.') }).convert();
  assert.ok(app.issues().some(i => i.level === 'error'));
});

test('compact layout puts each beat on one line', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: wordsFromText(SPOKEN_3) });
  app.el('outputLayoutStyle').value = 'compact';
  app.convert();
  assert.match(app.output(), /^«1» \| There\|0\.000\|0\.250 was\|/m);
});

/* ---------- manual nudges ---------- */
test('nudge buttons move one word across a beat border and keep word order', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: wordsFromText(SPOKEN_3) }).convert();
  app.call('nudgeBeatBoundary', 1, 'first_to_prev');
  assert.equal(app.beat('«1»').matchedWords.at(-1).word, 'Then');
  assert.equal(app.beat('«2»').matchedWords[0].word, 'a');
  app.call('nudgeBeatBoundary', 1, 'pull_from_prev');
  assert.equal(app.beat('«2»').matchedWords[0].word, 'Then');
  app.call('nudgeBeatBoundary', 0, 'first_to_prev'); // no previous beat
  assert.equal(app.toasts.at(-1).type, 'warn');
  // Output-only toggles keep the nudge
  app.call('nudgeBeatBoundary', 1, 'first_to_prev');
  app.rerender();
  assert.equal(app.beat('«1»').matchedWords.at(-1).word, 'Then');
});

/* ---------- transcript formats & timestamps ---------- */
test('milliseconds are detected and converted to seconds', () => {
  const words = wordsFromText(SPOKEN_3).map(w => ({ text: w.word, start: Math.round(w.start * 1000), end: Math.round(w.end * 1000) }));
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words }).convert();
  assert.match(app.output(), /^Then\|2\.700\|2\.950$/m);
  assert.ok(hasIssue(app, /milliseconds/));
});

test('"Keep raw" timestamp policy outputs the times exactly as given', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: [{ word: 'There', start: '00:00:01.5', end: '00:00:01.9' }] });
  app.el('timeFormatPolicy').value = 'raw';
  app.convert();
  assert.match(app.output(), /^There\|00:00:01\.5\|00:00:01\.9$/m);
});

test('missing timestamps are estimated from neighbours and marked', () => {
  const words = wordsFromText(SPOKEN_3);
  delete words[5].start; delete words[5].end;
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words }).convert();
  const w = app.alignment().words[5];
  assert.equal(w.estimated, true);
  assert.ok(w.s >= app.alignment().words[4].s && w.s <= app.alignment().words[6].s);
  assert.ok(hasIssue(app, /had no timestamp/));
});

test('no timestamps at all is an error', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: SPOKEN_3.split(' ').map(word => ({ word, start: null, end: null })) }).convert();
  assert.ok(app.issues().some(i => i.level === 'error'));
});

test('timestamps going backwards are warned about', () => {
  const words = wordsFromText(SPOKEN_3);
  words[8].start = 0.1; words[8].end = 0.2;
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words }).convert();
  assert.ok(hasIssue(app, /jump backwards/));
});

test('ElevenLabs style: spacing items skipped, punctuation glued, audio events dropped', () => {
  const items = [];
  wordsFromText('Nobody saw it coming.').forEach((w, i) => {
    if (i) items.push({ text: ' ', type: 'spacing', start: w.start, end: w.start });
    items.push({ text: w.word.replace('.', ''), type: 'word', start: w.start, end: w.end });
  });
  items.push({ text: '.', type: 'punctuation', start: 1.2, end: 1.2 });
  items.push({ text: '(laughs)', type: 'audio_event', start: 1.3, end: 1.8 });
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: items }).convert();
  assert.equal(beatText(app, '«3»'), 'Nobody saw it coming.');
  assert.doesNotMatch(app.output(), /laughs/);
});

test('plain "word|start|end" lines with a header row', () => {
  const lines = 'word,start,end\n' + wordsFromText(SPOKEN_3).map(w => `${w.word}|${w.start}|${w.end}`).join('\n');
  const app = fresh().setScript(SCRIPT_3).setTranscript(lines).convert();
  assert.equal(app.el('transcriptModeSelect').value, 'lines');
  assert.equal(app.beat('«2»').stats.status, 'ok');
  assert.equal(app.issues().filter(i => i.level !== 'info').length, 0);
});

test('time-first lines where the spoken word is a number ("0.000 0.297 2014")', () => {
  const app = fresh().setScript(scriptTable('S', [['1', 'By 2014 it grew.']]))
    .setTranscript('0.000 0.300 By\n0.300 0.700 2014\n0.700 0.900 it\n0.900 1.200 grew.').convert();
  assert.match(app.output(), /^2014\|0\.300\|0\.700$/m);
  assert.equal(app.beat('«1»').stats.coverage, 1);
});

test('broken JSON shows a syntax error with a line number (no silent text fallback)', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript('{\n "words": [\n {"word": "a", "start": 0, "end": 1}\n {"word": "b", "start": 1, "end": 2}\n ]\n}').convert();
  const err = app.issues().find(i => i.level === 'error');
  assert.ok(err);
  assert.match(err.title, /syntax error/);
});

test('JSON without any word list is an error', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ hello: 'world' }).convert();
  assert.ok(hasIssue(app, /No list of words/, 'error'));
});

test('sentence-level JSON is warned about', () => {
  const app = fresh().setScript(SCRIPT_3)
    .setTranscript({ segments: [{ text: 'There was a time when cookies ruled the mall.', start: 0, end: 3 }, { text: 'Then a small shop changed everything.', start: 3, end: 5 }] })
    .convert();
  assert.ok(hasIssue(app, /sentence-level/));
});

test('a "|" inside a transcript word does not break the Word|Start|End format', () => {
  const app = fresh().setScript(SCRIPT_3).setTranscript({ words: [{ word: 'a|b', start: 0, end: 1 }] }).convert();
  assert.match(app.output(), /^a\/b\|0\.000\|1\.000$/m);
});

test('empty inputs do not crash and show no errors', () => {
  const app = fresh().setScript('').setTranscript('').convert();
  assert.equal(app.output(), '');
  assert.equal(app.issues().filter(i => i.level === 'error').length, 0);
});

test('transcript without a script is output as one block', () => {
  const app = fresh().setScript('').setTranscript({ words: wordsFromText('Hello world') }).convert();
  assert.match(app.output(), /## 0\. Transcript\n\n### «1»\nHello\|/);
});

/* ---------- script formats ---------- */
test('script: inline «n» beats, heading beats, sections and LAST KEY line', () => {
  const script = `# Video title\n\n## 1. Hook\n\n«1» There was a time when cookies ruled the mall.\n\n## 2. Turn\n\n### «2»\nThen a small shop changed everything.\nVisuals: shop exterior\n\n### «3»: Nobody saw it coming.\n\nLAST KEY: «3»\n`;
  const app = fresh().setScript(script).setTranscript({ words: wordsFromText(SPOKEN_3) }).convert();
  const st = app.state();
  eq(st.sections.map(s => s.title), ['1. Hook', '2. Turn']);
  assert.equal(app.beat('«2»').scriptLine, 'Then a small shop changed everything.');
  assert.equal(app.beat('«3»').scriptLine, 'Nobody saw it coming.');
  app.beats().forEach(b => assert.equal(b.stats.status, 'ok'));
});

test('script: "[26]" citation lines are not beats when the script uses «n» keys', () => {
  const app = fresh().setScript('## S\n\n«1» Hello there world.\n[26] Source: Wall Street Journal 2015\n').convert();
  eq(app.beats().map(b => b.key), ['«1»']);
});

test('script: "[1]" keys still work in scripts that do not use «n» keys', () => {
  const app = fresh().setScript('## S\n\n[1] Hello there world.\n[2] Second line.\n').convert();
  eq(app.beats().map(b => b.key), ['«1»', '«2»']);
});

test('script: table with a "Context" column before the script column', () => {
  const app = fresh().setScript('## S\n\n| Key | Context | Line |\n|---|---|---|\n| «1» | Research note | Hello there world. |\n').convert();
  assert.equal(app.beat('«1»').scriptLine, 'Hello there world.');
});

test('script: user-style table (Key | Line | Type | Context) with citations', () => {
  const script = `### 3. Peak\n\n| Key | Line | Type | Context |\n| --- | --- | --- | --- |\n| «65» | Now nobody could touch it. | SP | |\n| «67» | They hoarded rooster bottles instead. | SP | [26] |\n`;
  const app = fresh().setScript(script).convert();
  assert.equal(app.beat('«65»').scriptLine, 'Now nobody could touch it.');
  assert.equal(app.beat('«67»').scriptLine, 'They hoarded rooster bottles instead.');
});

test('script: duplicate keys and empty beats are warned about; no beats is an error', () => {
  let app = fresh().setScript('## S\n\n«1» One.\n«1» Two.\n«2» \n').convert();
  assert.ok(app.state().scriptNotes.some(n => /Duplicate beat key/.test(n.title)));
  app = fresh().setScript('## S\n\n| Key | Line |\n|---|---|\n| «1» |  |\n').convert();
  assert.ok(app.state().scriptNotes.some(n => /no script text/.test(n.title)));
  app = fresh().setScript('Just some prose without beats.').convert();
  assert.ok(app.state().scriptNotes.some(n => n.level === 'error'));
});

test('script: invalid custom section regex falls back with a warning', () => {
  const app = fresh().setScript(SCRIPT_3);
  app.el('sectionRegexInput').value = '([unclosed';
  app.convert();
  assert.ok(app.state().scriptNotes.some(n => /regex is invalid/.test(n.title)));
  assert.equal(app.beats().length, 3);
});

/* ---------- input events, persistence ---------- */
test('editing the transcript and then the script quickly still re-reads the new transcript', async () => {
  const app = fresh();
  app.call('loadScenario', 'crumbl_standard');
  app.el('transcriptInput').value = JSON.stringify({ words: wordsFromText('Totally different words') });
  app.call('onTranscriptRawInput');
  app.el('scriptInput').value += '\n';
  app.call('onInputChanged');
  await app.settle();
  assert.equal(app.alignment().words.length, 3);
});

test('a transcript too big for localStorage never leaves an older transcript saved', () => {
  const app = fresh();
  app.el('scriptInput').value = 'old script';
  app.el('transcriptInput').value = 'old transcript';
  app.call('saveInputs');
  app.localStorage.quota = 1000;
  app.el('scriptInput').value = 'new script';
  app.el('transcriptInput').value = 'x'.repeat(5000);
  app.call('saveInputs');
  assert.equal(app.localStorage.getItem('transcriptCompressor.transcript'), null);
  assert.equal(app.localStorage.getItem('transcriptCompressor.script'), null);
});

test('large input aligns in reasonable time', () => {
  const sentences = Array.from({ length: 150 }, (_, i) => `Sentence number ${i} talks about topic ${i % 7} and detail ${i * 3}.`);
  const script = scriptTable('Big', sentences.map((s, i) => [String(i + 1), s]));
  const t0 = Date.now();
  const app = fresh().setScript(script).setTranscript({ words: wordsFromText(sentences.join(' ')) }).convert();
  const ms = Date.now() - t0;
  assert.ok(ms < 15000, `took ${ms} ms`);
  assert.equal(app.beats().filter(b => b.stats.status === 'ok').length, 150);
});
