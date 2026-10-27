# compose-balance

A sandbox for sketching song forms and checking whether they're balanced. Type a form, see it as 4-bar phrases, hear it with a click and chords, and get findings with reasons and one-click fixes.

```
npm install
npm run dev        # http://localhost:5173
```

## Notation

Section names follow the **SALAMI function vocabulary**, the label set used by the SALAMI and McGill Billboard song-structure datasets. Files can be opened and saved in their annotation format. Details and sources are in [docs/research.md](docs/research.md#notation-standard).

Quick entry with **Text**:

```
In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Out4
intro4 verse8 pre-chorus4 chorus8 bridge8 outro4   # same thing, in SALAMI labels
```

Codes are short words, never single capitals, so a form can't be misread as chords (C, B) or Roman numerals (I, V). Older single-letter codes (`I4 V8 C8`) still work and are rewritten to the new codes.

| Code | SALAMI label |
|---|---|
| `In` | intro |
| `Vs` | verse |
| `Pre` | pre-chorus |
| `Ch` | chorus |
| `Post` | post-chorus (not a SALAMI function, but Billboard files use the label) |
| `Br` | bridge |
| `Solo` | solo |
| `Inst` | instrumental |
| `Inter` | interlude |
| `Tr` | transition |
| `Out` | outro |
| `Coda` | coda |

- **Bar count:** add the length in bars after the label. Without a number, the usual length is used.
- **On purpose:** `!` marks an irregular length as deliberate (`Ch7!`). This app adds the marker; SALAMI has no equivalent.
- **Letters:** SALAMI uses letters (A, B, A') to mean "same or different music". Letters are not section names, so write AABA as `Vs8 Vs8 Br8 Vs8`. Exported files include these letters.

**Import or export** (in the ⋯ menu) works in both directions:

- **Export:** writes the form in the McGill Billboard format, with a header, one line per 4-bar phrase, and barlines.
- **Import:** reads Billboard files, counting bars from the barlines, and plain SALAMI files, estimating bars from timestamps at the current tempo.
- **Not kept on import:** the song's real chords and title. The chart uses its own chord loop for each section type.

## What it checks

| Rule | Checks | Basis |
|---|---|---|
| R2 | Section length against the 4-bar phrase grid, scored by how rarely hit songs miss the grid that way, weighted by role. It warns only on sections more irregular than 3 in 4 of the era's hits have, and a song turns unbalanced only when its odd lengths add up to more than 90% of hits | well-supported (corpus) |
| R4 | Repeated sections that change length; warns only where hits rarely change (a longer first verse), notes where they often do (a stretched last chorus) | convention (corpus) |
| R7 | 3 or more verses before the first chorus (verse–chorus forms only) | convention |
| R8 | Long intro; seconds to first chorus at your tempo, against when the era's hits reach it (note past 3 in 4, warning past 9 in 10) | convention (corpus) |
| R9 | Chorus appears only once; bridge too early or not resolved; AABA order | convention |
| R10, R12 | Bridge position against where the era's bridges start; songs longer than 9 in 10 of the era's (notes only) | convention (corpus) |
| R11 | A hand-off fewer than 1% of Billboard hits make, such as chorus into pre-chorus or ending on a pre-chorus (notes only) | convention (corpus) |

Verdict (beside it, how the song's phrase lengths rank among the era's hits, e.g. "More regular than 35% of modern hits"):

- **Unbalanced:** any problem.
- **Mostly balanced:** warnings only.
- **Balanced:** notes only, or nothing.

Sources and caveats are in [docs/research.md](docs/research.md).

## Using it

**The shape table** (the main view) is the kit's `<lattice-board>`: the song as pieces on the lattice, which the board itself lets you drag, step, turn, glue, break apart and throw away. Every bar is a shape made of the lattice's triangles, one shape and colour per section type:

| Section | One bar | Colour |
|---|---|---|
| Bridge | 1 triangle | green |
| Verse | 2 triangles (a diamond) | blue |
| Pre-chorus | 3 triangles (half a hexagon) | red |
| Intro | a big triangle (4 triangles) | orange |
| Outro | a long rhombus (4 triangles) | tan, solid |
| Chorus | the whole hexagon | yellow |
| Solo | the whole hexagon | yellow, solid |
| Post-chorus | 2 triangles (a diamond) | white, tan side |
| Instrumental, interlude, transition, coda | a trapezoid, a rhombus, a triangle and a big triangle | white |

- **Sections:** a section is a piece's parts of one colour that touch, and its bars are its triangles over its bar's size. The board's woods are the section colours (`--color-tree-wood-0…4` and `--color-tree-olive` on the element). It has eight colours for twelve types, so the five rarer types share white and which one a white section is lives beside the pieces (`Layout.roles`, carried across moves, glues and breaks).
- **Pulling a bar off:** Alt-drag (Option-drag on a Mac) lifts one bar off a section, in its own shape (a diamond from a verse, half a hexagon from a pre-chorus), and carries it whole. The board's own Alt-drag pulls one *part*, and here a part is one triangle, so on an Alt press the app first makes the bar under the pointer a piece of its own where it stands (`splitBar`) and hands the board the press without Alt, so the board lifts the whole bar. Let go where it started, and it goes back into its section. A chorus's part is a whole cell, already a bar, so the board pulls it its own way. If a pull still comes through as one triangle, the app swaps in the whole bar on drop (`pullBar`).
- **Whole bars only:** every change the board makes is read back into the song; one that would leave part of a bar (breaking a verse into single triangles, pulling one triangle off a pre-chorus) is refused with the board's cancelable `change` event, and the board puts the pieces back.
- **Layout:** every section is laid out as calmly as the lattice allows. A verse, pre-chorus, bridge, intro or outro is the most compact convex shape with exactly its number of triangles (`convexShape`): every convex shape on this lattice is a big triangle with its corners cut off, and cutting the two left corners alike (and the tip to match) makes it symmetric both ways. So 2 triangles are a diamond, 6 a hexagon, 8 a big diamond, 16 (an 8-bar verse) a hexagon with short upright sides, 24 a big regular hexagon; counts with no symmetric shape get a symmetric trapezoid or big triangle. A chorus, whose pieces move a whole cell at a time, is its cells in centred rows that widen then narrow (`rowsFor`): one row, a pyramid, a hexagon (3-4-3, 5-6-5). One outro bar is a long rhombus. Sections run left to right like wrapped text. A short section's unfinished phrase shows as a dashed outline of the finished shape; click it to fill it.
- **Tidy up** (at the tray's right end) lays every section out again this way, in the song's current order; glued pieces come apart, and Undo puts the arrangement back.
- **Glue is explicit:** pieces of one colour side by side are separate sections until glued (G), so two verses in a row can touch. Glued pieces of different colours move and turn together. G glues the focused piece to everything it shares a side with; clicking or dragging a piece focuses it (the board itself focuses only by Tab), so G acts on the piece you last touched.
- **Tray:** the app's own, one shape per section type, stuck to the bottom of the screen while the board is in view. A shape dropped against a section of its type (or within a cell of it) joins it as a new bar; anywhere else it starts a section. From the keyboard, a tray button adds a 4-bar section under the rest. An empty board offers to start from a pop song form.
- **The sky:** the page's `<hex-sky>` is placed and scaled to sit exactly under the board, so the slots show; it darkens while a piece is in the hand.
- **Over the board** the app draws what the song needs: each section's label and place (`3 Ch8`), the thread from each section into the next (wrapping between rows like text), one outline per section carrying its flag and highlight, notes pinned where they apply, unfinished phrases, and the bar being played.
- **Hand-offs:** where a finding is about the move from one section into the next (an odd-length section landing early, stacked verses before a late chorus, a bridge that comes too soon or never resolves), that stretch of thread is drawn solid red or ochre; hover it to see why.
- **Playback:** the played part of the thread turns solid, the hand-off being played runs, and a dot steps from bar to bar.
- **Keyboard:** Tab to a section's label; + and − change its length, Delete removes it, Enter plays from it.
- **Shears:** take a bar off every section the stroke goes clean through.
- **Edits made elsewhere** (typing a form, a fix, an import) keep the arrangement when only lengths change, and lay the table out afresh when sections are added or removed.

**The chart** (the Chart toggle) draws the same song as a lead sheet: four bars to a line, with a double barline at each section end. A balanced form has a flush right edge. A short line ends partway through a phrase.

- **Edit:** build the form on the chart with the add buttons, hover a section for − + ⧉ and the shears, drag a section by its shape to move it, or use **Shears** to cut by dragging. **Text** opens a text box for entering a whole form at once (`In4 Vs8 Pre4 Ch8…`); the app remembers whether you leave it open.
- **Fix on the chart:** click an empty slot at the end of a short line to extend the section up to it.
- **Fix from a note:** each note's buttons rewrite the form. **Undo** (or Cmd/Ctrl+Z) reverts.
- **Time signature:** pick a common one or type any meter, such as `5/4`, `7/8`, `11/8` or `2+2+3/8`; the groups set where the click accents fall. The note before the tempo shows what the tempo counts:
  - quarter notes in `/4` meters
  - eighth notes in odd `/8` meters (`7/8` at 210 means 210 eighths a minute)
  - dotted quarters in compound meters (`6/8`, `9/8`, `12/8`)
- **Era:** the toolbar's picker sets which hits the notes compare against: modern (Harmonix Set, about 1990s–2010s, the default) or classic (McGill Billboard, 1958–1991). Links that don't name an era use the modern one.
- **Length:** the toolbar shows the song's length at the current tempo and time signature, and elapsed / total while playing.
- **Play:** press **Play** or Space, or click any bar. The chords are placeholders so you can hear the form.
- **⋯ menu:** examples, import or export (SALAMI / Billboard), and "How this works".
- **Notes:** these are folded by default. Each note's evidence line expands to show its sources.
- **Share:** the URL hash holds the form and tempo.

## Look and feel

The UI is built on [`@harmonics/lattice-ui`](https://www.npmjs.com/package/@harmonics/lattice-ui), registered once in `src/main.tsx`:

- **`<lattice-face>`** wears the verdict: happy when balanced, puzzled when mostly balanced, distressed when unbalanced, asleep when empty. It laughs with relief whenever an edit improves the verdict.
- **`<lattice-shape>`** marks each section by role. Verse is a line of cells, chorus a flower, bridge a diamond, and so on, each in one of the tree's woods (`src/ui/marks.tsx`). The same marks appear in the add buttons and Help.
- **`<lattice-board>`** (its own entry, `@harmonics/lattice-ui/board`) is the shape table.
- **`<hex-sky>`** is the page's background, lined up under the board.
- **`<shears-pad>`** is the **Shears** tool:
  - Turn it on, then drag across a section to cut it at the nearest barline, or across its shape to remove it.
  - Each section's shears button and − do the same from the keyboard.
  - On the shape table it takes a bar off every section the stroke goes clean through, in at one side and out at another (`crossesRing`, `crossesCell`); a stroke that stays inside, or is cut short, cuts nothing.
- **`<lattice-icon>`** marks the shears controls and "Nothing to fix".
- **Colours and type:** the app's colours are the kit's `--color-tree-*` values (light and dark), and its single typeface is the kit's Roboto Mono.

## The table's geometry

`src/core/lattice.ts` lays the song out as `<lattice-board>` pieces (`flow`, `sectionParts`), reads the song back from them (`songOf`: sections, bars, reading order, whether every bar is whole), and makes the app's own edits (`withBars` for + and −, ghosts and shears; `dropBar` for the tray; `sync` keeps pieces where they are when only lengths change elsewhere). `src/core/blocks.ts` keeps the shared drawing geometry: a shape's raised side and the thread between sections.

The app uses `@harmonics/lattice-ui` (`^0.9.1`) for its board, face, page background, shears and icons.

## Development

```
npm test           # vitest: parser, rules, presets
npm run build      # typecheck + production build
```

- **Scoring core:** `src/core/` is the scoring engine, pure TypeScript with no DOM, so a CLI could reuse it.
- **Thresholds:** they live in `rules/phrase.ts` (role weights, severity cutoffs) and `rules/macro.ts` (time limits).
- **Corpus:** `node scripts/corpus-stats.ts <dir>` rebuilds `src/core/corpus/billboard.json` from a Billboard folder, or `harmonix.json` from the Harmonix Set's `dataset` folder. `BILLBOARD_DIR=<dir> HARMONIX_DIR=<dir> npm test` also checks the engine against every song in them ([docs/research.md](docs/research.md#corpus-measurements-srccorecorpusts)).
