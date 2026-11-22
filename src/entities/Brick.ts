import Phaser from 'phaser';
import { fgBrickTexture } from '../art/foreground';
import type { WorldId } from '../art/backdrops';
import { BRICK_TINT, LEVEL_OFFSET_Y } from '../config';
import { chipArmor } from '../core/Laser';
import { isBreakableKind, type BrickKind, type BrickSpec } from '../core/types';

export type BrickState = 'alive' | 'dormant' | 'dead';
/** `trigger`: an unbreakable brick that does something when hit, such as a switch. */
export type HitResult = 'immune' | 'armor' | 'damaged' | 'destroyed' | 'trigger';

export interface HitOptions {
  lethal?: boolean;
  stripArmor?: boolean;
  chip?: boolean;
}

/** `breach`: Descent clearing bricks that crossed the danger line. It never sets off explosives. */
export type DestroyCause = 'ball' | 'laser' | 'explosion' | 'fall' | 'ability' | 'breach';

/** Takes a brick's hits in its place: a boss, for the parts of its body. */
export interface BrickOwner {
  /** Called instead of Brick.takeHit for a live, breakable owned brick. Never 'destroyed'. */
  strike(brick: Brick, damage: number, cause: DestroyCause, opts: HitOptions): HitResult;
  /** A fireball smashes through this brick instead of bouncing off it. Never, when left out. */
  plowable?(brick: Brick): boolean;
}

export class Brick extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  life: BrickState = 'alive';
  /** Set on a boss part: hits go to the owner, and nothing but the owner removes the brick. */
  owner?: BrickOwner;
  /** Starts as the spec's kind. A virus can turn a plain brick into one of its own. */
  kind: BrickKind;
  /**
   * Balls and bolts collide with it. A ghostly phantom and an open gate are alive but not solid.
   * Explosions and abilities don't ask.
   */
  solid = true;
  health: number;
  armor: number;
  /** Laser damage banked toward breaking the next armor point. */
  armorBank = 0;
  readonly maxHealth: number;
  readonly maxArmor: number;
  /** Regen bricks in the same touching group share a cluster id. */
  cluster = -1;
  regrowAt = 0;
  /** Times this regen brick has grown back. */
  regrows = 0;
  /** A virus colony: the core's id, shared by every brick it infected. */
  colony = -1;
  /** A fuse brick the flame is already on its way to. */
  lit = false;
  /** A plain brick a virus is about to take over: it shows the veins. */
  infecting = false;
  falling = false;
  readonly homeX: number;
  /** Where the brick rests. Descent moves it down a row at a time. */
  homeY: number;
  /** How visible the brick's kind keeps it (a phantom's cycle, an open gate), times its health. */
  private fade = 1;
  private skin?: string;
  private crack?: Phaser.GameObjects.Image;
  private baseScaleX: number;
  private baseScaleY: number;
  private flashTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    readonly spec: BrickSpec,
    private readonly world: WorldId,
  ) {
    super(
      scene,
      spec.x + spec.width / 2,
      spec.y + LEVEL_OFFSET_Y + spec.height / 2,
      ...fgBrickTexture(scene, world, spec.texture),
    );
    this.kind = spec.kind;
    this.homeX = this.x;
    this.homeY = this.y;
    this.health = this.maxHealth = spec.health;
    this.armor = this.maxArmor = spec.armor;
    scene.add.existing(this);
    this.setDisplaySize(spec.width, spec.height);
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;
  }

  /** The texture the brick is drawn with now, which a virus can change from the spec's. */
  get textureName(): string {
    return this.skin ?? this.spec.texture;
  }

  get tintColor(): number {
    return BRICK_TINT[this.textureName] ?? 0xffffff;
  }

  get breakable(): boolean {
    return isBreakableKind(this.kind);
  }

  get isAlive(): boolean {
    return this.life === 'alive';
  }

  /** Stops the ball, a bolt or homing: alive, solid and unbreakable. Portals are let through. */
  get wall(): boolean {
    return this.isAlive && this.solid && !this.breakable && this.kind !== 'portal';
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
    this.refreshAlpha();
    return 'damaged';
  }

  /** How visible the brick's kind wants it, 0-1. Its damage dims it further. */
  setFade(fade: number): void {
    if (fade === this.fade) return;
    this.fade = fade;
    this.refreshAlpha();
  }

  private refreshAlpha(): void {
    this.setAlpha(this.fade * (0.35 + 0.65 * (Math.max(0, this.health) / this.maxHealth)));
    this.crack?.setAlpha(this.fade);
  }

  /** Redraws the brick with another texture, keeping its size. */
  reskin(texture: string): void {
    this.skin = texture;
    const [key, frame] = fgBrickTexture(this.scene, this.world, texture);
    this.setTexture(key, frame);
    const sx = this.scaleX / this.baseScaleX;
    const sy = this.scaleY / this.baseScaleY;
    this.setDisplaySize(this.spec.width, this.spec.height);
    this.baseScaleX = this.scaleX;
    this.baseScaleY = this.scaleY;
    this.setScale(this.baseScaleX * sx, this.baseScaleY * sy);
  }

  /** A virus takes the brick over: its art, and an extra hit to clear. */
  infect(colony: number, armor: number): void {
    this.kind = 'virus';
    this.colony = colony;
    this.armor = armor;
    this.armorBank = 0;
    this.health = this.maxHealth;
    this.refreshAlpha();
    this.reskin('brick_virus');
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
    this.regrows++;
    this.life = 'alive';
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.armorBank = 0;
    this.body.enable = true;
    this.setVisible(true);
    this.refreshAlpha();
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

  /** Armor cracks, or for a regen brick one crack per regrowth, so its last life shows. */
  private updateCracks(): void {
    const worn = this.kind === 'regen' ? this.regrows : 0;
    const stage = Math.min(2, Math.max(this.maxArmor - this.armor, worn));
    if (stage <= 0) {
      this.crack?.setVisible(false);
      return;
    }
    if (!this.crack) {
      this.crack = this.scene.add.image(this.x, this.y, 'crack1').setDepth(this.depth + 1);
      this.crack.setDisplaySize(this.spec.width, this.spec.height);
    }
    this.crack
      .setTexture(stage === 1 ? 'crack1' : 'crack2')
      .setVisible(true)
      .setAlpha(this.fade);
    this.crack.setDisplaySize(this.spec.width, this.spec.height);
  }
}
