import Phaser from 'phaser';
import { ARENA_MID, LEVEL_OFFSET_Y, WIDTH } from '../config';
import { arcadeBonusFor, type BonusId } from '../core/Bonus';
import { LEVEL_LIGHTING_DEFAULTS, type LevelLightingSpec } from '../core/Lighting';
import { hashSeed } from '../core/Rng';
import {
  BOSS_EVERY_TIERS,
  BREACH_ROWS,
  DESCENT_RUSH_ROWS,
  DESCENT_START_ROWS,
  RunState,
  WAVE_CLEAR_BONUS,
  descentStepMs,
  isBossTier,
  isDarkTier,
  type RunConfig,
  type RunProgress,
} from '../core/Run';
import { MECHANICS, MECHANIC_UNLOCK, type Mechanic } from '../core/procgen/curve';
import { CHUNK_MECHANICS, generateBoard, generateChunk } from '../core/procgen/generate';
import { BH } from '../core/procgen/grid';
import { LEVEL_MAX_Y, type BrickSpec, type LevelSpec } from '../core/types';
import type { Brick } from '../entities/Brick';
import { audio } from './AudioSystem';
import type { BrickSystem } from './BrickSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { LightingSystem } from './LightingSystem';

/** What the director needs from Play. */
export interface RunHost {
  readonly scene: Phaser.Scene;
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  /** A ball is in flight, not waiting on the paddle. */
  ballInPlay(): boolean;
  /** Clears the balls and puts a fresh one on the paddle for an aimed launch. */
  rearm(): void;
  /** New bricks joined the level; `board` is true when they replaced the old ones. */
  bricksAdded(bricks: readonly Brick[], board: boolean): void;
  addScore(n: number): void;
  addLife(): void;
  /** Ball speeds follow the tier. */
  setTier(tier: number): void;
  /** Descent: a brick crossed the danger line. */
  breach(): void;
  /** The run reached its goal or ran out of time. */
  endRun(): void;
  /** HUD label; a null detail shows the bricks left. */
  setLabel(title: string, detail: string | null): void;
  /** The room's light changes for the next round: lights out, or back on. */
  relook(lighting: LevelLightingSpec): void;
  /** A boss fight begins on the field as it stands. Its plans draw from `seed`. */
  startBoss(tier: number, seed: number): void;
  /** Bonus stage `id` begins on the field the boss left. Its layout draws from `seed`. */
  startBonus(id: BonusId, seed: number): void;
}

const MECHANIC_NAMES: Record<Mechanic, string> = {
  steel: 'STEEL',
  explosive: 'EXPLOSIVES',
  armored: 'ARMOR',
  mover: 'MOVERS',
  regen: 'REGROWING BRICKS',
  fuse: 'FUSES',
  phantom: 'PHANTOMS',
  portal: 'PORTALS',
  virus: 'VIRUS',
};
/** Waves: pause between the clear and the next board dropping in. */
const WAVE_GAP_MS = 900;
const STEP_TWEEN_MS = 260;
/** Rows of warning above the danger line. */
const DANGER_ROWS = 4;
/** Descent: ms between the rows rushed in after a clear, on top of each step's own tween. */
const RUSH_STEP_MS = 120;
/** A dark round shows its layout this long, in seconds, before the lights go. */
const DARK_PREVIEW_S = 1.5;

const LIT: LevelLightingSpec = { ...LEVEL_LIGHTING_DEFAULTS };
const DARK: LevelLightingSpec = { ...LEVEL_LIGHTING_DEFAULTS, lightsOut: true, previewTime: DARK_PREVIEW_S };
/** A boss round is lit the way the boss lab is: lights out, with lightning. */
const BOSS_ROOM: LevelLightingSpec = { ...LEVEL_LIGHTING_DEFAULTS, lightsOut: true, lightning: true };
/** The bonus round after a boss is lit the way the gallery map is: a party. */
const BONUS_ROOM: LevelLightingSpec = { ...LEVEL_LIGHTING_DEFAULTS, mood: 'party' };

