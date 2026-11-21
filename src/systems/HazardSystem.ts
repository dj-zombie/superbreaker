import Phaser from 'phaser';
import { HUD_HEIGHT } from '../config';
import {
  SHOT_RADIUS,
  SKULL_POP_RADIUS,
  SKULL_RADIUS,
  SLAG_RADIUS,
  type AttackPlan,
  type HazardSpec,
  type PaddleEffect,
} from '../core/Boss';
import type { Ball } from '../entities/Ball';
import type { Paddle } from '../entities/Paddle';
import { solid } from '../ui/shapes';
import { calm, css, theme } from '../ui/theme';
import { audio } from './AudioSystem';
import type { FxEngine, FxHandle } from '../fx';
import type { JuiceSystem } from './JuiceSystem';
import type { Light, LightingSystem } from './LightingSystem';
import { fxTier } from './Quality';

/** What the hazards need from the fight. Built from closures, like every host. */
export interface HazardHost {
  readonly scene: Phaser.Scene;
  readonly juice: JuiceSystem;
  readonly fx: FxEngine;
  readonly lighting: LightingSystem;
  readonly paddle: Paddle;
  /** Centre of a part now, or undefined once it has left the field. */
  partPos(id: string): { x: number; y: number } | undefined;
  /** Every ball on the field, waiting on the paddle or in flight. */
  balls(): readonly Ball[];
  /** A skull landed on the paddle. */
  hurt(): void;
  /** A caught glob of slag struck part `id` for `hits`. False when the part could not take it. */
  returned(id: string, hits: number): boolean;
  /** Textures a boss brings for its hazards, in place of the plain ones. */
  readonly looks?: HazardLooks;
}

/** A boss's own pictures for its hazards. Each is a loaded texture key. */
export interface HazardLooks {
  /** A shot, drawn pointing down. */
  shot?: string;
  /** A glob of slag, and its splash on a miss. */
  slag?: string;
  splash?: string;
}

