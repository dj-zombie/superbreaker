import Phaser from 'phaser';
import { HUD_FONT } from '../art/fonts';
import {
  ABILITY_INFO,
  HEIGHT,
  HUD_HEIGHT,
  POWERUP_INFO,
  RENDER_ZOOM,
  WIDTH,
  WING,
} from '../config';
import type { AbilityId } from '../core/Abilities';
import { MAX_LIVES } from '../core/Difficulty';
import { MAX_POWERUP_STOCK } from '../core/Session';
import { SKILLS, SKILL_IDS, type SkillId, type SkillView } from '../core/Skills';
import { inputSource, onInputSource, type InputSource } from '../platform/gamepad';
import { PAUSE_LABEL, onKeyLabels, skillKeyLabel, slotKeyLabel } from '../platform/keyboard';
import type { HudState, Play } from '../scenes/Play';
import type { SlotState } from '../systems/AbilitySystem';
import type { BossHud } from '../systems/BossDirector';
import { iconButton } from './Button';
import { framePanel } from './frames';
import { punch } from './fx/motion';
import { icon } from './icons';
import { disc, ring } from './shapes';
import { calm, css, type UiTheme } from './theme';
import { label, worldTitle } from './type';
import { Meter, RingTimer } from './widgets';

type Text = Phaser.GameObjects.Text;

/** Inner padding of a plate. */
const INSET = 20;
const SLOT_ROW = 46;
const EFFECT_ROW = 36;
const SLOT_RING = 36;

interface Hints {
  pause: string;
  slots: readonly string[];
  skills: readonly string[];
  stock: readonly string[];
}

const PAD_HINTS: Hints = {
  pause: 'START',
  slots: ['X', 'Y'],
  skills: ['A', 'B'],
  stock: ['LB', 'RB', 'LT', 'RT'],
};

/** Keyboard hints name the keys as the player's layout prints them. */
function hintsFor(source: InputSource): Hints {
  if (source === 'pad') return PAD_HINTS;
  return {
    pause: PAUSE_LABEL,
    slots: [slotKeyLabel(0), slotKeyLabel(1)],
    skills: SKILL_IDS.map(skillKeyLabel),
    stock: ['1', '2', '3', '4'],
  };
}

interface SlotRow {
  ring: RingTimer;
  icon: Phaser.GameObjects.Image;
  empty: Text;
  name: Text;
  hint: Text;
  shown: AbilityId | null;
  ready: boolean;
}

interface SkillRow {
  ring: RingTimer;
  glyph: Phaser.GameObjects.Image;
  name: Text;
  hint: Text;
  ready: boolean;
  lit: boolean;
}

interface EffectRow {
  name: Text;
  meter: Meter;
}

interface EffectLine {
  key: string;
  label: string;
  color: number;
  fraction: number;
  blink: boolean;
}

/** A boss's bar closes on its value over about this long, in ms, as the score counts up. */
const BOSS_EASE_MS = 90;
/** Radius of a boss's phase pip, and the space between two, in px. */
const PIP_RADIUS = 3;
const PIP_GAP = 4;

/** One frame of a boss's bar easing from `shown` toward `health`. Reduced motion jumps. */
export function easeBossBar(shown: number, health: number, delta: number): number {
  if (calm()) return health;
  const next = shown + (health - shown) * Math.min(1, delta / BOSS_EASE_MS);
  return Math.abs(health - next) < 0.002 ? health : next;
}

/**
 * One pip per phase of a boss, in a row that ends at `right`. Call `paintBossPips` to light them.
 * The second value is the row's left edge.
 */
export function bossPips(
  scene: Phaser.Scene,
  right: number,
  y: number,
  phases: number,
): [Phaser.GameObjects.Image[], number] {
  const pitch = PIP_RADIUS * 2 + PIP_GAP;
  const left = right - phases * pitch + PIP_GAP;
  const pips = Array.from({ length: phases }, (_, i) =>
    disc(scene, left + PIP_RADIUS + i * pitch, y, PIP_RADIUS, 0xffffff),
  );
  return [pips, left];
}

