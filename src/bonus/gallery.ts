import type { BonusStats, Medal } from '../core/Bonus';
import { sine, still, type Path } from '../core/Motion';
import type { Rng } from '../core/Rng';
import type { BonusDef, BonusStage, Field, HitCause, Target, TargetSpec } from '../systems/BonusDirector';

/**
 * The Shooting Gallery: a fairground booth between the fights. Shoot the ducks and they burst
 * into coins, crack a money bag for a jackpot, and leave the cat alone. Coins fly to the paddle
 * by themselves; the medal counts them.
 */

export const GALLERY_KINDS = ['duck', 'bag', 'cat'] as const;
export type GalleryKind = (typeof GALLERY_KINDS)[number];

/** Where a target comes from: two rails across the field, the pop-up row in front, the sky. */
export type Lane = 'back' | 'mid' | 'front' | 'sky';

/** One target of a wave: when it comes, what it is and where. */
export interface WaveEvent {
  /** Ms after the wave starts. */
  at: number;
  kind: GalleryKind;
  lane: Lane;
  /** Which way it travels: 1 is to the right. */
  dir: 1 | -1;
  /** The front row's slot, 0..FRONT_SLOTS-1. */
  slot?: number;
}

export const GALLERY_MS = 40_000;
/** A wave starts this often, the first one this far into play, in ms. */
export const WAVE_EVERY_MS = 5_000;
export const FIRST_WAVE_MS = 600;
/** No wave starts with less than this left on the clock, in ms: its targets would never land. */
export const WAVE_TAIL_MS = 4_000;
export const FRONT_SLOTS = 5;
/** Most cats one wave shows. */
export const MAX_CATS = 2;
/** The waves with a money bag drifting over. */
export const BAG_WAVES: readonly number[] = [2, 4, 6];

/**
 * A duck's hit points: a cold gatling needs a moment on it, a spun-up one two or three hits.
 * The ball knocks it down in one.
 */
export const DUCK_HP = 10;
/** Coins a duck bursts into, before the combo; a ball hit pays double. */
export const DUCK_COINS = 1;
export const BALL_MULT = 2;
/**
 * A money bag's hit points. It spills a coin for every BAG_HP_PER_COIN of them it takes and bursts
 * with the jackpot. A spun-up gatling tears through it; a cold one, or the ball, takes a while.
 */
export const BAG_HP = 40;
export const BAG_HP_PER_COIN = 4;
export const BAG_JACKPOT = 12;
/** What shooting the cat costs. */
export const CAT_COINS = 5;
/** Points, for the score the level keeps. The medal counts coins. */
const DUCK_POINTS = 100;
const BAG_POINTS = 1_000;
const BAG_CHIP_POINTS = 50;
/** Bullet time as a bag bursts, in ms. */
const JACKPOT_SLOWMO_MS = 700;

/** Rows down from the top of the field, in px. */
const SKY_Y = 84;
const BACK_Y = 170;
const MID_Y = 255;
const FRONT_Y = 350;
const BACK_SPEED = 120;
const MID_SPEED = 160;
const SKY_SPEED = 70;
/** Ms between ducks on one rail. */
const RAIL_GAP_MS = 700;
/** A pop-up stays up this long, and a little less each wave, down to the floor, in ms. */
const POP_MS = 2_100;
const POP_FALL_MS = 60;
const POP_MIN_MS = 1_500;

/** Drawn size and hit box of each, in px. */
const SIZE: Record<GalleryKind, { w: number; h: number; hit: [number, number] }> = {
  duck: { w: 62, h: 62, hit: [50, 56] },
  bag: { w: 84, h: 84, hit: [66, 70] },
  cat: { w: 62, h: 62, hit: [54, 54] },
};
const TEXTURE: Record<GalleryKind, string> = { duck: 'target_duck', bag: 'target_bag', cat: 'target_cat' };
const SPARK: Record<GalleryKind, number> = { duck: 0xffe14d, bag: 0xffc93c, cat: 0xff4d4d };
/** The rail a row of ducks rides on: under their sticks. */
const RAIL_DY = 31;
/** The front counter's height, in px, and its depth: just over the targets, under the ball. */
const COUNTER_H = 22;
const TARGET_OVER = 1.5;

