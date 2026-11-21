import Phaser from 'phaser';
import { worldForLevel } from '../art/backdrops';
import { HEIGHT, SAFE_TOP, SCENES, STAGE_W, WIDTH } from '../config';
import { clearedLabel, stepKey, stepLabel, type CampaignStep } from '../core/Campaign';
import { randomSeed } from '../core/Rng';
import { GOAL_LABELS, LOOP_LABELS, reachLabel } from '../core/Run';
import { runCarry } from '../core/Session';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { midgameAd } from '../platform/crazygames';
import { haptic } from '../platform/haptics';
import { Button } from '../ui/Button';
import { framePanel, raysTexture } from '../ui/frames';
import { cascade, countUp, slam } from '../ui/fx/motion';
import { burst, flyCoins } from '../ui/fx/particles';
import { BehindFx } from '../ui/fx/sceneFx';
import { transitionTo } from '../ui/fx/transitions';
import { playCutscene, storyBetween, type CutsceneNext } from './Cutscene';
import { onBack } from '../ui/nav';
import { calm, css, themeFor, type UiTheme } from '../ui/theme';
import { display, glowWord, heading, label } from '../ui/type';
import { CurrencyPill, revealStars, tick } from '../ui/widgets';
import { Overlay } from './Overlay';
import type { Play, ResultsData, RunResults } from './Play';

const PANEL_W = 540;
const PANEL_H = 560;

function runHeading(run: RunResults): string {
  if (run.outcome === 'over') return 'Game over';
  return run.config.goal.kind === 'timed' ? 'Time up' : 'Run complete';
}

/** Seeds read better in base 36: "1K9ZQ2". */
export function seedLabel(seed: number): string {
  return (seed >>> 0).toString(36).toUpperCase();
}

/** End of a level or run: the heading slams in, stars burst, the score tallies and coins fly home. */
export class Results extends Overlay {
  private result!: ResultsData;
  private t!: UiTheme;
  private coins!: CurrencyPill;

  constructor() {
    super(SCENES.results);
  }

  override init(data: ResultsData & { from: string }): void {
    super.init(data);
    this.result = data;
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const d = this.result;
    const play = this.scene.get(SCENES.play) as Play;
    const t = (this.t = themeFor(play.world));
    const lost = d.run ? d.run.outcome === 'over' : !d.win;
    const behind = [play, this.scene.get(SCENES.hud)];
    const fx = new BehindFx(this).blur(behind, lost ? 0.6 : 1);
    if (lost) fx.desaturate(behind).vignette([play], 0x5a0008);

    const shade = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, STAGE_W * 2, HEIGHT * 2, t.palette.base, lost ? 0.45 : 0.55)
      .setInteractive()
      .setAlpha(0);
    this.tweens.add({ targets: shade, alpha: 1, duration: 260 });

    // Coins already earned are in the balance; the pill starts below and counts up as they land.
    this.coins = new CurrencyPill(this, WIDTH - 16, SAFE_TOP + 36, save.state.coins - d.coinsEarned).setDepth(20);

