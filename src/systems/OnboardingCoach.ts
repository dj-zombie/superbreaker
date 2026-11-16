import Phaser from 'phaser';
import { HUD_HEIGHT, PADDLE_Y, WIDTH } from '../config';
import { KEY_BINDINGS } from '../core/KeyLayout';
import { Onboarding, type OnboardingStep } from '../core/Onboarding';
import type { PowerupId } from '../core/types';
import type { Paddle } from '../entities/Paddle';
import { controlDevice, onInputSource, onPadButton, PadButton, type ControlDevice } from '../platform/gamepad';
import { keyLabel, onKeyLabels } from '../platform/keyboard';
import { save } from '../services';
import { Button } from '../ui/Button';
import { framePanel } from '../ui/frames';
import { icon, iconTexture, type IconName } from '../ui/icons';
import { Keycap } from '../ui/Keycap';
import { disc, ring } from '../ui/shapes';
import { calm, theme, type UiTheme } from '../ui/theme';
import { glowWord } from '../ui/type';
import { Meter } from '../ui/widgets';
import { audio } from './AudioSystem';
import type { InputSystem } from './InputSystem';
import type { JuiceSystem } from './JuiceSystem';
import type { Pickup } from './PowerupSystem';

export interface CoachHost {
  scene: Phaser.Scene;
  input: InputSystem;
  juice: JuiceSystem;
  paddle: Paddle;
}

/** Where the demo hand is, under the paddle line, and whether it is mid-tap. */
export interface CoachHand {
  x: number;
  tap: boolean;
}

/** Above the field and the ball, under the level banner. */
const DEPTH = 19;
/** Over the pickups, for the catch guide. */
const CATCH_DEPTH = 7;
const SKIP_W = 170;
const SKIP_H = 44;
/** Panel centre, above the ball and its aim arrow. */
const PANEL_DY = -165;
const PANEL_H = 76;
const METER_DY = -112;
/** How far the demo paddle sweeps either side of centre. */
const SWEEP = 110;
const TAP_MS = 900;
const GUIDE_DOTS = 6;

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

/** Padding either side of a panel's row. */
const PANEL_PAD = 20;

interface CapBinding {
  cap: Keycap;
  code: string;
  /** -1 moves left, 1 moves right, 0 launches. */
  dir: -1 | 0 | 1;
}

/**
 * The first-play tutorial over level 1, shown with pictures rather than words: a demo paddle
 * and the player's own controls (hand, mouse and keys, or stick), then the launch, then a guide
 * onto the first good powerup. Doing each thing moves it on; Skip ends it at any time.
 */
export class OnboardingCoach {
  private readonly flow = new Onboarding();
  private readonly scene: Phaser.Scene;
  private readonly t: UiTheme;
  private readonly layer: Phaser.GameObjects.Container;
  private readonly catchLayer: Phaser.GameObjects.Container;
  private readonly skipButton: Button;
  private readonly offs: Array<() => void> = [];
  private device: ControlDevice;
  private built: string | null = null;
  private clock = 0;
  private lastPaddleX: number | null = null;
  private handPose: CoachHand | null = null;

  private ghost?: Phaser.GameObjects.Image;
  private mouse?: Phaser.GameObjects.Image;
  private mouseX = 0;
  private stick?: Phaser.GameObjects.Image;
  private chevrons: Phaser.GameObjects.Image[] = [];
  private caps: CapBinding[] = [];
  private meter?: Meter;
  private launchRing?: Phaser.GameObjects.Image;

  private watched?: Pickup;
  private guide?: {
    ring: Phaser.GameObjects.Image;
    word: Phaser.GameObjects.Text;
    dots: Phaser.GameObjects.Image[];
    arrow: Phaser.GameObjects.Image;
  };

  constructor(private readonly host: CoachHost) {
    const scene = (this.scene = host.scene);
    this.t = theme();
    this.device = controlDevice();
    this.layer = scene.add.container(0, PADDLE_Y).setDepth(DEPTH);
    this.catchLayer = scene.add.container(0, 0).setDepth(CATCH_DEPTH);

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

  /** The serve waits while the player is shown how to move. */
  get holdServe(): boolean {
    return this.flow.holdServe;
  }

  /** The touch demo's hand. The HUD draws it, since the deck it rests on covers this scene. */
  get hand(): CoachHand | null {
    return this.handPose;
  }

  /** Steps the visuals. `held` is the ball waiting on the paddle, if any. */
  update(dt: number, held: { x: number; y: number } | null): void {
    if (this.flow.done) return;
    this.clock += dt;
    const px = this.host.paddle.x;
    if (this.lastPaddleX !== null && this.flow.moved(px - this.lastPaddleX)) {
      this.cheer(this.device === 'touch' ? px : WIDTH / 2, PADDLE_Y + (this.device === 'touch' ? 0 : PANEL_DY));
      this.build();
    }
    this.lastPaddleX = px;
    this.layer.setY(PADDLE_Y);
    if (this.flow.step === 'move') this.animateMove();
    else if (this.flow.step === 'launch') this.animateLaunch(held);
    else if (this.flow.step === 'catch') this.animateCatch();
  }

  /** The held ball launched. */
  launched(at: { x: number; y: number }): void {
    if (!this.flow.launched()) return;
    this.cheer(at.x, at.y);
    this.build();
  }

  /** A pickup started falling; the first good one gets the catch guide. */
  pickupSpawned(p: Pickup): void {
    if (!this.flow.pickupSpawned(p.kind)) return;
    this.watched = p;
    this.buildGuide();
  }

  /** A pickup reached the paddle. */
  pickupCaught(kind: PowerupId): void {
    if (!this.flow.pickupCaught(kind)) return;
    this.cheer(this.host.paddle.x, PADDLE_Y - 40);
    this.end();
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

  /** Rebuilds the step's visuals for the current device. */
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
      this.panel(48 + PANEL_PAD * 2 + 40);
      this.stick = this.glyph('stick', 48, WIDTH / 2, PANEL_DY);
    } else if (this.device === 'desktop') {
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
    }
    this.meter = new Meter(this.scene, WIDTH / 2, METER_DY, 180, 6, this.flow.moveProgress, this.t.palette.accent);
    this.layer.add(this.meter);
    this.fadeIn();
  }

