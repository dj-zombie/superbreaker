import Phaser from 'phaser';
import { WORLD_IDS, type SceneryId, type WorldId } from '../../art/backdrops';
import { fgTexture } from '../../art/foreground';
import { BOSSES } from '../../bosses';
import { HEIGHT, WIDTH } from '../../config';
import type { ActorDef, ActorFrame, ActorId, Emote } from '../../core/cutscene';
import { BALL_SIZE } from '../../entities/Ball';
import { PADDLE_BASE_WIDTH } from '../../entities/Paddle';
import { softDiscTexture } from '../../ui/frames';
import { calm } from '../../ui/theme';

/** Under the ambient fields' front band and the board's particles, over the backdrop. */
export const ACTOR_DEPTH = 5;
const PADDLE_H = 24;

/**
 * Something that can stand on a cutscene's stage. The stage moves it, and asks for animations by
 * name; the rig draws however it likes, so a sprite sheet, a boss and the paddle all act the same.
 */
export interface ActorRig {
  readonly root: Phaser.GameObjects.Container;
  /** Its natural height in board units, which `ActorDef.size` scales to. */
  readonly height: number;
  /** Starts an animation by name; null goes back to the idle. Unknown names are ignored. */
  play(anim: string | null): void;
  /** Faces left or right; art is drawn facing right. */
  face(dir: 'left' | 'right'): void;
  /** A multiply tint over the whole actor, for the low tier's grade. */
  tint(color: number): void;
  /** A white flash, 0..1. */
  flash(amount: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

/** Builds a rig for an actor whose `sprite` starts with a registered prefix. */
export type RigBuilder = (
  scene: Phaser.Scene,
  def: ActorDef,
  arg: string,
  ctx: StageContext,
) => ActorRig | undefined;

export interface StageContext {
  /** The world the scene shows now, for rigs that dress per world. */
  world(): SceneryId;
}

const builders = new Map<string, RigBuilder>();

/**
 * Adds a kind of actor: `sprite: 'name:arg'` in a cast entry builds it with `build`. The game
 * registers `boss` and `breaker`; a rig such as the jack-in-the-box can register its own.
 */
export function registerActorRig(prefix: string, build: RigBuilder): void {
  builders.set(prefix, build);
}

/** True when `sprite` names something the stage can build: a built-in, or a loaded texture. */
export function knownSprite(scene: Phaser.Scene | undefined, sprite: string): boolean {
  const [prefix, arg] = splitSprite(sprite);
  if (builders.has(prefix)) {
    if (prefix === 'boss') return !!BOSSES[arg as keyof typeof BOSSES]?.sprite;
    return true;
  }
  return scene ? scene.textures.exists(sprite) : true;
}

function splitSprite(sprite: string): [string, string] {
  const i = sprite.indexOf(':');
  return i < 0 ? [sprite, ''] : [sprite.slice(0, i), sprite.slice(i + 1)];
}

/** The world sprite set that dresses a scenery: the carnival and the crucible borrow Hell's. */
function skinOf(world: SceneryId): WorldId {
  return (WORLD_IDS as readonly string[]).includes(world) ? (world as WorldId) : 'hell';
}

// ---------------------------------------------------------------------------------------------
// Built-in rigs.

/** An image, or a sheet whose animations come from the cast entry. */
class SpriteRig implements ActorRig {
  readonly root: Phaser.GameObjects.Container;
  readonly height: number;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private current: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    key: string,
    private readonly anims: Record<string, { key: string }>,
    private readonly idle: string | undefined,
    size: { width: number; height: number } | undefined,
  ) {
    this.sprite = scene.add.sprite(0, 0, key);
    if (size) this.sprite.setDisplaySize(size.width, size.height);
    this.height = this.sprite.displayHeight;
    this.root = scene.add.container(0, 0, [this.sprite]);
    this.play(null);
  }

  play(anim: string | null): void {
    const name = anim ?? this.idle ?? null;
    if (name === this.current) return;
    this.current = name;
    const a = name ? this.anims[name] : undefined;
    if (!a) {
      this.sprite.stop();
      return;
    }
    this.sprite.play(a.key);
  }

  face(dir: 'left' | 'right'): void {
    this.sprite.setFlipX(dir === 'left');
  }

  private color = 0xffffff;
  private flashing = false;

  tint(color: number): void {
    this.color = color;
    if (!this.flashing) this.sprite.setTint(color);
  }

  flash(amount: number): void {
    const on = amount > 0.02;
    if (on === this.flashing) return;
    this.flashing = on;
    if (on) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.sprite.setTint(this.color).setTintMode(Phaser.TintModes.MULTIPLY);
  }

  update(): void {}

  destroy(): void {
    this.root.destroy();
  }
}

/** Animations made once per scene for a sheet: `${prefix}:${name}`. */
function makeAnims(
  scene: Phaser.Scene,
  key: string,
  prefix: string,
  list: Record<string, { frames: readonly number[]; fps: number; loop?: boolean }>,
  looping: (name: string) => boolean,
): Record<string, { key: string }> {
  const out: Record<string, { key: string }> = {};
  for (const [name, a] of Object.entries(list)) {
    const animKey = `${prefix}:${name}`;
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: a.frames.map((frame) => ({ key, frame })),
        frameRate: a.fps,
        repeat: (a.loop ?? looping(name)) ? -1 : 0,
      });
    }
    out[name] = { key: animKey };
  }
  return out;
}