    const hasNext = !!d.next;
    const cy = HEIGHT / 2 - 20;
    const root = this.add.container(WIDTH / 2, cy);
    root.add(framePanel(this, 0, 0, PANEL_W, PANEL_H, t, { ornament: true }));
    const top = -PANEL_H / 2;
    root.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: root, alpha: 1, scale: 1, duration: 320, ease: 'Back.Out' });

    const cleared = d.stop ? clearedLabel({ index: d.index, stop: d.stop }) : 'Level clear';
    const title = d.run ? runHeading(d.run) : d.win ? (hasNext ? cleared : 'All clear') : 'Game over';
    const head = heading(this, 0, top + 62, title, 52, lost ? { color: css(t.palette.danger) } : {});
    root.add(head);
    slam(this, head, {
      delay: 200,
      onLand: () => {
        if (save.state.settings.screenShake && !calm()) this.cameras.main.shake(140, 0.004);
        haptic(lost ? 'heavy' : 'medium');
      },
    });

    let y = top + 150;
    if (d.run) {
      this.reach(root, d.run, y);
    } else if (d.win) {
      root.add(
        revealStars(this, 0, y, d.stars, {
          size: 78,
          delay: 650,
          t,
          onStar: (i) => {
            audio.sfx(`star_${i + 1}`, 0.5);
            if (d.tail && i === d.stars - 1) audio.fanfareTail();
            haptic('medium');
            const m = root.getWorldTransformMatrix();
            burst(this, m.tx + (i - 1) * 100, m.ty + y, t, { count: 18, speed: 220, depth: 30 });
          },
        }),
      );
    } else {
      root.add(label(this, 0, y, 'Out of lives. The Armory can help.', 14, { color: t.palette.textDim }));
    }

    y += 100;
    const score = display(this, 0, y, '0', 56);
    root.add(score);
    const tallyDelay = d.win || d.run ? 1400 : 500;
    countUp(this, score, 0, d.score, {
      delay: tallyDelay,
      duration: 1100,
      onTick: (n) => tick(n / Math.max(1, d.score)),
      onComplete: () => {
        if (d.isBest) this.newBest(root, y);
        this.payout(root, y + (d.isBest ? 64 : 44));
      },
    });
    const best = label(this, 0, y + 44, d.isBest ? '' : `Best ${d.bestScore.toLocaleString()}`, 13);
    root.add(best);

    const buttons = this.buttons(root, top + PANEL_H - 130, lost);
    cascade(this, buttons, { delay: tallyDelay + 300, stagger: 70 });
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.coins.refresh());
  }

  /** Flies this run's coins from the score into the pill. */
  private payout(root: Phaser.GameObjects.Container, y: number): void {
    const n = this.result.coinsEarned;
    if (n <= 0) return;
    const m = root.getWorldTransformMatrix();
    const plus = glowWord(this, 0, y + 26, `+${n} coins`, 18, this.t.palette.gold);
    root.add(plus);
    const target = this.coins.target();
    const per = Math.max(1, Math.ceil(n / 10));
    let shown = save.state.coins - n;
    flyCoins(this, { x: m.tx, y: m.ty + y + 26 }, target, {
      count: Math.min(10, n),
      depth: 30,
      onEach: () => {
        shown = Math.min(save.state.coins, shown + per);
        this.coins.setValue(shown);
      },
      onDone: () => this.coins.setValue(save.state.coins),
    });
  }

  private newBest(root: Phaser.GameObjects.Container, y: number): void {
    const t = this.t;
    const rays = this.add
      .image(0, y + 46, raysTexture(this))
      .setTint(t.palette.gold)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.9, 0.35)
      .setAlpha(0);
    const word = glowWord(this, 0, y + 46, 'New best', 24, t.palette.gold);
    root.add([rays, word]);
    this.tweens.add({ targets: rays, alpha: 0.6, duration: 300 });
    slam(this, word, { from: 2.2 });
    if (!calm()) {
      this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
      this.tweens.add({ targets: word, scale: 1.08, duration: 600, yoyo: true, repeat: -1, delay: 400, ease: 'Sine.InOut' });
    }
    audio.sfx('new_best', 0.5);
  }

  /** How far the run got, and which run it was. */
  private reach(root: Phaser.GameObjects.Container, run: RunResults, y: number): void {
    const t = this.t;
    const big = glowWord(this, 0, y - 10, reachLabel(run.config.loop, run.reach), 40, t.palette.accentHi);
    root.add(big);
    slam(this, big, { delay: 600, from: 1.8 });
    const best = run.reach >= run.bestReach && run.reach > 0 ? 'best yet' : `best ${run.bestReach}`;
    const loop = LOOP_LABELS[run.config.loop];
    const goal = GOAL_LABELS[run.config.goal.kind];
    root.add(label(this, 0, y + 30, `${loop}  ·  ${goal}  ·  ${best}`, 12));
    root.add(label(this, 0, y + 50, `Seed ${seedLabel(run.config.seed)}`, 11, { color: t.palette.textDim }));
  }

  private buttons(root: Phaser.GameObjects.Container, y: number, lost: boolean): Button[] {
    const d = this.result;
    const small = { width: 156, height: 50, fontSize: 16, variant: 'secondary' as const };
    let main: Button;
    if (d.run) {
      const run = d.run;
      main = new Button(this, 0, y, 'New run', () => this.goRun(run), { width: 320, height: 70, hero: true, icon: 'retry' });
      root.add(main);
      root.add(new Button(this, -170, y + 82, 'Menu', () => this.goArcade(), { ...small, icon: 'home' }));
      root.add(new Button(this, 170, y + 82, 'Same seed', () => this.goRun(run, run.config.seed), small));
    } else {
      const next = d.win ? d.next : undefined;
      const here: CampaignStep = { index: d.index, stop: d.stop };
      main = new Button(
        this,
        0,
        y,
        next ? (next.stop ? stepLabel(next) : 'Next level') : d.win ? 'Play again' : 'Retry',
        () => this.goPlay(next ?? here),
        { width: 320, height: 70, hero: true, icon: next ? 'next' : 'retry', variant: lost ? 'danger' : 'primary' },
      );
      root.add(main);
      root.add(new Button(this, -170, y + 82, 'Map', () => this.goLevels(), { ...small, icon: 'grid' }));
      root.add(
        new Button(this, 170, y + 82, d.win ? 'Replay' : 'Menu', () => (d.win ? this.goPlay(here) : this.goLevels()), small),
      );
    }
    root.add(new Button(this, 0, y + 82, 'Armory', () => this.openChild(SCENES.upgrades), { ...small, icon: 'armory' }));
    onBack(this, () => (d.run ? this.goArcade() : this.goLevels()));
    this.input.keyboard?.on('keydown-ENTER', () => main.emit('pointerup'));
    return root.list.filter((o): o is Button => o instanceof Button);
  }

  /**
   * A video ad is only allowed in a gap between levels, which is exactly what leaving this screen
   * for another level is. Input stays off for the whole request, because it can take a moment to
   * come back and nothing may happen in the meantime. With ads off it resolves immediately.
   */
  private async adBreak(go: () => void): Promise<void> {
    this.input.enabled = false;
    await midgameAd();
    if (!this.scene.isActive()) return;
    this.input.enabled = true;
    go();
  }

  private goRun(run: RunResults, seed = randomSeed()): void {
    void this.adBreak(() =>
      transitionTo(this, SCENES.play, { run: { ...run.config, seed } }, { stop: [SCENES.hud] }),
    );
  }

  private goArcade(): void {
    transitionTo(this, SCENES.arcadeSelect, undefined, { stop: [SCENES.play, SCENES.hud] });
  }

  private goPlay(step: CampaignStep): void {
    // Abilities staged by the win wait only for the step it leads to.
    const next = this.result.win ? this.result.next : undefined;
    if (!next || stepKey(step) !== stepKey(next)) runCarry.discard();
    const data = { index: step.index, stop: step.stop };
    if (this.ending({ scene: SCENES.play, data })) return;
    void this.adBreak(() => transitionTo(this, SCENES.play, data, { stop: [SCENES.hud] }));
  }

  private goLevels(): void {
    runCarry.discard();
    const world = worldForLevel(this.result.index);
    if (this.ending({ scene: SCENES.worldPath, data: { world } })) return;
    transitionTo(this, SCENES.worldPath, { world }, { stop: [SCENES.play, SCENES.hud] });
  }

  /** The campaign's last win plays the scene that follows it, once, on the way to `next`. */
  private ending(next: CutsceneNext): boolean {
    const d = this.result;
    if (!d.win || d.next || d.run) return false;
    const story = storyBetween(this, { index: d.index, stop: d.stop }, undefined);
    if (!story) return false;
    playCutscene(this, story, next, { stop: [SCENES.play, SCENES.hud] });
    return true;
  }
}
