import type Phaser from 'phaser';
import {
  AFTERMATH_MS,
  AWARD_BREAK_MS,
  AWARD_GUARD_MS,
  AWARD_TROPHY_MS,
  BODY_MAX_SPEED,
  BODY_SCENE_SPEED,
  BOSS_DEFEAT_BONUS,
  BOSS_DEFEAT_COINS,
  BOSS_PHASE_BONUS,
  BOSS_TUNING,
  BossState,
  HURT_GAP_MS,
  HURT_MS,
  HUSH_DARK,
  LETHAL_GAP_MS,
  MAX_HAZARDS,
  REVEAL_MS,
  MUSIC_LEAD_MS,
  envelope,
  hitsFor,
  letterbox,
  planProblems,
  windupFor,
  type AttackDef,
  type AttackWindow,
  type BossAnim,
  type BossEvent,
  type BossId,
  type BossIntensity,
  type BossMood,
  type BossTuning,
  type BossView,
  type Motion,
  type SpriteDef,
} from '../core/Boss';
import { CueSheet } from '../core/Cues';
import { Rng } from '../core/Rng';
import type { BrickSpec } from '../core/types';
import type { Ball } from '../entities/Ball';
import type { Brick, BrickOwner, DestroyCause, HitOptions, HitResult } from '../entities/Brick';
import type { Paddle } from '../entities/Paddle';
import { save } from '../services';
import { calm, theme } from '../ui/theme';
import { audio } from './AudioSystem';
import { BossBody } from './BossBody';
import type { BrickSystem } from './BrickSystem';
import { HazardSystem } from './HazardSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { Light, LightOptions, LightingSystem } from './LightingSystem';
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

/** One moment of a cutscene: `run` is called once, `at` ms of the fight clock into the scene. */
export interface Cue {
  at: number;
  run(s: BossStage): void;
}

/** A staged moment of the fight. It only presents: nothing depends on a cue having fired. */
export interface Cutscene {
  lengthMs: number;
  cues: Cue[];
}

/** Where a scene points the camera: `zoom` times closer than play, centred on a point of the field. */
export interface Shot {
  zoom: number;
  x: number;
  y: number;
  /** Jump there, as a film cuts. Left out, the camera glides. */
  cut?: boolean;
}

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
  /** How hard the boss track plays through the phase. Left out, it rises with the phases. */
  intensity?: BossIntensity;
  /** The scene that opens the phase, with play frozen. Not on the first: the entrance opens that. */
  enter?: Cutscene;
  /** The phase's attacks, played in order and wrapping. Without any the phase never attacks. */
  deck?: AttackDef[];
  /** The calm between attacks at a full and at an empty pool, in ms on Normal. */
  gapMs?: [number, number];
}

export interface BossDef {
  id: BossId;
  name: string;
  /** The line over the name on the title card. The world's name when left out. */
  epithet?: string;
  parts: PartDef[];
  /** The picture drawn over the parts. Without one the parts show as bricks. */
  sprite?: SpriteDef;
  poses?: Record<string, Pose>;
  phases: PhaseDef[];
  /** The scene the boss arrives in, before the music and its name. */
  entrance?: Cutscene;
  /** The scene the boss dies in, after the final hit. */
  death?: Cutscene;
  /** The keepsake the award card spins once the boss is dead. Left out, the card has none. */
  trophy?: string;
}

/** What cutscenes and phase hooks get: the live systems, plus what the fight owns. */
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
  readonly audio: typeof audio;
  /** Plays an animation until the fight's step next changes. A flinch still shows over it. */
  anim(name: BossAnim): void;
  /** Adds a light. It is killed when the cutscene that made it ends, or with the fight. */
  light(o: LightOptions): Light;
  /** A tween for looks only. It is stopped when the cutscene that made it ends, or with the fight. */
  tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween;
  /** A blow at a point, with no sound. `scale` is 1 and `color` the danger colour when left out. */
  impact(x: number, y: number, scale?: number, color?: number): void;
  /** Points the camera until the scene ends. Null hands it back. It holds still under reduced motion. */
  shot(shot: Shot | null): void;
  /**
   * Lightning, with no sound: the room flashes and the dark of the intro thins for a moment.
   * Dropped under reduced motion, and when the room has flashed too often.
   */
  glimpse(color?: number): void;
  /** Lifts the dark of the intro now. The reveal lifts it in any case. */
  unveil(): void;
}

/** The title card: the line over the name, the name, and how long it has been up of how long it stays. */
export interface BossTitle {
  kicker: string;
  name: string;
  ms: number;
  holdMs: number;
}

