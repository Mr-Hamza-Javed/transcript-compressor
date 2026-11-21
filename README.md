# Transcript Compressor

**Script & Transcript Context Compressor**: video script (sections + beats) aur word-level transcript ko jor kar AI models (LLMs) ke liye intehai compact, token-efficient format mein badalta hai.

## Features
- **Schema stripping:** JSON keys, quotes aur `null` hata kar har word ko `Word|Start|End` (3-decimal seconds) format mein laata hai.
- **Beat & section alignment:** Dynamic-programming sequence alignment se har spoken word ko sahi `## Section` aur `### «Beat»` ke neeche fit karta hai (spelling/number ke farq ke bawajood).
- **Adaptive schema mapping:** Word list JSON mein kahin bhi ho, khud dhoond leta hai:
  - Standard / renamed keys (`word`, `text`, `token_text`, `punctuated_word`, `t_in`, `ts` …)
  - Whisper (`segments[].words[]`), Deepgram (`results.channels[0].alternatives[0].words`), AssemblyAI (milliseconds), AWS Transcribe, ElevenLabs, Rev.ai
  - Combined strings (`"There | 0.000 - 0.297"`), array of tuples, plain `word|start|end` lines, JSON Lines
  - SRT / VTT subtitles (word times cue ke andar estimate kiye jaate hain)
  - Azure (`Offset` + `Duration`, 100-ns ticks): end = start + duration. End-time field na ho to har word agle word ke start par khatam hota hai
  - Transcript ka apna `"estimated": true` flag Beats tab mein `~` ke saath dikhta hai
- **Script formats:** markdown tables (columns kisi bhi order mein, header se pehchanta hai), inline `«1» text`, ya `### «1»` headings.
- **Manual fine-tuning:** **Beats** tab mein beat ke kinaare par `←` / `+` buttons se words agli/pichli beat mein bhejein. Har badlaav **Undo** ho sakta hai, aur script/transcript edit karne par bhi bacha rehta hai (**Re-match** se hat jaata hai). **Needs review** filter sirf masle wali beats dikhata hai.
- **Download ka naam:** `Word level Transcription.txt`. Agar transcript JSON mein `"project": "Sause Downfall"` ho (upar ya kisi nested object mein) to naam `Word level Transcription - Sause Downfall.txt` ban jaata hai.
- **Light / dark theme**, saaf empty states, aur har input ka apna Clear button (Undo ke saath).
- **75–85% context/token saving.**

## Mismatch & error checks (Issues tab)
App batati hai ke script aur transcript kahan match nahi karte:

| Problem | App kya karti hai |
|---|---|
| Beat bola hi nahi gaya (skip) | ⚠ "«4» was not found", expected time ke saath |
| Beat alag lafzon mein bola gaya | ⚠ kitne % match, kaunse words nahi sune, kya suna gaya |
| Retake / dobara bola gaya | ⚠ "Extra speech … looks like a retake of «7»" |
| Intro / outro jo script mein nahi | «UNMATCHED_LEADING» / «UNMATCHED_TRAILING» mein alag rakhta hai |
| Ghalat transcript (doosri video ka) | ❌ "Script and transcript barely match" |
| Adhoora transcript | ℹ "Transcript starts/ends at «x»" |
| Toota hua JSON | ❌ line/column ke saath syntax error |
| Cut-off JSON / trailing commas | khud repair, warning ke saath |
| Missing timestamps | padosi words se estimate, `~` mark ke saath |
| Milliseconds timestamps | khud seconds mein convert |
| Peeche jaate timestamps | ⚠ warning |
| Khaali beat text / duplicate keys | ⚠ warning |
| Negative timestamps | 0 kar diye jaate hain, ⚠ warning |
| Ghalat "Time units" chuni (seconds ko ms bataya) | ⚠ warning |
| Poori script do dafa padhi (pehli take) | ⚠ "repeats script beats «1»–«3» — probably another take" |
| Inputs browser storage ke liye bohat bare | ⚠ ek dafa batata hai ke reload par wapas nahi aayenge |

## File structure
```
index.html                 Page layout (HTML only)
css/styles.css             Poora design: colour tokens (light/dark), buttons, cards, beats, issues
js/sample-data.js          Crumbl sample script + word-by-word transcript
js/ui.js                   Buttons, tabs, toasts, app state, file open / drag & drop
js/transcript-parser.js    Transcript reading: JSON, schema detection, timestamps, SRT/VTT
js/script-parser.js        Script reading: sections, table / inline / heading beats
js/aligner.js              Word ↔ beat alignment (dynamic programming) + mismatch detection
js/render.js               Output text, Beats tab (with undo), Issues tab, summary bar
js/presets.js              Examples menu scenarios
js/main.js                 Copy / download + app start
```
`index.html` mein scripts isi order mein load hoti hain. Order na badlein, kyunke baad wali files pehle wali files ke functions use karti hain.

## Usage
Koi install nahi chahiye. Poora folder download karein aur `index.html` browser mein khol dein. `css/` aur `js/` folders saath hone chahiyein. Files drag & drop bhi ho sakti hain. Aapke inputs browser mein save rehte hain (refresh par wapas aa jate hain).

Sample cases: **Examples** menu ("Messy recording" mein saare common masle dikhaye gaye hain).

Layout: 1 Script → 2 Transcript → 3 Result. Paste karte hi matching khud ho jaati hai, koi button nahi dabana. Result mein **Copy** dabayein aur AI chat mein paste kar dein. Script/Transcript settings (slider icon) sirf tab kholein jab kuch ghalat detect ho.

Tafseeli maqsad: [docs/app_purpose_overview.md](docs/app_purpose_overview.md)

## Tests

No install needed (Node 18+):

```bash
npm test
```

- `tests/units.test.js` covers the small pieces: time parsing, JSON repair, `word|start|end` lines, script tables, word normalisation and matching.
- `tests/pipeline.test.js` runs the whole app (script + transcript in, structure + issues out): every sample format, skipped and extra speech, partial transcripts, timestamps, script formats, input events and storage.
- `tests/harness.js` loads the real `js/` files with a small fake DOM, so nothing needs a browser.

Run the tests after every change. When you fix a bug, add a test that fails without the fix.
