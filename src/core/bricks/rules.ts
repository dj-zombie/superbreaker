import type { BrickKind } from '../types';

/** The level elements a player is taught, once each. Gates are taught with their switch. */
export const ELEMENT_IDS = ['fuse', 'phantom', 'switch', 'portal', 'virus'] as const;
export type ElementId = (typeof ELEMENT_IDS)[number];

export interface ElementInfo {
  name: string;
  /** The one-line rule, shown on the Briefing and the first time it appears in play. */
  rule: string;
  /** The brick kinds that show it in play. */
  kinds: readonly BrickKind[];
}

export const ELEMENT_INFO: Record<ElementId, ElementInfo> = {
  fuse: {
    name: 'Fuse',
    rule: 'Hit one and the flame runs down the cord, into any TNT.',
    kinds: ['fuse'],
  },
  phantom: {
    name: 'Phantoms',
    rule: 'They fade in and out. The ball passes through a ghost.',
    kinds: ['phantom'],
  },
  switch: {
    name: 'Switches',
    rule: 'Hit a switch to open or shut every gate of its color.',
    kinds: ['switch', 'gate'],
  },
  portal: {
    name: 'Portals',
    rule: 'In one, out its twin, at the same speed and angle.',
    kinds: ['portal'],
  },
  virus: {
    name: 'Virus',
    rule: 'The core infects the bricks it touches. Break it first.',
    kinds: ['virus'],
  },
};

/** The elements a set of brick kinds shows, in teaching order. */
export function elementsOf(kinds: Iterable<BrickKind>): ElementId[] {
  const set = new Set(kinds);
  return ELEMENT_IDS.filter((id) => ELEMENT_INFO[id].kinds.some((k) => set.has(k)));
}
