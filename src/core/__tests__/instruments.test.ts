import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_BAND, INSTRUMENTS, type Part, validChoice } from "../../audio/instruments.ts";

const DRUMS = ["kick", "snare", "hihat", "hihat-open", "crash", "tom-1", "tom-2", "tom-3", "tom-4"];
const sampleDir = (id: string) => new URL(`../../../public/samples/${id}/`, import.meta.url);

describe("instruments", () => {
  it("has unique ids and something for every part", () => {
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(INSTRUMENTS.length);
    for (const part of ["keys", "bass", "drums", "pad"] as Part[]) expect(INSTRUMENTS.some((i) => i.part === part)).toBe(true);
  });

  it("maps every drum sound on each drum machine", () => {
    for (const i of INSTRUMENTS) if (i.source.kind === "drum-machine") expect(Object.keys(i.source.map).sort()).toEqual([...DRUMS].sort());
  });

  it("ships a preset and its samples for every self-hosted instrument", () => {
    for (const i of INSTRUMENTS) {
      if (i.source.kind !== "local") continue;
      const dir = sampleDir(i.source.id);
      expect(existsSync(new URL("preset.json", dir)), i.id).toBe(true);
      const preset = JSON.parse(readFileSync(new URL("preset.json", dir), "utf8"));
      expect(preset.meta.license, i.id).toMatch(/^CC0/);
      for (const r of preset.groups[0].regions) expect(existsSync(new URL(`${r.sample}.m4a`, dir)), `${i.id}/${r.sample}`).toBe(true);
      if (i.part === "drums") expect(Object.keys(preset.aliases).sort(), i.id).toEqual([...DRUMS].sort());
    }
  });
});

describe("validChoice", () => {
  it("keeps a valid choice and replaces unknown or wrong-part ids", () => {
    expect(validChoice({ keys: "harp", bass: "growlybass", drums: "tr-808", pad: "strings" })).toEqual({ keys: "harp", bass: "growlybass", drums: "tr-808", pad: "strings" });
    expect(validChoice({ keys: "tr-808", bass: "nope", drums: 3, pad: null })).toEqual({ ...DEFAULT_BAND, pad: null });
    expect(validChoice(null)).toEqual(DEFAULT_BAND);
  });
});
