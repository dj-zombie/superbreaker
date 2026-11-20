import Phaser from 'phaser';
import type { SceneryId } from '../art/backdrops';
import { LEVEL_OFFSET_Y, PADDLE_Y, WIDTH } from '../config';
import {
  BonusState,
  INTRO_MS,
  TALLY_LEAD_MS,
  rewardFor,
  starsFor,
  tallyValue,
  type BonusEvent,
  type BonusId,
  type BonusReward,
  type BonusStats,
  type BonusStep,
  type Medal,
  type MedalBy,
  type Penalty,
  type TallyRow,
  type TallyRowTime,
} from '../core/Bonus';
import { DEFAULT_GATLING, Gatling, type GatlingSpec } from '../core/Gatling';
import { fall, type Path } from '../core/Motion';
import { DEFAULT_RAIL, inColumn, RailGun, type RailSpec } from '../core/RailGun';
import { Rng } from '../core/Rng';
import { BRICK_HEALTH } from '../core/procgen/grid';
import { LEVEL_MAX_Y, type BrickSpec } from '../core/types';
import type { Brick, BrickOwner, DestroyCause, HitOptions, HitResult } from '../entities/Brick';
import type { Paddle } from '../entities/Paddle';
import { save } from '../services';
import { calm, css, theme } from '../ui/theme';
import { audio } from './AudioSystem';
import type { BrickSystem } from './BrickSystem';
import { COIN, CollectibleSystem, type Collectible, type CollectibleKind } from './CollectibleSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { LaserStream } from './LaserSystem';
import type { LightingSystem } from './LightingSystem';
import { RailGunFx, type RailLook } from './RailGunFx';

/** Ids of the bricks that stand in for targets, clear of the level's own and a boss's. */
export const BONUS_ID_BASE = 200_000;
/** Targets draw over the paddle's aim arrow and under the ball, like a boss's picture. */
const TARGET_DEPTH = 1;
/** A ball touching one target counts once in this long, in ms of the stage clock. */
const BALL_HIT_GAP_MS = 150;
/** A target this far past the side of the field has got away, in px. */
const ESCAPE_MARGIN = 40;
/** A popped target's flourish, in ms. */
const POP_MS = 220;
/** A target that leaves unhit fades over this long, in ms. */
const HIDE_MS = 160;
/** A pop-up rises out of its slot over this long, in ms. */
const RISE_MS = 170;
/** A hit target flashes white this long, in ms. */
const FLASH_MS = 70;
/** Most count-up sounds a single frame plays, so a long frame does not stack a chord. */
const TICKS_PER_FRAME = 2;
/** The new best's chime follows the medal by this much, in ms. */
const BEST_AFTER_MS = 450;
/** The music sits under the tally. */
const TALLY_DUCK = true;
/** Coins caught within this long of each other, in ms, ring a step higher, up to a ceiling. */
const COIN_RUN_GAP_MS = 450;
const COIN_RUN_STEPS = 16;
const COIN_RUN_CENTS = 60;
/** A coin burst sprays out this fast, in px/s, before the coins fly home. */
const BURST_SPEED = 260;
const BURST_GRAVITY = 900;
/** The medal's sound as it lands: the results screen's stars, one per tier. */
const MEDAL_SFX = { bronze: 'star_1', silver: 'star_2', gold: 'star_3' } as const;

/** Dev builds only: `&tally=gold` (or bronze, silver, none) opens straight on a filled tally. */
export const FORCED_TALLY = ((): Medal | undefined => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const m = new URLSearchParams(location.search).get('tally');
  return m === 'none' || m === 'bronze' || m === 'silver' || m === 'gold' ? m : undefined;
})();

/** How a target was hit. A blast is anything that hits everything around it: a bomb, an ability. */
export type HitCause = 'ball' | 'bolt' | 'blast';

/** Something to shoot. The framework stands it in for a brick the director owns. */
export interface TargetSpec {
  /** The stage's own name for it, e.g. 'duck' or 'cat'. */
  kind: string;
  /** The picture drawn over the hit box. */
  texture: string;
  /** The picture's size, in px. */
  width: number;
  height: number;
  /** The hit box, in px. The picture's size when left out. */
  hitWidth?: number;
  hitHeight?: number;
  /** Where it is, `t` ms of the stage clock after it appeared. */
  path: Path;
  /** Hits it takes to pop. 1 when left out. */
  hp?: number;
  /** One ball hit pops it, whatever its hit points. */
  ballPops?: boolean;
  /** It leaves by itself after this long, in ms. Left out, it stays until hit or off the field. */
  lifeMs?: number;
  /** A pop-up rises out of its slot; anything else is simply there. */
  enter?: 'rise';
  /** The sparks of a hit. The theme's accent when left out. */
  spark?: number;
  /** The picture faces left: its texture faces right. */
  flipX?: boolean;
  /** The stage's own data, e.g. the wave it belongs to. */
  tag?: number;
}

/** A target on the field. */
export interface Target {
  readonly id: number;
  readonly spec: TargetSpec;
  readonly kind: string;
  x: number;
  y: number;
  /** Hits left. */
  hp: number;
  /** Time on the field, in ms of the stage clock. */
  age: number;
  /** False once it has popped or left. */
  live: boolean;
}

