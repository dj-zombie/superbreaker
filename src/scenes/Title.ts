import Phaser from 'phaser';
import { worldForLevel } from '../art/backdrops';
import { HEIGHT, SAFE_BOTTOM, SAFE_TOP, SCENES, STAGE_W, WIDTH, designY } from '../config';
import { ABILITY_IDS, abilityCost } from '../core/Abilities';
import { canPurchase } from '../core/Economy';
import { levelId } from '../core/SaveStore';
import { runCarry } from '../core/Session';
import { UPGRADE_IDS } from '../core/types';
import { IS_DESKTOP, quitApp } from '../platform/desktop';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { Button, iconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { fadeTexture } from '../ui/frames';
import { Logo } from '../ui/fx/logoReveal';
import { cascade } from '../ui/fx/motion';
import { ambient } from '../ui/fx/particles';
import { transitionTo } from '../ui/fx/transitions';
import { icon, type IconName } from '../ui/icons';
import { calm, css, menuWorld, themeFor, useWorld, worldLevels, type UiTheme } from '../ui/theme';
import { display, glowWord, heading, label } from '../ui/type';
import { CurrencyPill, Meter, starRow } from '../ui/widgets';
import { BaseScene } from './BaseScene';

type Item = Phaser.GameObjects.Components.Transform &
  Phaser.GameObjects.Components.AlphaSingle &
  Phaser.GameObjects.GameObject;

const LOGO_W = 540;
const HUB_LOGO = { w: 340, h: 150 };
const TILE_W = 178;
const TILE_H = 156;

/** Starts a campaign level, dropping anything carried from an earlier level. */
export function startLevel(scene: Phaser.Scene, index: number, stop?: string[]): void {
  runCarry.discard();
  transitionTo(scene, SCENES.play, { index }, { stop });
}

/**
 * First launch shows the logo reveal and TAP TO START. The hub then offers one-tap Continue,
 * and the Campaign, Arcade and Armory tiles.
 */
export class Title extends BaseScene {
  /** Attract mode plays once per session. */
  private static awake = false;
  private t!: UiTheme;
  private logo!: Logo;
  private hubItems: Item[] = [];
  private coins?: CurrencyPill;
  private armorySub?: Phaser.GameObjects.Text;
  private inHub = false;

  constructor() {
    super(SCENES.title);
  }

  preload(): void {
    ParallaxBackdrop.preload(this, menuWorld());
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    this.inHub = false;
    this.hubItems = [];
    const world = menuWorld();
    this.t = useWorld(world);
    const backdrop = new ParallaxBackdrop(this, world, 0.6);
    backdrop.setTint(backdropTint(0.2));
    this.shades();
    ambient(this, this.t, { amount: 1.2 });
    audio.playMusic('menu_music');

    this.logo = new Logo(this, WIDTH / 2, designY(300), LOGO_W, this.t).setDepth(10);

    if (Title.awake) {
      this.logo.show();
      this.toHub(false);
    } else {
      this.attract();
    }

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.coins?.refresh();
      this.armorySub?.setText(this.armoryLine().toUpperCase());
    });
  }

  /** Darkens the top and bottom so the bars and footer read over bright art. */
  private shades(): void {
    const key = fadeTexture(this);
    this.add
      .image(WIDTH / 2, 0, key)
      .setOrigin(0.5, 0)
      .setDisplaySize(STAGE_W, SAFE_TOP + 200)
      .setTint(this.t.palette.base)
      .setAlpha(0.85);
    this.add
      .image(WIDTH / 2, HEIGHT, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(STAGE_W, SAFE_BOTTOM + 260)
      .setTint(this.t.palette.base)
      .setFlipY(true)
      .setAlpha(0.9);
  }

  // ---------------------------------------------------------------- attract

  private attract(): void {
    const prompt = glowWord(this, WIDTH / 2, designY(610), 'Tap to start', 26, this.t.palette.accentHi)
      .setAlpha(0)
      .setDepth(10);
    const studio = label(this, WIDTH / 2, HEIGHT - Math.max(30, SAFE_BOTTOM + 22), 'Zombie Head Studios', 12)
      .setAlpha(0)
      .setDepth(10);
    let ready = false;
    this.logo.reveal(350, () => {
      ready = true;
      this.tweens.add({ targets: [prompt, studio], alpha: 1, duration: 500 });
      if (!calm()) {
        this.tweens.add({
          targets: prompt,
          alpha: { from: 1, to: 0.35 },
          scale: { from: 1, to: 0.96 },
          delay: 500,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    });
    const go = () => {
      if (this.inHub) return;
      if (!ready) {
        this.time.delayedCall(250, go);
        return;
      }
      Title.awake = true;
      audio.sfx('ui_select', 0.6);
      audio.whoosh(0.22);
      this.tweens.killTweensOf(prompt);
      this.tweens.add({ targets: [prompt, studio], alpha: 0, duration: 200, onComplete: () => prompt.destroy() });
      this.toHub(true);
    };
    this.input.once(Phaser.Input.Events.POINTER_UP, go);
    this.input.keyboard?.once('keydown', go);
  }

  // ---------------------------------------------------------------- hub

  private toHub(animate: boolean): void {
    this.inHub = true;
    const lw = this.logo.width;
    const lh = this.logo.logoHeight;
    const scale = Math.min(HUB_LOGO.w / lw, HUB_LOGO.h / lh);
    const y = Math.max(SAFE_TOP + 70 + (lh * scale) / 2, designY(150));
    if (animate) {
      this.tweens.add({ targets: this.logo, y, scale, duration: 620, ease: 'Cubic.InOut' });
    } else {
      this.logo.setPosition(WIDTH / 2, y).setScale(scale);
    }
    this.buildHub(y + (lh * scale) / 2);
    const items = this.hubItems;
    if (animate) cascade(this, items, { delay: 260, stagger: 70 });
    else cascade(this, items, { delay: 80, stagger: 45, dy: 18 });
  }

  private buildHub(logoBottom: number): void {
    const add = <T extends Item>(o: T): T => {
      this.hubItems.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(20);
      return o;
    };

    const barY = SAFE_TOP + 36;
    add(
      iconButton(this, 40, barY, 'gear', () =>
        this.scene.launch(SCENES.settings, { from: SCENES.title }).pause(),
      44),
    );
    // A controller-only player has no other way out of a fullscreen window.
    if (IS_DESKTOP) {
      add(
        new Button(this, 122, barY, 'Quit', quitApp, {
          width: 104,
          height: 44,
          icon: 'close',
          fontSize: 16,
          variant: 'secondary',
        }),
      );
    }
    const coins = (this.coins = add(new CurrencyPill(this, WIDTH - 16, barY)));
    const { stars, max } = this.starTotals();
    add(
      new CurrencyPill(this, WIDTH - 16 - coins.width - 10, barY, stars, {
        icon: 'star',
        color: 0xffffff,
        suffix: ` / ${max}`,
      }),
    );

    const cardY = Math.max(logoBottom + 128, designY(410));
    add(this.continueCard(cardY));

    const tilesY = cardY + 100 + 30 + TILE_H / 2;
    const gap = 12;
    const tiles: Array<[IconName, string, string, () => void, boolean?]> = [
      ['campaign', 'Campaign', this.campaignLine(), () => transitionTo(this, SCENES.worlds)],
      ['arcade', 'Arcade', this.arcadeLine(), () => transitionTo(this, SCENES.arcadeSelect)],
      [
        'armory',
        'Armory',
        this.armoryLine(),
        () => this.scene.launch(SCENES.upgrades, { from: SCENES.title }).pause(),
        this.upgradeReady(),
      ],
    ];
    tiles.forEach(([glyph, name, sub, go, badge], i) => {
      const x = WIDTH / 2 + (i - 1) * (TILE_W + gap);
      const tile = this.tile(x, tilesY, glyph, name, sub, go, !!badge);
      add(tile);
    });

    add(label(this, WIDTH / 2, HEIGHT - Math.max(30, SAFE_BOTTOM + 22), 'Zombie Head Studios', 12));
  }

  private continueCard(y: number): Card {
    const total = this.levels.length;
    const done = this.cleared();
    const index = Math.max(1, Math.min(save.state.unlocked, total));
    const world = worldForLevel(index);
    const wt = themeFor(world);
    const spec = this.levels[index - 1];
    const complete = done >= total && total > 0;
    const play = () => startLevel(this, index);

    const card = new Card(this, WIDTH / 2, y, 560, 200, { ornament: true, onClick: play });
    const left = -card.cw / 2 + 30;
    const kicker = complete ? 'Campaign complete' : save.state.levels[levelId(index)] ? 'Replay' : 'Continue';
    card.add(
      label(this, left, -62, `${kicker}  ·  ${wt.name}`, 13, {
        originX: 0,
        color: css(wt.palette.accentHi),
      }),
    );
    card.add(heading(this, left, -24, `Level ${index}`, 42, { originX: 0 }));
    if (spec) {
      card.add(
        display(this, left, 18, spec.title, 20, { originX: 0, color: this.t.palette.textDim }).setFontStyle('700'),
      );
    }
    const stars = save.state.levels[levelId(index)]?.stars ?? 0;
    card.add(starRow(this, left + 36, 58, stars, 22, 6));

    const { first } = worldLevels(world);
    let worldDone = 0;
    for (let i = first; i < first + 10; i++) if (save.state.levels[levelId(i)]) worldDone++;
    const meter = new Meter(this, 120, 58, 150, 8, worldDone / 10, wt.palette.accent);
    card.add([meter, label(this, 210, 58, `${worldDone}/10`, 12, { originX: 0 })]);

    const btn = new Button(this, 160, -20, 'Play', play, {
      width: 180,
      height: 70,
      hero: true,
      icon: 'play',
      fontSize: 30,
    });
    card.add(btn);
    return card;
  }

  private tile(
    x: number,
    y: number,
    glyph: IconName,
    name: string,
    sub: string,
    onClick: () => void,
    badge: boolean,
  ): Card {
    const t = this.t;
    const card = new Card(this, x, y, TILE_W, TILE_H, { onClick });
    const ico = icon(this, 0, -30, glyph, 50, t.palette.accentHi);
    card.add(ico);
    card.add(heading(this, 0, 22, name, 24));
    const s = label(this, 0, 52, sub, 11, { color: badge ? css(t.palette.gold) : t.palette.textDim });
    card.add(s);
    if (glyph === 'armory') this.armorySub = s;
    if (badge) {
      const dot = this.add.circle(TILE_W / 2 - 18, -TILE_H / 2 + 18, 7, t.palette.gold);
      card.add(dot);
      if (!calm()) {
        this.tweens.add({ targets: dot, scale: 1.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      }
    }
    if (!calm()) {
      this.tweens.add({
        targets: ico,
        y: -36,
        duration: 1600 + x,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    return card;
  }

  // ---------------------------------------------------------------- data

  private cleared(): number {
    let n = 0;
    for (let i = 1; i <= this.levels.length; i++) if (save.state.levels[levelId(i)]) n++;
    return n;
  }

  private starTotals(): { stars: number; max: number } {
    let stars = 0;
    for (let i = 1; i <= this.levels.length; i++) stars += save.state.levels[levelId(i)]?.stars ?? 0;
    return { stars, max: this.levels.length * 3 };
  }

  private campaignLine(): string {
    return `${this.cleared()}/${this.levels.length} cleared`;
  }

  private arcadeLine(): string {
    let best = 0;
    for (const r of Object.values(save.state.runs)) best = Math.max(best, r.bestScore);
    return best > 0 ? `Best ${best.toLocaleString()}` : 'Endless runs';
  }

  private upgradeReady(): boolean {
    const { upgrades, abilities, coins } = save.state;
    if (UPGRADE_IDS.some((id) => canPurchase(id, upgrades, coins) === 'ok')) return true;
    return ABILITY_IDS.some((id) => {
      const cost = abilityCost(id, abilities[id]);
      return cost !== null && cost <= coins;
    });
  }

  private armoryLine(): string {
    return this.upgradeReady() ? 'Upgrade ready' : 'Upgrades';
  }
}
