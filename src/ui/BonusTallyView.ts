import Phaser from 'phaser';
import { HEIGHT, STAGE_W, WIDTH, WING } from '../config';
import { envelope } from '../core/Boss';
import { TALLY_LEAD_MS } from '../core/Bonus';
import type { BonusTallyCard } from '../systems/BonusDirector';
import { calm, css, theme } from './theme';
import { display, gradientFill, label, worldTitle } from './type';

/** Over the HUD and the bonus strip; the boss cinema never shares a level with it. */
const DIM_DEPTH = 2000;
const CARD_DEPTH = 2020;
/** The field behind the tally darkens this far, over the tally's lead. */
const DIM = 0.74;
/** Where things sit down the screen, 0..1. */
const KICKER_AT = 0.12;
const NAME_AT = 0.17;
const ROWS_AT = 0.25;
const REWARD_AT = 0.78;
const PROMPT_AT = 0.85;
/** Rows are this far apart, in px; the score row has extra room above it for its rule. */
const ROW_GAP = 36;
/** The medal's top sits this far under the last row, in px; the reward line this far under its name. */
const MEDAL_GAP = 22;
const REWARD_GAP = 30;
const SCORE_ROOM = 14;
/** Each row's label and number sit this far either side of the middle, in px. */
const ROW_HALF = 170;
const ROW_SIZE = 20;
const SCORE_SIZE = 32;
/** A row slides in this far, in px, over this long, in ms, just before it counts. */
const ROW_SLIDE = 24;
const ROW_IN_MS = 180;
/** A number punches up this much each time it ticks. */
const TICK_PUNCH = 0.18;
/** The medal on screen, in px; it slams in from this much larger. */
const MEDAL_W = 150;
const MEDAL_H = 150;
const SLAM_FROM = 2.6;
const SLAM_MS = 420;
const GLOW_SIZE = 300;
/** The glow behind the medal breathes once in this long, in ms. */
const GLOW_BEAT_MS = 1400;
/** "New best" follows the medal by this long, in ms. */
const BEST_AFTER_MS = 450;
const PROMPT_BEAT_MS = 1100;
const WAIT_WIDTH = 150;
const WAIT_HEIGHT = 3;
const NAME_SIZE = 40;
const GLOW_ROOM = 0.6;

