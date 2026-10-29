import { spawnSync } from "node:child_process";

/** volumedetect writes to stderr; missing/silent measurements cannot normalize an instrument. */
export function parsePeakDb(stderr: string): number {
  const match = /max_volume:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s+dB/.exec(stderr);
  const peak = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(peak)) throw new Error("ffmpeg did not report a finite max_volume.");
  return peak;
}

export function peakDb(sources: { file: string; volume: number }[], seconds: number): number {
  const inputs = sources.flatMap((s) => ["-i", s.file]);
  const mix = sources.map((s, i) => `[${i}:a]volume=${s.volume}dB[a${i}]`).join(";");
  const sum = sources.length > 1 ? `${sources.map((_, i) => `[a${i}]`).join("")}amix=inputs=${sources.length}:normalize=0[m]` : "[a0]anull[m]";
  const result = spawnSync("ffmpeg", ["-v", "info", "-nostats", ...inputs, "-filter_complex", `${mix};${sum};[m]atrim=0:${seconds},volumedetect[o]`, "-map", "[o]", "-f", "null", "-"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg peak analysis failed (${result.signal ?? result.status}): ${result.stderr}`);
  return parsePeakDb(result.stderr);
}
