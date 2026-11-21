import { Heat, Turbulence, Wind } from '../processors';

/** Stateless forces shared by many presets. */
export const swirl = new Turbulence(70, 1);
export const flutterAir = new Turbulence(110, 2.2);
export const lazySwirl = new Turbulence(28, 0.6);
export const flameLift = new Heat(230);
export const smokeLift = new Heat(70);
export const emberLift = new Heat(90);
export const breeze = new Wind(30, 40, 5);
export const gale = new Wind(-120, 60, 3);

export const drift = new Turbulence(40, 0.8);
export const rainWind = new Wind(-60, 50, 6);

/** Hot-to-cold color ramp for flame, in the world's palette. */
export const FLAME = ['@core', '@hot', '@warm', '@cool'] as const;
export const SPARKS = ['@core', '@spark', '@warm'] as const;

/** Fixed materials that read the same in every world. */
export const GOLD = [0xfff3b0, 0xffc93c, 0xe0931f] as const;
export const STEEL = [0xffffff, 0xcfe0f0, 0x8fa4b8] as const;
export const ICE = [0xffffff, 0xcff4ff, 0x7fd6ff] as const;
export const ACID = [0xf4ffb0, 0xa8ff3c, 0x3fbf2a] as const;
export const BRASS = 0xd9a441;
export const HEART = [0xffffff, 0xff9ac0, 0xff4d7d] as const;
