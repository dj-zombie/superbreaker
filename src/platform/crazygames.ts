/**
 * CrazyGames bridge. The game runs in an iframe on their domain, so the SDK only ships in the
 * `crazygames` bundle; every other build leaves `IS_CRAZYGAMES` false and the calls here return
 * straight away. In dev, `?crazy=1` loads the SDK in its local mode, where it logs the events and
 * draws placeholder ads.
 *
 * Nothing here throws. The SDK is disabled on any domain that isn't theirs, and a blocked script
 * or a failed call must not take the game down with it.
 */
import type { KeyValueStorage } from '../core/SaveStore';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * Ads are disabled for Basic Launch and only earn revenue after a game is promoted to Full
 * Launch. Until then `midgameAd` returns without a break, so the game never stalls on a request
 * that can't be filled. Flip this on for the Full Launch submission.
 */
export const ADS_ENABLED = false;

type Environment = 'local' | 'crazygames' | 'disabled';
type AdType = 'midgame' | 'rewarded';

interface GameSettings {
  disableChat: boolean;
  /** Set from the mute button on the CrazyGames page frame. It outranks our own audio settings. */
  muteAudio: boolean;
}

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

/** Only the parts of the v3 SDK this game uses. */
interface Sdk {
  init(): Promise<void>;
  environment: Environment;
  game: {
    settings: GameSettings;
    addSettingsChangeListener(fn: (settings: GameSettings) => void): void;
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    reportGameCompletedPercentage(percentage: number): void;
  };
  ad: {
    requestAd(type: AdType, callbacks: AdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

function wanted(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.MODE === 'crazygames') return true;
  return import.meta.env.DEV && new URLSearchParams(location.search).has('crazy');
}

export const IS_CRAZYGAMES = wanted();

/** Set once the SDK has initialized on a domain where it works. Undefined means every call no-ops. */
let sdk: Sdk | undefined;
let initCall: Promise<void> | undefined;

function globalSdk(): Sdk | undefined {
  return (window as unknown as { CrazyGames?: { SDK?: Sdk } }).CrazyGames?.SDK;
}

function loadScript(): Promise<Sdk> {
  const loaded = globalSdk();
  if (loaded) return Promise.resolve(loaded);
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SDK_URL;
    el.onload = () => {
      const api = globalSdk();
      if (api) resolve(api);
      else reject(new Error('CrazyGames SDK did not register itself'));
    };
    el.onerror = () => reject(new Error('CrazyGames SDK failed to load'));
    document.head.appendChild(el);
  });
}

async function boot(): Promise<void> {
  try {
    const api = await loadScript();
    await api.init();
    // `disabled` is every domain that isn't theirs or localhost. Its methods all throw.
    if (api.environment === 'disabled') return;
    sdk = api;
    api.game.addSettingsChangeListener((settings) => setPageMute(settings.muteAudio === true));
    setPageMute(api.game.settings?.muteAudio === true);
  } catch (e) {
    console.warn('[crazygames] running without the SDK:', e);
  }
}

/**
 * Loads and initializes the SDK. Await this before reading saved data or reporting any event:
 * until it resolves the data module is unavailable and every call below does nothing.
 */
export function initCrazyGames(): Promise<void> {
  if (!IS_CRAZYGAMES) return Promise.resolve();
  initCall ??= boot();
  return initCall;
}

/** Runs `fn` against the SDK if it is usable, swallowing anything it throws. */
function call(fn: (api: Sdk) => void): void {
  if (!sdk) return;
  try {
    fn(sdk);
  } catch (e) {
    console.warn('[crazygames] call failed:', e);
  }
}

// ---------------------------------------------------------------- muting

type MuteListener = (muted: boolean) => void;

const muteListeners = new Set<MuteListener>();
/** The mute button on their page frame. */
let pageMute = false;
/** Held while a video ad plays, so its audio doesn't fight the game's. */
let adMute = false;
let announced = false;

function muted(): boolean {
  return pageMute || adMute;
}

function announce(): void {
  const now = muted();
  if (now === announced) return;
  announced = now;
  for (const fn of muteListeners) fn(now);
}

function setPageMute(on: boolean): void {
  pageMute = on;
  announce();
}

function setAdMute(on: boolean): void {
  adMute = on;
  announce();
}

/**
 * Calls `fn` whenever the platform wants the game silent, and once with the current state.
 * Returns an unsubscribe function.
 */
