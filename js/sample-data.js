/* =========================================================================
   SAMPLE DATA PRESETS (Full Crumbl Hook + Backstory & Transcript Variants)
   ========================================================================= */
const CRUMBL_SCRIPT_SAMPLE = `# The Rise and Fall of Crumbl — Visual Guide v3

Oct 15, 2026 · @Hamza Javed

## 0. Hook

| Key | Script Line | Type | Visuals |
| --- | --- | --- | --- |
| «1» | There was a time when no bakery chain in America could touch Crumbl Cookies. | ERA | \`[B-ROLL]:\` Crowd lined up out the door and around a strip mall at a Crumbl grand opening, pink boxes in hand |
| «2» | In 2022, the average Crumbl store was bringing in nearly two million dollars a year. | AI | \`[ARTICLE SHOT]:\` QSR Research Hub Crumbl deep dive AUV 1.84 million |
| «3» | That was more than the average Dunkin' or Five Guys. | AI |  |
| «4» | And almost four times what a typical American bakery made. | AI |  |
| «5» | Then Crumbl started expanding faster than even McDonald's had. | AI |  |
| «6» | By February 2024, it had opened its thousandth store. | EVIDENCE | \`[B-ROLL]:\` Crumbl's 1,000th store opening in Burbank, California |
| «7» | It took less than seven years. | HOLD | \`[HOLD «6»]\` — \`[TEXT OVERLAY]:\` 2017 → 2024 |
| «8» | And the growth kept going. | ERA | \`[B-ROLL]:\` Installers mounting a pink Crumbl sign on a brand-new storefront |
| «9» | By May 2025, investors valued Crumbl at two billion dollars. | EVIDENCE | \`[ARTICLE SHOT]:\` QSR Magazine Crumbl to sell minority stake to TSG Consumer Partners |
| «10» | It even had more TikTok followers than Starbucks and Nike combined. | EVIDENCE | \`[ARTICLE SHOT]:\` QSR Magazine Crumbl TikTok followers Nike Starbucks |

LAST KEY: «10»

## 1. Backstory

| Key | Script Line | Type | Visuals |
| --- | --- | --- | --- |
| «32» | In September 2017, two cousins, Jason McGowan and Sawyer Hemsley, were days away from opening Crumbl's first shop in Logan, Utah. | EVIDENCE | \`[IMAGE]:\` Early 2017 photo of Jason McGowan and Sawyer Hemsley |
| «33» | They had one cookie, one small storefront, and a month-to-month lease. | ERA | \`[B-ROLL]:\` Close-up of a warm Crumbl milk chocolate chip cookie |`;

