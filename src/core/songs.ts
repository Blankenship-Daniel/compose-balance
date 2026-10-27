/**
 * Real hits from both corpora, one row per song, for loading a known form.
 * Built by scripts/corpus-stats.ts; the lists load on first search, in their own chunk.
 */
import { carryChords } from "./chords.ts";
import { parse } from "./parse.ts";
import type { Era, Section } from "./types.ts";

export interface Hit {
  /** Stable across rebuilds, for links: "bb0003", "hx0001". */
  id: string;
  title: string;
  artist: string;
  /** Billboard: first chart year. Harmonix: first release, where MusicBrainz knew it. */
  year?: number;
  bpm: number;
  /** As `parseMeter` reads it: "4/4", "6/8". */
  meter: string;
  /** As `parse` reads it: "In4 Vs8 Ch8 …". */
  form: string;
  /** Billboard only: every bar's chords in Harte spelling, bars joined by "|" (see `Section.chords`). */
  chords?: string;
  /** The corpus the song comes from, and so the era its notes compare against. */
  era: Era;
}

type Row = Omit<Hit, "era">;

export async function loadHits(): Promise<Hit[]> {
  const [billboard, harmonix] = await Promise.all([
    import("./corpus/songs-billboard.json").then((m) => m.default as Row[]),
    import("./corpus/songs-harmonix.json").then((m) => m.default as Row[]),
  ]);
  return [
    ...billboard.map((r): Hit => ({ ...r, era: "classic" })),
    ...harmonix.map((r): Hit => ({ ...r, era: "modern" })),
  ];
}

/** Lower case, no accents, punctuation as spaces: "Beyoncé's" → "beyonce s". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Songs whose title and artist hold every word of the query, as word starts.
 * Titles that start with the query come first, then by title.
 */
export function searchHits(hits: Hit[], query: string, limit = 20): Hit[] {
  const q = fold(query);
  if (!q) return [];
  const words = q.split(" ");
  return hits
    .map((hit) => ({ hit, title: fold(hit.title), text: ` ${fold(hit.title)} ${fold(hit.artist)}` }))
    .filter(({ text }) => words.every((w) => text.includes(` ${w}`)))
    .sort((a, b) => Number(b.title.startsWith(q)) - Number(a.title.startsWith(q)) || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ hit }) => hit);
}

/** Which hit each chord list came from. Edits keep the lists themselves (`carryChords`), so this survives them. */
const songOfChords = new WeakMap<string[], string>();

/** A hit's sections, each carrying its own bars' chords when the song has them. */
export function hitSections(hit: Hit): Section[] {
  const sections = parse(hit.form).sections;
  if (!hit.chords) return sections;
  const bars = hit.chords.split("|");
  let at = 0;
  return sections.map((s) => {
    const chords = bars.slice(at, (at += s.bars));
    if (!chords.length) return s;
    songOfChords.set(chords, hit.id);
    return { ...s, chords };
  });
}

/** The id of the hit whose chords these sections play, for a link that keeps them. */
export function songOf(sections: Section[]): string | undefined {
  for (const s of sections) if (s.chords && songOfChords.has(s.chords)) return songOfChords.get(s.chords);
  return undefined;
}

/**
 * A linked hit's chords put back on a form from the link: each section takes the chords
 * of the song's matching section (see `carryChords`), so a form edited after loading still
 * plays the right chords on the bars it kept.
 */
export async function restoreChords(id: string, sections: Section[]): Promise<Section[] | undefined> {
  const hit = (await loadHits()).find((h) => h.id === id);
  return hit?.chords ? carryChords(hitSections(hit), sections) : undefined;
}
