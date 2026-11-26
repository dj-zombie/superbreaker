import Phaser from 'phaser';
import { GEMS, dropPlateTextures, plateTexture, type GemId } from '../art/creditPlates';
import { HEIGHT, MACHINE_FONT, RENDER_ZOOM, STAGE_W, WIDTH } from '../config';
import { CREDITS, STARRING, type CreditLine } from '../credits';
import type { Path } from '../core/Motion';
import type { BonusDef, BonusStage, Field, HitCause, Target } from '../systems/BonusDirector';
import type { Light } from '../systems/LightingSystem';
import { raysTexture } from '../ui/frames';
import { scramble } from '../ui/fx/motion';
import { gradientFill } from '../ui/type';

/**
 * The Credits: the campaign's last stage, after the ending. The credits roll down the field as
 * giant Mainframe bricks, each name decoding onto its glass as it boots up. Hits crack the glass;
 * the last hit shatters it and the name dissolves up into the fireworks. Nothing can be lost and
 * there is no tally. More balls and then fireballs join as the roll goes on, and it ends on one
 * big gold plate, "Starring: You", whose break sets off the whole show and leads to Victory.
 */

export const CREDITS_MS = 70_000;
/** The first plate comes down this far into play, and the gap between plates closes from the first to the last. */
const FIRST_AT = 600;
const GAP_FIRST_MS = 4_400;
const GAP_LAST_MS = 3_700;
/** The star plate follows the last credit by this long. */
const STAR_GAP_MS = 4_800;
/** After the star plate breaks, the show plays this long before the stage ends. */
const ENCORE_MS = 5_000;

/** A plate's size on the field, in px, and the hits it takes. */
const PLATE_W = 300;
const PLATE_H = 100;
const PLATE_HP = 3;
const STAR_W = 440;
const STAR_H = 160;
export const STAR_HP = 14;
/** The star's glass cracks this many times on its way to breaking. */
const STAR_CRACKS = 4;
/** Plates boot up this far under the top of the field, clear of the HUD's coins and combo, in px. */
const PLATE_TOP = 56;
/** Plates fall this fast, in px/s, swaying side to side and leaning into the sway. */
export const FALL_SPEED = 30;
const SWAY_PX = 18;
const SWAY_MS = 3_400;
const LEAN = 0.045;
/** Plates come down in these lanes, across the field, in turn. */
const LANES = [0.5, 0.29, 0.71] as const;
/** The plates' glass colours, in turn. */
const GEM_CYCLE: readonly GemId[] = ['teal', 'blue', 'purple', 'pink', 'green'];
/** The star plate comes down to here, under the top of the field, over this long, then bobs. */
const STAR_Y = 250;
const STAR_IN_MS = 2_600;

/** The roll builds: a ball joins at each of these points of the timer, then every ball is a fireball. */
export const BALL_AT = [0.22, 0.42] as const;
export const FIRE_AT = 0.6;
/** Fireworks go up from under the field, more often as the roll goes on, in ms between them. */
const SKY_GAP_FIRST_MS = 3_200;
const SKY_GAP_LAST_MS = 900;
const SKY_GAP_CALM_MS = 4_000;
/** Rising balls bend gently toward the lowest plate: a near miss still breaks something. */
const AIM_TURN = 0.7;

const PLATE_POINTS = 400;
const PLATE_POINTS_STEP = 60;
const PLATE_COINS = 4;
const STAR_POINTS = 5_000;
const STAR_COINS = 40;

const GOLD = GEMS.gold.glow;
const SKY_COLORS = [GOLD, 0x3ff2d0, 0xb57bff, 0xff6ad5, 0x4aa8ff, 0xffffff] as const;
/** Over the scrolling backdrop's layers (-100 to -90) and under the light map (-50), so the show lights it. */
const PLATE_BACKDROP_DEPTH = -60;
/** The Victory plate behind the field, dimmed so the credits read over it. */
const BACKDROP_TINT = 0x8e8ea4;
/** Names ride on their plates (depth 1), under the balls and the shards (2 and up). */
const NAME_DEPTH = 1.5;
/** The star's rays turn behind it. */
const RAYS_DEPTH = 0.8;
/** The last words, over the whole show. */
const FINALE_DEPTH = 14;
/** A plate's glow behind it, on the room. */
const HALO_DEPTH = 0.5;
/** The names' type, in px: the largest it starts at, and the smallest it fits down to before wrapping. */
const NAME_SIZE = 26;
const NAME_MIN = 19;
const STAR_NAME_SIZE = 66;
const FINALE_SIZE = 34;

