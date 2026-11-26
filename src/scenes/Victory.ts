import Phaser from 'phaser';
import {
  ANTHEM_BED,
  CROWN,
  TROPHIES,
  VICTORY_PLATE,
  VICTORY_STING,
  loadFinale,
} from '../art/finale';
import { HEIGHT, SAFE_TOP, SCENES, STAGE_W, WIDTH, designY } from '../config';
import { campaignSummary, type CampaignSummary } from '../core/Campaign';
import { DIFFICULTY } from '../core/Difficulty';
import { FxEngine } from '../fx/FxEngine';
import { haptic } from '../platform/haptics';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { Button } from '../ui/Button';
import { fadeTexture, framePanel, raysTexture } from '../ui/frames';
import { cascade, countUp, slam } from '../ui/fx/motion';
import { transitionTo } from '../ui/fx/transitions';
import { onBack } from '../ui/nav';
import { calm, css, useWorld, type UiTheme } from '../ui/theme';
import { display, glowWord, heading, label } from '../ui/type';
import { tick } from '../ui/widgets';
import type { PlayData } from './Play';
import { BaseScene } from './BaseScene';

const PANEL_W = 500;
const PANEL_H = 236;
const ROW_H = 40;
const TROPHY_GAP = 118;
const TROPHY_SIZE = 92;
/** Each stat's count-up, one after another. */
const COUNT_MS = 650;
const COUNT_GAP = 160;
/** Fireworks over the citadel: the gap between shells, closer together than in reduced motion. */
const SHELL_MS: readonly [number, number] = [700, 1500];
const CALM_SHELL_MS = 2600;
/** When the anthem comes in under the sting's ring-out, and how loud it sits. */
const ANTHEM_AT_MS = 5200;
const ANTHEM_VOLUME = 0.5;
const SHELL_COLORS = [0xffd36a, 0xff7a3a, 0x7de8ff, 0xff5a8a, 0xffffff] as const;
const GOLD = 0xffd36a;

/**
 * The campaign is won. A slam and a sting over fireworks, then what the campaign earned: stars,
 * the bosses' trophies, the score, coins and difficulty, counting up, and a rank from the stars.
 */
export class Victory extends BaseScene {
  private t!: UiTheme;
  private fx!: FxEngine;

  constructor() {
    super(SCENES.victory);
  }

  preload(): void {
    loadFinale(
      this,
      [VICTORY_PLATE, CROWN, ...TROPHIES.map((x) => x.key)],
      [ANTHEM_BED, VICTORY_STING],
    );
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const t = (this.t = useWorld('mainframe'));
    this.backdrop();
    this.fx = new FxEngine(this, { world: 'mainframe' });
    const summary = campaignSummary(save.state, this.levels.length, this.bossStops);

    audio.sceneBed(null, { fadeMs: 400 });
    audio.sfx(VICTORY_STING, 0.8);
    this.time.delayedCall(ANTHEM_AT_MS, () =>
      audio.sceneBed(ANTHEM_BED, { volume: ANTHEM_VOLUME, fadeMs: 2400 }),
    );

    const top = designY(0);
    const crownY = Math.max(SAFE_TOP + 52, designY(62));
    const rays = this.add
      .image(WIDTH / 2, crownY + 50, raysTexture(this))
      .setTint(GOLD)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.6, 1.1)
      .setAlpha(0)
      .setDepth(15);
    const crown = this.add
      .image(WIDTH / 2, crownY, CROWN)
      .setDisplaySize(96, 96)
      .setDepth(21)
      .setAlpha(0);
    const head = heading(this, WIDTH / 2, crownY + 70, 'You broke through', 54, {
      color: css(GOLD),
    }).setDepth(22);
    const sub = label(this, WIDTH / 2, crownY + 114, 'The Mainframe has fallen', 14, {
      color: t.palette.text,
    })
      .setDepth(22)
      .setAlpha(0);

    slam(this, head, {
      delay: 250,
      from: 2.4,
      onLand: () => this.landed(rays, crown, sub, crownY),
    });

