import Phaser from 'phaser';
import { WORLD_IDS, worldForLevel, type WorldId } from '../art/backdrops';
import { SCENES } from '../config';
import type { BossStop } from '../core/Campaign';
import type { LevelSpec } from '../core/types';
import type { PlayData } from '../scenes/Play';
import { campaignIndexOf, levelFromPayload, type CachedResolvers, type EditorPayload } from './payload';

/**
 * Every line the dock reads starts with this: `ready`, then `warn <text>` or `error <text>`,
 * which it files in Tiled's Issues panel.
 */
const TAG = '[sb-editor]';

export interface EditorHost {
  load(payload: EditorPayload): void;
}

declare global {
  interface Window {
    sbEditor?: EditorHost;
  }
}

/** Dev only: `?editor` hands the game to the Tiled fork's Live Preview dock. */
export function editorMode(): boolean {
  return import.meta.env.DEV && new URLSearchParams(location.search).has('editor');
}

/** A campaign map plays in its own world; any other in `?world=`'s, or Hell's. */
function previewWorld(index: number | undefined): WorldId {
  if (index) return worldForLevel(index);
  const w = new URLSearchParams(location.search).get('world');
  return WORLD_IDS.find((id) => id === w) ?? 'hell';
}

/**
 * Takes the pushed map into Play, from the waiting screen, a menu over it, or the last push.
 * Transition stays: it is always on, and stopping it leaves its resize handler on destroyed wipes.
 */
function startPreview(game: Phaser.Game, data: PlayData): void {
  for (const scene of game.scene.getScenes(false)) {
    const key = scene.scene.key;
    if (key === SCENES.play || key === SCENES.hud || key === SCENES.transition) continue;
    if (scene.scene.isActive() || scene.scene.isPaused()) scene.scene.stop();
  }
  const play = game.scene.getScene(SCENES.play);
  if (play?.scene.isActive() || play?.scene.isPaused()) play.scene.restart(data);
  else game.scene.start(SCENES.play, data);
}

export function installEditorHost(game: Phaser.Game, cached: CachedResolvers): void {
  window.sbEditor = {
    load(payload) {
      try {
        const { level, warnings } = levelFromPayload(payload, cached);
        for (const w of warnings) console.warn(`${TAG} warn ${w}`);
        const levels = (game.registry.get('levels') as LevelSpec[] | undefined) ?? [];
        const stops = (game.registry.get('bossStops') as BossStop[] | undefined) ?? [];
        const index = campaignIndexOf(level.id, levels, stops);
        startPreview(game, { index: index ?? 1, editor: { level, world: previewWorld(index) } });
      } catch (e) {
        console.error(`${TAG} error ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
  console.info(`${TAG} ready`);
}
