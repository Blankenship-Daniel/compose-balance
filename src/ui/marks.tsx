import { BLOCK_OF, bounds, type Pt, sideOf } from "../core/blocks.ts";
import { UNITS } from "../core/lattice.ts";
import type { Role } from "../core/types.ts";

/**
 * One bar of a section type as the board lays a single bar out: a right-pointing triangle
 * (bridge), a diamond of two triangles face to face (verse), a trapezoid, half a cell (pre-chorus),
 * a big triangle (intro), a long rhombus (outro), a whole pointy-topped cell (chorus). In block edges.
 */
export function barPts(role: Role): Pt[] {
  const H = Math.sqrt(3) / 2;
  const v = (deg: number): Pt => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });
  if (role === "intro" || role === "coda") return [{ x: 0, y: 0 }, { x: 2 * H, y: 1 }, { x: 0, y: 2 }];
  if (role === "outro") return [{ x: 0, y: 0 }, { x: 2 * H, y: 1 }, { x: 2 * H, y: 2 }, { x: 0, y: 1 }];
  switch (UNITS[role]) {
    case 1:
      return [{ x: 0, y: 0 }, { x: H, y: 0.5 }, { x: 0, y: 1 }];
    case 2:
      return [{ x: 0, y: 0 }, v(-30), { x: 2 * H, y: 0 }, v(30)];
    case 3:
      return [v(-90), v(-30), v(30), v(90)];
    default:
      return [-90, -30, 30, 90, 150, 210].map(v);
  }
}

/**
 * A section type's bar, as the chart, the tray and Help draw it, fitted into a `box` pixels square
 * so every mark lines up whatever its shape. Decorative unless labelled.
 */
export function Mark({ role, box = 30, label }: { role: Role; box?: number; label?: string }) {
  const { shape, hollow } = BLOCK_OF[role];
  const pts = barPts(role);
  const side = sideOf(pts, 0.14);
  const b = bounds(side);
  const pad = 0.08;
  const w = b.right - b.left + 2 * pad;
  const h = b.bottom - b.top + 2 * pad;
  const unit = box / Math.max(w, h);
  return (
    <svg
      className="mark-shape"
      viewBox={`${b.left - pad} ${b.top - pad} ${w} ${h}`}
      width={w * unit}
      height={h * unit}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <polygon className={`block-side block-${shape} ${hollow ? "is-hollow" : ""}`} points={toPoints(side)} />
      <polygon className={`block block-${shape} ${hollow ? "is-hollow" : ""}`} points={toPoints(pts)} />
    </svg>
  );
}

export const toPoints = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
