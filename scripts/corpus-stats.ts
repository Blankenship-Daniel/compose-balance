/**
 * Builds a corpus summary in src/core/corpus/ from either dataset. Only
 * aggregate counts are written.
 *
 * - McGill Billboard: a folder of salami_chords files (one per song, as in
 *   CoCoPops-Billboard-legacy's OriginalData/SalamiFiles) → billboard.json
 * - Harmonix Set: its `dataset` folder, with segments/ and
 *   beats_and_downbeats/ (github.com/urinieto/harmonixset, MIT) → harmonix.json
 *
 *   node scripts/corpus-stats.ts <dir>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromAnnotation } from "../src/core/salami.ts";
import { type Meter, parseMeter, pulsesPerBar } from "../src/core/meter.ts";
import { DEFAULT_OPTIONS } from "../src/core/score.ts";
import { repeats, secondsFor, startBar, totalBars } from "../src/core/stats.ts";
import { Corpus } from "../src/core/corpus.ts";
import { gridScores } from "../src/core/rules/phrase.ts";
import type { Options, Role, Section } from "../src/core/types.ts";

export interface Song {
  sections: Section[];
  /** The recording's own meter, and its tempo measured from its bars' timestamps. */
  opts: Options;
}

export type CorpusName = "billboard" | "harmonix";

export function corpusKind(dir: string): CorpusName {
  return existsSync(join(dir, "segments")) && existsSync(join(dir, "beats_and_downbeats")) ? "harmonix" : "billboard";
}

/** The citation each finding shows; the app reads it from the JSON. */
const SOURCES: Record<CorpusName, (songs: number) => string> = {
  billboard: (n) => `McGill Billboard corpus (Burgoyne, Wild & Fujinaga, ISMIR 2011; CC0), ${n} Hot 100 songs, 1958–1991`,
  harmonix: (n) =>
    `Harmonix Set (Nieto et al., ISMIR 2019; MIT License, © 2019 Oriol Nieto), ${n} Western pop songs, mostly 1990s–2010s`,
};

/** Average tempo over the barred lines: their bars against the time they span. */
function tempoOf(text: string, opts: Options): number | undefined {
  const lines = text.split(/\r?\n/).flatMap((l) => {
    const m = /^(-?[\d.eE+-]+)\s+(.*)$/.exec(l.trim());
    return m ? [{ time: Number(m[1]), bars: Math.max(0, (m[2]!.match(/\|/g)?.length ?? 0) - (m[2]!.match(/\|\s*,|\|\s*$/g)?.length ?? 0)) }] : [];
  });
  const first = lines.findIndex((l) => l.bars > 0);
  const last = lines.findLastIndex((l) => l.bars > 0);
  if (first < 0 || last + 1 >= lines.length) return undefined;
  const bars = lines.slice(first, last + 1).reduce((n, l) => n + l.bars, 0);
  const seconds = lines[last + 1]!.time - lines[first]!.time;
  return seconds > 0 ? Math.round((bars * pulsesPerBar(opts.meter) * 60) / seconds) : undefined;
}

/**
 * Harmonix labels are free-form ("verse2", "altchorus", "gtrbreak"). Read each
 * by its core word, in this order; anything unrecognised is an interlude, as
 * an untyped SALAMI section is.
 */
const HARMONIX_ROLES: [RegExp, Role][] = [
  [/postchorus/, "postchorus"],
  [/postverse/, "interlude"],
  [/pre-?chorus/, "prechorus"],
  [/preverse/, "transition"],
  [/inst.*chorus|chorus.*inst/, "instrumental"],
  [/intro|opening|fadein/, "intro"],
  [/outro/, "outro"],
  [/chorus|refrain/, "chorus"],
  [/verse|rap/, "verse"],
  [/bridge/, "bridge"],
  [/break|^bre$|drum/, "interlude"],
  [/solo|gtr|guitar|sax/, "solo"],
  [/inst|riff|synth/, "instrumental"],
  [/build|transition/, "transition"],
];

