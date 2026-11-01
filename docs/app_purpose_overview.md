# Script & Transcript Context Compressor — Asal Maqsad (Core Purpose)

Is application ka bunyadi maqsad **Video Script (Sections aur Beats)** aur **Audio Transcription (Word-by-Word JSON)** ko aapas mein jorna aur unhein AI Models (LLMs) ke liye aik **intehai compact, token-efficient format** mein tabdeel karna hai.

---

### 1. Asal Masla Kya Tha? (The Problem)
* **Massive Token Waste:** Word-by-word JSON transcription mein har lafz ke sath `"word"`, `"start_time"`, `"end_time"`, aur `"confidence": null` jaise variable names baar baar repeat hote hain. Aik aam 10-minute ki video mein yeh redundant keys AI model ka **75% se 80% context window** fazool mein zaya kar deti hain.
* **Disconnected Structure:** AI ko agar alag se Markdown Script table aur alag se raw JSON timestamps diye jayein, to model ko yeh samajhne mein mushkil hoti hai ke kaunsa spoken word exact kis **Section** (`## 0. Hook`) aur kis **Beat Key** (`«1»`, `«2»`) se talluq rakhta hai.
* **Changing Formats:** Alag alag transcription tools (Whisper, AssemblyAI, Deepgram, waghera) mukhtalif variable names ya data structures dete hain, aur kabhi script ke table columns bhi badal jate hain.

---

### 2. Is App Ka Hal Aur Maqsad (The Solution)

Yeh tool do alag inputs (**Markdown Script** + **Word-level Transcript**) leta hai aur unhein process karke **"Recommended Structure"** mein convert kar deta hai:

1. **Redundant Variables Ka Khatma (Schema Stripping):**
   Tamam JSON keys, brackets, quotes, aur `null` values ko hata kar har word ko exact 3-decimal timestamps ke sath pipe-delimited format (`Word|Start|End`, maslan `There|0.000|0.297`) mein le aata hai.
2. **Automatic Beat & Section Alignment:**
   Smart Sequence Alignment (Dynamic Programming) ke zariye transcript ke har spoken lafz ko original script ki exact **Section Heading** (`## 0. Hook`) aur **Beat Key** (`### «1»`) ke neechay fit kar deta hai—chahe transcript mein spelling thori farq ho (`"Crumbl"` vs `"crumble"`) ya numbers mukhtalif likhe hon (`"1,000th"` vs `"thousandth"`).
3. **Adaptive Schema Mapping (Har Format Ke Liye Tayyar):**
   * Agar JSON mein variables ke naam badal jayein (jaise `word` ki jagah `token_text`), to yeh khud detect karke map kar leta hai.
   * Agar aik hi string variable mein teeno values hon ya Array of Tuples ho, to usay bhi split karke process kar leta hai.
   * Agar Script ke table columns aage peeche hon, to unhein bhi map karne ki sahulat deta hai.
4. **Manual Fine-Tuning (Alignment Check):**
   Agar kisi beat ke shuru ya aakhir ka koi word agli/pichli beat mein shift karna ho, to visual inspector se aik click par boundary adjust ki ja sakti hai.

---

### 3. Final Output Ka Fayda (Why It Matters)
Jab aap is tool ka output kisi AI model ko dete hain:
* **75%–85% Context & Cost Saving:** Fazool syntax khatam hone se bohot badi scripts aik hi prompt mein fit aa jati hain.
* **Higher AI Accuracy:** Model ko saaf nazar aata hai ke kis Section aur kis Beat (`«1»`, `«2»`) ka exact start/end time kya hai aur uske andar kaunse words bole gaye hain, jis se video editing automation, B-roll pacing, aur visual alignment 100% accurate ho jati hai.