/** The front row's slots, across the field. */
export function frontSlots(field: Field): number[] {
  const span = field.right - field.left;
  return Array.from({ length: FRONT_SLOTS }, (_, i) => field.left + (span * (i + 0.5)) / FRONT_SLOTS);
}

/** When each wave starts, in ms of play. */
export function waveStarts(): number[] {
  const out: number[] = [];
  for (let at = FIRST_WAVE_MS; at + WAVE_TAIL_MS <= GALLERY_MS; at += WAVE_EVERY_MS) out.push(at);
  return out;
}

/**
 * The targets of wave `index`, counted from 0. Pure, so its fairness can be tested: cats only
 * ever pop up in the front row, never in the first wave, never more than MAX_CATS of them, and
 * never two pop-ups in one slot.
 */
export function planWave(rng: Rng, index: number): WaveEvent[] {
  const events: WaveEvent[] = [];
  const dir: 1 | -1 = index % 2 === 0 ? 1 : -1;
  const back = index >= 3 ? 4 : 3;
  for (let i = 0; i < back; i++) events.push({ at: i * RAIL_GAP_MS, kind: 'duck', lane: 'back', dir });
  if (index >= 1) {
    const mid = index >= 4 ? 3 : 2;
    for (let i = 0; i < mid; i++) {
      events.push({ at: 350 + i * RAIL_GAP_MS, kind: 'duck', lane: 'mid', dir: dir === 1 ? -1 : 1 });
    }
  }
  const slots = rng.shuffle(Array.from({ length: FRONT_SLOTS }, (_, i) => i));
  const pops = Math.min(FRONT_SLOTS, 2 + Math.floor(index / 2));
  const cats = index === 0 ? 0 : Math.min(index >= 4 ? rng.int(1, MAX_CATS) : rng.chance(0.6) ? 1 : 0, pops - 1);
  for (let i = 0; i < pops; i++) {
    events.push({ at: 1_200 + rng.int(0, 900), kind: i < cats ? 'cat' : 'duck', lane: 'front', dir, slot: slots[i] });
  }
  if (BAG_WAVES.includes(index)) events.push({ at: 300, kind: 'bag', lane: 'sky', dir: dir === 1 ? -1 : 1 });
  return events.sort((a, b) => a.at - b.at);
}

/** Where a planned target goes, as a path in world coordinates. */
export function pathFor(e: WaveEvent, field: Field): Path {
  const top = field.top;
  const enterX = (dir: number) => (dir > 0 ? field.left - 30 : field.right + 30);
  switch (e.lane) {
    case 'back':
      return sine(enterX(e.dir), top + BACK_Y, e.dir * BACK_SPEED, 0, 8, 520);
    case 'mid':
      return sine(enterX(e.dir), top + MID_Y, e.dir * MID_SPEED, 0, 10, 440);
    case 'sky':
      return sine(enterX(e.dir), top + SKY_Y, e.dir * SKY_SPEED, 0, 10, 1_600);
    case 'front':
      return still(frontSlots(field)[e.slot ?? 0]!, top + FRONT_Y);
  }
}

/** How long a pop-up stays up, in ms. Everything else leaves off the side. */
export function lifeFor(e: WaveEvent, index: number): number | undefined {
  if (e.lane !== 'front') return undefined;
  return Math.max(POP_MIN_MS, POP_MS - index * POP_FALL_MS) + (e.kind === 'cat' ? 300 : 0);
}

/** The most coins a wave holds without the combo: every duck shot and every bag burst by bolts. */
export function waveCoins(events: readonly WaveEvent[]): number {
  let sum = 0;
  for (const e of events) {
    if (e.kind === 'duck') sum += DUCK_COINS;
    else if (e.kind === 'bag') sum += bagCoins(BAG_HP, 0) + BAG_JACKPOT;
  }
  return sum;
}

