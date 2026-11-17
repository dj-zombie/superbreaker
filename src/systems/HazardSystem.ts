import Phaser from 'phaser';
import { HUD_HEIGHT } from '../config';
import {
  SHOT_RADIUS,
  SKULL_POP_RADIUS,
  SKULL_RADIUS,
  type AttackPlan,
  type HazardSpec,
  type PaddleEffect,
} from '../core/Boss';
import type { Ball } from '../entities/Ball';
import type { Paddle } from '../entities/Paddle';
import { calm, css, theme } from '../ui/theme';
import { audio } from './AudioSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { Light, LightingSystem } from './LightingSystem';

/** What the hazards need from the fight. Built from closures, like every host. */
export interface HazardHost {
  readonly scene: Phaser.Scene;
  readonly juice: JuiceSystem;
  readonly lighting: LightingSystem;
  readonly paddle: Paddle;
  /** Centre of a part now, or undefined once it has left the field. */
  partPos(id: string): { x: number; y: number } | undefined;
  /** Every ball on the field, waiting on the paddle or in flight. */
  balls(): readonly Ball[];
  /** A skull landed on the paddle. */
  hurt(): void;
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
type Rect = Phaser.GameObjects.Rectangle;

/** One hazard of the armed plan, with everything drawn for it. */
interface Entry {
  spec: HazardSpec;
  /** When its warning completes, in ms after the live window opens: it lands, or the beam fires. */
  due: number;
  /** `warned` until its `at`, then `out` (in flight, or firing) until it is `done`. */
  stage: 'warned' | 'out' | 'done';
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
  track?: Rect;
  fill?: Rect;
  /** The shot or skull in flight. */
  body?: Image;
  /** A beam's column. */
  column?: Rect;
  light?: Light;
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
  private readonly idleRects: Rect[] = [];
  /** Everything the pools ever made, in use or idle, so it can all be taken off the scene. */
  private readonly made: Array<Image | Rect> = [];
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
      if (e.stage === 'out') this.advance(e, now);
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
        .setSize(spec.width, strip - HUD_HEIGHT)
        .setAlpha(COLUMN_FAINT);
      this.strip(e, spec.x, strip, spec.width);
      return e;
    }
    const skull = spec.kind === 'skull';
    const size = skull ? SKULL_MARK_SIZE : SHOT_MARK_SIZE;
    e.mark = this.image(skull ? 'hazard_skull' : 'hazard_mark', MARK_DEPTH)
      .setPosition(spec.x, line)
      .setDisplaySize(size, size)
      .setAlpha(MARK_ALPHA);
    const end = this.ringEnd(spec);
    e.ring = this.image('ring', MARK_DEPTH).setPosition(spec.x, line).setDisplaySize(end, end);
    // A ring that holds still says where but not when, so a strip says when.
    if (this.still) this.strip(e, spec.x, strip, end);
    return e;
  }

  /** A timing strip under the paddle line, `width` px wide and centred on `x`. */
  private strip(e: Entry, x: number, y: number, width: number): void {
    e.track = this.rect(MARK_DEPTH, 0.5, 0.5)
      .setPosition(x, y)
      .setSize(width, STRIP_HEIGHT)
      .setAlpha(TRACK_ALPHA);
    e.fill = this.rect(MARK_DEPTH, 0, 0.5)
      .setPosition(x - width / 2, y)
      .setSize(width, STRIP_HEIGHT)
      .setAlpha(FILL_ALPHA);
  }

  /** Width of a shot's or skull's warning ring as it completes, in px. */
  private ringEnd(spec: HazardSpec): number {
    return 2 * ((spec.kind === 'skull' ? SKULL_RADIUS : SHOT_RADIUS) + RING_MARGIN);
  }

  /** Closes a warning in: it completes exactly as its hazard lands, or its beam fires. */
  private close(e: Entry): void {
    const whole = this.windupMs + e.due;
    const done = whole > 0 ? Phaser.Math.Clamp(this.elapsed / whole, 0, 1) : 1;
    e.fill?.setScale(done, 1);
    if (!e.ring || this.still) return;
    const end = this.ringEnd(e.spec);
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
          area: { width: spec.width, height: e.column.height },
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
    const body = this.image(skull ? 'hazard_skull' : 'hazard_shot', HAZARD_DEPTH);
    body.setPosition(e.fromX, e.fromY);
    e.body = body;
    if (!skull) {
      // A dart faces where it flies. It is set once, so nothing turns in flight.
      body
        .setDisplaySize(SHOT_LENGTH, 2 * SHOT_RADIUS)
        .setRotation(Math.atan2(host.paddle.y - e.fromY, spec.x - e.fromX));
      audio.sfx(SHOT_SFX, 0.35, 0, { x: e.fromX });
      return;
    }
    // A skull stays upright and steady all the way down: coins spin and pickups rock.
    body.setDisplaySize(SKULL_SIZE, SKULL_SIZE);
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
    const radius = spec.kind === 'skull' ? SKULL_RADIUS : SHOT_RADIUS;
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

  /** A rectangle from the pool, in the danger colour, with its origin at (`ox`, `oy`). */
  private rect(depth: number, ox: number, oy: number): Rect {
    let rect = this.idleRects.pop();
    if (!rect) {
      rect = this.host.scene.add.rectangle(0, 0, 1, 1);
      this.made.push(rect);
    }
    return rect
      .setFillStyle(this.color)
      .setOrigin(ox, oy)
      .setDepth(depth)
      .setScale(1)
      .setAlpha(1)
      .setVisible(true);
  }
}