/** The award card that follows the death. */
export interface BossAward {
  name: string;
  /** The keepsake's name, or null for a boss that leaves none. */
  trophy: string | null;
  score: number;
  coins: number;
  /** How long the card has been up, in ms of the fight clock. */
  ms: number;
  /** A tap goes on from here. */
  ready: boolean;
  /** What is left of the wait before the level goes on by itself, 1..0. */
  left: number;
}

/** What the HUD draws over everything while a scene has the field. */
export interface BossCinema {
  /** How far in the letterbox bars are, 0..1. */
  bars: number;
  /** How black the screen is, 0..1. */
  dark: number;
  title: BossTitle | null;
  award: BossAward | null;
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
  /** False until the reveal, and once the boss is dead. */
  shown: boolean;
  /** True while the player has the paddle. False for a scene, when the HUD steps aside. */
  control: boolean;
  cinema: BossCinema;
}

/** What the director needs from Play. Built from closures, like RunHost. */
export interface BossHost {
  readonly scene: Phaser.Scene;
  readonly bricks: BrickSystem;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly scenery: ParallaxBackdrop;
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
  /** Coins straight to the player, with no pickup to catch. */
  addCoins(n: number): void;
  /** HUD label; a null detail shows the bricks left. */
  setLabel(title: string, detail: string | null): void;
  /** The boss is dead and its award is over: the level is won, or the Arcade run goes on. */
  defeated(): void;
  /** The health bar. Null takes it down. */
  setHud(view: BossHud | null): void;
  /**
   * Points the camera `zoom` times closer at a point of the field, never past the field's edge.
   * Zoom 1 is the view play uses, wherever it is pointed.
   */
  frame(zoom: number, x: number, y: number): void;
  /** The serve hint and countdown, as a level without a boss shows them from the start. */
  showHint(): void;
  /** A blow at a point: a ring, sparks, a shake and light sized by `scale`, with no sound. */
  impact(x: number, y: number, scale: number, color: number): void;
  /** Every ball, held or in flight. */
  balls(): readonly Ball[];
  /** A skull landed on the paddle: a life goes and the ball stays in play. */
  hurt(): void;
}

/** Dev builds only: `&phase=2` starts the fight in its second phase. Counted from 0 here. */
export const FORCED_BOSS_PHASE = ((): number | undefined => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const n = Number(new URLSearchParams(location.search).get('phase'));
  return Number.isInteger(n) && n >= 1 ? n - 1 : undefined;
})();

/** Dev builds only: `&attack=volley` makes every phase's deck that one attack. */
const FORCED_BOSS_ATTACK = ((): string | undefined => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  return new URLSearchParams(location.search).get('attack') ?? undefined;
})();

/** A body with no motion stays here. */
const REST = { x: 0, y: 0 } as const;
/** The title card leaves this long before the reveal ends, in ms, so the hint gets a clear field. */
const CARD_LEAD_MS = 500;
/** The dark of the intro comes down, and lifts, over this long, in ms. */
const DARK_FADE_MS = 500;
/** How much of the dark a glimpse takes away, how long it holds, and how long the dark takes to close again, in ms. */
const GLIMPSE_DEPTH = 0.88;
const GLIMPSE_HOLD_MS = 90;
const GLIMPSE_FADE_MS = 380;
/** How hard a glimpse flashes the room, and its colour when a cue names none: the cold white of lightning. */
const GLIMPSE_FLASH = 0.5;
const LIGHTNING = 0xdfe8ff;
/** Time constant of the camera's glide to a new shot, in ms. */
const SHOT_EASE_MS = 220;
/** How close the camera stands for the title card, for a phase scene and for the death scene. */
const REVEAL_ZOOM = 1.3;
const SCENE_ZOOM = 1.25;
const DEATH_ZOOM = 1.45;
/** The camera starts back to the view play uses this long before a scene hands play back, in ms. */
const PULL_BACK_MS = 800;
/** A zoom this close to 1 is the view play uses. */
const ZOOM_REST = 0.002;
/** The key light on the boss while it is named, so a dark room still shows it: reach in px, colour, strength. */
const SPOT_RADIUS = 280;
const SPOT_COLOR = 0xfff0dc;
const SPOT_LIGHT = 1.1;
/** The blow that empties a pool holds the frame this long, in ms. Skipped under reduced motion. */
const KILL_STOP_MS = 180;
/** Placeholder sounds until the fight has its own: the title card's hit and the award's chime. */
const TITLE_SFX = 'boss_title';
const AWARD_SFX = 'boss_award';
/** The lock reticle draws over the aim arrow (4) and under the hazards and the ball (5). */
const RETICLE_DEPTH = 4.1;
/** The reticle on screen, in px. Square, so the cross shows it turning. */
const RETICLE_SIZE = 72;
/** The reticle takes this long to turn once round, in ms of the fight clock. */
const RETICLE_TURN_MS = 7000;
/** How loud an attack's wind-up sound plays. */
const TELL_VOLUME = 0.5;

