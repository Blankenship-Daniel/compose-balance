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
- **Compensation.** Two adjacent irregular sections that sum to whole 4-bar phrases (7 + 5) drop one severity level. This is convention-derived: Rothstein notes that elisions hide odd lengths inside even groupings.

## Repetition: R4

- Repeated sections set up an expectation of their own length. A section that changes length when it returns is flagged. Doubled or halved lengths only produce a note, and an extended final chorus is exempt (a common convention).
- Basis: **speculative** (an extension of Pattison's repetition and expectation ideas).

## Macro form: R7–R10 (`rules/macro.ts`)

- **Verse–chorus dominance.** Among year-end Top 20 hits, verse–chorus forms went from about 29% (1960–64) to about 69% (1970–74). Pre-choruses became common by the 1980s.
  - [Summach, MTO 17.3 (2011)](https://mtosmt.org/issues/mto.11.17.3/mto.11.17.3.summach.html)
  - [Nobile, MTO 28.3 (2022)](https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html)
- **Time to first chorus (R8).**
  - Instrumental intros on US top-10 hits fell from about 20 seconds (1986) to about 5 seconds (2015). [Léveillé Gauvin, *Musicae Scientiae* 22(3), 2018](https://pure.etsmtl.ca/en/publications/drawing-listener-attention-in-popular-music-testing-five-musical-/)
  - Industry reports put the first chorus at about 30–45 seconds in recent hits. [Hit Songs Deconstructed](https://reports.hitsongsdeconstructed.com/articles/hip-hop-vs-pop-which-hooks-you-faster/)
  - The app gives a note above 45 s and a warning above 60 s, at the chosen tempo.
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

**How R2 uses it.** A section's *rarity* is how much less often its role misses the grid that way than lands on it, in bits (a 7-bar chorus: 66% vs 8%, about 3 bits). Rarity × role weight scores the section. A score of 1.25 or more is a warning. The song's scores add up (compensated pairs count half, `!` sections not at all), and a song above 16 turns its warnings into problems. 90% of corpus songs stay under 16. The role weights are still Pattison's; the corpus only shows how often a role misses the grid, not how much listeners mind.

**Check against real hits.** `BILLBOARD_DIR=<dir> npm test` runs the engine over every corpus song at its own tempo and meter. A real hit is the closest thing to a known-balanced song, so the share called Unbalanced acts as a false-alarm rate:

| | Balanced | Mostly balanced | Unbalanced |
|---|---|---|---|
| Hand-set weights (before) | 18.1% | 50.7% | 31.1% |
| Corpus-scored R2 (now) | 23.0% | 67.4% | 9.6% |

The warnings that remain on real hits are mostly R2 (56% of songs), R8 first chorus after 60 s (20%; these are 1958–1991 songs, and the 60 s limit reflects recent hits), R4 (13%) and R9 (13%).

**Skips follow structure.** Spotify skip timing tracks song structure, consistently across users and dates ([Montecchio, Roy & Pachet, PLOS ONE 15(9), 2020](https://arxiv.org/abs/1903.06008)). This supports R8's time-based framing.

## Known gaps / next steps

- **Era.** The corpus ends in 1991. A modern set (the [Harmonix Set](https://github.com/urinieto/harmonixset): 912 pop songs with downbeats and segments; it requires agreeing to a license) would update the length and timing figures, and would make an era setting possible.
- **Transitions.** `billboard.json` already counts role-to-role transitions. A rule could flag improbable hand-offs (bridge → outro) with their real percentage.
- **Post-chorus and drop.** Common in recent pop (Nobile, MTO 28.3; BMI), but SALAMI has no label for them. On import they map to interlude.
- **Genre.** The norms are Western pop/rock. Blues, strophic and AABA are recognised as form types; other genres (EDM drops, hip-hop, prog) are not modelled.
- **Elisions.** A bar count alone cannot show an elision. Mark the section with `!` instead.