/** The playing area, in world coordinates. */
export interface Field {
  left: number;
  right: number;
  /** Top of the level area, under the HUD. */
  top: number;
  /** Lowest a target should come: the bottom of the level area. */
  bottom: number;
  paddleY: number;
}

/** What a stage's hooks get: the live systems, plus what the stage owns. */
export interface BonusStage {
  readonly scene: Phaser.Scene;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly paddle: Paddle;
  readonly audio: typeof audio;
  /** The stage's random numbers: the one stream every plan draws from. */
  readonly rng: Rng;
  /** Time played, in ms of the stage clock. */
  readonly clock: number;
  readonly timeLeftMs: number;
  /** 0 at the start of play, 1 when the timer is out. */
  readonly progress: number;
  readonly combo: number;
  /** The reduced-motion setting. */
  readonly calm: boolean;
  readonly field: Field;
  /** Puts a target on the field. */
  spawn(spec: TargetSpec): Target;
  /** Targets on the field. */
  targets(): readonly Target[];
  /** Hits a target as if a shot had: a blast pops it outright. It lands in this update. */
  hit(target: Target, cause: HitCause): void;
  /** Takes a target off the field: with a pop and its sparks, or quietly. Nothing is scored. */
  remove(target: Target, how: 'pop' | 'hide'): void;
  /** Puts a collectible on the field, following `path`. */
  drop(kind: CollectibleKind, path: Path): Collectible | undefined;
  /** Sprays `n` coins out of a point; they fly home to the paddle by themselves. */
  coins(n: number, x: number, y: number): void;
  /**
   * Scores `base` points at a point, times the combo, and shows them unless `quiet`. Returns the
   * points given.
   */
  score(base: number, x: number, y: number, opts?: { combo?: boolean; label?: string; quiet?: boolean }): number;
  /** The combo's multiplier now. */
  readonly multiplier: number;
  /** What a slip costs, shown at a point when it took anything. An empty label shows nothing. */
  penalty(p: Penalty, x: number, y: number, label?: string): void;
  /** Adds to one of the stage's counters, for its tally. */
  count(key: string, n?: number): void;
  /** The stage's counters. */
  counts(): Readonly<Record<string, number>>;
  /** Bullet time for `ms` of real time, without spending the player's charge. */
  slowmo(ms: number): void;
  /** Words over the field. */
  say(text: string, x: number, y: number, color?: string, size?: number): void;
  /** Keeps a game object for the stage's life: it is destroyed with the stage. */
  keep<T extends Phaser.GameObjects.GameObject>(obj: T): T;
}

/**
 * A stage's gun, one or the other. The gatling streams under a held trigger, harder the longer it
 * is held. The rail gun fires one heavy slug up a whole column, and rewards a well-timed press.
 */
export interface GunsDef {
  gatling?: Partial<GatlingSpec>;
  rail?: Partial<RailSpec>;
  /** What the rail gun looks like, drawn in place of the paddle. The paddle when left out. */
  railLook?: RailLook;
}

/** One rail gun slug, as the stage hears of it once its hits have landed. */
export interface RailShot {
  x: number;
  overcharged: boolean;
  /** Everything in its column. */
  hits: readonly Target[];
  /** Of those, the ones it popped. */
  popped: readonly Target[];
}

/** What one bonus stage is. Everything else is the framework's. */
export interface BonusDef {
  id: BonusId;
  name: string;
  /** The line over the name on the title band. */
  kicker: string;
  /** The intro card: a headline, then the pictures of what to shoot and what not to, a word each. */
  rules: BonusRule[];
  /** Length of the timed part, in ms of the stage clock. */
  durationMs: number;
  /** Bronze, silver and gold, in what `medalBy` counts. */
  medals: readonly [number, number, number];
  /** The medals count the score, or the coins. The score when left out. */
  medalBy?: MedalBy;
  /** False: the stage is played without a ball, with its guns alone. */
  ball?: false;
  /** What a lost ball costs. It never costs a life. Nothing when left out. */
  ballLost?: Penalty;
  /** The stage has hold-to-fire guns, which heat up and overheat. Without, the gun skill is as ever. */
  guns?: GunsDef;
  /** The stage's own scenery, and how fast it scrolls against a level's. The world's when left out. */
  backdrop?: SceneryId;
  pace?: number;
  /** Its stats as a medal of that tier would leave them, for `&tally=`. */
  preview?(medal: Medal): BonusStats;
  /**
   * Runs once, when the stage is created, before the intro. Scenery belongs here. Targets belong
   * in `tick`: the clock has not started, so anything spawned now would sit still through the card.
   */
  setup?(s: BonusStage): void;
  /** Runs every update of play, with the step of the stage clock in ms. */
  tick(s: BonusStage, dtMs: number): void;
  /**
   * A target was hit. `popped` is true when that was its last hit: the framework then pops it,
   * so the hook only scores and reacts. `dealt` is the hit points it took, never more than it had.
   */
  onHit(s: BonusStage, target: Target, cause: HitCause, popped: boolean, dealt: number): void;
  /** A rail gun slug went up, after `onHit` heard of each target it hit. */
  onShot?(s: BonusStage, shot: RailShot): void;
  /** A target left the field unhit, by its own timer or past the side. */
  onEscape?(s: BonusStage, target: Target): void;
  /** The paddle caught a collectible. Coins are the framework's; anything else is the stage's. */
  onCatch?(s: BonusStage, item: Collectible): void;
  /** The stage's rows on the tally, before the score and the coins. */
  tally(stats: BonusStats): TallyRow[];
}