const MEDAL_NAME = { none: 'No medal', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
const MEDAL_GLOW = { none: 0x8a83b8, bronze: 0xd08a4a, silver: 0xd8e0ee, gold: 0xffc93c } as const;

type Text = Phaser.GameObjects.Text;
type Image = Phaser.GameObjects.Image;

interface RowView {
  label: Text;
  value: Text;
  coin?: Phaser.GameObjects.Sprite;
  rule?: Phaser.GameObjects.Rectangle;
  shown: number;
  punch?: Phaser.Tweens.Tween;
}

/**
 * The tally after a bonus stage: each stat counts up in turn, then the coins, then the medal
 * slams in. It draws only what `BonusTallyCard` says is true now, so a skip lands everything at
 * once and a pause holds it.
 */
export class BonusTallyView {
  private readonly dim: Phaser.GameObjects.Rectangle;
  private built?: {
    kicker: Text;
    name: Text;
    rows: RowView[];
    glow: Image;
    medal?: Image;
    medalName: Text;
    /** The medal's middle, under however many rows the stage has. */
    medalY: number;
    best: Text;
    reward: Text;
    prompt: Text;
    wait: Phaser.GameObjects.Rectangle;
  };
  private readonly mine = new Set<Phaser.GameObjects.GameObject>();

  constructor(private scene: Phaser.Scene) {
    this.dim = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0, 0).setDepth(DIM_DEPTH);
    this.update(null);
  }

  owns(): ReadonlySet<Phaser.GameObjects.GameObject> {
    const mine = this.mine;
    mine.clear();
    mine.add(this.dim);
    for (const o of this.parts()) mine.add(o);
    return mine;
  }

  update(card: BonusTallyCard | null): void {
    const still = calm();
    const dim = card ? DIM * Math.min(1, card.ms / TALLY_LEAD_MS) : 0;
    this.dim
      .setVisible(dim > 0)
      .setPosition(-WING, 0)
      .setSize(STAGE_W, HEIGHT)
      .setAlpha(dim);
    if (!card) {
      for (const o of this.parts()) o.setVisible(false);
      return;
    }
    const v = this.build(card);
    const { ms } = card;
    const head = envelope(ms, Infinity, TALLY_LEAD_MS, 0);
    v.kicker.setVisible(true).setAlpha(head);
    v.name.setVisible(true).setAlpha(head);
    this.drawRows(card, still);
    this.drawMedal(card, still);
    const after = ms - card.medalAt;
    v.best
      .setVisible(card.best && after >= BEST_AFTER_MS)
      .setScale(still ? 1 : 1 + 0.06 * Math.sin((ms / 300) * Math.PI));
    v.reward.setVisible(ms >= card.readyAt - 200).setAlpha(envelope(ms - card.readyAt + 200, Infinity, 250, 0));
    const beat = still ? 1 : 0.5 - 0.5 * Math.cos((ms / PROMPT_BEAT_MS) * Math.PI * 2);
    v.prompt.setVisible(card.ready).setAlpha(Phaser.Math.Linear(0.55, 1, beat));
    v.wait.setVisible(card.ready).setScale(Math.max(0, card.left), 1);
  }

  destroy(): void {
    this.dim.destroy();
    for (const o of this.parts()) o.destroy();
  }

  private parts(): Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.Depth> {
    const v = this.built;
    if (!v) return [];
    const rows = v.rows.flatMap((r) => [r.label, r.value, ...(r.coin ? [r.coin] : []), ...(r.rule ? [r.rule] : [])]);
    const medal = v.medal ? [v.medal] : [];
    return [v.kicker, v.name, ...rows, v.glow, ...medal, v.medalName, v.best, v.reward, v.prompt, v.wait];
  }

  private drawRows(card: BonusTallyCard, still: boolean): void {
    const v = this.built!;
    card.rows.forEach((row, i) => {
      const r = v.rows[i]!;
      const start = this.rowStart(card, i);
      const k = envelope(card.ms - start + ROW_IN_MS, Infinity, ROW_IN_MS, 0);
      const slide = still ? 0 : (1 - k) * ROW_SLIDE;
      for (const o of [r.label, r.value, r.coin, r.rule]) o?.setVisible(k > 0).setAlpha(k);
      r.label.setX(WIDTH / 2 - ROW_HALF - slide);
      r.value.setX(WIDTH / 2 + ROW_HALF + slide);
      const value = card.values[i] ?? 0;
      if (value === r.shown) return;
      r.shown = value;
      r.value.setText(`${row.prefix ?? ''}${value.toLocaleString()}${row.suffix ?? ''}`);
      r.coin?.setX(r.value.x - r.value.width - 16);
      if (still) return;
      r.punch?.stop();
      r.value.setScale(1 + TICK_PUNCH);
      r.punch = this.scene.tweens.add({ targets: r.value, scale: 1, duration: 120, ease: 'Cubic.Out' });
    });
  }

  private rowStart(card: BonusTallyCard, i: number): number {
    return card.rowTimes[i]?.start ?? TALLY_LEAD_MS;
  }

  private drawMedal(card: BonusTallyCard, still: boolean): void {
    const v = this.built!;
    const after = card.ms - card.medalAt;
    const shown = after >= 0;
    const y = v.medalY;
    v.medalName.setVisible(shown);
    v.glow.setVisible(shown && card.medal !== 'none');
    if (!v.medal) {
      if (shown) v.medalName.setY(y).setAlpha(Math.min(1, after / 200));
      return;
    }
    v.medal.setVisible(shown);
    if (!shown) return;
    const k = Math.min(1, after / SLAM_MS);
    const scale = still ? 1 : Phaser.Math.Linear(SLAM_FROM, 1, Phaser.Math.Easing.Back.Out(k));
    v.medal
      .setY(y)
      .setDisplaySize(MEDAL_W * scale, MEDAL_H * scale)
      .setAlpha(still ? Math.min(1, after / 200) : Math.min(1, k * 3));
    const breathe = still ? 0.5 : 0.4 + 0.2 * Math.sin((card.ms / GLOW_BEAT_MS) * Math.PI * 2);
    v.glow.setY(y).setAlpha(breathe * Math.min(1, k * 2)).setDisplaySize(GLOW_SIZE, GLOW_SIZE);
    v.medalName.setY(y + MEDAL_H / 2 + 22).setAlpha(Math.min(1, k * 2));
  }

  /** The card's pieces, built the first time it shows. A stage has one tally. */
  private build(card: BonusTallyCard): NonNullable<BonusTallyView['built']> {
    if (this.built) return this.built;
    const { scene } = this;
    const t = theme();
    const p = t.palette;
    const x = WIDTH / 2;
    const kicker = label(scene, x, HEIGHT * KICKER_AT, 'Bonus stage', 15, { t, color: p.textDim });
    const name = worldTitle(scene, x, HEIGHT * NAME_AT, card.name, NAME_SIZE, { t });
    const room = NAME_SIZE * GLOW_ROOM;
    name.setPadding(room, room, room, room);
    gradientFill(name, t.headingStops);
    let y = HEIGHT * ROWS_AT;
    // The row the medal is measured on stands out: big and gold, with room above it.
    const headline = card.medalBy === 'coins' ? 'coins' : 'score';
    const rows: RowView[] = card.rows.map((row) => {
      const big = row.kind === headline;
      if (big) y += SCORE_ROOM;
      const size = big ? SCORE_SIZE : ROW_SIZE;
      const color = big || row.kind === 'coins' ? css(p.gold) : p.text;
      const lbl = label(scene, x - ROW_HALF, y, row.label, big ? 18 : 16, { t, color: p.textDim }).setOrigin(0, 0.5);
      const value = display(scene, x + ROW_HALF, y, '0', size, { t, color }).setOrigin(1, 0.5);
      const view: RowView = { label: lbl, value, shown: -1 };
      if (row.kind === 'score') {
        view.rule = scene.add.rectangle(x, y - (big ? ROW_GAP / 2 + 2 : ROW_GAP / 2), ROW_HALF * 2, 1, p.accentHi, 0.6);
      }
      if (row.kind === 'coins') {
        const coin = scene.add.sprite(0, y, 'coin').setDisplaySize(big ? 30 : 22, big ? 30 : 22);
        if (scene.anims.exists('coin-spin')) coin.play('coin-spin');
        view.coin = coin;
      }
      y += big ? ROW_GAP + SCORE_ROOM : ROW_GAP;
      return view;
    });
    const glow = scene.add
      .image(x, 0, 'spark')
      .setTint(MEDAL_GLOW[card.medal])
      .setBlendMode(Phaser.BlendModes.ADD);
    const medal = card.medal === 'none' ? undefined : scene.add.image(x, 0, `medal_${card.medal}`);
    const medalName = display(scene, x, 0, MEDAL_NAME[card.medal].toUpperCase(), card.medal === 'none' ? 30 : 24, {
      t,
      color: card.medal === 'none' ? p.textDim : css(MEDAL_GLOW[card.medal]),
    });
    const medalY = y - ROW_GAP / 2 + MEDAL_GAP + MEDAL_H / 2;
    const best = display(scene, x + ROW_HALF - 10, medalY - MEDAL_H / 2, 'NEW BEST!', 22, {
      t,
      color: css(p.accentHi),
    }).setAngle(12);
    const rewardY = Math.max(HEIGHT * REWARD_AT, medalY + MEDAL_H / 2 + 22 + REWARD_GAP);
    const promptY = Math.max(HEIGHT * PROMPT_AT, rewardY + 50);
    const reward = label(scene, x, rewardY, rewardLine(card), 17, { t, color: css(p.gold) });
    const prompt = label(scene, x, promptY, 'Tap to continue', 15, { t, color: p.text });
    const wait = scene.add.rectangle(x, promptY + 24, WAIT_WIDTH, WAIT_HEIGHT, p.accentHi);
    this.built = { kicker, name, rows, glow, medal, medalName, medalY, best, reward, prompt, wait };
    for (const o of this.parts()) (o as Image).setDepth(CARD_DEPTH);
    glow.setDepth(CARD_DEPTH - 1);
    return this.built;
  }
}

/** What the medal earns, in words. */
function rewardLine(card: BonusTallyCard): string {
  const { coins, abilityCharges } = card.reward;
  if (coins <= 0 && abilityCharges <= 0) return 'Score a medal to earn a reward';
  const parts = [`+${coins} coins`];
  if (abilityCharges > 0) parts.push(`+${abilityCharges} ability charge${abilityCharges > 1 ? 's' : ''}`);
  return parts.join('   ·   ');
}
