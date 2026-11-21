import type { SceneryId } from '../art/backdrops';

/**
 * Named colors a preset can use instead of fixed ones, so one effect reads as forge fire in Hell,
 * spectral flame in the Crypt and plasma in the Mainframe.
 */
export interface FxPalette {
  /** White-hot core of fire and blasts. */
  core: number;
  /** Bright flame. */
  hot: number;
  /** Cooling flame and embers. */
  warm: number;
  /** Dying flame, nearly smoke. */
  cool: number;
  /** Sparks and streaks. */
  spark: number;
  /** The world's signature accent. */
  accent: number;
  accent2: number;
  /** Electric arcs. */
  volt: number;
  /** Magic, vortices, the uncanny. */
  arcane: number;
  /** Soot and dark smoke (normal blend). */
  soot: number;
  /** Steam, dust and light smoke (normal blend). */
  steam: number;
  /** Fanfare: confetti and fireworks pick from these. */
  party: readonly number[];
}

export type ColorRef = number | `@${keyof Omit<FxPalette, 'party'>}` | '@tint' | '@party';

export const FX_PALETTES: Record<SceneryId, FxPalette> = {
  hell: {
    core: 0xfff6d8,
    hot: 0xffc34a,
    warm: 0xff6a1a,
    cool: 0x8a1c08,
    spark: 0xffd27a,
    accent: 0xff8a2a,
    accent2: 0xff3c1f,
    volt: 0xffe6a0,
    arcane: 0xff4a2a,
    soot: 0x241510,
    steam: 0x9a8478,
    party: [0xffc93c, 0xff6a1a, 0xff3c1f, 0xfff1e2, 0xffd27a],
  },
  crypt: {
    core: 0xf4f0ff,
    hot: 0xc9b8ff,
    warm: 0x8a6cff,
    cool: 0x2a1c6a,
    spark: 0xe4dcff,
    accent: 0xa58cff,
    accent2: 0x7fd0ff,
    volt: 0xb8e6ff,
    arcane: 0x9a5cff,
    soot: 0x0e0c1c,
    steam: 0x8d91b8,
    party: [0xa58cff, 0x7fd0ff, 0xe4dcff, 0xffd080, 0xff8ad8],
  },
  mainframe: {
    core: 0xeaffff,
    hot: 0x8af4ff,
    warm: 0x2ad8ff,
    cool: 0x0b3f66,
    spark: 0xd8fdff,
    accent: 0x3ce7ff,
    accent2: 0xff3cbe,
    volt: 0x9afcff,
    arcane: 0xff3cbe,
    soot: 0x02121a,
    steam: 0x5f8fa0,
    party: [0x3ce7ff, 0xff3cbe, 0x5cffc0, 0xffe14d, 0xd8fdff],
  },
  carnival: {
    core: 0xfffbe8,
    hot: 0xffe14d,
    warm: 0xff8a3c,
    cool: 0x9a2a4a,
    spark: 0xfff1b0,
    accent: 0xff4d8a,
    accent2: 0x3ce7d6,
    volt: 0xd8f8ff,
    arcane: 0xc05cff,
    soot: 0x2a1a22,
    steam: 0xc8b8c0,
    party: [0xff4d4d, 0xffe14d, 0x4ddf6a, 0x3c8dff, 0xff6ad5, 0x3ce7d6],
  },
  crucible: {
    core: 0xfff4d0,
    hot: 0xffb030,
    warm: 0xff5a10,
    cool: 0x6a1004,
    spark: 0xffe0a0,
    accent: 0xff7a1a,
    accent2: 0xffd040,
    volt: 0xffeac0,
    arcane: 0xff3a10,
    soot: 0x1c0e08,
    steam: 0xa89080,
    party: [0xffc93c, 0xff7a1a, 0xffe0a0, 0xfff4d0],
  },
};

/** Resolves a color reference against a world and the caller's tint. */
export function resolveColor(ref: ColorRef, pal: FxPalette, tint: number, pick = Math.random): number {
  if (typeof ref === 'number') return ref;
  if (ref === '@tint') return tint;
  if (ref === '@party') return pal.party[Math.floor(pick() * pal.party.length)] ?? 0xffffff;
  return pal[ref.slice(1) as keyof Omit<FxPalette, 'party'>];
}
