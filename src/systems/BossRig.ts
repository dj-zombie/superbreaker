import type Phaser from 'phaser';
import type { BossAnim } from '../core/Boss';
import type { JuiceSystem } from './JuiceSystem';
import type { LightingSystem } from './LightingSystem';
import type { ParallaxBackdrop } from './ParallaxBackdrop';

/** What a rig is built with: the live systems, and where the parts stand at rest. */
export interface RigContext {
  readonly scene: Phaser.Scene;
  readonly lighting: LightingSystem;
  readonly juice: JuiceSystem;
  readonly scenery: ParallaxBackdrop;
  /** Centre of the box around every part at rest, in field px. */
  readonly anchor: { x: number; y: number };
  /** Rest centre of every part, in field px, by part id. */
  readonly homes: ReadonlyMap<string, { x: number; y: number }>;
  /** A part's health left, 0..1, or undefined for one without its own. */
  health(part: string): number | undefined;
  /** A sound, panned toward `x` when given. */
  sfx(key: string, volume: number, detune?: number, x?: number): void;
  /** The reduced-motion setting. */
  readonly calm: boolean;
}

/**
 * A boss drawn in pieces, as an alternative to one sprite sheet: it is told what the body does
 * and draws it however it likes. It holds no rules; the parts under it are the hit zones.
 */
export interface BossRig {
  /** Where the camera should look: the middle of what is drawn. */
  readonly focus: { x: number; y: number };
  /**
   * Called every frame. `at` is the body's centre now and `parts` the centre of every standing
   * part, by id. `dt` is fight-clock ms.
   */
  place(at: { x: number; y: number }, parts: ReadonlyMap<string, { x: number; y: number }>, dt: number): void;
  /** The animation the fight wants now. Called every frame; act on changes. */
  show(anim: BossAnim): void;
  /** A counted hit landed. */
  flinch(): void;
  /** The entrance, 0..1. */
  arrive(k: number): void;
  /** The boss is dead and the award is coming: take the picture away. */
  fade(): void;
  /** A part with health of its own broke. Its brick is already gone. */
  broken(part: string): void;
  /** Beats into the music, or a steady count when none plays. Called every frame. */
  beat(beats: number): void;
  /** How far the fight is, 0 at the start and 1 at the kill. Called every frame. */
  progress(k: number): void;
  destroy(): void;
}

/** A rig's textures and how to build it. BossBody loads the first and calls the second. */
export interface RigFactory {
  assets: ReadonlyArray<{ key: string; path: string }>;
  create(ctx: RigContext): BossRig;
}