/**
 * One item of the intro card. Without an icon it is the headline; with one, a picture with a
 * word or two under it, side by side with the others. `avoid` marks it with a red no-sign.
 */
export interface BonusRule {
  text: string;
  icon?: string;
  avoid?: boolean;
}

/** The intro card under the title band. */
export interface BonusIntroCard {
  name: string;
  rules: readonly BonusRule[];
  /** How long the card has been up, of how long it stays, in ms. */
  ms: number;
  holdMs: number;
}

/** The tally, as the HUD draws it. */
export interface BonusTallyCard {
  name: string;
  /** What the medal was measured on; that row stands out. */
  medalBy: MedalBy;
  rows: readonly TallyRow[];
  /** When each row counts, in ms into the tally. */
  rowTimes: readonly TallyRowTime[];
  /** What each row shows now. */
  values: number[];
  /** How long the tally has been up, in ms. */
  ms: number;
  medal: Medal;
  /** The medal slams in here and has landed here, in ms into the tally. */
  medalAt: number;
  readyAt: number;
  /** The score beat the stage's best. */
  best: boolean;
  reward: BonusReward;
  /** A tap goes on from here. */
  ready: boolean;
  /** What is left of the wait before the stage ends by itself, 1..0. */
  left: number;
}

/** The bonus stage's HUD, on HudState.bonus. */
export interface BonusHud {
  name: string;
  step: BonusStep;
  timeLeftMs: number;
  durationMs: number;
  score: number;
  coins: number;
  combo: number;
  multiplier: number;
  medals: readonly [number, number, number];
  medalBy: MedalBy;
  /** What the medal track measures: the score or the coins. */
  medalValue: number;
  /** The medal reached so far. */
  medal: Medal;
  intro: BonusIntroCard | null;
  tally: BonusTallyCard | null;
}

/** What the stage ends with: Play hands out the reward and ends the level. */
export interface BonusResult {
  medal: Medal;
  score: number;
  reward: BonusReward;
  stars: number;
}

/** What the director needs from Play. Built from closures, like BossHost. */
export interface BonusHost {
  readonly scene: Phaser.Scene;
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly paddle: Paddle;
  /** The physics time scale: above 1 is slower. */
  timeScale(): number;
  /** The fire button, the mouse or a held skill button is down. */
  triggerHeld(): boolean;
  /** A touch tap pulled the trigger once since the last call. */
  takeTap(): boolean;
  /** The rail gun fired. */
  fired(): void;
  /** The held trigger, for the guns. Null puts them away. */
  stream(held: LaserStream | null): void;
  /** Bolts the guns have fired. */
  shotsFired(): number;
  /** Bullet time for `ms`, without spending the charge. 0 ends it. */
  slowmo(ms: number): void;
  /** A hit landed: pacing, music and the skills hear about it as they do a break. */
  credit(): void;
  addScore(n: number): void;
  /** Coins straight to the player. */
  addCoins(n: number): void;
  /** HUD label; a null detail shows the bricks left. */
  setLabel(title: string, detail: string | null): void;
  setHud(view: BonusHud | null): void;
  /** The level's title band across the field. */
  titleBand(kicker: string, name: string, holdMs: number): void;
  /** The serve hint and countdown. */
  serve(): void;
  /** The tally is over: hand out the reward and end the level. */
  finished(result: BonusResult): void;
}

/** A hit struck in a physics callback, applied in the next update. */
interface PendingHit {
  target: TargetSlot;
  cause: HitCause;
  /** Hit points it takes. A blast takes them all. */
  damage: number;
}

interface TargetSlot extends Target {
  brick: Brick;
  sprite: Phaser.GameObjects.Image;
  /** Stage-clock time of the last ball hit. */
  ballAt: number;
  flashMs: number;
}

/** What a brick's hit cause means to a target. */
function causeOf(cause: DestroyCause, lethal: boolean | undefined): HitCause {
  if (cause === 'ball') return 'ball';
  if (cause === 'laser') return 'bolt';
  return lethal ? 'blast' : 'bolt';
}

/**
 * Runs a bonus stage inside Play: the intro, the timer, the scoring and the tally. The stage's
 * def fills in the rules. Nothing here takes a life or ends the stage early.
 */
export class BonusDirector implements BrickOwner {
  /** For the dev tools, like BossDirector.current. */
  static current?: BonusDirector;

