import Phaser from 'phaser';
import { ABILITY_INFO, HEIGHT, POWERUP_INFO, SAFE_BOTTOM, SCENES, WIDTH } from '../config';
import {
  ABILITY_IDS,
  ABILITY_SHOP,
  MAX_ABILITY_TIER,
  abilityCost,
  abilityStats,
  type AbilityId,
  type AbilityStats,
} from '../core/Abilities';
import {
  LASER_BARREL_OFFSETS,
  MAX_UPGRADE_LEVEL,
  UPGRADES,
  canPurchase,
  powerupStats,
  upgradeCost,
  type PurchaseResult,
} from '../core/Economy';
import { UPGRADE_IDS, type UpgradeId } from '../core/types';
import {
  MAX_ABILITY_STOCK,
  MAX_POWERUP_STOCK,
  SESSION_ABILITY_COST,
  SESSION_POWERUP_COST,
  SESSION_POWERUP_IDS,
  type SessionBuyResult,
  type SessionPowerupId,
} from '../core/Session';
import { haptic } from '../platform/haptics';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Tabs } from '../ui/controls';
import { softDiscTexture } from '../ui/frames';
import { cascade, punch, shake } from '../ui/fx/motion';
import { flyCoins } from '../ui/fx/particles';
import { BehindFx } from '../ui/fx/sceneFx';
import { onBack } from '../ui/nav';
import { screenHeader } from '../ui/ScreenHeader';
import { roundBox } from '../ui/shapes';
import { calm, css, theme, type UiTheme } from '../ui/theme';
import { body, heading, label } from '../ui/type';
import type { CurrencyPill } from '../ui/widgets';
import { Overlay } from './Overlay';

type Tab = 'powerups' | 'abilities' | 'stock';
const TABS: readonly Tab[] = ['powerups', 'abilities', 'stock'];
const TAB_LABELS = ['Powerups', 'Abilities', 'Stock'];

interface Row {
  refresh(animate: boolean): void;
}

const CARD_W = 540;

/** The Armory: permanent upgrades, plus one-use powerups and abilities for the next run. */
export class Upgrades extends Overlay {
  private static tab: Tab = 'powerups';
  private t!: UiTheme;
  private coins!: CurrencyPill;
  private content?: Phaser.GameObjects.Container;
  private rows: Row[] = [];
  private toast!: Phaser.GameObjects.Text;
  private contentTop = 0;
  private contentBottom = 0;

