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

/** Hot-to-cold color ramp for flame, in the world's palette. */
export const FLAME = ['@core', '@hot', '@warm', '@cool'] as const;
export const SPARKS = ['@core', '@spark', '@warm'] as const;