    const trophyY = Math.max(crownY + 176, top + 238);
    const trophies = this.trophies(summary, trophyY);
    const panelY = trophyY + 64 + PANEL_H / 2;
    const rows = this.stats(summary, panelY, trophies);
    const rankY = panelY + PANEL_H / 2 + 44;
    const statsDone = 900 + rows * (COUNT_MS + COUNT_GAP);
    this.time.delayedCall(statsDone, () => this.rank(summary, rankY));
    const buttons = this.buttons(rankY + 96);
    cascade(this, buttons, { delay: statsDone + 500, stagger: 70 });
    this.fireworks();
  }

  /** The ending's last plate, the citadel under fireworks, darkened so the panel reads. */
  private backdrop(): void {
    const tex = this.textures.get(VICTORY_PLATE).getSourceImage();
    const cover = Math.max(STAGE_W / tex.width, HEIGHT / tex.height);
    this.add
      .image(WIDTH / 2, HEIGHT / 2, VICTORY_PLATE)
      .setScale(cover)
      .setTint(0xb4b4c8);
    const key = fadeTexture(this);
    const base = this.t.palette.base;
    this.add
      .image(WIDTH / 2, 0, key)
      .setOrigin(0.5, 0)
      .setDisplaySize(STAGE_W, SAFE_TOP + 260)
      .setTint(base)
      .setAlpha(0.7);
    this.add
      .image(WIDTH / 2, HEIGHT, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(STAGE_W, HEIGHT * 0.5)
      .setTint(base)
      .setFlipY(true)
      .setAlpha(0.8);
  }

  /** The heading lands: confetti from both corners, the crown, and the first shells. */
  private landed(
    rays: Phaser.GameObjects.Image,
    crown: Phaser.GameObjects.Image,
    sub: Phaser.GameObjects.Text,
    y: number,
  ): void {
    const still = calm();
    if (save.state.settings.screenShake && !still) this.cameras.main.shake(220, 0.006);
    haptic('heavy');
    audio.sfx('fanfare_stab', 0.55);
    const left = WIDTH / 2 - STAGE_W / 2;
    const right = WIDTH / 2 + STAGE_W / 2;
    this.fx.play('fanfare.cannon', left, HEIGHT * 0.7, { angle: -58, depth: 40, quiet: true });
    this.fx.play('fanfare.cannon', right, HEIGHT * 0.7, { angle: -122, depth: 40, quiet: true });
    this.fx.play('fanfare.celebrate', WIDTH / 2, y + 70, { tint: GOLD, quiet: true });
    this.tweens.add({ targets: rays, alpha: 0.5, duration: 500 });
    this.tweens.add({ targets: [crown, sub], alpha: 1, duration: 420 });
    crown.setY(y - 26);
    this.tweens.add({ targets: crown, y, duration: 520, ease: 'Back.Out' });
    if (still) return;
    this.tweens.add({ targets: rays, angle: 360, duration: 16000, repeat: -1 });
    this.tweens.add({
      targets: crown,
      y: y - 6,
      delay: 600,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /** Shells keep bursting over the citadel for as long as the screen is up. */
  private fireworks(): void {
    const launch = () => {
      const color = SHELL_COLORS[Phaser.Math.Between(0, SHELL_COLORS.length - 1)]!;
      const x = WIDTH / 2 + Phaser.Math.FloatBetween(-0.42, 0.42) * STAGE_W;
      const y = designY(Phaser.Math.Between(400, 560));
      this.fx.play('fanfare.firework', x, y, { tint: color, quiet: true });
      if (Math.random() < 0.5)
        audio.sfx('fanfare_rise_a', 0.18, Phaser.Math.Between(-200, 200), { x });
      const gap = calm() ? CALM_SHELL_MS : Phaser.Math.Between(SHELL_MS[0], SHELL_MS[1]);
      this.time.delayedCall(gap, launch);
    };
    this.time.delayedCall(420, launch);
  }

  /** One trophy a boss, dark until the bosses' count reaches it. Returns the beaten ones' lighting, in order. */
  private trophies(summary: CampaignSummary, y: number): Array<() => void> {
    const beaten = new Set(
      summary.bosses.filter((b) => b.beaten).map((b) => this.stopAfter(b.after)?.level?.boss),
    );
    const lights: Array<() => void> = [];
    TROPHIES.forEach((x, i) => {
      const tx = WIDTH / 2 + (i - (TROPHIES.length - 1) / 2) * TROPHY_GAP;
      const glow = this.add
        .image(tx, y, raysTexture(this))
        .setTint(GOLD)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.42)
        .setAlpha(0)
        .setDepth(19);
      const img = this.add
        .image(tx, y, x.key)
        .setDisplaySize(TROPHY_SIZE, TROPHY_SIZE)
        .setTint(0x303040)
        .setAlpha(0.75)
        .setDepth(20);
      if (!beaten.has(x.boss)) return;
      const scale = img.scale;
      let on = false;
      lights.push(() => {
        if (on) return;
        on = true;
        img.clearTint().setAlpha(1);
        this.tweens.add({
          targets: img,
          scale: { from: scale * 1.3, to: scale },
          duration: 420,
          ease: 'Back.Out',
        });
        this.tweens.add({ targets: glow, alpha: 0.55, duration: 300 });
        if (!calm()) this.tweens.add({ targets: glow, angle: 360, duration: 9000, repeat: -1 });
        this.fx.play('fanfare.burst', tx, y, { tint: GOLD, scale: 0.7, quiet: true });
        audio.sfx('fanfare_stab', 0.35, i * 120);
        haptic('light');
      });
    });
    return lights;
  }

  /** The stats panel, each row counting up after the last. Returns the number of rows. */
  private stats(summary: CampaignSummary, y: number, trophies: Array<() => void>): number {
    const t = this.t;
    const root = this.add
      .container(WIDTH / 2, y)
      .setDepth(20)
      .setAlpha(0);
    root.add(framePanel(this, 0, 0, PANEL_W, PANEL_H, t, { ornament: true }));
    this.tweens.add({ targets: root, alpha: 1, duration: 360, delay: 600 });
    const rows: Array<{
      name: string;
      to: number;
      format: (n: number) => string;
      onTick?: (n: number) => void;
    }> = [
      { name: 'Stars', to: summary.stars, format: (n) => `${n} / ${summary.maxStars}` },
      {
        name: 'Bosses',
        to: trophies.length,
        format: (n) => `${n} / ${TROPHIES.length}`,
        onTick: (n) => trophies.slice(0, n).forEach((light) => light()),
      },
      { name: 'Total score', to: summary.score, format: (n) => n.toLocaleString() },
      { name: 'Coins', to: save.state.coins, format: (n) => n.toLocaleString() },
    ];
    const left = -PANEL_W / 2 + 40;
    const right = PANEL_W / 2 - 40;
    // The difficulty row goes under the counted ones.
    const first = -(rows.length * ROW_H) / 2;
    rows.forEach((r, i) => {
      const ry = first + i * ROW_H;
      root.add(label(this, left, ry, r.name, 14, { originX: 0, color: t.palette.text }));
      const value = display(this, right, ry, r.format(0), 26, { originX: 1 });
      root.add(value);
      const light = (n: number) => r.onTick?.(n);
      countUp(this, value, 0, r.to, {
        delay: 900 + i * (COUNT_MS + COUNT_GAP),
        duration: COUNT_MS,
        format: r.format,
        onTick: (n) => {
          tick(n / Math.max(1, r.to));
          light(n);
        },
        onComplete: () => light(r.to),
      });
    });
    const dy = first + rows.length * ROW_H;
    root.add(label(this, left, dy, 'Difficulty', 14, { originX: 0, color: t.palette.text }));
    const diff = display(this, right, dy, DIFFICULTY[save.state.difficulty].label, 26, {
      originX: 1,
    }).setAlpha(0);
    root.add(diff);
    this.tweens.add({
      targets: diff,
      alpha: 1,
      delay: 900 + rows.length * (COUNT_MS + COUNT_GAP),
      duration: 300,
    });
    return rows.length + 1;
  }

  /** The rank the stars earned, and what the next one asks for. */
  private rank(summary: CampaignSummary, y: number): void {
    const legend = summary.rank === 'Legend';
    const color = legend ? GOLD : summary.rank === 'Hero' ? 0x7de8ff : 0xffffff;
    const rays = this.add
      .image(WIDTH / 2, y, raysTexture(this))
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.1, 0.4)
      .setAlpha(0)
      .setDepth(19);
    const word = glowWord(this, WIDTH / 2, y, `Rank: ${summary.rank}`, 40, color).setDepth(22);
    const next = label(this, WIDTH / 2, y + 40, summary.nextGoal, 13, {
      color: this.t.palette.text,
    })
      .setDepth(22)
      .setAlpha(0);
    this.tweens.add({ targets: rays, alpha: legend ? 0.7 : 0.45, duration: 300 });
    this.tweens.add({ targets: next, alpha: 1, delay: 300, duration: 300 });
    slam(this, word, { from: 2.2 });
    if (!calm()) this.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
    audio.sfx('new_best', 0.5);
    if (legend) audio.fanfareTail(0.2);
    haptic('medium');
    this.fx.play('fanfare.burst', WIDTH / 2, y, { tint: color, scale: 1.2, quiet: true });
  }

  private buttons(y: number): Button[] {
    const small = { width: 156, height: 50, fontSize: 16, variant: 'secondary' as const };
    const menu = new Button(this, WIDTH / 2, y, 'Main menu', () => this.go(SCENES.title), {
      width: 320,
      height: 66,
      hero: true,
      icon: 'home',
    });
    const out = [
      menu,
      new Button(this, WIDTH / 2 - 170, y + 70, 'Arcade', () => this.go(SCENES.arcadeSelect), {
        ...small,
        icon: 'arcade',
      }),
      new Button(
        this,
        WIDTH / 2,
        y + 70,
        'Map',
        () => this.go(SCENES.worldPath, { world: 'mainframe' }),
        {
          ...small,
          icon: 'grid',
        },
      ),
      new Button(
        this,
        WIDTH / 2 + 170,
        y + 70,
        'Credits',
        () => this.go(SCENES.play, { finale: 'credits' } satisfies PlayData),
        {
          ...small,
          icon: 'play',
        },
      ),
    ];
    for (const b of out) b.setDepth(24);
    onBack(this, () => this.go(SCENES.title));
    this.input.keyboard?.on('keydown-ENTER', () => menu.emit('pointerup'));
    return out;
  }

  private go(key: string, data?: object): void {
    this.input.enabled = false;
    transitionTo(this, key, data);
  }
}
