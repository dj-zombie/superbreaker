import type Phaser from 'phaser';
import { BOSS_ANIMS, BOSS_ID_BASE, SPRITE_DEPTH, type BossAnim } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import type { BrickSpec } from '../core/types';
import type { Brick, BrickOwner } from '../entities/Brick';
import { calm } from '../ui/theme';
import type { ArenaBrick, BossDef, BossHost, PartDef, Pose } from './BossDirector';

/** These animations loop. The others play once and hold their last frame. */
const LOOPING: readonly BossAnim[] = ['idle', 'tell', 'open'];
/** The flinch swells the sprite to this many times its size... */
const PUNCH_SCALE = 1.04;
/** ...taking this long each way, in ms. */
const PUNCH_MS = 60;
/** The sprite of a dead boss fades out over this long, in ms. */
const FADE_MS = 300;
/** Dev tools: a point this far inside a part's edge, in px, counts as inside the part. */
const PROBE_INSET = 2;
/** Dev tools: how solid the parts show over the sprite under `?debug`. */
const DEBUG_PART_ALPHA = 0.35;

/** Dev builds only: `?debug` shows the hit zones over the sprite. */
const SHOW_PARTS =
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('debug');

/** A part as the brick that stands in for it. It has no armor and never slides or regrows. */
function partSpec(part: PartDef, id: number): BrickSpec {
  const spec: BrickSpec = {
    id,
    x: part.col * BW,
    y: part.row * BH,
    width: part.cols * BW,
    height: part.rows * BH,
    texture: part.texture,
    kind: part.kind ?? 'normal',
    health: BRICK_HEALTH,
    armor: 0,
    moveX: 0,
    moveSpeed: 0,
    regenDelay: 0,
  };
  if (part.light) spec.light = part.light;
  return spec;
}

/** Moves `p` toward (x, y), by `step` px at most. */
function approach(p: { x: number; y: number }, x: number, y: number, step: number): void {
  const dx = x - p.x;
  const dy = y - p.y;
  const far = Math.hypot(dx, dy);
  if (far <= step) {
    p.x = x;
    p.y = y;
  } else {
    p.x += (dx / far) * step;
    p.y += (dy / far) * step;
  }
}

/**
 * The body of a boss: its parts, standing in the level as bricks the boss owns, and the picture
 * drawn over them. With a picture the parts are invisible hit zones; without one they show as
 * bricks, and everything else is the same.
 */
export class BossBody {
  /** Standing parts by part id. A retired part is forgotten. */
  private readonly bricks = new Map<string, Brick>();
  private readonly defs = new Map<Brick, PartDef>();
  /** Centre of the box around every part at rest. The sprite hangs from it. */
  private readonly anchor: { x: number; y: number };
  /** Where the whole body is now, as an offset from rest. */
  private readonly drift = { x: 0, y: 0 };
  /** The pose the parts are moving to. */
  private posed: Pose = {};
  private sprite?: Phaser.GameObjects.Sprite;
  /** The sprite's scale at rest, which the flinch punches from. */
  private scaleX = 1;
  private scaleY = 1;
  private punch?: Phaser.Tweens.Tween;
  private playing?: BossAnim;
  /** The next brick id to hand out, counting up from BOSS_ID_BASE past the level's own. */
  private nextId: number;