/** When each credit comes down, in ms of play: the gaps close from the first to the last. */
export function creditTimes(n = CREDITS.length): number[] {
  const out: number[] = [];
  let at = FIRST_AT;
  for (let i = 0; i < n; i++) {
    out.push(at);
    const k = n > 1 ? i / (n - 1) : 1;
    at += GAP_FIRST_MS + (GAP_LAST_MS - GAP_FIRST_MS) * k;
  }
  return out;
}

/** When the star plate comes down: after the last credit. */
export function starAt(n = CREDITS.length): number {
  const times = creditTimes(n);
  return (times[times.length - 1] ?? FIRST_AT) + STAR_GAP_MS;
}

/** A plate's middle, `tMs` after it boots up just under the HUD's coins and combo. */
export function plateY(field: Field, tMs: number): number {
  return field.top + PLATE_TOP + PLATE_H / 2 + FALL_SPEED * (tMs / 1000);
}

/** How long a plate falls before it fades, as its bottom edge nears the bottom of the field, in ms. */
export function plateLifeMs(field: Field): number {
  const travel = field.bottom - PLATE_H / 2 - plateY(field, 0);
  return Math.max(4_000, (travel / FALL_SPEED) * 1000);
}

/** Falls from under the top of the field, swaying either side of its lane and leaning with it. */
function rollPath(field: Field, x: number, phase: number, lean: number): Path {
  return (t) => {
    const a = phase + (2 * Math.PI * t) / SWAY_MS;
    return { x: x + SWAY_PX * Math.sin(a), y: plateY(field, t), angle: lean * Math.cos(a) };
  };
}

