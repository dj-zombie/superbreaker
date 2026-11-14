import Phaser from 'phaser';
import { HEIGHT, SCENES, STAGE_W, WIDTH, WING } from '../config';
import { audio } from '../systems/AudioSystem';
import { particleDensity } from '../systems/Quality';
import { canvasTexture, glowLineTexture, softDiscTexture } from '../ui/frames';
import { calm, css, richFx, theme, type UiTheme } from '../ui/theme';
import { BaseScene } from './BaseScene';

type Style = UiTheme['transition'] | 'fade';

export interface TransitionRequest {
  from: Phaser.Scene;
  key: string;
  data?: object;
  /** Other scenes to stop while covered, e.g. the HUD under a results overlay. */
  stop?: string[];
}

/** Height of the charred edge on the burn curtain. */
const EDGE = 44;

/** Jagged, glowing top edge of the burn curtain, tiled across the screen. */
function burnEdgeTexture(scene: Phaser.Scene, t: UiTheme): string {
  return canvasTexture(scene, `tr_burn_${t.id}`, 200, EDGE, (ctx, w, h) => {
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const pts: Array<[number, number]> = [];
    for (let x = 0; x <= w; x += 8) pts.push([x, h * 0.35 + rnd() * h * 0.4]);
    pts[pts.length - 1]![1] = pts[0]![1];
    const path = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    };
    path();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = css(t.palette.base);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = css(t.palette.glow);
    ctx.shadowBlur = 10;
    path();
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(t.palette.accent);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = css(t.palette.accentHi);
    ctx.stroke();
    ctx.restore();
  });
}

/**
 * Always-on top layer that covers one screen and reveals the next in the world's style: a burn
 * wipe in Hell, a closing shroud in the Crypt, a pixelated glitch in the Mainframe.
 */
