/** Portal pairs. Both ends of a link share its color. */
export const LINKS = [1, 2, 3] as const;
export type Link = (typeof LINKS)[number];

/** Orange, blue and violet. */
export const LINK_COLORS: Record<Link, number> = {
  1: 0xff8a2a,
  2: 0x3c9dff,
  3: 0xb45cff,
};

export const PORTAL_WIDTH = 30;
export const PORTAL_HEIGHT = 32;

/** After a jump, a ball ignores both ends of the pair this long, so it can't bounce between them. */
export const PORTAL_COOLDOWN_MS = 300;

/** Room left between the twin's edge and the ball as it comes out. */
const EXIT_GAP = 2;

export function asLink(v: number | undefined): Link {
  const n = Math.round(v ?? 1);
  return (LINKS as readonly number[]).includes(n) ? (n as Link) : 1;
}

export interface PortalBox {
  /** Center. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True once a ball's center is inside the portal, which is when it jumps. */
export function insidePortal(portal: PortalBox, x: number, y: number): boolean {
  return Math.abs(x - portal.x) < portal.width / 2 && Math.abs(y - portal.y) < portal.height / 2;
}

/**
 * Where a ball of `radius` comes out of `exit` while moving along (vx, vy): from the twin's center
 * along its heading, just clear of the twin's edge, so it keeps its speed and angle.
 */
export function portalExit(
  exit: PortalBox,
  vx: number,
  vy: number,
  radius: number,
): { x: number; y: number } {
  const len = Math.hypot(vx, vy);
  const dx = len > 0 ? vx / len : 0;
  const dy = len > 0 ? vy / len : -1;
  const tx = dx !== 0 ? exit.width / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? exit.height / 2 / Math.abs(dy) : Infinity;
  const reach = Math.min(tx, ty) + radius + EXIT_GAP;
  return { x: exit.x + dx * reach, y: exit.y + dy * reach };
}

/** Authoring problems with a level's portals: every link needs exactly two ends. */
export function portalIssues(portals: ReadonlyArray<{ id: number; link: Link }>): string[] {
  const issues: string[] = [];
  for (const link of LINKS) {
    const ends = portals.filter((p) => p.link === link);
    if (ends.length !== 0 && ends.length !== 2) {
      issues.push(
        `Portal link ${link} has ${ends.length} ends (${ends.map((p) => p.id).join(', ')}), not 2`,
      );
    }
  }
  return issues;
}
