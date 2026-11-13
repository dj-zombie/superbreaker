import Phaser from 'phaser';
import { worldForLevel } from '../art/backdrops';
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
  WIDTH,
} from '../config';
import { PacingDirector, type Intervention } from '../core/Pacing';
import {
  BRICK_SCORE,
  DIFFICULTY,
  FIREBALL_DAMAGE,
  LASER_BRICK_SCORE,
  MAX_LIVES,
  PIERCE_DAMAGE,
  START_LIVES,
  starsForLives,
  type DifficultyConfig,
} from '../core/Difficulty';
import { unlockedAbilities, type AbilityId } from '../core/Abilities';
import { LASER_BARREL_OFFSETS, powerupStats } from '../core/Economy';
import { abilitiesCarryOver, runCarry, type SessionPowerupId } from '../core/Session';
import type { LevelSpec, PowerupId } from '../core/types';
import { BALL_SIZE, Ball } from '../entities/Ball';
import type { Brick } from '../entities/Brick';
import { Paddle } from '../entities/Paddle';
import { haptic } from '../platform/haptics';
import { onAppBackground } from '../platform/lifecycle';
import { save } from '../services';
import { AbilitySystem, SLOT_COUNT, type SlotState } from '../systems/AbilitySystem';
import { audio } from '../systems/AudioSystem';
import { BrickSystem, type DestroyCause } from '../systems/BrickSystem';
import { Backdrop } from '../systems/Backdrop';
import { BallFx } from '../systems/BallFx';
import { FrameMonitor, particleDensity } from '../systems/Quality';
import { FeverSystem } from '../systems/FeverSystem';
import { InputSystem } from '../systems/InputSystem';
import { JuiceSystem } from '../systems/JuiceSystem';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { PowerupSystem, type ActiveEffect, type Pickup } from '../systems/PowerupSystem';
import { bodyText, fadeIn } from '../ui/Button';
import { BaseScene } from './BaseScene';

export interface PlayData {
  index: number;
}

export interface ResultsData {
  win: boolean;
  index: number;
  score: number;
  stars: number;
  isBest: boolean;
  coinsEarned: number;
  bestScore: number;
}

/** Read by the HUD scene every frame. */
export interface HudState {
  index: number;
  score: number;
  lives: number;
  coinsEarned: number;
  combo: number;
  shield: boolean;
  effects: ActiveEffect[];
  remaining: number;
  slots: SlotState[];
  /** One-use powerups bought for this run, tapped from the HUD. */
  stock: SessionPowerupId[];
  /** Fever meter fill, or time left while Fever runs (0..1). */
  fever: number;
  feverActive: boolean;
  /** Drives the control deck's slider marker. */
  paddleX: number;
  /** A ball is waiting on the paddle for a launch. */
  ballHeld: boolean;
}

/** Shield bar center, just under the paddle and above the deck panel. */
const shieldY = () => DECK_TOP - 8;

/** Arcade passes sprite-vs-group callback args in its own order, so find the ball explicitly. */
function pickBall(a: unknown, b: unknown): Ball {
  return (a instanceof Ball ? a : b) as Ball;
}

const AIM_MIN = -2.6;
const AIM_MAX = -0.55;
const AIM_SPEED = 2.4;
/** Homing turn rates in rad/s. */
const NUDGE_TURN = 1.8;
const ENDGAME_TURN = 1.1;
const NUDGE_MS = 4_000;

export class Play extends BaseScene {
  levelIndex = 1;
  hud!: HudState;

  private level!: LevelSpec;
  private diff!: DifficultyConfig;
  private paddle!: Paddle;
  private balls!: Phaser.Physics.Arcade.Group;
  private lasers!: Phaser.Physics.Arcade.Group;
  private bricks!: BrickSystem;
  private powerups!: PowerupSystem;
  private abilities!: AbilitySystem;
  private fever!: FeverSystem;
  private backdrop!: Backdrop;
  private scenery!: ParallaxBackdrop;
  private ballFx!: BallFx;
  private frameMonitor!: FrameMonitor;
  private pacing!: PacingDirector;
  private initialBreakables = 1;
  private nudgeMs = 0;
  private juice!: JuiceSystem;
  private inputSys!: InputSystem;
  private arrow!: Phaser.GameObjects.Image;
  private hint?: Phaser.GameObjects.Text;
  private shieldBar?: Phaser.Physics.Arcade.Image;
  private aim = -Math.PI / 2;
  private aimDir = 1;
  private laserCooldown = 0;
  private finished = false;
  private cleared = false;
  /** Stocked abilities sitting in slots. Refunded if the level is abandoned. */
  private stockOrigin: Array<AbilityId | null> = Array.from({ length: SLOT_COUNT }, () => null);
  private unsubscribeBackground?: () => void;

