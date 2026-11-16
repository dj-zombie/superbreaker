import Phaser from 'phaser';
import {
  ABILITY_INFO,
  ARENA_MID,
  HUD_HEIGHT,
  PADDLE_Y,
  WIDE,
  WIDTH,
  skillPositions,
  slotPositions,
} from '../config';
import type { AbilityId } from '../core/Abilities';
import { KEY_BINDINGS } from '../core/KeyLayout';
import { Onboarding, helpfulPickup, pathToLine, type OnboardingStep, type Point } from '../core/Onboarding';
import { SKILL_IDS, type SkillId } from '../core/Skills';
import type { PowerupId } from '../core/types';
import { BALL_SIZE, type Ball } from '../entities/Ball';
import type { Paddle } from '../entities/Paddle';
import { controlDevice, onInputSource, onPadButton, PadButton, type ControlDevice } from '../platform/gamepad';
import { keyLabel, onKeyLabels, skillKeyLabel, slotKeyLabel } from '../platform/keyboard';
import { save } from '../services';
import { Button } from '../ui/Button';
import { fadeTexture, framePanel, glowLineTexture } from '../ui/frames';
import { icon, iconTexture, type IconName } from '../ui/icons';
import { Keycap } from '../ui/Keycap';
import { disc, ring } from '../ui/shapes';
import { calm, css, theme, type UiTheme } from '../ui/theme';
import { body, glowWord, label } from '../ui/type';
import { Meter } from '../ui/widgets';
import type { SlotState } from './AbilitySystem';
import { audio } from './AudioSystem';
import type { InputSystem } from './InputSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { Pickup } from './PowerupSystem';

export interface CoachHost {
  scene: Phaser.Scene;
  input: InputSystem;
  juice: JuiceSystem;
  paddle: Paddle;
  /** Every ball, held or in flight. */
  balls(): readonly Ball[];
  /** Pickups still falling. */
  pickups(): readonly Pickup[];
  slots(): readonly SlotState[];
  /** Rolls an ability into a free slot through the usual roulette. */
  grantAbility(): void;
  /** The skill is charged and free to fire. */
  skillReady(id: SkillId): boolean;
  /** Fills a skill's charge, so the tutorial can show it without the wait. */
  chargeSkill(id: SkillId): void;
}

/** Where the demo hand is and whether it is mid-tap. Its fingertip is at (x, y). */
export interface CoachHand {
  x: number;
  y: number;
  tap: boolean;
}

/** Above the field and the ball, under the level banner. */
const DEPTH = 19;
/** Over the pickups, for the catch guide. */
const CATCH_DEPTH = 7;
/** Over the bricks and trails but under the balls and pickups, so a freeze dims all but what matters. */
const SHADE_DEPTH = 4.5;
const SHADE_ALPHA = 0.6;
const SHADE_FADE = 50;
const SKIP_W = 170;
const SKIP_H = 44;
/** Panel centre, above the ball and its aim arrow. */
const PANEL_DY = -165;
const PANEL_H = 76;
const METER_DY = -112;
/** The move and launch captions, over their panels. */
const CAPTION_DY = PANEL_DY - PANEL_H / 2 - 26;
/** How far the demo paddle sweeps either side of centre. */
const SWEEP = 110;
const TAP_MS = 900;
const GUIDE_DOTS = 6;
/** The demo hand rests just under the paddle, where the thumb drags and taps. */
const HAND_DY = 34;
/** A falling ball this close above the paddle stops play for the guard step. */
const GUARD_RANGE = 240;
/** The line a ball has to stay above, just under the paddle. */
const LINE_DY = 22;
const PATH_DOTS = 16;
/** A pickup this close to the paddle is left alone: there is no time to point at it. */
const CATCH_ROOM = 160;
/** The paddle counts as under its target within this share of its half width. */
const UNDER = 0.6;
/** The ability step lets the catch step's cheer settle before it hands out an ability. */
const GIFT_DELAY_MS = 600;
/** After this long without a safe moment, the ability step points at the slot anyway. */
const SAFE_WAIT_MS = 6_000;
/** A skill step lets the last step's ability or gun burst play out before it charges its skill. */
const SKILL_DELAY_MS = 2_000;
/** Bullet time stops play on a falling ball at least this far above the paddle, so the slowdown has room to show. */
const SLOWMO_ROOM = 120;
const CALLOUT_W = 470;
const CALLOUT_H = 92;

/** Centres for a row of widths and the gaps between them, laid out around 0, and its width. */
function layoutRow(widths: readonly number[], gaps: readonly number[]): { xs: number[]; width: number } {
  const width = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  let x = -width / 2;
  const xs = widths.map((w, i) => {
    const c = x + w / 2;
    x += w + (gaps[i] ?? 0);
    return c;
  });
  return { xs, width };
}

