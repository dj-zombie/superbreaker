import type Phaser from 'phaser';
import type { BonusStats, Medal } from '../core/Bonus';
import { fall, float, swing, type Path, type Point } from '../core/Motion';
import type { Rng } from '../core/Rng';
import type { BonusDef, BonusStage, Field, HitCause, Target, TargetSpec } from '../systems/BonusDirector';
import type { Collectible, CollectibleKind } from '../systems/CollectibleSystem';

/**
 * Piñata Fiesta: the ball is back. Piñatas swing on ropes over a row of candy. Every hit swings
 * one harder and shakes candy loose for the paddle to chase; a burst showers coins and throws in
 * more balls. The golden llama's burst, or the last few seconds, start the fiesta: fireballs and
 * twice the candy. Chase the candy, leave the chili. The medal counts coins.
 */

export const PINATA_KINDS = ['donkey', 'star', 'llama', 'mini'] as const;
export type PinataKind = (typeof PINATA_KINDS)[number];

/** One piñata of the sequence: how tough it is, what it pays, and where it hangs. */
export interface PinataTier {
  kind: PinataKind;
  hp: number;
  /** Coins it bursts into. */
  coins: number;
  /** Balls its burst throws in. */
  balls: number;
  /** Rope length once lowered, in px. */
  rope: number;
  /** Drawn size and hit box, in px. */
  size: number;
  hit: readonly [number, number];
  /** The rope's pivot across the field, 0..1. */
  at: number;
  /** What the burst shouts. */
  cheer: string;
}

export const PINATA_MS = 45_000;
/** The fiesta starts with this much left on the clock if the llama has not started it, in ms. */
export const FIESTA_LEFT_MS = 8_000;
/** The fiesta keeps at least this many balls in play. */
export const FIESTA_MIN_BALLS = 2;
/** The three piñatas, in order. After them, minis keep coming until the timer is out. */
export const PINATAS: readonly PinataTier[] = [
  { kind: 'donkey', hp: 5, coins: 12, balls: 1, rope: 150, size: 112, hit: [86, 82], at: 0.5, cheer: 'SMASH!' },
  { kind: 'star', hp: 7, coins: 18, balls: 1, rope: 160, size: 112, hit: [84, 84], at: 0.42, cheer: 'SMASH!' },
  { kind: 'llama', hp: 10, coins: 32, balls: 2, rope: 170, size: 128, hit: [96, 100], at: 0.5, cheer: 'JACKPOT!' },
];
/** A mini piñata never throws in a ball: the multiball is the big three's to build. */
export const MINI: PinataTier = {
  kind: 'mini',
  hp: 3,
  coins: 6,
  balls: 0,
  rope: 140,
  size: 84,
  hit: [64, 64],
  at: 0.3,
  cheer: 'POP!',
};
/** The next piñata starts lowering this long after a burst, in ms. */
const NEXT_PINATA_MS = 900;
/** No new piñata comes down with less than this left: it could never be broken. */
const LAST_PINATA_MS = 2_500;

/** Swing, in radians either side of straight down: where it starts, what each hit adds, the most. */
export const SWING_BASE = (12 * Math.PI) / 180;
export const SWING_PER_HIT = (4 * Math.PI) / 180;
export const SWING_MAX = (40 * Math.PI) / 180;
/** A swing's period, in ms, from a fresh piñata down to one about to burst. */
export const SWING_PERIOD_MS = 2_200;
export const SWING_PERIOD_MIN_MS = 1_600;
/** A hit's new swing eases in over about this long, in ms, so it lurches rather than jumps. */
const SWING_EASE_MS = 300;
/** A piñata is lowered in over this long, in ms, from this share of its rope. */
const LOWER_MS = 1_200;
const LOWER_FROM = 0.25;
/** A piñata still up after this long droops this much lower, in px, easing down over DROOP_EASE_MS. */
export const DROOP_AFTER_MS = 15_000;
export const DROOP_PX = 40;
const DROOP_EASE_MS = 600;
/** The rope's pivot sits this far above the top of the field, in px, out of sight under the HUD. */
const PIVOT_ABOVE = 16;
/** At its last hit point a piñata trembles this far side to side, in px. */
const SHAKE_PX = 3;
/**
 * Rising balls bend toward the piñata at this many radians a second: an invisible hand that
 * turns a near miss into a hit, gentler than a boss's opening, so aim still matters.
 */