  constructor() {
    super(SCENES.upgrades);
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const t = (this.t = theme());
    new BehindFx(this).blur([this.scene.get(this.from)], 1);
    const shade = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, WIDTH * 2, HEIGHT * 2, t.palette.base, 0.9)
      .setInteractive()
      .setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 220 });

    const header = screenHeader(this, 'Armory', {
      kicker: 'Spend your coins',
      coins: true,
      onBack: () => this.close(),
      t,
    });
    this.coins = header.coins!;

    const tabs = new Tabs(this, WIDTH / 2, header.bottom + 26, TAB_LABELS, TABS.indexOf(Upgrades.tab), (i) =>
      this.show(TABS[i]!),
    );
    tabs.setDepth(10);

    const doneY = HEIGHT - SAFE_BOTTOM - 46;
    this.contentTop = header.bottom + 70;
    this.contentBottom = doneY - 74;
    this.toast = body(this, WIDTH / 2, doneY - 52, '', 15, { color: css(t.palette.gold), t }).setDepth(20);
    new Button(this, WIDTH / 2, doneY, 'Done', () => this.close(), { width: 240, height: 56 });
    onBack(this, () => this.close());

    this.show(Upgrades.tab);
  }

  private show(tab: Tab): void {
    Upgrades.tab = tab;
    this.content?.destroy(true);
    this.content = this.add.container(WIDTH / 2, 0);
    this.rows = [];
    const cards =
      tab === 'powerups' ? this.powerupsTab() : tab === 'abilities' ? this.abilitiesTab() : this.stockTab();
    this.refresh(false);
    cascade(this, cards, { dy: 26, stagger: 45, ease: 'Cubic.Out' });
  }

  /** Card heights that share the content area between `n` rows. */
  private fit(n: number, max: number, gap: number): number {
    return Math.min(max, (this.contentBottom - this.contentTop - gap * (n - 1)) / n);
  }

  // ---------------------------------------------------------------- powerups tab

  private powerupsTab(): Card[] {
    const gap = 14;
    const h = this.fit(UPGRADE_IDS.length, 150, gap);
    return UPGRADE_IDS.map((id, i) => this.powerupCard(id, this.contentTop + h / 2 + i * (h + gap), h));
  }

  private powerupCard(id: UpgradeId, y: number, h: number): Card {
    const def = UPGRADES[id];
    const t = this.t;
    const card = new Card(this, 0, y, CARD_W, h, { t });
    const icon = this.iconWithGlow(card, -CARD_W / 2 + 62, 0, `pu_${id}`, Math.min(70, h - 40));
    const lx = -CARD_W / 2 + 116;
    const name = heading(this, lx, -h / 2 + 30, def.label, 24, { originX: 0, t });
    const stat = body(this, lx, -4, '', 13, { originX: 0, color: t.palette.textDim, t });
    const pips = makePips(this, lx, h / 2 - 28, MAX_UPGRADE_LEVEL, 38, 10, t);
    const buy = this.buyButton(CARD_W / 2 - 78, 0, 124, 54);
    buy.setHandler(() => {
      const cost = upgradeCost(id, save.state.upgrades[id]) ?? 0;
      this.afterBuy(save.purchase(id), card, buy, `${def.label} upgraded`, cost);
    });
    card.add([name, stat, pips, buy]);
    this.content!.add(card);
    this.rows.push({
      refresh: (animate) => {
        const tier = save.state.upgrades[id];
        setPips(this, pips, tier, t, animate);
        const cost = upgradeCost(id, tier);
        const maxed = canPurchase(id, save.state.upgrades, save.state.coins) === 'maxed';
        this.priceButton(buy, cost, maxed);
        stat.setText(powerupLine(id, save.state.upgrades));
        icon.setAlpha(1);
      },
    });
    return card;
  }

  // ---------------------------------------------------------------- abilities tab

  private abilitiesTab(): Card[] {
    const gap = 8;
    const h = this.fit(ABILITY_IDS.length, 84, gap);
    return ABILITY_IDS.map((id, i) => this.abilityCard(id, this.contentTop + h / 2 + i * (h + gap), h));
  }

  private abilityCard(id: AbilityId, y: number, h: number): Card {
    const info = ABILITY_INFO[id];
    const t = this.t;
    const card = new Card(this, 0, y, CARD_W, h, { t });
    const icon = this.iconWithGlow(card, -CARD_W / 2 + 44, 0, `ab_${id}`, Math.min(52, h - 22));
    const lx = -CARD_W / 2 + 84;
    const name = heading(this, lx, -h / 2 + 20, info.label, 19, { originX: 0, t });
    const stat = body(this, lx, 2, '', 12, { originX: 0, color: t.palette.textDim, t });
    const pips = makePips(this, lx, h / 2 - 16, MAX_ABILITY_TIER, 26, 7, t);
    const buy = this.buyButton(CARD_W / 2 - 70, 0, 112, 46);
    buy.setHandler(() => {
      const cost = abilityCost(id, save.state.abilities[id]) ?? 0;
      const unlocking = save.state.abilities[id] === 0;
      this.afterBuy(save.purchaseAbility(id), card, buy, `${info.label} ${unlocking ? 'unlocked' : 'upgraded'}`, cost);
    });
    card.add([name, stat, pips, buy]);
    this.content!.add(card);
    this.rows.push({
      refresh: (animate) => {
        const tier = save.state.abilities[id];
        const locked = tier === 0;
        setPips(this, pips, tier, t, animate);
        icon.setAlpha(locked ? 0.35 : 1);
        const cost = abilityCost(id, tier);
        this.priceButton(buy, cost, cost === null);
        stat.setText(locked ? `Locked · ${ABILITY_SHOP[id].description}` : abilityLine(id, tier));
      },
    });
    return card;
  }

  // ---------------------------------------------------------------- stock tab

  private stockTab(): Card[] {
    const t = this.t;
    const c = this.content!;
    const cols = 3;
    const gap = 10;
    const w = (CARD_W - gap * (cols - 1)) / cols;
    const puRows = Math.ceil(SESSION_POWERUP_IDS.length / cols);
    const abRows = Math.ceil(ABILITY_IDS.length / cols);
    const headings = 3 * 34;
    const h = Math.min(92, (this.contentBottom - this.contentTop - headings - gap * (puRows + abRows - 2)) / (puRows + abRows));
    const colX = (i: number) => (i % cols - 1) * (w + gap);
    let y = this.contentTop + 6;
    c.add(body(this, 0, y, 'One-time uses for your next run. Held abilities carry over, except on Hard.', 13, {
      color: t.palette.textDim,
      wrap: CARD_W - 20,
      t,
    }));
    y += 38;
    c.add(label(this, 0, y, 'Powerups', 12, { color: t.palette.textDim, t }));
    y += 24 + h / 2;
    const cards: Card[] = [];
    SESSION_POWERUP_IDS.forEach((id, i) => {
      cards.push(this.stockPowerup(id, colX(i), y + Math.floor(i / cols) * (h + gap), w, h));
    });
    y += puRows * (h + gap) - h / 2 + 18;
    c.add(label(this, 0, y, 'Abilities', 12, { color: t.palette.textDim, t }));
    y += 24 + h / 2;
    ABILITY_IDS.forEach((id, i) => {
      cards.push(this.stockAbility(id, colX(i), y + Math.floor(i / cols) * (h + gap), w, h));
    });
    return cards;
  }

  private stockPowerup(id: SessionPowerupId, x: number, y: number, w: number, h: number): Card {
    const info = POWERUP_INFO[id];
    const cost = SESSION_POWERUP_COST[id];
    const s = this.stockCard(x, y, w, h, info.label, info.texture);
    s.buy.setHandler(() =>
      this.afterSessionBuy(save.purchaseStockPowerup(id), s.card, s.buy, `${info.label} ready for this run`, cost),
    );
    this.rows.push({
      refresh: () => {
        const owned = save.state.stock.powerups.filter((p) => p === id).length;
        const full = save.state.stock.powerups.length >= MAX_POWERUP_STOCK;
        this.priceButton(s.buy, cost, false);
        s.buy.setEnabled(!full);
        s.owned.setText(owned ? `×${owned}` : '');
      },
    });
    return s.card;
  }

  private stockAbility(id: AbilityId, x: number, y: number, w: number, h: number): Card {
    const info = ABILITY_INFO[id];
    const cost = SESSION_ABILITY_COST[id];
    const s = this.stockCard(x, y, w, h, info.label, `ab_${id}`);
    s.buy.setHandler(() =>
      this.afterSessionBuy(save.purchaseStockAbility(id), s.card, s.buy, `${info.label} ready for this run`, cost),
    );
    this.rows.push({
      refresh: () => {
        const locked = save.state.abilities[id] <= 0;
        const owned = save.state.stock.abilities.filter((a) => a === id).length;
        const full = save.state.stock.abilities.length >= MAX_ABILITY_STOCK;
        if (locked) {
          s.buy.setGlyphVisible(false).setText('Locked').setVariant('secondary');
        } else {
          this.priceButton(s.buy, cost, false);
        }
        s.buy.setEnabled(!locked && !full);
        s.owned.setText(owned ? `×${owned}` : '');
        const dim = locked ? 0.4 : 1;
        s.name.setAlpha(dim);
        s.icon.setAlpha(dim);
      },
    });
    return s.card;
  }

  private stockCard(x: number, y: number, w: number, h: number, name: string, texture: string) {
    const t = this.t;
    const card = new Card(this, x, y, w, h, { t });
    const icon = this.iconWithGlow(card, -w / 2 + 28, -h / 2 + 28, texture, 30);
    const title = label(this, -w / 2 + 50, -h / 2 + 28, name, 12, { originX: 0, color: t.palette.text, t });
    const owned = label(this, w / 2 - 12, -h / 2 + 14, '', 12, { originX: 1, color: css(t.palette.gold), t });
    const buy = this.buyButton(0, h / 2 - 24, w - 24, 34, 14);
    card.add([title, owned, buy]);
    this.content!.add(card);
    return { card, buy, name: title, icon, owned };
  }

  // ---------------------------------------------------------------- shared

  private iconWithGlow(card: Card, x: number, y: number, key: string, size: number): Phaser.GameObjects.Image {
    const glow = this.add
      .image(x, y, softDiscTexture(this))
      .setTint(this.t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.35);
    glow.setScale((size * 1.7) / glow.width);
    const icon = this.add.image(x, y, key);
    icon.setScale(size / Math.max(icon.width, icon.height));
    card.add([glow, icon]);
    return icon;
  }

  private buyButton(x: number, y: number, w: number, h: number, fontSize = 18): Button {
    return new Button(this, x, y, '', () => undefined, { width: w, height: h, fontSize, image: 'coin_icon' });
  }

  /** Shows the price, greyed when the balance can't cover it; taps still go through so the pill can refuse. */
  private priceButton(b: Button, cost: number | null, maxed: boolean): void {
    if (maxed || cost === null) {
      b.setGlyphVisible(false).setText('Max').setVariant('secondary').setEnabled(false);
      return;
    }
    b.setGlyphVisible(true)
      .setText(String(cost))
      .setVariant(save.state.coins >= cost ? 'primary' : 'secondary')
      .setEnabled(true);
  }

  private afterBuy(res: PurchaseResult, card: Card, buy: Button, msg: string, cost: number): void {
    if (res === 'ok') this.paid(card, buy, msg);
    else if (res === 'insufficient') this.broke(buy, cost);
  }

  private afterSessionBuy(res: SessionBuyResult, card: Card, buy: Button, msg: string, cost: number): void {
    if (res === 'ok') {
      this.paid(card, buy, msg);
    } else if (res === 'insufficient') {
      this.broke(buy, cost);
    } else {
      audio.sfx('ui_off', 0.5);
      shake(this, buy, 5);
      this.say(res === 'full' ? 'Hands are full. Use one during play.' : 'Unlock it on the Abilities tab first.');
    }
  }

  /** Coins leave the balance and land in the card, then the new tier lights up. */
  private paid(card: Card, buy: Button, msg: string): void {
    audio.sfx('ui_select', 0.5);
    haptic('medium');
    this.coins.setValue(save.state.coins);
    const m = buy.getWorldTransformMatrix();
    this.input.enabled = false;
    const finish = () => {
      this.input.enabled = true;
      if (!card.active) return;
      card.pulse();
      punch(this, buy, 1.15);
      audio.sfx('sfx_coin', 0.6);
      if (!calm() && save.state.settings.screenShake) this.cameras.main.shake(90, 0.002);
      this.say(msg);
      this.refresh(true);
    };
    if (calm()) {
      finish();
      return;
    }
    flyCoins(this, this.coins.target(), { x: m.tx, y: m.ty }, { count: 6, spread: 18, depth: 50, onDone: finish });
  }

  private broke(buy: Button, cost: number): void {
    audio.sfx('sfx_smaller', 0.5);
    haptic('heavy');
    this.coins.deny();
    shake(this, buy, 6);
    const need = cost - save.state.coins;
    this.say(`Need ${need} more coin${need === 1 ? '' : 's'}. Catch them in play!`);
  }

  private say(msg: string): void {
    this.toast.setText(msg).setAlpha(1).setScale(0.9);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 200, ease: 'Back.Out' });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1800, duration: 400 });
  }

  private refresh(animate: boolean): void {
    for (const row of this.rows) row.refresh(animate);
  }
}

