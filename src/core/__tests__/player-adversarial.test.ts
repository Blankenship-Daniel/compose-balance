import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Player } from "../../audio/player.ts";
import { loadBand } from "../../audio/band.ts";

vi.mock("../../audio/band.ts", () => ({ loadBand: vi.fn() }));
import { FOUR_FOUR } from "../meter.ts";
import type { Section } from "../types.ts";

const opts = { bpm: 120, meter: FOUR_FOUR };
const section = (chords: string[]): Section[] => [{ role: "verse", bars: chords.length, intentional: false, chords }];
const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
class Node {
  gain = param();
  frequency = param();
  type = "sine";
  onended: (() => void) | null = null;
  connect = vi.fn(() => this);
  disconnect = vi.fn();
  start = vi.fn(() => { if (context.failStart) throw new Error("schedule failed"); });
  stop = vi.fn();
}
class Context {
  currentTime = 0;
  destination = {};
  failStart = false;
  gains: Node[] = [];
  oscillators: Node[] = [];
  resume = vi.fn(async () => {});
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
}
let context: Context;
let interval: () => void;
let tick: () => void;
let player: Player;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  context = new Context();
  player = new Player();
  vi.stubGlobal("AudioContext", function () { return context; });
  vi.stubGlobal("window", { setInterval: vi.fn((callback) => { interval = callback; return 1; }) });
  vi.stubGlobal("clearInterval", vi.fn());
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => { tick = callback; return 2; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { player.stop(); vi.unstubAllGlobals(); });

function expectClean() {
  expect(player.playing).toBe(false);
  expect(context.gains.slice(1).every((node) => node.disconnect.mock.calls.length)).toBe(true);
  expect(context.oscillators.every((node) => node.disconnect.mock.calls.length && node.stop.mock.calls.length)).toBe(true);
  expect(clearInterval).toHaveBeenCalled();
  expect(cancelAnimationFrame).toHaveBeenCalled();
}

describe("player scheduling boundaries", () => {
  it("carries explicit silence through a subsequent held bar", async () => {
    const done = player.play(section(["C:maj", "N", "."]), opts, vi.fn(), 0, { sound: "synth" });
    await flush();
    expect(context.oscillators).toHaveLength(8); // four pitched voices + four clicks
    context.currentTime = 2;
    interval();
    expect(context.oscillators).toHaveLength(12);
    context.currentTime = 4;
    interval();
    expect(context.oscillators).toHaveLength(16); // third bar stays click-only
    player.stop();
    await done;
    expectClean();
  });

  it("rejects initial scheduling errors and cleans partially started resources", async () => {
    context.failStart = true;
    await expect(player.play(section(["C:maj"]), opts, vi.fn(), 0, { sound: "synth" })).rejects.toThrow("schedule failed");
    expectClean();
    expect(window.setInterval).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("rejects later lookahead errors through the playback promise", async () => {
    const done = player.play(section(["C:maj", "G:maj"]), opts, vi.fn(), 0, { sound: "synth" });
    const rejection = expect(done).rejects.toThrow("schedule failed");
    await flush();
    context.currentTime = 2;
    context.failStart = true;
    expect(() => interval()).not.toThrow();
    await rejection;
    expectClean();
  });

  it("stops all sampled voices when band scheduling fails", async () => {
    const voice = { start: vi.fn(() => { throw new Error("sample schedule failed"); }), stop: vi.fn() };
    const voices = [voice, { ...voice, stop: vi.fn() }, { ...voice, stop: vi.fn() }, { ...voice, stop: vi.fn() }];
    vi.mocked(loadBand).mockResolvedValueOnce({ keys: voices[0], bass: voices[1], drums: voices[2], pad: voices[3] } as unknown as Awaited<ReturnType<typeof loadBand>>);
    await expect(player.play(section(["C:maj"]), opts, vi.fn())).rejects.toThrow("sample schedule failed");
    expect(voices.every((v) => v.stop.mock.calls.length)).toBe(true);
    expectClean();
  });

  it("rejects resume failure before creating a playback bus", async () => {
    context.resume.mockRejectedValueOnce(new Error("resume failed"));
    await expect(player.play(section(["C:maj"]), opts, vi.fn(), 0, { sound: "synth" })).rejects.toThrow("resume failed");
    expect(player.playing).toBe(false);
    expect(context.oscillators).toHaveLength(0);
  });

  it("stays stopped if cancelled while resume is pending", async () => {
    let resume!: () => void;
    context.resume.mockImplementationOnce(() => new Promise<void>((resolve) => { resume = resolve; }));
    const done = player.play(section(["C:maj"]), opts, vi.fn(), 0, { sound: "synth" });
    player.stop();
    resume();
    await done;
    expect(player.playing).toBe(false);
    expect(context.oscillators).toHaveLength(0);
  });

  it("settles naturally and disconnects resources", async () => {
    const onBar = vi.fn();
    const done = player.play(section(["C:maj"]), opts, onBar, 0, { sound: "synth" });
    await flush();
    context.currentTime = 3;
    tick();
    await done;
    expect(onBar).toHaveBeenCalledWith(-1);
    expectClean();
  });
});