  readonly state: BonusState;
  readonly gatling?: Gatling;
  readonly rail?: RailGun;
  private readonly railFx?: RailGunFx;
  private railShots = 0;
  private readonly rng: Rng;
  private readonly items: CollectibleSystem;
  private readonly slots: TargetSlot[] = [];
  private readonly byBrick = new Map<Brick, TargetSlot>();
  private readonly pending: PendingHit[] = [];
  private readonly kept: Phaser.GameObjects.GameObject[] = [];
  private readonly stage: BonusStage;
  private readonly field: Field;
  private nextId = BONUS_ID_BASE;
  /** The stage clock in ms. It follows the world's time scale and stops for hit-stop. */
  private clock = 0;
  private over = false;
  /** Bolts fired before the stage began, so the accuracy only counts its own. */
  private shotsBefore = 0;
  /** Count-up ticks already heard. */
  private ticked = 0;
  private medalRung = false;
  private bestRung = false;
  private readyRung = false;
  private best = false;
  private readonly view: BonusHud;
  private readonly intro: BonusIntroCard;
  private tallyCard?: BonusTallyCard;
  private readonly held: LaserStream = { firing: false, spin: 0, gapMs: DEFAULT_GATLING.slowGapMs, damage: 1 };
  private coinRun = 0;
  private lastCoinAt = -Infinity;

  /** `seed` feeds the stage's Rng. Play picks it once; it is the only randomness outside Rng. */
  constructor(
    readonly def: BonusDef,
    private host: BonusHost,
    opts: { seed?: number } = {},
  ) {
    this.rng = new Rng(opts.seed ?? 0);
    this.state = new BonusState({
      durationMs: def.durationMs,
      medals: def.medals,
      medalBy: def.medalBy,
      ballLost: def.ballLost ?? {},
      tally: (stats) => def.tally(stats),
    });
    if (def.guns?.rail) {
      this.rail = new RailGun({ ...DEFAULT_RAIL, ...def.guns.rail });
      this.railFx = new RailGunFx(host.scene, host.juice, host.lighting, host.paddle, def.guns.railLook);
    } else if (def.guns) {
      this.gatling = new Gatling({ ...DEFAULT_GATLING, ...def.guns.gatling });
    }
    this.field = {
      left: 0,
      right: WIDTH,
      top: LEVEL_OFFSET_Y,
      bottom: LEVEL_OFFSET_Y + LEVEL_MAX_Y,
      paddleY: PADDLE_Y,
    };
    this.items = new CollectibleSystem({
      scene: host.scene,
      lighting: host.lighting,
      paddle: host.paddle,
      caught: (item) => this.caught(item),
    });
    this.intro = { name: def.name, rules: def.rules, ms: 0, holdMs: INTRO_MS };
    this.view = {
      name: def.name,
      step: this.state.step,
      timeLeftMs: def.durationMs,
      durationMs: def.durationMs,
      score: 0,
      coins: 0,
      combo: 0,
      multiplier: 1,
      medals: def.medals,
      medalBy: this.state.medalBy,
      medalValue: 0,
      medal: 'none',
      intro: this.intro,
      tally: null,
    };
    this.stage = this.makeStage();
    this.def.setup?.(this.stage);
    host.setLabel(def.name.toUpperCase(), 'BONUS');
    host.titleBand(def.kicker, def.name, INTRO_MS - 300);
    this.showHud();
    if (FORCED_TALLY) this.preview(FORCED_TALLY);
    BonusDirector.current = this;
  }

  /** False once the tally is over. */
  get active(): boolean {
    return !this.over;
  }

  get progress(): number {
    return this.state.progress;
  }

  /** Play is paused: the timer is out and the field holds still for the count. */
  get frozen(): boolean {
    const { step } = this.state;
    return step === 'scoring' || step === 'tally' || step === 'done';
  }

  /** The stage is played with a ball. */
  get ball(): boolean {
    return this.def.ball !== false;
  }

  /** The ball waits on the paddle and its serve clock stands still. */
  get holdServe(): boolean {
    return this.state.step === 'intro';
  }

  /** The stage is not in play: taps skip or do nothing, and abilities wait. */
  get cinematic(): boolean {
    return !this.over && this.state.step !== 'play';
  }

  /** The stage has hold-to-fire guns in place of the gun skill. */
  get guns(): boolean {
    return !!this.gatling || !!this.rail;
  }

  /** A tap. True when the stage took it, so it does nothing else. */
  skip(): boolean {
    if (!this.cinematic) return false;
    for (const e of this.state.skip()) this.react(e);
    return true;
  }

  /** A ball was lost: it costs score or combo, and the ball comes straight back. */
  onBallLost(): void {
    const { state, host } = this;
    if (state.step !== 'play') return;
    const was = state.score;
    const lost = state.onBallLost();
    const { x, y } = host.paddle;
    const cost = was - state.score;
    if (cost > 0) host.addScore(-cost);
    if (cost > 0) host.juice.popText(x, y - 40, `-${cost}`, css(theme().palette.danger), 22, 1.1);
    else if (lost.combo > 0) host.juice.popText(x, y - 40, 'COMBO LOST', css(theme().palette.danger), 18);
    audio.sfx('ui_off', 0.45);
    this.showHud();
  }

