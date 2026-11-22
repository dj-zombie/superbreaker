import Phaser from 'phaser';
import type { BallLike, ElementEvent } from '../bricks';
import { asChannel, CHANNEL_COLORS } from '../core/bricks/gates';
import { asLink, LINK_COLORS } from '../core/bricks/portal';
import { VIRUS_COLOR } from '../core/bricks/virus';
import type { Ball } from '../entities/Ball';
import type { Brick } from '../entities/Brick';
import type { FxEngine } from '../fx';
import { save } from '../services';
import { audio } from './AudioSystem';
import type { BallFx } from './BallFx';
import type { JuiceSystem } from './JuiceSystem';
import type { Light, LightingSystem } from './LightingSystem';

export interface ElementFxHost {
  scene: Phaser.Scene;
  fx: FxEngine;
  lighting: LightingSystem;
  juice: JuiceSystem;
  ballFx: BallFx;
  addScore(n: number): void;
}

/** Shortest gap between two plays of one element sound, so a row flipping at once is one cue. */
const SFX_GAP_MS: Record<string, number> = {
  brick_phantom_in: 220,
  brick_phantom_out: 220,
  brick_gate_open: 90,
  brick_gate_close: 90,
  brick_fuse: 60,
};
/** Turns per second of a portal's swirl. */
const SWIRL_SPEED = 0.6;
/** The swirl drawn over a 30x32 portal's vortex. */
const SWIRL_SCALE = 0.26;
const SWIRL_ALPHA = 0.75;

const follow = (b: Brick, live: () => boolean) => ({
  get x() {
    return b.x;
  },
  get y() {
    return b.y;
  },
  get active() {
    return live();
  },
});

/**
 * What the level elements look and sound like in play: the lights on switches, portals and virus
 * cores, the portal swirls, and the sound, light, FX and score for each ElementEvent.
 */
export class ElementFx {
  private lights: Array<{ brick: Brick; light: Light }> = [];
  private swirls: Array<{ brick: Brick; img: Phaser.GameObjects.Image; scale0: number }> = [];
  private sfxAt = new Map<string, number>();

  constructor(private host: ElementFxHost) {}

  /** Bricks were built: light the emissive elements and give portals their swirl. */
  dress(bricks: readonly Brick[]): void {
    const { lighting, scene, fx } = this.host;
    for (const b of bricks) {
      if (b.owner || b.spec.light) continue;
      const glow = this.glowOf(b);
      if (glow) {
        this.lights.push({
          brick: b,
          light: lighting.addLight({
            follow: b,
            color: glow.color,
            radius: glow.radius,
            intensity: glow.intensity,
            flicker: b.kind === 'portal' ? 'breathe' : 'pulse',
            speed: 0.7,
            phase: b.spec.id * 0.29,
            priority: 4,
          }),
        });
      }
      if (b.kind === 'portal') {
        const img = scene.add
          .image(b.x, b.y, 'portal_swirl')
          .setTint(LINK_COLORS[asLink(b.spec.props?.link)])
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(SWIRL_SCALE)
          .setAlpha(SWIRL_ALPHA)
          .setDepth(b.depth + 0.1)
          .setRotation(b.spec.id);
        this.swirls.push({ brick: b, img, scale0: b.scaleX });
        fx.attach(
          'brick.portal_idle',
          follow(b, () => b.isAlive),
          { tint: LINK_COLORS[asLink(b.spec.props?.link)], w: b.displayWidth, h: b.displayHeight },
        );
      } else if (b.kind === 'virus' && b.spec.props?.source) {
        fx.attach(
          'brick.virus_idle',
          follow(b, () => b.isAlive),
          {
            tint: VIRUS_COLOR,
            w: b.displayWidth,
            h: b.displayHeight,
          },
        );
      }
    }
  }