const AIM_TURN = 0.9;

/** Candy pegs: a row of them under the piñata, in one of these shapes. */
export const PEG_PATTERNS = ['smile', 'frown', 'zigzag'] as const;
export const PEGS = 7;
/** The pegs' top line and how far the shape bows below it, in px down from the top of the field. */
export const PEG_TOP = 290;
export const PEG_BOW = 50;
const PEG_JITTER = 6;
const PEG_SIZE = 30;
const PEG_HIT = 24;
/** The row comes back this long after its last peg popped, in ms. */
const PEG_REFILL_MS = 2_500;
export const PEG_COINS = 1;

/** Candy shaken loose: how many a hit spills, and the odds of what falls. */
export const GOLDEN_CHANCE = 0.08;
export const CHILI_CHANCE = 0.15;
export const GOLDEN_COINS = 5;
/** What catching the chili costs. */
export const CHILI_COINS = 5;
/** Thrown out of the piñata and falling: slower than a coin, so the paddle can chase it. */
const CANDY_GRAVITY = 460;
const CANDY_VX = 140;
const CANDY_VY: readonly [number, number] = [-280, -160];
/** A blast spills candy for at most this many of the hit points it takes. */
const BLAST_SPILL_HITS = 3;
/** Candy caught within this long of each other, in ms, rings a step higher, up to a ceiling. */
const CANDY_RUN_GAP_MS = 700;
const CANDY_RUN_STEPS = 10;
const CANDY_RUN_CENTS = 80;

/** Points, for the score the level keeps. The medal counts coins. */
const HIT_POINTS = 60;
const PEG_POINTS = 40;
const CANDY_POINTS = 30;
const BURST_POINTS = 800;
/** Bullet time as a piñata bursts, in ms. */
const BURST_SLOWMO_MS = 700;

const TEXTURE: Record<PinataKind, { whole: string; cracked: string }> = {
  donkey: { whole: 'pinata_donkey', cracked: 'pinata_donkey_cracked' },
  star: { whole: 'pinata_star', cracked: 'pinata_star_cracked' },
  llama: { whole: 'pinata_llama', cracked: 'pinata_llama_cracked' },
  mini: { whole: 'pinata_mini', cracked: 'pinata_mini_cracked' },
};
const SPARK: Record<PinataKind, number> = { donkey: 0xff5ad1, star: 0x3ce7ff, llama: 0xffd27a, mini: 0xff9a3c };
const CANDY_TEXTURES = ['candy_red', 'candy_blue', 'candy_green'] as const;
const CANDY_SPARK = [0xff4d4d, 0x4d8bff, 0x4dff7a] as const;
const CONFETTI = [0xff5ad1, 0x3ce7ff, 0xffd27a, 0x7dff6a, 0xff9a3c] as const;
const ROPE_COLOR = 0x9a6a36;
const ROPE_WIDTH = 4;
/** The rope draws just under the piñata, which draws at the framework's target depth of 1. */
const ROPE_DEPTH = 0.95;

const CANDY: readonly CollectibleKind[] = CANDY_TEXTURES.map((texture) => ({
  texture,
  size: 30,
  onCatch: 'custom' as const,
  value: 1,
  magnetic: true,
}));
const GOLDEN: CollectibleKind = {
  texture: 'candy_gold',
  size: 36,
  onCatch: 'custom',
  value: GOLDEN_COINS,
  magnetic: true,
  light: 0xffd27a,
};
const CHILI: CollectibleKind = {
  texture: 'chili',
  size: 36,
  onCatch: 'custom',
  value: CHILI_COINS,
  magnetic: false,
  light: 0xff4d2d,
};

