import Phaser from 'phaser';
import {
  ABILITY_INFO,
  COLORS,
  DECK_TOP,
  HEIGHT,
  HUD_CENTER,
  HUD_HEIGHT,
  IS_TOUCH,
  POWERUP_INFO,
  RENDER_ZOOM,
  SCENES,
  SLOT_RADIUS,
  STOCK_RADIUS,
  UI_FONT,
  WIDTH,
  slotPositions,
  stockPositions,
} from '../config';
import { HUD_FONT } from '../art/fonts';
import type { SlotState } from '../systems/AbilitySystem';
import { MAX_LIVES } from '../core/Difficulty';
import type { PowerupId } from '../core/types';
import { iconButton } from '../ui/Button';
import { disc, ring } from '../ui/shapes';
import { BaseScene } from './BaseScene';
import type { HudState, Play } from './Play';

/**
 * HUD pieces are built once from images, rectangles and tinted shapes and only restyled when
 * their state changes. Phaser Graphics re-tessellates every circle on the CPU each frame.
 */
interface SlotView {
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  empty: Phaser.GameObjects.Text;
  shown: string | null;
  ready: boolean;
  pulse?: Phaser.Tweens.Tween;
}

interface EffectView {
  icon: Phaser.GameObjects.Image;
  track: Phaser.GameObjects.Rectangle;
  bar: Phaser.GameObjects.Rectangle;
}

interface FeverView {
  track: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  rainbow: Phaser.GameObjects.TileSprite;
}

const EFFECT_GAP = 52;
const EFFECT_BAR_W = 40;

/** Thumb zone under the paddle: panel, a slider track that mirrors the paddle, and a hint. */
interface DeckView {
  panel: Phaser.GameObjects.Image;
  track: Phaser.GameObjects.Rectangle;
  knob: Phaser.GameObjects.Image;
  hint: Phaser.GameObjects.Text;
  left: number;
  right: number;
}

/** Runs in parallel above Play and mirrors its public HUD state. */
export class Hud extends BaseScene {
  private play!: Play;
  private score!: Phaser.GameObjects.BitmapText;
  private level!: Phaser.GameObjects.BitmapText;
  private scorePunch?: Phaser.Tweens.Tween;
  private hearts: Phaser.GameObjects.Image[] = [];
  private effectViews = new Map<PowerupId, EffectView>();
  private shieldIcon!: Phaser.GameObjects.Container;
  private shownScore = 0;
  private last = { lives: -1, score: -1, shownScore: -1, remaining: -1 };
  private feverView!: FeverView;
  private slotViews: SlotView[] = [];
  private stockKey = '';
  private stockIcons: Phaser.GameObjects.Container[] = [];
  private deck?: DeckView;

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    this.setupCamera();
    this.play = this.scene.get(SCENES.play) as Play;
    this.shownScore = 0;
    this.last = { lives: -1, score: -1, shownScore: -1, remaining: -1 };
    this.scorePunch = undefined;
    this.effectViews.clear();
    this.hearts = [];
    this.deck = IS_TOUCH ? this.makeDeck() : undefined;

    const bar = this.add.graphics();
    bar.fillGradientStyle(0x0b0820, 0x0b0820, 0x0b0820, 0x0b0820, 0.9, 0.9, 0.55, 0.55);
    bar.fillRect(0, 0, WIDTH, HUD_HEIGHT);
    bar.lineStyle(2, COLORS.panelEdge, 0.8).lineBetween(0, HUD_HEIGHT, WIDTH, HUD_HEIGHT);

    this.score = this.add.bitmapText(64, HUD_CENTER, HUD_FONT, '0', 24).setOrigin(0, 0.5);
    this.level = this.add
      .bitmapText(WIDTH / 2 + 20, HUD_CENTER, HUD_FONT, '', 16)
      .setOrigin(0.5)
      .setTint(0x8a83b8);

    for (let i = 0; i < MAX_LIVES; i++) {
      const h = this.add.image(WIDTH - 22 - i * 28, HUD_CENTER, 'heart');
      h.setScale(22 / h.width);
      this.hearts.push(h);
    }

