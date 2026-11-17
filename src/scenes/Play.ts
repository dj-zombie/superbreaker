import Phaser from 'phaser';
import { worldForLevel, worldForRun, type WorldId } from '../art/backdrops';
import {
  ARENA_MID,
  COLORS,
  DECK_TOP,
  EXPLOSION_RADIUS,
  HEIGHT,
  HUD_HEIGHT,
  LOSE_Y,
  PADDLE_Y,
  POWERUP_INFO,
  SCENES,
  HYPER_DAMAGE_MULT,
  HYPER_TIME_SCALE,
  PHYSICS_FPS,
  STAGE_W,
  WIDTH,
} from '../config';
import { guardedShare, pickHomingTarget, type HomingBox } from '../core/Homing';
import { MusicIntensity } from '../core/MusicMood';
import { PacingDirector, collapseReady, type Intervention } from '../core/Pacing';
import {
  BALL_OVERFLOW_SCORE,
  BRICK_SCORE,
  DIFFICULTY,
  FIREBALL_DAMAGE,
  LASER_BRICK_SCORE,
  MAX_BALLS,
  MAX_LIVES,
  PIERCE_DAMAGE,
  START_LIVES,
  campaignSpeedScale,
  chaseSpeed,
  cruiseSpeed,
  idleSpeedBoost,
  relaxSpeed,
  scaleSpeeds,
  starsForLives,
  type DifficultyConfig,
} from '../core/Difficulty';
import { unlockedAbilities, type AbilityId } from '../core/Abilities';
import { powerupStats } from '../core/Economy';
import { LASER_MODE_DEFS } from '../core/Laser';
import {
  runHitDamage,
  runKey,
  scaleDifficulty,
  type RunConfig,
  type RunOutcome,
} from '../core/Run';
import { SLOT_ACTIONS, STOCK_ACTIONS } from '../core/KeyLayout';
import {
  SKILLS,
  SKILL_IDS,
  SLOWMO_TIME_SCALE,
  SkillCharge,
  gunBudget,
  type SkillId,
  type SkillView,
} from '../core/Skills';
import { abilitiesCarryOver, runCarry, type SessionPowerupId } from '../core/Session';
import type { LevelSpec, PowerupId } from '../core/types';
import { BOSSES } from '../bosses';
import { BALL_SIZE, Ball } from '../entities/Ball';
import type { Brick, HitResult } from '../entities/Brick';
import { Paddle } from '../entities/Paddle';
import { celebrate, gameplayStart, gameplayStop, reportProgress } from '../platform/crazygames';
import { controlDevice, onPadButton, PadButton } from '../platform/gamepad';
import { skillKeyLabel } from '../platform/keyboard';
import { haptic } from '../platform/haptics';
import { onAppBackground } from '../platform/lifecycle';
import { save } from '../services';
import { AbilitySystem, SLOT_COUNT, type SlotState } from '../systems/AbilitySystem';
import { audio } from '../systems/AudioSystem';
import { BossBody } from '../systems/BossBody';
import {
  BossDirector,
  FORCED_BOSS_PHASE,
  type BossHost,
  type BossHud,
} from '../systems/BossDirector';
import { BrickSystem, type DestroyCause } from '../systems/BrickSystem';
import { Backdrop } from '../systems/Backdrop';
import { BallFx } from '../systems/BallFx';
import { FrameMonitor, particleDensity } from '../systems/Quality';
import { FeverSystem } from '../systems/FeverSystem';
import { InputSystem } from '../systems/InputSystem';
import { JuiceSystem } from '../systems/JuiceSystem';
import { FORCED_LASER_MODE, LaserSystem } from '../systems/LaserSystem';
import { OnboardingCoach, type CoachHand } from '../systems/OnboardingCoach';
import { LightingSystem, type Light } from '../systems/LightingSystem';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { PowerupSystem, type ActiveEffect, type Pickup } from '../systems/PowerupSystem';
import { RunDirector, type RunHost } from '../systems/RunDirector';
import { framePanel, glowLineTexture } from '../ui/frames';
import { slam } from '../ui/fx/motion';
import { onBack } from '../ui/nav';
import { calm, css, pickWorld, theme, useWorld, worldLevels } from '../ui/theme';
import { display, glowWord, heading, label } from '../ui/type';
import { Meter, revealStars, RingTimer } from '../ui/widgets';
import { BaseScene } from './BaseScene';

export interface PlayData {
  /** Campaign level, 1-based. */
  index?: number;
  /** Starts an Arcade run instead of a campaign level. */
  run?: RunConfig;
}

export interface RunResults {
  config: RunConfig;
  outcome: Exclude<RunOutcome, 'playing'>;
  tier: number;
  reach: number;
  bestReach: number;
}

export interface ResultsData {
  win: boolean;
  index: number;
  score: number;
  stars: number;
  isBest: boolean;
  coinsEarned: number;
  bestScore: number;
  /** The fanfare's held chord lands with the last star: 3 stars or a world's last level. */
  tail?: boolean;
  run?: RunResults;
}

/** Read by the HUD scene every frame. */
export interface HudState {
  /** "LEVEL 3", "WAVE 7", "TIER 2/10". */
  title: string;
  /** Shown after the title; null shows the bricks left. */
  detail: string | null;
  /** Timed runs: time left in ms. */
  clockMs: number | null;
  score: number;
  lives: number;
  coinsEarned: number;
  combo: number;
  shield: boolean;
  effects: ActiveEffect[];
  remaining: number;
  slots: SlotState[];
  /** The always-on skills, in SKILL_IDS order. */
  skills: SkillView[];
  /** One-use powerups bought for this run, tapped from the HUD. */
  stock: SessionPowerupId[];
  /** Fever meter fill, or time left while Fever runs (0..1). */
  fever: number;
  feverActive: boolean;
  /** Drives the control deck's slider marker. */
  paddleX: number;
  /** A ball is waiting on the paddle for a launch. */
  ballHeld: boolean;
  /** The tutorial is showing how to move and launch, so the deck's own drag hint stands aside. */
  coaching: boolean;
  /** The tutorial's hand on a touch screen, drawn by the HUD so it shows over the deck. */
  coachHand: CoachHand | null;
  /** The ability slot the tutorial is waiting on the player to fire. */
  coachSlot: number | null;
  /** The skill the tutorial is waiting on the player to use. */
  coachSkill: SkillId | null;
  /** A boss's health bar while its fight runs. */
  boss: BossHud | null;
}

/** Shield bar center, just under the paddle and above the deck panel. */
const shieldY = () => DECK_TOP - 8;

/** Arcade passes sprite-vs-group callback args in its own order, so find the ball explicitly. */
function pickBall(a: unknown, b: unknown): Ball {
  return (a instanceof Ball ? a : b) as Ball;
}

/** Dev builds only: the running boss is `window.boss`, the way main.ts sets `window.game`. */
function exposeBoss(boss: BossDirector | undefined): void {
  if (import.meta.env.DEV) (window as unknown as { boss?: BossDirector }).boss = boss;
}

/** Resting collision box. Hit flashes scale the sprite without resizing the body. */
function homingBox(b: Brick): HomingBox {
  return { x: b.x, y: b.y, halfW: b.spec.width / 2, halfH: b.spec.height / 2 };
}

const AIM_MIN = -2.6;
const AIM_MAX = -0.55;
const AIM_SPEED = 2.4;
/** Homing turn rates in rad/s. */
const NUDGE_TURN = 1.8;
const ENDGAME_TURN = 1.1;
const NUDGE_MS = 4_000;
/** The steel comes down once per board after this long without a break... */
const WALLS_DOWN_IDLE_MS = 10_000;
/** ...when at least this share of the standing bricks is boxed in by it. */
const WALLS_DOWN_SHARE = 0.5;
const WALLS_DOWN_CHECK_MS = 500;
/** A power surge splits the ball into this many more, and tops up the Fever meter. */
const SURGE_BALLS = 2;
const SURGE_FEVER = 0.35;
/** A held serve launches itself after this long unless the player taps first. */
const SERVE_COUNTDOWN_MS = 3_000;
/** The tutorial holds the first serve; skipped, it gives this long. */
const FIRST_SERVE_MS = 5_000;
/** A magnet catch lets go by itself after this long. */
const MAGNET_HOLD_MS = 2_500;
/** The level-clear banner moves on to the next level by itself after this long. */
const CLEAR_ADVANCE_MS = 3_500;
/** Taps are ignored this long, so the tap that broke the last brick can't skip the banner. */
const CLEAR_TAP_GUARD_MS = 700;
/** The last level and an Arcade win wait this long before the results screen comes up. */
const RESULTS_DELAY_MS = 700;
/** An Arcade win has no stars to land the fanfare tail on, so it follows the rise. */
const ARCADE_TAIL_AT = 1.05;
/** The banner's "New best" sparkle waits for the stars and the score count. */
const NEW_BEST_MS = 1_250;
/** Spoken calls for the last three seconds, then "go" as the ball launches. Index 0 is "1". */
const COUNTDOWN_CALLS = ['count_1', 'count_2', 'count_3'] as const;
/** Cents over the combo callout for combo 5, 10, 15 and 20. A voice, so it only lifts a little. */
const COMBO_DETUNE = [0, 60, 120, 180];
/** A Descent breach sounds its alarm first; the life-lost sound follows by this many seconds. */
const BREACH_DEATH_DELAY = 0.35;
/** Laser hits light the brick at most this often. */
const LASER_GLOW_GAP_MS = 80;
/** Bullet time cools the whole field by multiplying it with this. */
const SLOWMO_TINT = 0xa8c4ff;

export class Play extends BaseScene {
  levelIndex = 1;
  /** Set when this is an Arcade run rather than a campaign level. */
  runConfig?: RunConfig;
  hud!: HudState;