/** The piñata at `index` of the sequence: the big three, then minis from side to side. */
export function tierFor(index: number): PinataTier {
  const tier = PINATAS[index];
  if (tier) return tier;
  return { ...MINI, at: (index - PINATAS.length) % 2 === 0 ? MINI.at : 1 - MINI.at };
}

/** A piñata's rope: where it hangs from, how it swings, and how far it has come down. */
export interface Rope {
  px: number;
  py: number;
  /** Its full length once lowered, in px. */
  length: number;
  /** The swing now and the swing it eases toward, in radians either side of straight down. */
  amp: number;
  aim: number;
  periodMs: number;
  /** Radians into the swing. Kept rather than worked out from the clock, so a new period never jumps. */
  phase: number;
  /** Time since it started lowering, in ms. */
  age: number;
  /** How far it has drooped, in px. */
  droop: number;
  /** Its side-to-side tremble now, in px. */
  jitter: number;
}

/** A fresh rope for the piñata at `index`, hung over the field. Alternate ones swing off the other way. */
export function newRope(tier: PinataTier, field: Field, index: number): Rope {
  return {
    px: field.left + (field.right - field.left) * tier.at,
    py: field.top - PIVOT_ABOVE,
    length: tier.rope,
    amp: 0,
    aim: SWING_BASE,
    periodMs: SWING_PERIOD_MS,
    phase: index % 2 === 0 ? 0 : Math.PI,
    age: 0,
    droop: 0,
    jitter: 0,
  };
}

/** How hard a piñata swings after `hits`: wider and quicker the closer it is to bursting. */
export function swingFor(tier: PinataTier, hits: number): { amp: number; periodMs: number } {
  const amp = Math.min(SWING_MAX, SWING_BASE + hits * SWING_PER_HIT);
  const t = Math.min(1, hits / Math.max(1, tier.hp - 1));
  return { amp, periodMs: SWING_PERIOD_MS + (SWING_PERIOD_MIN_MS - SWING_PERIOD_MS) * t };
}

/** Moves a rope on by `dtMs`: the swing goes round, eases toward its aim, and droops when it is time. */
export function stepRope(r: Rope, dtMs: number): void {
  const dt = Math.max(0, dtMs);
  r.age += dt;
  r.phase = (r.phase + (2 * Math.PI * dt) / r.periodMs) % (2 * Math.PI);
  r.amp += (r.aim - r.amp) * (1 - Math.exp(-dt / SWING_EASE_MS));
  const droop = r.age >= DROOP_AFTER_MS ? DROOP_PX : 0;
  r.droop += (droop - r.droop) * (1 - Math.exp(-dt / DROOP_EASE_MS));
}

/** How long the rope is now: lowering in at first, with any droop on top. */
export function ropeLength(r: Rope): number {
  const t = Math.min(1, r.age / LOWER_MS);
  const ease = 1 - (1 - t) ** 3;
  return r.length * (LOWER_FROM + (1 - LOWER_FROM) * ease) + r.droop;
}

/** Where the piñata on the end of the rope is now, leaning along it. */
export function ropeEnd(r: Rope): Point {
  const at = swing(r.px, r.py, ropeLength(r), r.amp, r.periodMs, r.phase)(0);
  return { ...at, x: at.x + r.jitter };
}

