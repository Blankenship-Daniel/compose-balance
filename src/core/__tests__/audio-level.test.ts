import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePeakDb, peakDb } from "../../../scripts/audio-level.ts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
const spawn = vi.mocked(spawnSync);
beforeEach(() => spawn.mockReset());

describe("ffmpeg peak measurement", () => {
  it("reads max_volume, not mean_volume", () => {
    expect(parsePeakDb("mean_volume: -30.5 dB\nmax_volume: -8.7 dB")).toBe(-8.7);
    expect(parsePeakDb("max_volume: 0.0 dB")).toBe(0);
  });

  it.each(["", "max_volume: -inf dB", "max_volume: NaN dB"])("rejects missing/nonfinite peaks: %s", (text) => {
    expect(() => parsePeakDb(text)).toThrow(/finite max_volume/);
  });

  it("captures stderr on successful ffmpeg execution", () => {
    spawn.mockReturnValue({ status: 0, signal: null, stdout: "max_volume: 0 dB", stderr: "max_volume: -12.3 dB" } as ReturnType<typeof spawnSync>);
    expect(peakDb([{ file: "a.wav", volume: -2 }, { file: "b.wav", volume: 0 }], 3)).toBe(-12.3);
    expect(spawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining(["-i", "a.wav", "-i", "b.wav"]), expect.objectContaining({ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    expect(spawn.mock.calls[0]![1]).toContain("[0:a]volume=-2dB[a0];[1:a]volume=0dB[a1];[a0][a1]amix=inputs=2:normalize=0[m];[m]atrim=0:3,volumedetect[o]");
  });

  it("does not silently normalize after process failure", () => {
    spawn.mockReturnValue({ status: 1, signal: null, stdout: "", stderr: "bad input" } as ReturnType<typeof spawnSync>);
    expect(() => peakDb([{ file: "a.wav", volume: 0 }], 3)).toThrow(/bad input/);
    spawn.mockReturnValue({ error: new Error("ENOENT") } as ReturnType<typeof spawnSync>);
    expect(() => peakDb([{ file: "a.wav", volume: 0 }], 3)).toThrow(/ENOENT/);
  });
});