  private level!: LevelSpec;
  world!: WorldId;
  private runDirector?: RunDirector;
  /** Set when the level names a boss. */
  private boss?: BossDirector;
  private diff!: DifficultyConfig;
  private paddle!: Paddle;
  private balls!: Phaser.Physics.Arcade.Group;
  private laser!: LaserSystem;
  private bricks!: BrickSystem;
  private powerups!: PowerupSystem;
  private abilities!: AbilitySystem;
  private fever!: FeverSystem;
  private backdrop!: Backdrop;
  private scenery!: ParallaxBackdrop;
  private lighting!: LightingSystem;
  private ballLights = new Map<Ball, Light>();
  private brickLights: Array<{ brick: Brick; light: Light }> = [];
  private beacons = new Map<Brick, Light>();
  private shieldLight?: Light;
  private ballFx!: BallFx;
  private frameMonitor!: FrameMonitor;
  private pacing!: PacingDirector;
  private musicMood!: MusicIntensity;
  private initialBreakables = 1;
  private nudgeMs = 0;
  /** The steel already came down on this board. */
  private wallsDown = false;
  private wallsCheckMs = 0;
  /** Always-on skills. One scene plays a whole run, so their charge carries across waves. */
  private skills!: Record<SkillId, SkillCharge>;
  private slowmoVeil!: Phaser.GameObjects.Rectangle;
  private juice!: JuiceSystem;
  private inputSys!: InputSystem;
  /** The first-play tutorial, until it is finished or skipped. */
  private coach?: OnboardingCoach;
  private wasCoaching = false;
  /** The tutorial has the world stopped while it waits on the player. */
  private frozen = false;
  private arrow!: Phaser.GameObjects.Image;
  private hint?: Phaser.GameObjects.Text;
  private countdown?: Phaser.GameObjects.Container;
  private countdownShown = 0;
  /** Time until a held ball launches by itself. */
  private serveMs = 0;
  private shieldBar?: Phaser.Physics.Arcade.Image;
  private aim = -Math.PI / 2;
  private aimDir = 1;
  private laserGlowAt = -Infinity;
  private finished = false;
  private cleared = false;
  /** The level-clear banner is counting down to the next level. */
  private bannerUp = false;
  /** Set once the banner accepts taps; going on early calls it. */
  private skipBanner?: () => void;
  /** Stocked abilities sitting in slots. Refunded if the level is abandoned. */
  private stockOrigin: Array<AbilityId | null> = Array.from({ length: SLOT_COUNT }, () => null);
  private unsubscribeBackground?: () => void;
  private unsubscribePad?: () => void;

  constructor() {
    super(SCENES.play);
  }

  init(data: PlayData): void {
    this.runConfig = data.run;
    this.levelIndex = data.run
      ? 0
      : Phaser.Math.Clamp(data.index ?? 1, 1, Math.max(1, this.levels.length));
    this.world = data.run ? worldForRun(data.run.seed) : worldForLevel(this.levelIndex);
    useWorld(this.world);
    if (!data.run) pickWorld(this.world);
    this.finished = false;
    this.cleared = false;
    this.bannerUp = false;
    this.skipBanner = undefined;
    this.stockOrigin = Array.from({ length: SLOT_COUNT }, () => null);
    this.aim = -Math.PI / 2;
    this.laserGlowAt = -Infinity;
    this.nudgeMs = 0;
    this.wallsDown = false;
    this.wallsCheckMs = 0;
    this.serveMs = 0;
    this.countdownShown = 0;
  }

  preload(): void {
    ParallaxBackdrop.preload(this, this.world);
    // A boss's sheet loads with its level, so the levels without one never fetch it.
    const boss = this.runConfig ? undefined : this.levels[this.levelIndex - 1]?.boss;
    if (boss) BossBody.preload(this, BOSSES[boss]);
  }

  create(): void {
    this.setupCamera();
    const shade = Phaser.Display.Color.IntegerToColor(theme().palette.base);
    this.cameras.main.fadeIn(300, shade.red, shade.green, shade.blue);
    this.input.enabled = true;
    onBack(this, () => this.requestPause());
    this.runDirector = this.runConfig ? new RunDirector(this.runConfig) : undefined;
    this.level = this.runDirector?.firstLevel() ?? this.levels[this.levelIndex - 1]!;
    const world = this.world;
    const base = DIFFICULTY[save.state.difficulty];
    this.diff = this.runConfig ? base : scaleSpeeds(base, campaignSpeedScale(this.levelIndex));
    this.hud = {
      title: `LEVEL ${this.levelIndex}`,
      detail: null,
      clockMs: null,
      score: 0,
      lives: START_LIVES,
      coinsEarned: 0,
      combo: 0,
      shield: false,
      effects: [],
      remaining: 0,
      slots: [],
      skills: [],
      stock: [],
      fever: 0,
      feverActive: false,
      paddleX: WIDTH / 2,
      ballHeld: true,
      coaching: false,
      coachHand: null,
      coachSlot: null,
      coachSkill: null,
      boss: null,
    };

    this.scenery = new ParallaxBackdrop(this, world);
    this.lighting = new LightingSystem(this, world, this.level, this.scenery);
    // The light map replaces the flat dim; without WebGL the old tint still darkens the art.
    this.backdrop = this.lighting.enabled
      ? new Backdrop(this.scenery, 0, (dark) => this.lighting.setGloom(dark))
      : new Backdrop(this.scenery, 0.12);
    this.ballLights = new Map();
    this.brickLights = [];
    this.beacons = new Map();
    this.shieldLight = undefined;
    this.setupPhysics();

    this.juice = new JuiceSystem(this);
    this.juice.particleScale = particleDensity();
    this.ballFx = new BallFx(this);
    this.frameMonitor = new FrameMonitor(this.game);
    this.paddle = new Paddle(this, world);
    this.balls = this.physics.add.group();
    this.arrow = this.add.image(0, 0, 'arrow').setOrigin(0, 0.5).setDepth(4).setAlpha(0.9);
    this.arrow.setScale(56 / this.arrow.width);

    this.bricks = new BrickSystem(
      this,
      this.level,
      {
        onDestroyed: (b, cause, chain) => this.onBrickDestroyed(b, cause, chain),
        onExplosion: (x, y, chain) => this.onExplosion(x, y, chain),
        onRegrow: (b) => {
          this.juice.sparkle(b.x, b.y, COLORS.good, 8);
          audio.sfx('brick_regen', 0.35, 0, { x: b.x });
        },
        onHit: (b, res, cause) => this.onBrickHit(b, res, cause),
        onCollapseStart: () => {
          this.juice.popText(WIDTH / 2, ARENA_MID - 40, 'COLLAPSE!', '#ffc93c', 30);
          this.juice.shake(400, 0.006);
          audio.sfx('brick_collapse', 0.5);
          haptic('medium');
        },
        regrowBlocked: (b) => {
          const reachX = b.displayWidth / 2 + 12 + BALL_SIZE / 2;
          const reachY = b.displayHeight / 2 + 12 + BALL_SIZE / 2;
          return this.ballList.some(
            (ball) => Math.abs(ball.x - b.x) < reachX && Math.abs(ball.y - b.y) < reachY,
          );
        },
        collapseReady: () =>
          collapseReady({
            fever: this.fever.active,
            balls: this.freeBallCount,
            idleMs: this.pacing.idleMs,
          }),
      },
      world,
      // A boss level never collapses: its parts are bricks, and only the boss removes them.
      { collapse: !this.runDirector?.descent && !this.level.boss },
    );
    this.hud.remaining = this.bricks.remaining;
    this.initialBreakables = Math.max(1, this.bricks.remaining);
    this.lighting.attach(this.bricks.bricks, this.paddle);
    this.addBrickLights(this.bricks.bricks);
    this.pacing = new PacingDirector();
    this.musicMood = new MusicIntensity();
    this.fever = new FeverSystem(
      this,
      this.juice,
      this.backdrop,
      (active) => {
        this.onEffectsChanged();
        this.scenery.setPace(active ? 3.5 : 1);
      },
      this.lighting.look.lightsOut ? 0.35 : 1,
    );

    this.powerups = new PowerupSystem(this, {
      spawnExtraBalls: (n) => this.spawnExtraBalls(n),
      resizePaddle: (m) => this.paddle.resize(m),
      addLife: () => this.addLife(),
      addCoin: (x, y) => this.addCoin(x, y),
      enableShield: () => this.enableShield(),
      onEffectsChanged: () => this.onEffectsChanged(),
      onPickup: (id, x, y) => this.onPickup(id, x, y),
      grantMystery: (x, y) => this.grantMystery(x, y),
      dropContext: () => ({
        balls: this.freeBallCount,
        effects: this.powerups.active.length,
        fever: this.fever.active,
      }),
      onSpawned: (p) => {
        this.lighting.addLight({
          follow: p,
          radius: 64,
          color: POWERUP_INFO[p.kind].color,
          intensity: 0.4,
          halo: 26,
          haloAlpha: 0.3,
          haloDepth: 5.9,
          priority: 6,
        });
      },
    });
    this.laser = new LaserSystem(
      this,
      {
        bricks: this.bricks,
        juice: this.juice,
        lights: this.lighting,
        paddle: this.paddle,
        powerups: this.powerups,
        feverTint: () => (this.fever.active ? this.fever.trailColor : undefined),
      },
      world,
    );

    this.abilities = new AbilitySystem(this, {
      bricks: this.bricks,
      juice: this.juice,
      backdrop: this.backdrop,
      lights: this.lighting,
      paddlePos: () => ({ x: this.paddle.x, y: this.paddle.y }),
      rollContext: () => ({
        remaining: this.bricks.remaining,
        remainingFraction: this.bricks.remaining / this.initialBreakables,
        struggle: this.pacing.struggle,
        unlocked: unlockedAbilities(save.state.abilities),
      }),
      spawnFrenzy: (n) => this.spawnFrenzy(n),
      lightningOrigin: () => {
        const free = this.ballList.filter((b) => !b.attached).sort((a, b) => a.y - b.y)[0];
        return free ? { x: free.x, y: free.y } : { x: this.paddle.x, y: this.paddle.y };
      },
    });
    this.hud.slots = this.abilities.slots;
    this.loadRunAbilities();
    this.skills = { gun: new SkillCharge(SKILLS.gun), slowmo: new SkillCharge(SKILLS.slowmo) };
    this.slowmoVeil = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, SLOWMO_TINT)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(19)
      .setAlpha(0)
      .setVisible(false);
    this.hud.skills = this.skillViews();

