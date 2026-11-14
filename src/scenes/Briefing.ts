import Phaser from 'phaser';
import { WORLD_IDS, worldForLevel } from '../art/backdrops';
import { POWERUP_INFO, SAFE_BOTTOM, SCENES, WIDTH } from '../config';
import { DIFFICULTY } from '../core/Difficulty';
import { levelId } from '../core/SaveStore';
import { DIFFICULTIES, type LevelSpec } from '../core/types';
import { save } from '../services';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/controls';
import { cascade } from '../ui/fx/motion';
import type { IconName } from '../ui/icons';
import { onBack } from '../ui/nav';
import { Sheet } from '../ui/Sheet';
import { css, useWorld, type UiTheme } from '../ui/theme';
import { body, heading, label } from '../ui/type';
import { chip, flowRow, starRow } from '../ui/widgets';
import { Overlay, type OverlayData } from './Overlay';
import { startLevel } from './Title';

interface BriefingData extends OverlayData {
  index: number;
}

const SHEET_H = 560;

/** What makes a level different, read from its bricks and lighting. */
function features(spec: LevelSpec): Array<[IconName, string]> {
  const kinds = new Set(spec.bricks.map((b) => b.kind));
  const out: Array<[IconName, string]> = [];
  if (kinds.has('steel')) out.push(['steel', 'Steel']);
  if (kinds.has('explosive')) out.push(['tnt', 'TNT']);
  if (kinds.has('armored')) out.push(['armored', 'Armored']);
  if (kinds.has('regen')) out.push(['regen', 'Regen']);
  if (spec.bricks.some((b) => b.moveX !== 0)) out.push(['mover', 'Movers']);
  if (spec.lighting.lightsOut) out.push(['moon', 'Lights out']);
  if (spec.lighting.lightning) out.push(['storm', 'Storm']);
  return out;
}

/** Level details, difficulty and loadout in a sheet over the world path. */
export class Briefing extends Overlay {
  private index = 1;
  private t!: UiTheme;
  private sheet!: Sheet;
  private loadout?: Phaser.GameObjects.Container;

  constructor() {
    super(SCENES.briefing);
  }

  override init(data: BriefingData): void {
    super.init(data);
    this.index = data.index;
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const world = worldForLevel(this.index);
    const t = (this.t = useWorld(world));
    const spec = this.levels[this.index - 1];
    const height = SHEET_H + SAFE_BOTTOM;
    this.sheet = new Sheet(this, {
      height,
      blur: this.scene.get(this.from),
      onDismiss: () => this.close(),
    });
    onBack(this, () => this.dismiss());
    const root = this.sheet.root;
    const top = this.sheet.top;
    const items: Array<Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle & Phaser.GameObjects.GameObject> = [];
    const add = <T extends (typeof items)[number]>(o: T): T => {
      root.add(o);
      items.push(o);
      return o;
    };

    const worldNo = WORLD_IDS.indexOf(world) + 1;
    const levelNo = ((this.index - 1) % 10) + 1;
    add(label(this, 0, top + 52, `World ${worldNo}  ·  Level ${levelNo}`, 13, { color: css(t.palette.accentHi) }));
    add(heading(this, 0, top + 90, spec?.title ?? `Level ${this.index}`, 38));

    const rec = save.state.levels[levelId(this.index)];
    add(starRow(this, -70, top + 138, rec?.stars ?? 0, 24, 6));
    add(
      label(this, 40, top + 138, rec ? `Best ${rec.bestScore.toLocaleString()}` : 'Not cleared yet', 13, {
        originX: 0,
        color: rec ? css(t.palette.gold) : t.palette.textDim,
      }),
    );

    let y = top + 184;
    add(label(this, 0, y, 'Featuring', 11));
    const feats = spec ? features(spec) : [];
    if (feats.length) {
      const chips = feats.map(([g, text]) => add(chip(this, g, text, t)));
      const rows = flowRow(chips, 0, y + 32, WIDTH - 80);
      y += 32 + (rows - 1) * 38;
    } else {
      add(body(this, 0, y + 30, 'Classic bricks. Warm up and go for three stars.', 15, { color: t.palette.textDim }));
      y += 30;
    }

    y += 52;
    add(label(this, 0, y, 'Difficulty', 11));
    add(
      new Segmented(
        this,
        0,
        y + 34,
        DIFFICULTIES.map((d) => DIFFICULTY[d].label),
        DIFFICULTIES.indexOf(save.state.difficulty),
        (i) => save.update((d) => (d.difficulty = DIFFICULTIES[i]!)),
        { width: 380, height: 42 },
      ),
    );

    y += 86;
    add(label(this, 0, y, 'Loadout', 11));
    this.loadout = add(this.add.container(0, y + 34));
    this.paintLoadout();
    add(
      new Button(this, WIDTH / 2 - 100, y + 34, 'Armory', () => this.openChild(SCENES.upgrades), {
        width: 120,
        height: 40,
        variant: 'secondary',
        icon: 'armory',
        fontSize: 15,
      }),
    );

    add(
      new Button(this, 0, top + height - SAFE_BOTTOM - 60, 'Play', () => this.play(), {
        width: 320,
        height: 74,
        hero: true,
        icon: 'play',
        fontSize: 34,
      }),
    );
    cascade(this, items, { delay: 140, stagger: 35, dy: 18 });
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      useWorld(world);
      this.paintLoadout();
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.play());
  }

  /** Icons for what's stocked for the next run. */
  private paintLoadout(): void {
    const c = this.loadout;
    if (!c) return;
    c.removeAll(true);
    const { powerups, abilities } = save.state.stock;
    const keys = [...powerups.map((p) => POWERUP_INFO[p].texture), ...abilities.map((a) => `ab_${a}`)];
    if (!keys.length) {
      c.add(label(this, -60, 0, 'Nothing stocked', 12, { color: this.t.palette.textDim }));
      return;
    }
    const size = 34;
    const gap = 8;
    const left = -60 - ((keys.length - 1) * (size + gap)) / 2;
    keys.slice(0, 7).forEach((k, i) => {
      const img = this.add.image(left + i * (size + gap), 0, k);
      img.setScale(size / Math.max(img.width, img.height));
      c.add(img);
    });
  }

  private dismiss(): void {
    this.sheet.close(() => this.close());
  }

  private play(): void {
    this.input.enabled = false;
    startLevel(this, this.index, [this.from]);
  }
}
