/** A brick's box, top-left corner and size, in playfield pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gap two bricks may leave and still count as touching: art and rounding are not exact. */
const SLACK = 2;

/**
 * True when two boxes share an edge, or a corner with `diagonal`. Overlapping boxes touch too;
 * boxes further apart than `SLACK` do not.
 */
export function touches(a: Rect, b: Rect, diagonal: boolean): boolean {
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  if (gapX > SLACK || gapY > SLACK) return false;
  if (diagonal) return true;
  // Edge neighbours overlap along one axis; corner neighbours only meet at a point.
  return gapX < -SLACK || gapY < -SLACK;
}

/** Steps from `start` to every box reachable through touching boxes (breadth first), -1 if none. */
export function stepsFrom(boxes: readonly Rect[], start: number, diagonal: boolean): number[] {
  const steps = boxes.map(() => -1);
  if (!boxes[start]) return steps;
  steps[start] = 0;
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    boxes.forEach((b, j) => {
      if (steps[j]! >= 0 || !touches(boxes[i]!, b, diagonal)) return;
      steps[j] = steps[i]! + 1;
      queue.push(j);
    });
  }
  return steps;
}
