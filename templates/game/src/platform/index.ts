import { loadAdapter } from './adapters';
import { createPlatform } from './create-platform';
import { PauseBus } from './pause-bus';
import type { Platform, PortalAdapter } from './types';

export type { Platform } from './types';
export { PauseBus } from './pause-bus';

declare const __GK_PORTAL__: string;
declare const __GK_BUILD__: string;
declare const __GK_GAME__: string;

export const PORTAL = typeof __GK_PORTAL__ === 'string' ? __GK_PORTAL__ : 'dev-mock';
export const BUILD_ID = typeof __GK_BUILD__ === 'string' ? __GK_BUILD__ : 'dev';
export const GAME_NAME = typeof __GK_GAME__ === 'string' ? __GK_GAME__ : 'game';

const INIT_TIMEOUT_MS = 10_000;

/** Used when the portal SDK can't load (blocked, offline): the game still starts, just without ads. */
export const offlineAdapter = (name: string): PortalAdapter => ({
  name: `${name}(offline)`,
  capabilities: { interstitial: false, rewarded: false, banner: false, leaderboard: false, cloudSave: false, user: false },
  async init() {},
  async showAd() {
    return 'unavailable';
  },
});

export async function bootPlatform(bus: PauseBus, initTimeoutMs = INIT_TIMEOUT_MS): Promise<Platform> {
  let adapter: PortalAdapter;
  let failure: unknown = null;
  try {
    adapter = await loadAdapter();
    await Promise.race([
      adapter.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`SDK init timed out after ${initTimeoutMs} ms`)), initTimeoutMs)),
    ]);
  } catch (e) {
    failure = e;
    console.warn('[platform] SDK unavailable, continuing without it', e);
    adapter = offlineAdapter(PORTAL);
  }
  const platform = createPlatform(adapter, { bus, saveNamespace: GAME_NAME });
  platform.track('game_load_start', { portal: PORTAL, build: BUILD_ID });
  if (failure) platform.track('error', { message: `sdk_init: ${String(failure).slice(0, 150)}`, build: BUILD_ID });
  return platform;
}
