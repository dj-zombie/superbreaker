import Phaser from 'phaser';
import { IS_TOUCH, RENDER_ZOOM } from '../config';
import { haptic } from '../platform/haptics';
import { audio } from '../systems/AudioSystem';
import {
  buttonCut,
  buttonTexture,
  glowLineTexture,
  glowTexture,
  shineTexture,
  TEX_SCALE,
} from './frames';
import { burst } from './fx/particles';
import { shake } from './fx/motion';
import { icon as makeIcon, type IconName } from './icons';
import { calm, css, theme, type UiTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonOptions {
  width?: number;
  height?: number;
  variant?: ButtonVariant;
  fontSize?: number;
  /** Glyph drawn before the label, or alone when the label is empty. */
  icon?: IconName;
  /** Texture drawn before the label instead of a glyph, e.g. the coin. */
  image?: string;
  /** Small second line under the label. */
  sub?: string;
  /** The screen's main action: a breathing glow and a periodic shine. */
  hero?: boolean;
  disabled?: boolean;
  /** Called when a disabled button is pressed, after it shakes. */
  onDenied?: () => void;
  t?: UiTheme;
}

const SPRING = 'Back.Out';

/** A button in the world's material: forged plate, stained glass or holo glass. */
export class Button extends Phaser.GameObjects.Container {
  readonly label: Phaser.GameObjects.Text;
  private face?: Phaser.GameObjects.Image;
  private flashFace?: Phaser.GameObjects.Image;
  private glow?: Phaser.GameObjects.Image;
  private shine?: Phaser.GameObjects.TileSprite;
  private underline?: Phaser.GameObjects.Image;
  private glyph?: Phaser.GameObjects.Image;
  /** Icons follow the label colour; images such as the coin keep their own. */
  private tintGlyph = false;
  private subText?: Phaser.GameObjects.Text;
  private enabled = true;
  private hovered = false;
  private breathing?: Phaser.Tweens.Tween;
  private shineTimer?: Phaser.Time.TimerEvent;
  readonly bw: number;
  readonly bh: number;
  private variant: ButtonVariant;
  private readonly t: UiTheme;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    private onClick: () => void,
    private opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    this.t = opts.t ?? theme();
    this.bw = opts.width ?? 280;
    this.bh = opts.height ?? 60;
    this.variant = opts.variant ?? 'primary';
    const { bw: w, bh: h, t } = this;
    const lit = this.variant === 'primary' || this.variant === 'danger';

    if (this.variant !== 'ghost') {
      if (lit || opts.hero) {
        this.glow = scene.add
          .image(0, 0, glowTexture(scene, t.frame, w, h, 16))
          .setScale(1 / TEX_SCALE)
          .setTint(this.variant === 'danger' ? t.palette.danger : t.palette.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(opts.hero ? 0.5 : 0);
        this.add(this.glow);
      }
      this.face = scene.add.image(0, 0, this.faceKey()).setScale(1 / TEX_SCALE);
      this.flashFace = scene.add
        .image(0, 0, this.faceKey())
        .setScale(1 / TEX_SCALE)
        .setTint(0xffffff)
        .setTintMode(Phaser.TintModes.FILL)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.add([this.face, this.flashFace]);
      const cut = buttonCut(t.frame, h);
      const sw = Math.max(8, w - cut * 2);
      this.shine = scene.add
        .tileSprite(0, 0, sw, h - 8, shineTexture(scene))
        .setTileScale(Math.max(1, (sw + 140) / 360), (h - 8) / 64)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0);
      this.add(this.shine);
    } else {
      this.underline = scene.add
        .image(0, h / 2 - 8, glowLineTexture(scene))
        .setDisplaySize(w * 0.7, 14)
        .setTint(t.palette.accent)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0, 14 / 24)
        .setAlpha(0.8);
      this.add(this.underline);
    }

    const size = opts.fontSize ?? Math.round(h * 0.42);
    this.label = scene.add
      .text(0, 0, text.toUpperCase(), {
        fontFamily: t.fonts.display,
        fontSize: `${size}px`,
        fontStyle: '800',
        color: this.textColor(),
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0.5)
      .setLetterSpacing(size * 0.08);
    this.styleLabel();
    this.add(this.label);

    if (opts.icon || opts.image) {
      const is = Math.round(h * (text ? 0.44 : 0.5));
      this.glyph = opts.icon
        ? makeIcon(scene, 0, 0, opts.icon, is, Phaser.Display.Color.HexStringToColor(this.textColor()).color)
        : scene.add.image(0, 0, opts.image!);
      if (opts.image) this.glyph.setScale(is / Math.max(this.glyph.width, this.glyph.height));
      this.tintGlyph = !!opts.icon;
      this.add(this.glyph);
    }
    if (opts.sub) {
      this.subText = scene.add
        .text(0, 0, opts.sub.toUpperCase(), {
          fontFamily: t.fonts.display,
          fontSize: `${Math.round(size * 0.48)}px`,
          fontStyle: '700',
          color: this.textColor(),
          resolution: RENDER_ZOOM,
        })
        .setOrigin(0.5)
        .setLetterSpacing(size * 0.1)
        .setAlpha(0.72);
      this.add(this.subText);
    }
    this.layoutContent();

    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', this.onOver, this);
    this.on('pointerout', this.onOut, this);
    this.on('pointerdown', this.onDown, this);
    this.on('pointerup', this.onUp, this);

    if (opts.hero) this.startHero();
    this.setEnabled(!opts.disabled);
    scene.add.existing(this);
  }

  private faceKey(): string {
    const v = this.variant === 'ghost' ? 'secondary' : this.variant;
    return buttonTexture(this.scene, this.t.frame, v, this.bw, this.bh);
  }

  private textColor(): string {
    const p = this.t.palette;
    if (this.variant === 'primary') return p.textOnAccent;
    if (this.variant === 'danger') return '#ffffff';
    if (this.variant === 'ghost') return css(p.accentHi);
    return this.t.frame === 'holo' ? css(p.accentHi) : p.text;
  }

  private styleLabel(): void {
    const dark = this.variant === 'primary' && this.t.frame !== 'gothic';
    this.label.setColor(this.textColor());
    if (dark) this.label.setShadow(0, 1, 'rgba(255,255,255,0.35)', 0, false, true);
    else this.label.setShadow(0, 2, 'rgba(0,0,0,0.6)', 4, false, true);
  }

  private layoutContent(): void {
    const hasText = this.label.text.length > 0;
    const ly = this.subText ? -this.bh * 0.1 : 0;
    this.subText?.setPosition(0, this.bh * 0.24);
    if (!this.glyph?.visible) {
      this.label.setPosition(0, ly);
      return;
    }
    if (!hasText) {
      this.glyph.setPosition(0, 0);
      this.label.setPosition(0, 0);
      return;
    }
    const gw = this.glyph.displayWidth;
    const gap = 10;
    const total = gw + gap + this.label.width;
    const left = -total / 2;
    this.glyph.setPosition(left + gw / 2, ly);
    this.label.setPosition(left + gw + gap + this.label.width / 2, ly);
  }

  private onOver(): void {
    if (!this.enabled || IS_TOUCH) return;
    this.hovered = true;
    this.scaleTo(1.04, 160);
    if (this.glow) this.tweenGlow(this.opts.hero ? 0.9 : 0.55);
    if (this.underline) {
      this.scene.tweens.add({ targets: this.underline, scaleX: (this.bw * 0.7) / 64, duration: 220, ease: 'Cubic.Out' });
    }
    this.sweep();
    audio.sfx('ui_move', 0.18);
  }

  private onOut(): void {
    this.hovered = false;
    this.face?.clearTint();
    this.scaleTo(1, 160);
    if (this.glow) this.tweenGlow(this.opts.hero ? 0.5 : 0);
    if (this.underline) {
      this.scene.tweens.add({ targets: this.underline, scaleX: 0, duration: 180, ease: 'Cubic.In' });
    }
  }

  private onDown(): void {
    if (!this.enabled) return;
    this.face?.setTint(0xd8d8d8);
    this.scaleTo(0.95, 70, 'Quad.Out');
  }

  private onUp(): void {
    if (!this.enabled) {
      shake(this.scene, this, 6);
      audio.sfx('ui_off', 0.35);
      haptic('light');
      this.opts.onDenied?.();
      return;
    }
    this.face?.clearTint();
    this.scaleTo(this.hovered ? 1.04 : 1, 260, SPRING);
    this.pulse();
    audio.sfx('ui_select', 0.55);
    haptic('light');
    this.onClick();
  }

  /** Bright flash and sparks off the edges, as on a press. */
  pulse(): void {
    if (this.flashFace) {
      this.flashFace.setAlpha(0.55);
      this.scene.tweens.add({ targets: this.flashFace, alpha: 0, duration: 260, ease: 'Cubic.Out' });
    } else {
      this.scene.tweens.add({ targets: this.label, alpha: { from: 0.4, to: 1 }, duration: 200 });
    }
    if (this.variant === 'ghost' || !this.active) return;
    const b = this.getBounds();
    burst(this.scene, 0, 0, this.t, {
      count: 12,
      speed: 90,
      depth: (this.parentContainer?.depth ?? this.depth) + 1,
      zone: new Phaser.Geom.Rectangle(b.x + 6, b.y + 4, b.width - 12, b.height - 8),
    });
  }

  private scaleTo(s: number, duration: number, ease = 'Cubic.Out'): void {
    this.scene.tweens.add({ targets: this, scale: s, duration, ease });
  }

  private tweenGlow(alpha: number): void {
    this.breathing?.pause();
    this.scene.tweens.add({
      targets: this.glow,
      alpha,
      duration: 180,
      onComplete: () => {
        if (!this.hovered) this.breathing?.resume();
      },
    });
  }

  private startHero(): void {
    if (!this.glow || calm()) return;
    this.breathing = this.scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.32, to: 0.78 },
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    const loop = () => {
      this.shineTimer = this.scene.time.delayedCall(Phaser.Math.Between(2600, 4200), () => {
        if (!this.active) return;
        if (this.enabled) this.sweep();
        loop();
      });
    };
    loop();
  }

  /** Runs the shine band across the face once. */
  sweep(): void {
    if (!this.shine || calm()) return;
    const s = this.shine;
    const band = 185;
    const start = band + 60 / s.tileScaleX;
    const end = band - (s.width + 60) / s.tileScaleX;
    this.scene.tweens.killTweensOf(s);
    s.setTilePosition(start, 0).setAlpha(0.55);
    this.scene.tweens.add({
      targets: s,
      tilePositionX: end,
      duration: 620,
      ease: 'Cubic.InOut',
      onComplete: () => s.setAlpha(0),
    });
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.42);
    if (this.glow) this.glow.setVisible(enabled);
    return this;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setText(text: string): this {
    this.label.setText(text.toUpperCase());
    this.layoutContent();
    return this;
  }

  setSub(text: string): this {
    this.subText?.setText(text.toUpperCase());
    return this;
  }

  setVariant(variant: Exclude<ButtonVariant, 'ghost'>): this {
    if (this.variant === variant || !this.face) return this;
    this.variant = variant;
    this.face.setTexture(this.faceKey());
    this.flashFace?.setTexture(this.faceKey());
    this.styleLabel();
    this.subText?.setColor(this.textColor());
    if (this.tintGlyph) this.glyph?.setTint(Phaser.Display.Color.HexStringToColor(this.textColor()).color);
    return this;
  }

  /** Hides or shows the icon or image, re-centring the label. */
  setGlyphVisible(on: boolean): this {
    if (this.glyph && this.glyph.visible !== on) {
      this.glyph.setVisible(on);
      this.layoutContent();
    }
    return this;
  }

  /** Replaces the click handler, e.g. when a card's action changes. */
  setHandler(onClick: () => void): this {
    this.onClick = onClick;
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.shineTimer?.remove();
    super.destroy(fromScene);
  }
}

/** Square icon-only button: back, pause, settings. */
export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: IconName,
  onClick: () => void,
  size = 50,
  variant: Exclude<ButtonVariant, 'ghost'> = 'secondary',
): Button {
  return new Button(scene, x, y, '', onClick, { width: size, height: size, icon: glyph, variant });
}
