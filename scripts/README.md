# Scripts & Tooling

This directory contains maintenance scripts for processing music corpora, enriching metadata and generating sampled instruments, plus an internal audio-measurement helper.

Run commands from the repository root after `npm ci`, using **Node.js 26.4.0** (the tested runtime). TypeScript scripts run directly with `node`; no `tsx` installation or on-demand download is required. Python 3 is needed only for release-year lookup. Corpus rebuilds require separately obtained source datasets; do not add raw datasets or download caches to the repository.

These commands are maintenance operations, not part of normal app startup. Corpus generation overwrites generated JSON; sample generation replaces selected output directories. Review the working tree first, keep a rollback copy of local generated-data changes, and inspect the resulting diffs before committing.

---

## 1. Corpus Statistics Generation (`corpus-stats.ts`)

Parses corpus annotations and extracts structural statistics (section lengths, transitions, placements, and irregularities) into normalized JSON files consumed by `src/core/corpus/`.

### McGill Billboard Processing

Pass the folder containing the McGill Billboard salami_chords annotations, such as CoCoPops-Billboard-legacy's `OriginalData/SalamiFiles` directory:

```bash
node scripts/corpus-stats.ts /path/to/McGill-Billboard
```

This generates or updates:
- `src/core/corpus/billboard.json` (aggregate statistics, phrase irregularity distributions, hand-off transition matrix)
- `src/core/corpus/songs-billboard.json` (searchable song catalogue with real chords, meter, and tempos)

### Harmonix Set Processing

To parse the Harmonix Set (containing downbeat and segment annotations):

```bash
# 1. First extract release years from MusicBrainz (optional, see below)
uv run --python 3 --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com scripts/harmonix-years.py /path/to/harmonixset/dataset/metadata.csv /tmp/years.json

# 2. Process corpus statistics with release years
node scripts/corpus-stats.ts /path/to/harmonixset/dataset --years /tmp/years.json
```

This generates or updates:
- `src/core/corpus/harmonix.json` (modern pop statistics and distributions)
- `src/core/corpus/songs-harmonix.json` (catalogue with approximate release years)

---

## 2. Harmonix Release Years (`harmonix-years.py`)

Queries the MusicBrainz Web API to look up earliest recording release dates for songs in the Harmonix Set based on their MusicBrainz Recording IDs.

```bash
uv run --python 3 --index-url https://pypi.ci.artifacts.walmart.com/artifactory/api/pypi/external-pypi/simple --allow-insecure-host pypi.ci.artifacts.walmart.com scripts/harmonix-years.py <metadata.csv> <output.json>
```

- **Requirements:** `uv`, Python 3 and network access to MusicBrainz. The script uses only the Python standard library; no third-party Python packages are needed. Use a new or backed-up output file.
- **Lookups:** searches recording IDs first, then title/artist matches. It waits 1.1 seconds after successful requests and backs off on errors; a full lookup of 912 songs can take 1–3 hours.
- **Caching:** reruns retain non-null years from the output JSON and retry missing/failed matches. Progress is saved periodically (every 25 input rows when processing reaches that checkpoint) and at normal completion. Interrupted work since the last save may be repeated; writes are not atomic, so keep a backup of an existing cache.
- **Accuracy:** earliest dates can refer to a reissue or the wrong recording. The corpus builder treats years after 2019 as unknown; these years are approximate metadata, not verified release dates.

---

## 3. Sample Generation (`build-samples.ts`)

Builds self-hosted samples used by the Web Audio / `smplr` playback engine (`src/audio/band.ts`). Requires **`ffmpeg` (with AAC encoding), `curl`, and `du` on PATH**, network access to GitHub source libraries, and a POSIX environment such as macOS or Linux. The cache directory is required; keep it outside the repository.

```bash
# Rebuild only this instrument; its ID comes from LIBRARIES in the script.
node scripts/build-samples.ts /tmp/compose-balance-sample-cache osiris-piano

# Rebuild every configured library (larger downloads and more work).
node scripts/build-samples.ts /tmp/compose-balance-sample-cache
```

**Replacement warning:** for each selected library with planned samples, the script deletes and recreates `public/samples/<instrument-id>/` before encoding. Existing local edits in that directory are lost, and an encoding failure can leave partial output. Back up or commit intended changes before rebuilding, and review the generated assets afterward. Do not run these examples merely to test setup.

- Downloads CC0 libraries pinned to commits; reads SFZ programs or configured sample folders and mixes their layers.
- Trims, fades, normalizes and encodes mono AAC at 80 kbit/s into **`.m4a`** files, plus a `preset.json` containing source/license metadata, note ranges and drum aliases.
- Takes peak measurements from FFmpeg's stderr using `audio-level.ts`; missing/nonfinite measurements or FFmpeg failures abort the build.
- Accepts optional instrument IDs after the cache path; unknown IDs select nothing. Check spelling against the exported `LIBRARIES` list.

---

## 4. Internal Audio Measurement Helper (`audio-level.ts`)

This is **not a CLI**. Running the module directly performs no measurements. The sample builder imports:

- `parsePeakDb(stderr)`: reads FFmpeg's finite `max_volume` measurement in dB.
- `peakDb(sources, seconds)`: runs FFmpeg on source files, applies their gain/mix, trims to the requested duration, and returns peak dB. It requires `ffmpeg` on PATH and rejects failed or missing measurements.

It does not measure browser playback, synthetic clicks, or loudness envelopes. Run its focused tests without rebuilding samples:

```bash
npm test -- src/core/__tests__/audio-level.test.ts
```

For playback cleanup and silence/hold regressions:

```bash
npm test -- src/core/__tests__/player-adversarial.test.ts
```
