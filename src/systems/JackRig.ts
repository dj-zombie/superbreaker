import Phaser from 'phaser';
import type { RailGun } from '../core/RailGun';
import { calm } from '../ui/theme';

type Point = readonly [number, number];

/**
 * A jack-in-the-box drawn in parts, every part cut on one canvas so they line up drawn at one
 * place. Points are pixels on that canvas.
 */
export interface JackLook {
  keys: {
    /** The shut box, and the open one without its clown, lid or crank. */
    closed: string;
    open: string;
    /** The open box's front: drawn over the clown, so he sinks into the box behind it. */
    front: string;
    lid: string;
    spring: string;
    /** His head thrown back, mouth open to the sky: both guns fire out of it. */
    head: string;
    /** His head when the gun jams, and the puff of smoke that comes with it. */
    dazed: string;
    puff: string;
    /** Each box's crank handle, below its axle, so it turns. */
    crank: string;
    crankOpen: string;
  };
  /** The canvas's width over the paddle's. */
  width: number;
  /** How far the box's feet stand under the paddle's middle, in px. */
  drop: number;
  /** Where the spring stands in the box, and where it meets his neck at rest. */
  springBase: Point;
  neck: Point;
  /** The glow in his open mouth, where both guns fire from; it is kept over the paddle's middle. */
  mouth: Point;
  /** The middle of the lid's hinge. */
  hinge: Point;
  /** Each crank's axle, where the handle hangs from. */
  crankAxle: Point;
  crankAxleOpen: Point;
  puff: Point;
  /** Along the box's front rim, for the capacitor's lamps. */
  rim: readonly Point[];
}

/** The shot kicks him this far above the top of the spring, in canvas px, and he boings back. */
const KICK = 24;
const BOING_MS = 700;
/** He leans this many degrees off a shot, one way then the other; the head flops more. */
const LEAN = 8;
const HEAD_FLOP = 1.5;
/** The lid flies open from this share of its height and settles. */
const LID_FROM = 0.15;
const LID_MS = 260;
/** He stays out this long after a shot, in ms: longer than a recharge, so held fire keeps him up. */
const HOLD_MS = 600;
/** Back into the box: he ducks down this deep, in canvas px, then the lid swings shut. */
const SINK = 215;
const SINK_MS = 230;
/** How far he bobs up before he ducks, as the Back ease's overshoot. */
const SINK_BOB = 0.9;
const LID_SHUT_MS = 90;
/** The box squashes this flat as it slams, and bounces back. */
const SLAM = 0.84;
const SLAM_MS = 260;
/** Winding up: the spring sinks this far as the capacitor fills toward the sweet spot. */
const COIL = 14;
/** In the sweet spot he shakes this much, in canvas px, and the lid rattles this many degrees. */
const SHAKE = 2.4;
const RATTLE = 0.06;
/** The crank's turns a second, while the capacitor fills. */
const CRANK_TURNS = 3;
/**
 * Firing the sidearm he throws his head back and stretches this much taller, in canvas px, over
 * about TIP_MS. Each shot knocks his head down by up to RECOIL px.
 */
const STRETCH = 26;
const TIP_MS = 90;
const RECOIL = 5;
const RECOIL_BACK = 0.12;
/** Jammed, he slumps this many degrees and sags this far. */
const SLUMP = -16;
const SAG = 10;
/** Its drop shadow, as a share of its width, and how dark. */
const DROP_SHADOW: Point = [0.04, 0.025];
const DROP_ALPHA = 0.5;
/** The carnival's light on it: warm, a touch dimmer than the targets in their spot. */
const TINT = 0xe6d8d0;

interface Parts {
  root: Phaser.GameObjects.Container;
  closed: Phaser.GameObjects.Image;
  open: Phaser.GameObjects.Image;
  lid: Phaser.GameObjects.Image;
  spring: Phaser.GameObjects.Image;
  head: Phaser.GameObjects.Image;
  crank: Phaser.GameObjects.Image;
  crankOpen: Phaser.GameObjects.Image;
  front?: Phaser.GameObjects.Image;
  puff?: Phaser.GameObjects.Image;
}

type Mode = 'closed' | 'open' | 'return';

/** His height off the spring's rest (down is +), his lean, the lid's height, the box's squash. */
interface Anim {
  dy: number;
  lean: number;
  lid: number;
  squash: number;
}

/**
 * The shooting gallery's gun: a jack-in-the-box. The clown pops out on a shot, boings, and ducks
 * back in when the shooting stops; the crank winds and the box rattles as the capacitor fills.
 * It holds no rules: it is told what happened.
 */