// Full word-by-word sequence matching the sample beats above (including "crumble", "$2,000,000", "1,000th", and split "month to month" to test DP alignment!)
const SAMPLE_WORDS_LIST = [
  // Beat «1»
  { word: "There", start_time: "00:00:00.000", end_time: "00:00:00.297", confidence: null },
  { word: "was", start_time: "00:00:00.297", end_time: "00:00:00.594", confidence: null },
  { word: "a", start_time: "00:00:00.594", end_time: "00:00:00.891", confidence: null },
  { word: "time", start_time: "00:00:00.891", end_time: "00:00:01.189", confidence: null },
  { word: "when", start_time: "00:00:01.189", end_time: "00:00:01.486", confidence: null },
  { word: "no", start_time: "00:00:01.486", end_time: "00:00:01.783", confidence: null },
  { word: "bakery", start_time: "00:00:01.783", end_time: "00:00:02.080", confidence: null },
  { word: "chain", start_time: "00:00:02.080", end_time: "00:00:02.377", confidence: null },
  { word: "in", start_time: "00:00:02.377", end_time: "00:00:02.674", confidence: null },
  { word: "America", start_time: "00:00:02.674", end_time: "00:00:02.971", confidence: null },
  { word: "could", start_time: "00:00:02.971", end_time: "00:00:03.269", confidence: null },
  { word: "touch", start_time: "00:00:03.269", end_time: "00:00:03.566", confidence: null },
  { word: "crumble", start_time: "00:00:03.566", end_time: "00:00:03.863", confidence: null },
  { word: "cookies.", start_time: "00:00:03.863", end_time: "00:00:04.160", confidence: null },
  // Beat «2»
  { word: "In", start_time: "00:00:04.160", end_time: "00:00:04.549", confidence: null },
  { word: "2022,", start_time: "00:00:04.549", end_time: "00:00:04.937", confidence: null },
  { word: "the", start_time: "00:00:04.937", end_time: "00:00:05.326", confidence: null },
  { word: "average", start_time: "00:00:05.326", end_time: "00:00:05.714", confidence: null },
  { word: "crumble", start_time: "00:00:05.714", end_time: "00:00:06.103", confidence: null },
  { word: "store", start_time: "00:00:06.103", end_time: "00:00:06.491", confidence: null },
  { word: "was", start_time: "00:00:06.491", end_time: "00:00:06.750", confidence: null },
  { word: "bringing", start_time: "00:00:06.750", end_time: "00:00:07.120", confidence: null },
  { word: "in", start_time: "00:00:07.120", end_time: "00:00:07.310", confidence: null },
  { word: "nearly", start_time: "00:00:07.310", end_time: "00:00:07.680", confidence: null },
  { word: "two", start_time: "00:00:07.680", end_time: "00:00:07.950", confidence: null },
  { word: "million", start_time: "00:00:07.950", end_time: "00:00:08.340", confidence: null },
  { word: "dollars", start_time: "00:00:08.340", end_time: "00:00:08.720", confidence: null },
  { word: "a", start_time: "00:00:08.720", end_time: "00:00:08.880", confidence: null },
  { word: "year.", start_time: "00:00:08.880", end_time: "00:00:09.250", confidence: null },
  // Beat «3»
  { word: "That", start_time: "00:00:09.250", end_time: "00:00:09.510", confidence: null },
  { word: "was", start_time: "00:00:09.510", end_time: "00:00:09.760", confidence: null },
  { word: "more", start_time: "00:00:09.760", end_time: "00:00:10.020", confidence: null },
  { word: "than", start_time: "00:00:10.020", end_time: "00:00:10.250", confidence: null },
  { word: "the", start_time: "00:00:10.250", end_time: "00:00:10.450", confidence: null },
  { word: "average", start_time: "00:00:10.450", end_time: "00:00:10.850", confidence: null },
  { word: "Dunkin'", start_time: "00:00:10.850", end_time: "00:00:11.250", confidence: null },
  { word: "or", start_time: "00:00:11.250", end_time: "00:00:11.450", confidence: null },
  { word: "Five", start_time: "00:00:11.450", end_time: "00:00:11.780", confidence: null },
  { word: "Guys.", start_time: "00:00:11.780", end_time: "00:00:12.190", confidence: null },
  // Beat «4»
  { word: "And", start_time: "00:00:12.190", end_time: "00:00:12.420", confidence: null },
  { word: "almost", start_time: "00:00:12.420", end_time: "00:00:12.810", confidence: null },
  { word: "4", start_time: "00:00:12.810", end_time: "00:00:13.100", confidence: null },
  { word: "times", start_time: "00:00:13.100", end_time: "00:00:13.480", confidence: null },
  { word: "what", start_time: "00:00:13.480", end_time: "00:00:13.710", confidence: null },
  { word: "a", start_time: "00:00:13.710", end_time: "00:00:13.850", confidence: null },
  { word: "typical", start_time: "00:00:13.850", end_time: "00:00:14.290", confidence: null },
  { word: "American", start_time: "00:00:14.290", end_time: "00:00:14.750", confidence: null },
  { word: "bakery", start_time: "00:00:14.750", end_time: "00:00:15.180", confidence: null },
  { word: "made.", start_time: "00:00:15.180", end_time: "00:00:15.550", confidence: null },
  // Beat «5»
  { word: "Then", start_time: "00:00:15.550", end_time: "00:00:15.820", confidence: null },
  { word: "crumble", start_time: "00:00:15.820", end_time: "00:00:16.210", confidence: null },
  { word: "started", start_time: "00:00:16.210", end_time: "00:00:16.620", confidence: null },
  { word: "expanding", start_time: "00:00:16.620", end_time: "00:00:17.150", confidence: null },
  { word: "faster", start_time: "00:00:17.150", end_time: "00:00:17.550", confidence: null },
  { word: "than", start_time: "00:00:17.550", end_time: "00:00:17.780", confidence: null },
  { word: "even", start_time: "00:00:17.780", end_time: "00:00:18.090", confidence: null },
  { word: "McDonald's", start_time: "00:00:18.090", end_time: "00:00:18.680", confidence: null },
  { word: "had.", start_time: "00:00:18.680", end_time: "00:00:19.010", confidence: null },
  // Beat «6»
  { word: "By", start_time: "00:00:19.010", end_time: "00:00:19.250", confidence: null },
  { word: "February", start_time: "00:00:19.250", end_time: "00:00:19.790", confidence: null },
  { word: "2024,", start_time: "00:00:19.790", end_time: "00:00:20.320", confidence: null },
  { word: "it", start_time: "00:00:20.320", end_time: "00:00:20.510", confidence: null },
  { word: "had", start_time: "00:00:20.510", end_time: "00:00:20.750", confidence: null },
  { word: "opened", start_time: "00:00:20.750", end_time: "00:00:21.140", confidence: null },
  { word: "its", start_time: "00:00:21.140", end_time: "00:00:21.360", confidence: null },
  { word: "1,000th", start_time: "00:00:21.360", end_time: "00:00:21.920", confidence: null },
  { word: "store.", start_time: "00:00:21.920", end_time: "00:00:22.400", confidence: null },
  // Beat «7»
  { word: "It", start_time: "00:00:22.400", end_time: "00:00:22.610", confidence: null },
  { word: "took", start_time: "00:00:22.610", end_time: "00:00:22.890", confidence: null },
  { word: "less", start_time: "00:00:22.890", end_time: "00:00:23.150", confidence: null },
  { word: "than", start_time: "00:00:23.150", end_time: "00:00:23.390", confidence: null },
  { word: "7", start_time: "00:00:23.390", end_time: "00:00:23.720", confidence: null },
  { word: "years.", start_time: "00:00:23.720", end_time: "00:00:24.150", confidence: null },
  // Beat «8»
  { word: "And", start_time: "00:00:24.150", end_time: "00:00:24.380", confidence: null },
  { word: "the", start_time: "00:00:24.380", end_time: "00:00:24.590", confidence: null },
  { word: "growth", start_time: "00:00:24.590", end_time: "00:00:24.980", confidence: null },
  { word: "kept", start_time: "00:00:24.980", end_time: "00:00:25.290", confidence: null },
  { word: "going.", start_time: "00:00:25.290", end_time: "00:00:25.720", confidence: null },
  // Beat «9»
  { word: "By", start_time: "00:00:25.720", end_time: "00:00:25.950", confidence: null },
  { word: "May", start_time: "00:00:25.950", end_time: "00:00:26.280", confidence: null },
  { word: "2025,", start_time: "00:00:26.280", end_time: "00:00:26.820", confidence: null },
  { word: "investors", start_time: "00:00:26.820", end_time: "00:00:27.390", confidence: null },
  { word: "valued", start_time: "00:00:27.390", end_time: "00:00:27.810", confidence: null },
  { word: "crumble", start_time: "00:00:27.810", end_time: "00:00:28.210", confidence: null },
  { word: "at", start_time: "00:00:28.210", end_time: "00:00:28.400", confidence: null },
  { word: "2", start_time: "00:00:28.400", end_time: "00:00:28.690", confidence: null },
  { word: "billion", start_time: "00:00:28.690", end_time: "00:00:29.120", confidence: null },
  { word: "dollars.", start_time: "00:00:29.120", end_time: "00:00:29.620", confidence: null },
  // Beat «10»
  { word: "It", start_time: "00:00:29.620", end_time: "00:00:29.810", confidence: null },
  { word: "even", start_time: "00:00:29.810", end_time: "00:00:30.120", confidence: null },
  { word: "had", start_time: "00:00:30.120", end_time: "00:00:30.380", confidence: null },
  { word: "more", start_time: "00:00:30.380", end_time: "00:00:30.650", confidence: null },
  { word: "TikTok", start_time: "00:00:30.650", end_time: "00:00:31.120", confidence: null },
  { word: "followers", start_time: "00:00:31.120", end_time: "00:00:31.650", confidence: null },
  { word: "than", start_time: "00:00:31.650", end_time: "00:00:31.890", confidence: null },
  { word: "Starbucks", start_time: "00:00:31.890", end_time: "00:00:32.450", confidence: null },
  { word: "and", start_time: "00:00:32.450", end_time: "00:00:32.650", confidence: null },
  { word: "Nike", start_time: "00:00:32.650", end_time: "00:00:33.050", confidence: null },
  { word: "combined.", start_time: "00:00:33.050", end_time: "00:00:33.600", confidence: null },
  // Beat «32» (Section 1. Backstory)
  { word: "In", start_time: "00:01:12.000", end_time: "00:01:12.210", confidence: null },
  { word: "September", start_time: "00:01:12.210", end_time: "00:01:12.780", confidence: null },
  { word: "2017,", start_time: "00:01:12.780", end_time: "00:01:13.310", confidence: null },
  { word: "two", start_time: "00:01:13.310", end_time: "00:01:13.590", confidence: null },
  { word: "cousins,", start_time: "00:01:13.590", end_time: "00:01:14.080", confidence: null },
  { word: "Jason", start_time: "00:01:14.080", end_time: "00:01:14.490", confidence: null },
  { word: "McGowan", start_time: "00:01:14.490", end_time: "00:01:15.020", confidence: null },
  { word: "and", start_time: "00:01:15.020", end_time: "00:01:15.220", confidence: null },
  { word: "Sawyer", start_time: "00:01:15.220", end_time: "00:01:15.650", confidence: null },
  { word: "Hemsley,", start_time: "00:01:15.650", end_time: "00:01:16.180", confidence: null },
  { word: "were", start_time: "00:01:16.180", end_time: "00:01:16.410", confidence: null },
  { word: "days", start_time: "00:01:16.410", end_time: "00:01:16.750", confidence: null },
  { word: "away", start_time: "00:01:16.750", end_time: "00:01:17.080", confidence: null },
  { word: "from", start_time: "00:01:17.080", end_time: "00:01:17.320", confidence: null },
  { word: "opening", start_time: "00:01:17.320", end_time: "00:01:17.760", confidence: null },
  { word: "Crumbl's", start_time: "00:01:17.760", end_time: "00:01:18.290", confidence: null },
  { word: "first", start_time: "00:01:18.290", end_time: "00:01:18.620", confidence: null },
  { word: "shop", start_time: "00:01:18.620", end_time: "00:01:18.960", confidence: null },
  { word: "in", start_time: "00:01:18.960", end_time: "00:01:19.150", confidence: null },
  { word: "Logan,", start_time: "00:01:19.150", end_time: "00:01:19.580", confidence: null },
  { word: "Utah.", start_time: "00:01:19.580", end_time: "00:01:20.050", confidence: null },
  // Beat «33» (Testing hyphenated split "month", "to", "month" in transcript vs "month-to-month" in script)
  { word: "They", start_time: "00:01:20.050", end_time: "00:01:20.310", confidence: null },
  { word: "had", start_time: "00:01:20.310", end_time: "00:01:20.580", confidence: null },
  { word: "one", start_time: "00:01:20.580", end_time: "00:01:20.850", confidence: null },
  { word: "cookie,", start_time: "00:01:20.850", end_time: "00:01:21.320", confidence: null },
  { word: "one", start_time: "00:01:21.320", end_time: "00:01:21.590", confidence: null },
  { word: "small", start_time: "00:01:21.590", end_time: "00:01:21.950", confidence: null },
  { word: "storefront,", start_time: "00:01:21.950", end_time: "00:01:22.580", confidence: null },
  { word: "and", start_time: "00:01:22.580", end_time: "00:01:22.780", confidence: null },
  { word: "a", start_time: "00:01:22.780", end_time: "00:01:22.920", confidence: null },
  { word: "month", start_time: "00:01:22.920", end_time: "00:01:23.180", confidence: null },
  { word: "to", start_time: "00:01:23.180", end_time: "00:01:23.380", confidence: null },
  { word: "month", start_time: "00:01:23.380", end_time: "00:01:23.680", confidence: null },
  { word: "lease.", start_time: "00:01:23.680", end_time: "00:01:24.150", confidence: null }
];