  /** Queues the boss's sheet. Call from a scene's preload. */
  static preload(scene: Phaser.Scene, def: BossDef): void {
    const sheet = def.sprite;
    if (!sheet || scene.textures.exists(sheet.key)) return;
    scene.load.spritesheet(sheet.key, `assets/${sheet.path}`, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
  }

  constructor(
    private def: BossDef,
    private host: BossHost,
    owner: BrickOwner,
  ) {
    const specs = def.parts.map((part, i) => partSpec(part, BOSS_ID_BASE + i));
    this.nextId = BOSS_ID_BASE + specs.length;
    const bricks = host.bricks.append(specs, owner);
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    bricks.forEach((brick, i) => {
      const part = def.parts[i]!;
      this.bricks.set(part.id, brick);
      this.defs.set(brick, part);
      left = Math.min(left, brick.homeX - brick.spec.width / 2);
      right = Math.max(right, brick.homeX + brick.spec.width / 2);
      top = Math.min(top, brick.homeY - brick.spec.height / 2);
      bottom = Math.max(bottom, brick.homeY + brick.spec.height / 2);
    });
    this.anchor = { x: (left + right) / 2, y: (top + bottom) / 2 };
    host.bricksAdded(bricks, false);
    this.addSprite(bricks);
  }

  /** Centre of the body, now. */
  get center(): { x: number; y: number } {
    return { x: this.anchor.x + this.drift.x, y: this.anchor.y + this.drift.y };
  }

  /** The brick standing in for a part, or undefined once it is retired. */
  part(id: string): Brick | undefined {
    return this.bricks.get(id);
  }

  /** The part a brick stands in for, or undefined when the brick is not one of this body's. */
  partOf(brick: Brick): PartDef | undefined {
    return this.defs.get(brick);
  }

  /** Takes parts off the field for good, with no score, drops or chain. */
  retire(...ids: string[]): void {
    const gone: Brick[] = [];
    for (const id of ids) {
      const brick = this.part(id);
      if (!brick) continue;
      this.bricks.delete(id);
      this.defs.delete(brick);
      gone.push(brick);
    }
    this.host.bricks.retire(gone);
  }

  /** Adds ordinary bricks to the arena: nobody owns them, so they break, score and drop. */
  spawn(bricks: readonly ArenaBrick[]): Brick[] {
    const added = this.host.bricks.append(bricks.map((b) => ({ ...b, id: this.nextId++ })));
    this.host.bricksAdded(added, false);
    return added;
  }

  /** Sets the pose the parts move to. Undefined is rest. */
  pose(pose: Pose | undefined): void {
    this.posed = pose ?? {};
  }

  /**
   * Moves the body toward `offset` from rest and each part toward its place in the pose, nothing
   * travelling further than `step` px. The sprite goes with the body, not with the poses.
   */
  move(offset: Readonly<{ x: number; y: number }>, step: number): void {
    const { anchor, drift } = this;
    // The body as a whole is held to the step, so the picture and its hit zones stay together.
    approach(drift, offset.x, offset.y, step);
    for (const [id, brick] of this.bricks) {
      const shift = this.posed[id];
      const x = brick.homeX + drift.x + (shift?.dx ?? 0);
      const y = brick.homeY + drift.y + (shift?.dy ?? 0);
      approach(brick, x, y, step);
      brick.syncOverlay();
    }
    const sheet = this.def.sprite;
    this.sprite?.setPosition(
      anchor.x + drift.x + (sheet?.dx ?? 0),
      anchor.y + drift.y + (sheet?.dy ?? 0),
    );
  }

  /** Plays an animation, unless it is the one already playing. */
  show(anim: BossAnim): void {
    if (this.playing === anim) return;
    this.playing = anim;
    this.sprite?.play(this.animKey(anim));
  }

  /** The scale punch that goes with a hit. A look only: the hit zones do not change. */
  flinch(): void {
    const sprite = this.sprite;
    if (!sprite || calm()) return;
    this.punch?.stop();
    sprite.setScale(this.scaleX, this.scaleY);
    this.punch = this.host.scene.tweens.add({
      targets: sprite,
      scaleX: this.scaleX * PUNCH_SCALE,
      scaleY: this.scaleY * PUNCH_SCALE,
      duration: PUNCH_MS,
      ease: 'Sine.Out',
      yoyo: true,
    });
  }

  /** The boss is dead: its picture fades away. */
  fade(): void {
    const sprite = this.sprite;
    if (!sprite) return;
    this.host.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: FADE_MS,
      onComplete: () => this.dropSprite(),
    });
  }

  /** Dev tools: whether a point is inside a standing part, PROBE_INSET in from its edges. */
  holds(x: number, y: number): boolean {
    for (const brick of this.bricks.values()) {
      // The spec's size, not the display size: a hit flash swells a brick for a moment.
      const halfW = brick.spec.width / 2 - PROBE_INSET;
      const halfH = brick.spec.height / 2 - PROBE_INSET;
      if (Math.abs(x - brick.x) < halfW && Math.abs(y - brick.y) < halfH) return true;
    }
    return false;
  }

  destroy(): void {
    this.dropSprite();
  }

  private animKey(anim: BossAnim): string {
    return `${this.def.id}-${anim}`;
  }

  /** The picture, when the boss has one and its sheet loaded. It hides the parts under it. */
  private addSprite(parts: readonly Brick[]): void {
    const { scene, lighting } = this.host;
    const sheet = this.def.sprite;
    if (!sheet || !scene.textures.exists(sheet.key)) return;
    for (const anim of BOSS_ANIMS) {
      const key = this.animKey(anim);
      if (scene.anims.exists(key)) continue;
      const { frames, fps } = sheet.anims[anim];
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheet.key, { frames }),
        frameRate: fps,
        repeat: LOOPING.includes(anim) ? -1 : 0,
      });
    }
    const sprite = scene.add
      .sprite(this.anchor.x + (sheet.dx ?? 0), this.anchor.y + (sheet.dy ?? 0), sheet.key)
      .setDepth(SPRITE_DEPTH)
      .setDisplaySize(sheet.width, sheet.height);
    this.scaleX = sprite.scaleX;
    this.scaleY = sprite.scaleY;
    this.sprite = sprite;
    lighting.addLit(sprite);
    for (const brick of parts) {
      if (SHOW_PARTS) brick.setAlpha(DEBUG_PART_ALPHA).setDepth(SPRITE_DEPTH + 1);
      else brick.setVisible(false);
    }
    this.show('idle');
  }

  /** Takes the picture away, whichever way the fight ended. */
  private dropSprite(): void {
    const sprite = this.sprite;
    if (!sprite) return;
    this.sprite = undefined;
    this.punch?.stop();
    this.punch = undefined;
    this.host.lighting.removeLit(sprite);
    // Does nothing when a scene shutting down has destroyed it already.
    sprite.destroy();
  }
}
