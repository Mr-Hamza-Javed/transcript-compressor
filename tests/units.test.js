// Unit tests for the small building blocks: time parsing, JSON repair, combined strings,
// script table parsing, token normalisation and similarity.
// Run: npm test   (or: node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./harness');
const eq = (a, b, msg) => assert.deepEqual(plain(a), b, msg);

const app = loadApp();
const fn = (name) => app.get(name);

test('parseTimeToSeconds: numbers, strings, clocks, SRT, Google, objects', () => {
  const t = fn('parseTimeToSeconds');
  assert.equal(t(3.566), 3.566);
  assert.equal(t('3.566'), 3.566);
  assert.equal(t('3,566'), 3.566);
  assert.equal(t('3.566s'), 3.566);
  assert.equal(t('00:00:03.566'), 3.566);
  assert.equal(t('00:00:03,566'), 3.566);
  assert.equal(t('01:02:03'), 3723);
  assert.equal(t('1:05.5'), 65.5);
  assert.equal(t('100:05.5'), 6005.5, 'mm:ss with 100+ minutes');
  assert.equal(t({ seconds: '3', nanos: 500000000 }), 3.5);
  assert.equal(t('1e-3'), 0.001);
  assert.equal(t(0), 0);
  for (const bad of [null, undefined, '', 'abc', NaN, Infinity, {}, '1:2:3:4', '12:345']) {
    assert.equal(t(bad), null, `should reject ${String(bad)}`);
  }
});

test('parseCombinedString: word-first, time-first and ambiguous numeric words', () => {
  const p = fn('parseCombinedString');
  eq(p('There | 0.000 - 0.297'), { word: 'There', start: '0.000', end: '0.297' });
  eq(p('There|0.000|0.297'), { word: 'There', start: '0.000', end: '0.297' });
  eq(p('1,000th,21.36,21.92'), { word: '1,000th', start: '21.36', end: '21.92' });
  eq(p('0.000 0.297 There'), { word: 'There', start: '0.000', end: '0.297' });
  eq(p('[00:00:01.000 --> 00:00:01.400] Hello'), { word: 'Hello', start: '00:00:01.000', end: '00:00:01.400' });
  // A number spoken as the word must stay the word
  eq(p('2014|386.136|386.896'), { word: '2014', start: '386.136', end: '386.896' });
  eq(p('0.000 0.297 2014'), { word: '2014', start: '0.000', end: '0.297' });
  eq(p('[1.5 - 2.0] 100'), { word: '100', start: '1.5', end: '2.0' });
  eq(p('100-million-dollar | 388.476 - 388.997'), { word: '100-million-dollar', start: '388.476', end: '388.997' });
  assert.equal(p(''), null);
  assert.equal(p('just words here'), null);
  assert.equal(p('0.1 0.2'), null);
});

test('tryParseFlexibleJSON: valid, JSONL, trailing commas, truncated, bare key, broken', () => {
  const j = fn('tryParseFlexibleJSON');
  eq(j('{"a":1}').value, { a: 1 });
  eq(j('﻿{"a":1}').value, { a: 1 }, 'BOM');
  const l = j('{"w":"a"}\n{"w":"b"}');
  assert.equal(l.note, 'jsonl');
  assert.equal(l.value.length, 2);
  const tc = j('{"words":[{"w":"a"},{"w":"b"},]}');
  assert.equal(tc.repaired, 'trailing-commas');
  assert.equal(tc.value.words.length, 2);
  const tr = j('{"words":[{"w":"a","s":1},{"w":"b","s":2},{"w":"c","s"');
  assert.equal(tr.repaired, 'truncated');
  eq(tr.value.words.map(x => x.w), ['a', 'b']);
  eq(j('"words": [{"w":"a"}],').value, { words: [{ w: 'a' }] });
  const bad = j('{"words": [{"w": "a"} {"w": "b"}]}');
  assert.equal(bad.value, null);
  assert.equal(bad.looksJSON, true);
  assert.ok(bad.error && bad.error.message);
  assert.equal(j('hello|0|1').looksJSON, false);
  assert.equal(j('').value, null);
});

