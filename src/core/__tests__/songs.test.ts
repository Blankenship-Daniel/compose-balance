import { describe, expect, it } from "vitest";
import { parseMeter } from "../meter.ts";
import { parse } from "../parse.ts";
import { type Hit, loadHits, searchHits } from "../songs.ts";

const hits = await loadHits();
const hit = (title: string, artist: string): Hit => ({ title, artist, bpm: 120, meter: "4/4", form: "Vs8 Ch8", era: "modern" });

describe("song list", () => {
  it("holds both corpora", () => {
    expect(hits.filter((h) => h.era === "classic").length).toBeGreaterThanOrEqual(700);
    expect(hits.filter((h) => h.era === "modern").length).toBeGreaterThanOrEqual(900);
  });

  it("loads every song's form, tempo and time signature", () => {
    for (const h of hits) {
      expect(parse(h.form).errors, `${h.title}: ${h.form}`).toEqual([]);
      expect(typeof parseMeter(h.meter), `${h.title}: ${h.meter}`).toBe("object");
      expect(h.bpm).toBeGreaterThan(0);
    }
  });

  it("finds known songs by title, artist or both", () => {
    expect(searchHits(hits, "heat of the moment")[0]).toMatchObject({ title: "Heat of the Moment", artist: "Asia" });
    expect(searchHits(hits, "ciara 1 2 step")[0]).toMatchObject({ title: "1, 2 Step", year: 2004 });
    expect(searchHits(hits, "chiffons").map((h) => h.title)).toContain("He's So Fine");
  });
});

describe("searchHits", () => {
  const list = [hit("Café del Mar", "Energy 52"), hit("Mars", "Someone"), hit("Lunar", "Mars Band")];

  it("ignores case, accents and punctuation", () => {
    expect(searchHits(list, "CAFE").map((h) => h.title)).toEqual(["Café del Mar"]);
    expect(searchHits(list, "energy-52").map((h) => h.title)).toEqual(["Café del Mar"]);
  });

  it("matches word starts, and puts titles that start with the query first", () => {
    expect(searchHits(list, "mar").map((h) => h.title)).toEqual(["Mars", "Café del Mar", "Lunar"]);
    expect(searchHits(list, "ars")).toEqual([]);
  });

  it("returns nothing for an empty or unmatched query", () => {
    expect(searchHits(list, "  ")).toEqual([]);
    expect(searchHits(hits, "zzqxv")).toEqual([]);
  });

  it("caps the results", () => {
    expect(searchHits(hits, "the", 5)).toHaveLength(5);
  });
});
