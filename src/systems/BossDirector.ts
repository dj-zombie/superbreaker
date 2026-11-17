import type Phaser from 'phaser';
import {
  BODY_MAX_SPEED,
  BODY_SCENE_SPEED,
  BOSS_DEFEAT_BONUS,
  BOSS_PHASE_BONUS,
  BOSS_TUNING,
  BossState,
  HURT_GAP_MS,
  HURT_MS,
  LETHAL_GAP_MS,
  hitsFor,
  type BossEvent,
  type BossId,
  type Motion,
  type SpriteDef,
} from '../core/Boss';
import type { BrickSpec } from '../core/types';
import type { Brick, BrickOwner, DestroyCause, HitOptions, HitResult } from '../entities/Brick';
import type { Paddle } from '../entities/Paddle';
import { save } from '../services';
import { calm } from '../ui/theme';
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

/** Where parts stand away from rest: part id to an offset in px. A part left out stays at rest. */
export type Pose = Record<string, { dx?: number; dy?: number }>;

/** A brick for the arena. The framework gives it its id. */
export type ArenaBrick = Omit<BrickSpec, 'id'>;

export interface PhaseDef {
  id: string;
  /** Shown after the boss's name on the HUD label. */
  title: string;
  /** The phase's pool, in plain ball hits on Normal. */
  hits: number;
  /** The pose the parts hold through the phase. Rest when left out. */
  pose?: string;
  /** How the whole body moves through the phase. Still when left out. */
  motion?: Motion;
  /** State changes for the phase. It also runs when a fight starts past this phase. */
  setup?(s: BossStage): void;
}

export interface BossDef {
  id: BossId;
  name: string;
  parts: PartDef[];
  /** The picture drawn over the parts. Without one the parts show as bricks. */
  sprite?: SpriteDef;
  poses?: Record<string, Pose>;
  phases: PhaseDef[];
}

/** What phase hooks get: the live systems, plus what the fight owns. */
export interface BossStage {
  readonly scene: Phaser.Scene;
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly scenery: ParallaxBackdrop;
  readonly powerups: PowerupSystem;
  readonly paddle: Paddle;
  /** The reduced-motion setting. */
  readonly calm: boolean;
  /** Centre of the body, now. */
  readonly center: { x: number; y: number };
  /** The brick standing in for a part, or undefined once it is retired. */
  part(id: string): Brick | undefined;
  /** Sets the pose the parts move to. Null is the phase's own pose. */
  pose(id: string | null): void;
  retire(...partIds: string[]): void;
  /** Adds ordinary bricks to the arena: they break, score and drop. */
  spawn(bricks: ArenaBrick[]): Brick[];
}

/** The boss's health bar, on HudState.boss. */
export interface BossHud {
  name: string;
  title: string;
  /** The current phase, counted from 0. */
  phase: number;
  phases: number;
  /** 0..1 of the current phase's pool. */
  health: number;
  /** False until the reveal. */
  shown: boolean;
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
  /** The health bar. Null takes it down. */
  setHud(view: BossHud | null): void;
}

/** Dev builds only: `&phase=2` starts the fight in its second phase. Counted from 0 here. */
export const FORCED_BOSS_PHASE = ((): number | undefined => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const n = Number(new URLSearchParams(location.search).get('phase'));
  return Number.isInteger(n) && n >= 1 ? n - 1 : undefined;
})();

/** A body with no motion stays here. */
const REST = { x: 0, y: 0 } as const;

/** Runs a boss fight inside Play: counts the hits on the parts, drains the pools, ends the level. */
export class BossDirector implements BrickOwner {
  /** For the debug overlay, like LightingSystem.current. */
  static current?: BossDirector;

  readonly state: BossState;
  /** Dev tools: frames in which a free ball's centre sat inside a part. It should stay 0. */
  embedded = 0;
  private readonly body: BossBody;
  private readonly stage: BossStage;
  /** What the HUD draws. One object, kept up to date, so a frame allocates nothing. */
  private readonly view: BossHud = {
    name: '',
    title: '',
    phase: 0,
    phases: 0,
    health: 1,
    shown: true,
  };
  /** The fight clock in ms. It follows the world's time scale and stops for hit-stop. */
  private clock = 0;
  /** Hits struck since the last update. */
  private pending = 0;
  /** The part of a hit struck but not yet credited to the combo and the score. */
  private credit = 0;
  /** Fight-clock time of each part's last lethal hit. */
  private lethalAt = new Map<Brick, number>();
  /** Fight-clock time the last flinch began. */
  private hurtAt = -Infinity;
  private over = false;