/** Runs an Arcade run inside Play: wave transitions, Descent steps, the clock and the end. */
export class RunDirector {
  readonly state: RunState;
  private host?: RunHost;
  private nextId = 1;
  private between = false;
  // Descent
  private queue: BrickSpec[][] = [];
  private chunkIndex = 0;
  private sinceStepMs = 0;
  private stepping = false;
  /** Rows still to rush in, one right after another, after a clear. */
  private rush = 0;
  /** Bricks on the field when the run began: what a full field holds. */
  private fullCount = 1;
  /** Field clear: the bonus is paid once until bricks are back. */
  private clearPaid = false;
  /** A boss fight, or the bonus round after it, has the field: no steps, no clock, no danger line. */
  private bossing = false;
  /** The bonus round after a boss is on. */
  private bonusing = false;
  /** How the room is lit now, so a round that keeps the light leaves it alone. */
  private room: LevelLightingSpec = LIT;
  /** Screen y of brick row 0, captured at the start so a resize can't misalign new rows. */
  private top = LEVEL_OFFSET_Y;
  private danger?: Phaser.GameObjects.Rectangle;
  private dangerGlow?: Phaser.GameObjects.Rectangle;
  private near = 0;

  constructor(readonly config: RunConfig) {
    this.state = new RunState(config);
  }

  get descent(): boolean {
    return this.config.loop === 'descent';
  }

  /** Descent: how close the formation is to the danger line, 0..1. */
  get threat(): number {
    return this.near;
  }

  private get dangerY(): number {
    return this.top + LEVEL_MAX_Y;
  }

  /** The level Play opens with. */
  firstLevel(): LevelSpec {
    if (!this.descent) return this.board(1);
    this.refill(DESCENT_START_ROWS);
    const rows = this.queue.splice(0, DESCENT_START_ROWS);
    const bricks = rows.flatMap((row, i) =>
      row.map((b) => ({ ...b, y: (DESCENT_START_ROWS - 1 - i) * BH })),
    );
    return {
      id: `arcade-${this.config.seed.toString(36)}-descent`,
      title: 'Descent',
      bricks,
      lights: [],
      lighting: { ...LEVEL_LIGHTING_DEFAULTS },
    };
  }

  /** Call once the level is built. */
  attach(host: RunHost): void {
    this.host = host;
    this.top = LEVEL_OFFSET_Y;
    this.fullCount = Math.max(1, host.bricks.remaining);
    host.setTier(this.state.tier);
    if (this.descent) this.makeDangerLine(host.scene);
    this.refreshLabel();
  }

  /** The boss's award is over: a bonus round plays on the field it left, with the clock still held. */
  onBossDefeated(): void {
    const host = this.host;
    if (!host || !this.bossing || this.bonusing) return;
    this.bonusing = true;
    this.relight(host, BONUS_ROOM);
    host.rearm();
    const tier = this.state.tier;
    host.startBonus(arcadeBonusFor(tier / BOSS_EVERY_TIERS), hashSeed(this.config.seed, 'bonus', tier));
  }

  /** The bonus round's tally is over: Waves counts the wave as cleared, Descent rushes rows back in. */
  onBonusDone(): void {
    const host = this.host;
    if (!host || !this.bonusing) return;
    this.bonusing = false;
    this.bossing = false;
    if (!this.descent) {
      // The party ends with the round, not with the next wave's drop.
      this.relight(host, LIT);
      this.waveCleared(host);
      return;
    }
    this.light(host, this.state.tier);
    host.rearm();
    // The boss left an empty field: the rows come straight back, and the clear pays nothing.
    this.clearPaid = true;
    this.rush = DESCENT_RUSH_ROWS;
    this.sinceStepMs = 0;
    this.announce(host, `TIER ${this.state.tier}`, { tierUp: true, extraLife: false });
    this.refreshLabel();
  }

  update(dt: number): void {
    const host = this.host;
    if (!host || !this.state.playing) return;
    // A boss fight stops the clock: it is a round of its own, not time taken from the run.
    const live = host.ballInPlay() && !this.between && !this.bossing;
    if (live) this.state.tick(dt);
    if (!this.state.playing) {
      host.endRun();
      return;
    }
    if (this.descent && !this.bossing) {
      if (this.clearPaid && host.bricks.remaining > 0) this.clearPaid = false;
      // Rows rushed in after a clear come whether or not a ball is in play.
      if ((live || this.rush > 0) && !this.stepping) {
        this.sinceStepMs += dt;
        const due =
          this.rush > 0
            ? RUSH_STEP_MS
            : descentStepMs(this.state.tier, host.bricks.remaining / this.fullCount);
        if (this.sinceStepMs >= due) {
          if (this.rush > 0) this.rush--;
          this.step();
        }
      }
      this.drawDanger();
    }
  }