/** Lights and tweens made through the stage, kept so they can be taken down together. */
interface Props {
  lights: Light[];
  tweens: Phaser.Tweens.Tween[];
}

/** A cutscene in progress, with what its cues have lit and set moving. */
interface Playing extends Props {
  sheet: CueSheet<Cue>;
}

/**
 * Runs a boss fight inside Play: stages the arrival, counts the hits on the parts, drains the
 * pools, plays the scenes between and ends the level.
 */
export class BossDirector implements BrickOwner {
  /** For the debug overlay, like LightingSystem.current. */
  static current?: BossDirector;

  readonly state: BossState;
  /** Dev tools: frames in which a free ball's centre sat inside a part. It should stay 0. */
  embedded = 0;
  /** The body and the stage built around it. There is neither before the entrance. */
  private cast?: { body: BossBody; stage: BossStage };
  /** What the HUD draws. One object, kept up to date, so a frame allocates nothing. */
  private readonly view: BossHud = {
    name: '',
    title: '',
    phase: 0,
    phases: 0,
    health: 1,
    shown: true,
    control: false,
    cinema: { bars: 0, dark: 0, title: null, award: null },
  };
  /** The title card and the award card. One object each, kept up to date while it shows. */
  private readonly card: BossTitle = {
    kicker: '',
    name: '',
    ms: 0,
    holdMs: REVEAL_MS - CARD_LEAD_MS,
  };
  private readonly prize: BossAward = {
    name: '',
    trophy: null,
    score: BOSS_DEFEAT_BONUS,
    coins: BOSS_DEFEAT_COINS,
    ms: 0,
    ready: false,
    left: 1,
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
  /** Length of the entrance cutscene, in ms. */
  private readonly entranceMs: number;
  /** True from the hush until the fight first begins. */
  private opening: boolean;
  /** The intro's dark is wanted: nothing has lifted it yet. Reduced motion never shows it. */
  private veiled = false;
  /** How dark the screen is now, 0..1, before any glimpse thins it. */
  private dark = 0;
  /** Fight-clock time since the last glimpse, in ms. */
  private glimpsed = Infinity;
  /** Where a cue pointed the camera, until its scene ends. */
  private shot?: Shot;
  /** The next move of the camera is a cut. */
  private cut = false;
  /** Where the camera is now, and whether it is away from the view play uses. */
  private readonly cam = { zoom: 1, x: 0, y: 0 };
  private framed = false;
  /** The framework's own shot of the boss. One object, so a frame allocates nothing. */
  private readonly look: Shot = { zoom: 1, x: 0, y: 0 };
  /** The award's chime has played. */
  private chimed = false;
  /** Aftermath time the calm track comes in: once the award's chime has rung out. */
  private calmAt = Infinity;
  /** How long the title's sound is heard, in ms. The boss track waits for it. */
  private titleMs = 0;
  /** The key light of the reveal, until the fight begins. */
  private spot?: Light;
  /** Phases whose setup has run, counted from the first. */
  private ready = 0;
  /** The cutscene playing now. */
  private playing?: Playing;
  /** What phase hooks lit and set moving. It lasts as long as the fight. */
  private readonly kept: Props = { lights: [], tweens: [] };
  /** The animation a cue asked for, until the step or the attack window next changes. */
  private forced?: BossAnim;
  private readonly tuning: BossTuning;
  /** Every phase's attacks, as this fight plays them. */
  private readonly decks: AttackDef[][];
  /** The fight's own random numbers: the one stream every plan draws from. */
  private readonly rng: Rng;
  private readonly hazards: HazardSystem;
  /** The boss is recovering from an attack that leaves an opening. */
  private open = false;
  /** The part the opening marks, by id. */
  private lockPart?: string;
  /** Where the lock is. One object, kept up to date, so a frame allocates nothing. */
  private readonly lockAt = { x: 0, y: 0 };
  /** The mark on the locked part. Made the first time a lock shows. */
  private reticle?: Phaser.GameObjects.Image;

  /** `seed` feeds the fight's Rng. Play picks it once; it is the only randomness outside Rng. */
  constructor(
    readonly def: BossDef,
    private host: BossHost,
    opts: { startPhase?: number; seed?: number } = {},
  ) {
    // A fight the dev tools start part-way goes straight in, with no intro.
    this.opening = opts.startPhase === undefined;
    this.entranceMs = def.entrance?.lengthMs ?? 0;
    this.tuning = BOSS_TUNING[save.state.difficulty];
    this.rng = new Rng(opts.seed ?? 0);
    const only = def.phases.flatMap((p) => p.deck ?? []).find((a) => a.id === FORCED_BOSS_ATTACK);
    this.decks = def.phases.map((p) => (only ? [only] : (p.deck ?? [])));
    this.state = new BossState(
      {
        phases: def.phases.map((p, i) => ({
          hits: p.hits,
          enterMs: p.enter?.lengthMs ?? 0,
          gapMs: p.gapMs,
          deck: this.decks[i],
        })),
        entranceMs: this.entranceMs,
        deathMs: def.death?.lengthMs ?? 0,
      },
      this.tuning,
      { phase: opts.startPhase, intro: this.opening },
    );
    this.hazards = new HazardSystem({
      scene: host.scene,
      juice: host.juice,
      lighting: host.lighting,
      paddle: host.paddle,
      partPos: (id) => this.cast?.body.part(id),
      balls: () => host.balls(),
      hurt: () => host.hurt(),
    });
    if (this.opening) {
      // The hush: the level's music stops and the screen goes black before anything arrives.
      audio.stopMusic('fade');
      this.veiled = true;
      // The HUD is built before the first update and looks for the bar then: it is there, unshown.
      this.showHud();
    } else {
      this.begin();
    }
    BossDirector.current = this;
  }

  /** False once the fight is over. */
  get active(): boolean {
    return !this.over;
  }

  get progress(): number {
    return this.state.progress;
  }

  /** Play is paused for a scene: only the paddle and the boss update. */
  get frozen(): boolean {
    const { step } = this.state;
    return step === 'transition' || step === 'finale' || step === 'aftermath';
  }

  /** The ball waits on the paddle and its serve clock stands still. */
  get holdServe(): boolean {
    const { step } = this.state;
    return step === 'hush' || step === 'entrance' || step === 'reveal';
  }

  /** A scene has the field: taps skip it or do nothing, and abilities wait. */
  get cinematic(): boolean {
    return !this.over && this.state.step !== 'fight';
  }

  /** What the boss track should be playing now. Null is silence. */
  get music(): BossMood | null {
    switch (this.state.step) {
      case 'hush':
      case 'entrance':
      case 'finale':
        return null;
      case 'reveal':
        return this.state.stepMs < this.titleMs ? null : 'rise';
      case 'fight':
      case 'transition':
        return this.intensity();
      case 'aftermath':
        // The ending phrase, then the award's chime, each have the silence to themselves first.
        return this.state.stepMs < this.calmAt ? null : 'rest';
      case 'done':
        return 'rest';
    }
  }

  /**
   * Centre of the part an opening marks, while the boss recovers and the part stands; else null.
   * Rising balls are drawn to it.
   */
  get lock(): { x: number; y: number } | null {
    if (this.over || this.state.window !== 'recover' || this.lockPart === undefined) return null;
    const part = this.cast?.body.part(this.lockPart);
    if (!part) return null;
    this.lockAt.x = part.x;
    this.lockAt.y = part.y;
    return this.lockAt;
  }

  /** Dev tools: hazards of the attack under way that are not over yet. */
  get hazardCount(): number {
    return this.hazards.count;
  }

  /** A tap. True when a scene took it, so it does nothing else. */
  skip(): boolean {
    if (!this.cinematic) return false;
    for (const e of this.state.skip()) this.react(e);
    return true;
  }

  /** A life was lost, to the ball or to a skull: the attack ends and the player gets a breather. */
  onLifeLost(): void {
    if (this.over) return;
    for (const e of this.state.onLifeLost()) this.react(e);
    // In the gap the state has nothing to report, and the field is cleared all the same.
    this.hazards.clear();
    // The last life ends the level before another update, so the reticle comes down here.
    this.aim();
  }

  /** Runs inside a physics callback, so it only records the hit. `update` applies it. */
  strike(brick: Brick, damage: number, cause: DestroyCause, opts: HitOptions): HitResult {
    if (this.state.step !== 'fight') return 'immune';
    const part = this.cast?.body.partOf(brick);
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
    const { state, host } = this;
    // Everything below runs on the fight clock, so slow motion and hit-stop hold the boss too.
    const tick = host.juice.inHitStop ? 0 : dt / host.timeScale();
    this.clock += tick;
    const inPlay = host.ballInPlay();
    const events = state.tick(tick, inPlay);
    if (this.pending > 0) {
      const hits = this.pending;
      this.pending = 0;
      if (this.clock - this.hurtAt >= HURT_GAP_MS) {
        this.hurtAt = this.clock;
        this.cast?.body.flinch();
      }
      events.push(...state.damage(hits));
    }
    // The scene already playing gets this step of the clock before an event can end it.
    const before = this.playing;
    this.runCues(tick);
    for (const e of events) this.react(e);
    if (this.over) return;
    // A scene that began in this update has run only for what the step had left over.
    if (this.playing !== before) this.runCues(state.stepMs);
    // The title's sound must start in quiet, so the entrance waits for its own sounds to ring out.
    if (state.step === 'entrance') state.holdUntil(state.stepMs + audio.ringingMs());
    // Hazards keep the attack's time: like its windows, they wait while no ball is in play.
    // Last of the state changes, since a skull that lands comes back in through onLifeLost.
    if (state.step === 'fight' && inPlay) this.hazards.update(tick);
    const body = this.cast?.body;
    if (body) {
      // A step with no length is passed straight through, so an entrance seen here has one.
      if (state.step === 'entrance') body.arrive(Math.min(1, state.stepMs / this.entranceMs));
      // Balls hang still while play is frozen, so the body holds still too and cannot cover one.
      const speed = this.frozen ? 0 : inPlay ? BODY_MAX_SPEED : BODY_SCENE_SPEED;
      body.move(this.offset(), (speed * tick) / 1000);
      body.show(this.anim());
      const gone = state.step === 'finale' || state.step === 'aftermath';
      body.glow(gone ? 'out' : this.open ? 'open' : 'rest');
    }
    this.aim();
    this.showHud();
    this.present(tick);
  }

  /** Dev tools: deals hits as if they had landed, so only in the fight. */
  debugHit(hits: number): void {
    if (this.state.step === 'fight') this.pending += hits;
  }

  /** Dev tools: counts this frame as embedded when one of the points is inside a part. */
  debugProbe(points: ReadonlyArray<{ x: number; y: number }>): void {
    const body = this.cast?.body;
    if (!this.over && body && points.some((p) => body.holds(p.x, p.y))) this.embedded++;
  }

  destroy(): void {
    this.endScene();
    this.clear(this.kept);
    this.spot?.kill();
    this.spot = undefined;
    this.hazards.destroy();
    this.reticle?.destroy();
    this.reticle = undefined;
    this.cast?.body.destroy();
    if (BossDirector.current === this) BossDirector.current = undefined;
  }

  private react(e: BossEvent): void {
    if (e.type === 'phase') {
      this.host.addScore(BOSS_PHASE_BONUS);
      this.label();
      // Without an entry scene the fight carries straight on. With one, `fight` sets the phase up.
      if (this.state.step === 'fight') this.setUp();
      return;
    }
    // Whatever a cue asked the sprite to show belonged to the step or window that just ended.
    this.forced = undefined;
    if (e.type === 'window') {
      this.turn(e.window, e.attack);
      return;
    }
    // The fight only ever stops for a scene, and no attack, lock or jam outlasts it.
    if (e.step === 'transition' || e.step === 'finale') {
      this.settle();
      this.host.paddle.jam(0);
      // The blow that did it hangs for a moment before the scene takes over.
      this.host.juice.hitStop(KILL_STOP_MS);
    }
    switch (e.step) {
      case 'hush':
        // The state starts here and never comes back.
        break;
      case 'entrance': {
        const { body } = this.summon();
        body.arrive(0);
        // Nothing is in play, so the body starts where its motion puts it.
        body.move(this.offset(), Infinity);
        this.startScene(this.def.entrance);
        break;
      }
      case 'reveal':
        this.endScene();
        this.summon().body.arrive(1);
        this.card.kicker = this.def.epithet ?? theme().name;
        this.card.name = this.def.name;
        audio.sfx(TITLE_SFX, 0.6);
        // The boss track comes in once the title's sound is over, and plays a while before the fight.
        this.titleMs = audio.heardMs(TITLE_SFX);
        this.state.holdUntil(this.titleMs + MUSIC_LEAD_MS);
        this.card.holdMs = this.state.stepLength - CARD_LEAD_MS;
        this.label();
        this.veiled = false;
        this.spotlight();
        break;
      case 'fight':
        this.begin();
        break;
      case 'transition':
        this.startScene(this.def.phases[this.state.phase]!.enter);
        break;
      case 'finale':
        this.die();
        break;
      case 'aftermath':
        this.fall();
        break;
      case 'done':
        this.over = true;
        this.host.setHud(null);
        this.host.frame(1, this.cam.x, this.cam.y);
        this.host.defeated();
        break;
    }
  }

  /** The attack cycle moved on. `id` names the attack, and is null in the gap. */
  private turn(window: AttackWindow, id: string | null): void {
    const attack = this.decks[this.state.phase]!.find((a) => a.id === id);
    switch (window) {
      case 'gap':
        this.settle();
        // A pool that just emptied has not set its phase up yet: the stance is still the last one's.
        this.pose(null, this.ready - 1);
        break;
      case 'windup':
        if (attack) this.windUp(attack);
        break;
      case 'live':
        this.hazards.go();
        break;
      case 'recover':
        if (!attack?.opening) break;
        this.open = true;
        this.lockPart = attack.opening.lock;
        this.pose(attack.opening.pose ?? null);
        break;
    }
  }

  /** No attack is under way: nothing is on the field, nothing is marked, nothing is given away. */
  private settle(): void {
    this.hazards.clear();
    this.open = false;
    this.lockPart = undefined;
  }

  /** A wind-up began: the attack plans against the field as it stands, and the warnings go up. */
  private windUp(attack: AttackDef): void {
    const { host, state } = this;
    const body = this.cast?.body;
    if (!body) return;
    const parts: BossView['parts'] = {};
    for (const { id } of this.def.parts) {
      const brick = body.part(id);
      if (!brick) continue;
      parts[id] = { x: brick.x, y: brick.y, width: brick.spec.width, height: brick.spec.height };
    }
    const balls: BossView['balls'] = [];
    for (const b of host.balls()) {
      if (!b.attached) balls.push({ x: b.x, y: b.y, vx: b.body.velocity.x, vy: b.body.velocity.y });
    }
    const plan = attack.plan({
      rng: this.rng,
      phaseProgress: 1 - state.pool / state.poolMax,
      paddle: { x: host.paddle.x, width: host.paddle.displayWidth },
      balls,
      parts,
    });
    if (import.meta.env.DEV) {
      const ids = this.def.parts.map((p) => p.id);
      for (const problem of planProblems(plan, attack, ids)) {
        console.warn(`[boss] ${this.def.id} ${attack.id}: ${problem}`);
      }
    }
    // Hazard counts are part of the fight, the same on every device: only the ceiling cuts them.
    this.hazards.arm(
      { hazards: plan.hazards.slice(0, MAX_HAZARDS) },
      windupFor(attack, this.tuning),
    );
    const sfx = attack.tell?.sfx;
    if (sfx) audio.sfx(sfx, TELL_VOLUME, 0, { x: body.center.x });
  }

  /** Keeps the reticle on the locked part, and takes it down when nothing is locked. */
  private aim(): void {
    const at = this.lock;
    if (!at) {
      this.reticle?.setVisible(false);
      return;
    }
    this.reticle ??= this.host.scene.add.image(0, 0, 'crosshair').setDepth(RETICLE_DEPTH);
    this.reticle
      .setDisplaySize(RETICLE_SIZE, RETICLE_SIZE)
      .setTint(theme().palette.danger)
      .setPosition(at.x, at.y)
      // Turned by the fight clock, so it slows and stops with everything else.
      .setRotation(calm() ? 0 : (2 * Math.PI * this.clock) / RETICLE_TURN_MS)
      .setVisible(true);
  }

  /** Brings the boss onto the field, the first time it is asked. */
  private summon(): { body: BossBody; stage: BossStage } {
    if (!this.cast) {
      const body = new BossBody(this.def, this.host, this);
      this.cast = { body, stage: this.makeStage(body) };
    }
    return this.cast;
  }

  /**
   * The fight is on, however it was reached: the boss stands in its place, no scene, band or dim
   * is left over, and the current phase is set up.
   */
  private begin(): void {
    this.endScene();
    const fresh = !this.cast;
    const { body } = this.summon();
    body.arrive(1);
    this.setUp();
    // Nothing was in play before a body appeared, so it starts where its pose and motion put it.
    if (fresh) body.move(this.offset(), Infinity);
    // The ball is about to be live: no dark and no close-up outlasts the scene, skipped or not.
    this.veiled = false;
    this.dark = 0;
    this.cam.zoom = 1;
    this.spot?.kill();
    this.spot = undefined;
    this.label();
    if (this.opening) {
      this.opening = false;
      this.host.showHint();
    }
    this.showHud();
  }

  /** Runs the setup of every phase up to the current one that has not run yet, then poses. */
  private setUp(): void {
    const { stage } = this.summon();
    // A fight that starts part-way has still been through the phases before it.
    while (this.ready <= this.state.phase) this.def.phases[this.ready++]!.setup?.(stage);
    this.pose(null);
  }

  /** The final hit: the music cuts dead and the death scene begins. */
  private die(): void {
    audio.stopMusic('cut');
    const { stage } = this.summon();
    const { x, y } = stage.center;
    stage.impact(x, y);
    this.startScene(this.def.death);
  }

  /**
   * The death scene is over: the parts go, the arena clears, the ending phrase plays and the
   * award goes up with what the kill earned.
   */
  private fall(): void {
    this.endScene();
    this.clear(this.kept);
    const { body } = this.summon();
    body.retire(...this.def.parts.map((p) => p.id));
    body.fade();
    this.host.bricks.shatterBelow(-Infinity);
    this.host.addScore(BOSS_DEFEAT_BONUS);
    this.host.addCoins(BOSS_DEFEAT_COINS);
    audio.bossStinger();
    // The ending phrase, and whatever the death scene left ringing, is heard on its own first.
    this.state.delayAward(audio.ringingMs() + AWARD_BREAK_MS);
    this.prize.name = this.def.name;
    this.prize.trophy = this.def.trophy ?? null;
    this.chimed = false;
    this.calmAt = Infinity;
  }

  /** Starts a cutscene. A boss that has none for this moment shows nothing. */
  private startScene(cutscene: Cutscene | undefined): void {
    this.endScene();
    if (!cutscene) return;
    this.playing = {
      sheet: new CueSheet(cutscene.cues, cutscene.lengthMs),
      lights: [],
      tweens: [],
    };
  }

  /** Advances the playing cutscene by `ms` of the fight clock and runs the cues that came due. */
  private runCues(ms: number): void {
    const stage = this.cast?.stage;
    if (!this.playing || !stage) return;
    for (const cue of this.playing.sheet.tick(ms)) cue.run(stage);
  }

  /** Ends the playing cutscene, finished or skipped. What it lit and set moving goes with it. */
  private endScene(): void {
    const playing = this.playing;
    if (!playing) return;
    this.playing = undefined;
    playing.sheet.skip();
    this.clear(playing);
    // The camera was the scene's to point only while it played.
    this.shot = undefined;
  }

  private clear(props: Props): void {
    for (const light of props.lights) light.kill();
    for (const tween of props.tweens) tween.stop();
    props.lights.length = 0;
    props.tweens.length = 0;
  }

  /**
   * Keeps what the HUD draws over a scene, and the camera, on what the fight shows now. All of it
   * follows the fight clock, so a pause holds it and a skipped scene leaves nothing behind.
   */
  private present(tick: number): void {
    const { state } = this;
    const { step, stepMs } = state;
    const c = this.view.cinema;
    const still = calm();
    c.bars = letterbox(step, stepMs, state.stepLength);
    const target = this.veiled && !still ? HUSH_DARK : 0;
    const fade = tick / DARK_FADE_MS;
    this.dark =
      this.dark < target ? Math.min(target, this.dark + fade) : Math.max(target, this.dark - fade);
    this.glimpsed += tick;
    const seen = envelope(this.glimpsed, GLIMPSE_HOLD_MS + GLIMPSE_FADE_MS, 0, GLIMPSE_FADE_MS);
    c.dark = this.dark * (1 - GLIMPSE_DEPTH * seen);
    if (step === 'reveal' && stepMs < this.card.holdMs) {
      this.card.ms = stepMs;
      c.title = this.card;
    } else {
      c.title = null;
    }
    const shown = state.awardMs;
    if (shown >= 0) {
      const prize = this.prize;
      prize.ms = shown;
      prize.ready = shown >= AWARD_GUARD_MS;
      prize.left = 1 - shown / AFTERMATH_MS;
      c.award = prize;
      if (!this.chimed && shown >= AWARD_TROPHY_MS) {
        this.chimed = true;
        audio.sfx(AWARD_SFX, 0.5);
        this.calmAt = stepMs + audio.ringingMs();
      }
    } else {
      c.award = null;
    }
    this.point(still ? undefined : (this.shot ?? this.staged()), tick);
  }

  /** Where the framework points the camera when no cue has: in on the boss, for its scenes. */
  private staged(): Shot | undefined {
    const body = this.cast?.body;
    if (!body) return undefined;
    const { step, stepMs, stepLength } = this.state;
    const { look } = this;
    if (step === 'reveal') look.zoom = REVEAL_ZOOM;
    else if (step === 'transition') look.zoom = SCENE_ZOOM;
    else if (step === 'finale') look.zoom = DEATH_ZOOM;
    else return undefined;
    // A scene that hands play back pulls out first, so the ball never goes live in a close-up.
    if (step !== 'finale' && stepMs > stepLength - PULL_BACK_MS) return undefined;
    const { x, y } = body.focus;
    look.x = x;
    look.y = y;
    return look;
  }

  /** Moves the camera toward `shot`, or back out to the view play uses when there is none. */
  private point(shot: Shot | undefined, tick: number): void {
    const { cam } = this;
    const k = this.cut ? 1 : 1 - Math.exp(-tick / SHOT_EASE_MS);
    this.cut = false;
    if (shot) {
      // At the view play uses the camera looks nowhere in particular, so it starts on the shot.
      const from = cam.zoom - 1 < ZOOM_REST ? 1 : k;
      cam.x += (shot.x - cam.x) * from;
      cam.y += (shot.y - cam.y) * from;
      cam.zoom += (shot.zoom - cam.zoom) * k;
    } else {
      cam.zoom += (1 - cam.zoom) * k;
    }
    const rest = cam.zoom - 1 < ZOOM_REST;
    if (rest) cam.zoom = 1;
    if (!rest || this.framed) this.host.frame(cam.zoom, cam.x, cam.y);
    this.framed = !rest;
  }

  /** Lights the boss for its title card. A lamp on the boss, not a flash of the room. */
  private spotlight(): void {
    const { x, y } = this.summon().body.focus;
    this.spot = this.host.lighting.addLight({
      x,
      y,
      radius: SPOT_RADIUS,
      color: SPOT_COLOR,
      intensity: SPOT_LIGHT,
      priority: 7,
    });
  }

  /** Lightning through the dark. It is a whole-screen flash, so the room's limiter has the say. */
  private glimpse(color: number): void {
    const { lighting } = this.host;
    if (calm() || !lighting.flashAmbient(color, GLIMPSE_FLASH)) return;
    lighting.revealLevel(1);
    this.glimpsed = 0;
  }

  /** The HUD label names the boss and its phase. */
  private label(): void {
    const phase = this.def.phases[this.state.phase]!;
    this.host.setLabel(this.def.name.toUpperCase(), phase.title.toUpperCase());
  }

  /**
   * Null is the own pose of `phase`, the current one unless named. A phase without one, or a pose
   * nobody defined, is rest.
   */
  private pose(id: string | null, phase = this.state.phase): void {
    const name = id ?? this.def.phases[phase]?.pose;
    this.cast?.body.pose(name === undefined ? undefined : this.def.poses?.[name]);
  }

  /** Where the phase's motion puts the body now, from rest. */
  private offset(): { x: number; y: number } {
    return this.def.phases[this.state.phase]!.motion?.(this.clock) ?? REST;
  }

  /**
   * The animation the sprite shows now. Death outranks a flinch, a flinch what a cue asked for,
   * and a cue the attack cycle's own: open in an opening, tell through the wind-up and the attack.
   */
  private anim(): BossAnim {
    const { step, window } = this.state;
    if (step === 'finale' || step === 'aftermath') return 'death';
    if (this.clock - this.hurtAt < HURT_MS) return 'hurt';
    if (this.forced) return this.forced;
    if (this.open) return 'open';
    return window === 'windup' || window === 'live' ? 'tell' : 'idle';
  }

  /** How hard the track plays in this phase: what the phase says, or a rise across the phases. */
  private intensity(): BossIntensity {
    const { phases } = this.def;
    const i = this.state.phase;
    const own = phases[i]!.intensity;
    if (own) return own;
    if (phases.length === 1) return 'mid';
    return i === 0 ? 'low' : i === phases.length - 1 ? 'high' : 'mid';
  }

  private showHud(): void {
    const { state, view } = this;
    const { step } = state;
    view.name = this.def.name;
    view.title = this.def.phases[state.phase]!.title;
    view.phase = state.phase;
    view.phases = this.def.phases.length;
    view.shown =
      step === 'reveal' || step === 'fight' || step === 'transition' || step === 'finale';
    view.control = step === 'fight';
    // The bar fills from empty while the boss is named.
    view.health = step === 'reveal' ? state.stepMs / REVEAL_MS : state.pool / state.poolMax;
    this.host.setHud(view);
  }

  private makeStage(body: BossBody): BossStage {
    const { host } = this;
    return {
      scene: host.scene,
      bricks: host.bricks,
      juice: host.juice,
      lighting: host.lighting,
      scenery: host.scenery,
      powerups: host.powerups,
      paddle: host.paddle,
      audio,
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
      anim: (name) => {
        this.forced = name;
      },
      light: (o) => {
        const light = host.lighting.addLight(o);
        // A cue's light goes with its scene; a phase hook's stays for the fight.
        (this.playing ?? this.kept).lights.push(light);
        return light;
      },
      tween: (config) => {
        const tween = host.scene.tweens.add(config);
        (this.playing ?? this.kept).tweens.push(tween);
        return tween;
      },
      impact: (x, y, scale = 1, color = theme().palette.danger) => {
        host.impact(x, y, scale, color);
      },
      shot: (shot) => {
        this.shot = shot ?? undefined;
        this.cut = !!shot?.cut;
      },
      glimpse: (color = LIGHTNING) => this.glimpse(color),
      unveil: () => {
        this.veiled = false;
      },
    };
  }
}