  private buildLaunch(): void {
    this.launchRing = ring(this.scene, 0, 0, 22, 3, this.t.palette.accentHi);
    this.layer.add(this.launchRing);
    if (this.device === 'pad') {
      this.panel(46 + PANEL_PAD * 2 + 40);
      const a = new Keycap(this.scene, WIDTH / 2, PANEL_DY, 'A', { size: 46, round: true, t: this.t });
      this.layer.add(a);
      this.caps.push({ cap: a, code: '', dir: 0 });
    } else if (this.device === 'desktop') {
      const space = KEY_BINDINGS.launch[0]!;
      const { xs, width } = layoutRow([44, 2, 120], [18, 18]);
      this.panel(width + PANEL_PAD * 2);
      const cx = WIDTH / 2;
      this.addMouse(cx + xs[0]!);
      this.layer.add(this.scene.add.rectangle(cx + xs[1]!, PANEL_DY, 2, 44, this.t.palette.edge, 0.8));
      this.cap(keyLabel(space), cx + xs[2]!, PANEL_DY, space, 0, 120);
    }
    this.fadeIn();
  }

  private fadeIn(): void {
    if (calm()) return;
    this.layer.setAlpha(0);
    this.scene.tweens.add({ targets: this.layer, alpha: 1, duration: 260 });
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

  // ---------------------------------------------------------------- animation

  private animateMove(): void {
    const period = calm() ? 3600 : 2400;
    const phase = ((this.clock % period) / period) * Math.PI * 2;
    const x = WIDTH / 2 + Math.sin(phase) * SWEEP;
    const dir: -1 | 1 = Math.cos(phase) >= 0 ? 1 : -1;
    this.ghost?.setX(x);
    this.handPose = this.device === 'touch' ? { x, tap: false } : null;
    this.mouse?.setX(this.mouseX + Math.sin(phase) * 14);
    this.stick?.setX(WIDTH / 2 + Math.sin(phase) * 10);
    const pulse = calm() ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(this.clock / 300));
    this.chevrons.forEach((c, i) => c.setAlpha((i === 0 ? dir < 0 : dir > 0) ? pulse : 0.25));
    this.meter?.set(this.flow.moveProgress, false);
    const keys = this.host.input.keys;
    const real = this.caps.some((b) => keys.isDown(b.code));
    for (const b of this.caps) b.cap.press(real ? keys.isDown(b.code) : b.dir === dir);
  }

  private animateLaunch(held: { x: number; y: number } | null): void {
    const tap = this.clock % TAP_MS < 200;
    if (held && this.launchRing) {
      const f = (this.clock % TAP_MS) / TAP_MS;
      this.launchRing
        .setPosition(held.x, held.y - PADDLE_Y)
        .setScale(calm() ? 1 : 1 + f * 0.9)
        .setAlpha(calm() ? 0.8 : 0.9 * (1 - f));
    }
    this.launchRing?.setVisible(!!held);
    this.handPose = this.device === 'touch' ? { x: held?.x ?? this.host.paddle.x, tap } : null;
    this.mouse?.setTexture(iconTexture(this.scene, tap ? 'click' : 'mouse'));
    const keys = this.host.input.keys;
    for (const b of this.caps) b.cap.press(tap || (b.code !== '' && keys.isDown(b.code)));
  }

  private animateCatch(): void {
    const p = this.watched;
    const g = this.guide;
    if (!p || !g) return;
    if (!p.active) {
      this.watched = undefined;
      if (this.flow.pickupMissed()) this.end();
      return;
    }
    const bounce = calm() ? 0 : Math.sin(this.clock / 160) * 3;
    g.ring.setPosition(p.x, p.y).setScale(calm() ? 1 : 1 + 0.08 * Math.sin(this.clock / 140));
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
    const parts = [this.layer, this.catchLayer, this.skipButton];
    if (calm()) {
      this.dispose();
      return;
    }
    this.skipButton.disableInteractive();
    this.scene.tweens.add({ targets: parts, alpha: 0, duration: 220, onComplete: () => this.dispose() });
  }

  private dispose(): void {
    for (const off of this.offs.splice(0)) off();
    if (!this.layer.scene) return;
    this.layer.destroy();
    this.catchLayer.destroy();
    this.skipButton.destroy();
  }
}
