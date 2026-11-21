import Phaser from 'phaser';
import { HEIGHT, STAGE_W, WIDTH, WING } from '../../config';
import { particleDensity } from '../../systems/Quality';
import { canvasTexture, glowLineTexture, softDiscTexture } from '../frames';
import { calm, css, richFx, type UiTheme } from '../theme';

/**
 * How one screen gives way to the next. The world styles (burn, shroud, glitch) come from the
 * theme; the rest are plain: a fade, a dip to a color, a sideways wipe, an iris, a pixelation, or
 * a flash of light.
 */
export type WipeStyle =
  UiTheme['transition'] | 'fade' | 'dip' | 'wipe' | 'iris' | 'pixelate' | 'flash';

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

export interface WipeOptions {
  /** The camera the cover draws through; the host's main camera by default. */
  camera?: Phaser.Cameras.Scene2D.Camera;
  depth?: number;
}

/**
 * The objects and moves that cover a screen and uncover the next, owned by one host scene. The
 * Transition scene covers scene changes with it; a cutscene runs the same moves mid-scene.
 * `cover` ends fully covered with the solid up; `reveal` starts there and clears it.
 */
export class SceneWipes {
  readonly solid: Phaser.GameObjects.Rectangle;
  private readonly veil: Phaser.GameObjects.Rectangle;
  private curtain?: Phaser.GameObjects.Container;
  private embers?: Phaser.GameObjects.Particles.ParticleEmitter;
  private slices: Phaser.GameObjects.Rectangle[] = [];
  private bar?: Phaser.GameObjects.Container;
  private readonly depth: number;
  private busy = 0;

