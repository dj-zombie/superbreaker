import Phaser from 'phaser';
import { WORLD_IDS, availableWorlds, type WorldId } from '../art/backdrops';
import { HEIGHT, SAFE_BOTTOM, SAFE_TOP, SCENES, STAGE_W, WIDTH } from '../config';
import { levelId } from '../core/SaveStore';
import { save } from '../services';
import { audio } from '../systems/AudioSystem';
import { Button, iconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { chainTexture, fadeTexture, TEX_SCALE } from '../ui/frames';
import { cascade } from '../ui/fx/motion';
import { ambient } from '../ui/fx/particles';
import { transitionTo } from '../ui/fx/transitions';
import { icon } from '../ui/icons';
import { onBack } from '../ui/nav';
import { HEADER_HEIGHT, screenHeader } from '../ui/ScreenHeader';
import { calm, css, menuWorld, pickWorld, themeFor, useWorld, worldLevels, type UiTheme } from '../ui/theme';
import { label, worldTitle } from '../ui/type';
import { Meter } from '../ui/widgets';
import { BaseScene } from './BaseScene';

const SPACING_RATIO = 0.94;
/** Drag distance that counts as a swipe rather than a tap. */
const SWIPE = 50;

interface WorldsData {
  world?: WorldId;
}

interface WorldCard {
  world: WorldId;
  card: Card;
  locked: boolean;
}

/** Campaign entry: a swipeable carousel of world cards. The screen re-themes as it settles. */
export class Worlds extends BaseScene {
  private index = 0;
  /** Carousel position in cards, eased toward `index`. */
  private pos = 0;
  private cards: WorldCard[] = [];
  private bgs: Phaser.GameObjects.Image[] = [];
  private chrome?: Phaser.GameObjects.Container;
  private air?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dragX?: number;
  private dragged = false;
  private t!: UiTheme;
  private cw = 320;
  private ch = 500;

  constructor() {
    super(SCENES.worlds);
  }

  init(data: WorldsData): void {
    const built = availableWorlds();
    const world = data.world ?? menuWorld();
    this.index = Math.max(0, built.indexOf(world));
    this.pos = this.index;
  }

  preload(): void {
    for (const w of WORLD_IDS) {
      if (!this.textures.exists(`world_${w}`)) this.load.image(`world_${w}`, `assets/images/ui/world_${w}.webp`);
    }
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    this.cards = [];
    this.bgs = [];
    const worlds = availableWorlds();
    this.t = useWorld(worlds[this.index]!);
    audio.playMusic('menu_music');

    worlds.forEach((w, i) => this.bgs.push(this.background(w, i === this.index)));
    const shade = fadeTexture(this);
    this.add.image(WIDTH / 2, HEIGHT, shade).setOrigin(0.5, 1).setFlipY(true)
      .setDisplaySize(STAGE_W, SAFE_BOTTOM + 320).setTint(0x000000).setAlpha(0.85);

    this.sizeCards();
    const cy = this.cardY();
    worlds.forEach((w, i) => this.cards.push(this.worldCard(w, i, cy)));
    this.layout();
    cascade(this, this.cards.map((c) => c.card), { dy: 60, stagger: 80, delay: 120 });
    this.buildChrome(false);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragX = p.x;
      this.dragged = false;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragX === undefined || !p.isDown) return;
      const dx = p.x - this.dragX;
      if (Math.abs(dx) > 8) this.dragged = true;
      if (!this.dragged) return;
      this.tweens.killTweensOf(this);
      this.pos = Phaser.Math.Clamp(this.index - dx / (this.cw * SPACING_RATIO), -0.35, this.cards.length - 0.65);
      this.layout();
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.dragX === undefined) return;
      const dx = p.x - this.dragX;
      this.dragX = undefined;
      if (!this.dragged) return;
      this.go(this.index + (dx < -SWIPE ? 1 : dx > SWIPE ? -1 : 0));
    });
    this.input.keyboard?.on('keydown-LEFT', () => this.go(this.index - 1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.go(this.index + 1));
    this.input.keyboard?.on('keydown-ENTER', () => this.enter());
    onBack(this, () => transitionTo(this, SCENES.title));
  }

  private ctaY(): number {
    return HEIGHT - Math.max(SAFE_BOTTOM + 20, 30) - 46;
  }

  /** The region between the header and the pager dots above ENTER. */
  private cardRegion(): { top: number; bottom: number } {
    return { top: SAFE_TOP + HEADER_HEIGHT + 20, bottom: this.ctaY() - 34 - 44 };
  }

  private cardY(): number {
    const { top, bottom } = this.cardRegion();
    return (top + bottom) / 2;
  }

  /** Cards grow on tall screens and keep a portrait shape. */
  private sizeCards(): void {
    const { top, bottom } = this.cardRegion();
    this.ch = Phaser.Math.Clamp(Math.round(bottom - top), 420, 600);
    this.cw = Math.min(360, Math.round(this.ch * 0.64));
  }

  /** Key art filling the screen behind the cards, drifting slowly. */
  private background(world: WorldId, on: boolean): Phaser.GameObjects.Image {
    const img = this.add.image(WIDTH / 2, HEIGHT / 2, `world_${world}`);
    const cover = Math.max(STAGE_W / img.width, HEIGHT / img.height) * 1.06;
    img.setScale(cover).setTint(0x6c6c6c).setAlpha(on ? 1 : 0);
    if (!calm()) {
      this.tweens.add({
        targets: img,
        scale: cover * 1.08,
        y: HEIGHT / 2 - 14,
        duration: 16000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    return img;
  }

  private worldCard(world: WorldId, i: number, y: number): WorldCard {
    const wt = themeFor(world);
    const { first } = worldLevels(world);
    const locked = save.state.unlocked < first;
    const card = new Card(this, WIDTH / 2, y, this.cw, this.ch, {
      t: wt,
      onClick: () => {
        if (this.dragged) return;
        if (i !== this.index) this.go(i);
        else this.enter();
      },
    });

    const inner = { w: this.cw - 18, h: this.ch - 18 };
    const art = this.add.image(0, 0, `world_${world}`);
    const s = inner.w / art.width;
    const cropH = inner.h / s;
    art.setScale(s).setCrop(0, (art.height - cropH) / 2, art.width, cropH);
    if (locked) art.setTint(0x3a3a3a);
    const fade = this.add
      .image(0, inner.h / 2, fadeTexture(this))
      .setOrigin(0.5, 1)
      .setFlipY(true)
      .setDisplaySize(inner.w, inner.h * 0.62)
      .setTint(0x000000)
      .setAlpha(0.95);
    card.panel.addAt([art, fade], 2);

    const bottom = this.ch / 2;
    card.add(label(this, 0, bottom - 168, `World ${i + 1}`, 13, { t: wt, color: css(wt.palette.accentHi) }));
    card.add(worldTitle(this, 0, bottom - 132, wt.name, wt.frame === 'holo' ? 28 : 32, { t: wt }));
    card.add(label(this, 0, bottom - 98, wt.tagline, 11, { t: wt, wrap: this.cw - 50 }));

    if (locked) {
      this.chains(card);
      const disc = this.add.circle(0, -40, 42, 0x000000, 0.7).setStrokeStyle(2, wt.palette.edge, 0.8);
      card.add([disc, icon(this, 0, -42, 'lock', 40, 0xffffff)]);
      card.add(label(this, 0, bottom - 54, `Clear level ${first - 1} to unlock`, 12, { t: wt, color: wt.palette.text }));
    } else {
      let done = 0;
      let stars = 0;
      for (let n = first; n < first + 10; n++) {
        const rec = save.state.levels[levelId(n)];
        if (rec) done++;
        stars += rec?.stars ?? 0;
      }
      card.add(new Meter(this, -24, bottom - 56, 190, 8, done / 10, wt.palette.accent));
      card.add(label(this, 96, bottom - 56, `${done}/10`, 12, { t: wt, originX: 0 }));
      const star = this.add.image(-60, bottom - 30, 'star');
      star.setScale(18 / star.width);
      card.add([star, label(this, -48, bottom - 30, `${stars} / 30`, 12, { t: wt, originX: 0, color: wt.palette.text })]);
    }
    return { world, card, locked };
  }

  /** Two chains crossing the card. */
  private chains(card: Card): void {
    const key = chainTexture(this);
    const len = Math.hypot(this.cw, this.ch) * 0.9;
    for (const a of [-58, 58]) {
      const chain = this.add
        .tileSprite(0, -30, len * TEX_SCALE, 16 * TEX_SCALE, key)
        .setScale(1 / TEX_SCALE)
        .setAngle(a);
      card.add(chain);
    }
  }

  private layout(): void {
    for (const [i, c] of this.cards.entries()) {
      const d = i - this.pos;
      const ad = Math.min(1.4, Math.abs(d));
      c.card.x = WIDTH / 2 + d * (this.cw * SPACING_RATIO);
      c.card.setScale(1 - Math.min(1, ad) * 0.2);
      c.card.panel.setAlpha(c.locked ? 0.85 : 1);
      c.card.setAlpha(1 - Math.min(1, ad) * 0.5);
      c.card.setDepth(10 - ad);
      c.card.setSelected(Math.abs(d) < 0.5 && !c.locked);
    }
  }

  private go(i: number): void {
    const next = Phaser.Math.Clamp(i, 0, this.cards.length - 1);
    const changed = next !== this.index;
    this.index = next;
    this.tweens.killTweensOf(this);
    this.tweens.add({
      targets: this,
      pos: next,
      duration: 420,
      ease: 'Back.Out',
      onUpdate: () => this.layout(),
    });
    if (changed) {
      audio.whoosh(0.16);
      audio.sfx('ui_move', 0.3);
      this.retheme();
    }
  }

  /** The background, particles and chrome cross over to the focused world. */
  private retheme(): void {
    const world = this.cards[this.index]!.world;
    pickWorld(world);
    this.t = useWorld(world);
    this.bgs.forEach((bg, i) => {
      this.tweens.add({ targets: bg, alpha: i === this.index ? 1 : 0, duration: 520 });
    });
    this.buildChrome(true);
  }

  private buildChrome(animate: boolean): void {
    const old = this.chrome;
    if (old) {
      this.tweens.add({ targets: old, alpha: 0, duration: 160, onComplete: () => old.destroy() });
    }
    this.air?.destroy();
    this.air = ambient(this, this.t);
    this.air?.setDepth(5);

    const t = this.t;
    const root = (this.chrome = this.add.container(0, 0).setDepth(40));
    const header = screenHeader(this, 'Campaign', {
      kicker: 'Choose a world',
      coins: true,
      onBack: () => transitionTo(this, SCENES.title),
      t,
    });
    root.add(header.root);

    const current = this.cards[this.index]!;
    const ctaY = this.ctaY();
    const enter = new Button(this, WIDTH / 2, ctaY, current.locked ? 'Locked' : 'Enter', () => this.enter(), {
      width: 260,
      height: 68,
      hero: !current.locked,
      icon: current.locked ? 'lock' : 'play',
      disabled: current.locked,
      t,
    });
    root.add(enter);

    const cy = this.cardY();
    if (this.index > 0) root.add(iconButton(this, 34, cy, 'back', () => this.go(this.index - 1), 44));
    if (this.index < this.cards.length - 1) {
      root.add(iconButton(this, WIDTH - 34, cy, 'next', () => this.go(this.index + 1), 44));
    }

    const dotsY = cy + this.ch / 2 + 26;
    this.cards.forEach((_, i) => {
      const on = i === this.index;
      const dot = this.add
        .rectangle(WIDTH / 2 + (i - (this.cards.length - 1) / 2) * 22, dotsY, on ? 16 : 7, 7, on ? t.palette.accent : t.palette.edge, on ? 1 : 0.6);
      root.add(dot);
    });

    if (animate) {
      root.setAlpha(0);
      this.tweens.add({ targets: root, alpha: 1, duration: 260 });
    }
  }

  private enter(): void {
    const c = this.cards[this.index];
    if (!c) return;
    if (c.locked) {
      this.tweens.add({ targets: c.card, x: c.card.x + 8, duration: 50, yoyo: true, repeat: 3 });
      audio.sfx('ui_locked', 0.45);
      return;
    }
    pickWorld(c.world);
    transitionTo(this, SCENES.worldPath, { world: c.world });
  }
}
