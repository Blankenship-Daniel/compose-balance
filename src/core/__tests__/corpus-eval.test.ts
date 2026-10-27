/**
 * Runs the engine over real hits. Set BILLBOARD_DIR to a folder of McGill
 * Billboard salami_chords files (see scripts/corpus-stats.ts); without it this is skipped.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCorpus } from "../../../scripts/corpus-stats.ts";
import { analyze } from "../score.ts";

const dir = process.env.BILLBOARD_DIR;

describe.skipIf(!dir || !existsSync(dir))("Billboard corpus", () => {
  it("calls fewer than 1 in 10 real hits unbalanced", () => {
    const songs = loadCorpus(dir!);
    const verdicts = songs.map((s) => analyze(s.sections, s.opts).verdict);
    const share = (v: string) => verdicts.filter((x) => x === v).length / songs.length;
    console.log(
      `${songs.length} songs: ${["Balanced", "Mostly balanced", "Unbalanced"].map((v) => `${v} ${(share(v) * 100).toFixed(1)}%`).join(", ")}`,
    );
    expect(share("Unbalanced")).toBeLessThan(0.1);
  });
});