  constructor(
    private readonly host: Phaser.Scene,
    opts: WipeOptions = {},
  ) {
    this.depth = opts.depth ?? 0;
    this.cam = opts.camera ?? host.cameras.main;
    this.veil = host.add
      .rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, 0x000000, 0.003)
      .setDepth(this.depth)
      .setVisible(false);
    this.solid = host.add
      .rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, 0x000000)
      .setDepth(this.depth + 0.5)
      .setAlpha(0);
  }

  private readonly cam: Phaser.Cameras.Scene2D.Camera;

  /** Everything the wipes have made, for a caller that sorts objects between cameras. */
  objects(): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [this.veil, this.solid, ...this.slices];
    if (this.curtain) out.push(this.curtain);
    if (this.embers) out.push(this.embers);
    if (this.bar) out.push(this.bar);
    return out;
  }

  /** Something is on screen: a cover is up or moving. */
  get running(): boolean {
    return this.busy > 0 || this.solid.alpha > 0;
  }

  layout(): void {
    this.solid.setPosition(WIDTH / 2, HEIGHT / 2).setSize(STAGE_W * 2, HEIGHT * 2);
    this.veil.setPosition(WIDTH / 2, HEIGHT / 2).setSize(STAGE_W * 2, HEIGHT * 2);
  }

  setColor(color: number): this {
    this.solid.setFillStyle(color);
    return this;
  }

  /** The style a screen change should use: the world's own, or a fade when effects are cut down. */
  static styleFor(t: UiTheme): WipeStyle {
    return calm() || !richFx() ? 'fade' : t.transition;
  }

  cover(
    style: WipeStyle,
    t: UiTheme,
    from: Phaser.Scene | undefined,
    done: () => void,
    ms?: number,
  ): void {
    const end = this.track(done);
    if (style === 'burn') return this.burnCover(t, end, ms);
    if (style === 'shroud') return this.shroudCover(t, end, ms);
    if (style === 'glitch') return this.glitchCover(t, from, end, ms);
    if (style === 'pixelate') return this.pixelCover(from, end, ms);
    if (style === 'iris') return this.irisCover(end, ms);
    if (style === 'wipe') return this.wipeCover(t, end, ms);
    if (style === 'flash') {
      this.solid.setAlpha(1);
      return end();
    }
    this.host.tweens.add({
      targets: this.solid,
      alpha: 1,
      duration: ms ?? 200,
      ease: style === 'dip' ? 'Sine.InOut' : 'Quad.In',
      onComplete: end,
    });
  }

  reveal(
    style: WipeStyle,
    t: UiTheme,
    target: Phaser.Scene | undefined,
    done: () => void,
    ms?: number,
  ): void {
    const end = this.track(done);
    if (style === 'burn') return this.burnReveal(t, end, ms);
    if (style === 'shroud') return this.shroudReveal(t, target, end, ms);
    if (style === 'glitch') return this.glitchReveal(t, target, end, ms);
    if (style === 'pixelate') return this.pixelReveal(target, end, ms);
    if (style === 'iris') return this.irisReveal(end, ms);
    if (style === 'wipe') return this.wipeReveal(t, end, ms);
    this.solid.setAlpha(1);
    this.host.tweens.add({
      targets: this.solid,
      alpha: 0,
      duration: ms ?? (style === 'flash' ? 420 : 280),
      ease: style === 'flash' ? 'Cubic.Out' : 'Quad.Out',
      onComplete: end,
    });
  }

  /**
   * Covers and uncovers in one go, for a change inside a scene: `onCovered` runs while nothing
   * shows, so a cut can hide there. `ms` is the whole move.
   */
  play(style: WipeStyle, t: UiTheme, color: number, ms: number, onCovered?: () => void): void {
    const half = Math.max(60, ms / 2);
    this.setColor(color);
    if (style === 'flash') {
      this.cover('flash', t, this.host, () => {
        onCovered?.();
        this.reveal('flash', t, this.host, () => undefined, ms);
      });
      return;
    }
    this.cover(
      style,
      t,
      this.host,
      () => {
        onCovered?.();
        this.reveal(style, t, this.host, () => undefined, half);
      },
      half,
    );
  }

  /** Ends at once with nothing covering, for a skip. */
  clear(): void {
    this.host.tweens.killTweensOf(this.solid);
    this.solid.setAlpha(0);
    this.veil.setVisible(false);
    this.curtain?.destroy();
    this.curtain = undefined;
    this.embers?.stop();
    this.bar?.setVisible(false);
    this.jitterSlices(false);
  }

  private track(done: () => void): () => void {
    this.busy++;
    let fired = false;
    return () => {
      if (fired) return;
      fired = true;
      this.busy = Math.max(0, this.busy - 1);
      done();
    };
  }

  // ---------------------------------------------------------------- burn

  private buildCurtain(t: UiTheme): Phaser.GameObjects.Container {
    const host = this.host;
    this.curtain?.destroy();
    const key = burnEdgeTexture(host, t);
    const top = host.add.tileSprite(WIDTH / 2, EDGE / 2, STAGE_W + 40, EDGE, key);
    const body = host.add.rectangle(
      WIDTH / 2,
      EDGE + HEIGHT / 2,
      STAGE_W + 40,
      HEIGHT + 2,
      t.palette.base,
    );
    const bottom = host.add
      .tileSprite(WIDTH / 2, EDGE * 1.5 + HEIGHT, STAGE_W + 40, EDGE, key)
      .setFlipY(true)
      .setTilePosition(73, 0);
    const heat = (y: number) =>
      host.add
        .image(WIDTH / 2, y, glowLineTexture(host))
        .setDisplaySize(STAGE_W * 1.4, 54)
        .setTint(t.palette.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.85);
    this.curtain = host.add
      .container(0, 0, [heat(EDGE * 0.55), top, body, bottom, heat(EDGE * 1.45 + HEIGHT)])
      .setDepth(this.depth + 1);
    this.embers?.destroy();
    this.embers = host.add
      .particles(0, 0, softDiscTexture(host), {
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
      })
      .setDepth(this.depth + 1.5);
    return this.curtain;
  }

  private burnCover(t: UiTheme, done: () => void, ms = 460): void {
    const c = this.buildCurtain(t);
    c.setY(HEIGHT);
    this.embers!.start();
    this.host.tweens.add({
      targets: c,
      y: -EDGE,
      duration: ms,
      ease: 'Cubic.In',
      onUpdate: () => this.embers?.setY(c.y + EDGE * 0.5),
      onComplete: () => {
        this.embers?.stop();
        this.solid.setAlpha(1);
        c.setVisible(false);
        done();
      },
    });
  }

  private burnReveal(t: UiTheme, done: () => void, ms = 560): void {
    const c = this.buildCurtain(t);
    c.setY(-EDGE);
    this.solid.setAlpha(0);
    this.embers!.start();
    this.host.tweens.add({
      targets: c,
      y: -(HEIGHT + EDGE * 2),
      duration: ms,
      ease: 'Cubic.InOut',
      onUpdate: () => this.embers?.setY(c.y + HEIGHT + EDGE * 1.5),
      onComplete: () => {
        this.embers?.stop();
        c.destroy();
        if (this.curtain === c) this.curtain = undefined;
        this.host.time.delayedCall(900, () => {
          if (this.busy === 0 && !this.curtain) {
            this.embers?.destroy();
            this.embers = undefined;
          }
        });
        done();
      },
    });
  }

  // ---------------------------------------------------------------- shroud and iris

  /** A vignette closing to a point (or opening from one) on this host's camera. */
  private closeIn(
    color: number,
    from: { radius: number; strength: number },
    to: { radius: number; strength: number },
    ms: number,
    ease: string,
    done: () => void,
  ): void {
    this.veil.setVisible(true);
    const fx = this.cam.filters.external.addVignette(0.5, 0.5, from.radius, from.strength, color);
    this.host.tweens.add({
      targets: fx,
      radius: { from: from.radius, to: to.radius },
      strength: { from: from.strength, to: to.strength },
      duration: ms,
      ease,
      onComplete: () => {
        this.cam.filters.external.remove(fx);
        this.veil.setVisible(false);
        done();
      },
    });
  }

  private shroudCover(t: UiTheme, done: () => void, ms = 520): void {
    this.closeIn(
      t.palette.base,
      { radius: 1, strength: 0.05 },
      { radius: 0, strength: 0.5 },
      ms,
      'Sine.In',
      () => {
        this.solid.setAlpha(1);
        done();
      },
    );
  }

  private shroudReveal(
    t: UiTheme,
    target: Phaser.Scene | undefined,
    done: () => void,
    ms = 680,
  ): void {
    this.solid.setAlpha(0);
    const c = Phaser.Display.Color.IntegerToColor(t.palette.accentHi);
    target?.cameras.main.flash(320, c.red, c.green, c.blue);
    this.closeIn(
      t.palette.base,
      { radius: 0, strength: 0.5 },
      { radius: 1, strength: 0.02 },
      ms,
      'Sine.Out',
      done,
    );
  }

  private irisCover(done: () => void, ms = 520): void {
    const color = this.solid.fillColor;
    this.closeIn(
      color,
      { radius: 1.1, strength: 1 },
      { radius: 0, strength: 1 },
      ms,
      'Cubic.In',
      () => {
        this.solid.setAlpha(1);
        done();
      },
    );
  }

  private irisReveal(done: () => void, ms = 600): void {
    this.solid.setAlpha(0);
    const color = this.solid.fillColor;
    this.closeIn(
      color,
      { radius: 0, strength: 1 },
      { radius: 1.1, strength: 1 },
      ms,
      'Cubic.Out',
      done,
    );
  }

  // ---------------------------------------------------------------- wipe

  private buildBar(t: UiTheme): Phaser.GameObjects.Container {
    const host = this.host;
    this.bar?.destroy();
    const w = STAGE_W + 80;
    const body = host.add.rectangle(0, 0, w, HEIGHT + 4, this.solid.fillColor).setOrigin(0, 0.5);
    const edge = host.add
      .image(w, 0, glowLineTexture(host))
      .setDisplaySize(HEIGHT + 4, 40)
      .setRotation(Math.PI / 2)
      .setTint(t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.7);
    this.bar = host.add.container(0, HEIGHT / 2, [body, edge]).setDepth(this.depth + 1);
    return this.bar;
  }

  private wipeCover(t: UiTheme, done: () => void, ms = 420): void {
    const bar = this.buildBar(t);
    const w = STAGE_W + 80;
    const left = WIDTH / 2 - STAGE_W / 2 - 40;
    bar.setX(left - w);
    this.host.tweens.add({
      targets: bar,
      x: left,
      duration: ms,
      ease: 'Cubic.InOut',
      onComplete: () => {
        this.solid.setAlpha(1);
        bar.setVisible(false);
        done();
      },
    });
  }

  private wipeReveal(t: UiTheme, done: () => void, ms = 480): void {
    const bar = this.buildBar(t);
    const left = WIDTH / 2 - STAGE_W / 2 - 40;
    bar.setX(left);
    this.solid.setAlpha(0);
    this.host.tweens.add({
      targets: bar,
      x: left + STAGE_W + 80 + 40,
      duration: ms,
      ease: 'Cubic.InOut',
      onComplete: () => {
        bar.destroy();
        if (this.bar === bar) this.bar = undefined;
        done();
      },
    });
  }

  // ---------------------------------------------------------------- glitch and pixelate

  private makeSlices(t: UiTheme): void {
    for (const s of this.slices) s.destroy();
    this.slices = [];
    const colors = [t.palette.accent, t.palette.accent2, t.palette.accentHi];
    for (let i = 0; i < 7; i++) {
      this.slices.push(
        this.host.add
          .rectangle(WIDTH / 2, 0, STAGE_W, 10, colors[i % colors.length]!, 0.55)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(this.depth + 1)
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

  private steps(ms: number, onStep: (p: number) => void, done: () => void, slices: boolean): void {
    const state = { p: 0 };
    let last = -1;
    this.host.tweens.add({
      targets: state,
      p: 1,
      duration: ms,
      onUpdate: () => {
        const step = Math.floor(state.p * 12);
        if (step === last) return;
        last = step;
        if (slices) this.jitterSlices(true);
        onStep(state.p);
      },
      onComplete: () => {
        if (slices) this.jitterSlices(false);
        onStep(1);
        done();
      },
    });
  }

  private glitchCover(
    t: UiTheme,
    from: Phaser.Scene | undefined,
    done: () => void,
    ms = 380,
  ): void {
    this.makeSlices(t);
    const cam = (from ?? this.host).cameras.main;
    const px = cam.filters.external.addPixelate(1);
    this.steps(
      ms,
      (p) => {
        px.amount = 1 + p * p * 22;
        this.solid.setAlpha(p < 0.6 ? (Math.random() < 0.3 ? 0.6 : 0) : Math.min(1, p * 1.2));
      },
      () => {
        cam.filters.external.remove(px);
        this.solid.setAlpha(1);
        done();
      },
      true,
    );
  }

  private glitchReveal(
    t: UiTheme,
    target: Phaser.Scene | undefined,
    done: () => void,
    ms = 460,
  ): void {
    this.makeSlices(t);
    const cam = (target ?? this.host).cameras.main;
    const px = cam.filters.external.addPixelate(22);
    this.solid.setAlpha(1);
    this.steps(
      ms,
      (p) => {
        px.amount = 1 + (1 - p) * (1 - p) * 22;
        this.solid.setAlpha(p < 0.35 ? 1 - p * 2 : Math.random() < 0.15 ? 0.35 : 0);
      },
      () => {
        cam.filters.external.remove(px);
        this.solid.setAlpha(0);
        done();
      },
      true,
    );
  }

  private pixelCover(from: Phaser.Scene | undefined, done: () => void, ms = 420): void {
    const cam = (from ?? this.host).cameras.main;
    const px = cam.filters.external.addPixelate(1);
    this.steps(
      ms,
      (p) => {
        px.amount = 1 + p * p * 30;
        this.solid.setAlpha(Math.max(0, (p - 0.7) / 0.3));
      },
      () => {
        cam.filters.external.remove(px);
        this.solid.setAlpha(1);
        done();
      },
      false,
    );
  }

  private pixelReveal(target: Phaser.Scene | undefined, done: () => void, ms = 480): void {
    const cam = (target ?? this.host).cameras.main;
    const px = cam.filters.external.addPixelate(30);
    this.solid.setAlpha(1);
    this.steps(
      ms,
      (p) => {
        px.amount = 1 + (1 - p) * (1 - p) * 30;
        this.solid.setAlpha(Math.max(0, 1 - p / 0.3));
      },
      () => {
        cam.filters.external.remove(px);
        this.solid.setAlpha(0);
        done();
      },
      false,
    );
  }

  destroy(): void {
    this.clear();
    for (const o of this.objects()) o.destroy();
    this.slices = [];
  }
}
