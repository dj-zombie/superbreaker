import Phaser from 'phaser';
import { WORLD_IDS, type WorldId } from '../art/backdrops';
import { HEIGHT, IS_TOUCH, SAFE_BOTTOM, SCENES, WIDTH } from '../config';
import { stepKey, type CampaignStep, type StopKind } from '../core/Campaign';
import { levelId } from '../core/SaveStore';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { haptic } from '../platform/haptics';
import { dotsTexture, flowTexture, softDiscTexture, TEX_SCALE } from '../ui/frames';
import { shake } from '../ui/fx/motion';
import { ambient } from '../ui/fx/particles';
import { transitionTo } from '../ui/fx/transitions';
import { icon, nodeTexture, type NodeState } from '../ui/icons';
import { onBack } from '../ui/nav';
import { screenHeader } from '../ui/ScreenHeader';
import { calm, menuWorld, pickWorld, useWorld, worldLevels, type UiTheme } from '../ui/theme';
import { display, label } from '../ui/type';
import { starRow } from '../ui/widgets';
import { BaseScene } from './BaseScene';

interface PathData {
  world?: WorldId;
}

interface Node {
  index: number;
  /** A stop after level `index`, rather than the level. */
  stop?: StopKind;
  /** The world's last level, drawn larger. */
  big: boolean;
  x: number;
  y: number;
  state: NodeState;
}

const SWING = 150;

/**
 * A world's ten levels, and the boss stops between them, as nodes zig-zagging down the screen,
 * sinking through the world.
 */
export class WorldPath extends BaseScene {
  private world: WorldId = 'hell';
  private t!: UiTheme;
  private flows: Phaser.GameObjects.TileSprite[] = [];
  private toast?: Phaser.GameObjects.Text;
  /** The node the player is up to, in this world. */
  private current?: Node;

  constructor() {
    super(SCENES.worldPath);
  }

  init(data: PathData): void {
    this.world = data.world ?? menuWorld();
  }