/** Where row `set` of candy pegs goes: the shapes take turns, nudged a little by `rng`. */
export function pegLayout(set: number, field: Field, rng: Rng): Point[] {
  const pattern = PEG_PATTERNS[set % PEG_PATTERNS.length]!;
  const span = field.right - field.left;
  const mid = (PEGS - 1) / 2;
  return Array.from({ length: PEGS }, (_, i) => {
    const u = (i - mid) / mid;
    const bow = 1 - u * u;
    const dy = pattern === 'smile' ? PEG_BOW * bow : pattern === 'frown' ? PEG_BOW * (1 - bow) : (i % 2) * PEG_BOW;
    return {
      x: field.left + (span * (i + 0.5)) / PEGS + rng.float(-PEG_JITTER, PEG_JITTER),
      y: field.top + PEG_TOP + dy + rng.float(-PEG_JITTER, PEG_JITTER),
    };
  });
}

export type DropKind = 'candy' | 'golden' | 'chili';

/**
 * What one spilled piece is. Pure, so its fairness can be tested: the first piñata never drops a
 * chili, two never fall one after the other, and the fiesta drops none at all.
 */
export function rollDrop(rng: Rng, ctx: { pinata: number; lastChili: boolean; fiesta: boolean }): DropKind {
  const roll = rng.next();
  if (ctx.pinata > 0 && !ctx.lastChili && !ctx.fiesta && roll < CHILI_CHANCE) return 'chili';
  return rng.chance(GOLDEN_CHANCE) ? 'golden' : 'candy';
}

/** Pieces one hit spills: a second from the x2 combo on, and twice as many in the fiesta. */
export function spillFor(multiplier: number, fiesta: boolean): number {
  return (multiplier >= 2 ? 2 : 1) * (fiesta ? 2 : 1);
}

/** Coins a caught candy pays at a combo multiplier: one more for each step of the combo. */
export function candyCoins(multiplier: number): number {
  return Math.ceil(multiplier);
}

/** The most coins the three piñatas hold without the combo: their bursts, a row of pegs each, a candy a hit. */
export function threeCoins(): number {
  return PINATAS.reduce((sum, t) => sum + t.coins + PEGS * PEG_COINS + t.hp, 0);
}

interface Pinata {
  target: Target;
  tier: PinataTier;
  rope: Rope;
  index: number;
  hits: number;
  cracked: boolean;
  warned: boolean;
}

/** One playing of the stage. */
interface PinataRun {
  /** The next piñata's place in the sequence. */
  next: number;
  current?: Pinata;
  /** When the next piñata comes down, in ms of play. */
  nextAt: number;
  pegSet: number;
  pegsGoneAt?: number;
  fiesta: boolean;
  lastChili: boolean;
  drops: Rng;
  rope: Phaser.GameObjects.Image;
  candyRun: number;
  lastCandyAt: number;
}

const runs = new WeakMap<BonusStage, PinataRun>();

function lowerPinata(s: BonusStage, run: PinataRun): void {
  const index = run.next++;
  const tier = tierFor(index);
  const rope = newRope(tier, s.field, index);
  const spec: TargetSpec = {
    kind: 'pinata',
    texture: TEXTURE[tier.kind].whole,
    width: tier.size,
    height: tier.size,
    hitWidth: tier.hit[0],
    hitHeight: tier.hit[1],
    path: () => ropeEnd(rope),
    hp: tier.hp,
    spark: SPARK[tier.kind],
    tag: index,
  };
  run.current = { target: s.spawn(spec), tier, rope, index, hits: 0, cracked: false, warned: false };
  run.rope.setVisible(true).setAlpha(1);
  if (tier.kind === 'llama') {
    const { left, right, top } = s.field;
    s.say('THE GOLDEN LLAMA!', (left + right) / 2, top + 240, '#ffd27a', 26);
  }
  hangPegs(s, run);
}