test('splitTableRow / isSeparatorRow / cleanScriptText', () => {
  const split = fn('splitTableRow');
  eq(split('| «1» | Hello | SP |'), ['«1»', 'Hello', 'SP']);
  eq(split('| a | b \\| c | d |'), ['a', 'b | c', 'd']);
  eq(split('| a | b'), ['a', 'b']);
  assert.equal(fn('isSeparatorRow')(['---', ':--:', '']), true);
  assert.equal(fn('isSeparatorRow')(['«1»', 'text']), false);
  const clean = fn('cleanScriptText');
  assert.equal(clean('Hello **world** [B-ROLL] `code` [link](http://x) <br> end'), 'Hello world link end');
  assert.equal(clean('Fans hoarded bottles. [26]'), 'Fans hoarded bottles.');
  assert.equal(clean(null), '');
});

test('analyzeHeaderRow picks the script column, not "Context"', () => {
  const a = fn('analyzeHeaderRow');
  eq(a(['Key', 'Line', 'Type', 'Context']), { keyIdx: 0, textIdx: 1 });
  eq(a(['Key', 'Context', 'Line']), { keyIdx: 0, textIdx: 2 });
  eq(a(['#', 'Visual notes', 'Voiceover']), { keyIdx: 0, textIdx: 2 });
  eq(a(['Beat', 'Script Text', 'B-roll']), { keyIdx: 0, textIdx: 1 });
});

test('normalizeToken: case, punctuation, numbers, possessives, accents, non-Latin scripts', () => {
  const n = fn('normalizeToken');
  assert.equal(n('Hello,'), 'hello');
  assert.equal(n('"Quoted."'), 'quoted');
  assert.equal(n("Fong's"), 'fong');
  assert.equal(n('Fong’s'), 'fong');
  assert.equal(n('350,000'), '350000');
  assert.equal(n('twenty'), '20');
  assert.equal(n('million'), '1000000');
  assert.equal(n('&'), 'and');
  assert.equal(n('Café'), 'cafe');
  assert.equal(n('month–to–month'), 'month-to-month', 'en dash treated as hyphen');
  assert.equal(n('Привет'), 'привет', 'Cyrillic kept');
  assert.equal(n('مرحبا'), 'مرحبا', 'Arabic letters kept');
  assert.equal(n('שלום'), 'שלום', 'Hebrew kept');
  assert.equal(n('नमस्ते').length > 0, true, 'Devanagari kept');
  assert.equal(n('...'), '');
  assert.equal(n(null), '');
});

test('tokenSimilarityScore: exact, stem, fuzzy, numbers, mismatch', () => {
  const s = fn('tokenSimilarityScore');
  assert.ok(s('crumbl', 'crumbl') >= 4);
  assert.ok(s('the', 'the') >= 2, 'stopword still counts as a match');
  assert.ok(s('cookie', 'cookies') >= 2, 'stem');
  assert.ok(s('mcilhenny', 'mcilheny') >= 2, 'typo');
  assert.ok(s('2017', '17') > 0, 'partial number');
  assert.ok(s('cat', 'dog') < 0);
  assert.ok(s('', 'x') < 0);
});

test('expandScriptBeatTokens: hyphens, dollars, percent', () => {
  const ex = (line, compounds) => fn('expandScriptBeatTokens')(line, 0, compounds);
  const norms = (toks) => toks.map(t => t.norm + (t.isOptionalCurrencyUnit ? '?' : ''));
  eq(norms(ex('a month-to-month deal')), ['a', 'month', 'to', 'month', 'deal']);
  eq(norms(ex('a month-to-month deal', new Set(['month-to-month']))), ['a', 'month-to-month', 'deal']);
  eq(norms(ex('It cost $350,000.')), ['it', 'cost', '350000', 'dollars?']);
  eq(norms(ex('over $2 billion today')), ['over', '2', '1000000000', 'dollars?', 'today']);
  eq(norms(ex('up 50% now')), ['up', '50', 'percent?', 'now']);
  eq(ex(''), []);
  const t = ex('One two.');
  assert.equal(t[0].isFirstInBeat, true);
  assert.equal(t[1].isLastInBeat, true);
  assert.equal(t[1].endsSentence, true);
});