    this.setupColliders();
    this.boss = this.level.boss
      ? new BossDirector(BOSSES[this.level.boss], this.bossHost(), {
          startPhase: FORCED_BOSS_PHASE,
        })
      : undefined;
    exposeBoss(this.boss);
    this.runDirector?.attach(this.runHost());
    this.inputSys = new InputSystem(
      this,
      this.paddle,
      () => this.onTap(),
      () => this.requestPause(),
    );

    const keys = this.inputSys.keys;
    SLOT_ACTIONS.forEach((action, i) => keys.on(action, () => this.fireSlot(i)));
    STOCK_ACTIONS.forEach((action, i) => keys.on(action, () => this.useStock(i)));
    for (const id of SKILL_IDS) keys.on(id, () => this.useSkill(id));
    // Dev only: with `?laser=<mode>`, L hands out a laser for play-testing that mode.
    const kb = this.input.keyboard;
    if (FORCED_LASER_MODE) kb?.addKey(Phaser.Input.Keyboard.KeyCodes.L).on('down', () => this.devLaser());
    // Dev only: ] empties the boss's current pool, to reach the next phase or the kill.
    if (import.meta.env.DEV) {
      kb?.addKey(Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET).on('down', () => {
        this.boss?.debugHit(this.boss.state.pool);
      });
    }
    const stockButtons: number[] = [PadButton.lb, PadButton.rb, PadButton.lt, PadButton.rt];
    this.unsubscribePad = onPadButton((button, down) => {
      if (!down) return;
      if (button === PadButton.west) this.fireSlot(0);
      else if (button === PadButton.north) this.fireSlot(1);
      else if (button === PadButton.east) this.useSkill('slowmo');
      else if (stockButtons.includes(button)) this.useStock(stockButtons.indexOf(button));
    });
    // A boss level never runs the tutorial.
    const noTutorial = save.state.seenInstructions || !!this.level.boss;
    this.coach = noTutorial
      ? undefined
      : new OnboardingCoach({
          scene: this,
          input: this.inputSys,
          juice: this.juice,
          paddle: this.paddle,
          balls: () => this.ballList,
          pickups: () => this.powerups.group.getChildren() as Pickup[],
          slots: () => this.abilities.slots,
          grantAbility: () => this.abilities.grant(),
          skillReady: (id) => this.skillReady(id),
          chargeSkill: (id) => (this.skills[id].charge = 1),
        });
    this.wasCoaching = this.coaching;
    this.frozen = false;
    this.juice.holdWorld = () => !!this.coach?.frozen;

    this.resetBall();
    this.showHint();
    this.introCard();

    this.scene.launch(SCENES.hud);
    audio.resetArpeggio();
    audio.playMusic('music');

