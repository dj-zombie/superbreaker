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
  HUSH_DARK,
  LETHAL_GAP_MS,
  REVEAL_MS,
  hitsFor,
  type BossAnim,
  type BossEvent,
  type BossId,
  type BossIntensity,
  type BossMood,
  type Motion,
  type SpriteDef,
} from '../core/Boss';
import { CueSheet } from '../core/Cues';
import type { BrickSpec } from '../core/types';
import type { Brick, BrickOwner, DestroyCause, HitOptions, HitResult } from '../entities/Brick';
import type { Paddle } from '../entities/Paddle';
import { save } from '../services';
import { calm, css, theme } from '../ui/theme';
import { audio } from './AudioSystem';
import type { Backdrop } from './Backdrop';
import { BossBody } from './BossBody';
import type { BrickSystem } from './BrickSystem';
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
}

export interface BossDef {
  id: BossId;
  name: string;
  /** The line over the name on the title band. The world's name when left out. */
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
  /** Puts the title band up for `holdMs`, and returns a function that takes it down at once. */
  titleCard(kicker: string, name: string, holdMs: number): () => void;
  /** The serve hint and countdown, as a level without a boss shows them from the start. */
  showHint(): void;
  /** A blow at a point: a ring, sparks, a shake and light sized by `scale`, with no sound. */
  impact(x: number, y: number, scale: number, color: number): void;
}

/** Dev builds only: `&phase=2` starts the fight in its second phase. Counted from 0 here. */
export const FORCED_BOSS_PHASE = ((): number | undefined => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const n = Number(new URLSearchParams(location.search).get('phase'));
  return Number.isInteger(n) && n >= 1 ? n - 1 : undefined;
})();

/** A body with no motion stays here. */
const REST = { x: 0, y: 0 } as const;
/** The title band leaves this long before the reveal ends, in ms, so the hint gets a clear field. */
const CARD_LEAD_MS = 500;
/** Text size of the defeat bonus as it pops, in px. */
const BONUS_SIZE = 30;

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
  /** The hush dimmed the arena and nothing has lifted it yet. */
  private dimmed = false;
  /** Phases whose setup has run, counted from the first. */
  private ready = 0;
  /** The cutscene playing now. */
  private playing?: Playing;
  /** What phase hooks lit and set moving. It lasts as long as the fight. */
  private readonly kept: Props = { lights: [], tweens: [] };
  /** Takes the title band down while it is still up. */
  private dropCard?: () => void;
  /** The animation a cue asked for, until the step next changes. */
  private forced?: BossAnim;

  constructor(
    readonly def: BossDef,
    private host: BossHost,
    opts: { startPhase?: number } = {},
  ) {
    // A fight the dev tools start part-way goes straight in, with no intro.
    this.opening = opts.startPhase === undefined;
    this.entranceMs = def.entrance?.lengthMs ?? 0;
    this.state = new BossState(
      {
        phases: def.phases.map((p) => ({ hits: p.hits, enterMs: p.enter?.lengthMs ?? 0 })),
        entranceMs: this.entranceMs,
        deathMs: def.death?.lengthMs ?? 0,
      },
      BOSS_TUNING[save.state.difficulty],
      { phase: opts.startPhase, intro: this.opening },
    );
    if (this.opening) {
      // The hush: the level's music fades and the arena dims before anything arrives.
      audio.stopMusic('fade');
      if (!calm()) {
        host.backdrop.setDark(HUSH_DARK);
        this.dimmed = true;
      }
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
        return 'rise';
      case 'fight':
      case 'transition':
        return this.intensity();
      case 'aftermath':
      case 'done':
        return 'rest';
    }
  }

  /** A tap. True when a scene took it, so it does nothing else. */
  skip(): boolean {
    if (!this.cinematic) return false;
    for (const e of this.state.skip()) this.react(e);
    return true;
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
    const events = state.tick(tick, host.ballInPlay());
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
    const body = this.cast?.body;
    if (body) {
      // A step with no length is passed straight through, so an entrance seen here has one.
      if (state.step === 'entrance') body.arrive(state.stepMs / this.entranceMs);
      // Balls hang still while play is frozen, so the body holds still too and cannot cover one.
      const speed = this.frozen ? 0 : host.ballInPlay() ? BODY_MAX_SPEED : BODY_SCENE_SPEED;
      body.move(this.offset(), (speed * tick) / 1000);
      body.show(this.anim());
    }
    // The bar came down with the boss.
    if (state.step !== 'aftermath') this.showHud();
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
    this.dropCard?.();
    this.dropCard = undefined;
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
    // Whatever a cue asked the sprite to show belonged to the step that just ended.
    this.forced = undefined;
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
        this.dropCard = this.host.titleCard(
          this.def.epithet ?? theme().name,
          this.def.name,
          REVEAL_MS - CARD_LEAD_MS,
        );
        this.label();
        this.undim();
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
        this.host.defeated();
        break;
    }
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
    this.dropCard?.();
    this.dropCard = undefined;
    this.undim();
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

  /** The final hit: the music cuts dead, the stinger plays and the death scene begins. */
  private die(): void {
    audio.stopMusic('cut');
    audio.bossStinger();
    const { stage } = this.summon();
    const { x, y } = stage.center;
    stage.impact(x, y);
    this.startScene(this.def.death);
  }

  /** The death scene is over: the parts go, the arena clears and the bonus pops. */
  private fall(): void {
    this.endScene();
    this.clear(this.kept);
    const { body } = this.summon();
    const { x, y } = body.center;
    body.retire(...this.def.parts.map((p) => p.id));
    body.fade();
    this.host.bricks.shatterBelow(-Infinity);
    this.host.addScore(BOSS_DEFEAT_BONUS);
    const bonus = `+${BOSS_DEFEAT_BONUS.toLocaleString()}`;
    this.host.juice.popText(x, y, bonus, css(theme().palette.gold), BONUS_SIZE);
    this.host.setHud(null);
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
  }

  private clear(props: Props): void {
    for (const light of props.lights) light.kill();
    for (const tween of props.tweens) tween.stop();
    props.lights.length = 0;
    props.tweens.length = 0;
  }

  /** Lifts the hush's dim, if it is still down. */
  private undim(): void {
    if (!this.dimmed) return;
    this.dimmed = false;
    this.host.backdrop.setDark(0);
  }

  /** The HUD label names the boss and its phase. */
  private label(): void {
    const phase = this.def.phases[this.state.phase]!;
    this.host.setLabel(this.def.name.toUpperCase(), phase.title.toUpperCase());
  }

  /** Null is the phase's own pose. A phase without one, or a pose nobody defined, is rest. */
  private pose(id: string | null): void {
    const name = id ?? this.def.phases[this.state.phase]!.pose;
    this.cast?.body.pose(name === undefined ? undefined : this.def.poses?.[name]);
  }

  /** Where the phase's motion puts the body now, from rest. */
  private offset(): { x: number; y: number } {
    return this.def.phases[this.state.phase]!.motion?.(this.clock) ?? REST;
  }

  /** The animation the sprite shows now. Death outranks a flinch, a flinch what a cue asked for. */
  private anim(): BossAnim {
    const { step } = this.state;
    if (step === 'finale' || step === 'aftermath') return 'death';
    if (this.clock - this.hurtAt < HURT_MS) return 'hurt';
    return this.forced ?? 'idle';
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
    view.shown = step !== 'hush' && step !== 'entrance';
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
    };
  }
}
