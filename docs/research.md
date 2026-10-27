# Research behind the balance rules

This is the evidence each rule in `src/core/rules/` is built on. Every finding in the app is tagged with a **basis**:

| Basis | Meaning |
|---|---|
| well-supported | Backed by theory *and* empirical or corpus evidence |
| convention | Widely taught or observed in charts, but not experimentally tested |
| speculative | A reasonable extension; no direct evidence found |

No validated, quantitative "balance score" for song form exists in the literature (searched: music theory, music cognition, MIR). The app therefore reports findings with reasons, not one number. Penalty sizes are design choices.

## Phrase level: R1–R3 (`rules/phrase.ts`)

- **4-bar hypermeter is the pop/rock norm.** Pop and rock favor quadruple hypermeter "more often than not". 4- and 8-bar phrases are the prototype that expanded or contracted phrases deviate from.
  - Rothstein, *Phrase Rhythm in Tonal Music* (1989)
  - Temperley (2018), as cited in [Cambridge, *Popular Music*](https://resolve.cambridge.org/core/product/22D74F53CFF118FFF2545ACE5172A212/core-reader)
  - [Open Music Theory: hypermeter](https://viva.pressbooks.pub/openmusictheory/chapter/hypermeter_v2)
- **Listeners try to fit music to a 4-bar cycle.** Love models disruptions as *interruption* (early hyperdownbeat, as in a 7-bar section) or *deferral* (late, as in a 9-bar section). This is a theoretical model; no controlled study shows odd lengths are rated "unbalanced".
  - [Love, MTO 21.3 (2015)](https://www.mtosmt.org/issues/mto.15.21.3/mto.15.21.3.love.php)
- **Odd is unstable, not wrong.** Pattison treats instability as motion: useful for pushing forward (pre-chorus, bridge), harmful where the song should feel settled. This is the basis for role weighting: chorus, A section and last verse ×1.5; verse ×1; pre-chorus, bridge, solo and interlude ×0.5; intro and outro ×0.25.
  - Pattison, *Writing Better Lyrics* / Berklee *Songwriting: Writing the Lyrics* ([course](https://www.coursera.org/learn/songwriting-lyrics))
- **Ways to fix or justify an odd length** (Rothstein, Pattison). These drive the fix buttons and the `!` intentional marker.
  - Expansion or truncation (add or cut a bar)
  - A turnaround or tag bar
  - A pickup bar
  - Elision into the next downbeat
  - Pairing with a balancing odd section
- **Compensation.** Two adjacent irregular sections that sum to whole 4-bar phrases (7 + 5) drop one severity level. This is convention-derived: Rothstein notes that elisions hide odd lengths inside even groupings. In the corpora:
  - **Billboard:** of 935 adjacent pairs of odd sections, 36% add up to whole phrases. That's no more than chance (36% from the mix of odd lengths, 39% with each song's lengths shuffled).
  - **Harmonix:** of 563 pairs, 49% add up to whole phrases, against 35% and 43% by chance.

  So modern hits seem to pair odd sections on purpose somewhat; older hits show no sign of it. The softening stays.

## Repetition: R4

- Repeated sections set up an expectation of their own length (an extension of Pattison's repetition and expectation ideas). A verse, pre-chorus or chorus that changes length when it returns gets a finding.
- **Where the change sits matters, and the corpora measure it.** `repeats()` in `stats.ts` places each on-grid repeat (first, middle or last) and compares it with its role's most common length. The corpus files count how often each change happens. Hits often change the last one and rarely the first:

  | Change | Billboard | Harmonix |
  |---|---|---|
  | Last chorus longer | 14% | 6% |
  | Last chorus doubled or halved | 8% | 9% |
  | Last verse shorter | 3% | 6% |
  | Last verse doubled or halved | 4% | 11% |
  | First verse longer | 0.4% | 0.4% |
  | First chorus longer | 0.3% | 3.5% |

  Shares are of songs with two or more on-grid sections of that role.
- A change that fewer than 3% of the era's songs make at that position is a warning; otherwise it's a note with the real share. Doubled or halved lengths keep the grid, so they are always notes, and a doubled final chorus is not flagged at all.
- Basis: **convention**, now measured; it stays **speculative** for roles with fewer than 50 corpus sections.
- Shares count songs, not sections, so a song with several middle choruses counts once.
- **Effect:** R4 warnings on real hits fell from 13.1% to 4.7% of Billboard songs and from 21.7% to 5.6% of Harmonix songs (each scored against its own era).

## Macro form: R7–R10 (`rules/macro.ts`)

Checked against both corpora, each R7 and R9 check fires on 5% of hits or fewer: bridge after only one chorus 5%, no chorus after the bridge 2–5%, chorus only once 1–3%, three verses before the first chorus 2%. Hits rarely do these things, so they stay warnings.

- **Verse–chorus dominance.** Among year-end Top 20 hits, verse–chorus forms went from about 29% (1960–64) to about 69% (1970–74). Pre-choruses became common by the 1980s.
  - [Summach, MTO 17.3 (2011)](https://mtosmt.org/issues/mto.11.17.3/mto.11.17.3.summach.html)
  - [Nobile, MTO 28.3 (2022)](https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html)
- **Time to first chorus (R8).**
  - Instrumental intros on US top-10 hits fell from about 20 seconds (1986) to about 5 seconds (2015). [Léveillé Gauvin, *Musicae Scientiae* 22(3), 2018](https://pure.etsmtl.ca/en/publications/drawing-listener-attention-in-popular-music-testing-five-musical-/)
  - Industry reports put the first chorus at about 30–45 seconds in recent hits. [Hit Songs Deconstructed](https://reports.hitsongsdeconstructed.com/articles/hip-hop-vs-pop-which-hooks-you-faster/)
  - **Long intro:** an opening intro longer than 9 in 10 of the era's intros gets a note: over 0:26 for Billboard (median 0:11) and over 0:28 for Harmonix (median 0:13). An intro of 4 bars or fewer never does: at a slow tempo it can run that long, but there is no shorter phrase to cut it to. The old fixed limit (over 8 bars or 20 s) noted 21% of hits; now it notes 9%. Harmonix intros are no shorter than Billboard's, unlike Léveillé Gauvin's top-10 trend. Two likely reasons: Harmonix's "intro" label counts instrumental sections, not time until the vocal, and its songs are not all top-10 hits.
  - **First chorus:** the limits come from the chosen era's corpus, measured at each song's own tempo. A first chorus later than 3 in 4 hits gets a note, and later than 9 in 10 a warning. Billboard: note after 1:00, warning after 1:22 (median 0:43). Harmonix: note after 0:55, warning after 1:11 (median 0:42). These replaced fixed limits of 45 s and 60 s, which warned on 20% of Billboard and 17% of Harmonix songs; now it is 8.4% and 9.6%. The finding offers to cut the intro to 4 bars, or to halve the longest 16+ bar verse before the chorus, when halving leaves whole phrases. It offers a fix only if that fix brings the chorus under the limit it crossed. If neither cut does on its own, it offers both together. When the long-intro note already offers the 4-bar intro, this finding does not repeat it.
- **3 or more verses before the chorus (R7).** Fine in strophic and AABA forms, where stacked verses are the norm. In verse–chorus form it delays the payoff. This is convention; no listener-fatigue study was found.
- **Contrast after repetition (R9).**
  - In AABA, A is stated twice before B and returns after it ([Open Music Theory, AABA](https://viva.pressbooks.pub/openmusictheory/chapter/aaba-and-strophic-form/)).
  - In verse–chorus form, the bridge conventionally follows the second chorus and leads back to a chorus.
- **Bridge position (R10).** Placement at 2/3 or the golden ratio is often claimed. In the Billboard corpus, bridges that follow two choruses start at a median of 52% of the song (10th–90th percentile 37–70%, n = 162). The app adds a note outside that range, which is read from `src/core/corpus/billboard.json`. A corpus study of post-2000 pop puts new-material bridges about two-thirds of the way through ([Schwitzgebel, MTO 31.1 (2025)](https://mtosmt.org/issues/mto.25.31.1/mto.25.31.1.schwitzgebel.php)).
- **Label ambiguity.** Expert annotators agree on section labels only about 67% of the time ([de Clercq, MTO 23.3](https://mtosmt.org/issues/mto.17.23.3/mto.17.23.3.de_clercq.html)). Label sections however makes sense to you; the rules key off role, not exact naming.

## Notation standard

No standard one-line notation for song form exists. Analysts write forms either as letters (AABA) or as function labels, often in a table with bar counts ([Open Music Theory](https://pressbooks.nebraska.edu/openmusictheory/?p=520), [Puget Sound Music Theory](https://musictheory.pugetsound.edu/mt21c/VerseChorusForm.html)). Labelling also varies: one analyst's pre-chorus is another's "verse part b".

The closest documented, machine-readable standard is the **SALAMI annotation format**. The McGill Billboard dataset extends it with barlines. This app adopts both:

- **Function vocabulary:** intro, verse, pre-chorus, chorus, bridge, solo, instrumental, interlude, transition, outro and coda come from the SALAMI Annotator's Guide function list, along with its synonyms (introduction, refrain, trans, pre-verse). Other SALAMI labels (head, main theme, theme, break and so on) are mapped to the nearest function on import.
  - [SALAMI Annotator's Guide](https://github.com/DDMAL/salami-data-public/blob/master/SALAMI%20Annotator%20Guide.pdf), DDMAL/salami-data-public, CC0
  - The JAMS `segment_salami_function` namespace is the same vocabulary as a JSON schema ([schema](https://raw.githubusercontent.com/marl/jams/master/jams/schemata/namespaces/segment/salami_function.json)).
- **Letters:** SALAMI's uppercase letters describe musical similarity, separately from function. That is why AABA is written with function labels (verse verse bridge verse), and the app derives the letters from the form.
- **File format:**
  - Each line is `<seconds><TAB><comma-separated labels>`.
  - Files start with optional `# title / # artist / # metre / # tonic` headers.
  - Billboard files add bars as `| A:min | C:maj |`. The number of barlines gives the section length directly.
  - `silence` and `end` frame the song.
  - [McGill Billboard Project](https://ddmal.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/), CC0
- **What the app adds:** the quick-entry codes (`Vs8`, `Pre4`) and the `!` on-purpose marker. They are shorthand that converts losslessly into the standard, except for `!`, which the standard cannot express.
- **Test fixtures:** `src/core/__tests__/fixtures/` holds one real file from each dataset.

## Corpus measurements (`src/core/corpus.ts`)

`node scripts/corpus-stats.ts <billboard-dir>` reads the McGill Billboard salami_chords files (739 distinct songs after removing songs annotated twice; Hot 100, 1958–1991). It writes aggregate counts to `src/core/corpus/billboard.json`: section lengths per role, role-to-role transitions, bridge position and bars before the first chorus. The raw files are not stored in the repo. One source of the files is `OriginalData/SalamiFiles` in the CoCoPops-Billboard-legacy repository.

**Section lengths.** Share of sections whose length leaves 0, 1, 2 or 3 bars over whole 4-bar phrases:

| Role | n | On the grid | +1 | +2 | +3 (a bar short) |
|---|---|---|---|---|---|
| Verse | 2065 | 73% | 9% | 12% | 6% |
| Chorus | 2024 | 66% | 10% | 16% | 8% |
| Pre-chorus | 286 | 69% | 10% | 18% | 4% |
| Bridge | 386 | 67% | 12% | 13% | 8% |
| Intro | 712 | 59% | 14% | 21% | 6% |
| Outro | 322 | 58% | 18% | 16% | 8% |

The most common lengths are 8 and 16 bars for verses (28% and 26%) and 8 bars for choruses (35%). 87% of songs have at least one section off the grid, and 51% have three or more. Some of this is annotation noise (pickups and elisions counted as bars), but most is real.

**How R2 uses it.** A section's *rarity* is how much less often its role misses the grid that way than lands on it, in bits (a 7-bar chorus: 66% vs 8%, about 3 bits). Rarity × role weight scores the section, and every score of 1.25 or more gets a finding. The song's scores add up (compensated pairs count half, `!` sections not at all). In a song above 16 those findings are problems; 90% of corpus songs stay under 16. Below that, a section warns only if its score beats the most irregular section of 3 in 4 of the era's hits. `scripts/corpus-stats.ts` measures this cutoff (`warnScore`): 4.52 for classic norms and 5.51 for modern. Lower scores are notes. A lone 7-bar chorus still warns in both eras. A lone 7-bar verse or 6-bar pre-chorus is a note. Before this cutoff, R2 warned on 56% of Billboard songs and 48% of Harmonix songs; now it warns on 19% of each. The role weights are still Pattison's; the corpus only shows how often a role misses the grid, not how much listeners mind.

**Song length (R12).** A song longer than 9 in 10 of the era's gets a note: over 4:39 for Billboard and over 4:30 for Harmonix. This replaced a fixed 5:30 limit and the unsourced "most pop songs run 2:30–4:00". It notes 10% of hits, by construction.

**Song limit and ranking.** `scripts/corpus-stats.ts` scores every corpus song with the same `gridScores` the rule uses, and stores the sorted totals (`songIrregularity`). This takes a second pass, because scoring needs the length counts just measured. The Unbalanced limit is the era's 90th percentile of those totals: 15.9 for Billboard and 15.8 for Harmonix, close to the 16 first set by hand. The verdict line shows where a song ranks, e.g. "More regular than 35% of modern hits" for a pop form with one 7-bar chorus. Every section is on the grid in 14% of Billboard songs and 28% of Harmonix songs.

**Check against real hits.** `BILLBOARD_DIR=<dir> npm test` runs the engine over every corpus song at its own tempo and meter. A real hit is the closest thing to a known-balanced song, so the share called Unbalanced acts as a false-alarm rate:

| | Balanced | Mostly balanced | Unbalanced |
|---|---|---|---|
| Hand-set weights (before) | 18.1% | 50.7% | 31.1% |
| Corpus-scored R2 | 23.0% | 67.4% | 9.6% |
| Now, after all the tuning below | 57.6% | 32.5% | 9.9% |

The warnings that remain on Billboard hits are mostly R2 (19% of songs), R9 (13%), R8 (8%) and R4 (5%), after R2, R4 and R8 were retuned. R12 adds a note on 10%. Before that, R2 was 56%, R8 20% and R4 13%.

**Rare hand-offs (R11).** `billboard.json` counts which role follows which, including the song's start and end. A hand-off that fewer than 1% of corpus sections of that role make gets a note with its real share and what usually comes next (for example "0.5% of choruses go straight to a pre-chorus; most lead into a verse"). Roles with fewer than 50 corpus sections are skipped. So is a hand-off another rule already explains, such as R9's bridge that ends the song. On real hits, 6.4% of songs get one of these notes. They are notes only, so they don't change the verdict. Bridge → outro is common (4% of bridges), so it is not flagged. The note offers to insert whatever most often follows the first section (chorus → pre-chorus offers "Put a verse between them"). It only offers this when the inserted section leads on to the next one often enough in the corpus.

### Second corpus: the Harmonix Set

`node scripts/corpus-stats.ts <harmonixset>/dataset` writes `src/core/corpus/harmonix.json` in the same shape as the Billboard file. The source is the [Harmonix Set](https://github.com/urinieto/harmonixset) (Nieto et al., ISMIR 2019): 912 Western pop songs, mostly from the 1990s–2010s, with hand-annotated beats, downbeats and segments.

- **License:** MIT License, Copyright (c) 2019 Oriol Nieto. Publishing and redistributing derived data is allowed. The notice must go with copies or substantial portions; only aggregate counts are kept here. The authors ask that published results cite the paper.
- **Bars:** each segment's bars are the downbeats inside it, so lengths are counted, not read off chord lines. Segments shorter than a bar (pickups, fills) are dropped. The tempo is measured from the downbeats.
- **Labels:** free-form labels (`verse2`, `altchorus`, `gtrbreak`) are read by their core word (`HARMONIX_ROLES`). `postchorus` is its own type. Unrecognised labels are interludes.
- **Years:** the metadata has no release year, only MusicBrainz IDs, so the two corpora can't be compared by exact decade.

| | Billboard (1958–1991) | Harmonix (mostly 1990s–2010s) |
|---|---|---|
| Songs | 739 | 912 |
| Verses on the 4-bar grid | 73% | 85% |
| Choruses on the grid | 66% | 81% |
| Pre-choruses on the grid | 69% | 84% |
| Most common chorus length | 8 bars (35%) | 8 bars (52%) |
| Bridge start (after two choruses), median and 10th–90th percentile | 52% (37–70%) | 63% (49–74%) |
| First chorus, median and 90th percentile | 43 s, 82 s | 42 s, 71 s |
| Songs with a post-chorus | no label | 197 (22%) |

Newer songs keep closer to the grid, and their bridges come later, near Schwitzgebel's two-thirds.

**Check on songs the thresholds never saw.** The engine is tuned on Billboard. On Harmonix it calls 30.0% of songs Balanced, 66.4% Mostly balanced and 3.5% Unbalanced (`HARMONIX_DIR=<dir> npm test`), so the 10% false-alarm target holds outside the tuning set. The most common warnings there are R2 on choruses (35% of songs), R4 (22%; 6.5% after the position-aware tuning below), R8 (17%; 9.6% after its limits came from the corpus) and R2 on verses (18%). R10 gives a note on 12% of songs, because the window comes from Billboard's earlier bridges.

### Era setting

The toolbar's era picker (`Options.era`, `corpusFor` in `corpus.ts`) chooses which corpus R2, R4, R8, R10, R11 and R12 compare against: **Modern hits** (Harmonix, the default) or **Classic hits** (Billboard). Each era's limits are measured from its own corpus, so about 10% of its songs come out Unbalanced:

| Songs scored | Era norms | Balanced | Mostly balanced | Unbalanced |
|---|---|---|---|---|
| Billboard | Classic | 57.6% | 32.5% | 9.9% |
| Billboard | Modern | 47.8% | 30.2% | 22.1% |
| Harmonix | Modern | 56.6% | 33.4% | 10.0% |
| Harmonix | Classic | 59.1% | 37.4% | 3.5% |

Modern norms are stricter about the grid, because modern songs miss it less often. Judged by them, a third of older hits get an R11 note and a fifth come out Unbalanced. A lone 9-bar chorus is an example: under classic norms it gets a note, and under modern norms a warning.

**Skips follow structure.** Spotify skip timing tracks song structure, consistently across users and dates ([Montecchio, Roy & Pachet, PLOS ONE 15(9), 2020](https://arxiv.org/abs/1903.06008)). This supports R8's time-based framing.

## Known gaps / next steps

- **Decades.** The era setting uses whole corpora, not years. For a decade-by-decade comparison, look up release years from the Harmonix MusicBrainz IDs.
- **Post-chorus** is a section type (`Post`), because 22% of Harmonix songs have one (Nobile, MTO 28.3; BMI describe the trend). The SALAMI function list has no post-chorus label; files use `post-chorus` and the app reads and writes that. Billboard has no post-choruses, so under classic norms the R11 hand-off notes skip them (fewer than 50 corpus sections). Harmonix post-choruses are 8 bars (47%) or 4 bars (29%) and follow a chorus 86% of the time.
- **Drop.** Practitioners describe the drop in dance-pop, often in the post-chorus slot. No corpus here labels it.
- **Genre.** The norms are Western pop/rock. Blues, strophic and AABA are recognised as form types; other genres (EDM drops, hip-hop, prog) are not modelled.
- **Elisions.** A bar count alone cannot show an elision. Mark the section with `!` instead.