/** Coins a bag spills going from `hpBefore` hit points down to `hpAfter`, before the jackpot. */
export function bagCoins(hpBefore: number, hpAfter: number): number {
  const shed = (hp: number) => Math.floor((BAG_HP - hp) / BAG_HP_PER_COIN);
  return shed(hpAfter) - shed(hpBefore);
}

/** Coins a duck pays at a combo multiplier: one more for each step of the combo. */
export function duckCoins(multiplier: number, ball: boolean): number {
  return DUCK_COINS * Math.ceil(multiplier) * (ball ? BALL_MULT : 1);
}

/** One playing of the stage: what is still to come. */
interface GalleryRun {
  queue: Array<{ at: number; wave: number; event: WaveEvent }>;
}

const runs = new WeakMap<BonusStage, GalleryRun>();

function spawn(s: BonusStage, e: WaveEvent, wave: number): Target {
  const size = SIZE[e.kind];
  const spec: TargetSpec = {
    kind: e.kind,
    texture: TEXTURE[e.kind],
    width: size.w,
    height: size.h,
    hitWidth: size.hit[0],
    hitHeight: size.hit[1],
    path: pathFor(e, s.field),
    hp: e.kind === 'bag' ? BAG_HP : e.kind === 'duck' ? DUCK_HP : 1,
    ballPops: e.kind === 'duck',
    lifeMs: lifeFor(e, wave),
    enter: e.lane === 'front' ? 'rise' : undefined,
    spark: SPARK[e.kind],
    flipX: e.kind === 'duck' && e.dir < 0,
    tag: wave,
  };
  return s.spawn(spec);
}

function onHit(s: BonusStage, t: Target, cause: HitCause, popped: boolean, dealt: number): void {
  const ball = cause === 'ball';
  if (t.kind === 'cat') {
    // An ability's blast takes the cat for free: only an aimed shot costs anything.
    if (cause === 'blast') return;
    s.count('catsHit');
    s.penalty({ coins: CAT_COINS, combo: 'reset' }, t.x, t.y, `MEOW!  -${CAT_COINS} coins`);
    s.audio.sfx('gallery_meow', 0.55, 0, { x: t.x });
    s.juice.shake(140, 0.004);
    return;
  }
  if (t.kind === 'bag') {
    // The harder it is hit, the faster coins shake loose; the last hit bursts it.
    const spilled = bagCoins(t.hp + dealt, t.hp);
    if (spilled > 0) {
      s.score(BAG_CHIP_POINTS * spilled, t.x, t.y, { combo: false, quiet: true });
      s.coins(spilled, t.x, t.y);
      if (!popped) s.audio.sfx('gallery_spill', 0.4, (600 * (BAG_HP - t.hp)) / BAG_HP, { x: t.x });
    }
    if (!popped) return;
    s.count('jackpots');
    s.score(BAG_POINTS, t.x, t.y, { quiet: true });
    s.coins(BAG_JACKPOT, t.x, t.y);
    s.slowmo(JACKPOT_SLOWMO_MS);
    s.say('JACKPOT!', t.x, t.y + 24, '#ffd27a', 34);
    s.audio.sfx('gallery_jackpot', 0.7);
    s.juice.ring(t.x, t.y, SPARK.bag, 140);
    return;
  }
  if (!popped) {
    // Each knock rings a little higher as the duck gets closer to going down.
    s.audio.sfx('gallery_peck', 0.28, 400 - (300 * t.hp) / DUCK_HP, { x: t.x });
    return;
  }
  s.count('ducks');
  s.score(DUCK_POINTS * (ball ? BALL_MULT : 1), t.x, t.y, { quiet: true });
  const n = duckCoins(s.multiplier, ball);
  s.coins(n, t.x, t.y);
  const { left, right } = s.field;
  if (n > 1) s.say(`+${n}`, Math.min(right - 30, Math.max(left + 30, t.x)), t.y - 20, '#ffd27a', 18 + 3 * n);
  s.audio.sfx('gallery_quack', 0.5, Math.min(s.combo, 12) * 30, { x: t.x });
}

