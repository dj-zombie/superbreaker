import Phaser from 'phaser';
import { COLORS, RENDER_ZOOM, UI_FONT } from '../config';
import { audio } from '../systems/AudioSystem';
import { haptic } from '../platform/haptics';
import { buttonFace, roundBox, roundOutline } from './shapes';

export interface ButtonOptions {
  width?: number;
  height?: number;
  fill?: number;
  textColor?: string;
  fontSize?: number;
  icon?: string;
  disabled?: boolean;
}

/** Glossy capsule. Pressing slides the face down onto its darker side. */
export class Button extends Phaser.GameObjects.Container {
  private side: Phaser.GameObjects.NineSlice;
  private face: Phaser.GameObjects.NineSlice;
  readonly label: Phaser.GameObjects.Text;
  private opts: Required<Omit<ButtonOptions, 'icon'>> & { icon?: string };
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    private onClick: () => void,
    options: ButtonOptions = {},
  ) {
    super(scene, x, y);
    this.opts = {
      width: 260,
      height: 64,
      fill: COLORS.hot,
      textColor: '#ffffff',
      fontSize: 26,
      disabled: false,
      ...options,
    };
    const { width, height } = this.opts;
    const r = height / 2;
    this.side = buttonFace(scene, 0, 0, width, height, 0);
    this.face = buttonFace(scene, 0, 0, width, height - 4, 0);
    this.add([roundBox(scene, 0, 8, width, height, r, 0x000000, 0.45), this.side, this.face]);

    let textX = 0;
    if (this.opts.icon) {
      const icon = scene.add.image(-width / 2 + height / 2 + 4, 0, this.opts.icon);
      const s = (height * 0.6) / Math.max(icon.width, icon.height);
      icon.setScale(s);
      this.add(icon);
      textX = height * 0.3;
    }
    this.label = scene.add
      .text(textX, -2, text, {
        fontFamily: UI_FONT,
        resolution: RENDER_ZOOM,
        fontSize: `${this.opts.fontSize}px`,
        fontStyle: '800',
        color: this.opts.textColor,
        align: 'center',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, 'rgba(0,0,0,0.45)', 0);
    this.add(this.label);

    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabled && this.tweenScale(1.05));
    this.on('pointerout', () => {
      this.tweenScale(1);
      this.draw(false);
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.draw(true);
      this.tweenScale(0.95);
    });
    this.on('pointerup', () => {
      if (!this.enabled) return;
      this.draw(false);
      this.tweenScale(1.05);
      audio.sfx('ui_select', 0.6);
      haptic('light');
      this.onClick();
    });

    this.setEnabled(!this.opts.disabled);
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.5);
    this.draw(false);
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setFill(color: number): this {
    this.opts.fill = color;
    this.draw(false);
    return this;
  }

  private draw(pressed: boolean): void {
    const { fill } = this.opts;
    const drop = pressed ? 4 : 0;
    this.side
      .setTint(Phaser.Display.Color.ValueToColor(fill).darken(35).color)
      .setY(pressed ? -2 : 2);
    this.face.setTint(fill).setY(drop - 4);
    this.label.setY(pressed ? 0 : -2);
  }

  private tweenScale(s: number): void {
    this.scene.tweens.add({ targets: this, scale: s, duration: 90, ease: 'Quad.Out' });
  }
}

/** Dimmed backdrop + rounded panel for overlay scenes. */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Container {
  return scene.add.container(x, y, [
    roundBox(scene, 0, 8, w, h, 28, 0x000000, 0.4),
    roundBox(scene, 0, 0, w, h, 28, COLORS.panel, 0.96),
    roundOutline(scene, 0, 0, w, h, 28, 4, COLORS.panelEdge),
  ]);
}

export function title(scene: Phaser.Scene, x: number, y: number, text: string, size = 40) {
  return scene.add
    .text(x, y, text, {
      fontFamily: UI_FONT,
      resolution: RENDER_ZOOM,
      fontSize: `${size}px`,
      fontStyle: '900',
      color: '#ffffff',
    })
    .setOrigin(0.5)
    .setStroke('#1a0629', 8)
    .setShadow(0, 4, 'rgba(0,0,0,0.5)', 0);
}

export function bodyText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size = 22,
  color = '#ffffff',
) {
  return scene.add
    .text(x, y, text, {
      fontFamily: UI_FONT,
      resolution: RENDER_ZOOM,
      fontSize: `${size}px`,
      fontStyle: '700',
      color,
      align: 'center',
      wordWrap: { width: 520 },
    })
    .setOrigin(0.5);
}

/** Small round icon-only button (pause, back, toggles). */
export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: string,
  onClick: () => void,
  size = 56,
): Button {
  return new Button(scene, x, y, glyph, onClick, {
    width: size,
    height: size,
    fill: COLORS.panelEdge,
    fontSize: size * 0.5,
  });
}

export function fadeIn(scene: Phaser.Scene, ms = 250): void {
  scene.cameras.main.fadeIn(ms, 11, 8, 32);
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object, ms = 220): void {
  scene.input.enabled = false;
  scene.cameras.main.fadeOut(ms, 11, 8, 32);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(key, data);
  });
}
