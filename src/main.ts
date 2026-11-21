import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/orbitron/latin-700.css';
import {
  applyViewport,
  canvasSize,
  COLORS,
  FONT_FACES,
  IS_TOUCH,
  PHYSICS_FPS,
  coverScreen,
  setRenderZoom,
  viewportOffsetTop,
  viewportPixels,
} from './config';
import { mountDebugOverlay } from './platform/debugOverlay';
import { initCrazyGames, IS_CRAZYGAMES, loadingStart, onPlatformMute } from './platform/crazygames';
import { desktopReady, IS_DESKTOP, onFullscreenChange } from './platform/desktop';
import { installGamepad } from './platform/gamepad';
import { installKeyboard } from './platform/keyboard';
import { installPadCursor } from './platform/padCursor';
import { legacyLocalStorageGet } from './platform/storage';
import { setupNativeChrome } from './platform/lifecycle';
import { save } from './services';
import { audio } from './systems/AudioSystem';
import { targetZoom } from './systems/Quality';
import { RELIEF_MAX_LIGHTS } from './systems/ReliefLighting';
import { Boot } from './scenes/Boot';
import { Preload } from './scenes/Preload';
import { Title } from './scenes/Title';
import { Worlds } from './scenes/Worlds';
import { WorldPath } from './scenes/WorldPath';
import { Briefing } from './scenes/Briefing';
import { ArcadeSelect } from './scenes/ArcadeSelect';
import { Play } from './scenes/Play';
import { Hud } from './scenes/Hud';
import { Pause } from './scenes/Pause';
import { Results } from './scenes/Results';
import { Upgrades } from './scenes/Upgrades';
import { Settings } from './scenes/Settings';
import { Transition } from './scenes/Transition';
import { UiGallery } from './scenes/UiGallery';
import { FxLab } from './scenes/FxLab';

let framedW = 0;
let framedH = 0;

function stretchCanvas(game: Phaser.Game): void {
  const canvas = game.canvas;
  if (coverScreen) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.margin = '0';
    return;
  }
  if (canvas.style.width === '100%') {
    canvas.style.width = '';
    canvas.style.height = '';
    game.scale.refresh();
  }
}

/** Pin the stage to the visible viewport and grow the playfield so FIT has nothing to letterbox. */
function syncStage(game?: Phaser.Game): void {
  const { w, h } = viewportPixels();
  if (w <= 0 || h <= 0) return;
  const top = viewportOffsetTop();
  const stage = document.getElementById('game');
  if (stage) {
    stage.style.top = `${top}px`;
    stage.style.left = '0';
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
  }
  // Ignore 1px visual-viewport jitter so the paddle doesn't jump while the page scrolls.
  const relayout = framedW === 0 || Math.abs(w - framedW) >= 8 || Math.abs(h - framedH) >= 32;
  if (relayout) {
    framedW = w;
    framedH = h;
    applyViewport(w, h);
    // setGameSize, not resize: under FIT only it updates the aspect ratio the canvas is fitted to.
    // Phaser fits to its cached parent size, which still holds the old viewport at this point.
    if (game) {
      game.scale.getParentBounds();
      game.scale.setGameSize(canvasSize().w, canvasSize().h);
    }
  }
  if (game) stretchCanvas(game);
}

function requestCoverFullscreen(): void {
  // CrazyGames puts its own fullscreen control on the page frame and rejects games that bring
  // their own, because a game-owned fullscreen breaks their ads and orientation handling.
  if (IS_CRAZYGAMES) return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const go = () => {
    if (document.fullscreenElement) return;
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!req) return;
    void Promise.resolve(req()).catch(() => {});
  };
  document.addEventListener('pointerdown', go, { once: true });
}

/**
 * Phaser builds a separate shader for every texture count a batch happens to use, so a new count
 * mid-level linked a program on the spot: an 80-350 ms hitch. Multi-texture batches all take the
 * full-count shader instead, as in Phaser 3, which leaves a couple of variants that the first
 * frames compile.
 */
function pinBatchTextureCount(): void {
  const proto = Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad.prototype;
  const finalize = proto.finalizeTextureCount;
  proto.finalizeTextureCount = function (this: typeof proto, count: number) {
    finalize.call(this, count > 1 ? this.maxTexturesPerBatch : count);
  };
}