function harmonixRole(label: string): Role {
  const core = label.toLowerCase().replace(/\d+[a-z]?$/, "");
  return HARMONIX_ROLES.find(([re]) => re.test(core))?.[1] ?? "interlude";
}

/** Each segment's bars are the downbeats that fall inside it. */
function loadHarmonix(dir: string): Song[] {
  const songs: Song[] = [];
  for (const file of readdirSync(join(dir, "segments")).filter((f) => f.endsWith(".txt")).sort()) {
    const rows = (path: string) =>
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim().split(/\s+/))
        .filter((r) => r.length >= 2);
    const beats = rows(join(dir, "beats_and_downbeats", file)).map(([t, pos]) => ({ time: Number(t), pos: Number(pos) }));
    const downbeats = beats.filter((b) => b.pos === 1).map((b) => b.time);
    if (downbeats.length < 2) continue;
    const beatGap = (beats[beats.length - 1]!.time - beats[0]!.time) / (beats.length - 1);
    const tolerance = beatGap / 4; // a boundary marked just after its downbeat still owns it

    const segments = rows(join(dir, "segments", file)).map(([t, label]) => ({ time: Number(t), label: label! }));
    const sections: Section[] = [];
    segments.forEach((seg, i) => {
      const label = seg.label.toLowerCase();
      if (label === "silence" || label === "end" || i + 1 >= segments.length) return;
      const end = segments[i + 1]!.time;
      const bars = downbeats.filter((d) => d >= seg.time - tolerance && d < end - tolerance).length;
      if (bars === 0) return; // a pickup or fill shorter than a bar
      sections.push({ role: harmonixRole(label), bars: Math.min(64, bars), intentional: false });
    });
    if (!sections.length) continue;

    const beatsPerBar = Math.max(...beats.map((b) => b.pos));
    const meter = parseMeter(beatsPerBar === 6 ? "6/8" : `${beatsPerBar}/4`) as Meter;
    const seconds = downbeats[downbeats.length - 1]! - downbeats[0]!;
    const bpm = Math.round(((downbeats.length - 1) * pulsesPerBar(meter) * 60) / seconds);
    songs.push({ sections, opts: { ...DEFAULT_OPTIONS, meter, bpm } });
  }
  return songs;
}

export function loadCorpus(dir: string): Song[] {
  if (corpusKind(dir) === "harmonix") return loadHarmonix(dir);
  const songs: Song[] = [];
  const seen = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    const text = readFileSync(join(dir, file), "utf8");
    // The corpus annotates some songs twice (they charted twice); count each once.
    const key = [/^# title:(.*)$/m, /^# artist:(.*)$/m].map((re) => re.exec(text)?.[1]?.trim().toLowerCase()).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const { sections, meter } = fromAnnotation(text, DEFAULT_OPTIONS);
    const opts = { ...DEFAULT_OPTIONS, meter: meter ?? DEFAULT_OPTIONS.meter };
    if (sections.length) songs.push({ sections, opts: { ...opts, bpm: tempoOf(text, opts) ?? opts.bpm } });
  }
  return songs;
}

function percentiles(values: number[], ps: number[]): Record<string, number> {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries(
    ps.map((p) => [`p${p}`, Number(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!.toFixed(3))]),
  );
}

