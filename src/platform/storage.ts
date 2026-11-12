import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { KeyValueStorage } from '../core/SaveStore';

const webStorage: KeyValueStorage = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or quota exceeded: progress just won't persist.
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const nativeStorage: KeyValueStorage = {
  async get(key) {
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    await Preferences.set({ key, value });
  },
  async remove(key) {
    await Preferences.remove({ key });
  },
};

export function createStorage(): KeyValueStorage {
  return Capacitor.isNativePlatform() ? nativeStorage : webStorage;
}

/** Synchronous getter for the pre-2.0 Cordova build's localStorage keys. */
export function legacyLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