    iconButton(this, 26, HUD_CENTER, 'II', () => this.play.requestPause(), 38);
    this.shieldIcon = this.add
      .container(0, 0, [disc(this, 0, 0, 13, 0x78dcff, 0.4), ring(this, 0, 0, 13, 3, 0x78dcff)])
      .setVisible(false);
    this.feverView = this.makeFever();
    this.slotViews = slotPositions().map((p, i) => this.makeSlot(p.x, p.y, i));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onViewport, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onViewport, this);
    });
  }

  /** Keep the deck and its buttons under the paddle when the phone viewport changes. */
  private onViewport(): void {
    slotPositions().forEach((p, i) => this.slotViews[i]?.root.setPosition(p.x, p.y));
    this.stockKey = '';
    this.layoutDeck();
    this.layoutFever(this.feverView);
  }

  private makeDeck(): DeckView {
    const panel = this.add
      .image(WIDTH / 2, 0, 'deck_panel')
      .setOrigin(0.5, 0)
      .setDepth(1);
    const track = this.add.rectangle(0, 0, 100, 4, 0xffffff, 0.12).setDepth(2);
    const knob = this.add.image(0, 0, 'deck_knob').setDepth(3).setAlpha(0.85);
    knob.setScale(56 / knob.width);
    const hint = this.add
      .text(0, 0, '‹   DRAG TO MOVE   ›', {
        fontFamily: UI_FONT,
        fontStyle: '900',
        fontSize: '15px',
        color: '#8a83b8',
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0.5)
      .setDepth(3);
    this.tweens.add({
      targets: hint,
      alpha: { from: 1, to: 0.35 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    this.deck = { panel, track, knob, hint, left: 0, right: WIDTH };
    this.layoutDeck();
    return this.deck;
  }

  private layoutDeck(): void {
    const d = this.deck;
    if (!d) return;
    d.panel.setPosition(WIDTH / 2, DECK_TOP).setDisplaySize(WIDTH, HEIGHT - DECK_TOP);
    const [l, r] = slotPositions();
    const y = l!.y;
    d.left = l!.x + SLOT_RADIUS + 18;
    d.right = r!.x - SLOT_RADIUS - 18;
    d.track.setPosition((d.left + d.right) / 2, y).setDisplaySize(d.right - d.left, 4);
    d.knob.setY(y);
    d.hint.setPosition(WIDTH / 2, y - 26);
  }

  private drawDeck(s: HudState): void {
    const d = this.deck;
    if (!d) return;
    d.knob.setX(d.left + (s.paddleX / WIDTH) * (d.right - d.left));
    d.hint.setVisible(s.ballHeld);
  }

  private makeSlot(x: number, y: number, index: number): SlotView {
    const root = this.add.container(x, y).setDepth(30);
    const glow = disc(this, 0, 0, SLOT_RADIUS + 8, 0xffffff).setVisible(false);
    const base = disc(this, 0, 0, SLOT_RADIUS, 0x0b0820, 0.85);
    const edge = ring(this, 0, 0, SLOT_RADIUS, 3, COLORS.panelEdge, 0.6);
    const icon = this.add.image(0, 0, 'ab_meteor').setVisible(false);
    const empty = this.add
      .text(0, 0, '?', {
        fontFamily: UI_FONT,
        fontStyle: '900',
        fontSize: `${Math.round(SLOT_RADIUS * 0.8)}px`,
        color: '#4a4380',
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0.5);
    const key = this.add
      .text(SLOT_RADIUS - 4, SLOT_RADIUS - 4, index === 0 ? 'Q' : 'E', {
        fontFamily: UI_FONT,
        fontStyle: '900',
        fontSize: '12px',
        color: '#8a83b8',
        resolution: RENDER_ZOOM,
      })
      .setOrigin(0.5)
      .setVisible(this.sys.game.device.os.desktop);
    root.add([glow, base, edge, icon, empty, key]);
    root.setSize(SLOT_RADIUS * 2, SLOT_RADIUS * 2);
    root.setInteractive(
      new Phaser.Geom.Circle(SLOT_RADIUS, SLOT_RADIUS, SLOT_RADIUS + 6),
      Phaser.Geom.Circle.Contains,
    );
    root.on(Phaser.Input.Events.POINTER_DOWN, () => this.play.fireSlot(index));
    return { root, glow, ring: edge, icon, empty, shown: null, ready: false };
  }

  private makeFever(): FeverView {
    const track = this.add.rectangle(0, 0, WIDTH, 5, 0x000000, 0.45).setOrigin(0, 0);
    const fill = this.add.rectangle(0, 0, WIDTH, 5, 0xff5cf0, 1).setOrigin(0, 0);
    const rainbow = this.add.tileSprite(0, 0, WIDTH, 5, 'rainbow_bar').setOrigin(0, 0);
    // One hue cycle across the full bar, like the old segmented rainbow.
    rainbow.setTileScale(WIDTH / 256, 5 / 4).setVisible(false);
    fill.setScale(0, 1);
    const view = { track, fill, rainbow };
    this.layoutFever(view);
    return view;
  }

  private layoutFever(v: FeverView): void {
    const y = HUD_HEIGHT + 1;
    v.track.setY(y);
    v.fill.setY(y);
    v.rainbow.setY(y);
  }

  override update(_t: number, delta: number): void {
    const s = this.play.hud as HudState | undefined;
    if (!s) return;
    if (s.lives !== this.last.lives) this.updateLives(s.lives);
    if (s.score !== this.last.score) {
      this.last.score = s.score;
      if (!this.scorePunch?.isPlaying()) {
        this.scorePunch = this.tweens.add({
          targets: this.score,
          scale: { from: 1.2, to: 1 },
          duration: 120,
        });
      }
    }
    // Count up smoothly instead of jumping.
    this.shownScore += (s.score - this.shownScore) * Math.min(1, delta / 90);
    if (Math.abs(s.score - this.shownScore) < 1) this.shownScore = s.score;
    const shown = Math.round(this.shownScore);
    if (shown !== this.last.shownScore) {
      this.last.shownScore = shown;
      this.score.setText(shown.toLocaleString());
    }
    if (s.remaining !== this.last.remaining) {
      this.last.remaining = s.remaining;
      this.level.setText(`LEVEL ${s.index}  ·  ${s.remaining} LEFT`);
    }
    this.drawEffects(s);
    this.drawFever(s, delta);
    this.drawStock(s);
    this.drawDeck(s);
    s.slots.forEach((slot, i) => {
      const v = this.slotViews[i];
      if (v) this.drawSlot(v, slot);
    });
  }

  private drawFever(s: HudState, delta: number): void {
    const { fill, rainbow } = this.feverView;
    const w = Phaser.Math.Clamp(s.fever, 0, 1);
    rainbow.setVisible(s.feverActive && w > 0);
    fill.setVisible(!s.feverActive && w > 0);
    if (s.feverActive) {
      rainbow.scaleX = w;
      rainbow.tilePositionX -= (256 * delta) / 1000;
    } else if (w > 0) {
      const full = w > 0.8 && Math.floor(this.time.now / 120) % 2 === 0;
      fill.scaleX = w;
      fill.fillColor = full ? 0xffffff : 0xff5cf0;
    }
  }

  private drawStock(s: HudState): void {
    const key = s.stock.join(',');
    if (key === this.stockKey) return;
    this.stockKey = key;
    for (const icon of this.stockIcons) icon.destroy();
    const desktop = this.sys.game.device.os.desktop;
    this.stockIcons = stockPositions(s.stock.length).map((p, i) => {
      const id = s.stock[i]!;
      const root = this.add.container(p.x, p.y).setDepth(30);
      const icon = this.add.image(0, 0, POWERUP_INFO[id].texture);
      icon.setScale((STOCK_RADIUS * 1.35) / Math.max(icon.width, icon.height));
      root.add([
        disc(this, 0, 0, STOCK_RADIUS, 0x0b0820, 0.88),
        ring(this, 0, 0, STOCK_RADIUS, 3, POWERUP_INFO[id].color),
        icon,
      ]);
      if (desktop) {
        root.add(
          this.add
            .text(STOCK_RADIUS - 2, STOCK_RADIUS - 2, String(i + 1), {
              fontFamily: UI_FONT,
              fontStyle: '900',
              fontSize: '11px',
              color: '#ffffff',
              resolution: RENDER_ZOOM,
            })
            .setOrigin(0.5),
        );
      }
      root.setSize(STOCK_RADIUS * 2, STOCK_RADIUS * 2);
      root.setInteractive(
        new Phaser.Geom.Circle(STOCK_RADIUS, STOCK_RADIUS, STOCK_RADIUS + 6),
        Phaser.Geom.Circle.Contains,
      );
      root.on(Phaser.Input.Events.POINTER_DOWN, () => this.play.useStock(i));
      return root;
    });
  }

  private drawSlot(v: SlotView, slot: SlotState): void {
    const id = slot.display;
    const ready = !!slot.ability;
    const color = id ? ABILITY_INFO[id].color : COLORS.panelEdge;
    const lit = ready || slot.spinning;
    v.ring.setTint(color).setAlpha(lit ? 1 : 0.6);
    v.glow.setTint(color);
    if (ready && !v.pulse) {
      v.glow.setVisible(true).setAlpha(0.15);
      v.pulse = this.tweens.add({
        targets: v.glow,
        alpha: 0.3,
        duration: 470,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
    } else if (!ready && v.pulse) {
      v.pulse.stop();
      v.pulse = undefined;
      v.glow.setVisible(false);
    }
    v.empty.setVisible(!id);
    v.icon.setVisible(!!id);
    if (id && id !== v.shown) {
      v.icon.setTexture(`ab_${id}`);
      const s = ((SLOT_RADIUS - 4) * 2) / v.icon.width;
      v.icon.setScale(s * 1.25);
      this.tweens.add({ targets: v.icon, scale: s, duration: 90 });
    }
    if (ready && !v.ready) {
      this.tweens.add({
        targets: v.root,
        scale: { from: 1.35, to: 1 },
        duration: 260,
        ease: 'Back.Out',
      });
    }
    v.shown = id;
    v.ready = ready;
  }

  private updateLives(lives: number): void {
    const lost = lives < this.last.lives;
    this.last.lives = lives;
    this.hearts.forEach((h, i) => {
      const on = i < lives;
      h.setVisible(i < Math.max(lives, 3));
      h.setAlpha(on ? 1 : 0.18);
      if (lost && i === lives) {
        this.tweens.add({ targets: h, scale: { from: h.scale * 1.8, to: h.scale }, duration: 300 });
      }
    });
  }

  private drawEffects(s: HudState): void {
    const y = HUD_HEIGHT + 24;
    const seen = new Set<PowerupId>();
    s.effects.forEach((e, i) => {
      const x = 28 + i * EFFECT_GAP;
      seen.add(e.id);
      let v = this.effectViews.get(e.id);
      if (!v) {
        const icon = this.add.image(x, y, POWERUP_INFO[e.id].texture);
        icon.setScale(30 / Math.max(icon.width, icon.height));
        const track = this.add.rectangle(0, 0, EFFECT_BAR_W, 6, 0x000000, 0.5).setOrigin(0, 0);
        const bar = this.add
          .rectangle(0, 0, EFFECT_BAR_W, 6, POWERUP_INFO[e.id].color, 1)
          .setOrigin(0, 0);
        v = { icon, track, bar };
        this.effectViews.set(e.id, v);
      }
      v.icon
        .setPosition(x, y)
        .setAlpha(e.remainingMs < 1500 && Math.floor(e.remainingMs / 150) % 2 ? 0.4 : 1);
      v.track.setPosition(x - EFFECT_BAR_W / 2, y + 18);
      v.bar.setPosition(x - EFFECT_BAR_W / 2, y + 18);
      v.bar.scaleX = Phaser.Math.Clamp(e.remainingMs / e.totalMs, 0, 1);
    });
    this.shieldIcon.setVisible(s.shield);
    if (s.shield) this.shieldIcon.setPosition(28 + s.effects.length * EFFECT_GAP, y);
    for (const [id, v] of this.effectViews) {
      if (seen.has(id)) continue;
      v.icon.destroy();
      v.track.destroy();
      v.bar.destroy();
      this.effectViews.delete(id);
    }
  }
}
