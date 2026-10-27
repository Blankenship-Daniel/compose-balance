import { describe, expect, it } from "vitest";
import { bounds, hull, sideOf, threadPath } from "../blocks.ts";

describe("shared geometry", () => {
  it("raises a shape: its side reaches below its top by the depth", () => {
    const tri = [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0.5, y: 0 }];
    expect(bounds(sideOf(tri, 0.2)).bottom).toBeCloseTo(1.2, 9);
    expect(hull([...tri, { x: 0.5, y: 0.5 }])).toHaveLength(3);
  });

  it("threads along a row with a curve, and wraps down to the next row", () => {
    const a = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const b = [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }];
    expect(threadPath(a, b, 0, true).d).toContain("C");
    const below = [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 4 }];
    const wrap = threadPath(b, below, 3, false);
    expect(wrap.d).toContain("Q");
    expect(wrap.mid.y).toBeGreaterThan(0);
    // As a line break: an end out of the first section and an end into the next, apart.
    expect(wrap.ends!.outEnd.y).toBeLessThan(wrap.ends!.inStart.y);
    expect(threadPath(a, b, 0, true).ends).toBeUndefined();
  });
});