export class Transition extends BaseScene {
  private busy = false;
  private solid!: Phaser.GameObjects.Rectangle;
  private veil!: Phaser.GameObjects.Rectangle;
  private curtain?: Phaser.GameObjects.Container;
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter;
  private slices: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: SCENES.transition, active: true });
  }

  create(): void {
    this.setupCamera();
    this.veil = this.add.rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, 0x000000, 0.003);
    this.veil.setVisible(false);
    this.solid = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, theme().palette.base)
      .setAlpha(0);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout(): void {
    this.solid.setPosition(WIDTH / 2, HEIGHT / 2).setSize(STAGE_W * 2, HEIGHT * 2);
    this.veil.setPosition(WIDTH / 2, HEIGHT / 2).setSize(STAGE_W * 2, HEIGHT * 2);
  }

  get running(): boolean {
    return this.busy;
  }

  go(req: TransitionRequest): void {
    if (this.busy) return;
    this.busy = true;
    this.scene.bringToTop();
    req.from.input.enabled = false;
    const t = theme();
    const style: Style = calm() || !richFx() ? 'fade' : t.transition;
    this.solid.setFillStyle(t.palette.base);
    audio.whoosh(0.25);
    this.cover(style, t, req.from, () => this.swap(req));
  }

  private swap(req: TransitionRequest): void {
    for (const k of req.stop ?? []) {
      if (k !== req.from.scene.key && (this.scene.isActive(k) || this.scene.isPaused(k))) this.scene.stop(k);
    }
    const target = this.scene.get(req.key);
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      this.scene.bringToTop();
      const t = theme();
      const style: Style = calm() || !richFx() ? 'fade' : t.transition;
      this.solid.setFillStyle(t.palette.base);
      this.reveal(style, t, target, () => {
        this.busy = false;
      });
    };
    target.events.once(Phaser.Scenes.Events.CREATE, () => this.time.delayedCall(30, reveal));
    this.time.delayedCall(5000, reveal);
    req.from.scene.start(req.key, req.data);
  }

  // ---------------------------------------------------------------- cover

  private cover(style: Style, t: UiTheme, from: Phaser.Scene, done: () => void): void {
    if (style === 'burn') return this.burnCover(t, done);
    if (style === 'shroud') return this.shroudCover(t, done);
    if (style === 'glitch') return this.glitchCover(t, from, done);
    this.tweens.add({ targets: this.solid, alpha: 1, duration: 200, ease: 'Quad.In', onComplete: done });
  }

  private reveal(style: Style, t: UiTheme, target: Phaser.Scene, done: () => void): void {
    if (style === 'burn') return this.burnReveal(t, done);
    if (style === 'shroud') return this.shroudReveal(t, target, done);
    if (style === 'glitch') return this.glitchReveal(t, target, done);
    this.solid.setAlpha(1);
    this.tweens.add({ targets: this.solid, alpha: 0, duration: 280, ease: 'Quad.Out', onComplete: done });
  }

  // ---------------------------------------------------------------- burn

  private buildCurtain(t: UiTheme): Phaser.GameObjects.Container {
    this.curtain?.destroy();
    const key = burnEdgeTexture(this, t);
    const top = this.add.tileSprite(WIDTH / 2, EDGE / 2, STAGE_W + 40, EDGE, key);
    const body = this.add.rectangle(WIDTH / 2, EDGE + HEIGHT / 2, STAGE_W + 40, HEIGHT + 2, t.palette.base);
    const bottom = this.add
      .tileSprite(WIDTH / 2, EDGE * 1.5 + HEIGHT, STAGE_W + 40, EDGE, key)
      .setFlipY(true)
      .setTilePosition(73, 0);
    const heat = (y: number) =>
      this.add
        .image(WIDTH / 2, y, glowLineTexture(this))
        .setDisplaySize(STAGE_W * 1.4, 54)
        .setTint(t.palette.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.85);
    this.curtain = this.add.container(0, 0, [
      heat(EDGE * 0.55),
      top,
      body,
      bottom,
      heat(EDGE * 1.45 + HEIGHT),
    ]);
    this.embers?.destroy();
    this.embers = this.add.particles(0, 0, softDiscTexture(this), {
      x: { min: -WING, max: WIDTH + WING },
      lifespan: { min: 400, max: 900 },
      speedY: { min: -260, max: -80 },
      speedX: { min: -40, max: 40 },
      scale: { start: 0.16, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [t.palette.accent, t.palette.accentHi, t.palette.accent2],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 12 / Math.max(0.3, particleDensity()),
      quantity: 2,
      emitting: false,
    });
    return this.curtain;
  }

  private burnCover(t: UiTheme, done: () => void): void {
    const c = this.buildCurtain(t);
    c.setY(HEIGHT);
    this.embers!.start();
    this.tweens.add({
      targets: c,
      y: -EDGE,
      duration: 460,
      ease: 'Cubic.In',
      onUpdate: () => this.embers!.setY(c.y + EDGE * 0.5),
      onComplete: () => {
        this.embers!.stop();
        this.solid.setAlpha(1);
        c.setVisible(false);
        done();
      },
    });
  }

  private burnReveal(t: UiTheme, done: () => void): void {
    const c = this.buildCurtain(t);
    c.setY(-EDGE);
    this.solid.setAlpha(0);
    this.embers!.start();
    this.tweens.add({
      targets: c,
      y: -(HEIGHT + EDGE * 2),
      duration: 560,
      ease: 'Cubic.InOut',
      onUpdate: () => this.embers!.setY(c.y + HEIGHT + EDGE * 1.5),
      onComplete: () => {
        this.embers!.stop();
        c.destroy();
        this.curtain = undefined;
        this.time.delayedCall(900, () => {
          if (!this.busy) {
            this.embers?.destroy();
            this.embers = undefined;
          }
        });
        done();
      },
    });
  }

  // ---------------------------------------------------------------- shroud

  private shroudCover(t: UiTheme, done: () => void): void {
    this.veil.setVisible(true);
    const fx = this.cameras.main.filters.external.addVignette(0.5, 0.5, 1, 0, t.palette.base);
    this.tweens.add({
      targets: fx,
      radius: { from: 1, to: 0 },
      strength: { from: 0.05, to: 0.5 },
      duration: 520,
      ease: 'Sine.In',
      onComplete: () => {
        this.solid.setAlpha(1);
        this.cameras.main.filters.external.remove(fx);
        this.veil.setVisible(false);
        done();
      },
    });
  }

  private shroudReveal(t: UiTheme, target: Phaser.Scene, done: () => void): void {
    this.solid.setAlpha(0);
    this.veil.setVisible(true);
    const fx = this.cameras.main.filters.external.addVignette(0.5, 0.5, 0, 0.5, t.palette.base);
    const c = Phaser.Display.Color.IntegerToColor(t.palette.accentHi);
    target.cameras.main.flash(320, c.red, c.green, c.blue);
    this.tweens.add({
      targets: fx,
      radius: { from: 0, to: 1 },
      strength: { from: 0.5, to: 0.02 },
      duration: 680,
      ease: 'Sine.Out',
      onComplete: () => {
        this.cameras.main.filters.external.remove(fx);
        this.veil.setVisible(false);
        done();
      },
    });
  }

  // ---------------------------------------------------------------- glitch

  private makeSlices(t: UiTheme): void {
    for (const s of this.slices) s.destroy();
    this.slices = [];
    const colors = [t.palette.accent, t.palette.accent2, t.palette.accentHi];
    for (let i = 0; i < 7; i++) {
      this.slices.push(
        this.add
          .rectangle(WIDTH / 2, 0, STAGE_W, 10, colors[i % colors.length]!, 0.55)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false),
      );
    }
  }

  private jitterSlices(on: boolean): void {
    for (const s of this.slices) {
      const show = on && Math.random() < 0.7;
      s.setVisible(show);
      if (!show) continue;
      s.setPosition(WIDTH / 2 + Phaser.Math.Between(-60, 60), Phaser.Math.Between(0, HEIGHT));
      s.setSize(STAGE_W * Phaser.Math.FloatBetween(0.4, 1.2), Phaser.Math.Between(3, 26));
    }
  }

  private glitchRun(ms: number, onStep: (p: number) => void, done: () => void): void {
    const state = { p: 0 };
    let last = -1;
    this.tweens.add({
      targets: state,
      p: 1,
      duration: ms,
      onUpdate: () => {
        const step = Math.floor(state.p * 12);
        if (step === last) return;
        last = step;
        this.jitterSlices(true);
        onStep(state.p);
      },
      onComplete: () => {
        this.jitterSlices(false);
        done();
      },
    });
  }

  private glitchCover(t: UiTheme, from: Phaser.Scene, done: () => void): void {
    this.makeSlices(t);
    const cam = from.cameras.main;
    const px = cam.filters.external.addPixelate(1);
    this.glitchRun(
      380,
      (p) => {
        px.amount = 1 + p * p * 22;
        this.solid.setAlpha(p < 0.6 ? (Math.random() < 0.3 ? 0.6 : 0) : Math.min(1, p * 1.2));
      },
      () => {
        cam.filters.external.remove(px);
        this.solid.setAlpha(1);
        done();
      },
    );
  }

  private glitchReveal(t: UiTheme, target: Phaser.Scene, done: () => void): void {
    this.makeSlices(t);
    const cam = target.cameras.main;
    const px = cam.filters.external.addPixelate(22);
    this.solid.setAlpha(1);
    this.glitchRun(
      460,
      (p) => {
        px.amount = 1 + (1 - p) * (1 - p) * 22;
        this.solid.setAlpha(p < 0.35 ? 1 - p * 2 : Math.random() < 0.15 ? 0.35 : 0);
      },
      () => {
        cam.filters.external.remove(px);
        this.solid.setAlpha(0);
        done();
      },
    );
  }
}
