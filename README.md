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
- **Script formats:** markdown tables (columns kisi bhi order mein, header se pehchanta hai), inline `«1» text`, ya `### «1»` headings.
- **Manual fine-tuning:** Alignment Check mein aik click se beat boundaries adjust karein.
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

## File structure
```
index.html                 Page layout (HTML only)
css/styles.css             Custom styles (Tailwind CDN se baqi styling)
js/sample-data.js          Crumbl sample script + word-by-word transcript
js/ui.js                   Buttons, tabs, toasts, app state, file open / drag & drop
js/transcript-parser.js    Transcript reading: JSON, schema detection, timestamps, SRT/VTT
js/script-parser.js        Script reading: sections, table / inline / heading beats
js/aligner.js              Word ↔ beat alignment (dynamic programming) + mismatch detection
js/render.js               Output text, Alignment Check, Issues tab, telemetry
js/presets.js              Test Presets menu scenarios
js/main.js                 Copy / download + app start
```
`index.html` mein scripts isi order mein load hoti hain. Order na badlein, kyunke baad wali files pehle wali files ke functions use karti hain.

## Usage
Koi install nahi chahiye. Poora folder download karein aur `index.html` browser mein khol dein. `css/` aur `js/` folders saath hone chahiyein. Files drag & drop bhi ho sakti hain. Aapke inputs browser mein save rehte hain (refresh par wapas aa jate hain).

Sample cases: **Test Presets** menu (preset 5 "Messy Real Recording" mein saare common masle dikhaye gaye hain).

Tafseeli maqsad: [docs/app_purpose_overview.md](docs/app_purpose_overview.md)