  /** Play calls this every frame the level has no breakable bricks left. */
  onBoardEmpty(): void {
    if (!this.host || !this.state.playing || this.between) return;
    if (this.descent) this.descentEmpty();
    else this.waveCleared(this.host);
  }

  onOutOfLives(): void {
    this.state.onOutOfLives();
  }

  // ---------------------------------------------------------------- Waves

  private board(tier: number): LevelSpec {
    const board = generateBoard(this.config.seed, tier, this.nextId);
    this.nextId = board.nextId;
    return board.level;
  }

  private waveCleared(host: RunHost): void {
    const cleared = this.state.tier;
    const bonus = WAVE_CLEAR_BONUS * cleared;
    const progress = this.state.onWaveCleared();
    host.addScore(bonus);
    host.juice.popText(WIDTH / 2, ARENA_MID - 50, `WAVE ${cleared} CLEAR`, '#ffc93c', 30);
    host.juice.popText(WIDTH / 2, ARENA_MID - 10, `+${bonus.toLocaleString()}`, '#ffffff', 22);
    host.lighting.pulse(0xfff0b0, 0.3);
    if (!this.state.playing) {
      host.endRun();
      return;
    }
    audio.sfx('wave_clear', 0.5);
    this.between = true;
    host.rearm();
    host.scene.time.delayedCall(WAVE_GAP_MS, () => this.nextWave(host, progress));
  }

  private nextWave(host: RunHost, progress: RunProgress): void {
    if (!this.state.playing) return;
    const tier = this.state.tier;
    host.setTier(tier);
    if (isBossTier(tier)) {
      // The boss's wave is an empty arena: the boss brings its own bricks.
      host.bricks.load(this.arena(tier));
      host.bricksAdded(host.bricks.bricks, true);
      this.between = false;
      this.bossRound(host);
      return;
    }
    this.light(host, tier);
    host.bricks.load(this.board(tier));
    host.bricksAdded(host.bricks.bricks, true);
    this.between = false;
    this.announce(host, `WAVE ${tier}`, progress);
    this.refreshLabel();
  }

  /** A level with no bricks, lit like a boss's room, for the wave a boss fights in. */
  private arena(tier: number): LevelSpec {
    return {
      id: `arcade-${this.config.seed.toString(36)}-boss-${tier}`,
      title: 'Boss',
      bricks: [],
      lights: [],
      lighting: { ...BOSS_ROOM },
    };
  }

  /** The field goes to a boss: the lights go out and the fight begins with the ball held. */
  private bossRound(host: RunHost): void {
    this.bossing = true;
    this.rush = 0;
    this.danger?.setAlpha(0);
    this.dangerGlow?.setAlpha(0);
    // Descent's formation goes; a boss needs the field to itself.
    if (this.descent) host.bricks.shatterBelow(-Infinity);
    this.relight(host, BOSS_ROOM);
    host.rearm();
    this.refreshLabel();
    const tier = this.state.tier;
    host.startBoss(tier, hashSeed(this.config.seed, 'boss', tier));
  }

  /** Lights the room for a round: out on the seed's dark rounds, on otherwise. */
  private light(host: RunHost, tier: number): void {
    const dark = isDarkTier(this.config.seed, tier);
    if (dark && this.room !== DARK) {
      host.juice.popText(WIDTH / 2, ARENA_MID + 70, 'LIGHTS OUT', '#9fb4ff', 22);
    }
    this.relight(host, dark ? DARK : LIT);
  }

  private relight(host: RunHost, room: LevelLightingSpec): void {
    if (room === this.room) return;
    this.room = room;
    host.relook(room);
  }

  /** Tier banner, plus the mechanic it unlocks and any extra life. */
  private announce(host: RunHost, title: string, progress: RunProgress): void {
    const tier = this.state.tier;
    host.juice.popText(WIDTH / 2, ARENA_MID - 40, title, '#7fe9ff', 34);
    const pool = this.descent ? CHUNK_MECHANICS : MECHANICS;
    const fresh = pool.find((m) => MECHANIC_UNLOCK[m] === tier);
    if (fresh)
      host.juice.popText(WIDTH / 2, ARENA_MID, `NEW: ${MECHANIC_NAMES[fresh]}`, '#ff5cf0', 20);
    if (progress.extraLife) {
      host.addLife();
      host.juice.popText(WIDTH / 2, ARENA_MID + 34, 'EXTRA LIFE', '#7dff8a', 20);
      audio.sfx('sfx_extra_life', 0.5);
    }
  }

