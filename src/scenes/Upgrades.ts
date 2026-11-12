import Phaser from 'phaser';
import {
  ABILITY_INFO,
  COLORS,
  HEIGHT,
  POWERUP_INFO,
  RENDER_ZOOM,
  SCENES,
  UI_FONT,
  WIDTH,
} from '../config';
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
import { roundBox } from '../ui/shapes';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { Button, bodyText, panel, title } from '../ui/Button';
import { coinCounter } from '../ui/widgets';
import { Overlay } from './Overlay';

type Tab = 'powerups' | 'abilities' | 'stock';

interface Row {
  refresh(): void;
}

const PANEL_H = 720;
const TOP = -PANEL_H / 2;
const style = { fontFamily: UI_FONT, resolution: RENDER_ZOOM, fontStyle: '800' };

/** Coin shop: permanent upgrades, plus one-use powerups and abilities for this run. */
export class Upgrades extends Overlay {
  private tab: Tab = 'powerups';
  private root!: Phaser.GameObjects.Container;
  private content?: Phaser.GameObjects.Container;
  private rows: Row[] = [];
  private tabs: Partial<Record<Tab, Button>> = {};
  private toast?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.upgrades);
  }

  create(): void {
    this.openOverlay(0.7);
    this.root = this.add.container(WIDTH / 2, HEIGHT / 2);
    this.root.add(panel(this, 0, 0, 540, PANEL_H));
    this.root.add(title(this, 0, TOP + 45, 'UPGRADES', 36));
    this.popIn(this.root);

    (
      [
        ['powerups', 'POWERUPS'],
        ['abilities', 'ABILITIES'],
        ['stock', 'STOCK'],
      ] as const
    ).forEach(([t, label], i) => {
      const b = new Button(this, (i - 1) * 168, TOP + 105, label, () => this.show(t), {
        width: 156,
        height: 46,
        fontSize: 15,
      });
      this.tabs[t] = b;
      this.root.add(b);
    });

    this.toast = bodyText(this, 0, -TOP - 95, '', 17, '#ffc93c');
    this.root.add(this.toast);
    this.root.add(
      new Button(this, 0, -TOP - 45, 'DONE', () => this.close(), {
        width: 220,
        height: 56,
        fill: COLORS.good,
        textColor: '#1a0629',
      }),
    );
    this.show(this.tab);
  }

  private show(tab: Tab): void {
    this.tab = tab;
    this.content?.destroy(true);
    this.content = this.add.container(0, 0);
    this.root.add(this.content);
    this.rows = [];
    for (const [t, b] of Object.entries(this.tabs) as Array<[Tab, Button]>) {
      const on = t === tab;
      b.setFill(on ? COLORS.accent : 0x3a3366);
      b.label.setColor(on ? '#1a0629' : '#ffffff');
    }
    if (tab === 'powerups') {
      UPGRADE_IDS.forEach((id, i) => this.powerupRow(id, TOP + 200 + i * 138));
    } else if (tab === 'abilities') {
      ABILITY_IDS.forEach((id, i) => this.abilityRow(id, TOP + 172 + i * 76));
    } else {
      this.stockTab();
    }
    this.refresh();
    if (this.toast) this.root.bringToTop(this.toast);
  }

  // ---------------------------------------------------------------- powerups tab

  private powerupRow(id: UpgradeId, y: number): void {
    const c = this.content!;
    const def = UPGRADES[id];
    const bg = roundBox(this, 0, y, 490, 116, 18, 0x0b0820, 0.6);
    const icon = this.add.image(-200, y, `pu_${id}`);
    icon.setScale(62 / Math.max(icon.width, icon.height));
    const name = this.add.text(-155, y - 44, def.label, {
      ...style,
      fontSize: '23px',
      color: '#ffffff',
    });
    const stat = this.add.text(-155, y - 14, '', { ...style, fontSize: '14px', color: '#8a83b8' });
    const pips = makePips(this, -155, y + 30, MAX_UPGRADE_LEVEL, 44, 14);
    const buy = new Button(
      this,
      178,
      y,
      '',
      () =>
        this.afterBuy(save.purchase(id), def.label, () => upgradeCost(id, save.state.upgrades[id])),
      {
        width: 116,
        height: 54,
        fontSize: 18,
        fill: COLORS.accent,
        textColor: '#1a0629',
        icon: 'coin_icon',
      },
    );
    c.add([bg, icon, name, stat, pips, buy]);
    this.rows.push({
      refresh: () => {
        const tier = save.state.upgrades[id];
        setPips(pips, tier);
        const cost = upgradeCost(id, tier);
        buy.setText(cost === null ? 'MAX' : String(cost));
        buy.setEnabled(canPurchase(id, save.state.upgrades, save.state.coins) !== 'maxed');
        stat.setText(powerupLine(id, save.state.upgrades));
      },
    });
  }

  // ---------------------------------------------------------------- abilities tab

  private abilityRow(id: AbilityId, y: number): void {
    const c = this.content!;
    const info = ABILITY_INFO[id];
    const bg = roundBox(this, 0, y, 490, 68, 16, 0x0b0820, 0.6);
    const icon = this.add.image(-212, y, `ab_${id}`);
    icon.setScale(50 / icon.width);
    const name = this.add.text(-178, y - 27, info.label, {
      ...style,
      fontSize: '19px',
      color: '#ffffff',
    });
    const stat = this.add.text(-178, y - 2, '', { ...style, fontSize: '13px', color: '#8a83b8' });
    const pips = makePips(this, -178, y + 22, MAX_ABILITY_TIER, 30, 8);
    const buy = new Button(
      this,
      182,
      y,
      '',
      () =>
        this.afterBuy(save.purchaseAbility(id), info.label, () =>
          abilityCost(id, save.state.abilities[id]),
        ),
      {
        width: 112,
        height: 46,
        fontSize: 16,
        fill: COLORS.accent,
        textColor: '#1a0629',
        icon: 'coin_icon',
      },
    );
    c.add([bg, icon, name, stat, pips, buy]);
    this.rows.push({
      refresh: () => {
        const tier = save.state.abilities[id];
        const locked = tier === 0;
        setPips(pips, tier);
        icon.setAlpha(locked ? 0.35 : 1);
        const cost = abilityCost(id, tier);
        buy.setText(cost === null ? 'MAX' : String(cost));
        buy.setEnabled(cost !== null);
        buy.setFill(locked ? COLORS.good : COLORS.accent);
        stat.setText(locked ? `LOCKED · ${ABILITY_SHOP[id].description}` : abilityLine(id, tier));
      },
    });
  }

  // ---------------------------------------------------------------- stock tab

  private stockTab(): void {
    const c = this.content!;
    c.add(
      bodyText(
        this,
        0,
        TOP + 148,
        'One-time uses. Held abilities carry to the next level, except on Hard.',
        14,
        '#8a83b8',
      ),
    );
    c.add(sectionLabel(this, 0, TOP + 190, 'POWERUPS'));
    SESSION_POWERUP_IDS.forEach((id, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      this.stockPowerup(id, (col - 1) * 164, TOP + 242 + row * 74);
    });
    c.add(sectionLabel(this, 0, TOP + 456, 'ABILITIES'));
    ABILITY_IDS.forEach((id, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      this.stockAbility(id, (col - 1) * 164, TOP + 500 + row * 72);
    });
  }

  private stockPowerup(id: SessionPowerupId, x: number, y: number): void {
    const info = POWERUP_INFO[id];
    const card = this.stockButton(x, y, info.label, info.texture, () =>
      this.afterSessionBuy(save.purchaseStockPowerup(id), info.label, SESSION_POWERUP_COST[id]),
    );
    this.rows.push({
      refresh: () => {
        const owned = save.state.stock.powerups.filter((p) => p === id).length;
        const full = save.state.stock.powerups.length >= MAX_POWERUP_STOCK;
        card.buy.setText(
          owned ? `${SESSION_POWERUP_COST[id]}  ×${owned}` : String(SESSION_POWERUP_COST[id]),
        );
        card.buy.setEnabled(!full);
      },
    });
  }

  private stockAbility(id: AbilityId, x: number, y: number): void {
    const info = ABILITY_INFO[id];
    const card = this.stockButton(x, y, info.label, `ab_${id}`, () =>
      this.afterSessionBuy(save.purchaseStockAbility(id), info.label, SESSION_ABILITY_COST[id]),
    );
    this.rows.push({
      refresh: () => {
        const locked = save.state.abilities[id] <= 0;
        const owned = save.state.stock.abilities.filter((a) => a === id).length;
        const full = save.state.stock.abilities.length >= MAX_ABILITY_STOCK;
        card.buy.setText(
          locked
            ? 'LOCK'
            : owned
              ? `${SESSION_ABILITY_COST[id]}  ×${owned}`
              : String(SESSION_ABILITY_COST[id]),
        );
        card.buy.setEnabled(!locked && !full);
        const dim = locked ? 0.4 : 1;
        card.name.setAlpha(dim);
        card.icon.setAlpha(dim);
      },
    });
  }

  private stockButton(
    x: number,
    y: number,
    label: string,
    texture: string,
    onClick: () => void,
  ): { buy: Button; name: Phaser.GameObjects.Text; icon: Phaser.GameObjects.Image } {
    const c = this.content!;
    const name = this.add
      .text(x, y - 22, label, { ...style, fontSize: '12px', color: '#ffffff' })
      .setOrigin(0.5);
    const icon = this.add.image(x - 58, y + 8, texture);
    icon.setScale(28 / Math.max(icon.width, icon.height));
    const buy = new Button(this, x + 18, y + 8, '', onClick, {
      width: 100,
      height: 36,
      fontSize: 15,
      fill: COLORS.accent,
      textColor: '#1a0629',
      icon: 'coin_icon',
    });
    c.add([name, icon, buy]);
    return { buy, name, icon };
  }

  private afterSessionBuy(res: SessionBuyResult, label: string, cost: number): void {
    if (res === 'ok') {
      audio.sfx('sfx_coin', 0.6);
      haptic('medium');
      this.say(`${label} ready for this run`);
    } else if (res === 'insufficient') {
      audio.sfx('sfx_smaller', 0.5);
      haptic('heavy');
      const need = cost - save.state.coins;
      this.say(`Need ${need} more coin${need === 1 ? '' : 's'}. Catch them in play!`);
    } else if (res === 'full') {
      audio.sfx('ui_off', 0.5);
      this.say('Hands are full. Use one during play.');
    } else {
      audio.sfx('ui_off', 0.5);
      this.say('Unlock it on the Abilities tab first.');
    }
    this.refresh();
  }

  // ---------------------------------------------------------------- shared

  private afterBuy(res: PurchaseResult, label: string, nextCost: () => number | null): void {
    if (res === 'ok') {
      audio.sfx('sfx_coin', 0.6);
      haptic('medium');
      this.say(`${label} upgraded!`);
    } else if (res === 'insufficient') {
      audio.sfx('sfx_smaller', 0.5);
      haptic('heavy');
      const need = (nextCost() ?? 0) - save.state.coins;
      this.say(`Need ${need} more coin${need === 1 ? '' : 's'}. Catch them in play!`);
    }
    this.refresh();
  }

  private say(msg: string): void {
    if (!this.toast) return;
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 400 });
  }

  private refresh(): void {
    coinCounter(this, WIDTH - 40, HEIGHT / 2 + TOP + 45);
    for (const row of this.rows) row.refresh();
  }
}

function sectionLabel(scene: Phaser.Scene, x: number, y: number, text: string) {
  return scene.add
    .text(x, y, text, { ...style, fontSize: '12px', color: '#8a83b8' })
    .setOrigin(0.5);
}

/** Row of tier pips; the container's left edge sits at x. */
function makePips(
  scene: Phaser.Scene,
  x: number,
  y: number,
  max: number,
  w: number,
  h: number,
): Phaser.GameObjects.Container {
  const boxes = Array.from({ length: max }, (_, i) =>
    roundBox(scene, i * (w + 6) + w / 2, 0, w, h, Math.min(6, h / 2), 0x2a2450),
  );
  return scene.add.container(x, y, boxes);
}

function setPips(pips: Phaser.GameObjects.Container, tier: number): void {
  pips.list.forEach((p, i) => {
    (p as Phaser.GameObjects.NineSlice).setTint(i < tier ? COLORS.accent : 0x2a2450);
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
