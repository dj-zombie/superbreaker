import Phaser from 'phaser';
import { HEIGHT, SAFE_BOTTOM, SCENES, WIDTH } from '../config';
import { DIFFICULTY } from '../core/Difficulty';
import {
  DEFAULT_ROUNDS,
  GOAL_KINDS,
  GOAL_LABELS,
  LOOP_LABELS,
  RUN_LOOPS,
  WAVE_TIME_BONUS_MS,
  goalFor,
  reachLabel,
  runKey,
  type GoalKind,
  type RunConfig,
  type RunLoop,
} from '../core/Run';
import { randomSeed } from '../core/Rng';
import { runCarry } from '../core/Session';
import { DIFFICULTIES } from '../core/types';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { Button, iconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { Segmented } from '../ui/controls';
import { framePanel } from '../ui/frames';
import { cascade } from '../ui/fx/motion';
import { ambient } from '../ui/fx/particles';
import { transitionTo } from '../ui/fx/transitions';
import { icon } from '../ui/icons';
import { onBack } from '../ui/nav';
import { screenHeader } from '../ui/ScreenHeader';
import { calm, css, menuWorld, useWorld, type UiTheme } from '../ui/theme';
import { body, display, heading, label } from '../ui/type';
import { BaseScene } from './BaseScene';

const CARD_W = 272;
const CARD_H = 236;

const LOOP_BLURB: Record<RunLoop, string> = {
  waves: 'Clear a board and a harder one drops in.',
  descent: 'The wall keeps coming. Keep it off the line.',
};

function goalBlurb(loop: RunLoop, goal: GoalKind): string {
  if (goal === 'endless') return 'Until you run out of lives.';
  if (goal === 'rounds') {
    return loop === 'waves' ? `${DEFAULT_ROUNDS} waves. Go for score.` : `${DEFAULT_ROUNDS} tiers of 12 rows.`;
  }
  return loop === 'waves'
    ? `Each cleared wave adds ${WAVE_TIME_BONUS_MS / 1000} seconds.`
    : 'Survive until the clock runs out.';
}

/** Starts an Arcade run in the given loop and goal. */
export function startRun(
  scene: Phaser.Scene,
  loop: RunLoop,
  goal: GoalKind,
  seed = randomSeed(),
  stop?: string[],
): void {
  const run: RunConfig = { loop, goal: goalFor(goal), seed };
  runCarry.discard();
  transitionTo(scene, SCENES.play, { run }, { stop });
}

/** Arcade setup: loop cards, goal, difficulty and the best record, then LAUNCH. */
export class ArcadeSelect extends BaseScene {
  /** Remembered for the session, so RETRY and MENU land back on the same choice. */
  private static loop: RunLoop = 'waves';
  private static goal: GoalKind = 'endless';
  private seed = randomSeed();
  private t!: UiTheme;

  constructor() {
    super(SCENES.arcadeSelect);
  }

  preload(): void {
    ParallaxBackdrop.preload(this, menuWorld());
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const world = menuWorld();
    const t = (this.t = useWorld(world));
    new ParallaxBackdrop(this, world, 0.4).setTint(backdropTint(0.45));
    ambient(this, t);
    audio.playMusic('menu_music');
    this.seed = randomSeed();

    const back = () => transitionTo(this, SCENES.title);
    const header = screenHeader(this, 'Arcade', { kicker: 'New levels every run', coins: true, onBack: back });
    onBack(this, back);

    const items: Array<Phaser.GameObjects.Container | Phaser.GameObjects.Text> = [];
    let y = header.bottom + 18 + CARD_H / 2;
    const cards = RUN_LOOPS.map((loop, i) => {
      const card = this.modeCard(WIDTH / 2 + (i - 0.5) * (CARD_W + 14), y, loop);
      items.push(card);
      return [loop, card] as const;
    });

    y += CARD_H / 2 + 34;
    items.push(label(this, WIDTH / 2, y, 'Goal', 11));
    const goal = new Segmented(
      this,
      WIDTH / 2,
      y + 34,
      GOAL_KINDS.map((g) => GOAL_LABELS[g]),
      GOAL_KINDS.indexOf(ArcadeSelect.goal),
      (i) => {
        ArcadeSelect.goal = GOAL_KINDS[i]!;
        paint();
      },
      { width: 520, height: 44 },
    );
    items.push(goal);
    const blurb = body(this, WIDTH / 2, y + 78, '', 15, { color: t.palette.textDim });
    items.push(blurb);

    y += 150;
    const panel = framePanel(this, WIDTH / 2, y, 540, 96, t, { variant: 'glass' });
    const bestLabel = label(this, -246, -26, 'Best', 11, { originX: 0 });
    const best = display(this, -246, 8, '', 34, { originX: 0, color: css(t.palette.gold) });
    const reach = label(this, -246, 36, '', 11, { originX: 0, color: t.palette.text });
    const seedLabel = label(this, 246, -26, 'Seed', 11, { originX: 1 });
    const seedText = display(this, 200, 8, '', 22, { originX: 1, color: t.palette.text });
    const reroll = iconButton(this, 230, 8, 'retry', () => {
      this.seed = randomSeed();
      seedText.setText(this.seedLabel());
    }, 36);
    panel.add([bestLabel, best, reach, seedLabel, seedText, reroll]);
    items.push(panel);

    y += 48 + 34;
    items.push(label(this, WIDTH / 2, y, 'Difficulty', 11));
    items.push(
      new Segmented(
        this,
        WIDTH / 2,
        y + 34,
        DIFFICULTIES.map((d) => DIFFICULTY[d].label),
        DIFFICULTIES.indexOf(save.state.difficulty),
        (i) => {
          save.update((d) => (d.difficulty = DIFFICULTIES[i]!));
          paint();
        },
        { width: 380, height: 42 },
      ),
    );

    const launchY = Math.max(y + 120, HEIGHT - Math.max(SAFE_BOTTOM + 20, 30) - 46);
    const launch = new Button(this, WIDTH / 2, launchY, 'Launch', () => this.launch(), {
      width: 320,
      height: 74,
      hero: true,
      icon: 'play',
      fontSize: 34,
    });
    items.push(launch);
    cascade(this, items, { delay: 100, stagger: 45 });
    this.input.keyboard?.on('keydown-ENTER', () => this.launch());

    const paint = () => {
      const { loop, goal: g } = ArcadeSelect;
      for (const [l, c] of cards) c.setSelected(l === loop);
      blurb.setText(goalBlurb(loop, g));
      const rec = save.state.runs[runKey(loop, g)];
      const has = !!rec && rec.bestScore > 0;
      best.setText(has ? rec.bestScore.toLocaleString() : '—');
      reach.setText(has ? reachLabel(loop, rec.bestReach) : 'No runs yet');
      seedText.setText(this.seedLabel());
    };
    for (const [l, c] of cards) {
      c.setHandler(() => {
        ArcadeSelect.loop = l;
        paint();
      });
    }
    paint();
  }

  private seedLabel(): string {
    return `#${(this.seed % 100000).toString().padStart(5, '0')}`;
  }

  private modeCard(x: number, y: number, loop: RunLoop): Card {
    const t = this.t;
    const card = new Card(this, x, y, CARD_W, CARD_H, { onClick: () => {} });
    card.add(this.preview(loop, -CARD_H / 2 + 62));
    card.add(icon(this, -CARD_W / 2 + 34, -CARD_H / 2 + 30, loop, 26, t.palette.accentHi));
    card.add(heading(this, 0, 38, LOOP_LABELS[loop], 32));
    card.add(body(this, 0, 82, LOOP_BLURB[loop], 14, { wrap: CARD_W - 40, color: t.palette.textDim }));
    return card;
  }

  /** A few bricks acting out the loop: waves drop in and clear, descent creeps down. */
  private preview(loop: RunLoop, y: number): Phaser.GameObjects.Container {
    const t = this.t;
    const c = this.add.container(0, y);
    const cols = 6;
    const rows = 3;
    const bw = 26;
    const bh = 12;
    const colors = [t.palette.accent, t.palette.accent2, t.palette.accentHi];
    const bricks: Phaser.GameObjects.Rectangle[] = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const b = this.add
          .rectangle((col - (cols - 1) / 2) * (bw + 4), (r - 1) * (bh + 4), bw, bh, colors[(r + col) % 3]!, 0.85)
          .setStrokeStyle(1, 0x000000, 0.6);
        bricks.push(b);
        c.add(b);
      }
    }
    if (calm()) return c;
    if (loop === 'waves') {
      const cycle = () => {
        bricks.forEach((b, i) => {
          b.setAlpha(0).setY(b.y - 20);
          this.tweens.add({ targets: b, alpha: 0.85, y: b.y + 20, delay: i * 30, duration: 260, ease: 'Back.Out' });
          this.tweens.add({ targets: b, alpha: 0, scale: 1.4, delay: 1500 + Phaser.Math.Between(0, 500), duration: 160, onComplete: () => b.setScale(1) });
        });
      };
      cycle();
      this.time.addEvent({ delay: 2600, loop: true, callback: cycle });
    } else {
      this.tweens.add({ targets: bricks, y: `+=${bh + 4}`, duration: 1200, repeat: -1, ease: 'Stepped', easeParams: [4] });
    }
    return c;
  }

  private launch(): void {
    this.input.enabled = false;
    startRun(this, ArcadeSelect.loop, ArcadeSelect.goal, this.seed);
  }
}
