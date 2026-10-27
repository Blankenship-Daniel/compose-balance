/**
 * Builds src/core/corpus/billboard.json from a folder of McGill Billboard
 * salami_chords files (one per song, as in CoCoPops-Billboard-legacy's
 * OriginalData/SalamiFiles). Only aggregate counts are written.
 *
 *   node scripts/corpus-stats.ts <billboard-dir>
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromAnnotation } from "../src/core/salami.ts";
import { pulsesPerBar } from "../src/core/meter.ts";
import { DEFAULT_OPTIONS } from "../src/core/score.ts";
import { startBar, totalBars } from "../src/core/stats.ts";
import type { Options, Section } from "../src/core/types.ts";

export interface Song {
  sections: Section[];
  /** The recording's own meter, and its tempo measured from the barlines' timestamps. */
  opts: Options;
}

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

export function loadCorpus(dir: string): Song[] {
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

export function corpusStats(songs: Song[]) {
  const lengths: Record<string, Record<string, number>> = {};
  const transitions: Record<string, Record<string, number>> = {};
  const bump = (table: Record<string, Record<string, number>>, a: string, b: string) => {
    table[a] ??= {};
    table[a]![b] = (table[a]![b] ?? 0) + 1;
  };
  const bridgeStart: number[] = [];
  const firstChorusBar: number[] = [];

  for (const { sections } of songs) {
    sections.forEach((s, i) => {
      bump(lengths, s.role, String(s.bars));
      bump(transitions, i === 0 ? "start" : sections[i - 1]!.role, s.role);
    });
    bump(transitions, sections[sections.length - 1]!.role, "end");
    // Only bridges after two choruses: the ones R10 judges (earlier ones are R9's).
    const bridge = sections.findIndex((s) => s.role === "bridge");
    if (bridge >= 0 && sections.slice(0, bridge).filter((s) => s.role === "chorus").length >= 2)
      bridgeStart.push(startBar(sections, bridge) / totalBars(sections));
    const chorus = sections.findIndex((s) => s.role === "chorus");
    if (chorus >= 0) firstChorusBar.push(startBar(sections, chorus));
  }

  const ps = [10, 25, 50, 75, 90];
  return {
    source: "McGill Billboard (Burgoyne, Wild & Fujinaga, ISMIR 2011), CC0; Hot 100 songs 1958–1991",
    songs: songs.length,
    lengths,
    transitions,
    bridgeStart: { n: bridgeStart.length, ...percentiles(bridgeStart, ps) },
    firstChorusBar: { n: firstChorusBar.length, ...percentiles(firstChorusBar, ps) },
  };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/corpus-stats.ts <billboard-dir>");
    process.exit(1);
  }
  const stats = corpusStats(loadCorpus(dir));
  writeFileSync(new URL("../src/core/corpus/billboard.json", import.meta.url), JSON.stringify(stats, null, 1) + "\n");
  console.log(`${stats.songs} songs → src/core/corpus/billboard.json`);
}