    this.unsubscribeBackground = onAppBackground(() => this.requestPause());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.juice.particleScale = particleDensity();
      if (!this.coach?.frozen) this.physics.world.resume();
      audio.duckMusic(false);
      if (!this.finished) {
        this.fillAbilityStock();
        gameplayStart();
      }
    });
    // This is the moment CrazyGames measures the initial download against, so it belongs here in
    // a level rather than on the title screen.
    gameplayStart();
  }

  override update(_time: number, delta: number): void {
    this.frameMonitor.update();
    if (this.finished) return;
    const dt = Math.min(delta, 50);
    this.inputSys.update(dt);
    this.paddle.step(dt);
    if (this.coach?.frozen) {
      this.updateFrozen(dt);
      return;
    }
    if (!this.juice.inHitStop) {
      this.powerups.update(dt);
      this.bricks.update(dt);
    }
    audio.loop('brick_mover', this.bricks.moving);
    this.abilities.update(dt);
    this.fever.update(dt);
    this.backdrop.update(dt);
    this.scenery.setFocus(this.paddle.x);
    this.updateAttachedBalls(dt);
    this.updateCoach(dt);
    this.ballFx.update(this.ballList, dt, this.juice.particleScale);
    this.syncLights();
    this.updateSkills(dt);
    this.updateTimeScale();
    this.laser.update(dt);
    this.updatePacing(dt);
    this.updateMusic(dt);
    this.checkLostBalls();
    this.runDirector?.update(dt);
    // The last life going ends the level first: a boss can't also die on that frame.
    if (!this.finished) this.boss?.update(dt);
    // Dev only: the boss counts the frames a ball spends inside one of its parts.
    if (import.meta.env.DEV && this.boss) {
      const free = this.ballList.filter((b) => !b.attached);
      this.boss.debugProbe(free.map((b) => b.body.center));
    }
    this.hud.clockMs = this.runDirector?.state.timeLeftMs ?? null;
    if (this.finished) return;
    this.hud.effects = this.powerups.active;
    this.hud.remaining = this.bricks.remaining;
    this.hud.slots = this.abilities.slots;
    this.hud.stock = save.state.stock.powerups;
    this.hud.fever = this.fever.meter.display;
    this.hud.feverActive = this.fever.active;
    this.hud.paddleX = this.paddle.x;
    // A boss level is won by killing the boss, not by clearing the bricks.
    if (this.boss?.active) return;
    if (this.hud.remaining > 0) return;
    if (this.runDirector) this.runDirector.onBoardEmpty();
    else this.win();
  }

  /** While the tutorial holds play still, only the paddle and the tutorial itself move. */
  private updateFrozen(dt: number): void {
    this.scenery.setFocus(this.paddle.x);
    // The held ball, if any, keeps to the paddle, but its serve clock waits.
    this.updateAttachedBalls(0);
    this.updateCoach(dt);
    this.syncLights();
    this.hud.slots = this.abilities.slots;
    this.hud.paddleX = this.paddle.x;
  }

  /** Fires an ability slot (HUD tap, Q/E or pad X/Y). */
  fireSlot(i: number): void {
    if (this.finished || !this.scene.isActive()) return;
    // The tutorial's ability stop waits on exactly this; the others leave the slots alone.
    if (this.coach?.frozen && this.coach.step !== 'ability') return;
    if (!this.abilities.activate(i)) return;
    this.stockOrigin[i] = null;
    this.fillAbilityStock();
    this.hud.slots = this.abilities.slots;
    this.coach?.abilityFired();
  }

  /** Fires a skill: its HUD button, F or Shift, pad A in flight or B, or a launch with no ball held. */
  useSkill(id: SkillId): void {
    if (this.finished || this.cleared || !this.scene.isActive()) return;
    // The tutorial's skill stops wait on their own skill; the others leave the skills alone.
    if (this.coach?.frozen && this.coach.step !== id) return;
    if (!this.skillReady(id) || !this.skills[id].use()) return;
    // Used is known: its first READY call-out has nothing left to teach.
    if (!save.state.seenSkills.includes(id)) save.update((d) => d.seenSkills.push(id));
    if (id === 'gun') {
      this.laser.burst(SKILLS.gun.durationMs, gunBudget(save.state.upgrades.laser));
      haptic('light');
    } else {
      this.slowmoVeil.setVisible(true);
      this.tweens.killTweensOf(this.slowmoVeil);
      this.tweens.add({ targets: this.slowmoVeil, alpha: 1, duration: 180, ease: 'Cubic.Out' });
      this.juice.ring(this.paddle.x, this.paddle.y, SKILLS.slowmo.color, 140);
      audio.whoosh(0.4);
      haptic('medium');
    }
    this.hud.skills = this.skillViews();
    this.coach?.skillUsed(id);
  }

  /** Charged, and for the gun, no laser pickup already firing: that holds its charge. */
  private skillReady(id: SkillId): boolean {
    return this.skills[id].ready && (id !== 'gun' || !this.powerups.is('laser'));
  }

  private skillViews(): SkillView[] {
    return SKILL_IDS.map((id) => {
      const s = this.skills[id];
      return { id, fraction: s.fraction, ready: this.skillReady(id), active: s.active };
    });
  }

  /** Skills charge while a ball is in flight, and say so the first time each is ready. */
  private updateSkills(dt: number): void {
    const charging = this.freeBallCount > 0 && !this.cleared;
    if (this.powerups.is('laser')) this.skills.gun.stop();
    this.skills.gun.update(dt, charging);
    if (this.skills.slowmo.update(dt, charging) === 'end') this.endSlowmo();
    this.hud.skills = this.skillViews();
    if (!this.coach) this.skillReadyHint();
  }

  private endSlowmo(): void {
    this.skills.slowmo.stop();
    this.tweens.killTweensOf(this.slowmoVeil);
    this.tweens.add({
      targets: this.slowmoVeil,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.In',
      onComplete: () => this.slowmoVeil.setVisible(false),
    });
    audio.whoosh(0.3, true);
  }

  private skillReadyHint(): void {
    const id = SKILL_IDS.find((s) => this.skillReady(s) && !save.state.seenSkills.includes(s));
    if (!id) return;
    save.update((d) => d.seenSkills.push(id));
    const def = SKILLS[id];
    const device = controlDevice();
    const how =
      id === 'gun'
        ? { pad: 'PRESS A', touch: 'TAP ANYWHERE', desktop: `CLICK OR PRESS ${skillKeyLabel(id)}` }
        : { pad: 'PRESS B', touch: 'TAP THE HOURGLASS', desktop: `PRESS ${skillKeyLabel(id)} OR SHIFT` };
    this.juice.popText(WIDTH / 2, ARENA_MID + 40, `${def.label.toUpperCase()} READY`, css(def.color), 26);
    this.juice.popText(WIDTH / 2, ARENA_MID + 74, how[device], '#ffffff', 16);
    audio.sfx('ui_on', 0.45);
  }

  /** Uses a bought powerup (HUD tap, number key, or pad bumper/trigger). */
  useStock(i: number): void {
    if (this.finished || !this.scene.isActive() || this.coach?.frozen) return;
    const id = save.useStockPowerup(i);
    if (!id) return;
    const x = this.paddle.x;
    const y = this.paddle.y;
    this.onPickup(id, x, y);
    this.powerups.apply(id, x, y);
    this.hud.stock = save.state.stock.powerups;
  }

  private devLaser(): void {
    if (this.finished || !this.scene.isActive()) return;
    this.onPickup('laser', this.paddle.x, this.paddle.y);
    this.powerups.apply('laser', this.paddle.x, this.paddle.y);
  }

  requestPause(): void {
    if ((this.finished && !this.bannerUp) || !this.scene.isActive()) return;
    gameplayStop();
    this.physics.world.pause();
    audio.duckMusic(true);
    audio.loop('brick_mover', false);
    this.scene.launch(SCENES.pause, { from: SCENES.play });
    this.scene.pause();
  }

  // ---------------------------------------------------------------- setup

  private setupPhysics(): void {
    const world = this.physics.world;
    world.setBounds(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT + 200);
    world.setBoundsCollision(true, true, true, false);
    world.setFPS(PHYSICS_FPS);
    world.timeScale = 1;
    world.resume();
    world.on(Phaser.Physics.Arcade.Events.WORLD_BOUNDS, (body: Phaser.Physics.Arcade.Body) => {
      const ball = body.gameObject as Ball;
      if (ball instanceof Ball) this.onWallBounce(ball);
    });
  }

  private onWallBounce(ball: Ball): void {
    ball.normalize(this.diff.minSpeed, this.diff.maxSpeed);
    this.refillPlow(ball);
    audio.sfx('wall', 0.2, 0, { x: ball.x });
    this.juice.sparkle(ball.x, ball.y, 0x7fe9ff, 3);
  }

  private setupColliders(): void {
    this.physics.add.collider(
      this.paddle,
      this.balls,
      (a, b) => this.onPaddleHit(pickBall(a, b)),
      (a, b) => {
        const ball = pickBall(a, b);
        return ball.body.velocity.y > 0 && !ball.attached;
      },
    );
    this.physics.add.collider(
      this.balls,
      this.bricks.group,
      (a, b) => {
        const ball = pickBall(a, b);
        this.onBallBrick(ball, (ball === a ? b : a) as Brick);
      },
      (a, b) => {
        const ball = pickBall(a, b);
        return this.processBallBrick(ball, (ball === a ? b : a) as Brick);
      },
    );
    this.physics.add.overlap(this.paddle, this.powerups.group, (_p, pickup) => {
      this.coach?.pickupCaught((pickup as Pickup).kind);
      this.powerups.collect(pickup as Pickup);
    });
  }

  // ---------------------------------------------------------------- balls

  private makeBall(x: number, y: number): Ball {
    const ball = new Ball(this, x, y, this.world);
    ball.setName('ball');
    this.balls.add(ball);
    ball.body.setAllowGravity(false);
    ball.body.setBounce(1, 1);
    ball.body.setCollideWorldBounds(true);
    ball.body.onWorldBounds = true;
    ball.setMode(this.currentMode());
    this.refillPlow(ball);
    return ball;
  }

  private get ballList(): Ball[] {
    return this.balls.getChildren() as Ball[];
  }

  /** Balls in flight, not waiting on the paddle. */
  private get freeBallCount(): number {
    let n = 0;
    for (const b of this.ballList) if (!b.attached) n++;
    return n;
  }

  private resetBall(): void {
    this.paddle.setX(WIDTH / 2);
    this.paddle.targetX = WIDTH / 2;
    this.rearm();
  }

  /** A fresh ball on the paddle wherever it is, waiting for an aimed launch. */
  private rearm(): void {
    this.balls.clear(true, true);
    const ball = this.makeBall(this.paddle.x, PADDLE_Y - 24);
    ball.attach(0);
    this.aim = -Math.PI / 2;
    this.serveMs = this.coaching ? FIRST_SERVE_MS : SERVE_COUNTDOWN_MS;
  }

  /** A tap launches the held ball, fires the gun with every ball in flight, or skips the banner. */
  private onTap(): void {
    if (this.skipBanner) this.skipBanner();
    else if (this.ballList.some((b) => b.attached)) this.launch();
    else this.useSkill('gun');
  }

  private launch(): void {
    const held = this.ballList.find((b) => b.attached);
    if (!held || this.finished || this.coach?.frozen) return;
    const at = { x: held.x, y: held.y };
    held.launch(this.aim, Math.max(held.speed, this.diff.minSpeed));
    this.clearHint();
    this.coach?.launched(at);
    audio.sfx('count_go', 0.55);
    audio.sfx('launch', 0.45, 0, { x: held.x });
  }

  private updateAttachedBalls(dt: number): void {
    const held = this.ballList.find((b) => b.attached);
    this.arrow.setVisible(!!held);
    this.hud.ballHeld = !!held;
    if (!held) return;
    held.setPosition(this.paddle.x + held.attachedOffset!, this.paddle.y - 24);
    this.aim += this.aimDir * AIM_SPEED * (dt / 1000);
    if (this.aim > AIM_MAX) this.aimDir = -1;
    if (this.aim < AIM_MIN) this.aimDir = 1;
    this.aim = Phaser.Math.Clamp(this.aim, AIM_MIN, AIM_MAX);
    this.arrow.setPosition(held.x, held.y).setRotation(this.aim);
    if (!this.coach?.holdServe) this.serveMs -= dt;
    if (this.serveMs <= 0) this.launch();
    else this.tickCountdown();
  }

  private updateCoach(dt: number): void {
    const coach = this.coach;
    if (!coach) return;
    const held = this.ballList.find((b) => b.attached) ?? null;
    if (coach.active) {
      coach.update(dt, held);
      this.hud.coachHand = coach.hand;
      this.hud.coachSlot = coach.slot;
      this.hud.coachSkill = coach.skill;
    } else {
      this.coach = undefined;
      this.hud.coachHand = null;
      this.hud.coachSlot = null;
      this.hud.coachSkill = null;
    }
    this.hud.coaching = this.coaching;
    // Skipped with the ball still held: the usual words come back for this serve.
    if (this.wasCoaching && !this.coaching && held) this.showHint();
    this.wasCoaching = this.coaching;
    this.syncFreeze();
  }

  /** Stops the world when the tutorial stops play, and starts it again when the player has done their part. */
  private syncFreeze(): void {
    const frozen = !!this.coach?.frozen;
    if (frozen === this.frozen) return;
    this.frozen = frozen;
    if (frozen) this.physics.world.pause();
    else if (!this.juice.inHitStop) this.physics.world.resume();
  }

  /** The tutorial is walking the player through moving and launching. */
  private get coaching(): boolean {
    return this.coach?.step === 'move' || this.coach?.step === 'launch';
  }

  /** Big 3-2-1 over the paddle for the last seconds of a serve. */
  private tickCountdown(): void {
    const label = this.countdown;
    if (!label) return;
    const [ring, num] = label.list as [RingTimer, Phaser.GameObjects.Text];
    const n = Math.ceil(this.serveMs / 1000);
    if (n <= 3) ring.set((this.serveMs - (n - 1) * 1000) / 1000);
    if (n === this.countdownShown) return;
    this.countdownShown = n;
    if (n > 3) return;
    num.setText(String(n));
    label.setVisible(true);
    this.tweens.killTweensOf(label);
    this.tweens.add({
      targets: label,
      scale: { from: 1.6, to: 1 },
      alpha: { from: 0.3, to: 1 },
      duration: 260,
      ease: 'Back.Out',
    });
    audio.sfx(COUNTDOWN_CALLS[n - 1]!, 0.55);
  }

  private spawnExtraBalls(count: number): void {
    const src = this.ballList.find((b) => !b.attached) ?? this.ballList[0];
    if (!src) return;
    const room = this.ballRoom(count, src.x, src.y);
    const speed = Math.max(src.speed, this.diff.minSpeed);
    for (let i = 0; i < room; i++) {
      const b = this.makeBall(src.x, src.y);
      b.launch(Phaser.Math.FloatBetween(-2.4, -0.7), speed);
    }
  }

  /** How many of `wanted` new balls fit under the cap; going over pays out instead. */
  private ballRoom(wanted: number, x: number, y: number): number {
    const room = Phaser.Math.Clamp(MAX_BALLS - this.ballList.length, 0, wanted);
    if (room < wanted) {
      this.addScore(BALL_OVERFLOW_SCORE);
      this.fever.boost(0.1);
      this.juice.popText(x, y - 40, 'MAX BALLS', '#7fe9ff', 18);
    }
    return room;
  }

  private checkLostBalls(): void {
    if (save.state.settings.godMode) this.bounceOffFloor();
    for (const b of this.ballList) {
      if (b.y > LOSE_Y) b.destroy();
    }
    if (this.ballList.length === 0) this.loseLife();
  }

  /** God mode: balls bounce back up where they would otherwise be lost. */
  private bounceOffFloor(): void {
    const floor = Math.min(LOSE_Y, HEIGHT) - BALL_SIZE / 2;
    for (const b of this.ballList) {
      if (b.attached || b.y < floor) continue;
      b.setY(floor);
      if (b.body.velocity.y <= 0) continue;
      b.body.velocity.y = -b.body.velocity.y;
      this.onWallBounce(b);
    }
  }

  private currentMode() {
    if (this.powerups?.is('fireball') || this.fever?.active) return 'fireball' as const;
    if (this.powerups?.is('pierce')) return 'pierce' as const;
    return 'normal' as const;
  }

  /** Bullet time wins over hyperspeed. The paddle steps on real time, so it keeps full speed. */
  private updateTimeScale(): void {
    const world = this.physics.world;
    const hyper = this.powerups.is('hyper') ? HYPER_TIME_SCALE : 1;
    const scale = this.skills.slowmo.active ? SLOWMO_TIME_SCALE : hyper;
    if (world.timeScale === scale) return;
    // Slowed down, the world takes smaller steps as often as ever rather than skipping frames, so the ball glides.
    world.setFPS(PHYSICS_FPS * Math.max(1, scale));
    world.timeScale = scale;
  }

  // ---------------------------------------------------------------- collisions

  private onPaddleHit(ball: Ball): void {
    this.paddle.squash();
    this.lighting.flash(
      ball.x,
      this.paddle.y - 8,
      this.lighting.look.ball.normal,
      70,
      200,
      0.35,
      1,
      5,
    );
    audio.hit(ball.x);
    this.hud.combo = 0;
    this.pacing.onPaddleHit();
    this.refillPlow(ball);
    this.coach?.ballReturned(true);

    if (this.powerups.is('magnet') && !this.ballList.some((b) => b.attached)) {
      ball.attach(
        Phaser.Math.Clamp(ball.x - this.paddle.x, -this.paddle.halfWidth, this.paddle.halfWidth),
      );
      this.aim = -Math.PI / 2;
      this.serveMs = MAGNET_HOLD_MS;
      this.powerups.consumeMagnet();
      audio.sfx('sfx_magnet', 0.4, 0, { x: ball.x });
      return;
    }

    // Bounce angle comes from where the ball meets the paddle, like the original.
    const offset = (ball.x - this.paddle.x) / this.paddle.halfWidth;
    const speed = Phaser.Math.Clamp(ball.speed, this.diff.minSpeed, this.diff.maxSpeed);
    const spin = (this.diff.paddleSpin / 8) * 0.95;
    const vx = Phaser.Math.Clamp(offset * spin, -0.92, 0.92) * speed;
    ball.body.setVelocity(vx, -Math.sqrt(Math.max(speed * speed - vx * vx, 1)));
    ball.speed = speed;
    ball.normalize(this.diff.minSpeed, this.diff.maxSpeed);
  }

  private get fireActive(): boolean {
    return this.powerups.is('fireball') || this.fever.active;
  }

  private refillPlow(ball: Ball): void {
    ball.plowLeft = powerupStats(save.state.upgrades).fireballPlow;
  }

  private processBallBrick(ball: Ball, brick: Brick): boolean {
    if (!brick.isAlive) return false;
    // Nothing passes through a boss part: the ball always bounces off it.
    if (brick.owner) return true;
    // Fireballs smash straight through bricks they can kill, up to their plow count, then bounce.
    if (
      this.fireActive &&
      brick.breakable &&
      ball.plowLeft > 0 &&
      brick.health <= FIREBALL_DAMAGE
    ) {
      const now = this.time.now;
      if ((ball.pierced.get(brick.spec.id) ?? 0) >= now) return false;
      ball.pierced.set(brick.spec.id, now + 200);
      ball.plowLeft--;
      this.bricks.hit(brick, FIREBALL_DAMAGE, 'ball', { stripArmor: true });
      this.juice.sparkle(brick.x, brick.y, 0xffa53c, 6);
      ball.speed = Math.min(ball.speed + this.diff.speedStep * 0.5, this.diff.maxSpeed);
      return false;
    }
    if (this.powerups.is('pierce') && brick.breakable) {
      const now = this.time.now;
      if ((ball.pierced.get(brick.spec.id) ?? 0) < now) {
        ball.pierced.set(brick.spec.id, now + 200);
        this.bricks.hit(brick, PIERCE_DAMAGE, 'ball', { stripArmor: true });
      }
      return false;
    }
    return true;
  }

  /** A plain ball hit: the difficulty's damage, raised in an Arcade run's early tiers. */
  private get hitDamage(): number {
    const run = this.runDirector;
    return run ? runHitDamage(this.diff.hitDamage, run.state.tier) : this.diff.hitDamage;
  }

  private onBallBrick(ball: Ball, brick: Brick): void {
    const fire = this.fireActive;
    const hyper = this.powerups.is('hyper') ? HYPER_DAMAGE_MULT : 1;
    const res = this.bricks.hit(
      brick,
      fire ? FIREBALL_DAMAGE : this.hitDamage * hyper,
      'ball',
      {
        stripArmor: fire,
      },
    );
    this.refillPlow(ball);
    if (res === 'immune') {
      audio.sfx('brick_steel', 0.3, 0, { x: brick.x });
      this.juice.sparkle(ball.x, ball.y, 0xcfd6e6, 5);
    } else if (res === 'armor') {
      audio.sfx('brick_armor', 0.4, 0, { x: brick.x });
    } else if (res !== 'destroyed') {
      audio.hit(brick.x);
    }
    if (fire && res !== 'immune') this.juice.shake(80, 0.004);
    if (res === 'destroyed') {
      ball.speed = Math.min(ball.speed + this.diff.speedStep, this.diff.maxSpeed);
    }
    if (this.diff.shrinkPaddleOnHit && res !== 'immune') this.paddle.resize(0.997, false);
    ball.normalize(this.diff.minSpeed, this.diff.maxSpeed);
  }

  private onBrickDestroyed(b: Brick, cause: DestroyCause, chain: number): void {
    if (cause === 'breach') {
      this.juice.burst(b.x, b.y, b.tintColor, 6);
      return;
    }
    this.creditBreak(b, cause, chain);
    this.juice.burst(b.x, b.y, b.tintColor, cause === 'explosion' ? 8 : 12);
    const glow = b.spec.light;
    this.lighting.flash(
      b.x,
      b.y,
      glow?.color ?? b.tintColor,
      glow ? glow.radius * 1.6 : 90,
      glow ? 900 : 600,
      glow ? 0.7 : 0.5,
      1.2,
      5,
    );
    audio.breakSound(Math.min(this.hud.combo, 12) * 40, b.x);
    haptic('light');
    if (cause === 'fall' || this.bricks.remaining === 0) return;
    // Abilities clear bricks in bulk, so only some of those bricks drop anything.
    if (cause === 'ability' && Math.random() < 0.5) return;
    // Regen bricks only drop their fixed powerup, otherwise they'd be an endless coin farm.
    if (b.spec.kind === 'regen') {
      if (b.spec.powerup) this.powerups.maybeDrop(b.x, b.y, b.spec.powerup);
    } else {
      this.powerups.maybeDrop(b.x, b.y, b.spec.powerup, cause === 'ability');
    }
  }

  /**
   * What a break earns: combo, pacing, music, Fever, skill charge and score. A whole hit on a
   * boss part earns the same.
   */
  private creditBreak(b: Brick, cause: DestroyCause, chain: number): void {
    if (cause !== 'fall') {
      this.hud.combo++;
      this.pacing.onBreak();
      this.musicMood.onBreak();
      this.fever.onBreak(this.hud.combo, this.freeBallCount);
    }
    if (cause === 'ball' || cause === 'explosion') for (const id of SKILL_IDS) this.skills[id].onBreak();
    const base = cause === 'laser' ? LASER_BRICK_SCORE : BRICK_SCORE;
    const bonus = Math.min(this.hud.combo, 20) * 10 + chain * 20;
    this.addScore((base + bonus) * this.fever.scoreMultiplier);
    if (this.hud.combo >= 5 && this.hud.combo % 5 === 0) {
      const tier = Math.min(6, this.hud.combo / 5);
      const p = theme().palette;
      const color = tier >= 4 ? '#ffffff' : css(tier >= 2 ? p.accentHi : p.gold);
      this.juice.popText(b.x, b.y - 10, `COMBO x${this.hud.combo}`, color, 18 + tier * 4, 1 + tier * 0.12);
      if (tier >= 4 && save.state.settings.screenShake) this.juice.shake(120, 0.002 * tier);
      const detune = COMBO_DETUNE[tier - 1];
      if (detune !== undefined) {
        audio.sfx('combo', 0.5, detune);
        audio.duck(0.6, 350);
      }
    }
  }

  private onExplosion(x: number, y: number, chain: number): void {
    this.juice.ring(x, y, 0xff8a1f, EXPLOSION_RADIUS * 1.4);
    this.juice.burst(x, y, 0xff5a1f, 18);
    this.juice.shake(160 + chain * 40, 0.008 + chain * 0.002);
    this.juice.hitStop(45);
    this.juice.flash(80, 255, 140, 60);
    this.scenery.flash(0.12 + chain * 0.04);
    this.lighting.flash(x, y, 0xff8a3c, EXPLOSION_RADIUS * 2.6, 480, 0.8, 1.3, 8, true);
    audio.sfx('brick_tnt', 0.5, Math.min(chain - 1, 5) * 100, { x });
    if (chain >= 2) audio.duck();
    haptic('heavy');
    if (chain >= 2) this.juice.popText(x, y - 20, `CHAIN x${chain}`, '#ff8a1f', 22);
  }

  private onBrickHit(b: Brick, res: HitResult, cause: DestroyCause): void {
    if (cause === 'laser') {
      // Laser bolts land many times a second; one glow per beat reads the same and costs less.
      if (this.time.now - this.laserGlowAt < LASER_GLOW_GAP_MS) return;
      this.laserGlowAt = this.time.now;
    }
    const steel = res === 'immune';
    this.lighting.flash(
      b.x,
      b.y,
      steel ? 0xcfe0ff : b.tintColor,
      steel ? 60 : 80,
      180,
      steel ? 0.3 : 0.4,
    );
    this.lighting.onBrickHit();
  }

  // ---------------------------------------------------------------- lights

  /**
   * Authored emissive bricks glow until they break; TNT smoulders so it reads as dangerous.
   * With the lights out TNT stays dark, or a row of it would light up half the level.
   */
  private addBrickLights(bricks: readonly Brick[]): void {
    const flicker = this.world === 'mainframe' ? 'breathe' : 'candle';
    const smoulder = !this.lighting.look.lightsOut;
    for (const b of bricks) {
      const glow = b.spec.light;
      const light = glow
        ? this.lighting.addLight({
            follow: b,
            color: glow.color,
            radius: glow.radius,
            intensity: glow.intensity,
            flicker,
            phase: b.spec.id * 0.37,
            priority: 5,
            igniteAt: this.lighting.igniteTime(b.y),
          })
        : smoulder && b.spec.kind === 'explosive'
          ? this.lighting.addLight({
              follow: b,
              color: 0xff5a1f,
              radius: 72,
              intensity: 0.3,
              flicker: 'pulse',
              speed: 0.8,
              phase: b.spec.id * 0.13,
              priority: 4,
            })
          : undefined;
      if (light) this.brickLights.push({ brick: b, light });
    }
  }

  /** Ball lanterns follow mode and Fever; shadows lean away from the lead ball. */
  private syncLights(): void {
    const look = this.lighting.look.ball;
    const fever = this.fever.active ? this.fever.trailColor : undefined;
    let main: Ball | undefined;
    for (const b of this.ballList) {
      let l = this.ballLights.get(b);
      if (!l) {
        l = this.lighting.addLight({
          follow: b,
          halo: look.radius > 150 ? 40 : 30,
          haloAlpha: 0.6,
          haloDepth: 4.5,
          priority: 10,
          relief: true,
        });
        this.ballLights.set(b, l);
      }
      const mode = b.ballMode;
      l.color = fever ?? (b.isHyper ? 0xffe14d : look[mode]);
      l.flicker = mode === 'fireball' ? 'torch' : 'steady';
      l.speed = 2;
      l.radius = look.radius * (mode === 'fireball' ? 1.25 : 1) * (main ? 0.75 : 1);
      l.intensity = look.intensity * (mode === 'fireball' ? 1.2 : 1);
      main ??= b;
    }
    for (const [b, l] of this.ballLights) {
      if (b.active) continue;
      l.kill();
      this.ballLights.delete(b);
    }
    this.brickLights = this.brickLights.filter(({ brick, light }) => {
      if (brick.life !== 'dead') return true;
      light.kill();
      return false;
    });
    this.lighting.setShadowFocus(main ?? this.paddle);
    this.lighting.setCombo(this.hud.combo);
    this.lighting.setFever(this.fever.active);
    this.syncBeacons();
  }

  /** Lights out: the last few bricks glow faintly, so the level can be finished in the dark. */
  private syncBeacons(): void {
    const on = this.lighting.look.lightsOut && this.pacing.endgameAssist(this.bricks.remaining);
    for (const [b, l] of this.beacons) {
      if (on && b.isAlive) continue;
      l.kill();
      this.beacons.delete(b);
    }
    if (!on) return;
    for (const b of this.bricks.targets) {
      if (b.spec.light || this.beacons.has(b)) continue;
      const light = this.lighting.addLight({
        follow: b,
        color: b.tintColor,
        radius: 44,
        intensity: 0.6,
        flicker: 'pulse',
        speed: 0.6,
        priority: 6,
      });
      this.beacons.set(b, light);
    }
  }

  // ---------------------------------------------------------------- powerups

  private onPickup(id: PowerupId, x: number, y: number): void {
    const info = POWERUP_INFO[id];
    if (id !== 'coin') {
      const name = id === 'laser' ? `${LASER_MODE_DEFS[this.laser.nextMode()].label}!` : info.label;
      this.juice.popText(x, y - 24, name.toUpperCase(), '#ffffff', 18);
      this.juice.ring(x, y, info.color, 40);
      haptic('medium');
    }
    const sfx: Partial<Record<PowerupId, string>> = {
      magnet: 'sfx_magnet',
      fireball: 'sfx_fireball',
      laser: 'sfx_laser',
      balls: 'sfx_balls',
      bigger: 'sfx_bigger',
      smaller: 'sfx_smaller',
      shield: 'sfx_shield_on',
      hyper: 'sfx_hyper',
      extraLife: 'sfx_extra_life',
      pierce: 'sfx_pierce',
    };
    const key = sfx[id];
    if (key) audio.sfx(key, 0.5, 0, { x });
  }

  private onEffectsChanged(): void {
    const mode = this.currentMode();
    for (const b of this.ballList) b.setMode(mode);
  }

  private addCoin(x: number, y: number): void {
    this.hud.coinsEarned++;
    save.addCoins(1);
    audio.sfx('sfx_coin', 0.45, 0, { x });
    this.juice.popText(x, y - 20, '+1', '#ffc93c', 16);
  }

  private addLife(): boolean {
    if (this.hud.lives >= MAX_LIVES) {
      this.addScore(500);
      return false;
    }
    this.hud.lives++;
    return true;
  }

  private enableShield(): void {
    this.hud.shield = true;
    if (this.shieldBar) return;
    const bar = this.physics.add.staticImage(WIDTH / 2, shieldY(), 'shield_bar');
    bar.setDisplaySize(WIDTH, 14).refreshBody();
    bar.setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.tweens.add({
      targets: bar,
      alpha: { from: 0.6, to: 1 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });
    this.physics.add.collider(bar, this.balls, (a, b) => {
      const ball = pickBall(a, b);
      ball.body.setVelocityY(-Math.abs(ball.body.velocity.y));
      ball.normalize(this.diff.minSpeed, this.diff.maxSpeed);
      this.juice.ring(ball.x, bar.y, 0x78dcff, 60);
      audio.sfx('sfx_shield_break', 0.5, 0, { x: ball.x });
      haptic('medium');
      this.removeShield();
    });
    this.shieldBar = bar;
    this.shieldLight = this.lighting.addLight({
      x: 0,
      y: shieldY() - 34,
      area: { width: WIDTH, height: 44 },
      color: 0x78dcff,
      intensity: 0.3,
      flicker: 'pulse',
      priority: 6,
    });
  }

  private removeShield(): void {
    this.hud.shield = false;
    this.shieldLight?.kill();
    this.shieldLight = undefined;
    const bar = this.shieldBar;
    this.shieldBar = undefined;
    if (!bar) return;
    this.physics.world.colliders
      .getActive()
      .filter((c) => c.object1 === bar)
      .forEach((c) => c.destroy());
    this.tweens.killTweensOf(bar);
    this.tweens.add({ targets: bar, alpha: 0, duration: 200, onComplete: () => bar.destroy() });
  }

  // ---------------------------------------------------------------- pacing and abilities

  private updatePacing(dt: number): void {
    const free = this.ballList.filter((b) => !b.attached);
    const remaining = this.bricks.remaining;
    const step = this.pacing.update(dt, remaining, free.length > 0);
    if (step) this.intervene(step);
    this.checkWallsDown(dt);

    this.nudgeMs = Math.max(0, this.nudgeMs - dt);
    // A boss's few parts are not a level's last few bricks: no endgame homing while it lives.
    const boss = this.boss?.active ? this.boss : undefined;
    const endgame = !boss && this.pacing.endgameAssist(remaining);
    const turn = this.nudgeMs > 0 ? NUDGE_TURN : endgame ? ENDGAME_TURN : 0;
    if (turn > 0) {
      const targets = this.bricks.targets.map(homingBox);
      const walls: HomingBox[] = [];
      for (const brick of this.bricks.bricks) {
        if (brick.isAlive && !brick.breakable) walls.push(homingBox(brick));
      }
      // Steel is not a target, and a brick behind it is not either: homing into a wall
      // pins the ball under the steel instead of letting it through the gaps.
      const pad = BALL_SIZE / 2;
      for (const b of free) {
        const best = pickHomingTarget(b.x, b.y, targets, walls, pad);
        if (best) b.steerToward(best.x, best.y, turn, dt);
      }
    }
    const hyper = this.powerups.is('hyper');
    // In a boss fight the ball speeds up as the boss's pools drain, not as bricks clear.
    const cleared = boss ? boss.progress : 1 - remaining / this.initialBreakables;
    const cruise = cruiseSpeed(this.diff, cleared);
    const target = Math.min(this.diff.maxSpeed, cruise * idleSpeedBoost(this.pacing.idleMs));
    for (const b of free) {
      b.speed = relaxSpeed(chaseSpeed(b.speed, target, dt), target, dt);
      b.setHyper(hyper);
      if (this.fever.active) b.setTrailTint(this.fever.trailColor);
    }
  }

  /** Knocks the steel down, once per board, when the player is stuck outside the bricks it boxes in. */
  private checkWallsDown(dt: number): void {
    // A boss's steel parts are its own to remove.
    if (this.boss?.active) return;
    if (this.wallsDown || this.pacing.idleMs < WALLS_DOWN_IDLE_MS) return;
    this.wallsCheckMs -= dt;
    if (this.wallsCheckMs > 0) return;
    this.wallsCheckMs = WALLS_DOWN_CHECK_MS;
    const walls: HomingBox[] = [];
    for (const b of this.bricks.bricks) if (b.isAlive && !b.breakable) walls.push(homingBox(b));
    if (!walls.length) return;
    if (guardedShare(this.bricks.targets.map(homingBox), walls) < WALLS_DOWN_SHARE) return;
    this.wallsDown = true;
    for (const b of this.bricks.shatterSteel()) this.juice.burst(b.x, b.y, 0xcfd6e6, 4);
    this.juice.popText(WIDTH / 2, ARENA_MID, 'WALLS DOWN!', '#7fe9ff', 30);
    this.juice.flash(120, 200, 230, 255);
    this.juice.shake(400, 0.006);
    audio.sfx('brick_collapse', 0.5);
    haptic('heavy');
  }

  /** Tells the music how hot the moment is. */
  private updateMusic(dt: number): void {
    const balls = this.freeBallCount;
    audio.steerMusic(
      this.musicMood.update(dt, {
        live: balls > 0,
        combo: this.hud.combo,
        balls,
        effects: this.powerups.active.length,
        fever: this.fever.active,
        charge: this.fever.meter.value,
        lastLife: this.hud.lives <= 1 && !save.state.settings.godMode,
        danger: this.runDirector?.threat ?? 0,
        clockMs: this.runDirector?.state.timeLeftMs ?? null,
      }),
    );
  }

  private intervene(step: Intervention): void {
    if (step === 'gift' && !this.abilities.hasFreeSlot) step = 'surge';
    switch (step) {
      case 'nudge':
        this.nudgeMs = NUDGE_MS;
        for (const b of this.ballList) if (!b.attached) this.juice.ring(b.x, b.y, 0x7fe9ff, 40);
        break;
      case 'gift': {
        const x = Phaser.Math.Clamp(this.paddle.x + Phaser.Math.Between(-80, 80), 40, WIDTH - 40);
        this.powerups.maybeDrop(x, HUD_HEIGHT + 30, 'mystery');
        this.juice.popText(x, HUD_HEIGHT + 60, 'GIFT!', '#ff5cf0', 22);
        audio.sfx('gift', 0.5, 0, { x });
        break;
      }
      case 'surge':
        this.juice.popText(WIDTH / 2, ARENA_MID, 'POWER SURGE!', '#ffc93c', 30);
        this.juice.flash(120, 255, 200, 80);
        audio.sfx('surge', 0.5);
        haptic('medium');
        this.spawnExtraBalls(SURGE_BALLS);
        this.fever.boost(SURGE_FEVER);
        break;
    }
  }

  /** Loads abilities carried from the last level, then any bought ones still in stock. */
  private loadRunAbilities(): void {
    const carried = runCarry.take(this.levelIndex);
    const keep = abilitiesCarryOver(save.state.difficulty);
    if (keep) {
      for (const id of carried) this.abilities.grantSpecific(id);
    }
    this.fillAbilityStock();
    if (carried.length === 0) return;
    const note = keep ? 'ABILITIES CARRIED' : 'HARD MODE · ABILITIES RESET';
    const color = keep ? '#7fe9ff' : '#ff4d6d';
    this.time.delayedCall(500, () => {
      if (!this.finished) this.juice.popText(WIDTH / 2, ARENA_MID - 60, note, color, 22);
    });
  }

  /** Moves bought abilities into empty slots. */
  private fillAbilityStock(): void {
    while (this.abilities.hasFreeSlot) {
      const id = save.pullStockAbility();
      if (!id) return;
      const slot = this.abilities.grantSpecific(id);
      if (slot < 0) {
        save.returnStockAbility(id);
        return;
      }
      this.stockOrigin[slot] = id;
    }
  }

  /** Gives unused bought abilities back when the level is left without clearing it. */
  private refundStockedAbilities(): void {
    for (let i = 0; i < this.stockOrigin.length; i++) {
      const id = this.stockOrigin[i];
      this.stockOrigin[i] = null;
      if (id) save.returnStockAbility(id);
    }
  }

  private grantMystery(x: number, y: number): void {
    audio.sfx('sfx_mystery', 0.5, 0, { x });
    if (this.abilities.grant()) {
      this.juice.ring(x, y, 0xff5cf0, 60);
      return;
    }
    for (let i = 0; i < 3; i++) this.addCoin(x + (i - 1) * 16, y);
    this.juice.popText(x, y - 44, 'SLOTS FULL', '#8a83b8', 14);
  }

  private spawnFrenzy(count: number): void {
    const speed = Math.max(this.ballList[0]?.speed ?? 0, this.diff.minSpeed);
    const room = this.ballRoom(count, this.paddle.x, this.paddle.y);
    for (let i = 0; i < room; i++) {
      const b = this.makeBall(this.paddle.x, this.paddle.y - 26);
      b.launch(-Math.PI / 2 + (i - (room - 1) / 2) * 0.22, speed);
    }
    this.powerups.apply('pierce', this.paddle.x, this.paddle.y);
  }

  // ---------------------------------------------------------------- flow

  private addScore(n: number): void {
    this.hud.score += Math.round(n);
  }

  /** A ball was lost, or (`breach`) Descent bricks crossed the line while the ball stays in play. */
  private loseLife(breach = false): void {
    if (this.finished) return;
    if (!save.state.settings.godMode) this.hud.lives--;
    this.hud.combo = 0;
    this.pacing.onLifeLost();
    this.musicMood.onLifeLost();
    audio.musicDip();
    if (!breach) {
      this.abilities.clearEffects();
      this.fever.reset();
      this.nudgeMs = 0;
      this.powerups.clear();
      this.laser.clear();
      this.skills.gun.stop();
      if (this.skills.slowmo.active) this.endSlowmo();
      this.removeShield();
      this.paddle.resetSize();
      this.coach?.ballReturned(false);
    }
    audio.sfx('death', 0.3, 0, { delay: breach ? BREACH_DEATH_DELAY : 0 });
    haptic('heavy');
    this.lighting.pulse(0xff2a3a, 0.4);
    this.juice.shake(250, 0.01);
    this.juice.flash(150, 255, 60, 90);
    if (this.hud.lives <= 0) {
      this.gameOver();
      return;
    }
    if (breach) return;
    this.resetBall();
    this.showHint();
  }

  private showHint(): void {
    this.clearHint();
    const t = theme();
    // While the tutorial shows the controls, its pictures stand in for the words.
    if (!this.coaching) {
      this.hint = label(this, WIDTH / 2, PADDLE_Y - 160, 'TAP TO LAUNCH', 18, { t, color: t.palette.text });
      this.hint.setDepth(20).setStroke(css(t.palette.base), 6);
      if (!calm()) {
        this.tweens.add({
          targets: this.hint,
          alpha: { from: 1, to: 0.4 },
          duration: 700,
          yoyo: true,
          repeat: -1,
        });
      }
    }
    const ring = new RingTimer(this, 0, 0, 96, t.palette.accent);
    const num = display(this, 0, 2, '', 56, { t });
    this.countdown = this.add.container(WIDTH / 2, this.countdownY(), [ring, num]).setDepth(20).setVisible(false);
    this.countdownShown = 0;
  }

  /** A band slams across the field with the level's name, then gets out of the way. */
  private introCard(): void {
    const t = theme();
    let kicker = 'Arcade run';
    let name = this.hud.title;
    if (!this.runConfig) {
      const { first, last } = worldLevels(this.world);
      kicker = `${t.name}  ·  ${this.levelIndex - first + 1} / ${last - first + 1}`;
      name = this.level.title ?? `Level ${this.levelIndex}`;
    }
    const band = this.add.container(WIDTH / 2, ARENA_MID - 40).setDepth(25);
    const bg = this.add.rectangle(0, 0, WIDTH, 112, t.palette.base, 0.78);
    const rules = [-56, 56].map((y) =>
      this.add
        .image(0, y, glowLineTexture(this))
        .setDisplaySize(WIDTH, 12)
        .setTint(t.palette.accent)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    const top = label(this, 0, -24, kicker, 13, { t, color: t.palette.textDim });
    const head = heading(this, 0, 14, name, 40, { t });
    band.add([bg, ...rules, top, head]);
    if (calm()) {
      band.setAlpha(0);
      this.tweens.chain({
        targets: band,
        tweens: [
          { alpha: 1, duration: 200 },
          { alpha: 0, delay: 1200, duration: 300, onComplete: () => band.destroy() },
        ],
      });
      return;
    }
    band.setScale(1, 0);
    head.setX(-WIDTH);
    this.tweens.add({ targets: band, scaleY: 1, duration: 220, ease: 'Cubic.Out' });
    this.tweens.add({ targets: head, x: 0, delay: 120, duration: 360, ease: 'Back.Out' });
    audio.sfx('ui_intro', 0.45);
    this.tweens.add({
      targets: band,
      scaleY: 0,
      alpha: 0,
      delay: 1500,
      duration: 260,
      ease: 'Cubic.In',
      onComplete: () => band.destroy(),
    });
  }

  private clearHint(): void {
    this.hint?.destroy();
    this.hint = undefined;
    this.countdown?.destroy();
    this.countdown = undefined;
  }

  /** Above the hint. */
  private countdownY(): number {
    return PADDLE_Y - 215;
  }

  private win(): void {
    if (this.finished) return;
    this.finished = true;
    this.cleared = true;
    this.coach?.finish();
    this.fever.reset();
    this.abilities.clearEffects();
    if (this.skills.slowmo.active) this.endSlowmo();
    runCarry.stage(this.abilities.held(), this.levelIndex + 1);
    const stars = starsForLives(this.hud.lives);
    const prevBest = save.state.levels[this.level.id]?.bestScore ?? 0;
    const isBest = save.recordWin(this.levelIndex, stars, this.hud.score, this.levels.length);
    const finale = worldLevels(this.world).last === this.levelIndex;
    reportProgress((save.clearedCount() / Math.max(1, this.levels.length)) * 100);
    // Finishing a world only, so the page confetti stays a rare thing.
    if (finale) celebrate();
    audio.stopMusic();
    audio.loop('brick_mover', false);
    audio.fanfare();
    haptic('heavy');
    this.lighting.celebrate();
    this.juice.flash(250, 255, 240, 200);
    for (const b of this.ballList) b.body.setVelocity(0, 0);
    const data: ResultsData = {
      win: true,
      index: this.levelIndex,
      score: this.hud.score,
      stars,
      isBest,
      coinsEarned: this.hud.coinsEarned,
      bestScore: Math.max(prevBest, this.hud.score),
      tail: stars === 3 || finale,
    };
    if (this.levelIndex >= this.levels.length) {
      this.inputSys.enabled = false;
      this.time.delayedCall(RESULTS_DELAY_MS, () => this.showResults(data));
      return;
    }
    this.showClearBanner(data);
  }

  /**
   * Campaign clear without leaving the action: stars and score over the field, then the next level
   * starts by itself. A tap goes on early; pausing still reaches Upgrades and the level list.
   */
  private showClearBanner(d: ResultsData): void {
    this.bannerUp = true;
    this.clearHint();
    this.powerups.clear();
    this.laser.clear();
    this.physics.world.pause();

    const next = d.index + 1;
    const t = theme();
    const root = this.add.container(WIDTH / 2, ARENA_MID).setDepth(30);
    root.add(framePanel(this, 0, 0, 440, 340, t, { ornament: true }));
    const head = heading(this, 0, -122, `Level ${d.index} clear`, 36, { t });
    root.add(head);
    slam(this, head, { delay: 120 });
    root.add(
      revealStars(this, 0, -46, d.stars, {
        size: 62,
        delay: 260,
        t,
        onStar: (i) => {
          audio.sfx(`star_${i + 1}`, 0.5);
          if (d.tail && i === d.stars - 1) audio.fanfareTail();
        },
      }),
    );
    if (d.isBest) this.time.delayedCall(NEW_BEST_MS, () => audio.sfx('new_best', 0.45));

    const score = display(this, 0, 28, '0', 40, { t });
    root.add(score);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: d.score,
      duration: 900,
      delay: 200,
      ease: 'Cubic.Out',
      onUpdate: () => score.setText(Math.round(counter.v).toLocaleString()),
    });
    root.add(
      d.isBest
        ? glowWord(this, 0, 64, 'New best', 18, t.palette.gold)
        : label(this, 0, 64, `Best ${d.bestScore.toLocaleString()}`, 13, { t, color: t.palette.textDim }),
    );
    root.add(label(this, 0, 88, `+${d.coinsEarned} coins`, 14, { t, color: css(t.palette.gold) }));

    const bar = new Meter(this, 0, 120, 320, 10, 0, t.palette.accent);
    root.add(bar);
    root.add(label(this, 0, 146, `Level ${next}  ·  tap to go`, 14, { t, color: t.palette.text }));

    root.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });

    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      this.skipBanner = undefined;
      const c = Phaser.Display.Color.IntegerToColor(t.palette.base);
      this.cameras.main.fadeOut(220, c.red, c.green, c.blue);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
        this.scene.restart({ index: next }),
      );
    };
    const fill = { v: 0 };
    this.tweens.add({
      targets: fill,
      v: 1,
      duration: CLEAR_ADVANCE_MS,
      onUpdate: () => bar.set(fill.v, false),
      onComplete: go,
    });
    this.time.delayedCall(CLEAR_TAP_GUARD_MS, () => (this.skipBanner = go));
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => {
      this.skipBanner?.();
    });
  }

  private gameOver(): void {
    if (this.runDirector) {
      this.runDirector.onOutOfLives();
      this.endRun();
      return;
    }
    this.finished = true;
    this.inputSys.enabled = false;
    this.coach?.finish();
    this.fever.reset();
    this.abilities.clearEffects();
    audio.stopMusic('tape');
    audio.loop('brick_mover', false);
    audio.sfx('gameover', 0.3);
    this.time.delayedCall(600, () =>
      this.showResults({
        win: false,
        index: this.levelIndex,
        score: this.hud.score,
        stars: 0,
        isBest: false,
        coinsEarned: this.hud.coinsEarned,
        bestScore: save.state.levels[this.level.id]?.bestScore ?? 0,
      }),
    );
  }

  /** Arcade: the goal was met, time ran out, or the lives did. */
  private endRun(): void {
    const director = this.runDirector;
    if (this.finished || !director) return;
    this.finished = true;
    this.inputSys.enabled = false;
    this.coach?.finish();
    this.fever.reset();
    this.abilities.clearEffects();
    const { state, config } = director;
    const complete = state.outcome === 'complete';
    const key = runKey(config.loop, config.goal.kind);
    const prev = save.state.runs[key] ?? { bestScore: 0, bestReach: 0 };
    const isBest = save.recordRun(key, this.hud.score, state.reach);
    audio.stopMusic(complete ? 'cut' : 'tape');
    audio.loop('brick_mover', false);
    if (complete) {
      audio.fanfare(ARCADE_TAIL_AT);
      haptic('heavy');
      this.lighting.celebrate();
      this.juice.flash(250, 255, 240, 200);
    } else {
      audio.sfx('gameover', 0.3);
    }
    for (const b of this.ballList) b.body.setVelocity(0, 0);
    this.time.delayedCall(complete ? RESULTS_DELAY_MS : 600, () =>
      this.showResults({
        win: complete,
        index: 0,
        score: this.hud.score,
        stars: 0,
        isBest,
        coinsEarned: this.hud.coinsEarned,
        bestScore: Math.max(prev.bestScore, this.hud.score),
        run: {
          config,
          outcome: complete ? 'complete' : 'over',
          tier: state.tier,
          reach: state.reach,
          bestReach: Math.max(prev.bestReach, state.reach),
        },
      }),
    );
  }

  private runHost(): RunHost {
    return {
      scene: this,
      bricks: this.bricks,
      juice: this.juice,
      lighting: this.lighting,
      ballInPlay: () => this.ballList.some((b) => !b.attached),
      rearm: () => {
        this.rearm();
        this.showHint();
      },
      bricksAdded: (bricks, board) => this.onBricksAdded(bricks, board),
      addScore: (n) => this.addScore(n),
      addLife: () => this.addLife(),
      setTier: (tier) => {
        this.diff = scaleDifficulty(DIFFICULTY[save.state.difficulty], tier);
      },
      breach: () => this.loseLife(true),
      endRun: () => this.endRun(),
      setLabel: (title, detail) => {
        this.hud.title = title;
        this.hud.detail = detail;
      },
    };
  }

  private bossHost(): BossHost {
    return {
      scene: this,
      bricks: this.bricks,
      juice: this.juice,
      lighting: this.lighting,
      scenery: this.scenery,
      backdrop: this.backdrop,
      powerups: this.powerups,
      paddle: this.paddle,
      ballInPlay: () => this.ballList.some((b) => !b.attached),
      timeScale: () => this.physics.world.timeScale,
      hitDamage: () => this.hitDamage,
      bricksAdded: (bricks, board) => this.onBricksAdded(bricks, board),
      creditHit: (brick, cause) => this.creditBreak(brick, cause, 0),
      addScore: (n) => this.addScore(n),
      setLabel: (title, detail) => {
        this.hud.title = title;
        this.hud.detail = detail;
      },
      defeated: () => this.win(),
      setHud: (view) => {
        this.hud.boss = view;
      },
    };
  }

  private onBricksAdded(bricks: readonly Brick[], board: boolean): void {
    this.addBrickLights(bricks);
    const remaining = this.bricks.remaining;
    if (board) {
      this.pacing = new PacingDirector();
      this.initialBreakables = Math.max(1, remaining);
      this.wallsDown = false;
    } else {
      this.initialBreakables = Math.max(this.initialBreakables, remaining);
    }
  }

  private showResults(data: ResultsData): void {
    gameplayStop();
    this.physics.world.pause();
    this.scene.launch(SCENES.results, { from: SCENES.play, ...data });
    this.scene.pause();
  }

  /** Keep the paddle, shield and hint on the deck line when the visible screen changes. */
  private onViewport(): void {
    this.paddle.setY(PADDLE_Y);
    this.physics.world.setBounds(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT + 200);
    this.hint?.setY(PADDLE_Y - 160);
    this.countdown?.setY(this.countdownY());
    if (this.shieldBar) {
      this.shieldBar.setY(shieldY());
      this.shieldBar.refreshBody();
    }
    if (this.shieldLight) this.shieldLight.y = shieldY() - 34;
  }

  /** Runs after the Arcade plugin has torn down its world, so never touch `this.physics.world` here. */
  private shutdown(): void {
    gameplayStop();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onViewport, this);
    if (!this.cleared) this.refundStockedAbilities();
    this.unsubscribeBackground?.();
    this.unsubscribeBackground = undefined;
    this.unsubscribePad?.();
    this.unsubscribePad = undefined;
    audio.loop('brick_mover', false);
    audio.resetMix();
    this.boss?.destroy();
    this.boss = undefined;
    exposeBoss(undefined);
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.input.keyboard?.removeAllKeys(true);
    this.shieldBar = undefined;
    this.scene.stop(SCENES.hud);
  }
}