  // ---------------------------------------------------------------- Descent

  /** Keeps at least `min` rows waiting, generating chunks at the current tier. */
  private refill(min: number): void {
    while (this.queue.length < min) {
      const chunk = generateChunk(
        this.config.seed,
        this.chunkIndex++,
        this.state.tier,
        this.nextId,
      );
      this.nextId = chunk.nextId;
      // Rows enter bottom first, so the chunk scrolls in the way it was drawn.
      this.queue.push(...[...chunk.rows].reverse());
    }
  }

  private step(): void {
    const host = this.host!;
    this.sinceStepMs = 0;
    this.stepping = true;
    host.bricks.shiftDown(BH, STEP_TWEEN_MS);
    this.refill(1);
    const row = this.queue.shift()!;
    host.scene.time.delayedCall(STEP_TWEEN_MS, () => {
      this.stepping = false;
      if (!this.state.playing) return;
      const offset = this.top - LEVEL_OFFSET_Y;
      const added = host.bricks.append(row.map((b) => ({ ...b, y: offset })));
      if (added.length) host.bricksAdded(added, false);
      const progress = this.state.onRowSurvived();
      this.refreshLabel();
      if (!this.state.playing) {
        host.endRun();
        return;
      }
      if (progress.tierUp) {
        host.setTier(this.state.tier);
        // The extra life a boss tier could bring comes with the tier after it, never on one.
        if (isBossTier(this.state.tier)) {
          this.bossRound(host);
          return;
        }
        this.announce(host, `TIER ${this.state.tier}`, progress);
        this.light(host, this.state.tier);
      }
      this.checkBreach(host);
    });
  }

  private checkBreach(host: RunHost): void {
    const bottom = host.bricks.lowestBottom();
    if (bottom <= this.dangerY) return;
    host.bricks.shatterBelow(bottom - BREACH_ROWS * BH);
    host.juice.popText(WIDTH / 2, this.dangerY - 40, 'BREACH!', '#ff4d6d', 30);
    host.juice.shake(300, 0.012);
    audio.sfx('breach', 0.5);
    audio.duck(0.4, 250);
    host.breach();
  }

  /** Clearing the whole field pays out and rushes rows straight back in. */
  private descentEmpty(): void {
    if (this.bossing || this.rush > 0) return;
    const host = this.host!;
    if (!this.clearPaid) {
      this.clearPaid = true;
      const bonus = WAVE_CLEAR_BONUS * this.state.tier;
      host.addScore(bonus);
      host.juice.popText(
        WIDTH / 2,
        ARENA_MID - 30,
        `FIELD CLEAR +${bonus.toLocaleString()}`,
        '#ffc93c',
        26,
      );
      audio.sfx('field_clear', 0.5);
    }
    this.rush = DESCENT_RUSH_ROWS;
    this.sinceStepMs = 0;
  }

  private makeDangerLine(scene: Phaser.Scene): void {
    this.dangerGlow = scene.add
      .rectangle(0, this.dangerY, WIDTH, DANGER_ROWS * BH, 0xff2a3a, 0.12)
      .setOrigin(0, 1)
      .setDepth(1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.danger = scene.add
      .rectangle(0, this.dangerY, WIDTH, 2, 0xff4d6d, 0.5)
      .setOrigin(0, 0.5)
      .setDepth(2);
  }

  /** The line glows harder as the formation closes in. */
  private drawDanger(): void {
    if (!this.danger || !this.dangerGlow || !this.host || this.bossing) return;
    const gap = this.dangerY - this.host.bricks.lowestBottom();
    const near = Phaser.Math.Clamp(1 - gap / (DANGER_ROWS * BH), 0, 1);
    this.near = near;
    const beat = 0.5 + 0.5 * Math.sin(this.host.scene.time.now / (near > 0.5 ? 90 : 220));
    this.danger.setAlpha(0.35 + 0.65 * near * beat);
    this.dangerGlow.setAlpha(near * (0.4 + 0.6 * beat));
  }

  // ---------------------------------------------------------------- HUD

  private refreshLabel(): void {
    const host = this.host;
    if (!host) return;
    const s = this.state;
    const goal = this.config.goal;
    const of = goal.kind === 'rounds' ? `/${goal.rounds}` : '';
    if (this.descent) host.setLabel(`TIER ${s.tier}${of}`, `ROW ${s.reach}`);
    else host.setLabel(`WAVE ${s.tier}${of}`, null);
  }
}
