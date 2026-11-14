import Phaser from 'phaser';
import { ARENA_MID, LEVEL_OFFSET_Y, WIDTH } from '../config';
import { LEVEL_LIGHTING_DEFAULTS } from '../core/Lighting';
import {
  BREACH_ROWS,
  DESCENT_START_ROWS,
  RunState,
  WAVE_CLEAR_BONUS,
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
}

const MECHANIC_NAMES: Record<Mechanic, string> = {
  steel: 'STEEL',
  explosive: 'EXPLOSIVES',
  armored: 'ARMOR',
  mover: 'MOVERS',
  regen: 'REGROWING BRICKS',
};
/** Waves: pause between the clear and the next board dropping in. */
const WAVE_GAP_MS = 900;
const STEP_TWEEN_MS = 260;
/** Rows of warning above the danger line. */
const DANGER_ROWS = 4;

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
  /** Field clear: rows are being fed in early. */
  private feeding = false;
  /** Field clear: the bonus is paid once until bricks are back. */
  private clearPaid = false;
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
    host.setTier(this.state.tier);
    if (this.descent) this.makeDangerLine(host.scene);
    this.refreshLabel();
  }

  update(dt: number): void {
    const host = this.host;
    if (!host || !this.state.playing) return;
    const live = host.ballInPlay() && !this.between;
    if (live) this.state.tick(dt);
    if (!this.state.playing) {
      host.endRun();
      return;
    }
    if (this.descent) {
      if (this.clearPaid && host.bricks.remaining > 0) this.clearPaid = false;
      if (live && !this.stepping) {
        this.sinceStepMs += dt;
        if (this.sinceStepMs >= this.state.stepMs) this.step();
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
    host.bricks.load(this.board(tier));
    host.bricksAdded(host.bricks.bricks, true);
    this.between = false;
    this.announce(host, `WAVE ${tier}`, progress);
    this.refreshLabel();
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
        this.announce(host, `TIER ${this.state.tier}`, progress);
        host.setTier(this.state.tier);
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
    host.breach();
  }

  /** Clearing the whole field pays out and brings rows in right away. */
  private descentEmpty(): void {
    if (this.stepping || this.feeding) return;
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
    this.feeding = true;
    host.scene.time.delayedCall(400, () => {
      this.feeding = false;
      if (this.state.playing && !this.stepping) this.step();
    });
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
    if (!this.danger || !this.dangerGlow || !this.host) return;
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