function onEscape(s: BonusStage, t: Target): void {
  // A duck that gets away halves the combo, quietly: the chain is the reward for clean shooting.
  if (t.kind === 'duck') s.penalty({ combo: 'halve' }, t.x, t.y, '');
}

/**
 * The rails and the front counter, strung with bulbs for the map's party lights. The backdrop is
 * the world's own, until a gallery plate is approved.
 */
function drawRails(s: BonusStage): void {
  const { scene, field } = s;
  const cx = (field.left + field.right) / 2;
  const w = field.right - field.left;
  for (const y of [BACK_Y, MID_Y]) {
    const ry = field.top + y + RAIL_DY;
    s.keep(scene.add.rectangle(cx, ry + 3, w, 8, 0x2a1608, 0.9).setDepth(0.5));
    s.keep(scene.add.rectangle(cx, ry, w, 2, 0xc8873a, 0.9).setDepth(0.6));
    s.lighting.hangBulbs(field.left, field.right, ry + 3, 0.6);
  }
  const fy = field.top + FRONT_Y + SIZE.duck.h / 2 + COUNTER_H / 2 - 4;
  s.keep(scene.add.rectangle(cx, fy, w, COUNTER_H, 0x3a1e0c, 0.96).setDepth(TARGET_OVER));
  s.keep(scene.add.rectangle(cx, fy - COUNTER_H / 2 + 1, w, 3, 0xe0a050, 1).setDepth(TARGET_OVER + 0.01));
  s.keep(scene.add.rectangle(cx, fy + COUNTER_H / 2 - 2, w, 3, 0x1a0c04, 1).setDepth(TARGET_OVER + 0.01));
  s.lighting.hangBulbs(field.left, field.right, fy, TARGET_OVER + 0.01);
}

function setup(s: BonusStage): void {
  const run: GalleryRun = { queue: [] };
  waveStarts().forEach((start, wave) => {
    for (const event of planWave(s.rng.fork('wave', wave), wave)) {
      run.queue.push({ at: start + event.at, wave, event });
    }
  });
  run.queue.sort((a, b) => a.at - b.at);
  runs.set(s, run);
  drawRails(s);
}

function tick(s: BonusStage): void {
  const run = runs.get(s);
  if (!run) return;
  while (run.queue.length > 0 && run.queue[0]!.at <= s.clock) {
    const { wave, event } = run.queue.shift()!;
    spawn(s, event, wave);
  }
}

/** Stats a medal of each tier would leave, for the `&tally=` preview. */
function preview(medal: Medal): BonusStats {
  const coins = { none: 24, bronze: 46, silver: 88, gold: 141 }[medal];
  const ducks = { none: 14, bronze: 26, silver: 38, gold: 51 }[medal];
  return {
    score: ducks * 150 + coins * 40,
    coins,
    bestCombo: Math.round(ducks / 2),
    counts: { ducks, jackpots: { none: 0, bronze: 1, silver: 2, gold: 3 }[medal] },
  };
}

export const gallery: BonusDef = {
  id: 'gallery',
  name: 'Shooting Gallery',
  kicker: 'Bonus stage',
  rules: [
    { text: 'HOLD FIRE!' },
    { icon: 'target_duck', text: 'Coins' },
    { icon: 'target_bag', text: 'Jackpot' },
    { icon: 'target_cat', text: `Don't!`, avoid: true },
  ],
  durationMs: GALLERY_MS,
  medalBy: 'coins',
  medals: [30, 60, 100],
  ballLost: { combo: 'reset' },
  // Slower at the top than the default, so the stream stays readable and ducks take a moment.
  guns: { gatling: { fastGapMs: 60 } },
  preview,
  setup,
  tick: (s) => tick(s),
  onHit,
  onEscape,
  tally: (stats) => [
    { label: 'Ducks', value: stats.counts.ducks ?? 0 },
    { label: 'Jackpots', value: stats.counts.jackpots ?? 0 },
    { label: 'Best combo', value: stats.bestCombo, prefix: 'x' },
  ],
};
