/**
 * Runs the engine over real hits. Set BILLBOARD_DIR to a folder of McGill
 * Billboard salami_chords files, and/or HARMONIX_DIR to the Harmonix Set's
 * `dataset` folder (see scripts/corpus-stats.ts); each check is skipped without its folder.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCorpus } from "../../../scripts/corpus-stats.ts";
import { analyze } from "../score.ts";

// Each corpus is scored against its own era's norms.
for (const [name, dir, era] of [
  ["Billboard", process.env.BILLBOARD_DIR, "classic"],
  ["Harmonix", process.env.HARMONIX_DIR, "modern"],
] as const) {
  describe.skipIf(!dir || !existsSync(dir))(`${name} corpus`, () => {
    // Only R2 raises problems, past the era's 90th percentile, so this holds by construction
    // unless the scoring here and in scripts/corpus-stats.ts drift apart.
    it("calls at most 1 in 10 real hits unbalanced", () => {
      const songs = loadCorpus(dir!);
      const verdicts = songs.map((s) => analyze(s.sections, { ...s.opts, era }).verdict);
      const share = (v: string) => verdicts.filter((x) => x === v).length / songs.length;
      console.log(
        `${name}, ${songs.length} songs: ${["Balanced", "Mostly balanced", "Unbalanced"].map((v) => `${v} ${(share(v) * 100).toFixed(1)}%`).join(", ")}`,
      );
      expect(share("Unbalanced")).toBeLessThanOrEqual(0.1);
    }, 60_000); // reads and scores every song in the corpus
  });
}
