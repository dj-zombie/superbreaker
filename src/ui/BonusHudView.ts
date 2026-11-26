import Phaser from 'phaser';
import { ARENA_MID, HUD_HEIGHT, WIDTH } from '../config';
import { envelope } from '../core/Boss';
import { MEDALS, type Medal } from '../core/Bonus';
import type { BonusHud, BonusIntroCard } from '../systems/BonusDirector';
import { solid } from './shapes';
import { calm, css, theme } from './theme';
import { display, label } from './type';

/** Over the play HUD, under the boss cinema and the tally. */
const DEPTH = 1900;
/** The strip's centre below the HUD, in px: the row a boss's bar would use. */
const STRIP_DY = 26;
/** The medal track: its left end and width, in px, and its height. */
const TRACK_LEFT = 170;
const TRACK_W = 290;
const TRACK_H = 8;
/** The track runs a little past gold, so a gold run still has somewhere to go. */
const TRACK_OVER = 1.15;
const MARK_SIZE = 26;
/** The coin counter: its coin's size and the number beside it. */
const COIN_ICON = 26;
const COIN_SIZE = 26;
/** The clock goes red and beats over the last this many seconds. */
const URGENT_SECS = 10;
/**
 * The intro card under the title band: the headline, then a row of pictures with a word under
 * each. Where the headline sits, the row below it, the pictures' size and spacing, in px.
 */
const HEADLINE_DY = 96;
const HEADLINE_SIZE = 30;
const ROW_DY = 172;
const ICON_SIZE = 64;
const ICON_GAP = 140;
const CAPTION_SIZE = 18;
/** The rules fade in and out over this long, in ms, starting a little after the band. */
const RULES_DELAY_MS = 300;
const RULES_FADE_MS = 300;

const METAL: Record<Exclude<Medal, 'none'>, number> = {
  bronze: 0xd08a4a,
  silver: 0xd8e0ee,
  gold: 0xffc93c,
};

type Text = Phaser.GameObjects.Text;
type Shown = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Visible &
  Phaser.GameObjects.Components.Depth & { setAlpha(value: number): unknown };

/**
 * A bonus stage's own HUD while it plays: the coins caught, the combo, the clock, and a track
 * that fills toward the medals. Under the title band of the intro it shows the stage's rules,
 * each beside a picture of what it is about.
 */
export class BonusHudView {
  private readonly clock: Text;
  private readonly coin: Phaser.GameObjects.Sprite;
  private readonly coins: Text;
  private readonly combo: Text;
  private readonly track: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Image;
  private readonly marks: Phaser.GameObjects.Image[];
  private rules: Shown[] = [];
  private shown = { secs: -1, combo: -1, mult: -1, coins: -1 };
  private beat?: Phaser.Tweens.Tween;
  private bump?: Phaser.Tweens.Tween;
  private readonly mine = new Set<Phaser.GameObjects.GameObject>();

  constructor(private scene: Phaser.Scene) {
    const t = theme();
    const y = HUD_HEIGHT + STRIP_DY;
    this.clock = display(scene, WIDTH - 14, y, '', 28, { t }).setOrigin(1, 0.5);
    this.coin = scene.add.sprite(14 + COIN_ICON / 2, y, 'coin').setDisplaySize(COIN_ICON, COIN_ICON);
    if (scene.anims.exists('coin-spin')) this.coin.play('coin-spin');
    this.coins = display(scene, 14 + COIN_ICON + 8, y, '0', COIN_SIZE, { t, color: css(t.palette.gold) }).setOrigin(
      0,
      0.5,
    );
    this.combo = label(scene, 14, y + 26, '', 13, { t, color: t.palette.text }).setOrigin(0, 0.5);
    this.track = solid(scene, TRACK_LEFT, y, TRACK_W, TRACK_H, 0x000000, 0.55).setOrigin(0, 0.5);
    this.fill = solid(scene, TRACK_LEFT, y, 0, TRACK_H, t.palette.accent).setOrigin(0, 0.5);
    this.marks = MEDALS.map((m) =>
      scene.add.image(0, y, `medal_${m}`).setDisplaySize(MARK_SIZE, MARK_SIZE).setAlpha(0.5),
    );
    for (const o of this.parts()) o.setDepth(DEPTH);
  }

  /** The objects this view draws, so the HUD leaves them out of its chrome. */
  owns(): ReadonlySet<Phaser.GameObjects.GameObject> {
    const mine = this.mine;
    mine.clear();
    for (const o of this.parts()) mine.add(o);
    for (const o of this.rules) mine.add(o);
    return mine;
  }

