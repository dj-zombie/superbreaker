import Phaser from 'phaser';
import { calm } from '../../ui/theme';
import type { ActorRig } from './ActorStage';

type Image = Phaser.GameObjects.Image;

/** The cracks burn the forge's colour, hotter at the core. */
const CRACK_COLOR = 0xff6a1f;
const CORE_COLOR = 0xffd08a;
/** The stutter the cracks catch with before they hold: on/off steps, in ms. */
const STUTTER = [70, 60, 50, 110, 40, 160];

/**
 * The game's logo as an actor: `logo:<key>` stands the base image `<key>` with its emissive
 * cracks `<key>_glow` added over it in the forge's colour. `ignite` lights the cracks with a
 * stutter, then they breathe; `dark` puts them out.
 */
export class LogoRig implements ActorRig {
  readonly root: Phaser.GameObjects.Container;
  readonly height: number;
  private readonly base: Image;
  private readonly glow?: Image;
  private readonly core?: Image;
  private lit = false;
  private animMs = 0;
  private clock = 0;
  private flashK = 0;
  private color = 0xffffff;

  constructor(scene: Phaser.Scene, key: string) {
    this.base = scene.add.image(0, 0, key);
    this.height = this.base.height;
    const parts: Image[] = [this.base];
    const glowKey = `${key}_glow`;
    if (scene.textures.exists(glowKey)) {
      const scale = this.base.width / Math.max(1, scene.textures.getFrame(glowKey).width);
      this.glow = scene.add
        .image(0, 0, glowKey)
        .setScale(scale)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(CRACK_COLOR)
        .setAlpha(0);
      this.core = scene.add
        .image(0, 0, glowKey)
        .setScale(scale)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(CORE_COLOR)
        .setAlpha(0);
      parts.push(this.glow, this.core);
    }
    this.root = scene.add.container(0, 0, parts);
  }

  play(anim: string | null): void {
    const lit = anim === 'ignite';
    if (lit === this.lit) return;
    this.lit = lit;
    this.animMs = 0;
  }

  face(): void {}

  tint(color: number): void {
    this.color = color;
    if (this.flashK <= 0.02) this.base.setTint(color);
  }

  flash(amount: number): void {
    this.flashK = amount;
    if (amount > 0.02) this.base.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.base.setTint(this.color).setTintMode(Phaser.TintModes.MULTIPLY);
  }

  update(dtMs: number): void {
    this.clock += dtMs;
    this.animMs += dtMs;
    if (!this.glow || !this.core) return;
    let k = 0;
    if (this.lit) {
      k = 1;
      if (!calm()) {
        let t = this.animMs;
        for (let i = 0; i < STUTTER.length; i++) {
          if (t < STUTTER[i]!) {
            k = i % 2 === 0 ? 0.9 : 0.15;
            break;
          }
          t -= STUTTER[i]!;
        }
        k *= 0.82 + 0.18 * Math.sin(this.clock / 260) * Math.sin(this.clock / 97);
      }
    }
    this.glow.setAlpha(k);
    this.core.setAlpha(k * 0.55);
  }

  destroy(): void {
    this.root.destroy();
  }
}