  /** Runs inside a physics callback, so it only records the hit. `update` applies it. */
  strike(brick: Brick, damage: number, cause: DestroyCause, opts: HitOptions): HitResult {
    if (this.state.step !== 'play') return 'immune';
    const target = this.byBrick.get(brick);
    if (!target?.live) return 'immune';
    const how = causeOf(cause, opts.lethal);
    if (how === 'ball') {
      if (this.clock - target.ballAt < BALL_HIT_GAP_MS) return 'damaged';
      target.ballAt = this.clock;
    }
    // Only the gatling's bolts hit harder; a ball, or any other shot, takes one hit point.
    const hp =
      how === 'ball' && target.spec.ballPops
        ? target.hp
        : cause === 'laser' && this.gatling
          ? Math.max(1, Math.round(damage))
          : 1;
    this.pending.push({ target, cause: how, damage: hp });
    return 'damaged';
  }

  update(dt: number): void {
    if (this.over) return;
    const { state, host } = this;
    // Everything below runs on the stage clock, so bullet time and hit-stop hold the stage too.
    const tick = host.juice.inHitStop ? 0 : dt / host.timeScale();
    this.clock += tick;
    const events = state.tick(state.step === 'tally' ? dt : tick);
    if (state.step === 'play') {
      const shot = this.updateGuns(tick);
      this.applyHits();
      if (shot) this.landShot(shot);
      this.def.tick(this.stage, tick);
      this.applyHits();
    }
    for (const e of events) this.react(e);
    if (this.over) return;
    this.moveTargets(tick);
    this.items.update(state.step === 'tally' ? dt : tick);
    if (state.step === 'tally') this.updateTally();
    this.showHud();
  }

  /** Dev tools: runs the timer out. */
  debugEndTimer(): void {
    for (const e of this.state.endTimer()) this.react(e);
  }

  destroy(): void {
    this.host.stream(null);
    this.host.setHud(null);
    for (const t of this.slots) this.drop(t);
    this.slots.length = 0;
    this.items.destroy();
    this.railFx?.destroy();
    for (const obj of this.kept) obj.destroy();
    this.kept.length = 0;
    this.host.lighting.takeDownBulbs();
    if (TALLY_DUCK && this.state.step === 'tally') audio.duckMusic(false);
    if (BonusDirector.current === this) BonusDirector.current = undefined;
  }

  // ---------------------------------------------------------------- steps

  private react(e: BonusEvent): void {
    const { host } = this;
    switch (e.step) {
      case 'intro':
        break;
      case 'play':
        this.shotsBefore = host.shotsFired();
        host.serve();
        break;
      case 'scoring':
        this.timeUp();
        break;
      case 'tally':
        this.beginTally();
        break;
      case 'done':
        this.finish();
        break;
    }
  }

  /** The timer is out: the guns go away, the targets leave and the coins come in. */
  private timeUp(): void {
    const { host } = this;
    host.slowmo(0);
    this.gatling?.reset();
    this.rail?.reset();
    this.railFx?.stow();
    host.stream(null);
    this.pending.length = 0;
    for (const t of this.slots) if (t.live) this.remove(t, 'hide');
    this.items.vacuum();
    this.items.dropUnpulled();
    const shots = this.rail ? this.railShots : host.shotsFired() - this.shotsBefore;
    this.state.count('shots', shots);
    const p = theme().palette;
    host.juice.popText(WIDTH / 2, this.field.top + 160, 'TIME!', css(p.accentHi), 56, 1.4);
    audio.sfx('wave_clear', 0.55);
    host.juice.shake(160, 0.004);
  }

  private beginTally(): void {
    const { state } = this;
    this.items.clear();
    // The stage's own scenery goes with its targets, so nothing of the field crosses the card.
    if (this.kept.length > 0) {
      this.host.scene.tweens.add({ targets: this.kept, alpha: 0, duration: TALLY_LEAD_MS });
    }
    this.best = FORCED_TALLY ? FORCED_TALLY === 'gold' : save.recordBonus(this.def.id, state.score, state.medal);
    this.tallyCard = {
      name: this.def.name,
      medalBy: state.medalBy,
      rows: state.tallyRows,
      rowTimes: state.tally?.rows ?? [],
      values: state.tallyRows.map(() => 0),
      ms: 0,
      medal: state.medal,
      medalAt: state.tally?.medalAt ?? 0,
      readyAt: state.tally?.readyAt ?? 0,
      best: this.best,
      reward: rewardFor(state.medal),
      ready: false,
      left: 1,
    };
    this.ticked = 0;
    this.medalRung = this.bestRung = this.readyRung = false;
    if (TALLY_DUCK) audio.duckMusic(true);
    audio.sfx('gift', 0.35);
  }