/** Beam columns draw over the aim arrow (4) and under everything else here. */
const COLUMN_DEPTH = 4.2;
/** Warnings on the paddle line draw over the columns. */
const MARK_DEPTH = 4.4;
/** Shots and skulls draw over the warnings and under the ball (5), which nothing here may hide. */
const HAZARD_DEPTH = 4.6;
/** A shot on screen, in px: its length down the flight. Across, it is as wide as it hits. */
const SHOT_LENGTH = 30;
/** A skull on screen, in px: a little over the width it hits, and well over a shot. */
const SKULL_SIZE = 40;
/** The cross where a shot will land, in px. */
const SHOT_MARK_SIZE = 14;
/** The skull where a skull will land, in px. */
const SKULL_MARK_SIZE = 28;
/** How see-through the mark on the line is. */
const MARK_ALPHA = 0.6;
/** How far outside a hazard's width its warning ring ends, in px. */
const RING_MARGIN = 6;
/** How much wider the warning ring starts than it ends, in px. */
const RING_LEAD = 80;
/** The warning ring's alpha as it starts to close and as it completes. */
const RING_ALPHA = [0.3, 1] as const;
/** The timing strip sits this far under the paddle's centre, in px: just clear of the paddle. */
const STRIP_DROP = 16;
/** Height of the timing strip, in px. */
const STRIP_HEIGHT = 5;
/** Alpha of the strip's empty track and of the fill running along it. */
const TRACK_ALPHA = 0.25;
const FILL_ALPHA = 0.95;
/** A beam's column before it fires and while it fires. */
const COLUMN_FAINT = 0.07;
const COLUMN_BRIGHT = 0.42;
/** Lights alive at once, whatever the plan holds. Hazard counts never change; lights are looks. */
const MAX_LIGHTS = 3;
/** Under the balls' 10, over ordinary gameplay lights. */
const LIGHT_PRIORITY = 7;
/** Brightness of a firing beam's light and of a flying skull's. */
const BEAM_LIGHT = 0.45;
const SKULL_LIGHT = 0.7;
/** Reach of a skull's light, in px. */
const SKULL_LIGHT_RADIUS = 110;
/** Sparks for a hazard that found the paddle, one that missed, and a skull that landed. */
const HIT_SPARKS = 8;
const MISS_SPARKS = 3;
const SKULL_SPARKS = 14;
/** Sparks and ring width, in px, for a skull the ball broke. */
const POP_SPARKS = 16;
const POP_RING = 60;
/** A hit on the paddle shakes the view this long, in ms, and this hard. */
const HIT_SHAKE_MS = 140;
const HIT_SHAKE = 0.006;
/** The light a hit throws on the paddle: its reach in px and its life in ms. */
const HIT_LIGHT_RADIUS = 150;
const HIT_LIGHT_MS = 260;
/** The word a hit pops over the paddle: how far above the line, in px, and its size, in px. */
const WORD_LIFT = 34;
const WORD_SIZE = 20;
/** Slag is gold, the one colour on the field that is safe to touch. */
export const SLAG_COLOR = 0xffc23a;
/** A glob on screen, in px, and how fast it tumbles, in turns a second. */
const SLAG_SIZE = 34;
const SLAG_SPIN = 0.6;
/** A caught glob flies back at its part this fast, in ms, and drops a spark this often, in ms. */
const SLAG_RETURN_MS = 380;
const SLAG_TRAIL_MS = 70;
/** A splash on a miss, in px, and how long it takes to fade, in ms. */
const SPLASH_SIZE = 46;
const SPLASH_MS = 420;
/** Brightness and reach of a glob's light. */
const SLAG_LIGHT = 0.6;
const SLAG_LIGHT_RADIUS = 90;
const SLAG_TOSS_SFX = 'boss_slag_toss';
const SLAG_CATCH_SFX = 'boss_slag_catch';
const SLAG_RETURN_SFX = 'boss_slag_return';
const SLAG_SPLASH_SFX = 'boss_slag_splash';
/** Placeholder sounds, all from AUDIO_ASSETS, until hazards get their own. */
const JAM_SFX = 'ui_locked';
const SHRINK_SFX = 'sfx_smaller';
const HIT_SFX = 'boss_paddle_hit';
const SHOT_SFX = 'boss_shot';
const BEAM_SFX = 'boss_beam';
const SKULL_LAUNCH_SFX = 'ab_blackhole_open';
const SKULL_HIT_SFX = 'breach';
const SKULL_POP_SFX = 'boss_skull_pop';

type Image = Phaser.GameObjects.Image;

/** Half-width of a hazard on the paddle line, in px. */
function radiusOf(spec: HazardSpec): number {
  if (spec.kind === 'skull') return SKULL_RADIUS;
  if (spec.kind === 'slag') return SLAG_RADIUS;
  return SHOT_RADIUS;
}

/** Degrees from (`toX`, `toY`) back toward (`fromX`, `fromY`): the way a trail streams. */
function angleBack(fromX: number, fromY: number, toX: number, toY: number): number {
  return Phaser.Math.RadToDeg(Math.atan2(fromY - toY, fromX - toX));
}

/** One hazard of the armed plan, with everything drawn for it. */
interface Entry {
  spec: HazardSpec;
  /** When its warning completes, in ms after the live window opens: it lands, or the beam fires. */
  due: number;
  /**
   * `warned` until its `at`, then `out` (in flight, or firing) until it is `done`. Caught slag is
   * `back` while it flies home.
   */
  stage: 'warned' | 'out' | 'back' | 'done';
  /** Caught slag: when it was caught, in ms into the live window, where from, and at which part. */
  caughtAt?: number;
  caughtX?: number;
  target?: string;
  /** When the glob last dropped a spark, in ms into the live window. */
  trailAt?: number;
  /** Where a shot or skull set off from. */
  fromX: number;
  fromY: number;
  /** A beam has had its one effect. */
  struck: boolean;
  /** The cross or skull on the paddle line. */
  mark?: Image;
  /** Closes in on the mark. */
  ring?: Image;
  /** The timing strip: its empty track, and the fill that runs along it. */
  track?: Image;
  fill?: Image;
  /** The shot or skull in flight. */
  body?: Image;
  /** A beam's column. */
  column?: Image;
  light?: Light;
  /** What streams off the shot, skull or glob in flight, on Medium and High. */
  trail?: FxHandle;
}

