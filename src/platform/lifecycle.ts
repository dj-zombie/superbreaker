import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

type Listener = () => void;
const listeners = new Set<Listener>();
let installed = false;

function notify(): void {
  for (const l of listeners) l();
}

function install(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) notify();
  });
  window.addEventListener('blur', notify);
  if (Capacitor.isNativePlatform()) {
    void App.addListener('pause', notify);
  }
}

/** Calls `fn` whenever the app is backgrounded. Returns an unsubscribe function. */
export function onAppBackground(fn: Listener): () => void {
  install();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function setupNativeChrome(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const [{ StatusBar }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  await StatusBar.hide().catch(() => {});
  await SplashScreen.hide().catch(() => {});
}