/** A fresh row of candy pegs, in place of whatever is left of the last one. */
function hangPegs(s: BonusStage, run: PinataRun): void {
  for (const t of s.targets()) if (t.kind === 'peg') s.remove(t, 'hide');
  const set = run.pegSet++;
  pegLayout(set, s.field, s.rng.fork('pegs', set)).forEach((p, i) => {
    const c = (set + i) % CANDY_TEXTURES.length;
    s.spawn({
      kind: 'peg',
      texture: CANDY_TEXTURES[c]!,
      width: PEG_SIZE,
      height: PEG_SIZE,
      hitWidth: PEG_HIT,
      hitHeight: PEG_HIT,
      path: float(p.x, p.y, 3, 1_600 + 90 * i),
      ballPops: true,
      plow: true,
      spark: CANDY_SPARK[c],
      tag: set,
    });
  });
  run.pegsGoneAt = undefined;
}

/** Keeps the candy on the field: thrown wide, it still falls where the paddle can reach. */
function onField(path: Path, field: Field): Path {
  return (t) => {
    const at = path(t);
    return { x: Math.min(field.right - 16, Math.max(field.left + 16, at.x)), y: at.y };
  };
}

function spill(s: BonusStage, run: PinataRun, index: number, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const what = rollDrop(run.drops, { pinata: index, lastChili: run.lastChili, fiesta: run.fiesta });
    run.lastChili = what === 'chili';
    const kind = what === 'chili' ? CHILI : what === 'golden' ? GOLDEN : CANDY[run.drops.int(0, CANDY.length - 1)]!;
    const vx = run.drops.float(-CANDY_VX, CANDY_VX);
    const vy = run.drops.float(CANDY_VY[0], CANDY_VY[1]);
    s.drop(kind, onField(fall(x, y, vx, vy, CANDY_GRAVITY), s.field));
  }
}

function hitPinata(s: BonusStage, run: PinataRun, t: Target, cause: HitCause, popped: boolean, dealt: number): void {
  const p = run.current;
  if (!p || p.target !== t || dealt <= 0) return;
  p.hits += dealt;
  const { tier, rope } = p;
  const next = swingFor(tier, p.hits);
  rope.aim = next.amp;
  rope.periodMs = next.periodMs;
  s.score(HIT_POINTS, t.x, t.y, { quiet: true });
  const hits = cause === 'blast' ? Math.min(dealt, BLAST_SPILL_HITS) : 1;
  spill(s, run, p.index, t.x, t.y, hits * spillFor(s.multiplier, run.fiesta));
  if (popped) {
    burst(s, run, p);
    return;
  }
  // Each whack rings a little higher as the piñata gets closer to bursting.
  s.audio.sfx('pinata_whack', 0.5, (700 * p.hits) / tier.hp, { x: t.x });
  s.juice.shake(60, 0.002);
  if (!p.cracked && t.hp <= tier.hp / 2) {
    p.cracked = true;
    s.retexture(t, TEXTURE[tier.kind].cracked);
    for (const c of CONFETTI.slice(0, 3)) s.juice.burst(t.x, t.y, c, 5);
  }
  if (t.hp === 1 && !p.warned) {
    p.warned = true;
    s.say('ONE MORE!', t.x, t.y - tier.size / 2 - 10, '#ffffff', 22);
  }
}

function burst(s: BonusStage, run: PinataRun, p: Pinata): void {
  const { x, y } = p.target;
  const { tier } = p;
  s.count('pinatas');
  s.score(BURST_POINTS, x, y, { quiet: true });
  s.coins(tier.coins, x, y);
  s.slowmo(BURST_SLOWMO_MS);
  s.say(tier.cheer, x, y + 24, '#ffd27a', tier.kind === 'llama' ? 38 : 30);
  s.audio.sfx('pinata_burst', 0.7, tier.kind === 'mini' ? 300 : 0, { x });
  s.juice.ring(x, y, SPARK[tier.kind], 150);
  s.juice.shake(160, 0.005);
  for (const c of CONFETTI) s.juice.burst(x, y, c, 8);
  if (tier.balls > 0) {
    s.balls(tier.balls, x, y);
    s.say(tier.balls > 1 ? `+${tier.balls} BALLS` : '+1 BALL', x, y + 62, '#7fe9ff', 20);
  }
  // The rope snaps back up out of sight.
  s.scene.tweens.add({ targets: run.rope, alpha: 0, duration: 200 });
  run.current = undefined;
  run.nextAt = s.clock + NEXT_PINATA_MS;
  if (tier.kind === 'llama') fiesta(s, run);
}

