import type Phaser from 'phaser';
import {
  BOSS_DEFEAT_BONUS,
  BOSS_PHASE_BONUS,
  BOSS_TUNING,
  BossState,
  LETHAL_GAP_MS,
  hitsFor,
  type BossEvent,
  type BossId,
} from '../core/Boss';
import type { BrickSpec } from '../core/types';
import type { Brick, BrickOwner, DestroyCause, HitOptions, HitResult } from '../entities/Brick';
import type { Paddle } from '../entities/Paddle';
import { save } from '../services';
import type { Backdrop } from './Backdrop';
import { BossBody } from './BossBody';
import type { BrickSystem } from './BrickSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { LightingSystem } from './LightingSystem';
import type { ParallaxBackdrop } from './ParallaxBackdrop';
import type { PowerupSystem } from './PowerupSystem';

/** One hit zone of a boss: a brick the boss owns. */
export interface PartDef {
  id: string;
  /** Brick cells. Rows 0 and 1 stay empty. */
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** A key of BRICK_TINT: the hit sparks, and the brick's look. */
  texture: string;
  /** Steel deflects and takes no damage. */
  kind?: 'normal' | 'steel';
  /** Pool damage multiplier, default 1. 0 soaks hits. */
  weak?: number;
  light?: BrickSpec['light'];
}

export interface PhaseDef {
  id: string;
  /** Shown after the boss's name on the HUD label. */
  title: string;
  /** The phase's pool, in plain ball hits on Normal. */
  hits: number;
}

export interface BossDef {
  id: BossId;
  name: string;
  parts: PartDef[];
  phases: PhaseDef[];
}

/** What the director needs from Play. Built from closures, like RunHost. */
export interface BossHost {
  readonly scene: Phaser.Scene;
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly scenery: ParallaxBackdrop;
  readonly backdrop: Backdrop;
  readonly powerups: PowerupSystem;
  readonly paddle: Paddle;
  /** A ball is in flight, not waiting on the paddle. */
  ballInPlay(): boolean;
  /** The physics time scale: above 1 is slower. */
  timeScale(): number;
  /** Damage a plain ball hit deals right now. */
  hitDamage(): number;
  /** New bricks joined the level; `board` is true when they replaced the old ones. */
  bricksAdded(bricks: readonly Brick[], board: boolean): void;
  /** One whole hit landed on a part: it earns what breaking a brick earns. */
  creditHit(brick: Brick, cause: DestroyCause): void;
  addScore(n: number): void;
  /** HUD label; a null detail shows the bricks left. */
  setLabel(title: string, detail: string | null): void;
  /** The boss is dead and the level is won. */
  defeated(): void;
}

/** Runs a boss fight inside Play: counts the hits on the parts, drains the pools, ends the level. */
export class BossDirector implements BrickOwner {
  /** For the debug overlay, like LightingSystem.current. */
  static current?: BossDirector;

  readonly state: BossState;
  private readonly body: BossBody;
  /** The fight clock in ms. It follows the world's time scale and stops for hit-stop. */
  private clock = 0;
  /** Hits struck since the last update. */
  private pending = 0;
  /** The part of a hit struck but not yet credited to the combo and the score. */
  private credit = 0;
  /** Fight-clock time of each part's last lethal hit. */
  private lethalAt = new Map<Brick, number>();
  private over = false;

  constructor(
    private def: BossDef,
    private host: BossHost,
    opts: { startPhase?: number } = {},
  ) {
    this.state = new BossState(
      { phases: def.phases.map((p) => ({ hits: p.hits })) },
      BOSS_TUNING[save.state.difficulty],
      { phase: opts.startPhase },
    );
    this.body = new BossBody(def.parts, host, this);
    this.showLabel();
    BossDirector.current = this;
  }

  /** False once the fight is over. */
  get active(): boolean {
    return !this.over;
  }

  get progress(): number {
    return this.state.progress;
  }

  /** Runs inside a physics callback, so it only records the hit. `update` applies it. */
  strike(brick: Brick, damage: number, cause: DestroyCause, opts: HitOptions): HitResult {
    if (this.state.step !== 'fight') return 'immune';
    const part = this.body.partOf(brick);
    // Only a part of this body is struck here; anything else takes nothing.
    if (!part) return 'immune';
    if (opts.lethal) {
      // Without the gap a black hole would land a lethal hit on every pull, 120 ms apart.
      const last = this.lethalAt.get(brick);
      if (last !== undefined && this.clock - last < LETHAL_GAP_MS) return 'immune';
      this.lethalAt.set(brick, this.clock);
    }
    const weak = part.weak ?? 1;
    if (weak === 0) return 'armor';
    const hit = { cause, damage, lethal: opts.lethal, stripArmor: opts.stripArmor };
    const hits = hitsFor(hit, this.host.hitDamage()) * weak;
    this.pending += hits;
    this.credit += hits;
    while (this.credit >= 1) {
      this.credit--;
      this.host.creditHit(brick, cause);
    }
    return 'damaged';
  }

  update(dt: number): void {
    if (this.over) return;
    if (!this.host.juice.inHitStop) this.clock += dt / this.host.timeScale();
    if (this.pending === 0) return;
    const hits = this.pending;
    this.pending = 0;
    for (const e of this.state.damage(hits)) this.react(e);
  }

  /** Dev tools: deals hits as if they had landed. */
  debugHit(hits: number): void {
    this.pending += hits;
  }

  destroy(): void {
    if (BossDirector.current === this) BossDirector.current = undefined;
  }

  private react(e: BossEvent): void {
    if (e.type === 'phase') {
      this.host.addScore(BOSS_PHASE_BONUS);
      this.showLabel();
    } else if (e.step === 'finale') {
      this.finish();
    }
  }

  /** The boss is dead: its parts go, the arena clears and the level ends. */
  private finish(): void {
    this.body.retire(...this.def.parts.map((p) => p.id));
    this.host.bricks.shatterBelow(-Infinity);
    this.host.addScore(BOSS_DEFEAT_BONUS);
    this.over = true;
    this.host.defeated();
  }

  private showLabel(): void {
    const phase = this.def.phases[this.state.phase]!;
    this.host.setLabel(this.def.name.toUpperCase(), phase.title.toUpperCase());
  }
}