export function corpusStats(songs: Song[], name: CorpusName) {
  const lengths: Record<string, Record<string, number>> = {};
  const transitions: Record<string, Record<string, number>> = {};
  const repeatChanges: Record<string, Record<string, number>> = {};
  const bump = (table: Record<string, Record<string, number>>, a: string, b: string) => {
    table[a] ??= {};
    table[a]![b] = (table[a]![b] ?? 0) + 1;
  };
  const bridgeStart: number[] = [];
  const firstChorusBar: number[] = [];
  const firstChorusSeconds: number[] = [];
  const introSeconds: number[] = [];
  const songSeconds: number[] = [];

  for (const { sections, opts } of songs) {
    sections.forEach((s, i) => {
      bump(lengths, s.role, String(s.bars));
      bump(transitions, i === 0 ? "start" : sections[i - 1]!.role, s.role);
    });
    bump(transitions, sections[sections.length - 1]!.role, "end");
    // Counted once per song: a song with several middle choruses is one song, not several.
    const counted = new Set<string>();
    for (const role of ["verse", "prechorus", "chorus"] as const)
      for (const r of repeats(sections, role)) {
        const key = `${role}:${r.position}`;
        if (!counted.has(key)) bump(repeatChanges, key, "songs");
        if (!counted.has(`${key}:${r.change}`)) bump(repeatChanges, key, r.change);
        counted.add(key).add(`${key}:${r.change}`);
      }
    // Only bridges after two choruses: the ones R10 judges (earlier ones are R9's).
    const bridge = sections.findIndex((s) => s.role === "bridge");
    if (bridge >= 0 && sections.slice(0, bridge).filter((s) => s.role === "chorus").length >= 2)
      bridgeStart.push(startBar(sections, bridge) / totalBars(sections));
    if (sections[0]!.role === "intro") introSeconds.push(secondsFor(sections[0]!.bars, opts));
    songSeconds.push(secondsFor(totalBars(sections), opts));
    const chorus = sections.findIndex((s) => s.role === "chorus");
    if (chorus >= 0) {
      firstChorusBar.push(startBar(sections, chorus));
      firstChorusSeconds.push(secondsFor(startBar(sections, chorus), opts));
    }
  }

  const ps = [10, 25, 50, 75, 90];
  return {
    source: SOURCES[name](songs.length),
    songs: songs.length,
    songsWithPostchorus: songs.filter((s) => s.sections.some((x) => x.role === "postchorus")).length,
    lengths,
    transitions,
    repeats: repeatChanges,
    bridgeStart: { n: bridgeStart.length, ...percentiles(bridgeStart, ps) },
    firstChorusBar: { n: firstChorusBar.length, ...percentiles(firstChorusBar, ps) },
    firstChorusSeconds: { n: firstChorusSeconds.length, ...percentiles(firstChorusSeconds, ps) },
    introSeconds: { n: introSeconds.length, ...percentiles(introSeconds, ps) },
    songSeconds: { n: songSeconds.length, ...percentiles(songSeconds, ps) },
  };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/corpus-stats.ts <billboard-dir | harmonix-dataset-dir>");
    process.exit(1);
  }
  const name = corpusKind(dir);
  const songs = loadCorpus(dir);
  const base = corpusStats(songs, name);
  // Scoring needs the length counts just measured, so it runs on them as a second pass.
  const measured = new Corpus(name, { ...base, songIrregularity: [], warnScore: 0 });
  const scored = songs.map((s) => gridScores(s.sections, measured));
  const songIrregularity = scored.map((g) => Number(g.total.toFixed(2))).sort((a, b) => a - b);
  // R2 warns on a section more irregular than the worst section of 3 in 4 songs. Rounded down,
  // so a section scoring exactly the 75th percentile still reaches it.
  const worst = scored.map((g) => Math.max(0, ...g.scores)).sort((a, b) => a - b);
  const warnScore = Math.floor(worst[Math.floor(worst.length * 0.75)]! * 100) / 100;
  const onGrid = songs.filter((s) => s.sections.every((x) => x.bars % 4 === 0)).length;
  const onGridSongs = Number((onGrid / Math.max(1, songs.length)).toFixed(4));
  const stats = { ...base, songIrregularity, warnScore, onGridSongs };
  writeFileSync(new URL(`../src/core/corpus/${name}.json`, import.meta.url), JSON.stringify(stats, null, 1) + "\n");
  console.log(`${stats.songs} songs → src/core/corpus/${name}.json`);
}
