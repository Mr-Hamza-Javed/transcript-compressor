# Transcript Compressor

**Script & Transcript Context Compressor** — video script (sections + beats) aur word-level transcript JSON ko jor kar AI models (LLMs) ke liye intehai compact, token-efficient format mein badalta hai.

## Features
- **Schema stripping:** JSON keys, quotes aur `null` hata kar har word ko `Word|Start|End` (3-decimal timestamps) format mein laata hai.
- **Beat & section alignment:** Dynamic-programming sequence alignment se har spoken word ko sahi `## Section` aur `### «Beat»` ke neeche fit karta hai (spelling/number farq ke bawajood).
- **Adaptive schema mapping:** Whisper, AssemblyAI, Deepgram waghera ke mukhtalif key names, tuples ya combined strings khud detect karta hai.
- **Manual fine-tuning:** Visual inspector se beat boundaries aik click mein adjust karein.
- **75–85% context/token saving.**

## Usage
Koi install nahi chahiye — `index.html` browser mein khol dein.

Tafseeli maqsad: [docs/app_purpose_overview.md](docs/app_purpose_overview.md)