  constructor() {
    super(SCENES.play);
  }

  init(data: PlayData): void {
    this.levelIndex = Phaser.Math.Clamp(data.index ?? 1, 1, Math.max(1, this.levels.length));
    this.finished = false;
    this.cleared = false;
    this.stockOrigin = Array.from({ length: SLOT_COUNT }, () => null);
    this.aim = -Math.PI / 2;
    this.laserCooldown = 0;
    this.nudgeMs = 0;
  }

  preload(): void {
    ParallaxBackdrop.preload(this, worldForLevel(this.levelIndex));
  }

  create(): void {
    this.setupCamera();
    fadeIn(this, 300);
    this.input.enabled = true;
    this.level = this.levels[this.levelIndex - 1]!;
    const world = worldForLevel(this.levelIndex);
    this.diff = DIFFICULTY[save.state.difficulty];
    this.hud = {
      index: this.levelIndex,
      score: 0,
      lives: START_LIVES,
      coinsEarned: 0,
      combo: 0,
      shield: false,
      effects: [],
      remaining: 0,
      slots: [],
      stock: [],
      fever: 0,
      feverActive: false,
      paddleX: WIDTH / 2,
      ballHeld: true,
    };

    this.scenery = new ParallaxBackdrop(this, worldForLevel(this.levelIndex));
    this.backdrop = new Backdrop(this.scenery, 0.12);
    this.setupPhysics();

    this.juice = new JuiceSystem(this);
    this.juice.particleScale = particleDensity();
    this.ballFx = new BallFx(this);
    this.frameMonitor = new FrameMonitor(this.game);
    this.paddle = new Paddle(this, world);
    this.balls = this.physics.add.group();
    this.lasers = this.physics.add.group({ allowGravity: false });
    this.arrow = this.add.image(0, 0, 'arrow').setOrigin(0, 0.5).setDepth(4).setAlpha(0.9);
    this.arrow.setScale(56 / this.arrow.width);

    this.bricks = new BrickSystem(
      this,
      this.level,
      {
        onDestroyed: (b, cause, chain) => this.onBrickDestroyed(b, cause, chain),
        onExplosion: (x, y, chain) => this.onExplosion(x, y, chain),
        onRegrow: (b) => this.juice.sparkle(b.x, b.y, COLORS.good, 8),
        onCollapseStart: () => {
          this.juice.popText(WIDTH / 2, ARENA_MID - 40, 'COLLAPSE!', '#ffc93c', 30);
          this.juice.shake(400, 0.006);
          haptic('medium');
        },
        regrowBlocked: (b) => {
          const reachX = b.displayWidth / 2 + 12 + BALL_SIZE / 2;
          const reachY = b.displayHeight / 2 + 12 + BALL_SIZE / 2;
          return this.ballList.some(
            (ball) => Math.abs(ball.x - b.x) < reachX && Math.abs(ball.y - b.y) < reachY,
          );
        },
      },
      world,
    );
    this.hud.remaining = this.bricks.remaining;
    this.initialBreakables = Math.max(1, this.bricks.remaining);
    this.pacing = new PacingDirector();
    this.fever = new FeverSystem(this, this.juice, this.backdrop, (active) => {
      this.onEffectsChanged();
      this.scenery.setPace(active ? 3.5 : 1);
    });

    this.powerups = new PowerupSystem(this, {
      spawnExtraBalls: (n) => this.spawnExtraBalls(n),
      resizePaddle: (m) => this.paddle.resize(m),
      addLife: () => this.addLife(),
      addCoin: (x, y) => this.addCoin(x, y),
      enableShield: () => this.enableShield(),
      onEffectsChanged: () => this.onEffectsChanged(),
      onPickup: (id, x, y) => this.onPickup(id, x, y),
      grantMystery: (x, y) => this.grantMystery(x, y),
    });

    this.abilities = new AbilitySystem(this, {
      bricks: this.bricks,
      juice: this.juice,
      backdrop: this.backdrop,
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

    this.setupColliders();
    this.inputSys = new InputSystem(
      this,
      this.paddle,
      () => this.launch(),
      () => this.requestPause(),
    );

    const kb = this.input.keyboard;
    kb?.addKey(Phaser.Input.Keyboard.KeyCodes.Q).on('down', () => this.fireSlot(0));
    kb?.addKey(Phaser.Input.Keyboard.KeyCodes.E).on('down', () => this.fireSlot(1));
    const digits = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
    ];
    const pads = [
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
      Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
    ];
    digits.forEach((code, i) => kb?.addKey(code).on('down', () => this.useStock(i)));
    pads.forEach((code, i) => kb?.addKey(code).on('down', () => this.useStock(i)));

    this.resetBall();
    this.showHint();

    this.scene.launch(SCENES.hud);
    audio.resetArpeggio();
    audio.playMusic('music');

    this.unsubscribeBackground = onAppBackground(() => this.requestPause());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.juice.particleScale = particleDensity();
      this.physics.world.resume();
      audio.duckMusic(false);
      this.fillAbilityStock();
    });
  }

  override update(_time: number, delta: number): void {
    this.frameMonitor.update();
    if (this.finished) return;
    const dt = Math.min(delta, 50);
    this.inputSys.update(dt);
    this.paddle.step(dt);
    if (!this.juice.inHitStop) {
      this.powerups.update(dt);
      this.bricks.update(dt);
    }
    this.abilities.update(dt);
    this.fever.update(dt);
    this.backdrop.update(dt);
    this.scenery.setFocus(this.paddle.x);
    this.updateAttachedBalls(dt);
    this.ballFx.update(this.ballList, dt, this.juice.particleScale);
    this.updateTimeScale();
    this.updateLasers(dt);
    this.updatePacing(dt);
    this.checkLostBalls();
    this.hud.effects = this.powerups.active;
    this.hud.remaining = this.bricks.remaining;
    this.hud.slots = this.abilities.slots;
    this.hud.stock = save.state.stock.powerups;
    this.hud.fever = this.fever.meter.display;
    this.hud.feverActive = this.fever.active;
    this.hud.paddleX = this.paddle.x;
    if (this.hud.remaining === 0) this.win();
  }

  /** Fires an ability slot (HUD tap or Q/E). */
  fireSlot(i: number): void {
    if (this.finished || !this.scene.isActive()) return;
    if (!this.abilities.activate(i)) return;
    this.stockOrigin[i] = null;
    this.fillAbilityStock();
    this.hud.slots = this.abilities.slots;
  }

  /** Uses a bought powerup (HUD tap or number key). */
  useStock(i: number): void {
    if (this.finished || !this.scene.isActive()) return;
    const id = save.useStockPowerup(i);
    if (!id) return;
    const x = this.paddle.x;
    const y = this.paddle.y;
    this.onPickup(id, x, y);
    this.powerups.apply(id, x, y);
    this.hud.stock = save.state.stock.powerups;
  }

  requestPause(): void {
    if (this.finished || !this.scene.isActive()) return;
    this.physics.world.pause();
    audio.duckMusic(true);
    this.scene.launch(SCENES.pause, { from: SCENES.play });
    this.scene.pause();
  }

  // ---------------------------------------------------------------- setup

  private setupPhysics(): void {
    const world = this.physics.world;
    world.setBounds(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT + 200);
    world.setBoundsCollision(true, true, true, false);
    world.timeScale = 1;
    world.resume();
    world.on(Phaser.Physics.Arcade.Events.WORLD_BOUNDS, (body: Phaser.Physics.Arcade.Body) => {
      const ball = body.gameObject as Ball;
      if (!(ball instanceof Ball)) return;
      ball.normalize(this.diff.minSpeed, this.diff.maxSpeed);
      this.refillPlow(ball);
      audio.sfx('ui_move', 0.12);
      this.juice.sparkle(ball.x, ball.y, 0x7fe9ff, 3);
    });
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
    this.physics.add.overlap(this.paddle, this.powerups.group, (_p, pickup) =>
      this.powerups.collect(pickup as Pickup),
    );
    this.physics.add.overlap(this.lasers, this.bricks.group, (laser, brick) =>
      this.onLaserBrick(laser as Phaser.Physics.Arcade.Image, brick as Brick),
    );
  }

  // ---------------------------------------------------------------- balls

  private makeBall(x: number, y: number): Ball {
    const ball = new Ball(this, x, y, worldForLevel(this.levelIndex));
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

  private resetBall(): void {
    this.balls.clear(true, true);
    this.paddle.setX(WIDTH / 2);
    this.paddle.targetX = WIDTH / 2;
    const ball = this.makeBall(WIDTH / 2, PADDLE_Y - 24);
    ball.attach(0);
    this.aim = -Math.PI / 2;
  }

  private launch(): void {
    const held = this.ballList.find((b) => b.attached);
    if (!held || this.finished) return;
    held.launch(this.aim, Math.max(held.speed, this.diff.minSpeed));
    this.hint?.destroy();
    this.hint = undefined;
    if (!save.state.seenInstructions) save.update((d) => (d.seenInstructions = true));
    audio.sfx('ui_toggle', 0.4);
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
  }

  private spawnExtraBalls(count: number): void {
    const src = this.ballList.find((b) => !b.attached) ?? this.ballList[0];
    if (!src) return;
    const speed = Math.max(src.speed, this.diff.minSpeed);
    for (let i = 0; i < count; i++) {
      const b = this.makeBall(src.x, src.y);
      b.launch(Phaser.Math.FloatBetween(-2.4, -0.7), speed);
    }
  }

  private checkLostBalls(): void {
    for (const b of this.ballList) {
      if (b.y > LOSE_Y) b.destroy();
    }
    if (this.ballList.length === 0) this.loseLife();
  }

  private currentMode() {
    if (this.powerups?.is('fireball') || this.fever?.active) return 'fireball' as const;
    if (this.powerups?.is('pierce')) return 'pierce' as const;
    return 'normal' as const;
  }

  private updateTimeScale(): void {
    this.physics.world.timeScale = this.powerups.is('hyper') ? HYPER_TIME_SCALE : 1;
  }

  // ---------------------------------------------------------------- collisions

  private onPaddleHit(ball: Ball): void {
    this.paddle.squash();
    audio.hit();
    this.hud.combo = 0;
    this.pacing.onPaddleHit();
    this.refillPlow(ball);

    if (this.powerups.is('magnet') && !this.ballList.some((b) => b.attached)) {
      ball.attach(
        Phaser.Math.Clamp(ball.x - this.paddle.x, -this.paddle.halfWidth, this.paddle.halfWidth),
      );
      this.aim = -Math.PI / 2;
      this.powerups.consumeMagnet();
      audio.sfx('sfx_magnet', 0.4);
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

  private onBallBrick(ball: Ball, brick: Brick): void {
    const fire = this.fireActive;
    const hyper = this.powerups.is('hyper') ? HYPER_DAMAGE_MULT : 1;
    const res = this.bricks.hit(
      brick,
      fire ? FIREBALL_DAMAGE : this.diff.hitDamage * hyper,
      'ball',
      {
        stripArmor: fire,
      },
    );
    this.refillPlow(ball);
    if (res === 'immune') {
      audio.sfx('ui_toggle', 0.25);
      this.juice.sparkle(ball.x, ball.y, 0xcfd6e6, 5);
    } else if (res !== 'destroyed') {
      audio.hit();
    }
    if (fire && res !== 'immune') this.juice.shake(80, 0.004);
    if (res === 'destroyed') {
      ball.speed = Math.min(ball.speed + this.diff.speedStep, this.diff.maxSpeed);
    }
    if (this.diff.shrinkPaddleOnHit && res !== 'immune') this.paddle.resize(0.997, false);
    ball.normalize(this.diff.minSpeed, this.diff.maxSpeed);
  }

  private onBrickDestroyed(b: Brick, cause: DestroyCause, chain: number): void {
    if (cause !== 'fall') {
      this.hud.combo++;
      this.pacing.onBreak();
      this.fever.onBreak(this.hud.combo);
    }
    const base = cause === 'laser' ? LASER_BRICK_SCORE : BRICK_SCORE;
    const bonus = Math.min(this.hud.combo, 20) * 10 + chain * 20;
    this.addScore((base + bonus) * this.fever.scoreMultiplier);
    if (this.hud.combo >= 5 && this.hud.combo % 5 === 0) {
      this.juice.popText(b.x, b.y - 10, `COMBO x${this.hud.combo}`, '#ffc93c', 20);
    }
    this.juice.burst(b.x, b.y, b.tintColor, cause === 'explosion' ? 8 : 12);
    audio.breakSound(Math.min(this.hud.combo, 12) * 40);
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

  private onExplosion(x: number, y: number, chain: number): void {
    this.juice.ring(x, y, 0xff8a1f, EXPLOSION_RADIUS * 1.4);
    this.juice.burst(x, y, 0xff5a1f, 18);
    this.juice.shake(160 + chain * 40, 0.008 + chain * 0.002);
    this.juice.hitStop(45);
    this.juice.flash(80, 255, 140, 60);
    this.scenery.flash(0.12 + chain * 0.04);
    audio.sfx('sfx_fireball', 0.45, -200 + chain * 100);
    haptic('heavy');
    if (chain >= 2) this.juice.popText(x, y - 20, `CHAIN x${chain}`, '#ff8a1f', 22);
  }

  private onLaserBrick(laser: Phaser.Physics.Arcade.Image, brick: Brick): void {
    if (!brick.isAlive || !laser.active) return;
    laser.destroy();
    const res = this.bricks.hit(brick, powerupStats(save.state.upgrades).laserDamage, 'laser');
    this.juice.sparkle(laser.x, laser.y, res === 'immune' ? 0xcfd6e6 : 0xff6a6a, 4);
  }

  // ---------------------------------------------------------------- powerups

  private onPickup(id: PowerupId, x: number, y: number): void {
    const info = POWERUP_INFO[id];
    if (id !== 'coin') {
      this.juice.popText(x, y - 24, info.label.toUpperCase(), '#ffffff', 18);
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
      shield: 'ui_on',
      hyper: 'sfx_laser',
      extraLife: 'win_jingle',
      pierce: 'sfx_laser',
    };
    const key = sfx[id];
    if (key) audio.sfx(key, 0.5);
  }

  private onEffectsChanged(): void {
    const mode = this.currentMode();
    for (const b of this.ballList) b.setMode(mode);
  }

  private addCoin(x: number, y: number): void {
    this.hud.coinsEarned++;
    save.addCoins(1);
    audio.sfx('sfx_coin', 0.45);
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
      audio.sfx('ui_off', 0.5);
      haptic('medium');
      this.removeShield();
    });
    this.shieldBar = bar;
  }

  private removeShield(): void {
    this.hud.shield = false;
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

  private updateLasers(dt: number): void {
    for (const l of this.lasers.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (l.y < HUD_HEIGHT) l.destroy();
    }
    if (!this.powerups.is('laser') || this.juice.inHitStop) return;
    this.laserCooldown -= dt;
    if (this.laserCooldown > 0) return;
    this.laserCooldown = powerupStats(save.state.upgrades).laserIntervalMs;
    for (const side of LASER_BARREL_OFFSETS) {
      const l = this.lasers.create(
        this.paddle.x + side * (this.paddle.halfWidth - 10),
        this.paddle.y - 16,
        'laser',
      ) as Phaser.Physics.Arcade.Image;
      l.setDisplaySize(6, 20).setTint(0xff5a5a).setBlendMode(Phaser.BlendModes.ADD);
      l.body!.velocity.y = -760;
    }
    audio.sfx('laser_shot', 0.18);
  }

  // ---------------------------------------------------------------- pacing and abilities

  private updatePacing(dt: number): void {
    const free = this.ballList.filter((b) => !b.attached);
    const remaining = this.bricks.remaining;
    const step = this.pacing.update(dt, remaining, free.length > 0);
    if (step) this.intervene(step);

    this.nudgeMs = Math.max(0, this.nudgeMs - dt);
    const turn =
      this.nudgeMs > 0 ? NUDGE_TURN : this.pacing.endgameAssist(remaining) ? ENDGAME_TURN : 0;
    if (turn > 0) {
      const targets = this.bricks.targets;
      for (const b of free) {
        let best: Brick | undefined;
        let bestD = Infinity;
        for (const t of targets) {
          const d = (t.x - b.x) ** 2 + (t.y - b.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        if (best) b.steerToward(best.x, best.y, turn, dt);
      }
    }
    const hyper = this.powerups.is('hyper');
    for (const b of free) {
      b.setHyper(hyper);
      if (this.fever.active) b.setTrailTint(this.fever.trailColor);
    }
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
        audio.sfx('ui_on', 0.5);
        break;
      }
      case 'surge':
        this.juice.popText(WIDTH / 2, ARENA_MID, 'POWER SURGE!', '#ffc93c', 30);
        this.juice.flash(120, 255, 200, 80);
        haptic('medium');
        this.fever.boost(0.6);
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
    if (this.abilities.grant()) {
      audio.sfx('win_jingle', 0.35, 600);
      this.juice.ring(x, y, 0xff5cf0, 60);
      return;
    }
    for (let i = 0; i < 3; i++) this.addCoin(x + (i - 1) * 16, y);
    this.juice.popText(x, y - 44, 'SLOTS FULL', '#8a83b8', 14);
  }

  private spawnFrenzy(count: number): void {
    const speed = Math.max(this.ballList[0]?.speed ?? 0, this.diff.minSpeed);
    for (let i = 0; i < count; i++) {
      const b = this.makeBall(this.paddle.x, this.paddle.y - 26);
      b.launch(-Math.PI / 2 + (i - (count - 1) / 2) * 0.22, speed);
    }
    this.powerups.apply('pierce', this.paddle.x, this.paddle.y);
  }

  // ---------------------------------------------------------------- flow

  private addScore(n: number): void {
    this.hud.score += Math.round(n);
  }

  private loseLife(): void {
    if (this.finished) return;
    this.hud.lives--;
    this.hud.combo = 0;
    this.pacing.onLifeLost();
    this.abilities.clearEffects();
    this.fever.reset();
    this.nudgeMs = 0;
    this.powerups.clear();
    this.lasers.clear(true, true);
    this.removeShield();
    this.paddle.resetSize();
    audio.sfx('death', 0.3);
    haptic('heavy');
    this.juice.shake(250, 0.01);
    this.juice.flash(150, 255, 60, 90);
    if (this.hud.lives <= 0) {
      this.gameOver();
      return;
    }
    this.resetBall();
    this.showHint();
  }

  private showHint(): void {
    this.hint?.destroy();
    const first = !save.state.seenInstructions;
    const text = first
      ? 'Drag to move the paddle\nTap to launch the ball\nCatch powerups as they fall!'
      : 'TAP TO LAUNCH';
    this.hint = bodyText(this, WIDTH / 2, PADDLE_Y - 160, text, first ? 22 : 18, '#ffffff');
    this.hint.setDepth(20);
    this.hint.setStroke('#1a0629', 6);
    this.tweens.add({
      targets: this.hint,
      alpha: { from: 1, to: 0.4 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
  }

  private win(): void {
    if (this.finished) return;
    this.finished = true;
    this.cleared = true;
    this.inputSys.enabled = false;
    this.fever.reset();
    this.abilities.clearEffects();
    runCarry.stage(this.abilities.held(), this.levelIndex + 1);
    const stars = starsForLives(this.hud.lives);
    const prevBest = save.state.levels[this.level.id]?.bestScore ?? 0;
    const isBest = save.recordWin(this.levelIndex, stars, this.hud.score, this.levels.length);
    audio.stopMusic();
    audio.sfx('fanfare', 0.5);
    haptic('heavy');
    this.juice.flash(250, 255, 240, 200);
    for (const b of this.ballList) b.body.setVelocity(0, 0);
    this.time.delayedCall(700, () => {
      this.showResults({
        win: true,
        index: this.levelIndex,
        score: this.hud.score,
        stars,
        isBest,
        coinsEarned: this.hud.coinsEarned,
        bestScore: Math.max(prevBest, this.hud.score),
      });
    });
  }

  private gameOver(): void {
    this.finished = true;
    this.inputSys.enabled = false;
    this.fever.reset();
    this.abilities.clearEffects();
    audio.stopMusic();
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

  private showResults(data: ResultsData): void {
    this.physics.world.pause();
    this.scene.launch(SCENES.results, { from: SCENES.play, ...data });
    this.scene.pause();
  }

  /** Keep the paddle, shield and hint on the deck line when the visible screen changes. */
  private onViewport(): void {
    this.paddle.setY(PADDLE_Y);
    this.physics.world.setBounds(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT + 200);
    this.hint?.setY(PADDLE_Y - 160);
    if (this.shieldBar) {
      this.shieldBar.setY(shieldY());
      this.shieldBar.refreshBody();
    }
  }

  /** Runs after the Arcade plugin has torn down its world, so never touch `this.physics.world` here. */
  private shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onViewport, this);
    if (!this.cleared) this.refundStockedAbilities();
    this.unsubscribeBackground?.();
    this.unsubscribeBackground = undefined;
    audio.setMusicRate(1);
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.input.keyboard?.removeAllKeys(true);
    this.shieldBar = undefined;
    this.scene.stop(SCENES.hud);
  }
}