  /** The count-up's sounds, on the tally's own timeline. */
  private updateTally(): void {
    const { state } = this;
    const card = this.tallyCard;
    const line = state.tally;
    if (!card || !line) return;
    const ms = state.stepMs;
    card.ms = ms;
    card.ready = ms >= line.readyAt;
    card.left = 1 - Math.max(0, ms - line.readyAt) / (line.endAt - line.readyAt);
    // A tap that skips ahead lands every row at once: their last ticks are not played one by one.
    const skipped = ms >= line.medalAt;
    let played = 0;
    while (this.ticked < line.ticks.length && line.ticks[this.ticked]!.at <= ms) {
      const tick = line.ticks[this.ticked++]!;
      if (skipped || played >= TICKS_PER_FRAME) continue;
      played++;
      const kind = state.tallyRows[tick.row]?.kind;
      if (kind === 'coins') audio.sfx('sfx_coin', 0.3, tick.pitch);
      else audio.sfx('ui_tally', kind === 'score' ? 0.4 : 0.32, tick.pitch);
      const rowEnd = line.rows[tick.row]?.end ?? 0;
      if (tick.at >= rowEnd) audio.sfx('ui_coin_land', 0.3, tick.pitch * 0.5);
    }
    state.tallyRows.forEach((_, i) => {
      card.values[i] = tallyValue(line, state.tallyRows, i, ms);
    });
    if (!this.medalRung && ms >= line.medalAt) {
      this.medalRung = true;
      this.medalSlam(card.medal);
    }
    if (this.best && !this.bestRung && ms >= line.medalAt + BEST_AFTER_MS) {
      this.bestRung = true;
      audio.sfx('new_best', 0.5);
    }
    if (!this.readyRung && ms >= line.readyAt) {
      this.readyRung = true;
      if (card.reward.abilityCharges > 0) audio.sfx('gift', 0.45, 300);
    }
  }

  private medalSlam(medal: Medal): void {
    const { juice } = this.host;
    if (medal === 'none') {
      audio.sfx('ui_off', 0.5);
      return;
    }
    const tier = medal === 'gold' ? 3 : medal === 'silver' ? 2 : 1;
    audio.sfx(MEDAL_SFX[medal], 0.6);
    audio.duck(0.5, 500);
    if (!calm()) {
      juice.shake(120 + tier * 60, 0.003 * tier);
      if (tier === 3) juice.flash(160, 255, 236, 170);
    }
  }

  /** The tally is over: the reward is handed out and the level ends. */
  private finish(): void {
    const { state } = this;
    this.over = true;
    if (TALLY_DUCK) audio.duckMusic(false);
    const medal = state.medal;
    this.host.setHud(null);
    if (state.coins > 0 && !FORCED_TALLY) this.host.addCoins(state.coins);
    this.host.finished({
      medal,
      score: state.score,
      reward: rewardFor(medal),
      stars: starsFor(medal),
    });
  }

  /** Dev tools: fills the stage as a medal of that tier would, and runs the timer out. */
  private preview(medal: Medal): void {
    const [b, s, g] = this.def.medals;
    const score = { none: b / 2, bronze: b, silver: s, gold: g }[medal];
    const stats = this.def.preview?.(medal) ?? { score, coins: 24, bestCombo: 18, counts: {} };
    this.state.debugFill(stats);
    this.host.addScore(this.state.score);
    for (const e of this.state.endTimer()) this.react(e);
  }

  // ---------------------------------------------------------------- guns

  /** Runs the gun for `tick`. A rail gun slug that went up is returned, its hits queued. */
  private updateGuns(tick: number): Omit<RailShot, 'popped'> | null {
    if (this.rail) return this.updateRail(this.rail, tick);
    const { gatling, host, held } = this;
    if (!gatling) return null;
    const up = gatling.update(tick, host.triggerHeld());
    if (up !== null) {
      // Each step up in power gets its own ring and word, so the player feels the spin pay off.
      const top = up > gatling.spec.damageAt.length;
      const p = theme().palette;
      audio.sfx(top ? 'surge' : 'combo', top ? 0.5 : 0.4, top ? 0 : 300, { x: host.paddle.x });
      host.juice.popText(
        host.paddle.x,
        host.paddle.y - 96,
        top ? 'MAX POWER!' : `POWER x${up}`,
        css(top ? p.accentHi : p.accent),
        top ? 22 : 18,
      );
      host.juice.ring(host.paddle.x, host.paddle.y, top ? p.accentHi : p.accent, top ? 90 : 60);
    }
    held.firing = gatling.firing;
    held.spin = gatling.spin;
    held.gapMs = gatling.gapMs;
    held.damage = gatling.damage;
    host.stream(held);
    return null;
  }

  private updateRail(rail: RailGun, tick: number): Omit<RailShot, 'popped'> | null {
    const { host } = this;
    const event = rail.update(tick, host.triggerHeld(), host.takeTap());
    this.railFx?.update(rail, tick);
    if (!event) return null;
    if (event.kind === 'jam') {
      this.railFx?.jam();
      return null;
    }
    const x = host.paddle.x;
    const { overcharged } = event;
    // Straight up from the paddle: everything over it in the column, front to back.
    const boxes = this.slots
      .filter((t) => t.live && t.y < this.field.paddleY)
      .map((t) => ({ x: t.x, halfW: (t.spec.hitWidth ?? t.spec.width) / 2, t }));
    const hits = inColumn(boxes, x, rail.halfWidth(overcharged)).map((b) => b.t);
    const damage = rail.damage(overcharged);
    for (const t of hits) this.pending.push({ target: t, cause: 'bolt', damage });
    this.railShots++;
    host.fired();
    return { x, overcharged, hits };
  }