/**
 * What a boss's attacks throw: shots, beams and skulls, and the warnings that come before them.
 * Nothing here has a physics body. Each hazard is drawn from its plan and moved by the fight
 * clock, and whether it found the paddle is arithmetic on the paddle line when it gets there.
 */
export class HazardSystem {
  /** The armed plan's hazards. Empty between attacks. */
  private readonly entries: Entry[] = [];
  private readonly idleImages: Image[] = [];
  private readonly idleRects: Image[] = [];
  /** Everything the pools ever made, in use or idle, so it can all be taken off the scene. */
  private readonly made: Image[] = [];
  /** Fight-clock time since the wind-up began, in ms. It waits at the wind-up's end for `go`. */
  private elapsed = 0;
  private windupMs = 0;
  private live = false;
  /** The armed plan was warned of under reduced motion: its markers hold still. */
  private still = false;
  /** Lights alive now. */
  private lit = 0;
  private color = 0xffffff;

  constructor(private host: HazardHost) {}

  /** Hazards of the armed plan that are not over yet, warned of or out. */
  get count(): number {
    let n = 0;
    for (const e of this.entries) if (e.stage !== 'done') n++;
    return n;
  }

  /** A wind-up began: show where and when everything in the plan will land. */
  arm(plan: AttackPlan, windupMs: number): void {
    this.clear();
    this.color = theme().palette.danger;
    this.still = calm();
    this.windupMs = Math.max(0, windupMs);
    for (const spec of plan.hazards) {
      const e = this.warn(spec);
      this.entries.push(e);
      this.close(e);
    }
  }

  /** The live window opened: `at` times count from now. */
  go(): void {
    this.elapsed = this.windupMs;
    this.live = true;
  }