  update(v: BonusHud | null): void {
    const live = !!v && (v.step === 'intro' || v.step === 'play');
    for (const o of this.parts()) o.setVisible(live);
    if (!v?.medalTrack) for (const o of [this.track, this.fill, ...this.marks]) o.setVisible(false);
    this.drawRules(v?.intro ?? null, v);
    if (!v || !live) return;
    const t = theme();
    const p = t.palette;
    const secs = Math.ceil(v.timeLeftMs / 1000);
    if (secs !== this.shown.secs) {
      this.shown.secs = secs;
      const urgent = v.step === 'play' && secs <= URGENT_SECS;
      this.clock.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
      this.clock.setColor(urgent ? css(p.danger) : p.text);
      if (urgent && !calm()) {
        this.beat?.stop();
        this.beat = this.scene.tweens.add({
          targets: this.clock,
          scale: { from: 1.3, to: 1 },
          duration: 260,
          ease: 'Cubic.Out',
        });
      }
    }
    if (v.coins !== this.shown.coins) {
      const more = v.coins > this.shown.coins && this.shown.coins >= 0;
      this.shown.coins = v.coins;
      this.coins.setText(v.coins.toLocaleString());
      if (more && !calm()) {
        this.bump?.stop();
        this.bump = this.scene.tweens.add({
          targets: this.coins,
          scale: { from: 1.25, to: 1 },
          duration: 160,
          ease: 'Cubic.Out',
        });
      }
    }
    if (v.combo !== this.shown.combo || v.multiplier !== this.shown.mult) {
      this.shown.combo = v.combo;
      this.shown.mult = v.multiplier;
      const mult = v.multiplier > 1 ? `x${v.multiplier}  ` : '';
      this.combo.setText(v.combo > 1 ? `${mult}COMBO ${v.combo}` : '');
      this.combo.setColor(v.multiplier >= 2 ? css(p.accentHi) : p.text);
    }
    const top = v.medals[2] * TRACK_OVER;
    this.fill.displayWidth = TRACK_W * Math.min(1, v.medalValue / top);
    this.fill.setTint(v.medal === 'none' ? p.accent : METAL[v.medal]);
    MEDALS.forEach((m, i) => {
      const reached = v.medalValue >= v.medals[i]!;
      this.marks[i]!.setX(TRACK_LEFT + (TRACK_W * v.medals[i]!) / top).setAlpha(reached ? 1 : 0.5);
    });
  }

  destroy(): void {
    this.beat?.stop();
    this.bump?.stop();
    for (const o of [...this.parts(), ...this.rules]) o.destroy();
  }

  private parts(): Shown[] {
    return [this.clock, this.coin, this.coins, this.combo, this.track, this.fill, ...this.marks];
  }

  /** The intro card: the headline, then a picture and a word for each thing on the field. */
  private drawRules(card: BonusIntroCard | null, v: BonusHud | null): void {
    if (!card || !v) {
      for (const o of this.rules) o.setVisible(false);
      return;
    }
    if (this.rules.length === 0) this.buildRules(card);
    const alpha = envelope(card.ms - RULES_DELAY_MS, card.holdMs - RULES_DELAY_MS, RULES_FADE_MS, RULES_FADE_MS);
    for (const o of this.rules) o.setVisible(alpha > 0).setAlpha(alpha);
  }

  private buildRules(card: BonusIntroCard): void {
    const t = theme();
    const p = t.palette;
    const y0 = ARENA_MID - 40;
    const out: Shown[] = [];
    const has = (icon?: string): icon is string => !!icon && this.scene.textures.exists(icon);
    const items = card.rules.filter((r) => has(r.icon));
    const headline = card.rules.find((r) => !r.icon);
    if (headline) {
      out.push(
        display(this.scene, WIDTH / 2, y0 + HEADLINE_DY, headline.text, HEADLINE_SIZE, { t, color: css(p.accentHi) })
          .setOrigin(0.5)
          .setStroke(css(p.base), 6),
      );
    }
    const y = y0 + ROW_DY;
    items.forEach((rule, i) => {
      const x = WIDTH / 2 + (i - (items.length - 1) / 2) * ICON_GAP;
      out.push(this.scene.add.image(x, y, rule.icon!).setDisplaySize(ICON_SIZE, ICON_SIZE));
      if (rule.avoid) {
        const r = ICON_SIZE * 0.58;
        const d = r * Math.SQRT1_2;
        const no = this.scene.add.graphics({ x, y });
        no.lineStyle(6, p.danger, 0.95).strokeCircle(0, 0, r).lineBetween(-d, -d, d, d);
        out.push(no);
      }
      out.push(
        label(this.scene, x, y + ICON_SIZE / 2 + 18, rule.text, CAPTION_SIZE, {
          t,
          color: rule.avoid ? css(p.danger) : p.text,
        }).setStroke(css(p.base), 5),
      );
    });
    for (const o of out) o.setDepth(DEPTH);
    this.rules = out;
  }
}