  /** A slug's hits have landed: the stage hears of it, and the shot gets its look. */
  private landShot(shot: Omit<RailShot, 'popped'>): void {
    const popped = shot.hits.filter((t) => !t.live);
    this.def.onShot?.(this.stage, { ...shot, popped });
    this.railFx?.fire({
      x: shot.x,
      overcharged: shot.overcharged,
      halfWidth: this.rail?.halfWidth(shot.overcharged) ?? 0,
      popped: popped.length,
      topY: popped.length > 0 ? Math.min(...popped.map((t) => t.y)) : undefined,
      multiplier: this.state.multiplier,
    });
  }

  // ---------------------------------------------------------------- targets

  private spawn(spec: TargetSpec): Target {
    const { host } = this;
    const at = spec.path(0);
    const w = spec.hitWidth ?? spec.width;
    const h = spec.hitHeight ?? spec.height;
    const brickSpec: BrickSpec = {
      id: this.nextId++,
      x: at.x - w / 2,
      y: at.y - LEVEL_OFFSET_Y - h / 2,
      width: w,
      height: h,
      texture: 'brick_white',
      kind: 'normal',
      health: BRICK_HEALTH,
      armor: 0,
      moveX: 0,
      moveSpeed: 0,
      regenDelay: 0,
    };
    const [brick] = host.bricks.append([brickSpec], this);
    brick!.setVisible(false);
    const sprite = host.scene.add
      .image(at.x, at.y, spec.texture)
      .setDisplaySize(spec.width, spec.height)
      .setFlipX(!!spec.flipX)
      .setDepth(TARGET_DEPTH);
    host.lighting.addLit(sprite);
    const slot: TargetSlot = {
      id: brickSpec.id,
      spec,
      kind: spec.kind,
      x: at.x,
      y: at.y,
      hp: Math.max(1, spec.hp ?? 1),
      age: 0,
      live: true,
      brick: brick!,
      sprite,
      ballAt: -Infinity,
      flashMs: 0,
    };
    if (spec.enter === 'rise' && !calm()) {
      const sy = sprite.scaleY;
      sprite.setScale(sprite.scaleX, 0).setOrigin(0.5, 1).setY(at.y + spec.height / 2);
      host.scene.tweens.add({ targets: sprite, scaleY: sy, duration: RISE_MS, ease: 'Back.Out' });
    }
    this.slots.push(slot);
    this.byBrick.set(slot.brick, slot);
    return slot;
  }

  private moveTargets(tick: number): void {
    const { field } = this;
    const playing = this.state.step === 'play';
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const t = this.slots[i]!;
      if (!t.live) continue;
      if (playing) t.age += tick;
      const at = t.spec.path(t.age);
      t.x = at.x;
      t.y = at.y;
      t.brick.x = at.x;
      t.brick.y = at.y;
      t.brick.syncOverlay();
      const rising = t.sprite.originY === 1;
      t.sprite.setPosition(at.x, rising ? at.y + t.spec.height / 2 : at.y);
      if (t.flashMs > 0) {
        t.flashMs -= tick;
        if (t.flashMs <= 0) t.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      if (!playing) continue;
      const w = t.spec.width / 2 + ESCAPE_MARGIN;
      const gone = at.x < field.left - w || at.x > field.right + w;
      if (gone || (t.spec.lifeMs !== undefined && t.age >= t.spec.lifeMs)) {
        this.remove(t, 'hide');
        this.def.onEscape?.(this.stage, t);
      }
    }
  }

  /** Lands the hits the physics recorded, and any the stage struck itself, until none are left. */
  private applyHits(): void {
    const { pending } = this;
    // A blast that pops its neighbours queues their hits behind it, so this drains to the end.
    for (let i = 0; i < pending.length; i++) {
      const { target, cause, damage } = pending[i]!;
      if (!target.live || this.state.step !== 'play') continue;
      const dealt = cause === 'blast' ? target.hp : Math.min(target.hp, damage);
      target.hp -= dealt;
      const popped = target.hp <= 0;
      this.host.credit();
      if (!popped) {
        target.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        target.flashMs = FLASH_MS;
        this.host.juice.sparkle(target.x, target.y, target.spec.spark ?? theme().palette.accent, 4);
      }
      this.def.onHit(this.stage, target, cause, popped, dealt);
      if (popped && target.live) this.remove(target, 'pop');
    }
    pending.length = 0;
  }

  private remove(target: Target, how: 'pop' | 'hide'): void {
    const t = this.slots.find((s) => s === target);
    if (!t?.live) return;
    t.live = false;
    this.byBrick.delete(t.brick);
    this.host.bricks.discard([t.brick]);
    const { scene, juice } = this.host;
    const sprite = t.sprite;
    this.host.lighting.removeLit(sprite);
    scene.tweens.killTweensOf(sprite);
    const done = (): void => {
      sprite.destroy();
      const i = this.slots.indexOf(t);
      if (i >= 0) this.slots.splice(i, 1);
    };
    if (how === 'pop') {
      juice.burst(t.x, t.y, t.spec.spark ?? theme().palette.accent, 10);
      if (calm()) {
        done();
        return;
      }
      sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      scene.tweens.add({
        targets: sprite,
        scaleX: sprite.scaleX * 1.35,
        scaleY: sprite.scaleY * 1.35,
        alpha: 0,
        duration: POP_MS,
        ease: 'Cubic.Out',
        onComplete: done,
      });
      return;
    }
    scene.tweens.add({ targets: sprite, alpha: 0, duration: HIDE_MS, onComplete: done });
  }

