import Phaser from 'phaser';
import { softDiscTexture } from '../../ui/frames';
import { calm } from '../../ui/theme';
import type { ActorRig } from './ActorStage';

type Image = Phaser.GameObjects.Image;

const TRAIL = 30;
/** Ms between the trail's samples of where the comet was. */
const SAMPLE_MS = 14;
/** A move this far in one frame is a cut, not flight: the trail starts again. */
const JUMP = 160;
/** The trail cools from white through gold to ember red. */
const RAMP = [0xffffff, 0xffe08a, 0xffa23a, 0xff5a1f, 0x9a1f0a];

/**
 * A burning spark for cutscenes: a core image (`comet:<texture>`) in a hot glow, dragging a tail
 * through wherever it has actually been, so it follows any path the script flies it along.
 * `flare` burns it brighter for a moment of impact; `burn` is the resting state.
 */
export class CometRig implements ActorRig {
  readonly root: Phaser.GameObjects.Container;
  readonly height = 48;
  private readonly tail: Image[] = [];
  private readonly glow: Image;
  private readonly core?: Image;
  private readonly history: { x: number; y: number }[] = [];
  private sinceSample = 0;
  private clock = 0;
  private anim: string | null = null;
  private flare = 0;
  private flashK = 0;

  constructor(scene: Phaser.Scene, texture: string) {
    const disc = softDiscTexture(scene);
    for (let i = 0; i < TRAIL; i++) {
      const k = i / (TRAIL - 1);
      this.tail.push(
        scene.add
          .image(0, 0, disc)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(rampAt(k))
          .setVisible(false),
      );
    }
    this.glow = scene.add
      .image(0, 0, disc)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffc860)
      .setDisplaySize(130, 130);
    const parts: Image[] = [...this.tail].reverse();
    parts.push(this.glow);
    if (scene.textures.exists(texture)) {
      this.core = scene.add.image(0, 0, texture).setBlendMode(Phaser.BlendModes.ADD);
      this.core.setScale(this.height / Math.max(1, this.core.height));
      parts.push(this.core);
    }
    this.root = scene.add.container(0, 0, parts);
  }

  play(anim: string | null): void {
    if (anim === this.anim) return;
    this.anim = anim;
    if (anim === 'flare') this.flare = 1;
  }

  face(): void {}

  tint(): void {}

  flash(amount: number): void {
    this.flashK = amount;
  }

  update(dtMs: number): void {
    this.clock += dtMs;
    this.flare = Math.max(0, this.flare - dtMs / 900);
    const still = calm();
    const here = { x: this.root.x, y: this.root.y };
    const last = this.history[0];
    if (last && Math.hypot(here.x - last.x, here.y - last.y) > JUMP) this.history.length = 0;
    this.sinceSample += dtMs;
    if (!this.history.length || this.sinceSample >= SAMPLE_MS) {
      this.sinceSample = 0;
      this.history.unshift(here);
      if (this.history.length > TRAIL) this.history.length = TRAIL;
    }

    const burn = Math.max(this.flare, this.flashK);
    const pulse = still
      ? 1
      : 1 + 0.08 * Math.sin(this.clock / 45) + 0.05 * Math.sin(this.clock / 17);
    const s = this.root.scaleX || 1;
    this.glow
      .setDisplaySize(130 * pulse * (1 + burn), 130 * pulse * (1 + burn))
      .setAlpha(0.7 + 0.3 * burn);
    if (this.core) {
      this.core
        .setScale((this.height / Math.max(1, this.core.height)) * pulse * (1 + 0.6 * burn))
        .setAngle(still ? 0 : this.clock / 12);
    }
    const length = still ? TRAIL / 3 : TRAIL;
    const cos = Math.cos(-this.root.rotation);
    const sin = Math.sin(-this.root.rotation);
    this.tail.forEach((img, i) => {
      const p = this.history[i];
      if (!p || i >= length) {
        img.setVisible(false);
        return;
      }
      const dx = (p.x - here.x) / s;
      const dy = (p.y - here.y) / s;
      const k = i / (length - 1);
      const size = (46 - 34 * k) * (1 + 0.5 * burn);
      img
        .setVisible(true)
        .setPosition(dx * cos - dy * sin, dx * sin + dy * cos)
        .setDisplaySize(size, size)
        .setAlpha((1 - k) * 0.85);
    });
  }

  destroy(): void {
    this.root.destroy();
  }
}

function rampAt(k: number): number {
  const at = k * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(at));
  const a = Phaser.Display.Color.IntegerToColor(RAMP[i]!);
  const b = Phaser.Display.Color.IntegerToColor(RAMP[i + 1]!);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round((at - i) * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}
