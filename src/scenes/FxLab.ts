import Phaser from 'phaser';
import { WORLD_IDS, type SceneryId, type WorldId } from '../art/backdrops';
import { fgTexture } from '../art/foreground';
import { ABILITY_INFO, BRICK_COLORS, BRICK_TINT, HEIGHT, SCENES, WIDTH } from '../config';
import { FX_LIBRARY, FxEngine, Vortex, type FxHandle } from '../fx';
import { fxDef } from '../fx/FxEngine';
import { backdropTint } from '../systems/Backdrop';
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop';
import { pinFxTier, type LightingTier } from '../systems/Quality';
import { Button } from '../ui/Button';
import { Segmented, Tabs } from '../ui/controls';
import { onBack } from '../ui/nav';
import { useWorld } from '../ui/theme';
import { label } from '../ui/type';
import { BaseScene } from './BaseScene';

const SCENERIES: readonly SceneryId[] = ['hell', 'crypt', 'mainframe', 'carnival', 'crucible'];
const TIERS: ReadonlyArray<LightingTier | undefined> = [undefined, 'low', 'medium', 'high'];
const GROUPS = Object.keys(FX_LIBRARY) as Array<keyof typeof FX_LIBRARY>;
const UI_DEPTH = 30;
const BRICK_W = 30;
const BRICK_H = 16;

interface LabData {
  world?: SceneryId;
  tier?: number;
  group?: number;
  fx?: string;
}

interface LabBrick {
  img: Phaser.GameObjects.Image;
  tint: number;
  texture: string;
}

/**
 * Dev only (`?fx=lab`): every particle preset over a real backdrop and real bricks, in each world
 * and quality tier, for tuning and screenshots. Tap a brick or the field to fire the selected
 * effect; attached effects (plumes, the black hole) toggle on and off.
 */
export class FxLab extends BaseScene {
  private world: SceneryId = 'hell';
  private tierIndex = 0;
  private group = 0;
  private selected = 'brick.explode';
  private fx!: FxEngine;
  private bricks: LabBrick[] = [];
  private buttons?: Phaser.GameObjects.Container;
  private stats!: Phaser.GameObjects.Text;
  private looping = false;
  private loopTimer?: Phaser.Time.TimerEvent;
  private attached: Array<{ handle: FxHandle; stop: () => void }> = [];
  private showTimers: Phaser.Time.TimerEvent[] = [];
  private frameMs = 16.7;

  constructor() {
    super(SCENES.fxLab);
  }

  init(data: LabData): void {
    this.world = data.world ?? 'hell';
    this.tierIndex = data.tier ?? 0;
    this.group = data.group ?? 0;
    this.selected = data.fx ?? 'brick.explode';
    this.bricks = [];
    this.attached = [];
    this.looping = false;
  }

  preload(): void {
    ParallaxBackdrop.preload(this, this.world);
  }

