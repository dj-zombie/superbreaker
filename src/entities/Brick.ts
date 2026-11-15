import Phaser from 'phaser';
import { fgTexture } from '../art/foreground';
import type { WorldId } from '../art/backdrops';
import { BRICK_TINT, LEVEL_OFFSET_Y } from '../config';
import { chipArmor } from '../core/Laser';
import type { BrickSpec } from '../core/types';

export type BrickState = 'alive' | 'dormant' | 'dead';
export type HitResult = 'immune' | 'armor' | 'damaged' | 'destroyed';

export interface HitOptions {
  lethal?: boolean;
  stripArmor?: boolean;
  chip?: boolean;
}

export class Brick extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  life: BrickState = 'alive';
  health: number;
  armor: number;
  /** Laser damage banked toward breaking the next armor point. */
  armorBank = 0;
  readonly maxHealth: number;
  readonly maxArmor: number;
  /** Regen bricks in the same touching group share a cluster id. */
  cluster = -1;
  regrowAt = 0;
  falling = false;
  readonly homeX: number;
  /** Where the brick rests. Descent moves it down a row at a time. */
  homeY: number;
  private crack?: Phaser.GameObjects.Image;
  private baseScaleX: number;
  private baseScaleY: number;
  private flashTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    readonly spec: BrickSpec,
    world: WorldId,
  ) {
    super(
      scene,
      spec.x + spec.width / 2,
      spec.y + LEVEL_OFFSET_Y + spec.height / 2,
      ...fgTexture(world, spec.texture),
    );
    this.homeX = this.x;
    this.homeY = this.y;
    this.health = this.maxHealth = spec.health;
    this.armor = this.maxArmor = spec.armor;
    scene.add.existing(this);
    this.setDisplaySize(spec.width, spec.height);
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;
  }

  get tintColor(): number {
    return BRICK_TINT[this.spec.texture] ?? 0xffffff;
  }

  get breakable(): boolean {
    return this.spec.kind !== 'steel';
  }

  get isAlive(): boolean {
    return this.life === 'alive';
  }

  /** The hit flash owns the tint until it finishes. */
  get flashing(): boolean {
    return this.flashTween !== undefined;
  }

  /** Corner tints from the lighting system, shared with the crack overlay. */
  applyLight(tl: number, tr: number, bl: number, br: number): void {
    if (this.flashTween) return;
    this.setTint(tl, tr, bl, br);
    this.crack?.setTint(tl, tr, bl, br);
  }

  /**
   * Applies a hit. `lethal` ignores health and armor (explosions, falling shatter). `chip` banks
   * the damage against armor instead of breaking a point per hit, for many small laser bolts.
   */
  takeHit(damage: number, opts: HitOptions = {}): HitResult {
    if (!this.isAlive) return 'immune';
    if (!this.breakable) return 'immune';
    if (opts.lethal) {
      this.health = 0;
      return 'destroyed';
    }
    if (this.armor > 0 && opts.chip && !opts.stripArmor) {
      const chipped = chipArmor(this.armor, this.armorBank, damage);
      this.armorBank = chipped.banked;
      if (chipped.armor !== this.armor) {
        this.armor = chipped.armor;
        this.updateCracks();
      }
      return 'armor';
    }
    if (this.armor > 0) {
      this.armor = opts.stripArmor ? 0 : this.armor - 1;
      this.armorBank = 0;
      this.updateCracks();
      if (!opts.stripArmor) return 'armor';
    }
    this.health -= damage;
    if (this.health <= 0) return 'destroyed';
    this.setAlpha(0.35 + 0.65 * (this.health / this.maxHealth));
    return 'damaged';
  }

  /** White flash and a small punch so every hit reads clearly. One tween drives both. */
  flash(): void {
    this.stopFlash();
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.flashTween = this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScaleX * 1.12,
      scaleY: this.baseScaleY * 1.2,
      duration: 50,
      yoyo: true,
      onYoyo: () => this.clearFlashTint(),
      onComplete: () => {
        this.flashTween = undefined;
      },
    });
  }

  private clearFlashTint(): void {
    if (this.active) this.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  private stopFlash(): void {
    if (!this.flashTween) return;
    this.flashTween.stop();
    this.flashTween = undefined;
    this.clearFlashTint();
    this.setScale(this.baseScaleX, this.baseScaleY);
  }

  setDormant(): void {
    this.stopFlash();
    this.life = 'dormant';
    this.body.enable = false;
    this.setVisible(false);
    this.crack?.setVisible(false);
  }

  regrow(): void {
    this.life = 'alive';
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.armorBank = 0;
    this.body.enable = true;
    this.setVisible(true).setAlpha(1);
    this.updateCracks();
    this.setScale(0.01);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.baseScaleX,
      scaleY: this.baseScaleY,
      duration: 280,
      ease: 'Back.Out',
    });
  }

  markDead(): void {
    this.stopFlash();
    this.life = 'dead';
    this.body.enable = false;
    this.crack?.destroy();
    this.crack = undefined;
  }

  syncOverlay(): void {
    this.crack?.setPosition(this.x, this.y);
  }

  override destroy(fromScene?: boolean): void {
    this.flashTween?.stop();
    this.flashTween = undefined;
    this.crack?.destroy();
    this.crack = undefined;
    super.destroy(fromScene);
  }

  private updateCracks(): void {
    const stage = Math.min(2, this.maxArmor - this.armor);
    if (stage <= 0) {
      this.crack?.setVisible(false);
      return;
    }
    if (!this.crack) {
      this.crack = this.scene.add.image(this.x, this.y, 'crack1').setDepth(this.depth + 1);
      this.crack.setDisplaySize(this.spec.width, this.spec.height);
    }
    this.crack.setTexture(stage === 1 ? 'crack1' : 'crack2').setVisible(true);
    this.crack.setDisplaySize(this.spec.width, this.spec.height);
  }
}