/** The point `d` along a path of corners, or its end. */
function along(points: readonly Point[], d: number): Point {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= seg) {
      const f = seg > 0 ? d / seg : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    d -= seg;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

/** Scales a shape to `f` times the size it was made at; shapes are painted large and shown scaled down. */
function resize(img: Phaser.GameObjects.Image, f: number): Phaser.GameObjects.Image {
  let base = img.getData('base') as number | undefined;
  if (base === undefined) {
    base = img.scale;
    img.setData('base', base);
  }
  return img.setScale(base * f);
}

/** Padding either side of a panel's row. */
const PANEL_PAD = 20;

interface CapBinding {
  cap: Keycap;
  code: string;
  /** -1 moves left, 1 moves right, 0 launches. */
  dir: -1 | 0 | 1;
}

/** What a freeze points at, drawn over the shade. */
interface Focus {
  /** Where the paddle should go, for the guard and catch steps. */
  targetX: number | null;
  ghost?: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Image;
  path: Point[];
  dots: Phaser.GameObjects.Image[];
  cap?: Keycap;
}

/**
 * The first-play tutorial over level 1. It shows the player's own controls (hand, mouse and keys,
 * or stick and D-pad) with a line of words: move, then launch. Then it stops play five times and waits for
 * the player each time: under a falling ball, under a falling powerup, on an ability slot, on the
 * gun, and on bullet time as a ball comes down. Skip ends it at any time.
 */
export class OnboardingCoach {
  private readonly flow = new Onboarding();
  private readonly scene: Phaser.Scene;
  private readonly t: UiTheme;
  /** The move and launch pictures, on the paddle line. */
  private readonly layer: Phaser.GameObjects.Container;
  /** A freeze's words and markers, in field coordinates. */
  private readonly stage: Phaser.GameObjects.Container;
  private readonly catchLayer: Phaser.GameObjects.Container;
  private readonly shade: Phaser.GameObjects.Container;
  private readonly skipButton: Button;
  private readonly offs: Array<() => void> = [];
  private device: ControlDevice;
  private built: string | null = null;
  private clock = 0;
  /** Time since the current step began. */
  private stepClock = 0;
  private lastPaddleX: number | null = null;
  private handPose: CoachHand | null = null;

  private ghost?: Phaser.GameObjects.Image;
  private mouse?: Phaser.GameObjects.Image;
  private mouseX = 0;
  private stick?: Keycap;
  private stickX = 0;
  private chevrons: Phaser.GameObjects.Image[] = [];
  private caps: CapBinding[] = [];
  private meter?: Meter;
  private launchRing?: Phaser.GameObjects.Image;

  private focus: Focus = { targetX: null, path: [], dots: [] };
  /** The guard step's line, from its freeze to the end of the step. */
  private line?: Phaser.GameObjects.Container;
  private focusBall?: Ball;
  private watched?: Pickup;
  private guide?: {
    ring: Phaser.GameObjects.Image;
    word: Phaser.GameObjects.Text;
    dots: Phaser.GameObjects.Image[];
    arrow: Phaser.GameObjects.Image;
  };
  private focusSlot: number | null = null;
  private granted = false;
  private charged: SkillId | null = null;

  constructor(private readonly host: CoachHost) {
    const scene = (this.scene = host.scene);
    this.t = theme();
    this.device = controlDevice();
    this.layer = scene.add.container(0, PADDLE_Y).setDepth(DEPTH);
    this.stage = scene.add.container(0, 0).setDepth(DEPTH);
    this.catchLayer = scene.add.container(0, 0).setDepth(CATCH_DEPTH);
    this.shade = scene.add
      .container(0, 0, [
        scene.add.rectangle(WIDTH / 2, 0, WIDTH, 1, this.t.palette.base, SHADE_ALPHA).setOrigin(0.5, 0),
        scene.add.image(WIDTH / 2, 0, fadeTexture(scene)).setOrigin(0.5, 0).setAlpha(SHADE_ALPHA),
      ])
      .setDepth(SHADE_DEPTH)
      .setAlpha(0)
      .setVisible(false);

    const sx = WIDTH - 12 - SKIP_W / 2;
    const sy = HUD_HEIGHT + 14 + SKIP_H / 2;
    this.skipButton = new Button(scene, sx, sy, 'Skip tutorial', () => this.skip(), {
      width: SKIP_W,
      height: SKIP_H,
      variant: 'secondary',
      icon: 'next',
      fontSize: 15,
      t: this.t,
    }).setDepth(40);
    this.offs.push(
      host.input.addBlocker(
        (x, y) =>
          this.skipButton.visible &&
          Math.abs(x - this.skipButton.x) < SKIP_W / 2 + 6 &&
          Math.abs(y - this.skipButton.y) < SKIP_H / 2 + 6,
      ),
      onPadButton((button, down) => {
        if (down && button === PadButton.select && scene.scene.isActive()) this.skip();
      }),
      onInputSource((s) => {
        this.device = controlDevice(s);
        this.build();
      }),
      onKeyLabels(() => {
        this.built = null;
        this.build();
      }),
    );
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
    this.build();
  }

  get step(): OnboardingStep {
    return this.flow.step;
  }

  /** The tutorial is still running. */
  get active(): boolean {
    return !this.flow.done;
  }

  /** The serve waits while the player is shown how to move and launch. */
  get holdServe(): boolean {
    return this.flow.holdServe;
  }

  /** Play is stopped while the tutorial points something out and waits for the player. */
  get frozen(): boolean {
    return this.flow.frozen;
  }

  /** The touch demo's hand. The HUD draws it, since the deck it rests on covers this scene. */
  get hand(): CoachHand | null {
    return this.handPose;
  }

  /** The ability slot the tutorial is pointing at, for the HUD to light up. */
  get slot(): number | null {
    return this.flow.step === 'ability' && this.flow.frozen ? this.focusSlot : null;
  }

  /** The skill the tutorial is pointing at, for the HUD to light up. */
  get skill(): SkillId | null {
    return this.flow.frozen ? this.flow.skill : null;
  }

  /** Steps the tutorial. `held` is the ball waiting on the paddle, if any. */
  update(dt: number, held: Point | null): void {
    if (this.flow.done) return;
    this.clock += dt;
    this.stepClock += dt;
    if (this.flow.tick(dt)) this.stepChanged();
    const px = this.host.paddle.x;
    if (this.lastPaddleX !== null && this.flow.moved(px - this.lastPaddleX)) {
      this.cheer(this.device === 'touch' ? px : WIDTH / 2, PADDLE_Y + (this.device === 'touch' ? 0 : PANEL_DY));
      this.stepChanged();
    }
    this.lastPaddleX = px;
    this.layer.setY(PADDLE_Y);
    this.handPose = null;
    if (this.flow.step === 'move') this.animateMove();
    else if (this.flow.step === 'launch') this.animateLaunch(held);
    else if (this.flow.step === 'guard') this.updateGuard();
    else if (this.flow.step === 'catch') this.updateCatch();
    else if (this.flow.step === 'ability') this.updateAbility(held);
    else if (this.flow.skill) this.updateSkill(this.flow.skill, held);
  }

  /** The held ball launched. */
  launched(at: Point): void {
    if (!this.flow.launched()) return;
    this.cheer(at.x, at.y);
    this.stepChanged();
  }

  /** A ball came back to the paddle (`saved`), or the last one was lost. */
  ballReturned(saved: boolean): void {
    if (!this.flow.ballReturned()) return;
    if (saved) this.cheer(this.host.paddle.x, PADDLE_Y - 40);
    this.stepChanged();
  }

  /** A pickup reached the paddle. */
  pickupCaught(kind: PowerupId): void {
    if (!this.flow.pickupCaught(kind)) return;
    this.cheer(this.host.paddle.x, PADDLE_Y - 40);
    this.stepChanged();
  }

  /** An ability fired. */
  abilityFired(): void {
    if (!this.flow.abilityFired()) return;
    this.cheer(this.host.paddle.x, PADDLE_Y - 40);
    this.stepChanged();
  }

  /** A skill fired. */
  skillUsed(id: SkillId): void {
    if (!this.flow.skillUsed(id)) return;
    this.cheer(this.host.paddle.x, PADDLE_Y - 40);
    if (this.flow.done) this.end();
    else this.stepChanged();
  }

  /** The level is over; the tutorial has done its job either way. */
  finish(): void {
    if (this.flow.done) return;
    this.flow.skip();
    this.end();
  }

  skip(): void {
    if (this.flow.done) return;
    this.flow.skip();
    audio.sfx('ui_select', 0.45);
    this.end();
  }

  // ---------------------------------------------------------------- building

  /** A new step: clears what the last one left on screen and builds this one's pictures. */
  private stepChanged(): void {
    this.stepClock = 0;
    this.clearFocus();
    this.showShade(false);
    this.fadeOut(this.line);
    this.line = undefined;
    this.catchLayer.removeAll(true);
    this.guide = undefined;
    this.watched = undefined;
    this.focusBall = undefined;
    this.focusSlot = null;
    this.build();
  }

  /** Rebuilds the move or launch pictures for the current device. */
  private build(): void {
    const key = `${this.flow.step}:${this.device}`;
    if (key === this.built || this.flow.done) return;
    this.built = key;
    this.clearStep();
    if (this.flow.step === 'move') this.buildMove();
    else if (this.flow.step === 'launch') this.buildLaunch();
  }

  private clearStep(): void {
    this.layer.removeAll(true);
    this.handPose = null;
    this.ghost = this.mouse = this.stick = undefined;
    this.meter = this.launchRing = undefined;
    this.chevrons = [];
    this.caps = [];
  }

  private glyph(name: IconName, size: number, x = 0, y = 0): Phaser.GameObjects.Image {
    const img = icon(this.scene, x, y, name, size, this.t.palette.accentHi);
    this.layer.add(img);
    return img;
  }

  private addMouse(x: number): void {
    this.mouse = this.glyph('mouse', 44, x, PANEL_DY);
    this.mouseX = x;
  }

  private cap(label: string, x: number, y: number, code: string, dir: -1 | 0 | 1, width?: number): Keycap {
    const cap = new Keycap(this.scene, x, y, label, { size: 40, width, t: this.t });
    this.layer.add(cap);
    this.caps.push({ cap, code, dir });
    return cap;
  }

  private panel(width: number): void {
    const p = framePanel(this.scene, WIDTH / 2, PANEL_DY, width, PANEL_H, this.t, {
      variant: 'glass',
      shadow: false,
    });
    this.layer.add(p);
  }

  /** A line of words over the step's pictures, or in their place on touch. */
  private caption(text: string, y = CAPTION_DY): void {
    const c = body(this.scene, WIDTH / 2, y, text, 19, { t: this.t, wrap: WIDTH - 60 });
    this.layer.add(c.setStroke(css(this.t.palette.base), 5));
  }

  private buildMove(): void {
    const paddle = this.host.paddle;
    this.ghost = this.scene.add
      .image(WIDTH / 2, 0, paddle.texture.key, paddle.frame.name)
      .setDisplaySize(paddle.displayWidth, paddle.displayHeight)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.35);
    this.layer.add(this.ghost);
    const left = this.glyph('back', 28, WIDTH / 2 - SWEEP - paddle.displayWidth / 2 - 24);
    const right = this.glyph('back', 28, WIDTH / 2 + SWEEP + paddle.displayWidth / 2 + 24).setFlipX(true);
    this.chevrons = [left, right];

    if (this.device === 'pad') {
      this.caption('Move the paddle with the left stick or the D-pad');
      // The stick sways by 10 either side, so its slot is wider than the cap.
      const { xs, width } = layoutRow([62, 2, 44], [16, 16]);
      this.panel(width + PANEL_PAD * 2);
      const cx = WIDTH / 2;
      this.stickX = cx + xs[0]!;
      this.stick = new Keycap(this.scene, this.stickX, PANEL_DY, 'L', { size: 42, round: true, t: this.t });
      this.layer.add(this.stick);
      this.layer.add(this.scene.add.rectangle(cx + xs[1]!, PANEL_DY, 2, 44, this.t.palette.edge, 0.8));
      this.glyph('dpad', 44, cx + xs[2]!, PANEL_DY);
    } else if (this.device === 'desktop') {
      this.caption('Move the paddle with the mouse or the keys');
      const [aLeft, aRight] = [KEY_BINDINGS.left[0]!, KEY_BINDINGS.right[0]!];
      const [lLeft, lRight] = [KEY_BINDINGS.left[1]!, KEY_BINDINGS.right[1]!];
      // The mouse sways by 14 either side, so its slot is wider than the glyph.
      const { xs, width } = layoutRow([72, 2, 40, 40, 40, 40], [12, 18, 6, 16, 6]);
      this.panel(width + PANEL_PAD * 2);
      const cx = WIDTH / 2;
      this.addMouse(cx + xs[0]!);
      this.layer.add(this.scene.add.rectangle(cx + xs[1]!, PANEL_DY, 2, 44, this.t.palette.edge, 0.8));
      this.cap(keyLabel(aLeft), cx + xs[2]!, PANEL_DY, aLeft, -1);
      this.cap(keyLabel(aRight), cx + xs[3]!, PANEL_DY, aRight, 1);
      this.cap(keyLabel(lLeft), cx + xs[4]!, PANEL_DY, lLeft, -1);
      this.cap(keyLabel(lRight), cx + xs[5]!, PANEL_DY, lRight, 1);
    } else {
      this.caption('Drag anywhere to move the paddle', PANEL_DY);
    }
    this.meter = new Meter(this.scene, WIDTH / 2, METER_DY, 180, 6, this.flow.moveProgress, this.t.palette.accent);
    this.layer.add(this.meter);
    this.fadeIn(this.layer);
  }

  private buildLaunch(): void {
    this.launchRing = ring(this.scene, 0, 0, 22, 3, this.t.palette.accentHi);
    this.layer.add(this.launchRing);
    if (this.device === 'pad') {
      this.caption('Press A to launch the ball');
      this.panel(46 + PANEL_PAD * 2 + 40);
      const a = new Keycap(this.scene, WIDTH / 2, PANEL_DY, 'A', { size: 46, round: true, t: this.t });
      this.layer.add(a);
      this.caps.push({ cap: a, code: '', dir: 0 });
    } else if (this.device === 'desktop') {
      this.caption('Click or press Space to launch the ball');
      const space = KEY_BINDINGS.launch[0]!;
      const { xs, width } = layoutRow([44, 2, 120], [18, 18]);
      this.panel(width + PANEL_PAD * 2);
      const cx = WIDTH / 2;
      this.addMouse(cx + xs[0]!);
      this.layer.add(this.scene.add.rectangle(cx + xs[1]!, PANEL_DY, 2, 44, this.t.palette.edge, 0.8));
      this.cap(keyLabel(space), cx + xs[2]!, PANEL_DY, space, 0, 120);
    } else {
      this.caption('Tap to launch the ball', PANEL_DY);
    }
    this.fadeIn(this.layer);
  }

  private fadeIn(target: Phaser.GameObjects.Container): void {
    if (calm()) return;
    target.setAlpha(0);
    this.scene.tweens.add({ targets: target, alpha: 1, duration: 260 });
  }

  private fadeOut(target?: Phaser.GameObjects.Container): void {
    if (!target) return;
    if (calm()) {
      target.destroy();
      return;
    }
    this.scene.tweens.add({ targets: target, alpha: 0, duration: 220, onComplete: () => target.destroy() });
  }

  // ---------------------------------------------------------------- freezes

  private showShade(on: boolean): void {
    const shade = this.shade;
    this.scene.tweens.killTweensOf(shade);
    if (on) {
      // Down to just over the paddle, which stays lit, with a soft edge.
      const [fill, fade] = shade.list as [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Image];
      const edge = PADDLE_Y - 20 - SHADE_FADE;
      fill.setDisplaySize(WIDTH, Math.max(1, edge));
      fade.setY(edge).setDisplaySize(WIDTH, SHADE_FADE);
      shade.setVisible(true);
    }
    if (calm()) {
      shade.setAlpha(on ? 1 : 0).setVisible(on);
      return;
    }
    this.scene.tweens.add({
      targets: shade,
      alpha: on ? 1 : 0,
      duration: on ? 200 : 260,
      onComplete: () => shade.setVisible(on),
    });
  }

  /**
   * A glass panel with what to do and why, and the key or button to press if there is one. It
   * moves to the other side of `clearX` if it fits there, to keep out of the way of a guide.
   */
  private callout(
    y: number,
    head: string,
    line: string,
    opts: { cap?: { label: string; round?: boolean }; clearX?: number } = {},
  ): void {
    const t = this.t;
    const scene = this.scene;
    const { cap, clearX } = opts;
    const capW = cap ? 62 : 0;
    const wrap = CALLOUT_W - 48 - capW;
    const headText = body(scene, 0, -15, head, 21, { t, wrap });
    const lineText = label(scene, 0, 17, line, 13, { t, color: css(t.palette.accentHi), wrap });
    const w = Math.min(WIDTH - 24, Math.max(headText.width, lineText.width) + 48 + capW);
    let x = WIDTH / 2;
    if (clearX !== undefined) {
      const room = 40;
      const side = clearX > WIDTH / 2 ? (clearX - room) / 2 : (clearX + room + WIDTH) / 2;
      if (side - w / 2 >= 12 && side + w / 2 <= WIDTH - 12) x = side;
    }
    const box = scene.add.container(x, y);
    box.add(framePanel(scene, 0, 0, w, CALLOUT_H, t, { variant: 'glass', shadow: false }));
    if (cap) {
      const key = new Keycap(scene, -w / 2 + 24 + 23, 0, cap.label, { size: 46, round: cap.round, t });
      box.add(key);
      this.focus.cap = key;
      headText.setX(capW / 2);
      lineText.setX(capW / 2);
    }
    box.add([headText, lineText]);
    this.stage.add(box);
    if (calm()) return;
    box.setAlpha(0).setScale(0.92);
    scene.tweens.add({ targets: box, alpha: 1, scale: 1, duration: 240, ease: 'Back.Out' });
  }

  /** The paddle's twin where the paddle has to go. */
  private buildTarget(x: number): void {
    const paddle = this.host.paddle;
    const ghost = this.scene.add
      .image(x, PADDLE_Y, paddle.texture.key, paddle.frame.name)
      .setDisplaySize(paddle.displayWidth, paddle.displayHeight)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.t.palette.accentHi)
      .setAlpha(0.5);
    this.stage.add(ghost);
    this.focus.targetX = x;
    this.focus.ghost = ghost;
  }

  private focusRing(x: number, y: number, radius: number): void {
    this.focus.ring = ring(this.scene, x, y, radius, 3, this.t.palette.accentHi);
    this.stage.add(this.focus.ring);
  }

  private clearFocus(): void {
    const parts = this.stage.list.slice();
    this.stage.removeAll(false);
    for (const p of parts) {
      if (calm()) p.destroy();
      else this.scene.tweens.add({ targets: p, alpha: 0, duration: 200, onComplete: () => p.destroy() });
    }
    this.focus = { targetX: null, path: [], dots: [] };
  }

  /** The paddle is under `x`, close enough to catch what falls there. */
  private under(x: number): boolean {
    return Math.abs(this.host.paddle.x - x) <= this.host.paddle.halfWidth * UNDER;
  }

  /** Lights the target as the paddle reaches it, and lets play go once the words have had time. */
  private chaseTarget(): void {
    const x = this.focus.targetX;
    if (x === null) return;
    const there = this.under(x);
    const pulse = calm() ? 0.6 : 0.4 + 0.3 * Math.abs(Math.sin(this.clock / 260));
    this.focus.ghost?.setAlpha(there ? 0.95 : pulse);
    if (this.device === 'touch') this.handPose = this.dragPose(x);
    if (!there || !this.flow.release()) return;
    this.cheer(x, PADDLE_Y - 30);
    this.clearFocus();
    this.showShade(false);
  }

  /** The touch hand sliding from under the paddle toward `x`, over and over. */
  private dragPose(x: number): CoachHand {
    const px = this.host.paddle.x;
    const f = (this.clock % 1400) / 1400;
    const e = calm() ? 1 : Phaser.Math.Easing.Sine.InOut(Math.min(1, f / 0.7));
    return { x: px + (x - px) * e, y: PADDLE_Y + HAND_DY, tap: false };
  }

  private freezeSound(): void {
    audio.sfx('ui_pause', 0.35);
  }

  // ---------------------------------------------------------------- guard

  private updateGuard(): void {
    if (!this.flow.shown) {
      const ball = this.fallingBall();
      if (ball && this.flow.ballFalling()) this.freezeOnBall(ball);
      return;
    }
    if (this.flow.frozen) {
      this.chaseTarget();
      this.animatePath();
    }
    this.animateLine();
  }

  /** The lowest ball in flight heading down into the paddle's reach and still `room` above it, if any. */
  private fallingBall(room = 40): Ball | undefined {
    let best: Ball | undefined;
    for (const b of this.host.balls()) {
      if (b.attached || !b.active || b.body.velocity.y <= 0) continue;
      if (b.y < PADDLE_Y - GUARD_RANGE || b.y > PADDLE_Y - room) continue;
      if (!best || b.y > best.y) best = b;
    }
    return best;
  }

  private freezeOnBall(ball: Ball): void {
    const paddle = this.host.paddle;
    this.freezeSound();
    this.showShade(true);
    this.buildLine();
    const land = this.traceBall(ball);
    this.buildTarget(Phaser.Math.Clamp(land.x, paddle.halfWidth, WIDTH - paddle.halfWidth));
    this.callout(PADDLE_Y - GUARD_RANGE - 100, 'Keep at least one ball above the line', 'Move under the ball to keep it in play');
  }

  /** Rings the ball and marches dots down its path to the paddle. Returns where it will land. */
  private traceBall(ball: Ball): Point {
    const r = BALL_SIZE / 2;
    const top = PADDLE_Y - this.host.paddle.displayHeight / 2 - r;
    const v = ball.body.velocity;
    const from = { x: ball.x, y: ball.y };
    this.focus.path = pathToLine(from, v.x, v.y, top, r, WIDTH - r) ?? [from, { x: from.x, y: top }];
    this.focusBall = ball;
    this.focus.dots = Array.from({ length: PATH_DOTS }, () => disc(this.scene, 0, 0, 3, this.t.palette.accentHi, 0.85));
    this.stage.add(this.focus.dots);
    this.focusRing(ball.x, ball.y, BALL_SIZE);
    this.animatePath();
    return this.focus.path[this.focus.path.length - 1]!;
  }

  /** The line under the paddle that a ball is lost past. */
  private buildLine(): void {
    const scene = this.scene;
    const color = this.t.palette.danger;
    const y = PADDLE_Y + LINE_DY;
    const glow = scene.add
      .image(WIDTH / 2, y, glowLineTexture(scene))
      .setDisplaySize(WIDTH, 16)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = scene.add.rectangle(WIDTH / 2, y, WIDTH, 2, color, 0.95);
    this.line = scene.add.container(0, 0, [glow, core]).setDepth(DEPTH - 1);
    this.fadeIn(this.line);
  }

  private animateLine(): void {
    const glow = this.line?.list[0] as Phaser.GameObjects.Image | undefined;
    if (!glow || calm()) return;
    glow.setAlpha(0.6 + 0.4 * Math.abs(Math.sin(this.clock / 300)));
  }

  /** Dots marching along the ball's path down to the paddle. */
  private animatePath(): void {
    const { path, dots } = this.focus;
    if (path.length < 2) return;
    const length = pathLength(path);
    const march = calm() ? 0.5 : (this.clock / 600) % 1;
    dots.forEach((d, i) => {
      const p = along(path, ((i + march) / dots.length) * length);
      d.setPosition(p.x, p.y);
    });
    const ball = this.focusBall;
    if (ball && this.focus.ring) {
      resize(this.focus.ring.setPosition(ball.x, ball.y), calm() ? 1 : 1 + 0.1 * Math.sin(this.clock / 140));
    }
  }

  // ---------------------------------------------------------------- catch

  private updateCatch(): void {
    if (!this.flow.shown) {
      if (!this.ballSafe()) return;
      const p = this.host
        .pickups()
        .find((p) => p.active && helpfulPickup(p.kind) && p.y < PADDLE_Y - CATCH_ROOM);
      if (p && this.flow.pickupSpotted(p.kind)) this.freezeOnPickup(p);
      return;
    }
    const p = this.watched;
    if (!p?.active) {
      this.watched = undefined;
      if (this.flow.pickupMissed()) this.stepChanged();
      return;
    }
    this.animateGuide(p);
    if (this.flow.frozen) this.chaseTarget();
  }

  private freezeOnPickup(p: Pickup): void {
    const paddle = this.host.paddle;
    this.watched = p;
    this.freezeSound();
    this.showShade(true);
    this.buildGuide();
    this.buildTarget(Phaser.Math.Clamp(p.x, paddle.halfWidth, WIDTH - paddle.halfWidth));
    const y = p.y < ARENA_MID ? ARENA_MID + 60 : p.y - 120;
    this.callout(y, 'Catch powerups as they fall', 'Move under it to catch it', { clearX: p.x });
    this.animateGuide(p);
  }

  private buildGuide(): void {
    const t = this.t;
    const scene = this.scene;
    const ringImg = ring(scene, 0, 0, 26, 3, t.palette.accentHi);
    const word = glowWord(scene, 0, 0, 'Catch', 18, t.palette.accentHi);
    const dots = Array.from({ length: GUIDE_DOTS }, () => disc(scene, 0, 0, 3, t.palette.accentHi, 0.8));
    const arrow = icon(scene, 0, 0, 'back', 26, t.palette.accentHi).setAngle(-90);
    this.catchLayer.add([...dots, arrow, ringImg, word]);
    this.guide = { ring: ringImg, word, dots, arrow };
  }

  private animateGuide(p: Pickup): void {
    const g = this.guide;
    if (!g) return;
    const bounce = calm() ? 0 : Math.sin(this.clock / 160) * 3;
    resize(g.ring.setPosition(p.x, p.y), calm() ? 1 : 1 + 0.08 * Math.sin(this.clock / 140));
    g.word.setPosition(p.x, p.y - 44 + bounce);
    const top = p.y + 34;
    const bottom = PADDLE_Y - 44;
    const room = bottom - top > 30;
    const march = calm() ? 0.5 : (this.clock / 500) % 1;
    g.dots.forEach((d, i) => {
      const f = (i + march) / GUIDE_DOTS;
      d.setPosition(p.x, top + (bottom - top) * f).setVisible(room);
    });
    g.arrow.setPosition(p.x, bottom + 14 + bounce).setVisible(room);
  }

  // ---------------------------------------------------------------- ability

  private updateAbility(held: Point | null): void {
    if (this.flow.frozen) {
      this.animateSlot();
      return;
    }
    if (this.flow.shown || this.stepClock < GIFT_DELAY_MS) return;
    const slots = this.host.slots();
    const ready = slots.findIndex((s) => !!s.ability);
    if (ready < 0) {
      if (!this.granted && !slots.some((s) => s.spinning)) {
        this.granted = true;
        this.host.grantAbility();
      }
      return;
    }
    if (held || !(this.ballSafe() || this.stepClock > SAFE_WAIT_MS)) return;
    if (this.flow.abilityReady()) this.freezeOnSlot(ready, slots[ready]!.ability!);
  }

  /**
   * No ball in flight is coming down through the lower half, so stopping play to send the paddle
   * somewhere else can't cost a life.
   */
  private ballSafe(): boolean {
    return !this.host.balls().some((b) => !b.attached && b.body.velocity.y > 0 && b.y > ARENA_MID);
  }

  private freezeOnSlot(i: number, id: AbilityId): void {
    this.focusSlot = i;
    this.freezeSound();
    this.showShade(true);
    const head = `${ABILITY_INFO[id].label} is ready`;
    const y = PADDLE_Y - 200;
    if (this.device === 'pad') {
      const button = i === 0 ? 'X' : 'Y';
      this.callout(y, head, `Press ${button} to fire it`, { cap: { label: button, round: true } });
    } else if (this.device === 'desktop') {
      const key = slotKeyLabel(i);
      this.callout(y, head, `Press ${key} or click the glowing button`, { cap: { label: key } });
    } else {
      this.callout(y, head, 'Tap the glowing button to fire it');
    }
  }

  private animateSlot(): void {
    const tap = this.clock % TAP_MS < 200;
    this.focus.cap?.press(tap);
    // On the wide stage the slots sit in the wing plates, which light their own.
    const i = this.focusSlot;
    const pos = i === null || WIDE ? undefined : slotPositions()[i];
    if (this.device === 'touch' && pos) this.handPose = { x: pos.x, y: pos.y + 4, tap };
  }

  // ---------------------------------------------------------------- skills

  /**
   * Charges the step's skill, then stops play when it is worth using: the gun while the ball is
   * safely up the field, bullet time as a ball comes down at the paddle.
   */
  private updateSkill(id: SkillId, held: Point | null): void {
    if (this.flow.frozen) {
      this.animateSkill(id);
      return;
    }
    if (this.flow.shown || this.stepClock < SKILL_DELAY_MS) return;
    if (this.charged !== id) {
      this.charged = id;
      this.host.chargeSkill(id);
    }
    if (held || !this.host.skillReady(id)) return;
    if (id === 'gun') {
      if ((this.ballSafe() || this.stepClock > SAFE_WAIT_MS) && this.flow.skillReady()) this.freezeOnGun();
      return;
    }
    const ball = this.fallingBall(SLOWMO_ROOM);
    if (ball && this.flow.skillReady()) this.freezeOnSlowmo(ball);
  }

  private freezeOnGun(): void {
    this.freezeSound();
    this.showShade(true);
    const head = 'Your gun recharges as you play';
    const y = PADDLE_Y - 200;
    if (this.device === 'pad') {
      this.callout(y, head, 'Press A to fire a burst', { cap: { label: 'A', round: true } });
    } else if (this.device === 'desktop') {
      const key = skillKeyLabel('gun');
      this.callout(y, head, `Click or press ${key} to fire a burst`, { cap: { label: key } });
    } else {
      this.callout(y, head, 'Tap anywhere to fire a burst');
    }
  }

  private freezeOnSlowmo(ball: Ball): void {
    this.freezeSound();
    this.showShade(true);
    this.traceBall(ball);
    const head = 'Bullet Time slows everything';
    const y = PADDLE_Y - GUARD_RANGE - 100;
    if (this.device === 'pad') {
      this.callout(y, head, 'Press B to buy time to reach the ball', { cap: { label: 'B', round: true } });
    } else if (this.device === 'desktop') {
      const key = skillKeyLabel('slowmo');
      this.callout(y, head, `Press ${key} or Shift to buy time`, { cap: { label: key } });
    } else {
      this.callout(y, head, 'Tap the hourglass to buy time');
    }
  }

  /** Taps the key in the callout, and on touch shows where the thumb goes. */
  private animateSkill(id: SkillId): void {
    const tap = this.clock % TAP_MS < 200;
    this.focus.cap?.press(tap);
    if (id === 'slowmo') this.animatePath();
    if (this.device !== 'touch') return;
    if (id === 'gun') {
      // Any tap in the field fires it; this one sits between the words and the paddle.
      this.handPose = { x: this.host.paddle.x, y: PADDLE_Y - 110, tap };
      return;
    }
    // On the wide stage the skills sit in the wing plates, which light their own.
    const pos = WIDE ? undefined : skillPositions()[SKILL_IDS.indexOf(id)];
    if (pos) this.handPose = { x: pos.x, y: pos.y + 4, tap };
  }

  // ---------------------------------------------------------------- move and launch

  private animateMove(): void {
    const period = calm() ? 3600 : 2400;
    const phase = ((this.clock % period) / period) * Math.PI * 2;
    const x = WIDTH / 2 + Math.sin(phase) * SWEEP;
    const dir: -1 | 1 = Math.cos(phase) >= 0 ? 1 : -1;
    this.ghost?.setX(x);
    this.handPose = this.device === 'touch' ? { x, y: PADDLE_Y + HAND_DY, tap: false } : null;
    this.mouse?.setX(this.mouseX + Math.sin(phase) * 14);
    this.stick?.setX(this.stickX + Math.sin(phase) * 10);
    const pulse = calm() ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(this.clock / 300));
    this.chevrons.forEach((c, i) => c.setAlpha((i === 0 ? dir < 0 : dir > 0) ? pulse : 0.25));
    this.meter?.set(this.flow.moveProgress, false);
    const keys = this.host.input.keys;
    const real = this.caps.some((b) => keys.isDown(b.code));
    for (const b of this.caps) b.cap.press(real ? keys.isDown(b.code) : b.dir === dir);
  }

  private animateLaunch(held: Point | null): void {
    const tap = this.clock % TAP_MS < 200;
    if (held && this.launchRing) {
      const f = (this.clock % TAP_MS) / TAP_MS;
      resize(this.launchRing.setPosition(held.x, held.y - PADDLE_Y), calm() ? 1 : 1 + f * 0.9).setAlpha(
        calm() ? 0.8 : 0.9 * (1 - f),
      );
    }
    this.launchRing?.setVisible(!!held);
    const x = held?.x ?? this.host.paddle.x;
    this.handPose = this.device === 'touch' ? { x, y: PADDLE_Y + HAND_DY, tap } : null;
    this.mouse?.setTexture(iconTexture(this.scene, tap ? 'click' : 'mouse'));
    const keys = this.host.input.keys;
    for (const b of this.caps) b.cap.press(tap || (b.code !== '' && keys.isDown(b.code)));
  }

  // ---------------------------------------------------------------- end

  private cheer(x: number, y: number): void {
    const color = this.t.palette.accentHi;
    this.host.juice.ring(x, y, color, 46);
    this.host.juice.sparkle(x, y, color, 10);
    audio.sfx('ui_on', 0.5);
    if (calm()) return;
    const mark = icon(this.scene, x, y, 'check', 40, color).setDepth(DEPTH + 1);
    const s = mark.scale;
    this.scene.tweens.add({ targets: mark, scale: { from: s * 0.4, to: s * 1.15 }, duration: 220, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: mark,
      alpha: 0,
      y: y - 30,
      delay: 450,
      duration: 300,
      onComplete: () => mark.destroy(),
    });
  }

  /** Saves that the tutorial is done and clears it away. */
  private end(): void {
    if (!save.state.seenInstructions) save.update((d) => (d.seenInstructions = true));
    this.built = null;
    this.handPose = null;
    this.watched = undefined;
    this.guide = undefined;
    this.focusBall = undefined;
    this.focusSlot = null;
    const parts = [this.layer, this.stage, this.catchLayer, this.shade, this.skipButton, ...(this.line ? [this.line] : [])];
    if (calm()) {
      this.dispose();
      return;
    }
    this.skipButton.disableInteractive();
    this.scene.tweens.killTweensOf(this.shade);
    this.scene.tweens.add({ targets: parts, alpha: 0, duration: 220, onComplete: () => this.dispose() });
  }

  private dispose(): void {
    for (const off of this.offs.splice(0)) off();
    if (!this.layer.scene) return;
    this.layer.destroy();
    this.stage.destroy();
    this.catchLayer.destroy();
    this.shade.destroy();
    this.line?.destroy();
    this.skipButton.destroy();
  }
}