/** The finale: every ball a fireball, twice the candy, no chili, and the party lights at full. */
function fiesta(s: BonusStage, run: PinataRun): void {
  if (run.fiesta) return;
  run.fiesta = true;
  const { left, right, top } = s.field;
  const cx = (left + right) / 2;
  s.hype();
  // The fireballs run on real time, which bullet time stretches: enough to see the timer out.
  s.fireballs(s.timeLeftMs + 4_000);
  s.balls(Math.max(0, FIESTA_MIN_BALLS - s.ballCount), cx, top + 200);
  s.say('FIESTA!', cx, top + 180, '#ff5ad1', 56);
  s.audio.sfx('pinata_fiesta', 0.7);
  s.juice.shake(220, 0.006);
  if (!s.calm) s.juice.flash(160, 255, 140, 220);
}

/** The rope, from its pivot to the top of the piñata. */
function drawRope(run: PinataRun): void {
  const p = run.current;
  if (!p) return;
  const at = ropeEnd(p.rope);
  const dx = at.x - p.rope.px;
  const dy = at.y - p.rope.py;
  const reach = Math.max(0, Math.hypot(dx, dy) - p.tier.size * 0.3);
  run.rope
    .setPosition(p.rope.px, p.rope.py)
    .setRotation(Math.atan2(-dx, dy))
    .setDisplaySize(ROPE_WIDTH, reach);
}

function setup(s: BonusStage): void {
  const { scene, field } = s;
  const rope = s.keep(
    scene.add.image(0, 0, '__WHITE').setOrigin(0.5, 0).setTint(ROPE_COLOR).setDepth(ROPE_DEPTH).setVisible(false),
  );
  runs.set(s, {
    next: 0,
    nextAt: 0,
    pegSet: 0,
    fiesta: false,
    lastChili: false,
    drops: s.rng.fork('drops'),
    rope,
    candyRun: 0,
    lastCandyAt: -Infinity,
  });
  // A string of party bulbs along the top, where the ropes hang from.
  s.lighting.hangBulbs(field.left, field.right, field.top + 6, ROPE_DEPTH);
}

function tick(s: BonusStage, dtMs: number): void {
  const run = runs.get(s);
  if (!run) return;
  if (!run.current && s.clock >= run.nextAt && s.timeLeftMs > LAST_PINATA_MS) lowerPinata(s, run);
  const p = run.current;
  if (p) {
    // The rope moves on here, before the framework moves the piñata along it this update.
    stepRope(p.rope, dtMs);
    p.rope.jitter = p.target.hp === 1 && !s.calm ? SHAKE_PX * Math.sin(s.clock / 22) : 0;
  }
  s.steer(p ? { x: p.target.x, y: p.target.y } : null, AIM_TURN);
  drawRope(run);
  const pegs = s.targets().filter((t) => t.kind === 'peg').length;
  if (pegs === 0) {
    run.pegsGoneAt ??= s.clock;
    if (s.clock - run.pegsGoneAt >= PEG_REFILL_MS) hangPegs(s, run);
  }
  if (!run.fiesta && s.timeLeftMs <= FIESTA_LEFT_MS) fiesta(s, run);
}

function onHit(s: BonusStage, t: Target, cause: HitCause, popped: boolean, dealt: number): void {
  const run = runs.get(s);
  if (!run) return;
  if (t.kind === 'pinata') {
    hitPinata(s, run, t, cause, popped, dealt);
    return;
  }
  if (t.kind !== 'peg' || !popped) return;
  s.count('pegs');
  s.score(PEG_POINTS, t.x, t.y, { quiet: true });
  s.coins(PEG_COINS, t.x, t.y);
  s.audio.sfx('gallery_spill', 0.35, Math.min(s.combo, 12) * 40, { x: t.x });
}

