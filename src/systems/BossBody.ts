import type Phaser from 'phaser';
import { BOSS_ANIMS, BOSS_ID_BASE, ENTRANCE_DROP, SPRITE_DEPTH, type BossAnim } from '../core/Boss';
import { BH, BRICK_HEALTH, BW } from '../core/procgen/grid';
import type { BrickSpec } from '../core/types';
import type { Brick, BrickOwner } from '../entities/Brick';
import { calm } from '../ui/theme';
import { audio } from './AudioSystem';
import type { ArenaBrick, BossDef, BossHost, PartDef, Pose } from './BossDirector';
import type { BossRig } from './BossRig';
import type { Light } from './LightingSystem';

/** These animations loop. The others play once and hold their last frame. */
const LOOPING: readonly BossAnim[] = ['idle', 'tell', 'open'];
/** The flinch swells the sprite to this many times its size... */
const PUNCH_SCALE = 1.04;
/** ...taking this long each way, in ms. */
const PUNCH_MS = 60;
/** The sprite is solid this far through its entrance, 0..1, so a glimpse in the dark has a shape to show. */
const ARRIVE_SOLID = 0.6;
/** The sprite of a dead boss fades out over this long, in ms. */
const FADE_MS = 300;
/** Dev tools: a point this far inside a part's edge, in px, counts as inside the part. */
const PROBE_INSET = 2;
/** Dev tools: how solid the parts show over the sprite under `?debug`. */
const DEBUG_PART_ALPHA = 0.35;
/** A part's own light smoulders at this pace, in the flicker preset's speed. */
const GLOW_REST_SPEED = 0.55;
/** An opening strobes the light this many times a second, under the flash limit. */
const GLOW_OPEN_HZ = 2.2;
/** An opening flares a part's light by this much, and reaches this much farther. */
const GLOW_OPEN_GAIN = 1.75;
const GLOW_OPEN_REACH = 1.4;
/** The hot point drawn on the picture over a part's light, in px of radius. */
const GLOW_HALO = 16;

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
  /** The picture in pieces, for a boss drawn by a rig instead of a sheet. */
  private rig?: BossRig;
  /** Where every standing part is, handed to the rig. One map, refilled, so a frame allocates nothing. */
  private readonly spots = new Map<string, { x: number; y: number }>();
  /** The sprite's scale at rest, which the flinch punches from. */
  private scaleX = 1;
  private scaleY = 1;
  private punch?: Phaser.Tweens.Tween;
  /** How far above its place the sprite hangs while it arrives, in px. */
  private lift = 0;
  private playing?: BossAnim;
  /** A part's light, shining on the picture while the part itself is hidden. */
  private readonly glows = new Map<Brick, Light>();
  /** Which way the part lights are burning, so a strobe is not restarted every frame. */
  private glowing: 'rest' | 'open' | 'out' = 'rest';
  /** The next brick id to hand out, counting up from BOSS_ID_BASE past the level's own. */
  private nextId: number;

  /** Queues the boss's sheet, or its rig's pieces. Call from a scene's preload. */
  static preload(scene: Phaser.Scene, def: BossDef): void {
    for (const a of def.rig?.assets ?? []) {
      if (!scene.textures.exists(a.key)) scene.load.image(a.key, `assets/${a.path}`);
    }
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
    private health: (part: string) => number | undefined = () => undefined,
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
    this.addRig(bricks);
    if (!this.rig) this.addSprite(bricks);
    this.addGlows();
  }

  /** Centre of the body, now. */
  get center(): { x: number; y: number } {
    return { x: this.anchor.x + this.drift.x, y: this.anchor.y + this.drift.y };
  }

  /** Where a camera should look: the middle of the picture, or of the parts when there is none. */
  get focus(): { x: number; y: number } {
    const { sprite, rig } = this;
    if (rig) return rig.focus;
    return sprite ? { x: sprite.x, y: sprite.y + this.lift } : this.center;
  }

  /** The rig drawing the boss, when it has one. */
  get rigged(): BossRig | undefined {
    return this.rig;
  }

  /** The brick standing in for a part, or undefined once it is retired. */
  part(id: string): Brick | undefined {
    return this.bricks.get(id);
  }

  /** The part a brick stands in for, or undefined when the brick is not one of this body's. */
  partOf(brick: Brick): PartDef | undefined {
    return this.defs.get(brick);
  }

  /** A part ran out of health: it comes off the field, and the picture shows it break. */
  break(id: string): void {
    if (!this.part(id)) return;
    this.retire(id);
    this.rig?.broken(id);
  }

  /** Takes parts off the field for good, with no score, drops or chain. */
  retire(...ids: string[]): void {
    const gone: Brick[] = [];
    for (const id of ids) {
      const brick = this.part(id);
      if (!brick) continue;
      this.bricks.delete(id);
      this.defs.delete(brick);
      this.glows.get(brick)?.kill();
      this.glows.delete(brick);
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
      anchor.y + drift.y + (sheet?.dy ?? 0) - this.lift,
    );
  }

  /**
   * The rig's frame: where everything stands, the beat and how far the fight is. `dt` is
   * fight-clock ms. A boss drawn by a sheet has nothing to do here.
   */
  tick(dt: number, beats: number, progress: number): void {
    const rig = this.rig;
    if (!rig) return;
    this.spots.clear();
    for (const [id, brick] of this.bricks) this.spots.set(id, brick);
    rig.beat(beats);
    rig.progress(progress);
    rig.place(this.center, this.spots, dt);
  }

  /**
   * The entrance, `t` from 0 to 1: the sprite fades in as it drops onto its place. A look only:
   * the hit zones stand where they are, and under reduced motion the sprite fades without the drop.
   */
  arrive(t: number): void {
    const k = Math.max(0, Math.min(1, t));
    this.lift = calm() ? 0 : ENTRANCE_DROP * (1 - k);
    this.sprite?.setAlpha(Math.min(1, k / ARRIVE_SOLID));
    this.rig?.arrive(k);
  }

  /**
   * How the part lights burn. `rest` is a smoulder, `open` a strobe while the boss can be hit,
   * and `out` puts them out, as when the eye burns away.
   */
  glow(kind: 'rest' | 'open' | 'out'): void {
    const changed = kind !== this.glowing;
    this.glowing = kind;
    for (const [brick, light] of this.glows) {
      if (brick.life === 'dead') {
        light.kill();
        this.glows.delete(brick);
        continue;
      }
      const spec = this.defs.get(brick)?.light;
      if (!spec || kind === 'out') {
        light.intensity = 0;
        continue;
      }
      const open = kind === 'open';
      light.flicker = open ? 'strobe' : 'candle';
      light.speed = open ? GLOW_OPEN_HZ : GLOW_REST_SPEED;
      light.intensity = spec.intensity * (open ? GLOW_OPEN_GAIN : 1);
      light.radius = spec.radius * (open ? GLOW_OPEN_REACH : 1);
      // Start the strobe lit, so the opening reads on the frame it begins.
      if (open && changed) light.phase = -this.host.lighting.time;
    }
  }

  /** Plays an animation, unless it is the one already playing. */
  show(anim: BossAnim): void {
    if (this.playing === anim) return;
    this.playing = anim;
    this.sprite?.play(this.animKey(anim));
    this.rig?.show(anim);
  }

  /** The scale punch that goes with a hit. A look only: the hit zones do not change. */
  flinch(): void {
    this.rig?.flinch();
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
    this.rig?.fade();
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
    for (const light of this.glows.values()) light.kill();
    this.glows.clear();
    this.dropSprite();
    this.rig?.destroy();
    this.rig = undefined;
  }

  /** The rig, when the boss has one and every piece of it loaded. It hides the parts under it. */
  private addRig(parts: readonly Brick[]): void {
    const { scene, lighting, juice, scenery } = this.host;
    const factory = this.def.rig;
    if (!factory || !factory.assets.every((a) => scene.textures.exists(a.key))) return;
    const homes = new Map<string, { x: number; y: number }>();
    for (const [id, brick] of this.bricks) homes.set(id, { x: brick.homeX, y: brick.homeY });
    this.rig = factory.create({
      scene,
      lighting,
      juice,
      scenery,
      anchor: this.anchor,
      homes,
      health: (id) => this.health(id),
      sfx: (key, volume, detune = 0, x) => audio.sfx(key, volume, detune, x === undefined ? undefined : { x }),
      calm: calm(),
    });
    for (const brick of parts) {
      if (SHOW_PARTS) brick.setAlpha(DEBUG_PART_ALPHA).setDepth(SPRITE_DEPTH + 1);
      else brick.setVisible(false);
    }
    this.show('idle');
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

  /**
   * A light for every part that has one. It follows the part. Under a picture the part is hidden,
   * so the light is told to keep shining, and a hot point is drawn on the eye.
   */
  private addGlows(): void {
    const pictured = !!this.sprite || !!this.rig;
    for (const [brick, part] of this.defs) {
      const glow = part.light;
      if (!glow) continue;
      this.glows.set(
        brick,
        this.host.lighting.addLight({
          follow: brick,
          color: glow.color,
          radius: glow.radius,
          intensity: glow.intensity,
          flicker: 'candle',
          speed: GLOW_REST_SPEED,
          priority: 8,
          covered: true,
          halo: pictured ? GLOW_HALO : 0,
          haloAlpha: 0.9,
          haloDepth: SPRITE_DEPTH + 2,
        }),
      );
    }
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
