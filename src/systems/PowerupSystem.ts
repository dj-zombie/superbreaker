import Phaser from 'phaser';
import { playPickupLoop } from '../art/pickups';
import { HYPER_DURATION_MS, LOSE_Y, PIERCE_DURATION_MS, POWERUP_INFO } from '../config';
import { DropDirector, powerupStats, type DropContext } from '../core/Economy';
import type { PowerupId } from '../core/types';
import { save } from '../services';
import { audio } from './AudioSystem';

export type TimedEffect = 'magnet' | 'fireball' | 'laser' | 'hyper' | 'pierce';
export const TIMED_EFFECTS: TimedEffect[] = ['fireball', 'pierce', 'laser', 'magnet', 'hyper'];

export interface ActiveEffect {
  id: TimedEffect;
  remainingMs: number;
  totalMs: number;
}

export interface PowerupHost {
  spawnExtraBalls(count: number): void;
  resizePaddle(mult: number): void;
  addLife(): boolean;
  addCoin(x: number, y: number): void;
  enableShield(): void;
  onEffectsChanged(): void;
  onPickup(id: PowerupId, x: number, y: number): void;
  grantMystery(x: number, y: number): void;
  /** A pickup started falling. */
  onSpawned?(pickup: Pickup): void;
  /** The field right now, for the drop director. */
  dropContext(): DropContext;
}

export class Pickup extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: PowerupId,
  ) {
    super(scene, x, y, POWERUP_INFO[kind].texture);
    scene.add.existing(this);
    this.setDepth(6);
    // Before the body exists, which takes its size from the current frame.
    playPickupLoop(this, kind);
  }
}

/** Drops, pickups and the timers for active powerups. */
export class PowerupSystem {
  readonly group: Phaser.Physics.Arcade.Group;
  private effects = new Map<TimedEffect, ActiveEffect>();
  private drops = new DropDirector();
  magnetCharges = 0;

  constructor(
    private scene: Phaser.Scene,
    private host: PowerupHost,
  ) {
    this.group = scene.physics.add.group({ allowGravity: true });
  }

  is(id: TimedEffect): boolean {
    return this.effects.has(id);
  }

  /** The running timer for `id`, if it is active. */
  effect(id: TimedEffect): Readonly<ActiveEffect> | undefined {
    return this.effects.get(id);
  }

  get active(): ActiveEffect[] {
    return TIMED_EFFECTS.flatMap((id) => {
      const e = this.effects.get(id);
      return e ? [e] : [];
    });
  }

  /** `noMystery` stops ability kills from snowballing into more abilities. */
  maybeDrop(x: number, y: number, fixed?: PowerupId, noMystery = false): void {
    let id = fixed ?? this.drops.roll(this.host.dropContext());
    if (!id) return;
    if (id === 'magnet' && this.is('magnet') && !fixed) id = 'coin';
    if (id === 'mystery' && noMystery && !fixed) id = 'coin';
    const p = new Pickup(this.scene, x, y, id);
    this.group.add(p);
    const info = POWERUP_INFO[id];
    if (id === 'coin') {
      p.setScale(0.9);
      if (this.scene.anims.exists('coin-spin')) p.play('coin-spin');
    } else {
      p.setScale(34 / Math.max(p.width, p.height));
    }
    p.body.setGravityY(info.fallSpeed);
    p.body.setVelocityY(40);
    p.setAlpha(0);
    this.scene.tweens.add({ targets: p, alpha: 1, duration: 300 });
    if (id !== 'coin') {
      this.scene.tweens.add({
        targets: p,
        angle: { from: -12, to: 12 },
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    this.host.onSpawned?.(p);
  }

  collect(p: Pickup): void {
    const { x, y, kind } = p;
    p.destroy();
    this.host.onPickup(kind, x, y);
    this.apply(kind, x, y);
  }

  apply(id: PowerupId, x: number, y: number): void {
    const stats = powerupStats(save.state.upgrades);
    switch (id) {
      case 'magnet':
        this.magnetCharges = stats.magnetCharges;
        this.start('magnet', stats.magnetDurationMs);
        break;
      case 'fireball':
        this.effects.delete('pierce');
        this.start('fireball', stats.fireballDurationMs);
        break;
      case 'laser':
        this.start('laser', stats.laserDurationMs);
        break;
      case 'hyper':
        this.start('hyper', HYPER_DURATION_MS);
        break;
      case 'pierce':
        if (!this.is('fireball')) this.start('pierce', PIERCE_DURATION_MS);
        break;
      case 'balls':
        this.host.spawnExtraBalls(2);
        break;
      case 'bigger':
        this.host.resizePaddle(1.25);
        break;
      case 'smaller':
        this.host.resizePaddle(0.75);
        break;
      case 'coin':
        this.host.addCoin(x, y);
        break;
      case 'extraLife':
        this.host.addLife();
        break;
      case 'shield':
        this.host.enableShield();
        break;
      case 'mystery':
        this.host.grantMystery(x, y);
        break;
    }
    this.host.onEffectsChanged();
  }

  /** Uses one magnet catch; ends the magnet when charges run out. */
  consumeMagnet(): void {
    this.magnetCharges--;
    if (this.magnetCharges <= 0) {
      this.effects.delete('magnet');
      this.host.onEffectsChanged();
    }
  }

  update(dtMs: number): void {
    let changed = false;
    for (const [id, e] of this.effects) {
      e.remainingMs -= dtMs;
      if (e.remainingMs <= 0) {
        this.effects.delete(id);
        changed = true;
      }
    }
    if (changed) {
      audio.sfx('sfx_timeout', 0.35);
      this.host.onEffectsChanged();
    }
    for (const p of this.group.getChildren() as Pickup[]) {
      if (p.y > LOSE_Y + 10) p.destroy();
    }
  }

  clear(): void {
    this.effects.clear();
    this.magnetCharges = 0;
    this.group.clear(true, true);
    this.host.onEffectsChanged();
  }

  /** Runs a timed effect for `ms` without a pickup, as a bonus stage's finale does. 0 ends it. */
  grant(id: TimedEffect, ms: number): void {
    if (ms > 0) {
      if (id === 'fireball') this.effects.delete('pierce');
      this.start(id, ms);
    } else if (!this.effects.delete(id)) {
      return;
    }
    this.host.onEffectsChanged();
  }

  private start(id: TimedEffect, ms: number): void {
    const cur = this.effects.get(id);
    // Re-collecting refreshes the timer rather than stacking forever.
    this.effects.set(id, { id, remainingMs: Math.max(ms, cur?.remainingMs ?? 0), totalMs: ms });
  }
}