/** Eases down to its place, then bobs there. */
function starPath(x: number, top: number): Path {
  return (t) => {
    const k = Math.min(1, t / STAR_IN_MS);
    const ease = 1 - (1 - k) ** 3;
    const y = top - STAR_H + (STAR_Y + STAR_H) * ease;
    const bob = t > STAR_IN_MS ? 6 * Math.sin((2 * Math.PI * (t - STAR_IN_MS)) / 2_400) : 0;
    return { x, y: y + bob };
  };
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** A plate on the field, with what rides on it. */
interface Plate {
  target: Target;
  line: CreditLine;
  gem: GemId;
  seed: number;
  name: Phaser.GameObjects.Text;
  /** The name's place on the glass, down from the plate's middle. */
  nameDy: number;
  light?: Light;
  cracks: number;
  done: boolean;
}

/** One playing of the stage. */
interface CreditsRun {
  times: number[];
  starAt: number;
  next: number;
  plates: Plate[];
  star?: Plate;
  rays: Phaser.GameObjects.Image[];
  landed: boolean;
  starDone: boolean;
  finale: boolean;
  balls: number;
  fire: boolean;
  skyAt: number;
  popped: number;
}

const runs = new WeakMap<BonusStage, CreditsRun>();

/** The name in the Mainframe's machine type, lit in the plate's colour, fit to the glass. */
function nameText(
  s: BonusStage,
  text: string,
  gem: GemId,
  room: number,
  size: number,
): Phaser.GameObjects.Text {
  const g = GEMS[gem];
  const out = s.scene.add
    .text(0, 0, '', {
      fontFamily: MACHINE_FONT,
      fontSize: `${size}px`,
      fontStyle: '700',
      color: '#ffffff',
      align: 'center',
      resolution: RENDER_ZOOM,
    })
    .setOrigin(0.5)
    .setDepth(NAME_DEPTH);
  let final = text.toUpperCase();
  out.setText(final);
  const spacing = (px: number) => out.setLetterSpacing(Math.round(px * 0.06));
  spacing(size);
  while (out.width > room && size > NAME_MIN) {
    size--;
    out.setFontSize(size);
    spacing(size);
  }
  // Still too long: two lines, split at the space nearest the middle.
  if (out.width > room && final.includes(' ')) {
    const mid = final.length / 2;
    let cut = -1;
    for (let i = 0; i < final.length; i++) {
      if (final[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    }
    final = `${final.slice(0, cut)}\n${final.slice(cut + 1)}`;
    size = NAME_SIZE - 4;
    out
      .setText(final)
      .setFontSize(size)
      .setLineSpacing(-size * 0.12);
    spacing(size);
    while (out.width > room && size > NAME_MIN - 3) {
      size--;
      out.setFontSize(size);
      spacing(size);
    }
  }
  out.setStroke('rgba(0,0,0,0.55)', Math.max(2, size * 0.1));
  out.setShadow(0, 0, hex(g.glow), size * 0.55, true, true);
  gradientFill(out, ['#ffffff', g.ink, hex(g.glow)]);
  out.setData('final', final);
  return out;
}

/** Brings a plate up like the Mainframe's screens: a flicker, a scanline opening out, the name decoding. */
function bootUp(s: BonusStage, p: Plate): void {
  const { sprite } = p.target;
  const final = p.name.getData('final') as string;
  if (s.calm) {
    p.name.setText(final);
    return;
  }
  const sy = sprite.scaleY;
  sprite.setScale(sprite.scaleX, sy * 0.06).setAlpha(0);
  s.scene.tweens.add({
    targets: sprite,
    alpha: 1,
    duration: 120,
    ease: 'Stepped',
    easeParams: [3],
  });
  s.scene.tweens.add({ targets: sprite, scaleY: sy, duration: 420, delay: 80, ease: 'Expo.Out' });
  p.name.setAlpha(0);
  s.scene.tweens.add({ targets: p.name, alpha: 1, duration: 160, delay: 260 });
  scramble(s.scene, p.name, final, 700, 260);
}

function placePlate(
  s: BonusStage,
  target: Target,
  line: CreditLine,
  gem: GemId,
  seed: number,
  star: boolean,
): Plate {
  const w = star ? STAR_W : PLATE_W;
  const h = star ? STAR_H : PLATE_H;
  // The glass glows: drawn as is, over the room's light, and lighting the room in turn.
  s.lighting.removeLit(target.sprite);
  const name = nameText(s, line.name, gem, w * 0.84, star ? STAR_NAME_SIZE : NAME_SIZE);
  const plate: Plate = {
    target,
    line,
    gem,
    seed,
    name,
    nameDy: h * (star ? 0.13 : 0.14),
    cracks: 0,
    done: false,
  };
  plate.light = s.lighting.addLight({
    follow: target.sprite,
    color: GEMS[gem].glow,
    radius: star ? 300 : 190,
    intensity: star ? 1.1 : 0.75,
    halo: star ? 230 : 150,
    haloAlpha: star ? 0.4 : 0.28,
    haloDepth: HALO_DEPTH,
    priority: star ? 4 : 2,
  });
  followPlate(plate);
  bootUp(s, plate);
  return plate;
}

/** Keeps the name on its glass as the plate sways. */
function followPlate(p: Plate): void {
  const { sprite } = p.target;
  const a = sprite.rotation;
  // Booting up, the name opens out with the plate.
  const open = Math.min(1, sprite.scaleY / (p.target.spec.height / sprite.height));
  p.name
    .setPosition(sprite.x - Math.sin(a) * p.nameDy, sprite.y + Math.cos(a) * p.nameDy)
    .setRotation(a)
    .setScale(1, open);
}

function rollCredit(s: BonusStage, run: CreditsRun): void {
  const index = run.next++;
  const line = CREDITS[index]!;
  const lane = LANES[index % LANES.length]!;
  const gem = GEM_CYCLE[index % GEM_CYCLE.length]!;
  const seed = index * 7 + 3;
  const { left, right } = s.field;
  const target = s.spawn({
    kind: 'credit',
    texture: plateTexture(s.scene, {
      gem,
      width: PLATE_W,
      height: PLATE_H,
      role: line.role,
      cracks: 0,
      seed,
    }),
    width: PLATE_W,
    height: PLATE_H,
    path: rollPath(s.field, left + (right - left) * lane, index * 1.3, s.calm ? 0 : LEAN),
    hp: PLATE_HP,
    plow: true,
    lifeMs: plateLifeMs(s.field),
    spark: GEMS[gem].glow,
    tag: index,
  });
  run.plates.push(placePlate(s, target, line, gem, seed, false));
  s.fx.play('overseer.recompile', target.x, target.y, { tint: GEMS[gem].glow, quiet: true });
  s.audio.sfx('flicker', 0.22, index * 40, { x: target.x });
}

function rollStar(s: BonusStage, run: CreditsRun): void {
  const { left, right, top } = s.field;
  const cx = (left + right) / 2;
  const seed = 97;
  const target = s.spawn({
    kind: 'star',
    texture: plateTexture(s.scene, {
      gem: 'gold',
      width: STAR_W,
      height: STAR_H,
      role: STARRING.role,
      cracks: 0,
      seed,
    }),
    width: STAR_W,
    height: STAR_H,
    path: starPath(cx, top),
    hp: STAR_HP,
    spark: GOLD,
  });
  run.star = placePlate(s, target, STARRING, 'gold', seed, true);
  run.plates.push(run.star);
  // Rays turn behind it, one wheel each way.
  const key = raysTexture(s.scene);
  for (const [scale, alpha, spin] of [
    [3.2, 0.32, 1],
    [2.3, 0.22, -1.6],
  ] as const) {
    const ray = s.scene.add
      .image(target.x, target.y, key)
      .setDepth(RAYS_DEPTH)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(GOLD)
      .setScale(scale)
      .setAlpha(0);
    ray.setData('spin', s.calm ? 0 : spin * 0.12);
    s.scene.tweens.add({ targets: ray, alpha, duration: 1_400, delay: 600 });
    run.rays.push(s.keep(ray));
  }
  s.say('AND STARRING...', cx, top + STAR_Y + STAR_H, '#ffe9b8', 30);
  s.audio.sfx('fanfare_rise_a', 0.55);
}

/** The star settles into place: a flare across the screen, and the room lights up gold. */
function starLands(s: BonusStage, run: CreditsRun, p: Plate): void {
  run.landed = true;
  const { x, y } = p.target;
  s.fx.play('screen.anamorphic', x, y, { tint: GOLD });
  s.lighting.flash(x, y, GOLD, 420, 700, 1.4, 1.6, 5, true);
  s.audio.sfx('surge', 0.45, 0, { x });
  s.juice.shake(160, 0.004);
}

/** A firework goes up from under the field and bursts high over it. */
function skyRocket(s: BonusStage, x: number): void {
  const color = SKY_COLORS[s.rng.int(0, SKY_COLORS.length - 1)]!;
  s.fx.play('fanfare.firework', x, s.field.bottom + 120, { tint: color, quiet: true });
}

/** The name lifts off its broken glass and dissolves upward. */
function releaseName(s: BonusStage, p: Plate, rise: number): void {
  const { name } = p;
  const final = name.getData('final') as string;
  if (s.calm) {
    s.scene.tweens.add({
      targets: name,
      alpha: 0,
      duration: 500,
      onComplete: () => name.destroy(),
    });
    return;
  }
  name.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
  s.scene.time.delayedCall(
    70,
    () => name.active && name.clearTint().setTintMode(Phaser.TintModes.MULTIPLY),
  );
  scramble(s.scene, name, final, 600);
  s.scene.tweens.add({
    targets: name,
    y: name.y - rise,
    rotation: 0,
    scaleX: 1.3,
    scaleY: 1.3,
    alpha: 0,
    duration: 1_300,
    ease: 'Cubic.Out',
    onComplete: () => name.destroy(),
  });
}

/** Glass breaking: shards in the plate's colour, its light flaring out, glyphs flaking away. */
function shatter(s: BonusStage, p: Plate, w: number, h: number, size: number): void {
  const { x, y, sprite } = p.target;
  const glow = GEMS[p.gem].glow;
  sprite.setVisible(false);
  p.light?.kill();
  s.fx.play('brick.shatter', x, y, { tint: glow, w, h, scale: size });
  s.fx.play('overseer.crack', x, y, { tint: glow, scale: size * 0.8, quiet: true });
  s.fx.play('overseer.dissolve', x, y, { tint: glow, scale: (w / 110) * 0.8 });
  s.lighting.flash(x, y, glow, 260 * size, 520, 1.6, 1.8, 5, true);
}

function breakCredit(s: BonusStage, run: CreditsRun, p: Plate): void {
  const t = p.target;
  const i = run.popped++;
  p.done = true;
  s.count('plates');
  s.score(PLATE_POINTS + PLATE_POINTS_STEP * i, t.x, t.y);
  s.coins(PLATE_COINS, t.x, t.y);
  shatter(s, p, PLATE_W, PLATE_H, 1);
  releaseName(s, p, 70);
  s.fx.play('fanfare.burst', t.x, t.y, { tint: GEMS[p.gem].glow });
  skyRocket(s, t.x);
  s.audio.sfx('angler_pod_burst', 0.4, Math.min(i, 10) * 40, { x: t.x });
  s.audio.sfx('fanfare_stab', 0.45, Math.min(i, 10) * 60, { x: t.x });
  s.juice.shake(110, 0.0035);
}

/** The last words, over the middle of the field: they decode out of the star's name. */
function finale(s: BonusStage, run: CreditsRun, from?: Plate): void {
  if (run.finale) return;
  run.finale = true;
  const { left, right, top, bottom } = s.field;
  const cx = (left + right) / 2;
  const cy = top + (bottom - top) * 0.42;
  const words = 'THANK YOU FOR PLAYING!';
  const text = nameText(s, words, 'gold', (right - left) * 0.9, FINALE_SIZE).setDepth(FINALE_DEPTH);
  text.setPosition(from?.name.x ?? cx, from?.name.y ?? cy);
  s.keep(text);
  if (from) from.name.setVisible(false);
  if (s.calm) {
    text.setPosition(cx, cy).setText(words);
    return;
  }
  text.setScale(0.6).setAlpha(0);
  s.scene.tweens.add({ targets: text, alpha: 1, duration: 200 });
  s.scene.tweens.add({ targets: text, x: cx, y: cy, scale: 1, duration: 900, ease: 'Back.Out' });
  scramble(s.scene, text, words, 1_100, 150);
  s.scene.tweens.add({
    targets: text,
    scale: 1.04,
    duration: 900,
    delay: 1_200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
}

function breakStar(s: BonusStage, run: CreditsRun, p: Plate): void {
  const t = p.target;
  const { left, right, top, bottom } = s.field;
  const cx = (left + right) / 2;
  p.done = true;
  run.starDone = true;
  run.star = undefined;
  s.count('star');
  s.score(STAR_POINTS, t.x, t.y, { label: 'STAR' });
  s.coins(STAR_COINS, t.x, t.y);
  s.slowmo(900);
  s.hype();
  shatter(s, p, STAR_W, STAR_H, 1.6);
  s.fx.play('screen.flare', t.x, t.y, { tint: GOLD });
  s.fx.play('fanfare.celebrate', cx, (top + bottom) / 2, { tint: GOLD });
  s.fx.play('fanfare.burst', t.x, t.y, { tint: GOLD, scale: 1.6 });
  for (const ray of run.rays) {
    s.scene.tweens.add({
      targets: ray,
      scale: ray.scale * 1.8,
      alpha: 0,
      duration: 1_600,
      ease: 'Cubic.Out',
    });
  }
  finale(s, run, p);
  p.name.destroy();
  s.audio.sfx('angler_pod_burst', 0.6, -300, { x: t.x });
  s.audio.sfx('new_best', 0.6);
  s.audio.sfx('fanfare_tail', 0.6);
  s.juice.shake(260, 0.007);
  if (!s.calm) s.juice.flash(200, 255, 236, 170);
  for (const other of s.targets()) if (other.kind === 'credit') s.hit(other, 'blast');
  s.wrapUp(ENCORE_MS);
}

function setup(s: BonusStage): void {
  const { scene } = s;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => dropPlateTextures(scene));
  // The ending's last plate stays up behind the field, so the credits roll over the fireworks.
  if (scene.textures.exists('cs_plate_victory')) {
    const img = scene.add
      .image(WIDTH / 2, HEIGHT / 2, 'cs_plate_victory')
      .setDepth(PLATE_BACKDROP_DEPTH);
    img.setScale(Math.max(STAGE_W / img.width, HEIGHT / img.height)).setTint(BACKDROP_TINT);
    s.keep(img);
  }
  runs.set(s, {
    times: creditTimes(),
    starAt: starAt(),
    next: 0,
    plates: [],
    rays: [],
    landed: false,
    starDone: false,
    finale: false,
    balls: 0,
    fire: false,
    skyAt: FIRST_AT,
    popped: 0,
  });
}

function tick(s: BonusStage, dtMs: number): void {
  const run = runs.get(s);
  if (!run) return;
  const { left, right, top } = s.field;
  const cx = (left + right) / 2;
  while (run.next < run.times.length && s.clock >= run.times[run.next]!) rollCredit(s, run);
  if (!run.star && !run.starDone && s.clock >= run.starAt) rollStar(s, run);
  for (let i = run.plates.length - 1; i >= 0; i--) {
    const p = run.plates[i]!;
    if (p.done) {
      run.plates.splice(i, 1);
      continue;
    }
    if (p.target.live) {
      followPlate(p);
      continue;
    }
    // It fell out of the bottom unbroken: its name and its light go with it.
    p.done = true;
    p.light?.kill();
    s.scene.tweens.add({
      targets: p.name,
      alpha: 0,
      duration: 160,
      onComplete: () => p.name.destroy(),
    });
  }
  const star = run.star;
  if (star?.target.live) {
    if (!run.landed && star.target.age >= STAR_IN_MS) starLands(s, run, star);
    for (const ray of run.rays) {
      ray.setPosition(star.target.x, star.target.y);
      ray.rotation += ((ray.getData('spin') as number) * dtMs) / 1000;
    }
  }
  // The roll builds toward the star: another ball, another, then fire.
  if (run.balls < BALL_AT.length && s.progress >= BALL_AT[run.balls]!) {
    run.balls++;
    s.balls(1, cx, top + 320);
    s.say('+1 BALL', cx, top + 300, '#7fe9ff', 22);
  }
  if (!run.fire && s.progress >= FIRE_AT) {
    run.fire = true;
    s.hype();
    // Real time, which bullet time stretches: enough to see the timer out.
    s.fireballs(s.timeLeftMs + 4_000);
    s.say('FIREBALLS!', cx, top + 300, '#ffb44d', 34);
    s.audio.sfx('sfx_hyper', 0.5);
  }
  if (s.clock >= run.skyAt) {
    const gap = s.calm
      ? SKY_GAP_CALM_MS
      : SKY_GAP_FIRST_MS + (SKY_GAP_LAST_MS - SKY_GAP_FIRST_MS) * s.progress;
    run.skyAt = s.clock + gap * s.rng.float(0.8, 1.2);
    skyRocket(s, s.rng.float(left + 60, right - 60));
  }
  const live = s.targets();
  const aim = run.star?.target.live
    ? run.star.target
    : live.reduce<Target | undefined>((low, t) => (!low || t.y > low.y ? t : low), undefined);
  s.steer(aim ? { x: aim.x, y: aim.y } : null, AIM_TURN);
}

/** A hit that didn't break it: the glass cracks, light glints off the break and the name glitches. */
function crack(s: BonusStage, p: Plate, cracks: number, star: boolean): void {
  const t = p.target;
  const glow = GEMS[p.gem].glow;
  // A brightening rather than the usual white-out, which would wipe the whole plate.
  t.sprite.setTint(0x505050).setTintMode(Phaser.TintModes.ADD);
  if (cracks !== p.cracks) {
    p.cracks = cracks;
    const w = star ? STAR_W : PLATE_W;
    const h = star ? STAR_H : PLATE_H;
    s.retexture(
      t,
      plateTexture(s.scene, {
        gem: p.gem,
        width: w,
        height: h,
        role: p.line.role,
        cracks,
        seed: p.seed,
      }),
    );
    s.fx.play('overseer.crack', t.x, t.y, { tint: glow, scale: star ? 0.8 : 0.5, quiet: true });
  }
  s.lighting.flash(t.x, t.y, glow, star ? 220 : 150, 240, 1.2, 1.4, 4, true);
  if (!s.calm) glitch(s, p.name);
}

const GLITCH_GLYPHS = '#$%&*<>/\\01';
/** A few letters of the name corrupt for a moment, then come back: it stays readable through a hail of hits. */
function glitch(s: BonusStage, name: Phaser.GameObjects.Text): void {
  const final = name.getData('final') as string;
  const frames = 3;
  for (let f = 0; f <= frames; f++) {
    s.scene.time.delayedCall(f * 45, () => {
      if (!name.active || name.getData('final') !== final) return;
      if (f === frames) {
        name.setText(final);
        return;
      }
      let out = '';
      for (const ch of final) {
        out +=
          /\s/.test(ch) || Math.random() > 0.28
            ? ch
            : GLITCH_GLYPHS[Math.floor(Math.random() * GLITCH_GLYPHS.length)];
      }
      name.setText(out);
    });
  }
}

function onHit(s: BonusStage, t: Target, _cause: HitCause, popped: boolean, dealt: number): void {
  const run = runs.get(s);
  if (!run || dealt <= 0) return;
  const p = run.plates.find((plate) => plate.target === t);
  if (!p) return;
  if (t.kind === 'credit') {
    if (popped) {
      breakCredit(s, run, p);
      return;
    }
    crack(s, p, PLATE_HP - t.hp, false);
    s.audio.sfx('angler_pod_crack', 0.3, 150 * (PLATE_HP - t.hp), { x: t.x });
    s.audio.sfx('ui_tally', 0.3, 200 * (PLATE_HP - t.hp), { x: t.x });
    return;
  }
  if (t.kind !== 'star') return;
  if (popped) {
    breakStar(s, run, p);
    return;
  }
  const broken = 1 - t.hp / STAR_HP;
  crack(s, p, Math.min(STAR_CRACKS, Math.floor(broken * (STAR_CRACKS + 1))), true);
  s.score(120, t.x, t.y, { quiet: true });
  s.audio.sfx('angler_pod_crack', 0.35, 400 * broken, { x: t.x });
  s.audio.sfx('ui_tally', 0.4, 900 * broken, { x: t.x });
  s.juice.shake(70, 0.0025);
  if (t.hp === 1) s.say('ONE MORE!', t.x, t.y - STAR_H / 2 - 12, '#ffffff', 24);
}

/** Time is out with the star still up: the show goes off anyway. */
function onTimeUp(s: BonusStage): void {
  const run = runs.get(s);
  if (!run) return;
  for (const p of run.plates) {
    if (p.done) continue;
    p.done = true;
    p.light?.kill();
    s.scene.tweens.add({
      targets: p.name,
      alpha: 0,
      duration: 200,
      onComplete: () => p.name.destroy(),
    });
  }
  for (const ray of run.rays) s.scene.tweens.add({ targets: ray, alpha: 0, duration: 400 });
  if (run.starDone) return;
  const { left, right, top, bottom } = s.field;
  s.fx.play('fanfare.celebrate', (left + right) / 2, (top + bottom) / 2, { tint: GOLD });
  finale(s, run);
  s.audio.sfx('fanfare_tail', 0.6);
}

export const credits: BonusDef = {
  id: 'credits',
  name: 'The Credits',
  kicker: 'Thanks for playing',
  rules: [{ text: 'BREAK THE CREDITS!' }],
  durationMs: CREDITS_MS,
  medals: [3_000, 7_000, 12_000],
  noTally: true,
  backdrop: 'mainframe',
  pace: 0.6,
  setup,
  tick,
  onHit,
  onTimeUp,
  tally: (stats) => [{ label: 'Credits broken', value: stats.counts.plates ?? 0 }],
};
