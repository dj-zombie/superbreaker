import Phaser from 'phaser';
import { IS_TOUCH } from '../config';
import { haptic } from '../platform/haptics';
import { audio } from '../systems/AudioSystem';
import { framePanel, glowTexture, TEX_SCALE, type PanelVariant } from './frames';
import { shake } from './fx/motion';
import { burst } from './fx/particles';
import { calm, theme, type UiTheme } from './theme';

export interface CardOptions {
  variant?: PanelVariant;
  t?: UiTheme;
  onClick?: () => void;
  ornament?: boolean;
  disabled?: boolean;
  /** Called when a disabled card is pressed, after it shakes. */
  onDenied?: () => void;
}

/** A framed panel that presses like a button: halo on hover, sparks on release. */
export class Card extends Phaser.GameObjects.Container {
  readonly cw: number;
  readonly ch: number;
  readonly panel: Phaser.GameObjects.Container;
  private halo: Phaser.GameObjects.Image;
  private selected = false;
  private hovered = false;
  private enabled = true;
  private breathing?: Phaser.Tweens.Tween;
  private readonly t: UiTheme;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private opts: CardOptions = {}) {
    super(scene, x, y);
    this.t = opts.t ?? theme();
    this.cw = w;
    this.ch = h;
    this.halo = scene.add
      .image(0, 0, glowTexture(scene, this.t.frame, w, h, 18))
      .setScale(1 / TEX_SCALE)
      .setTint(this.t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.panel = framePanel(scene, 0, 0, w, h, this.t, {
      variant: opts.variant ?? 'card',
      ornament: opts.ornament,
    });
    this.add([this.halo, this.panel]);
    this.setSize(w, h);
    if (opts.onClick) {
      this.setInteractive({ useHandCursor: true });
      this.on('pointerover', this.onOver, this);
      this.on('pointerout', this.onOut, this);
      this.on('pointerdown', this.onDown, this);
      this.on('pointerup', this.onUp, this);
    }
    if (opts.disabled) this.setEnabled(false);
    scene.add.existing(this);
  }

  setSelected(on: boolean): this {
    if (this.selected === on) return this;
    this.selected = on;
    this.breathing?.remove();
    this.breathing = undefined;
    this.scene.tweens.killTweensOf(this.halo);
    if (on && !calm()) {
      this.halo.setAlpha(0.8);
      this.breathing = this.scene.tweens.add({
        targets: this.halo,
        alpha: { from: 0.85, to: 0.45 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    } else {
      this.halo.setAlpha(on ? 0.7 : 0);
    }
    return this;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.panel.setAlpha(on ? 1 : 0.55);
    return this;
  }

  setHandler(onClick: () => void): this {
    this.opts.onClick = onClick;
    return this;
  }

  /** Flare and sparks, as on a press. */
  pulse(): void {
    this.scene.tweens.add({
      targets: this.halo,
      alpha: { from: 1, to: this.selected ? 0.7 : this.hovered ? 0.45 : 0 },
      duration: 380,
      ease: 'Cubic.Out',
    });
    const b = this.getBounds();
    burst(this.scene, 0, 0, this.t, {
      count: 16,
      speed: 100,
      depth: (this.parentContainer?.depth ?? this.depth) + 1,
      zone: new Phaser.Geom.Rectangle(b.x + 6, b.y + 6, b.width - 12, b.height - 12),
    });
  }

  private onOver(): void {
    if (!this.enabled || IS_TOUCH) return;
    this.hovered = true;
    this.scene.tweens.add({ targets: this, scale: 1.025, duration: 180, ease: 'Cubic.Out' });
    if (!this.selected) this.scene.tweens.add({ targets: this.halo, alpha: 0.45, duration: 180 });
    audio.sfx('ui_move', 0.16);
  }

  private onOut(): void {
    this.hovered = false;
    this.scene.tweens.add({ targets: this, scale: 1, duration: 180, ease: 'Cubic.Out' });
    if (!this.selected) this.scene.tweens.add({ targets: this.halo, alpha: 0, duration: 200 });
  }

  private onDown(): void {
    if (!this.enabled) return;
    this.scene.tweens.add({ targets: this, scale: 0.97, duration: 70, ease: 'Quad.Out' });
  }

  private onUp(): void {
    if (!this.enabled) {
      shake(this.scene, this, 6);
      audio.sfx('ui_off', 0.35);
      haptic('light');
      this.opts.onDenied?.();
      return;
    }
    this.scene.tweens.add({ targets: this, scale: this.hovered ? 1.025 : 1, duration: 260, ease: 'Back.Out' });
    this.pulse();
    audio.sfx('ui_select', 0.55);
    haptic('light');
    this.opts.onClick?.();
  }
}