  create(): void {
    this.setupCamera();
    this.input.enabled = true;
    const theme: WorldId = (WORLD_IDS as readonly string[]).includes(this.world) ? (this.world as WorldId) : 'hell';
    useWorld(theme);
    pinFxTier(TIERS[this.tierIndex]);
    new ParallaxBackdrop(this, this.world, 0.5).setTint(backdropTint(0.25));

    const cam = this.cameras.main;
    this.fx = new FxEngine(this, {
      world: this.world,
      hooks: {
        shake: (ms, k) => cam.shake(Math.min(ms, 260), Math.min(k * 0.4, 0.006)),
        punch: (ms, k) => cam.shake(Math.min(ms, 280), Math.min(k, 0.012)),
      },
    });

    this.buildBricks(theme);
    this.buildUi();
    onBack(this, () => this.scene.start(SCENES.title));

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length) return;
      if (p.worldY < 150 || p.worldY > this.fieldBottom) return;
      this.fire(this.selected, p.worldX, p.worldY);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      pinFxTier(undefined);
      delete (window as unknown as { fxLab?: unknown }).fxLab;
    });
    (window as unknown as { fxLab: unknown }).fxLab = {
      fire: (id: string, x = WIDTH / 2, y = this.brickTop + 30) => this.fire(id, x, y),
      select: (id: string) => this.select(id),
      showcase: () => this.showcase(),
      world: (w: SceneryId) => this.restartWith({ world: w }),
      tier: (i: number) => this.restartWith({ tier: i }),
      clear: () => this.clearAll(),
      count: () => this.fx.aliveCount(),
      ids: () => GROUPS.flatMap((g) => Object.keys(FX_LIBRARY[g])),
    };
  }

  override update(_t: number, delta: number): void {
    this.frameMs += (delta - this.frameMs) * 0.05;
    this.stats.setText(
      `${this.fx.aliveCount()} particles   ${Math.round(1000 / this.frameMs)} fps   ${this.selected}`,
    );
  }

  private get brickTop(): number {
    return 210;
  }

  private get fieldBottom(): number {
    return HEIGHT - 300;
  }

  private buildBricks(world: WorldId): void {
    const cols = 16;
    const x0 = (WIDTH - cols * (BRICK_W + 4)) / 2 + BRICK_W / 2 + 2;
    const kinds = [...BRICK_COLORS.map((c) => `brick_${c}`), 'brick_explosive', 'brick_steel'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < cols; c++) {
        const texture = kinds[(r * 5 + c * 3) % kinds.length]!;
        const img = this.add
          .image(x0 + c * (BRICK_W + 4), this.brickTop + r * (BRICK_H + 6), ...fgTexture(world, texture))
          .setDisplaySize(BRICK_W, BRICK_H)
          .setInteractive();
        const brick = { img, tint: BRICK_TINT[texture] ?? 0xffffff, texture };
        img.on(Phaser.Input.Events.POINTER_DOWN, () => this.hitBrick(brick));
        this.bricks.push(brick);
      }
    }
  }

  private buildUi(): void {
    const t = useWorld('hell');
    label(this, WIDTH / 2, 26, 'FX LAB', 18, { t }).setDepth(UI_DEPTH);
    new Segmented(
      this,
      WIDTH / 2,
      66,
      ['HELL', 'CRYPT', 'MAIN', 'CARNI', 'CRUC'],
      SCENERIES.indexOf(this.world),
      (i) => this.restartWith({ world: SCENERIES[i] }),
      { width: 560, height: 36, fontSize: 13 },
    ).setDepth(UI_DEPTH);
    new Segmented(
      this,
      WIDTH / 2,
      112,
      ['AUTO', 'LOW', 'MEDIUM', 'HIGH'],
      this.tierIndex,
      (i) => this.restartWith({ tier: i }),
      { width: 420, height: 32, fontSize: 12 },
    ).setDepth(UI_DEPTH);
    this.stats = this.add
      .text(12, 150, '', { fontFamily: 'monospace', fontSize: '12px', color: '#d8e8ff' })
      .setDepth(UI_DEPTH)
      .setShadow(1, 1, '#000', 2);

    const top = this.fieldBottom + 18;
    new Tabs(this, WIDTH / 2, top, GROUPS, this.group, (i) => {
      this.group = i;
      this.showButtons();
    }, { width: 560, fontSize: 13 }).setDepth(UI_DEPTH);
    this.showButtons();

    const y = HEIGHT - 34;
    new Button(this, 110, y, 'Showcase', () => this.showcase(), { width: 180, height: 44, variant: 'primary' }).setDepth(UI_DEPTH);
    const loop = new Button(this, WIDTH / 2 + 10, y, 'Loop: off', () => {
      this.looping = !this.looping;
      loop.label.setText(this.looping ? 'Loop: on' : 'Loop: off');
      this.loopTimer?.remove();
      if (this.looping) {
        this.loopTimer = this.time.addEvent({ delay: 900, loop: true, callback: () => this.loopOnce() });
      }
    }, { width: 150, height: 44, variant: 'secondary' }).setDepth(UI_DEPTH);
    new Button(this, WIDTH - 90, y, 'Clear', () => this.clearAll(), { width: 140, height: 44, variant: 'ghost' }).setDepth(UI_DEPTH);
  }

  private showButtons(): void {
    this.buttons?.destroy();
    const c = (this.buttons = this.add.container(0, 0).setDepth(UI_DEPTH));
    const ids = Object.keys(FX_LIBRARY[GROUPS[this.group]!]);
    const top = this.fieldBottom + 64;
    const colW = 186;
    ids.forEach((id, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const b = new Button(this, WIDTH / 2 + (col - 1) * (colW + 4), top + row * 48, id, () => this.select(id), {
        width: colW,
        height: 42,
        fontSize: 12,
        variant: id === this.selected ? 'primary' : 'secondary',
      });
      c.add(b);
    });
  }

  private select(id: string): void {
    this.selected = id;
    const g = GROUPS.findIndex((name) => id in FX_LIBRARY[name]);
    if (g >= 0) this.group = g;
    this.showButtons();
  }

  private isAttached(id: string): boolean {
    return (fxDef(id)?.layers ?? []).some((l) => l.rate !== undefined);
  }

  /** Fires `id` at (x, y): bursts play once, attached effects toggle. */
  private fire(id: string, x: number, y: number, tint?: number): void {
    if (id === 'fanfare.celebrate') {
      this.fx.play(id, WIDTH / 2, this.fieldBottom - 380);
      return;
    }
    if (this.isAttached(id)) {
      this.toggleAttached(id, x, y);
      return;
    }
    const aimed = (fxDef(id)?.layers ?? []).some((l) => l.aim);
    this.fx.play(id, x, y, {
      tint: tint ?? (id.startsWith('brick.') ? BRICK_TINT.brick_explosive : undefined),
      angle: aimed ? (id.startsWith('fanfare') ? -90 : Phaser.Math.Between(-150, -30)) : undefined,
      floor: this.fieldBottom - 6,
    });
  }

  private toggleAttached(id: string, x: number, y: number): void {
    const near = this.attached.findIndex((a) => a.handle.alive);
    if (near >= 0 && id !== 'ability.blackhole') {
      this.attached.splice(near, 1)[0]!.stop();
      return;
    }
    if (id === 'ability.blackhole') {
      const pos = { x, y };
      const pull = new Vortex(x, y, 400, 320, 200, 22);
      const handle = this.fx.attach(id, pos, { tint: ABILITY_INFO.blackhole.color, forces: [pull] });
      const spin = { a: 0 };
      const orbit = this.tweens.add({
        targets: spin,
        a: Math.PI * 2,
        duration: 4200,
        onUpdate: () => {
          pos.x = x + Math.sin(spin.a) * 40;
          pos.y = y + (1 - Math.cos(spin.a)) * 16;
          pull.x = pos.x;
          pull.y = pos.y;
        },
        onComplete: () => handle.stop(),
      });
      this.attached.push({ handle, stop: () => (handle.stop(), orbit.remove()) });
      return;
    }
    const handle = this.fx.attach(id, { x, y });
    this.attached.push({ handle, stop: () => handle.stop() });
  }

  private hitBrick(b: LabBrick): void {
    if (!b.img.visible) return;
    const id = this.selected;
    if (id.startsWith('brick.')) {
      const tint = id === 'brick.explode' ? BRICK_TINT.brick_explosive! : b.tint;
      this.fire(id, b.img.x, b.img.y, tint);
      b.img.setVisible(false);
      this.time.delayedCall(1400, () => b.img.setVisible(true).setAlpha(0).setScale(b.img.scaleX * 0.6));
      this.time.delayedCall(1400, () =>
        this.tweens.add({ targets: b.img, alpha: 1, displayWidth: BRICK_W, displayHeight: BRICK_H, duration: 260, ease: 'Back.Out' }),
      );
      return;
    }
    this.fire(id, b.img.x, b.img.y, b.tint);
  }

  private loopOnce(): void {
    const live = this.bricks.filter((b) => b.img.visible);
    const b = Phaser.Utils.Array.GetRandom(live);
    if (this.selected.startsWith('brick.') && b) this.hitBrick(b);
    else this.fire(this.selected, Phaser.Math.Between(80, WIDTH - 80), Phaser.Math.Between(this.brickTop + 100, this.fieldBottom - 60));
  }

  /** The six hero effects in a row, for screenshots and first looks. */
  private showcase(): void {
    this.clearAll();
    const pick = (i: number) => this.bricks[i]!;
    const steps: Array<[number, () => void]> = [
      [0, () => this.select('brick.explode')],
      [50, () => this.hitBrick(pick(23))],
      [700, () => this.select('brick.shatter')],
      [750, () => [5, 10, 37, 42].forEach((i) => this.hitBrick(pick(i)))],
      [1300, () => this.fire('spark.impact', 150, this.fieldBottom - 120)],
      [1450, () => this.fire('spark.impact', 450, this.fieldBottom - 160)],
      [1700, () => this.fire('fire.plume', 110, this.fieldBottom - 60)],
      [1750, () => this.fire('ability.blackhole', WIDTH / 2 + 110, this.brickTop + 210)],
      [3200, () => this.fire('fanfare.celebrate', 0, 0)],
    ];
    for (const [at, fn] of steps) this.showTimers.push(this.time.delayedCall(at, fn));
  }

  private clearAll(): void {
    for (const t of this.showTimers) t.remove();
    this.showTimers.length = 0;
    for (const a of this.attached) a.stop();
    this.attached.length = 0;
    this.fx.clear();
  }

  private restartWith(d: LabData): void {
    this.clearAll();
    this.scene.restart({ world: this.world, tier: this.tierIndex, group: this.group, fx: this.selected, ...d });
  }
}
