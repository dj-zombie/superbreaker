import Phaser from 'phaser';
import { RENDER_ZOOM, SCENES } from '../config';
import { BossDirector } from '../systems/BossDirector';
import { LightingSystem } from '../systems/LightingSystem';

/** Dev builds only: the running boss fight in one line, or nothing without one. */
function bossLine(): string {
  const boss = import.meta.env.DEV ? BossDirector.current : undefined;
  if (!boss) return '';
  const { state, def } = boss;
  return (
    `\nboss ${def.id}  ${state.step}  phase ${state.phase + 1}/${def.phases.length}  ` +
    `pool ${state.pool.toFixed(1)}/${state.poolMax}  embedded ${boss.embedded}` +
    `\n${state.window}  ${state.attack ?? '-'}  hazards ${boss.hazardCount}`
  );
}

/**
 * `?debug` in the URL shows frame rate, CPU time per frame, physics bodies, live particles, render
 * zoom and the lighting tier, light count and light map cost, refreshed twice a second. Meant for
 * checking a real phone against `pnpm preview --host`. A dev build adds the boss fight's state.
 */
export function mountDebugOverlay(game: Phaser.Game): void {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'right:4px',
    'top:calc(env(safe-area-inset-top) + 52px)',
    'z-index:9999',
    'padding:4px 6px',
    'font:11px/1.35 ui-monospace,Menlo,monospace',
    'color:#9ff',
    'background:rgba(0,0,0,.6)',
    'border-radius:4px',
    'pointer-events:none',
    'white-space:pre',
  ].join(';');
  document.body.appendChild(el);

  let frames = 0;
  let cpu = 0;
  let worst = 0;
  let stepStart = 0;
  game.events.on(Phaser.Core.Events.PRE_STEP, () => {
    stepStart = performance.now();
  });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    const ms = performance.now() - stepStart;
    frames++;
    cpu += ms;
    worst = Math.max(worst, ms);
  });

  window.setInterval(() => {
    const play = game.scene.getScene(SCENES.play);
    let bodies = 0;
    let particles = 0;
    if (play && game.scene.isActive(SCENES.play)) {
      bodies = play.physics.world.bodies.size;
      for (const o of play.children.list) {
        if (o instanceof Phaser.GameObjects.Particles.ParticleEmitter) {
          particles += o.getAliveParticleCount();
        }
      }
    }
    const avg = frames ? cpu / frames : 0;
    const lighting = LightingSystem.current;
    const light = lighting?.enabled
      ? `\nlight ${lighting.stats.tier}  ${lighting.stats.drawn}/${lighting.stats.lights} drawn  ` +
        `map ${lighting.stats.map}  ${lighting.stats.ms.toFixed(2)}ms`
      : '';
    el.textContent =
      `${game.loop.actualFps.toFixed(0)} fps  cpu ${avg.toFixed(1)}ms (max ${worst.toFixed(0)})\n` +
      `bodies ${bodies}  particles ${particles}\n` +
      `zoom ${RENDER_ZOOM}  canvas ${game.canvas.width}x${game.canvas.height}` +
      light +
      bossLine();
    frames = 0;
    cpu = 0;
    worst = 0;
  }, 500);
}
