import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../parse.ts";
import { MAX_DOCUMENT_CHARS, MAX_SECTIONS, MAX_TOTAL_BARS } from "../document.ts";
import { parseMeter } from "../meter.ts";
import { analyze } from "../score.ts";
import type { Hit } from "../songs.ts";

const files = ["README.md", "docs/research.md", "scripts/README.md", "src/core/__tests__/fixtures/README.md"];
const read = (file: string) => readFileSync(file, "utf8");

describe("documentation contracts", () => {
  it.each(files)("resolves local Markdown file links in %s", (file) => {
    for (const match of read(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]!.split("#")[0]!;
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      expect(existsSync(resolve(dirname(file), target)), `${file}: ${target}`).toBe(true);
    }
  });

  it("accepts each copyable quick-entry example without parser errors", () => {
    const block = /Quick entry with \*\*Text\*\*:[\s\S]*?```\n([\s\S]*?)```/.exec(read("README.md"));
    expect(block).not.toBeNull();
    const examples = block![1]!.trim().split("\n");
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const result = parse(example);
      expect(result.errors, example).toEqual([]);
      expect(result.sections.length).toBeGreaterThan(0);
    }
  });

  it("documents the enforced document limits", () => {
    const text = read("README.md");
    expect(text).toContain(`up to ${MAX_SECTIONS} sections and ${MAX_TOTAL_BARS} bars`);
    expect(text).toContain(MAX_DOCUMENT_CHARS.toLocaleString("en-US"));
  });

  it("keeps the published era-comparison table consistent with shipped catalogues", () => {
    const text = read("docs/research.md");
    for (const name of ["billboard", "harmonix"] as const) {
      const songs = JSON.parse(read(`src/core/corpus/songs-${name}.json`)) as Hit[];
      for (const era of ["classic", "modern"] as const) {
        const counts = { Balanced: 0, "Mostly balanced": 0, Unbalanced: 0 };
        for (const song of songs) {
          const meter = parseMeter(song.meter);
          if (typeof meter === "string") throw new Error(meter);
          const report = analyze(parse(song.form).sections, { bpm: song.bpm, meter, era });
          counts[report.verdict]++;
        }
        const percentages = Object.values(counts).map((count) => `${(100 * count / songs.length).toFixed(1)}%`);
        const corpus = name === "billboard" ? "Billboard" : "Harmonix";
        const label = era === "classic" ? "Classic" : "Modern";
        expect(text).toContain(`| ${corpus} | ${label} | ${percentages.join(" | ")} |`);
      }
    }
  });

  it("points maintainers at the tested native Node runtime, not an uninstalled runner", () => {
    const text = read("scripts/README.md");
    expect(text).not.toContain("npx tsx");
    expect(text).toContain("node scripts/build-samples.ts /tmp/compose-balance-sample-cache");
    expect(text).toContain("not a CLI");
  });
});