/** Median requestAnimationFrame interval over a few frames, to spot 120Hz screens. */
function measureFrameMs(frames = 8): Promise<number> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let last = 0;
    const tick = (t: number) => {
      if (last) deltas.push(t - last);
      last = t;
      if (deltas.length < frames) requestAnimationFrame(tick);
      else resolve(deltas.sort((a, b) => a - b)[deltas.length >> 1]!);
    };
    requestAnimationFrame(tick);
  });
}

/** Canvas text and the glyph atlases are drawn once, so the faces must be ready first. */
function loadFonts(timeoutMs = 2500): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const all = Promise.all(FONT_FACES.map((f) => document.fonts.load(f))).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([all, timeout]).catch(() => undefined);
}

async function start(): Promise<void> {
  // First, and awaited: until the SDK is up the save store has no account storage to read from.
  await initCrazyGames();
  if (IS_CRAZYGAMES) {
    loadingStart();
    onPlatformMute((on) => audio.setPlatformMute(on));
    // Their page asks the player to rotate, per the orientations set on the submission.
    document.getElementById('rotate')?.remove();
  }
  await Promise.all([save.load(legacyLocalStorageGet), loadFonts()]);
  if (IS_DESKTOP) {
    // Before measuring frames: the shell keeps the window hidden until this call.
    desktopReady(save.state.settings.fullscreen);
    onFullscreenChange((on) => save.update((d) => (d.settings.fullscreen = on)));
  }
  const frameMs = await measureFrameMs();
  setRenderZoom(targetZoom());
  syncStage();
  // A 120Hz phone would otherwise draw every frame twice as often for the same game. The limit
  // sits above 60 because Phaser's limiter skips a frame whenever rAF jitter lands under it.
  const fpsLimit = IS_TOUCH && frameMs < 10 ? 65 : 0;

  const size = canvasSize();
  pinBatchTextureCount();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: size.w,
    height: size.h,
    backgroundColor: COLORS.bg,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 2 },
    fps: { limit: fpsLimit },
    physics: {
      default: 'arcade',
      // Rebuilding the RTree every step costs more than brute force at a few hundred bodies.
      arcade: { fps: PHYSICS_FPS, gravity: { x: 0, y: 0 }, debug: false, useTree: false },
    },
    render: {
      antialias: true,
      // Multisampling buys nothing for sprites at 2x and costs fill rate on phones.
      antialiasGL: false,
      roundPixels: false,
      powerPreference: 'high-performance',
      // Phaser drops to one texture per batch on phones by default, which turned every brick
      // colour change into its own draw call (~95 per frame instead of ~14).
      autoMobileTextures: false,
      maxLights: RELIEF_MAX_LIGHTS,
      maxTextures: IS_TOUCH ? 8 : -1,
    },
    scene: [
      Boot,
      Preload,
      Title,
      Worlds,
      WorldPath,
      ArcadeSelect,
      Play,
      Hud,
      Briefing,
      Pause,
      Results,
      Upgrades,
      Settings,
      ...(import.meta.env.DEV ? [UiGallery, FxLab] : []),
      // Last, so it draws over every other scene.
      Transition,
    ],
  });
  audio.init(game);
  // The cursor reads the pad state each step, so the poller must hook PRE_STEP first.
  installGamepad(game);
  installPadCursor(game);
  installKeyboard();
  syncStage(game);
  game.scale.on(Phaser.Scale.Events.RESIZE, () => stretchCanvas(game));
  window.visualViewport?.addEventListener('resize', () => syncStage(game));
  window.addEventListener('resize', () => syncStage(game));
  requestCoverFullscreen();
  void setupNativeChrome();
  mountDebugOverlay(game);

  if (import.meta.env.DEV) {
    (window as unknown as { game: Phaser.Game }).game = game;
  }
}

// The desktop app serves its files from disk, and CrazyGames serves the bundle from their own
// CDN inside an iframe, so neither has anything to cache.
const SELF_HOSTED = import.meta.env.MODE !== 'desktop' && import.meta.env.MODE !== 'crazygames';
if ('serviceWorker' in navigator && import.meta.env.PROD && SELF_HOSTED) {
  registerSW({ immediate: true });
}

void start();