  /** `dt` is fight-clock milliseconds. */
  update(dt: number): void {
    const { entries } = this;
    if (entries.length === 0) return;
    this.elapsed = this.live ? this.elapsed + dt : Math.min(this.elapsed + dt, this.windupMs);
    const now = this.elapsed - this.windupMs;
    // By index, and with each effect applied last: a skull that takes a life clears the list.
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.stage === 'done') continue;
      this.close(e);
      if (!this.live) continue;
      if (e.stage === 'warned' && now >= e.spec.at) this.launch(e);
      if (e.stage === 'out' || e.stage === 'back') this.advance(e, now);
    }
  }

  /** Takes everything off the field at once, markers included. */
  clear(): void {
    for (const e of this.entries) this.finish(e);
    this.entries.length = 0;
    this.elapsed = 0;
    this.live = false;
  }

  destroy(): void {
    this.clear();
    for (const o of this.made) o.destroy();
    this.made.length = 0;
    this.idleImages.length = 0;
    this.idleRects.length = 0;
  }

  /** Puts a hazard's warning on the paddle line. */
  private warn(spec: HazardSpec): Entry {
    const line = this.host.paddle.y;
    const strip = line + STRIP_DROP;
    const e: Entry = {
      spec,
      due: spec.kind === 'beam' ? spec.at : spec.at + spec.flightMs,
      stage: 'warned',
      fromX: spec.x,
      fromY: HUD_HEIGHT,
      struck: false,
    };
    if (spec.kind === 'beam') {
      // The column runs from the top wall down to its strip under the paddle.
      e.column = this.rect(COLUMN_DEPTH, 0.5, 0)
        .setPosition(spec.x, HUD_HEIGHT)
        .setDisplaySize(spec.width, strip - HUD_HEIGHT)
        .setAlpha(COLUMN_FAINT);
      this.strip(e, spec.x, strip, spec.width);
      return e;
    }
    const skull = spec.kind === 'skull';
    const slag = spec.kind === 'slag';
    const size = skull ? SKULL_MARK_SIZE : SHOT_MARK_SIZE;
    if (slag) {
      // Where a glob lands is marked with the glob itself, faint, so gold always means "catch".
      e.mark = this.image(this.host.looks?.slag ?? 'hazard_shot', MARK_DEPTH)
        .setTint(SLAG_COLOR)
        .setPosition(spec.x, line)
        .setDisplaySize(SLAG_SIZE * 0.55, SLAG_SIZE * 0.55)
        .setAlpha(MARK_ALPHA * 0.8);
      if (this.host.looks?.slag) e.mark.clearTint();
    } else {
      e.mark = this.image(skull ? 'hazard_skull' : 'hazard_mark', MARK_DEPTH)
        .setPosition(spec.x, line)
        .setDisplaySize(size, size)
        .setAlpha(MARK_ALPHA);
    }
    const end = this.ringEnd(spec);
    e.ring = this.image('ring', MARK_DEPTH).setPosition(spec.x, line).setDisplaySize(end, end);
    if (slag) e.ring.setTint(SLAG_COLOR);
    // A ring that holds still says where but not when, so a strip says when.
    if (this.still) this.strip(e, spec.x, strip, end);
    return e;
  }

  /** A timing strip under the paddle line, `width` px wide and centred on `x`. */
  private strip(e: Entry, x: number, y: number, width: number): void {
    e.track = this.rect(MARK_DEPTH, 0.5, 0.5)
      .setPosition(x, y)
      .setDisplaySize(width, STRIP_HEIGHT)
      .setAlpha(TRACK_ALPHA);
    e.fill = this.rect(MARK_DEPTH, 0, 0.5)
      .setPosition(x - width / 2, y)
      .setDisplaySize(width, STRIP_HEIGHT)
      .setAlpha(FILL_ALPHA);
  }

  /** Width of a shot's or skull's warning ring as it completes, in px. */
  private ringEnd(spec: HazardSpec): number {
    return 2 * (radiusOf(spec) + RING_MARGIN);
  }

  /** Closes a warning in: it completes exactly as its hazard lands, or its beam fires. */
  private close(e: Entry): void {
    const whole = this.windupMs + e.due;
    const done = whole > 0 ? Phaser.Math.Clamp(this.elapsed / whole, 0, 1) : 1;
    if (e.fill && e.track) e.fill.displayWidth = done * e.track.displayWidth;
    if (!e.ring || this.still) return;
    const end = this.ringEnd(e.spec);
    if (e.stage === 'back') return;
    const width = end + RING_LEAD * (1 - done);
    e.ring
      .setDisplaySize(width, width)
      .setAlpha(Phaser.Math.Linear(RING_ALPHA[0], RING_ALPHA[1], done));
  }

  /** A hazard's `at` has come: a shot or skull sets off, a beam fires. */
  private launch(e: Entry): void {
    const { spec } = e;
    const { host } = this;
    e.stage = 'out';
    if (spec.kind === 'beam') {
      e.column?.setAlpha(COLUMN_BRIGHT);
      audio.sfx(BEAM_SFX, 0.4, 0, { x: spec.x });
      if (e.column && this.lit < MAX_LIGHTS) {
        e.light = host.lighting.addLight({
          x: spec.x - spec.width / 2,
          y: HUD_HEIGHT,
          area: { width: spec.width, height: e.column.displayHeight },
          color: this.color,
          intensity: BEAM_LIGHT,
          priority: LIGHT_PRIORITY,
        });
        this.lit++;
      }
      return;
    }
    // A part that has left the field still fires: from the top wall, straight above the landing.
    const from = host.partPos(spec.from);
    if (from) {
      e.fromX = from.x;
      e.fromY = from.y;
    }
    const skull = spec.kind === 'skull';
    if (spec.kind === 'slag') {
      const key = host.looks?.slag;
      const glob = this.image(key ?? 'hazard_shot', HAZARD_DEPTH)
        .setPosition(e.fromX, e.fromY)
        .setDisplaySize(SLAG_SIZE * 0.8, SLAG_SIZE);
      if (key) glob.clearTint();
      else glob.setTint(SLAG_COLOR);
      e.body = glob;
      e.trailAt = spec.at;
      this.follow(e, 'boss.hazard_trail');
      audio.sfx(SLAG_TOSS_SFX, 0.4, 0, { x: e.fromX });
      if (this.lit < MAX_LIGHTS) {
        e.light = host.lighting.addLight({
          follow: glob,
          radius: SLAG_LIGHT_RADIUS,
          color: SLAG_COLOR,
          intensity: SLAG_LIGHT,
          priority: LIGHT_PRIORITY,
        });
        this.lit++;
      }
      return;
    }
    const shotKey = skull ? undefined : host.looks?.shot;
    const body = this.image(skull ? 'hazard_skull' : (shotKey ?? 'hazard_shot'), HAZARD_DEPTH);
    body.setPosition(e.fromX, e.fromY);
    e.body = body;
    if (shotKey) {
      // A boss's own dart is drawn pointing down, and is red already: it keeps a little of its paint.
      body
        .setTint(0xff9a8a)
        .setDisplaySize(2 * SHOT_RADIUS * 1.1, SHOT_LENGTH * 1.25)
        .setRotation(Math.atan2(host.paddle.y - e.fromY, spec.x - e.fromX) - Math.PI / 2);
      this.follow(e, 'weapon.exhaust', 0.7);
      audio.sfx(SHOT_SFX, 0.35, 0, { x: e.fromX });
      return;
    }
    if (!skull) {
      // A dart faces where it flies. It is set once, so nothing turns in flight.
      body
        .setDisplaySize(SHOT_LENGTH, 2 * SHOT_RADIUS)
        .setRotation(Math.atan2(host.paddle.y - e.fromY, spec.x - e.fromX));
      this.follow(e, 'weapon.exhaust', 0.7);
      audio.sfx(SHOT_SFX, 0.35, 0, { x: e.fromX });
      return;
    }
    // A skull stays upright and steady all the way down: coins spin and pickups rock.
    body.setDisplaySize(SKULL_SIZE, SKULL_SIZE);
    this.follow(e, 'ability.meteor_trail', 0.6);
    audio.sfx(SKULL_LAUNCH_SFX, 0.45, 0, { x: e.fromX });
    if (this.lit < MAX_LIGHTS) {
      e.light = host.lighting.addLight({
        follow: body,
        radius: SKULL_LIGHT_RADIUS,
        color: this.color,
        intensity: SKULL_LIGHT,
        priority: LIGHT_PRIORITY,
      });
      this.lit++;
    }
  }

  /** Moves a hazard that is out to where `now` (ms into the live window) puts it, and ends it. */
  private advance(e: Entry, now: number): void {
    const { spec } = e;
    const { paddle, juice } = this.host;
    if (spec.kind === 'beam') {
      if (now >= spec.at + spec.liveMs) {
        this.finish(e);
        return;
      }
      if (e.struck || Math.abs(spec.x - paddle.x) > paddle.halfWidth + spec.width / 2) return;
      // Once for each beam, on the first frame the paddle is under it.
      e.struck = true;
      const half = spec.width / 2;
      this.apply(spec.onPaddle, Phaser.Math.Clamp(paddle.x, spec.x - half, spec.x + half));
      return;
    }
    if (spec.kind === 'slag') {
      this.advanceSlag(e, spec, now);
      return;
    }
    const flown = (now - spec.at) / spec.flightMs;
    if (flown < 1) {
      const x = Phaser.Math.Linear(e.fromX, spec.x, flown);
      const y = Phaser.Math.Linear(e.fromY, paddle.y, flown);
      e.body?.setPosition(x, y);
      // The ball breaks a skull it meets, so the one thing that can save it never costs a life.
      if (spec.kind === 'skull' && this.met(x, y)) {
        this.finish(e);
        juice.burst(x, y, this.color, POP_SPARKS);
        juice.ring(x, y, this.color, POP_RING);
        audio.sfx(SKULL_POP_SFX, 0.5, 0, { x });
      }
      return;
    }
    // It has landed. Its pictures go back first: what it does next may clear every hazard.
    this.finish(e);
    const radius = radiusOf(spec);
    if (Math.abs(spec.x - paddle.x) > paddle.halfWidth + radius) {
      juice.sparkle(spec.x, paddle.y, this.color, MISS_SPARKS);
      return;
    }
    if (spec.kind === 'shot') {
      this.apply(spec.onPaddle, spec.x);
      return;
    }
    juice.burst(spec.x, paddle.y, this.color, SKULL_SPARKS);
    audio.sfx(SKULL_HIT_SFX, 0.5);
    this.host.hurt();
  }

  /**
   * A glob of slag: it falls tumbling with a trail of sparks, then is caught or splashes. A
   * caught one flies back up at its part and strikes it.
   */
  private advanceSlag(e: Entry, spec: Extract<HazardSpec, { kind: 'slag' }>, now: number): void {
    const { paddle, juice } = this.host;
    const body = e.body;
    if (e.stage === 'back') {
      const target = e.target ? this.host.partPos(e.target) : undefined;
      const t = (now - e.caughtAt!) / SLAG_RETURN_MS;
      if (!target) {
        this.finish(e);
        return;
      }
      if (t < 1) {
        const k = t * t;
        const x = Phaser.Math.Linear(e.caughtX!, target.x, k);
        const y = Phaser.Math.Linear(paddle.y, target.y, k);
        body?.setPosition(x, y).setRotation(body.rotation - 0.4);
        e.trail?.set({ angle: angleBack(x, y, target.x, target.y) });
        this.trail(e, now, x, y);
        return;
      }
      this.finish(e);
      if (!this.host.returned(e.target!, spec.hits)) return;
      this.host.fx.play('boss.part_break', target.x, target.y, { tint: SLAG_COLOR, scale: 0.7, bare: true });
      juice.popText(target.x, target.y - WORD_LIFT, 'CRACK!', css(SLAG_COLOR), WORD_SIZE + 4, 1.3);
      audio.sfx(SLAG_RETURN_SFX, 0.55, 0, { x: target.x });
      return;
    }
    const flown = (now - spec.at) / spec.flightMs;
    if (flown < 1) {
      // A lob: it drops slow, then fast, as a thrown thing falls.
      const k = flown * flown * 0.35 + flown * 0.65;
      const x = Phaser.Math.Linear(e.fromX, spec.x, flown);
      const y = Phaser.Math.Linear(e.fromY, paddle.y, k);
      body?.setPosition(x, y);
      if (body && !this.still) body.setRotation(2 * Math.PI * SLAG_SPIN * ((now - spec.at) / 1000));
      this.trail(e, now, x, y);
      return;
    }
    if (Math.abs(spec.x - paddle.x) > paddle.halfWidth + SLAG_RADIUS) {
      this.finish(e);
      this.splash(spec.x, paddle.y);
      return;
    }
    // Caught: it goes back at the first part that still stands.
    const target = spec.returnTo.find((id) => this.host.partPos(id));
    juice.sparkle(spec.x, paddle.y, SLAG_COLOR, HIT_SPARKS);
    audio.sfx(SLAG_CATCH_SFX, 0.5, 0, { x: spec.x });
    if (!target) {
      this.finish(e);
      return;
    }
    e.stage = 'back';
    e.target = target;
    e.caughtAt = now;
    e.caughtX = spec.x;
    for (const img of [e.mark, e.ring]) img?.setVisible(false);
  }

  /**
   * Streams `id` off a hazard's body from where it sets off, pointed back along its flight to the
   * paddle line. Low tier and reduced motion go without.
   */
  private follow(e: Entry, id: string, scale = 1): void {
    if (this.still || !e.body || fxTier() === 'low') return;
    const angle = angleBack(e.fromX, e.fromY, e.spec.x, this.host.paddle.y);
    e.trail = this.host.fx.attach(id, e.body, { angle, scale });
  }

  /** A spark off a glob in flight, every SLAG_TRAIL_MS, where it has no trail of its own. */
  private trail(e: Entry, now: number, x: number, y: number): void {
    if (e.trail || this.still || now - (e.trailAt ?? 0) < SLAG_TRAIL_MS) return;
    e.trailAt = now;
    this.host.juice.sparkle(x, y, SLAG_COLOR, 1);
  }

  /** A missed glob splashes on the paddle line and is gone. Harmless. */
  private splash(x: number, y: number): void {
    const { scene, fx, looks } = this.host;
    fx.play('boss.slag_splash', x, y);
    audio.sfx(SLAG_SPLASH_SFX, 0.4, 0, { x });
    if (!looks?.splash || !scene.textures.exists(looks.splash)) return;
    const img = scene.add
      .image(x, y, looks.splash)
      .setDepth(MARK_DEPTH)
      .setDisplaySize(SPLASH_SIZE, SPLASH_SIZE)
      .setOrigin(0.5, 0.75);
    scene.tweens.add({
      targets: img,
      alpha: 0,
      scaleX: img.scaleX * 1.25,
      scaleY: img.scaleY * 0.7,
      duration: SPLASH_MS,
      ease: 'Sine.In',
      onComplete: () => img.destroy(),
    });
  }

  /** Whether a ball in flight is within reach of a skull at this point. */
  private met(x: number, y: number): boolean {
    for (const ball of this.host.balls()) {
      if (!ball.active || ball.attached) continue;
      const dx = ball.x - x;
      const dy = ball.y - y;
      if (dx * dx + dy * dy <= SKULL_POP_RADIUS * SKULL_POP_RADIUS) return true;
    }
    return false;
  }

  /**
   * A shot or beam found the paddle. `x` is where on the line the sparks fly. The hit is said
   * four ways, a jolt, a light, a word and a sound, so nobody has to guess what it did.
   */
  private apply(effect: PaddleEffect, x: number): void {
    const { paddle, juice, lighting } = this.host;
    const jam = effect.kind === 'jam';
    juice.sparkle(x, paddle.y, this.color, HIT_SPARKS);
    juice.shake(HIT_SHAKE_MS, HIT_SHAKE);
    juice.popText(
      paddle.x,
      paddle.y - WORD_LIFT,
      jam ? 'JAMMED' : 'SHRUNK',
      css(this.color),
      WORD_SIZE,
    );
    lighting.flash(x, paddle.y, this.color, HIT_LIGHT_RADIUS, HIT_LIGHT_MS);
    audio.sfx(HIT_SFX, 0.5, 0, { x });
    if (jam) {
      paddle.jam(effect.ms);
      audio.sfx(JAM_SFX, 0.5, 0, { x });
    } else {
      paddle.resize(effect.factor);
      audio.sfx(SHRINK_SFX, 0.4, 0, { x });
    }
  }

  /** A hazard is over: everything drawn for it goes back to the pools. */
  private finish(e: Entry): void {
    if (e.stage === 'done') return;
    e.stage = 'done';
    for (const img of [e.mark, e.ring, e.body]) {
      if (!img) continue;
      img.setVisible(false);
      this.idleImages.push(img);
    }
    for (const rect of [e.track, e.fill, e.column]) {
      if (!rect) continue;
      rect.setVisible(false);
      this.idleRects.push(rect);
    }
    if (e.light) {
      e.light.kill();
      this.lit--;
    }
    e.mark = undefined;
    e.ring = undefined;
    e.body = undefined;
    e.track = undefined;
    e.fill = undefined;
    e.column = undefined;
    e.light = undefined;
    e.trail?.stop();
    e.trail = undefined;
  }

  /** An image from the pool, in the danger colour and reset to plain. */
  private image(key: string, depth: number): Image {
    let img = this.idleImages.pop();
    if (!img) {
      img = this.host.scene.add.image(0, 0, key);
      this.made.push(img);
    }
    return img
      .setTexture(key)
      .setDepth(depth)
      .setTint(this.color)
      .setRotation(0)
      .setAlpha(1)
      .setVisible(true);
  }

  /** A flat rectangle from the pool, in the danger colour, with its origin at (`ox`, `oy`). Size it after. */
  private rect(depth: number, ox: number, oy: number): Image {
    let rect = this.idleRects.pop();
    if (!rect) {
      rect = solid(this.host.scene, 0, 0, 1, 1, this.color);
      this.made.push(rect);
    }
    return rect
      .setTint(this.color)
      .setOrigin(ox, oy)
      .setDepth(depth)
      .setAlpha(1)
      .setVisible(true);
  }
}
