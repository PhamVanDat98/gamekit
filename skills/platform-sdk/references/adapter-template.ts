// src/platform/adapters/<portal>.ts — copy this file, then translate each call to the portal SDK.
// Keep it thin: pausing, muting, gameplay balance and event filtering are done in createPlatform().
import type { AnalyticsEvent, EventData } from '../events';
import type { AdKind, AdResult, PortalAdapter } from '../types';

// Describe the SDK global you rely on, from its official docs. Never guess names.
declare global {
  interface Window {
    // ExampleSDK?: { … };
  }
}

const SDK_URL = ''; // official SDK script URL, add its host to release.allowedHosts in game.yaml

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!src) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`SDK load failed: ${src}`));
    document.head.appendChild(s);
  });
}

export function createAdapter(): PortalAdapter {
  return {
    name: '<portal>',
    capabilities: { interstitial: true, rewarded: true, banner: false, leaderboard: false, cloudSave: false, user: false },
    async init() {
      await loadScript(SDK_URL);
      // await window.ExampleSDK.init();
    },
    loadingProgress(_p: number) {},
    loadingEnd() {},
    gameplayStart() {},
    gameplayStop() {},
    async showAd(kind: AdKind, _placement: string): Promise<AdResult> {
      // Resolve only after the ad is fully closed. Map SDK outcomes:
      //   watched to the end → kind === 'rewarded' ? 'rewarded' : 'shown'
      //   closed early → 'skipped' · no fill → 'unavailable' · error → throw or 'error'
      return 'unavailable';
    },
    track(_event: AnalyticsEvent, _data: EventData) {},
  };
}
