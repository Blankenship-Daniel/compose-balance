/**
 * Board metadata reconciliation module.
 *
 * Preserves semantic section metadata (such as intentional irregular lengths
 * and custom/imported bar chords) across board transformations (splits, glues,
 * moves, and shears) using geometric triangle ownership and explicit provenance,
 * rather than relying on section role order alone.
 */
import { covered, pieceOf } from "@harmonics/lattice-ui/hexes";
import { barPartsOf, layoutBarSources, songOf, type Layout } from "./lattice.ts";
import { LOOPS } from "../audio/chords.ts";
import type { Section } from "./types.ts";

const keys = (parts: Layout["pieces"][number]["parts"]) => new Set(covered(pieceOf("metadata", parts)).map((t) => `${t.i},${t.j},${t.k}`));
const overlap = (left: Set<string>, right: Set<string>) => [...left].filter((key) => right.has(key)).length;

/** Recover semantic metadata from piece identity/triangle ownership, never role order alone. */
export function boardMetadata(previous: Section[], before: Layout, next: Section[], after: Layout): Section[] {
  const old = songOf(before).order;
  const current = songOf(after).order;
  const oldKeys = old.map((section) => keys(section.parts));
  return next.map((section, index) => {
    // Explicit semantic edits (e.g. Tidy) already carry their metadata.
    if (previous.includes(section)) return section;
    const shape = current[index];
    if (!shape) return section;
    const provenance = layoutBarSources.get(after);
    const explicit = provenance?.before === before ? provenance.sources.find((source) => source.pieceId === shape.pieceId && source.role === section.role) : undefined;
    if (explicit) {
      const sourceIndex = old.findIndex((source) => source.pieceId === explicit.sourcePieceId && source.role === explicit.role);
      const source = previous[sourceIndex];
      if (source) return { ...section, intentional: source.bars === section.bars && source.intentional,
        ...(source.chords && { chords: explicit.bars.map((bar) => source.chords?.[bar] ?? "") }) };
    }
    const shapeKeys = keys(shape.parts);
    const candidates = old.flatMap((source, i) => source.role === section.role ? [{
      i, sameId: source.pieceId === shape.pieceId, overlap: overlap(oldKeys[i]!, shapeKeys),
    }] : []);
    candidates.sort((a, b) => Number(b.sameId) - Number(a.sameId) || b.overlap - a.overlap);
    const match = candidates.find((candidate) => candidate.sameId || candidate.overlap > 0);
    const source = match && previous[match.i];
    if (!match || !source) return section;
    let chords = source.chords;
    // Splits/glue map each target bar to its source bar, including multiple old sections.
    const owners = candidates.filter((candidate) => candidate.overlap > 0);
    if (match.overlap > 0 && (section.bars < source.bars || owners.length > 1)) {
      const sourceBars = owners.flatMap(({ i }) => barPartsOf(old[i]!).map((parts, bar) => ({
        keys: keys(parts), chord: previous[i]?.chords?.[bar],
      })));
      if (sourceBars.some((bar) => bar.chord !== undefined)) {
        chords = barPartsOf(shape).map((parts, bar) => {
          const target = keys(parts);
          const owner = sourceBars.map((source) => ({ ...source, overlap: overlap(source.keys, target) }))
            .sort((a, b) => b.overlap - a.overlap)[0];
          const placeholder = LOOPS[section.role][bar % 4]!;
          return owner?.chord ?? (placeholder.endsWith("m") ? `${placeholder.slice(0, -1)}:min` : `${placeholder}:maj`);
        });
      }
    }
    return { ...section, intentional: section.bars === source.bars ? source.intentional : section.intentional,
      ...(chords !== undefined && { chords }) };
  });
}