  preload(): void {
    ParallaxBackdrop.preload(this, this.world);
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    this.flows = [];
    pickWorld(this.world);
    const t = (this.t = useWorld(this.world));
    new ParallaxBackdrop(this, this.world, 0.35).setTint(backdropTint(0.4));
    ambient(this, t);
    audio.playMusic('menu_music');

    const { first } = worldLevels(this.world);
    let stars = 0;
    for (let n = first; n < first + 10; n++) stars += save.state.levels[levelId(n)]?.stars ?? 0;
    const back = () => transitionTo(this, SCENES.worlds, { world: this.world });
    const header = screenHeader(this, t.name, {
      kicker: `World ${WORLD_IDS.indexOf(this.world) + 1}  ·  ${stars} / 30 stars`,
      coins: true,
      onBack: back,
    });
    onBack(this, back);

    const nodes = this.layoutNodes(first, header.bottom + 56, HEIGHT - Math.max(SAFE_BOTTOM, 0) - 74);
    for (let i = 0; i < nodes.length - 1; i++) this.link(nodes[i]!, nodes[i + 1]!, i);
    // A bonus stage holds nothing shut, so the path's marker waits on the next level instead.
    const current = (this.current = nodes.find((n) => n.state === 'open' && n.stop !== 'bonus'));
    nodes.forEach((n, i) => this.node(n, i, n === current));

    this.toast = label(this, WIDTH / 2, HEIGHT - Math.max(SAFE_BOTTOM + 18, 26), '', 13, {
      color: t.palette.text,
    }).setDepth(50);
    this.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, dt: number) => {
      for (const f of this.flows) f.tilePositionX -= dt * 0.05;
    });
  }

  private layoutNodes(first: number, top: number, bottom: number): Node[] {
    const places: CampaignStep[] = [];
    for (let index = first; index < first + 10; index++) {
      places.push({ index });
      const stop = this.stopAfter(index);
      if (stop) places.push({ index, stop: 'boss' });
      if (stop?.bonus) places.push({ index, stop: 'bonus' });
    }
    const step = (bottom - top) / (places.length - 1);
    return places.map(({ index, stop }, i) => {
      const big = !stop && index === first + 9;
      const x = big ? WIDTH / 2 : WIDTH / 2 + Math.sin(i * 1.05 + 0.5) * SWING;
      return { index, stop, big, x, y: top + i * step, state: this.nodeState(index, stop) };
    });
  }

  private nodeState(index: number, stop: StopKind | undefined): NodeState {
    if (save.state.levels[stepKey({ index, stop })]) return 'cleared';
    // A boss stop opens with its level's clear, and its bonus stage with the boss beaten. Either
    // is open when the path already is past it, as unlocking every level leaves it.
    const past = save.state.unlocked > index;
    const open =
      stop === 'boss'
        ? !!save.state.levels[levelId(index)] || past
        : stop === 'bonus'
          ? save.bossBeaten(index) || past
          : index <= save.state.unlocked;
    return open ? 'open' : 'locked';
  }

  /** Dotted trail between two nodes; cleared stretches carry flowing light. */
  private link(a: Node, b: Node, order: number): void {
    const t = this.t;
    const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    const angle = Phaser.Math.Angle.Between(a.x, a.y, b.x, b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const lit = a.state === 'cleared';
    const dots = this.add
      .tileSprite(mx, my, len * TEX_SCALE, 8 * TEX_SCALE, dotsTexture(this))
      .setScale(1 / TEX_SCALE)
      .setRotation(angle)
      .setTint(lit ? t.palette.accent : t.palette.edge)
      .setAlpha(0);
    this.tweens.add({ targets: dots, alpha: lit ? 0.9 : 0.45, delay: 200 + order * 50, duration: 300 });
    if (!lit || calm()) return;
    const flow = this.add
      .tileSprite(mx, my, len, 8, flowTexture(this))
      .setRotation(angle)
      .setTint(t.palette.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.tweens.add({ targets: flow, alpha: 0.85, delay: 300 + order * 50, duration: 400 });
    this.flows.push(flow);
  }

  private node(n: Node, order: number, current: boolean): void {
    const t = this.t;
    const big = n.big;
    const c = this.add.container(n.x, n.y).setDepth(10);
    const size = big ? 92 : 70;
    if (current) {
      const halo = this.add
        .image(0, 0, softDiscTexture(this))
        .setTint(t.palette.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(size * 2, size * 2)
        .setAlpha(0.7);
      c.add(halo);
      if (!calm()) {
        this.tweens.add({
          targets: halo,
          scale: halo.scale * 1.25,
          alpha: 0.3,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    }
    const plate = this.add.image(0, 0, nodeTexture(this, t.frame, n.state, big)).setScale(1 / TEX_SCALE);
    c.add(plate);
    if (n.stop) {
      const tint = n.state === 'locked' ? 0x8a8a8a : t.palette.accentHi;
      c.add(icon(this, 0, 0, n.stop === 'boss' ? 'skull' : 'gun', 34, tint));
    } else {
      const num = display(this, 0, 1, String(n.index), big ? 30 : 24, {
        color: n.state === 'locked' ? t.palette.textDim : n.state === 'cleared' ? t.palette.textOnAccent : t.palette.text,
      });
      if (n.state === 'cleared' && t.frame !== 'forged') num.setColor(t.palette.text);
      c.add(num);
    }
    if (n.state === 'locked') {
      c.add(icon(this, size * 0.3, size * 0.3, 'lock', 18, 0xffffff).setAlpha(0.7));
    }
    const rec = save.state.levels[stepKey(n)];
    if (rec) c.add(starRow(this, 0, size / 2 + 6, rec.stars, 14, 2));
    const spec = this.levels[n.index - 1];
    if (!n.stop && spec?.lighting.lightsOut) {
      const moon = icon(this, -size * 0.36, -size * 0.34, 'moon', 20, t.palette.accentHi);
      c.add(moon);
    }
    if (current) {
      const marker = icon(this, 0, -size / 2 - 22, 'next', 26, t.palette.accentHi).setAngle(90);
      c.add(marker);
      if (!calm()) {
        this.tweens.add({ targets: marker, y: marker.y - 8, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      }
    }
    if (n.stop) {
      // Below the plate: above it, the path's tight bends put the label on the previous level's stars.
      const name = n.stop === 'boss' ? 'Boss' : 'Bonus';
      c.add(label(this, 0, size / 2 + (rec ? 26 : 12), name, 12, { color: t.palette.textDim }));
    } else if (big) {
      c.add(label(this, 0, -size / 2 - (current ? 46 : 12), 'Finale', 12, { color: t.palette.textDim }));
    }

    c.setSize(size, size).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => {
      if (!IS_TOUCH && n.state !== 'locked') this.tweens.add({ targets: c, scale: 1.1, duration: 140 });
    });
    c.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 140 }));
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.92, duration: 70 }));
    c.on('pointerup', () => {
      this.tweens.add({ targets: c, scale: 1, duration: 240, ease: 'Back.Out' });
      if (n.state === 'locked') {
        shake(this, c, 6);
        audio.sfx('ui_locked', 0.45);
        haptic('light');
        const at = this.current;
        const ahead = at?.stop ? 'Beat the boss' : `Clear level ${at?.index ?? save.state.unlocked}`;
        this.say(`${ahead} first`);
        return;
      }
      audio.sfx('ui_select', 0.55);
      haptic('light');
      this.scene.launch(SCENES.briefing, { from: this.scene.key, index: n.index, stop: n.stop });
      this.scene.pause();
    });

    c.setScale(0).setAlpha(0);
    this.tweens.add({
      targets: c,
      scale: 1,
      alpha: 1,
      delay: 160 + order * 55,
      duration: 380,
      ease: 'Back.Out',
    });
  }

  private say(msg: string): void {
    if (!this.toast) return;
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(msg.toUpperCase()).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 400 });
  }
}