  constructor(
    readonly def: BossDef,
    private host: BossHost,
    opts: { startPhase?: number } = {},
  ) {
    this.state = new BossState(
      { phases: def.phases.map((p) => ({ hits: p.hits })) },
      BOSS_TUNING[save.state.difficulty],
      { phase: opts.startPhase },
    );
    this.body = new BossBody(def, host, this);
    this.stage = this.makeStage();
    // A fight that starts part-way has still been through the phases before it.
    for (let i = 0; i < this.state.phase; i++) def.phases[i]!.setup?.(this.stage);
    this.enterPhase();
    // Nothing is in play yet, so the body starts where its pose and motion put it.
    this.body.move(this.offset(), Infinity);
    // The HUD is built before the first update, and it looks for the bar then.
    this.showHud();
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
    // Everything below runs on the fight clock, so slow motion and hit-stop hold the boss too.
    const tick = this.host.juice.inHitStop ? 0 : dt / this.host.timeScale();
    this.clock += tick;
    if (this.pending > 0) {
      const hits = this.pending;
      this.pending = 0;
      if (this.clock - this.hurtAt >= HURT_GAP_MS) {
        this.hurtAt = this.clock;
        this.body.flinch();
      }
      for (const e of this.state.damage(hits)) this.react(e);
      if (this.over) return;
    }
    const speed = this.host.ballInPlay() ? BODY_MAX_SPEED : BODY_SCENE_SPEED;
    this.body.move(this.offset(), (speed * tick) / 1000);
    this.body.show(this.clock - this.hurtAt < HURT_MS ? 'hurt' : 'idle');
    this.showHud();
  }

  /** Dev tools: deals hits as if they had landed. */
  debugHit(hits: number): void {
    this.pending += hits;
  }

  /** Dev tools: counts this frame as embedded when one of the points is inside a part. */
  debugProbe(points: ReadonlyArray<{ x: number; y: number }>): void {
    if (!this.over && points.some((p) => this.body.holds(p.x, p.y))) this.embedded++;
  }

  destroy(): void {
    this.body.destroy();
    if (BossDirector.current === this) BossDirector.current = undefined;
  }

  private react(e: BossEvent): void {
    if (e.type === 'phase') {
      this.host.addScore(BOSS_PHASE_BONUS);
      this.enterPhase();
    } else if (e.step === 'finale') {
      this.finish();
    }
  }

  /** The current phase begins: its setup runs, the body takes its pose and the label names it. */
  private enterPhase(): void {
    const phase = this.def.phases[this.state.phase]!;
    phase.setup?.(this.stage);
    this.pose(null);
    this.host.setLabel(this.def.name.toUpperCase(), phase.title.toUpperCase());
  }

  /** Null is the phase's own pose. A phase without one, or a pose nobody defined, is rest. */
  private pose(id: string | null): void {
    const name = id ?? this.def.phases[this.state.phase]!.pose;
    this.body.pose(name === undefined ? undefined : this.def.poses?.[name]);
  }

  /** Where the phase's motion puts the body now, from rest. */
  private offset(): { x: number; y: number } {
    return this.def.phases[this.state.phase]!.motion?.(this.clock) ?? REST;
  }

  /** The boss is dead: its parts go, the arena clears and the level ends. */
  private finish(): void {
    this.body.retire(...this.def.parts.map((p) => p.id));
    this.body.fade();
    this.host.bricks.shatterBelow(-Infinity);
    this.host.addScore(BOSS_DEFEAT_BONUS);
    this.over = true;
    this.host.setHud(null);
    this.host.defeated();
  }

  private showHud(): void {
    const { state, view } = this;
    view.name = this.def.name;
    view.title = this.def.phases[state.phase]!.title;
    view.phase = state.phase;
    view.phases = this.def.phases.length;
    view.health = state.pool / state.poolMax;
    this.host.setHud(view);
  }

  private makeStage(): BossStage {
    const { host, body } = this;
    return {
      scene: host.scene,
      bricks: host.bricks,
      juice: host.juice,
      lighting: host.lighting,
      scenery: host.scenery,
      powerups: host.powerups,
      paddle: host.paddle,
      get calm() {
        return calm();
      },
      get center() {
        return body.center;
      },
      part: (id) => body.part(id),
      pose: (id) => this.pose(id),
      retire: (...ids) => body.retire(...ids),
      spawn: (bricks) => body.spawn(bricks),
    };
  }
}