/** Row of tier pips; the container's left edge sits at x. */
function makePips(
  scene: Phaser.Scene,
  x: number,
  y: number,
  max: number,
  w: number,
  h: number,
  t: UiTheme,
): Phaser.GameObjects.Container {
  const boxes = Array.from({ length: max }, (_, i) =>
    roundBox(scene, i * (w + 5) + w / 2, 0, w, h, Math.min(4, h / 2), t.palette.edge, 0.45),
  );
  return scene.add.container(x, y, boxes).setData('tier', -1);
}

/** Lights pips up to `tier`; newly lit ones flash in one after another. */
function setPips(scene: Phaser.Scene, pips: Phaser.GameObjects.Container, tier: number, t: UiTheme, animate: boolean): void {
  const before = pips.getData('tier') as number;
  pips.setData('tier', tier);
  pips.list.forEach((p, i) => {
    const box = p as Phaser.GameObjects.NineSlice;
    const lit = i < tier;
    const fresh = animate && lit && before >= 0 && i >= before;
    box.setTint(lit ? t.palette.accent : t.palette.edge).setAlpha(lit ? 1 : 0.45);
    if (!fresh) return;
    const delay = (i - before) * 90;
    box.setTint(t.palette.accentHi);
    scene.tweens.add({
      targets: box,
      scaleY: { from: box.scaleY * 2, to: box.scaleY },
      delay,
      duration: 260,
      ease: 'Back.Out',
      onStart: () => audio.sfx('ui_move', 0.35, i * 120),
      onComplete: () => box.setTint(t.palette.accent),
    });
  });
}