  on(e: ElementEvent): void {
    const { fx, lighting, juice } = this.host;
    switch (e.type) {
      case 'fuseLit': {
        const b = e.brick;
        fx.play('brick.fuse_lit', b.x, b.y, {
          tint: 0xffa12e,
          w: b.displayWidth,
          h: b.displayHeight,
          quiet: true,
        });
        lighting.flash(b.x, b.y, 0xffa12e, 70, 260, 0.5);
        this.sfx('brick_fuse', 0.45, b.x);
        break;
      }
      case 'fuseStep': {
        const b = e.brick;
        fx.play('brick.fuse_step', b.x, b.y, {
          tint: 0xffa12e,
          w: b.displayWidth,
          h: b.displayHeight,
          quiet: true,
        });
        lighting.flash(b.x, b.y, 0xffc46a, 50, 160, 0.4);
        break;
      }
      case 'phantom': {
        const b = e.brick;
        if (e.solid)
          fx.play('brick.phantom', b.x, b.y, {
            tint: b.tintColor,
            w: b.displayWidth,
            h: b.displayHeight,
            quiet: true,
          });
        this.sfx(e.solid ? 'brick_phantom_in' : 'brick_phantom_out', 0.18, b.x);
        break;
      }
      case 'switch': {
        const b = e.brick;
        const color = CHANNEL_COLORS[e.channel];
        fx.play('brick.switch', b.x, b.y, {
          tint: color,
          w: b.displayWidth,
          h: b.displayHeight,
          quiet: true,
        });
        lighting.flash(b.x, b.y, color, 120, 420, 0.8, 1.3);
        juice.shake(70, 0.003);
        this.sfx('brick_switch', 0.5, b.x);
        break;
      }
      case 'gate': {
        const b = e.brick;
        const color = CHANNEL_COLORS[asChannel(b.spec.props?.channel)];
        fx.play('brick.gate', b.x, b.y, {
          tint: color,
          w: b.displayWidth,
          h: b.displayHeight,
          quiet: true,
        });
        this.sfx(e.open ? 'brick_gate_open' : 'brick_gate_close', 0.35, b.x);
        break;
      }
      case 'portal':
        this.warp(e.from, e.to, e.ball);
        break;
      case 'infecting':
        fx.attach(
          'brick.virus_veins',
          follow(e.brick, () => e.brick.isAlive && e.brick.infecting),
          {
            tint: VIRUS_COLOR,
            w: e.brick.displayWidth,
            h: e.brick.displayHeight,
          },
        );
        this.sfx('brick_virus_spread', 0.3, e.brick.x);
        break;
      case 'infected': {
        const b = e.brick;
        fx.play('brick.virus_turn', b.x, b.y, {
          tint: VIRUS_COLOR,
          w: b.displayWidth,
          h: b.displayHeight,
          quiet: true,
        });
        lighting.flash(b.x, b.y, VIRUS_COLOR, 70, 300, 0.5);
        this.lights.push({
          brick: b,
          light: lighting.addLight({
            follow: b,
            color: VIRUS_COLOR,
            radius: 34,
            intensity: 0.22,
            flicker: 'pulse',
            priority: 3,
          }),
        });
        break;
      }
      case 'purged':
        this.host.addScore(e.bonus);
        fx.play('brick.purge', e.x, e.y, { tint: VIRUS_COLOR });
        lighting.flash(e.x, e.y, VIRUS_COLOR, 180, 700, 0.9, 1.4);
        juice.popText(e.x, e.y - 14, `PURGED +${e.bonus}`, '#b6ff6a', 22, 1.3);
        audio.sfx('brick_virus_purge', 0.6, 0, { x: e.x });
        break;
    }
  }

  /** Spins the portal swirls and lets go of the lights and swirls of dead bricks. */
  update(dtMs: number): void {
    const turn =
      (dtMs / 1000) * SWIRL_SPEED * Math.PI * 2 * (save.state.settings.reducedMotion ? 0.3 : 1);
    this.swirls = this.swirls.filter(({ brick, img, scale0 }) => {
      if (!brick.scene || (!brick.isAlive && !brick.visible)) {
        img.destroy();
        return false;
      }
      img.setPosition(brick.x, brick.y);
      img.setAlpha(brick.alpha * SWIRL_ALPHA);
      img.setScale((SWIRL_SCALE * brick.scaleX) / scale0);
      img.rotation -= turn;
      return true;
    });
    this.lights = this.lights.filter(({ brick, light }) => {
      if (brick.scene && brick.isAlive) return true;
      light.kill();
      return false;
    });
  }

  destroy(): void {
    for (const { img } of this.swirls) img.destroy();
    for (const { light } of this.lights) light.kill();
    this.swirls = [];
    this.lights = [];
  }

  private glowOf(b: Brick): { color: number; radius: number; intensity: number } | undefined {
    switch (b.kind) {
      case 'switch':
        return {
          color: CHANNEL_COLORS[asChannel(b.spec.props?.channel)],
          radius: 46,
          intensity: 0.4,
        };
      case 'portal':
        return { color: LINK_COLORS[asLink(b.spec.props?.link)], radius: 70, intensity: 0.6 };
      case 'virus':
        return b.spec.props?.source
          ? { color: VIRUS_COLOR, radius: 60, intensity: 0.45 }
          : { color: VIRUS_COLOR, radius: 34, intensity: 0.22 };
      default:
        return undefined;
    }
  }

  private warp(from: Brick, to: Brick, ball: BallLike): void {
    const { fx, lighting, ballFx } = this.host;
    const color = LINK_COLORS[asLink(from.spec.props?.link)];
    for (const p of [from, to]) {
      fx.play('brick.portal', p.x, p.y, { tint: color, quiet: true });
      lighting.flash(p.x, p.y, color, 90, 260, 0.7);
    }
    ballFx.cut(ball as Ball);
    this.sfx('brick_portal', 0.45, to.x);
  }

  private sfx(key: string, vol: number, x: number): void {
    const now = this.host.scene.time.now;
    const gap = SFX_GAP_MS[key] ?? 0;
    if (now - (this.sfxAt.get(key) ?? -Infinity) < gap) return;
    this.sfxAt.set(key, now);
    audio.sfx(key, vol, Phaser.Math.Between(-60, 60), { x });
  }
}
