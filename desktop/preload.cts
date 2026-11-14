// CommonJS (.cts) because sandboxed preloads can't be ES modules.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('superbreakerDesktop', {
  platform: process.platform,
  ready: (fullscreen: boolean) => ipcRenderer.send('window:ready', fullscreen),
  setFullscreen: (on: boolean) => ipcRenderer.send('window:set-fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen') as Promise<boolean>,
  onFullscreenChange: (fn: (on: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, on: boolean) => fn(on);
    ipcRenderer.on('window:fullscreen', handler);
    return () => {
      ipcRenderer.off('window:fullscreen', handler);
    };
  },
  quit: () => ipcRenderer.send('app:quit'),
});