/** Lights the pips of the phase being fought and of those still to come. */
export function paintBossPips(
  pips: readonly Phaser.GameObjects.Image[],
  phase: number,
  t: UiTheme,
): void {
  pips.forEach((pip, i) => {
    const lit = i >= phase;
    pip.setTint(lit ? t.palette.danger : t.palette.edge).setAlpha(lit ? 1 : 0.45);
  });
}

/** Scales a label down to fit the plate instead of letting it run over the frame. */
function fit<T extends Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText>(
  obj: T,
  max: number,
): T {
  obj.setScale(1);
  if (obj.width > max) obj.setScale(max / obj.width);
  return obj;
}

/**
 * The play HUD on the wide stage: two glass plates on the outer rock of each wing. Left holds
 * score, level, world, lives, Fever and the run clock; right holds pause, the ability slots,
 * running powerups and stock. Built inside the Hud scene, which draws over Play.
 */
export class WingPlates {
  private readonly w: number;
  private readonly top: number;
  private readonly lx: number;
  private readonly rx: number;
  private readonly inner: number;

  private score!: Phaser.GameObjects.BitmapText;
  private level!: Phaser.GameObjects.BitmapText;
  private clock?: Phaser.GameObjects.BitmapText;
  private hearts: Phaser.GameObjects.Image[] = [];
  private fever!: Meter;
  /** A boss's bar and pips. Only built when the level starts with a boss. */
  private boss?: { meter: Meter; pips: Phaser.GameObjects.Image[]; shown: number; phase: number };
  private shownScore = 0;
  private last = { lives: -1, shown: -1, label: '', clock: -1 };

  private pauseHint!: Text;
  private slots: SlotRow[] = [];
  private skills: SkillRow[] = [];
  private effectsTop = 0;
  private effectKey: string | null = null;
  private effects = new Map<string, EffectRow>();
  private quiet!: Text;
  private stockLabel!: Text;
  private sockets: Phaser.GameObjects.Image[] = [];
  private stockKey: string | null = null;
  private stockIcons: Phaser.GameObjects.Container[] = [];
  private stockY = 0;
  private stockGap = 44;
  private stockRadius = 16;
  private rightPanel?: Phaser.GameObjects.Container;
  private rightHeight = 0;
  private hints: Hints = hintsFor('keyboard');
  private spot?: { ring: Phaser.GameObjects.Image; arrow: Phaser.GameObjects.Image; scale: number };