function powerupLine(id: UpgradeId, levels: Record<UpgradeId, number>): string {
  const s = powerupStats(levels);
  const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  switch (id) {
    case 'magnet':
      return `${sec(s.magnetDurationMs)} · ${s.magnetCharges} catch${s.magnetCharges > 1 ? 'es' : ''}`;
    case 'fireball':
      return `${sec(s.fireballDurationMs)} · plows ${s.fireballPlow} bricks per bounce`;
    case 'laser': {
      const shots = Math.round((1000 * LASER_BARREL_OFFSETS.length) / s.laserIntervalMs);
      return `${sec(s.laserDurationMs)} · ${s.laserDamage} dmg · ${shots} shots/s`;
    }
  }
}

const describe: Record<AbilityId, (s: AbilityStats) => string> = {
  meteor: (s) => `${s.meteorCount} meteors`,
  lightning: (s) => `${s.lightningHops} bolts`,
  bomb: (s) => `${s.bombRadius}px blast`,
  sweep: (s) => `cuts ${Math.round(s.sweepKillShare * 100)}% of bricks`,
  blackhole: (s) => `${s.holeRadius}px for ${(s.holeMs / 1000).toFixed(1)}s`,
  frenzy: (s) => `${s.frenzyBalls} piercing balls`,
};

/** Current power, plus a preview of the next tier. */
function abilityLine(id: AbilityId, tier: number): string {
  const now = describe[id](abilityStats({ ...save.state.abilities, [id]: tier }));
  if (tier >= MAX_ABILITY_TIER) return now;
  const next = describe[id](abilityStats({ ...save.state.abilities, [id]: tier + 1 }));
  return `${now}  →  ${next}`;
}