export class JackRig {
  private readonly main: Parts;
  private readonly shadow: Parts;
  private readonly floor: Phaser.GameObjects.Image;
  private readonly w: number;
  private readonly h: number;
  private mode: Mode = 'closed';
  private holdMs = 0;
  private dazed = false;
  private stowed = false;
  /** The sidearm is firing: he stays out, shaking. */
  private rattling = false;
  private clock = 0;
  private crankTurn = 0;
  private leanSide = 1;
  private readonly anim: Anim = { dy: 0, lean: 0, lid: 1, squash: 1 };
  /** Wound up by the capacitor, eased toward each frame: his sag, shake and the box's tremble. */
  private wind = 0;
  private shake = 0;
  /** 0..1, how far he has stretched up to fire the sidearm, and its latest shot's knock. */
  private tip = 0;
  private recoil = 0;
  private tweens: Phaser.Tweens.Tween[] = [];
  private scale = 1;
  private x = 0;
  private y = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly look: JackLook,
    depth: number,
    floorKey: string,
  ) {
    const src = scene.textures.get(look.keys.closed).getSourceImage();
    this.w = src.width;
    this.h = src.height;
    this.floor = scene.add
      .image(0, 0, floorKey)
      .setDepth(depth - 0.02)
      .setAlpha(0.7);
    this.shadow = this.build(depth - 0.01, true);
    this.main = this.build(depth, false);
    this.apply();
  }

  /** Where the box stands: `x` is the paddle's middle, `y` its feet, `width` how wide it draws. */
  place(x: number, y: number, width: number): void {
    this.scale = width / this.w;
    this.x = x - (this.look.mouth[0] - this.w / 2) * this.scale;
    this.y = y;
    this.apply();
  }

  /** Every update of play: the timers, and the wind-up from the gun as it stands. */
  update(rail: RailGun, dtMs: number): void {
    if (this.stowed) return;
    this.clock += dtMs;
    this.holdMs = this.rattling ? HOLD_MS : this.holdMs - dtMs;
    const jammedOut = rail.jammed && !rail.ready;
    if (this.mode === 'open' && this.holdMs <= 0 && !jammedOut) this.duck();

    const [from, to] = rail.spec.sweetSpot;
    const sweet = rail.inSweetSpot;
    let wind = 0;
    if (this.dazed) wind = SAG;
    else if (!rail.ready && rail.sinceMs < from) wind = COIL * (rail.sinceMs / from) ** 2;
    else if (sweet) wind = COIL;
    else if (!rail.ready && rail.sinceMs > to) wind = COIL * 0.4;
    const ease = Math.min(1, dtMs / 50);
    this.wind += (wind - this.wind) * ease;
    this.shake += (((sweet || this.rattling) && !calm() ? 1 : 0) - this.shake) * Math.min(1, dtMs / 30);
    this.tip += ((this.rattling ? 1 : 0) - this.tip) * Math.min(1, dtMs / TIP_MS);
    this.recoil = Math.max(0, this.recoil - dtMs * RECOIL_BACK);
    if (!rail.ready && !calm()) this.crankTurn += (dtMs / 1000) * CRANK_TURNS * Math.PI * 2;
  }

  /** A shot: out he pops, in a frame, and boings on his spring. */
  fire(): void {
    const wasShut = this.mode !== 'open';
    this.stop();
    this.mode = 'open';
    this.holdMs = HOLD_MS;
    this.setDazed(false);
    this.wind = 0;
    if (calm()) {
      Object.assign(this.anim, { dy: 0, lean: 0, lid: 1, squash: 1 });
    } else {
      this.leanSide = -this.leanSide;
      this.anim.dy = -KICK;
      this.anim.lean = LEAN * this.leanSide;
      this.tween({ dy: 0, lean: 0 }, BOING_MS, 'Elastic.Out', [1, 0.32]);
      this.anim.lid = wasShut ? LID_FROM : 1.12;
      this.tween({ lid: 1 }, LID_MS, 'Elastic.Out', [1, 0.4]);
      if (wasShut) {
        this.anim.squash = 0.9;
        this.tween({ squash: 1 }, 200, 'Back.Out');
      }
    }
    // The beam is drawn this frame, so he has to be out in it, not a frame later.
    this.apply();
  }

  /** The gun jammed: he slumps, dazed, with a puff of smoke. */
  jam(): void {
    if (this.mode !== 'open') this.fire();
    this.setDazed(true);
    if (calm()) {
      this.anim.lean = SLUMP;
      return;
    }
    this.stop();
    this.tween({ lean: SLUMP }, 420, 'Elastic.Out', [1, 0.35]);
    const puff = this.main.puff;
    if (puff) {
      const [px, py] = this.local(this.look.puff);
      puff.setPosition(px, py).setAlpha(1).setScale(0.7).setVisible(true);
      this.scene.tweens.add({
        targets: puff,
        x: px - 26,
        y: py - 18,
        scale: 1.5,
        alpha: 0,
        duration: 650,
        ease: 'Quad.Out',
        onComplete: () => puff.setVisible(false),
      });
    }
  }

  /** The sidearm started or stopped: he pops out for it and shakes until it stops. */
  rattle(on: boolean): void {
    this.rattling = on;
    if (!on) return;
    // Already out and slumped from a jam: the thrown-back head, without popping again.
    if (this.mode !== 'open') this.fire();
    else if (this.dazed) this.setDazed(false);
  }

  /** A sidearm shot left his mouth: it knocks his head. */
  shot(): void {
    if (!calm()) this.recoil = RECOIL * Phaser.Math.FloatBetween(0.6, 1);
  }

  /** The time is up: he ducks in and the box goes still. */
  stow(): void {
    this.stowed = true;
    this.rattling = false;
    this.wind = 0;
    this.shake = 0;
    this.tip = 0;
    this.recoil = 0;
    if (this.mode === 'open') this.duck();
  }

  /** Where the slug leaves him, at rest, in the world. */
  muzzle(): { x: number; y: number } {
    const [, my] = this.local(this.look.mouth);
    return {
      x: this.x + (this.look.mouth[0] - this.w / 2) * this.scale,
      y: this.y + my * this.scale,
    };
  }

  /** His mouth as he stands this frame, shaking and stretched, in the world. */
  mouthNow(): { x: number; y: number } {
    const { head, root } = this.main;
    const { mouth, neck } = this.look;
    const ox = mouth[0] - neck[0];
    const oy = mouth[1] - neck[1];
    const c = Math.cos(head.rotation);
    const s = Math.sin(head.rotation);
    const p = root
      .getLocalTransformMatrix()
      .transformPoint(head.x + ox * c - oy * s, head.y + ox * s + oy * c);
    return { x: p.x, y: p.y };
  }

  /** `n` points along the box's front rim, in the world, left to right. */
  lamps(n: number): { x: number; y: number }[] {
    const rim = this.look.rim;
    const lens = rim.slice(1).map((p, i) => Math.hypot(p[0] - rim[i]![0], p[1] - rim[i]![1]));
    const total = lens.reduce((a, b) => a + b, 0);
    const out: { x: number; y: number }[] = [];
    const root = this.main.root;
    for (let i = 0; i < n; i++) {
      let d = (total * (i + 0.5)) / n;
      let seg = 0;
      while (seg < lens.length - 1 && d > lens[seg]!) d -= lens[seg++]!;
      const a = rim[seg]!;
      const b = rim[seg + 1]!;
      const t = d / lens[seg]!;
      const [lx, ly] = this.local([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      const p = root.getLocalTransformMatrix().transformPoint(lx, ly);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  destroy(): void {
    this.stop();
    for (const parts of [this.main, this.shadow]) {
      if (parts.puff) this.scene.tweens.killTweensOf(parts.puff);
      parts.root.destroy();
    }
    this.floor.destroy();
  }

  private build(depth: number, shadow: boolean): Parts {
    const { scene, look } = this;
    const k = look.keys;
    const image = (key: string, at?: Point) => {
      const img = scene.add.image(0, 0, key);
      if (at) img.setOrigin(at[0] / this.w, at[1] / this.h);
      else img.setOrigin(0.5, 1);
      if (shadow) img.setTint(0x000000);
      else img.setTint(TINT);
      return img;
    };
    const parts: Parts = {
      root: scene.add.container(0, 0).setDepth(depth),
      lid: image(k.lid, look.hinge),
      open: image(k.open),
      spring: image(k.spring, look.springBase),
      head: image(k.head, look.neck),
      closed: image(k.closed),
      crank: image(k.crank, look.crankAxle),
      crankOpen: image(k.crankOpen, look.crankAxleOpen),
    };
    if (!shadow) {
      parts.front = image(k.front);
      parts.puff = image(k.puff, look.puff).setVisible(false);
    }
    const order = [parts.lid, parts.open, parts.spring, parts.head, parts.front, parts.closed];
    for (const o of [...order, parts.crank, parts.crankOpen, parts.puff]) if (o) parts.root.add(o);
    if (shadow) parts.root.setAlpha(DROP_ALPHA);
    return parts;
  }

  /** A canvas point, as a position in the box's container (its origin is the canvas's bottom middle). */
  private local(p: Point): [number, number] {
    return [p[0] - this.w / 2, p[1] - this.h];
  }

  /** Draws both copies of the box as things stand. */
  private apply(): void {
    const s = this.scale;
    const t = this.clock;
    const trembleX = this.shake * Math.sin(t / 19) * 0.6;
    const tilt = this.shake * Math.sin(t / 23) * 1.2;
    const squash = this.anim.squash * (1 + this.shake * 0.025 * Math.abs(Math.sin(t / 31)));
    const [dx, dy] = DROP_SHADOW;
    const width = this.w * s;
    this.pose(this.main, this.x + trembleX * s, this.y, s, squash, tilt);
    this.pose(
      this.shadow,
      this.x + trembleX * s + width * dx,
      this.y + width * dy,
      s,
      squash,
      tilt,
    );
    this.floor
      .setPosition(this.x + trembleX * s, this.y - 2)
      .setDisplaySize(width * 0.75, width * 0.14);
  }

  private pose(p: Parts, x: number, y: number, s: number, squash: number, tilt: number): void {
    const { look } = this;
    p.root
      .setPosition(x, y)
      .setScale(s, s * squash)
      .setAngle(tilt);
    const out = this.mode !== 'closed';
    p.closed.setVisible(!out);
    p.crank.setVisible(!out);
    for (const o of [p.open, p.lid, p.crankOpen, p.front]) o?.setVisible(out);

    const crank = out ? p.crankOpen : p.crank;
    const turn = Math.cos(this.crankTurn);
    crank.setPosition(...this.local(out ? look.crankAxleOpen : look.crankAxle));
    crank.setScale(1, Math.sign(turn || 1) * Math.max(0.25, Math.abs(turn)));
    if (!out) return;

    const shakeX = this.shake * SHAKE * Math.sin(this.clock / 11);
    p.lid
      .setPosition(...this.local(look.hinge))
      .setScale(1, this.anim.lid * (1 - this.shake * RATTLE * Math.abs(Math.sin(this.clock / 17))));

    const [bx, by] = this.local(look.springBase);
    const rest = look.springBase[1] - look.neck[1];
    const reach = rest - this.anim.dy - this.wind + this.tip * STRETCH - this.recoil;
    const lean = Phaser.Math.DegToRad(this.anim.lean);
    p.spring
      .setPosition(bx, by)
      .setVisible(reach > 2)
      .setScale(1, Math.max(0, reach) / rest)
      .setRotation(lean);
    p.head
      .setPosition(bx + Math.sin(lean) * reach + shakeX, by - Math.cos(lean) * reach)
      .setRotation(lean * HEAD_FLOP)
      .setVisible(this.mode === 'open' || reach > -rest * 2.2);
  }

  /** Back in the box: he ducks, the lid swings shut, and the box slams. */
  private duck(): void {
    this.stop();
    this.mode = 'return';
    if (calm()) {
      this.shut();
      return;
    }
    this.tween({ dy: SINK, lean: 0 }, SINK_MS, 'Back.In', [SINK_BOB], () => this.shut());
    this.tween({ lid: 0 }, LID_SHUT_MS, 'Quad.In', undefined, undefined, SINK_MS - LID_SHUT_MS);
  }

  private shut(): void {
    this.stop();
    this.mode = 'closed';
    this.setDazed(false);
    Object.assign(this.anim, { dy: 0, lean: 0, lid: 1 });
    if (calm()) return;
    this.anim.squash = SLAM;
    this.tween({ squash: 1 }, SLAM_MS, 'Back.Out', [3]);
  }

  private setDazed(dazed: boolean): void {
    if (this.dazed === dazed) return;
    this.dazed = dazed;
    this.showHead();
  }

  /** Dazed by a jam, else thrown back to fire. */
  private showHead(): void {
    const k = this.look.keys;
    const key = this.dazed ? k.dazed : k.head;
    this.main.head.setTexture(key);
    this.shadow.head.setTexture(key);
  }

  private tween(
    to: Partial<Anim>,
    duration: number,
    ease: string,
    easeParams?: number[],
    onComplete?: () => void,
    delay = 0,
  ): void {
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.anim,
        ...to,
        duration,
        ease,
        easeParams,
        onComplete,
        delay,
      }),
    );
  }

  private stop(): void {
    for (const t of this.tweens) t.stop();
    this.tweens = [];
  }
}