/**
 * The player: the paddle with the ball resting above it. `idle` bobs the ball, `bounce` hops it,
 * `launch` sends it up and out of frame, and `still` holds it.
 */
class BreakerRig implements ActorRig {
  readonly root: Phaser.GameObjects.Container;
  readonly height = PADDLE_H + BALL_SIZE + 6;
  private readonly paddle: Phaser.GameObjects.Image;
  private readonly ball: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private anim = 'idle';
  private clock = 0;
  private animMs = 0;

  constructor(scene: Phaser.Scene, world: WorldId) {
    this.paddle = scene.add.image(0, this.height / 2 - PADDLE_H / 2, ...fgTexture(world, 'paddle'));
    this.paddle.setDisplaySize(PADDLE_BASE_WIDTH, PADDLE_H);
    this.ball = scene.add.image(0, 0, ...fgTexture(world, 'ball'));
    this.ball.setScale(BALL_SIZE / Math.max(1, this.ball.frame.width));
    this.glow = scene.add
      .image(0, 0, softDiscTexture(scene))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.35)
      .setDisplaySize(BALL_SIZE * 3, BALL_SIZE * 3);
    this.root = scene.add.container(0, 0, [this.glow, this.paddle, this.ball]);
    this.place();
  }

  private get rest(): number {
    return this.height / 2 - PADDLE_H - BALL_SIZE / 2 - 2;
  }

  play(anim: string | null): void {
    const name = anim ?? 'idle';
    if (name === this.anim) return;
    this.anim = name;
    this.animMs = 0;
  }

  face(): void {}

  private color = 0xffffff;
  private flashing = false;

  tint(color: number): void {
    this.color = color;
    if (this.flashing) return;
    this.paddle.setTint(color);
    this.ball.setTint(color);
  }

  flash(amount: number): void {
    const on = amount > 0.02;
    if (on === this.flashing) return;
    this.flashing = on;
    for (const o of [this.paddle, this.ball]) {
      if (on) o.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else o.setTint(this.color).setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  update(dtMs: number): void {
    this.clock += dtMs;
    this.animMs += dtMs;
    this.place();
  }

  private place(): void {
    const still = calm();
    let lift = 0;
    let spin = 0;
    if (this.anim === 'idle' && !still) lift = 2 + 2 * Math.sin(this.clock / 260);
    if (this.anim === 'bounce') {
      const k = (this.animMs % 520) / 520;
      lift = still ? 6 : 22 * Math.sin(Math.PI * k);
      spin = this.animMs * 0.4;
    }
    if (this.anim === 'launch') {
      const k = Math.min(1, this.animMs / 700);
      lift = still ? (k >= 1 ? HEIGHT : 0) : HEIGHT * k * k;
      spin = this.animMs * 0.9;
    }
    this.ball.setPosition(0, this.rest - lift).setAngle(spin);
    this.glow.setPosition(0, this.rest - lift).setVisible(lift < HEIGHT * 0.5);
  }

  destroy(): void {
    this.root.destroy();
  }
}

registerActorRig('breaker', (scene, _def, _arg, ctx) => new BreakerRig(scene, skinOf(ctx.world())));

/** A boss from its own sheet, with the fight's animations: idle, tell, open, hurt, death. */
registerActorRig('boss', (scene, def, arg) => {
  const boss = BOSSES[arg as keyof typeof BOSSES];
  const sheet = boss?.sprite;
  if (!sheet || !scene.textures.exists(sheet.key)) return undefined;
  const anims = {
    ...makeAnims(
      scene,
      sheet.key,
      `cast-${sheet.key}`,
      sheet.anims,
      (n) => n === 'idle' || n === 'tell',
    ),
    ...(def.anims
      ? makeAnims(scene, sheet.key, `cast-${sheet.key}-${def.name}`, def.anims, () => true)
      : {}),
  };
  return new SpriteRig(scene, sheet.key, anims, def.idle ?? 'idle', {
    width: sheet.width,
    height: sheet.height,
  });
});

// ---------------------------------------------------------------------------------------------

interface Live {
  id: ActorId;
  def: ActorDef;
  rig: ActorRig;
  light?: Phaser.GameObjects.Image;
  emote?: { kind: Emote; ms: number };
  base: number;
}

const EMOTE_MS: Record<Emote, number> = {
  bounce: 380,
  shake: 420,
  nod: 320,
  shiver: 700,
  flash: 260,
};

/**
 * The cast on stage. Each frame it takes the sampled poses and puts every actor where the script
 * says, plus whatever emote is playing. Actors are built on their first frame with any opacity.
 */
export class ActorStage {
  private live = new Map<ActorId, Live>();
  private tintColor = 0xffffff;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cast: Record<ActorId, ActorDef>,
    private readonly ctx: StageContext,
  ) {}

  /** Every object the stage has made, so a caller can keep them off its other cameras. */
  objects(): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    for (const a of this.live.values()) {
      out.push(a.rig.root);
      if (a.light) out.push(a.light);
    }
    return out;
  }

  /** Where an actor is now, in world px; undefined before it is built. */
  where(id: ActorId): { x: number; y: number; top: number } | undefined {
    const a = this.live.get(id);
    if (!a) return undefined;
    const r = a.rig.root;
    return { x: r.x, y: r.y, top: r.y - (a.rig.height * r.scaleY) / 2 };
  }

  emote(id: ActorId, kind: Emote): void {
    const a = this.live.get(id);
    if (!a || (calm() && kind !== 'flash' && kind !== 'nod')) return;
    a.emote = { kind, ms: 0 };
  }

  tint(color: number): void {
    this.tintColor = color;
    for (const a of this.live.values()) a.rig.tint(color);
  }

  apply(frames: readonly ActorFrame[], dtMs: number): void {
    for (const f of frames) {
      let a = this.live.get(f.id);
      if (!a) {
        if (f.alpha <= 0) continue;
        const built = this.build(f.id);
        if (!built) continue;
        a = built;
      }
      const r = a.rig.root;
      let x = f.x * WIDTH;
      let y = f.y * HEIGHT;
      let angle = f.angle;
      let flash = 0;
      if (a.emote) {
        a.emote.ms += dtMs;
        const k = Math.min(1, a.emote.ms / EMOTE_MS[a.emote.kind]);
        switch (a.emote.kind) {
          case 'bounce':
            y -= Math.sin(Math.PI * k) * 14;
            break;
          case 'shake':
            x += Math.sin(k * 40) * 6 * (1 - k);
            break;
          case 'nod':
            y += Math.sin(Math.PI * 2 * k) * 4;
            break;
          case 'shiver':
            x += (Math.random() - 0.5) * 3 * (1 - k);
            angle += (Math.random() - 0.5) * 2 * (1 - k);
            break;
          case 'flash':
            flash = 1 - k;
            break;
        }
        if (k >= 1) a.emote = undefined;
      }
      r.setPosition(x, y)
        .setScale(a.base * f.scale)
        .setAngle(angle)
        .setAlpha(f.alpha)
        .setVisible(f.alpha > 0.001);
      a.rig.face(f.face);
      a.rig.play(f.anim);
      a.rig.flash(flash);
      a.rig.update(dtMs);
      if (a.light && a.def.light) {
        const glow = 0.85 + 0.15 * Math.sin(this.scene.time.now / 340);
        a.light
          .setPosition(x, y)
          .setAlpha(f.alpha * (a.def.light.intensity ?? 0.6) * (calm() ? 1 : glow))
          .setVisible(f.alpha > 0.001);
      }
    }
  }

  private build(id: ActorId): Live | undefined {
    const def = this.cast[id];
    if (!def?.sprite) return undefined;
    const rig = this.rig(def, id);
    if (!rig) return undefined;
    rig.root.setDepth(ACTOR_DEPTH);
    if (this.tintColor !== 0xffffff) rig.tint(this.tintColor);
    const base = def.size ? def.size / Math.max(1, rig.height) : 1;
    let light: Phaser.GameObjects.Image | undefined;
    if (def.light) {
      const d = def.light.radius * 2;
      light = this.scene.add
        .image(0, 0, softDiscTexture(this.scene))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(def.light.color)
        .setDisplaySize(d, d)
        .setDepth(ACTOR_DEPTH - 0.5);
    }
    const live: Live = { id, def, rig, light, base };
    this.live.set(id, live);
    return live;
  }

  private rig(def: ActorDef, id: ActorId): ActorRig | undefined {
    const sprite = def.sprite!;
    const [prefix, arg] = splitSprite(sprite);
    const build = builders.get(prefix);
    if (build) return build(this.scene, def, arg, this.ctx);
    if (!this.scene.textures.exists(sprite)) {
      console.warn(`[cutscene] no texture "${sprite}" for ${id}`);
      return undefined;
    }
    const anims = def.anims
      ? makeAnims(this.scene, sprite, `cast-${id}`, def.anims, () => true)
      : {};
    return new SpriteRig(this.scene, sprite, anims, def.idle, undefined);
  }

  destroy(): void {
    for (const a of this.live.values()) {
      a.rig.destroy();
      a.light?.destroy();
    }
    this.live.clear();
  }
}