function onCatch(s: BonusStage, item: Collectible): void {
  const run = runs.get(s);
  if (!run) return;
  const { kind } = item;
  const y = s.field.paddleY - 30;
  if (kind === CHILI) {
    s.count('chilis');
    s.penalty({ coins: CHILI_COINS, combo: 'reset' }, item.x, y, `HOT!  -${CHILI_COINS} coins`);
    s.audio.sfx('pinata_sizzle', 0.6, 0, { x: item.x });
    s.juice.shake(140, 0.004);
    s.juice.burst(item.x, y, 0xff4d2d, 10);
    return;
  }
  if (kind !== GOLDEN && !CANDY.includes(kind)) return;
  s.count('candy');
  s.score(CANDY_POINTS, item.x, y, { quiet: true });
  const n = kind === GOLDEN ? GOLDEN_COINS : candyCoins(s.multiplier);
  s.coins(n, item.x, y);
  const { left, right } = s.field;
  if (n > 1) {
    const color = kind === GOLDEN ? '#ffd27a' : '#ffffff';
    s.say(`+${n}`, Math.min(right - 30, Math.max(left + 30, item.x)), y - 30, color, 18 + 2 * n);
  }
  // Candy caught close together climbs in pitch, a run of them ringing up like a scale.
  run.candyRun = s.clock - run.lastCandyAt < CANDY_RUN_GAP_MS ? run.candyRun + 1 : 0;
  run.lastCandyAt = s.clock;
  s.audio.sfx('pinata_candy', 0.45, Math.min(run.candyRun, CANDY_RUN_STEPS) * CANDY_RUN_CENTS, { x: item.x });
}

function onTimeUp(s: BonusStage): void {
  const run = runs.get(s);
  if (!run) return;
  run.current = undefined;
  s.steer(null);
  s.scene.tweens.add({ targets: run.rope, alpha: 0, duration: 160 });
}

/** Stats a medal of each tier would leave, for the `&tally=` preview. */
function preview(medal: Medal): BonusStats {
  const coins = { none: 20, bronze: 42, silver: 78, gold: 128 }[medal];
  const pinatas = { none: 1, bronze: 2, silver: 3, gold: 5 }[medal];
  const candy = { none: 7, bronze: 16, silver: 32, gold: 54 }[medal];
  return {
    score: pinatas * 1_200 + candy * 60 + coins * 20,
    coins,
    bestCombo: Math.round(candy * 0.6),
    counts: { pinatas, candy, pegs: pinatas * 6 },
  };
}

export const pinata: BonusDef = {
  id: 'pinata',
  // Spelled without the tilde on screen: the game's fonts have no Ñ.
  name: 'Pinata Fiesta',
  kicker: 'Bonus stage',
  rules: [
    { text: 'SMASH & CATCH!' },
    { icon: 'pinata_donkey', text: 'Smash' },
    { icon: 'candy_red', text: 'Catch' },
    { icon: 'chili', text: `Don't!`, avoid: true },
  ],
  durationMs: PINATA_MS,
  medalBy: 'coins',
  medals: [30, 60, 100],
  // A lost ball costs the combo and nothing else: the next one is straight back.
  ballLost: { combo: 'reset' },
  // The same midway as the gallery, at a livelier pace.
  backdrop: 'carnival',
  pace: 0.8,
  preview,
  setup,
  tick,
  onHit,
  onCatch,
  onTimeUp,
  tally: (stats) => [
    { label: 'Pinatas', value: stats.counts.pinatas ?? 0 },
    { label: 'Candy', value: stats.counts.candy ?? 0 },
    { label: 'Best combo', value: stats.bestCombo, prefix: 'x' },
  ],
};