  /** Takes a target's picture down at once, as the stage ends. Its brick goes with the scene. */
  private drop(t: TargetSlot): void {
    t.live = false;
    this.host.lighting.removeLit(t.sprite);
    this.host.scene.tweens.killTweensOf(t.sprite);
    t.sprite.destroy();
  }

  // ---------------------------------------------------------------- collectibles

  private caught(item: Collectible): void {
    const { kind } = item;
    const { host } = this;
    if (kind.onCatch === 'coin') {
      // The stage holds its coins and banks them as it ends, so a penalty can take some back.
      this.state.addCoins(kind.value);
      // Coins that land close together climb in pitch, a run of them ringing up like a scale.
      const now = host.scene.time.now;
      this.coinRun = now - this.lastCoinAt < COIN_RUN_GAP_MS ? this.coinRun + 1 : 0;
      this.lastCoinAt = now;
      audio.sfx('sfx_coin', 0.3, Math.min(this.coinRun, COIN_RUN_STEPS) * COIN_RUN_CENTS, { x: item.x });
      host.juice.sparkle(item.x, host.paddle.y - 8, theme().palette.gold, 3);
    } else if (kind.onCatch === 'penalty') {
      this.stage.penalty({ score: kind.value, combo: 'reset' }, item.x, item.y);
    }
    this.def.onCatch?.(this.stage, item);
  }

  // ---------------------------------------------------------------- HUD

  private showHud(): void {
    const { state, view } = this;
    view.step = state.step;
    view.timeLeftMs = state.timeLeftMs;
    view.score = state.score;
    view.coins = state.coins;
    view.medalValue = state.medalValue;
    view.combo = state.combo;
    view.multiplier = state.multiplier;
    view.medal = state.medal;
    if (state.step === 'intro') {
      this.intro.ms = state.stepMs;
      view.intro = this.intro;
    } else {
      view.intro = null;
    }
    view.tally = state.step === 'tally' ? (this.tallyCard ?? null) : null;
    this.host.setHud(view);
  }

  private makeStage(): BonusStage {
    const { host } = this;
    const { state } = this;
    return {
      scene: host.scene,
      juice: host.juice,
      lighting: host.lighting,
      paddle: host.paddle,
      audio,
      rng: this.rng,
      get clock() {
        return state.clock;
      },
      get timeLeftMs() {
        return state.timeLeftMs;
      },
      get progress() {
        return state.progress;
      },
      get combo() {
        return state.combo;
      },
      get multiplier() {
        return state.multiplier;
      },
      get calm() {
        return calm();
      },
      field: this.field,
      spawn: (spec) => this.spawn(spec),
      targets: () => this.slots.filter((t) => t.live),
      hit: (target, cause) => {
        const slot = this.slots.find((s) => s === target);
        if (slot?.live) this.pending.push({ target: slot, cause, damage: 1 });
      },
      remove: (target, how) => this.remove(target, how),
      drop: (kind, path) => this.items.spawn(kind.texture, kind, path),
      coins: (n, x, y) => {
        for (let i = 0; i < n; i++) {
          // Fanned upward and out, faster the more there are, so a big burst fills the air.
          const a = -Math.PI / 2 + this.rng.float(-1.1, 1.1);
          const v = BURST_SPEED * this.rng.float(0.6, 1) * (1 + Math.min(1, n / 12));
          this.items.spawn('coin', COIN, fall(x, y, Math.cos(a) * v, Math.sin(a) * v, BURST_GRAVITY));
        }
      },
      score: (base, x, y, opts = {}) => {
        const given = this.state.award(base, { combo: opts.combo });
        if (given <= 0) return 0;
        host.addScore(given);
        if (opts.quiet) return given;
        const mult = this.state.multiplier;
        const p = theme().palette;
        const color = mult >= 3 ? '#ffffff' : mult >= 2 ? css(p.accentHi) : css(p.gold);
        const text = opts.label ? `${opts.label} +${given}` : `+${given}`;
        host.juice.popText(x, y - 12, text, color, 16 + Math.min(10, mult * 3), 1 + mult * 0.08);
        return given;
      },
      penalty: (p, x, y, text) => {
        const took = this.state.penalty(p);
        if (took.score > 0) host.addScore(-took.score);
        if (took.score === 0 && took.coins === 0 && took.combo === 0) return;
        const label =
          text ?? (took.coins > 0 ? `-${took.coins} coins` : took.score > 0 ? `-${took.score}` : 'COMBO LOST');
        if (label) host.juice.popText(x, y - 12, label, css(theme().palette.danger), 22, 1.15);
      },
      count: (key, n) => this.state.count(key, n),
      counts: () => this.state.counts,
      slowmo: (ms) => host.slowmo(ms),
      say: (text, x, y, color = theme().palette.text, size = 24) => {
        host.juice.popText(x, y, text, color, size, 1.2);
      },
      keep: (obj) => {
        this.kept.push(obj);
        return obj;
      },
    };
  }
}
