import type { AnalyticsEvent, EventData } from '../events';
import type { PortalAdapter } from '../types';

/**
 * AZGAMES: loader.js already ran the sitelock, initialised GMGameSDK and reports game_loaded/game_started.
 * This adapter forwards analytics; ads and leaderboard through gmsdkv2 come in a later version.
 */
export function createAzgames(): PortalAdapter {
  return {
    name: 'azgames',
    capabilities: { interstitial: false, rewarded: false, banner: false, leaderboard: false, cloudSave: false, user: false },
    async init() {},
    async showAd() {
      return 'unavailable';
    },
    track(event: AnalyticsEvent, data: EventData) {
      window.GMGameSDK?.trackEventParams?.(event, { ...data });
    },
  };
}

/** Entry point used by the build (virtual:gk-adapter). */
export const createAdapter = (): PortalAdapter => createAzgames();
