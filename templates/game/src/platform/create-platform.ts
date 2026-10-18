import type { AnalyticsEvent, EventData } from './events';
import { isAnalyticsEvent } from './events';
import type { PauseBus } from './pause-bus';
import type { AdKind, AdResult, Platform, PlatformInfo, PortalAdapter } from './types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PlatformOptions {
  bus: PauseBus;
  /** Prefix for local save keys so games on the same domain don't collide. */
  saveNamespace: string;
  storage?: StorageLike | null;
  log?: (msg: string, err?: unknown) => void;
  /** An ad that never reports back (ad blocker, SDK bug) is abandoned after this long. */
  adTimeoutMs?: number;
  info?: PlatformInfo;
}

const DEFAULT_AD_TIMEOUT_MS = 60_000;

/**
 * Wraps a thin PortalAdapter with the rules that must hold on every portal:
 * pause + mute during ads, gameplay start/stop balanced, ads never stacked,
 * only known analytics events, errors never crash the game.
 */
export function createPlatform(adapter: PortalAdapter, opts: PlatformOptions): Platform {
  const { bus } = opts;
  const log = opts.log ?? ((m: string, e?: unknown) => console.warn(`[platform:${adapter.name}] ${m}`, e ?? ''));
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  const adTimeoutMs = opts.adTimeoutMs ?? DEFAULT_AD_TIMEOUT_MS;
  // What the game asked for vs. what the SDK was told. An ad or any pause (menu, hidden tab) forces
  // "stopped"; when it ends, the SDK follows whatever the game wants at that moment.
  let wantGameplay = false;
  let sdkGameplay = false;
  let adRunning = false;
  let loadingDone = false;

  const safe = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      log(`${what} failed`, e);
    }
  };

  const syncGameplay = () => {
    const target = wantGameplay && !adRunning && !bus.paused;
    if (target === sdkGameplay) return;
    sdkGameplay = target;
    safe(target ? 'gameplayStart' : 'gameplayStop', () => (target ? adapter.gameplayStart?.() : adapter.gameplayStop?.()));
  };

  bus.subscribe(syncGameplay);

  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`ad timed out after ${ms} ms`)), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });

  const track = (event: AnalyticsEvent, data: EventData = {}) => {
    if (!isAnalyticsEvent(event)) {
      log(`unknown analytics event "${String(event)}" dropped`);
      return;
    }
    try {
      adapter.track?.(event, data);
    } catch (e) {
      log('track failed', e);
    }
  };

  const showAd = async (kind: AdKind, placement: string): Promise<AdResult> => {
    const supported = kind === 'rewarded' ? adapter.capabilities.rewarded : adapter.capabilities.interstitial;
    if (!supported) return 'unavailable';
    if (adRunning) return 'skipped';
    adRunning = true;
    syncGameplay();
    bus.pause('ad');
    track('ad_requested', { kind, placement });
    let result: AdResult;
    try {
      result = await withTimeout(adapter.showAd(kind, placement), adTimeoutMs);
    } catch (e) {
      log(`${kind} ad failed`, e);
      result = 'error';
    } finally {
      bus.resume('ad');
      adRunning = false;
    }
    if (result === 'shown' || result === 'rewarded') track('ad_shown', { kind, placement });
    if (result === 'rewarded') track('ad_rewarded', { placement });
    if (result === 'error') track('ad_failed', { kind, placement });
    syncGameplay();
    return result;
  };

  const platform: Platform = {
    name: adapter.name,
    info: opts.info ?? { portal: adapter.name, copyright: '' },
    capabilities: adapter.capabilities,
    loadingProgress(p) {
      try {
        adapter.loadingProgress?.(Math.min(1, Math.max(0, p)));
      } catch (e) {
        log('loadingProgress failed', e);
      }
    },
    loadingEnd() {
      if (loadingDone) return;
      loadingDone = true;
      try {
        adapter.loadingEnd?.();
      } catch (e) {
        log('loadingEnd failed', e);
      }
      track('game_load_end');
    },
    gameplayStart() {
      wantGameplay = true;
      syncGameplay();
    },
    gameplayStop() {
      wantGameplay = false;
      syncGameplay();
    },
    interstitial: (placement) => showAd('interstitial', placement),
    rewarded: (placement) => showAd('rewarded', placement),
    showBanner(slot) {
      if (adapter.capabilities.banner) safe('showBanner', () => adapter.showBanner?.(slot));
    },
    hideBanner(slot) {
      if (adapter.capabilities.banner) safe('hideBanner', () => adapter.hideBanner?.(slot));
    },
    track,
    async submitScore(board, score) {
      if (!adapter.capabilities.leaderboard || !adapter.submitScore) return;
      try {
        await adapter.submitScore(board, score);
      } catch (e) {
        log('submitScore failed', e);
      }
    },
    async topScores(board, count) {
      if (!adapter.capabilities.leaderboard || !adapter.topScores) return [];
      try {
        return await adapter.topScores(board, count);
      } catch (e) {
        log('topScores failed', e);
        return [];
      }
    },
    save: {
      async get(key) {
        const k = `${opts.saveNamespace}:${key}`;
        if (adapter.capabilities.cloudSave && adapter.saveGet) {
          try {
            return await adapter.saveGet(k);
          } catch (e) {
            log('cloud save get failed, using local', e);
          }
        }
        try {
          return storage?.getItem(k) ?? null;
        } catch {
          return null;
        }
      },
      async set(key, value) {
        const k = `${opts.saveNamespace}:${key}`;
        try {
          storage?.setItem(k, value);
        } catch {
          /* private mode / quota: keep going */
        }
        if (adapter.capabilities.cloudSave && adapter.saveSet) {
          try {
            await adapter.saveSet(k, value);
          } catch (e) {
            log('cloud save set failed', e);
          }
        }
      },
    },
    async user() {
      if (!adapter.capabilities.user || !adapter.user) return null;
      try {
        return await adapter.user();
      } catch (e) {
        log('user failed', e);
        return null;
      }
    },
  };
  return platform;
}

function safeLocalStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