  constructor(
    private scene: Phaser.Scene,
    private play: Play,
    private t: UiTheme,
  ) {
    this.w = Phaser.Math.Clamp(Math.round(WING * 0.76), 170, 340);
    const margin = Phaser.Math.Clamp(Math.round(WING * 0.08), 12, 40);
    this.top = Math.round(HEIGHT * 0.07);
    this.lx = -WING + margin;
    this.rx = WIDTH + WING - margin - this.w;
    this.inner = this.w - INSET * 2;
    this.hints = hintsFor(inputSource());

    this.drawRails();
    this.buildLeft(play.runConfig?.goal.kind === 'timed');
    this.buildRight();
    const off = onInputSource((s) => this.setHints(s));
    const offKeys = onKeyLabels(() => this.setHints(inputSource()));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      offKeys();
    });
  }

  update(s: HudState, delta: number): void {
    this.drawScore(s, delta);
    this.drawLabel(s);
    if (s.lives !== this.last.lives) this.drawLives(s.lives);
    this.drawFever(s);
    this.drawBoss(s.boss, delta);
    this.drawClock(s.clockMs);
    s.slots.forEach((slot, i) => {
      const row = this.slots[i];
      if (row) this.drawSlot(row, slot);
    });
    s.skills.forEach((skill, i) => {
      const row = this.skills[i];
      if (row) this.drawSkill(row, skill);
    });
    this.drawEffects(s);
    this.drawStock(s);
  }

  /** Lights the slot or skill row the tutorial is waiting on, with an arrow in from the field. */
  spotlight(slot: number | null, skill: SkillId | null): void {
    const row = skill ? this.skills[SKILL_IDS.indexOf(skill)] : slot === null ? undefined : this.slots[slot];
    let v = this.spot;
    if (!row) {
      v?.ring.setVisible(false);
      v?.arrow.setVisible(false);
      return;
    }
    if (!v) {
      const color = this.t.palette.accentHi;
      const r = ring(this.scene, 0, 0, SLOT_RING / 2 + 8, 3, color).setDepth(4);
      const arrow = icon(this.scene, 0, 0, 'back', 26, color).setAngle(180).setDepth(4);
      v = this.spot = { ring: r, arrow, scale: r.scale };
    }
    const wave = calm() ? 0 : Math.sin(this.scene.time.now / 180);
    v.ring.setVisible(true).setPosition(row.ring.x, row.ring.y).setScale(v.scale * (1 + 0.08 * wave));
    v.arrow.setVisible(true).setPosition(this.rx - 20 + wave * 4, row.ring.y);
  }

  // ---------------------------------------------------------------- frame

  private panel(x: number, h: number): Phaser.GameObjects.Container {
    return framePanel(this.scene, x + this.w / 2, this.top + h / 2, this.w, h, this.t, {
      variant: 'glass',
    }).setDepth(0);
  }

  /** Without the HUD strip and the screen edges, the walls and ceiling need a line to read. */
  private drawRails(): void {
    const p = this.t.palette;
    const h = HEIGHT - HUD_HEIGHT;
    for (const x of [0, WIDTH]) {
      this.scene.add.rectangle(x, HUD_HEIGHT, 2, h, p.edge, 0.55).setOrigin(0.5, 0).setDepth(0);
    }
    this.scene.add.rectangle(0, HUD_HEIGHT, WIDTH, 2, p.edge, 0.55).setOrigin(0, 0.5).setDepth(0);
  }

  private hintText(x: number, y: number, text: string): Text {
    return this.scene.add
      .text(x, y, text, {
        fontFamily: this.t.fonts.display,
        fontStyle: '800',
        fontSize: '12px',
        color: this.t.palette.textDim,
        resolution: RENDER_ZOOM,
      })
      .setOrigin(1, 0.5)
      .setLetterSpacing(1)
      .setDepth(2);
  }

  private setHints(source: InputSource): void {
    const next = hintsFor(source);
    const same = (a: readonly string[], b: readonly string[]) => a.join() === b.join();
    if (
      next.pause === this.hints.pause &&
      same(next.slots, this.hints.slots) &&
      same(next.skills, this.hints.skills)
    ) {
      return;
    }
    this.hints = next;
    this.pauseHint.setText(next.pause);
    this.slots.forEach((row, i) => row.hint.setText(next.slots[i] ?? ''));
    this.skills.forEach((row, i) => row.hint.setText(next.skills[i] ?? ''));
    this.stockKey = null;
  }

  // ---------------------------------------------------------------- left

  private buildLeft(timed: boolean): void {
    const scene = this.scene;
    const t = this.t;
    const x = this.lx + INSET;
    let y = this.top + 26;
    label(scene, x, y, 'Score', 13, { t, originX: 0 }).setDepth(2);
    y += 32;
    this.score = scene.add.bitmapText(x, y, HUD_FONT, '0', 40).setOrigin(0, 0.5).setDepth(2);
    y += 36;
    this.level = scene.add
      .bitmapText(x, y, HUD_FONT, '', 17)
      .setOrigin(0, 0.5)
      .setTint(Phaser.Display.Color.HexStringToColor(t.palette.textDim).color)
      .setDepth(2);
    y += 28;
    fit(worldTitle(scene, x, y, t.name, 16, { t, originX: 0 }), this.inner).setDepth(2);
    y += 32;
    for (let i = 0; i < MAX_LIVES; i++) {
      const h = scene.add.image(x + 11 + i * 28, y, 'heart').setDepth(2);
      h.setScale(22 / h.width);
      this.hearts.push(h);
    }
    y += 34;
    label(scene, x, y, 'Fever', 13, { t, originX: 0 }).setDepth(2);
    y += 22;
    this.fever = new Meter(
      scene,
      this.lx + this.w / 2,
      y,
      this.inner,
      10,
      0,
      t.palette.accent,
    ).setDepth(2);
    y += 20;
    // The HUD is built as the level starts, and a boss puts its bar up before that.
    const boss = (this.play.hud as HudState | undefined)?.boss;
    if (boss) {
      y += 12;
      label(scene, x, y, 'Boss', 13, { t, originX: 0 }).setDepth(2);
      const [pips] = bossPips(scene, this.lx + this.w - INSET, y, boss.phases);
      for (const pip of pips) pip.setDepth(2);
      y += 22;
      const meter = new Meter(
        scene,
        this.lx + this.w / 2,
        y,
        this.inner,
        10,
        boss.health,
        t.palette.danger,
      ).setDepth(2);
      this.boss = { meter, pips, shown: boss.health, phase: -1 };
      y += 20;
    }
    if (timed) {
      y += 12;
      label(scene, x, y, 'Time', 13, { t, originX: 0 }).setDepth(2);
      y += 30;
      this.clock = scene.add.bitmapText(x, y, HUD_FONT, '', 30).setOrigin(0, 0.5).setDepth(2);
      y += 22;
    }
    this.panel(this.lx, y - this.top + 18);
  }

  private drawScore(s: HudState, delta: number): void {
    // Count up smoothly instead of jumping, as the board HUD does.
    this.shownScore += (s.score - this.shownScore) * Math.min(1, delta / 90);
    if (Math.abs(s.score - this.shownScore) < 1) this.shownScore = s.score;
    const shown = Math.round(this.shownScore);
    if (shown === this.last.shown) return;
    this.last.shown = shown;
    fit(this.score.setText(shown.toLocaleString()), this.inner);
  }

  private drawLabel(s: HudState): void {
    const text = `${s.title}  ·  ${s.detail ?? `${s.remaining} LEFT`}`;
    if (text === this.last.label) return;
    this.last.label = text;
    fit(this.level.setText(text), this.inner);
  }

  private drawLives(lives: number): void {
    const lost = lives < this.last.lives;
    const gained = this.last.lives >= 0 && lives > this.last.lives;
    this.last.lives = lives;
    this.hearts.forEach((h, i) => {
      h.setVisible(i < Math.max(lives, 3)).setAlpha(i < lives ? 1 : 0.18);
      const base = 22 / h.width;
      if ((lost && i === lives) || (gained && i === lives - 1)) {
        this.scene.tweens.add({
          targets: h,
          scale: { from: base * 1.8, to: base },
          duration: 300,
          ease: 'Back.Out',
        });
      }
    });
  }

  private drawFever(s: HudState): void {
    this.fever.set(Phaser.Math.Clamp(s.fever, 0, 1), false);
    if (s.feverActive) {
      const hue = (this.scene.time.now / 1500) % 1;
      this.fever.setColor(Phaser.Display.Color.HSVToRGB(hue, 0.7, 1).color);
    } else {
      const full = s.fever > 0.8 && Math.floor(this.scene.time.now / 120) % 2 === 0;
      this.fever.setColor(full ? 0xffffff : this.t.palette.accent);
    }
  }

  /** The bar drains with the boss's pool, and stays on the plate, empty, once the boss is dead. */
  private drawBoss(boss: BossHud | null, delta: number): void {
    const v = this.boss;
    if (!v) return;
    const shown = boss?.shown ?? true;
    v.meter.setVisible(shown);
    for (const pip of v.pips) pip.setVisible(shown);
    v.shown = easeBossBar(v.shown, boss?.health ?? 0, delta);
    v.meter.set(v.shown, false);
    const phase = boss?.phase ?? v.pips.length;
    if (phase === v.phase) return;
    v.phase = phase;
    paintBossPips(v.pips, phase, this.t);
  }

  private drawClock(ms: number | null): void {
    const clock = this.clock;
    if (!clock || ms === null) return;
    const secs = Math.ceil(ms / 1000);
    const urgent = secs <= 10;
    clock.setAlpha(urgent && Math.floor(ms / 250) % 2 ? 0.45 : 1);
    if (secs === this.last.clock) return;
    if (this.last.clock > 0 && secs > this.last.clock) {
      this.scene.tweens.add({ targets: clock, scale: { from: 1.4, to: 1 }, duration: 260 });
    }
    this.last.clock = secs;
    clock.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    clock.setTint(urgent ? this.t.palette.danger : 0xffffff);
  }

  // ---------------------------------------------------------------- right

  private buildRight(): void {
    const scene = this.scene;
    const t = this.t;
    const x = this.rx + INSET;
    const right = this.rx + this.w - INSET;
    let y = this.top + 32;
    iconButton(scene, x + 19, y, 'pause', () => this.play.requestPause(), 38).setDepth(2);
    label(scene, x + 50, y, 'Pause', 13, { t, originX: 0 }).setDepth(2);
    this.pauseHint = this.hintText(right, y, this.hints.pause);
    y += 52;
    for (let i = 0; i < 2; i++) {
      this.slots.push(this.makeSlot(i, y));
      y += SLOT_ROW;
    }
    SKILL_IDS.forEach((id, i) => {
      this.skills.push(this.makeSkill(id, i, y));
      y += SLOT_ROW;
    });
    y += 2;
    label(scene, x, y, 'Powerups', 13, { t, originX: 0 }).setDepth(2);
    y += 22;
    this.effectsTop = y;
    this.quiet = label(scene, x, y + 10, 'None running', 12, { t, originX: 0 })
      .setAlpha(0.6)
      .setDepth(2);
    this.stockLabel = label(scene, x, 0, 'Stock', 13, { t, originX: 0 }).setDepth(2);
    this.stockGap = Math.min(44, this.inner / MAX_POWERUP_STOCK);
    this.stockRadius = Math.round(Math.min(16, this.stockGap * 0.38));
    for (let i = 0; i < MAX_POWERUP_STOCK; i++) {
      this.sockets.push(ring(scene, 0, 0, this.stockRadius, 2, t.palette.edge, 0.45).setDepth(2));
    }
    this.layoutRight(0);
  }

  private makeSlot(i: number, y: number): SlotRow {
    const scene = this.scene;
    const p = this.t.palette;
    const x = this.rx + INSET + SLOT_RING / 2;
    const ringTimer = new RingTimer(scene, x, y, SLOT_RING, p.edge).setDepth(2);
    ringTimer.set(0);
    const icon = scene.add.image(x, y, 'ab_meteor').setVisible(false).setDepth(3);
    const empty = scene.add
      .text(x, y, '?', {
        fontFamily: this.t.fonts.display,
        fontStyle: '800',
        fontSize: '16px',
        color: p.textDim,
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0.5)
      .setAlpha(0.6)
      .setDepth(3);
    const name = scene.add
      .text(x + SLOT_RING / 2 + 12, y, 'Empty', {
        fontFamily: this.t.fonts.display,
        fontStyle: '700',
        fontSize: '17px',
        color: p.textDim,
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0, 0.5)
      .setDepth(2);
    const hint = this.hintText(this.rx + this.w - INSET, y, this.hints.slots[i] ?? '');
    scene.add
      .zone(this.rx + this.w / 2, y, this.w - 12, SLOT_ROW - 4)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.play.fireSlot(i));
    return { ring: ringTimer, icon, empty, name, hint, shown: null, ready: false };
  }

  private drawSlot(row: SlotRow, slot: SlotState): void {
    const id = slot.display;
    const ready = !!slot.ability;
    const color = id ? ABILITY_INFO[id].color : this.t.palette.edge;
    const spin = (this.scene.time.now / 500) % 1;
    row.ring.setColor(color).set(ready ? 1 : slot.spinning ? spin : 0);
    row.empty.setVisible(!id);
    row.icon.setVisible(!!id);
    if (id && id !== row.shown) {
      row.icon.setTexture(`ab_${id}`);
      row.icon.setScale((SLOT_RING * 0.62) / row.icon.width);
    }
    const text = id ? ABILITY_INFO[slot.ability ?? id].label : 'Empty';
    if (row.name.text !== text) row.name.setText(text);
    row.name
      .setColor(ready ? css(color) : this.t.palette.textDim)
      .setAlpha(slot.spinning ? 0.7 : 1);
    if (ready && !row.ready && !calm()) punch(this.scene, row.ring, 1.3);
    row.shown = id;
    row.ready = ready;
  }

  private makeSkill(id: SkillId, i: number, y: number): SkillRow {
    const scene = this.scene;
    const color = SKILLS[id].color;
    const x = this.rx + INSET + SLOT_RING / 2;
    const ringTimer = new RingTimer(scene, x, y, SLOT_RING, color).setDepth(2);
    ringTimer.set(0);
    const glyph = icon(scene, x, y, id, SLOT_RING * 0.55, color).setDepth(3);
    const name = scene.add
      .text(x + SLOT_RING / 2 + 12, y, SKILLS[id].label, {
        fontFamily: this.t.fonts.display,
        fontStyle: '700',
        fontSize: '17px',
        color: this.t.palette.textDim,
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0, 0.5)
      .setDepth(2);
    const hint = this.hintText(this.rx + this.w - INSET, y, this.hints.skills[i] ?? '');
    scene.add
      .zone(this.rx + this.w / 2, y, this.w - 12, SLOT_ROW - 4)
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.POINTER_DOWN, () => this.play.useSkill(id))
      .on(Phaser.Input.Events.POINTER_UP, () => this.play.releaseSkill(id))
      .on(Phaser.Input.Events.POINTER_OUT, () => this.play.releaseSkill(id));
    return { ring: ringTimer, glyph, name, hint, ready: false, lit: false };
  }

  private drawSkill(row: SkillRow, s: SkillView): void {
    const color = SKILLS[s.id].color;
    const lit = s.ready || s.active;
    row.ring.setColor(s.active ? 0xffffff : color).set(s.fraction);
    row.glyph.setTint(s.active ? 0xffffff : color).setAlpha(lit ? 1 : 0.45);
    if (lit !== row.lit) row.name.setColor(lit ? css(color) : this.t.palette.textDim);
    if (s.ready && !row.ready && !calm()) punch(this.scene, row.ring, 1.3);
    row.ready = s.ready;
    row.lit = lit;
  }

  private effectLines(s: HudState): EffectLine[] {
    const lines: EffectLine[] = s.effects.map((e) => ({
      key: e.id,
      label: POWERUP_INFO[e.id].label,
      color: POWERUP_INFO[e.id].color,
      fraction: Phaser.Math.Clamp(e.remainingMs / e.totalMs, 0, 1),
      blink: e.remainingMs < 1500 && Math.floor(e.remainingMs / 150) % 2 === 1,
    }));
    if (s.shield) {
      const info = POWERUP_INFO.shield;
      lines.push({
        key: 'shield',
        label: info.label,
        color: info.color,
        fraction: 1,
        blink: false,
      });
    }
    return lines;
  }

  private drawEffects(s: HudState): void {
    const lines = this.effectLines(s);
    const key = lines.map((l) => l.key).join(',');
    if (key !== this.effectKey) {
      this.effectKey = key;
      for (const [k, row] of this.effects) {
        if (lines.some((l) => l.key === k)) continue;
        row.name.destroy();
        row.meter.destroy();
        this.effects.delete(k);
      }
      lines.forEach((l, i) => {
        const y = this.effectsTop + i * EFFECT_ROW;
        let row = this.effects.get(l.key);
        if (!row) {
          row = this.makeEffect(l);
          this.effects.set(l.key, row);
        }
        row.name.setY(y + 2);
        row.meter.setY(y + 20);
      });
      this.quiet.setVisible(lines.length === 0);
      this.layoutRight(lines.length);
    }
    for (const l of lines) {
      const row = this.effects.get(l.key);
      if (!row) continue;
      row.meter.set(l.fraction, false).setAlpha(l.blink ? 0.4 : 1);
      row.name.setAlpha(l.blink ? 0.4 : 1);
    }
  }

  private makeEffect(l: EffectLine): EffectRow {
    const name = this.scene.add
      .text(this.rx + INSET, 0, l.label.toUpperCase(), {
        fontFamily: this.t.fonts.display,
        fontStyle: '700',
        fontSize: '14px',
        color: css(l.color),
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0, 0.5)
      .setLetterSpacing(1)
      .setDepth(2);
    const meter = new Meter(
      this.scene,
      this.rx + this.w / 2,
      0,
      this.inner,
      8,
      l.fraction,
      l.color,
    ).setDepth(2);
    if (!calm()) {
      meter.setScale(0.6, 1);
      this.scene.tweens.add({ targets: meter, scaleX: 1, duration: 220, ease: 'Back.Out' });
    }
    return { name, meter };
  }

  /** Moves the stock row under the running powerups and fits the plate around them. */
  private layoutRight(rows: number): void {
    const effectsBottom = this.effectsTop + Math.max(1, rows) * EFFECT_ROW;
    const labelY = effectsBottom + 10;
    this.stockLabel.setY(labelY);
    this.stockY = labelY + 32;
    const x0 = this.rx + INSET + this.stockRadius + 2;
    this.sockets.forEach((s, i) => s.setPosition(x0 + i * this.stockGap, this.stockY));
    this.stockKey = null;
    const h = this.stockY + this.stockRadius + 22 - this.top;
    if (h === this.rightHeight) return;
    this.rightHeight = h;
    if (this.rightPanel) {
      for (const child of this.rightPanel.list) this.scene.tweens.killTweensOf(child);
      this.rightPanel.destroy();
    }
    this.rightPanel = this.panel(this.rx, h);
  }

  private drawStock(s: HudState): void {
    const key = s.stock.join(',');
    if (key === this.stockKey) return;
    this.stockKey = key;
    for (const icon of this.stockIcons) icon.destroy();
    const scene = this.scene;
    const r = this.stockRadius;
    const x0 = this.rx + INSET + r + 2;
    this.stockIcons = s.stock.map((id, i) => {
      const root = scene.add.container(x0 + i * this.stockGap, this.stockY).setDepth(3);
      const info = POWERUP_INFO[id];
      const icon = scene.add.image(0, 0, info.texture);
      icon.setScale((r * 1.35) / Math.max(icon.width, icon.height));
      const hint = this.hints.stock[i] ?? '';
      root.add([
        disc(scene, 0, 0, r, this.t.palette.base, 0.9),
        ring(scene, 0, 0, r, 3, info.color),
        icon,
        scene.add
          .text(r + 2, r, hint, {
            fontFamily: this.t.fonts.display,
            fontStyle: '800',
            fontSize: '10px',
            color: this.t.palette.text,
            resolution: RENDER_ZOOM,
          })
          .setOrigin(1, 0.5),
      ]);
      root.setSize(r * 2, r * 2);
      root.setInteractive(new Phaser.Geom.Circle(r, r, r + 6), Phaser.Geom.Circle.Contains);
      root.on(Phaser.Input.Events.POINTER_DOWN, () => this.play.useStock(i));
      return root;
    });
  }
}