export function onPlatformMute(fn: MuteListener): () => void {
  muteListeners.add(fn);
  fn(muted());
  return () => muteListeners.delete(fn);
}

// ---------------------------------------------------------------- game events

/** Their loading timer. Starts as early as the SDK allows and closes when the assets are in. */
export function loadingStart(): void {
  call((api) => api.game.loadingStart());
}

export function loadingStop(): void {
  call((api) => api.game.loadingStop());
}

/** Tracks whether a gameplay span is open, so a resumed scene can't report two starts. */
let playing = false;

/**
 * Opens a gameplay span: a level starting, resuming from pause, or the next level. The first call
 * is also what CrazyGames measures the initial download size against, so it must not fire on a
 * menu.
 */
export function gameplayStart(): void {
  if (playing) return;
  playing = true;
  call((api) => api.game.gameplayStart());
}

/** Closes the span: pause, results, or leaving a level. Not for focus loss, which they handle. */
export function gameplayStop(): void {
  if (!playing) return;
  playing = false;
  call((api) => api.game.gameplayStop());
}

/** Makes their page celebrate. Saved for finishing a world, so it stays a rare thing. */
export function celebrate(): void {
  call((api) => api.game.happytime());
}

/** Campaign progress, 0..100. Reported on load and after every clear. */
export function reportProgress(percent: number): void {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  call((api) => api.game.reportGameCompletedPercentage(clamped));
}

// ---------------------------------------------------------------- ads

/**
 * Plays a between-levels ad. Resolves when the break is over whether an ad ran or not: unfilled
 * requests, ad blockers and cooldowns all come back as errors that the game has to carry on from.
 * The caller must block input for the whole wait, and the audio mutes itself via `onPlatformMute`.
 */
export function midgameAd(): Promise<void> {
  const api = sdk;
  if (!api || !ADS_ENABLED) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setAdMute(false);
      resolve();
    };
    try {
      api.ad.requestAd('midgame', {
        adStarted: () => setAdMute(true),
        adFinished: finish,
        adError: finish,
      });
    } catch (e) {
      console.warn('[crazygames] ad request failed:', e);
      finish();
    }
  });
}

/** True only when the ad played through, which is the only case that may hand out a reward. */
export function rewardedAd(): Promise<boolean> {
  const api = sdk;
  if (!api || !ADS_ENABLED) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (rewarded: boolean) => {
      if (settled) return;
      settled = true;
      setAdMute(false);
      resolve(rewarded);
    };
    try {
      api.ad.requestAd('rewarded', {
        adStarted: () => setAdMute(true),
        adFinished: () => finish(true),
        adError: () => finish(false),
      });
    } catch (e) {
      console.warn('[crazygames] ad request failed:', e);
      finish(false);
    }
  });
}

// ---------------------------------------------------------------- saved data

/**
 * Their data module, which mirrors the localStorage API and syncs to the player's account across
 * devices. Undefined until the SDK is up, so `storage.ts` keeps localStorage as the fallback.
 */
export function crazyData(): Sdk['data'] | undefined {
  return sdk?.data;
}

/**
 * Account-synced storage, falling back to localStorage before the SDK is ready and for guests.
 * A player who started before this build has their save in localStorage only, so the first read
 * copies it across.
 */
export function crazyStorage(local: KeyValueStorage): KeyValueStorage {
  return {
    async get(key) {
      const data = crazyData();
      if (!data) return local.get(key);
      try {
        const synced = data.getItem(key);
        if (synced !== null) return synced;
        const carried = await local.get(key);
        if (carried !== null) data.setItem(key, carried);
        return carried;
      } catch (e) {
        console.warn('[crazygames] data read failed:', e);
        return local.get(key);
      }
    },
    async set(key, value) {
      const data = crazyData();
      // Both: the local copy is what a player keeps if they later play somewhere else.
      await local.set(key, value);
      if (!data) return;
      try {
        data.setItem(key, value);
      } catch (e) {
        // Over their 1MB cap, or the module wasn't enabled on the submission.
        console.warn('[crazygames] data write failed:', e);
      }
    },
    async remove(key) {
      const data = crazyData();
      await local.remove(key);
      if (!data) return;
      try {
        data.removeItem(key);
      } catch {
        // Nothing to do: the local copy is already gone.
      }
    },
  };
}
