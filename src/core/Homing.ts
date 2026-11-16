/** A brick or wall the homing assist can see: center plus half extents. */
export interface HomingBox {
  readonly x: number;
  readonly y: number;
  readonly halfW: number;
  readonly halfH: number;
}

/**
 * Nearest breakable brick above the ball that the ball can fly toward without crossing steel.
 *
 * Unbreakable bricks never attract the ball. A brick sitting on top of steel is skipped, so the
 * assist does not bend the ball into the wall; a brick lined up with a gap still draws it through.
 * Returns null when every brick above is walled off — the ball keeps its current path instead.
 *
 * `pad` grows each wall (use the ball radius) so a path that would clip the ball into steel is
 * treated as blocked.
 */
export function pickHomingTarget(
  ballX: number,
  ballY: number,
  targets: readonly HomingBox[],
  walls: readonly HomingBox[],
  pad = 0,
): HomingBox | null {
  let best: HomingBox | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (t.y >= ballY) continue;
    const d = (t.x - ballX) ** 2 + (t.y - ballY) ** 2;
    if (d >= bestD) continue;
    if (walls.length && pathBlocked(ballX, ballY, t.x, t.y, walls, pad)) continue;
    best = t;
    bestD = d;
  }
  return best;
}

/**
 * True when walls box the target in on the left, the right and above, like a brick inside a steel
 * frame. The ball can only get at it through a door.
 */
export function isGuarded(t: HomingBox, walls: readonly HomingBox[]): boolean {
  let left = false;
  let right = false;
  let above = false;
  for (const w of walls) {
    const sameRow = Math.abs(w.y - t.y) < w.halfH + t.halfH - 0.5;
    const sameCol = Math.abs(w.x - t.x) < w.halfW + t.halfW - 0.5;
    if (sameRow && w.x < t.x) left = true;
    else if (sameRow && w.x > t.x) right = true;
    if (sameCol && w.y < t.y) above = true;
    if (left && right && above) return true;
  }
  return false;
}

/** Share of the targets, 0..1, that walls box in. */
export function guardedShare(targets: readonly HomingBox[], walls: readonly HomingBox[]): number {
  if (!targets.length || !walls.length) return 0;
  let n = 0;
  for (const t of targets) if (isGuarded(t, walls)) n++;
  return n / targets.length;
}

/** True when the segment from the ball to the target crosses any wall, padding included. */
function pathBlocked(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  walls: readonly HomingBox[],
  pad: number,
): boolean {
  for (const w of walls) {
    if (segmentHitsRect(x0, y0, x1, y1, w.x, w.y, w.halfW + pad, w.halfH + pad)) return true;
  }
  return false;
}

/** Liang–Barsky: the segment overlaps the axis-aligned rect, edges included. */
function segmentHitsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const ps = [-dx, dx, -dy, dy];
  const qs = [x0 - (cx - halfW), cx + halfW - x0, y0 - (cy - halfH), cy + halfH - y0];
  for (let i = 0; i < 4; i++) {
    const p = ps[i]!;
    const q = qs[i]!;
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else if (t < t0) {
      return false;
    } else if (t < t1) {
      t1 = t;
    }
  }
  return t0 <= t1;
}
