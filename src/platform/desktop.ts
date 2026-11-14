/** What desktop/preload.cts exposes on `window` in the Electron build. */
interface DesktopBridge {
  platform: string;
  ready(fullscreen: boolean): void;
  setFullscreen(on: boolean): void;
  isFullscreen(): Promise<boolean>;
  onFullscreenChange(fn: (on: boolean) => void): () => void;
  quit(): void;
}

const bridge =
  typeof window === 'undefined'
    ? undefined
    : (window as unknown as { superbreakerDesktop?: DesktopBridge }).superbreakerDesktop;

/** True inside the Electron app, in both `desktop:dev` and packaged builds. */
export const IS_DESKTOP = bridge !== undefined;

/** Tells the shell the game has booted, so it can show the window in the saved mode. */
export function desktopReady(fullscreen: boolean): void {
  bridge?.ready(fullscreen);
}

export function setFullscreen(on: boolean): void {
  bridge?.setFullscreen(on);
}

export function isFullscreen(): Promise<boolean> {
  return bridge?.isFullscreen() ?? Promise.resolve(false);
}

/** Calls `fn` when F11, Alt+Enter or the OS changes fullscreen. Returns an unsubscribe function. */
export function onFullscreenChange(fn: (on: boolean) => void): () => void {
  return bridge?.onFullscreenChange(fn) ?? (() => {});
}

export function quitApp(): void {
  bridge?.quit();
}
