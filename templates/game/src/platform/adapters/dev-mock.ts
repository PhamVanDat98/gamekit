import type { AnalyticsEvent, EventData } from '../events';
import type { AdKind, AdResult, LeaderboardEntry, PortalAdapter } from '../types';

export interface DevMockOptions {
  /** How the fake ad behaves: ok (default), fail, skip, none (unavailable), slow. */
  mode?: 'ok' | 'fail' | 'skip' | 'none' | 'slow';
  adMs?: number;
  log?: (line: string) => void;
}

const DEFAULT_AD_MS = 1200;
const SLOW_FACTOR = 4;

/**
 * Local stand-in for a portal SDK. Shows a visible fake ad when a DOM exists,
 * logs every call, and lets tests force failures via options or ?ad=fail in the URL.
 */
export function createDevMock(opts: DevMockOptions = {}): PortalAdapter & { calls: string[] } {
  const mode = opts.mode ?? readQueryMode() ?? 'ok';
  const adMs = (opts.adMs ?? DEFAULT_AD_MS) * (mode === 'slow' ? SLOW_FACTOR : 1);
  const calls: string[] = [];
  const log = (line: string) => {
    calls.push(line);
    (opts.log ?? ((l: string) => console.info(`[dev-mock] ${l}`)))(line);
  };
  const scores = new Map<string, number[]>();

  return {
    name: 'dev-mock',
    calls,
    capabilities: { interstitial: mode !== 'none', rewarded: mode !== 'none', banner: false, leaderboard: true, cloudSave: false, user: false },
    async init() {
      log('init');
    },
    loadingProgress(p) {
      log(`loadingProgress ${p.toFixed(2)}`);
    },
    loadingEnd() {
      log('loadingEnd');
    },
    gameplayStart() {
      log('gameplayStart');
    },
    gameplayStop() {
      log('gameplayStop');
    },
    async showAd(kind: AdKind, placement: string): Promise<AdResult> {
      log(`showAd ${kind} ${placement} (${mode})`);
      if (mode === 'fail') throw new Error('dev-mock: forced ad failure');
      if (mode === 'skip') return 'skipped';
      await fakeAdOverlay(kind, adMs);
      return kind === 'rewarded' ? 'rewarded' : 'shown';
    },
    track(event: AnalyticsEvent, data: EventData) {
      log(`track ${event} ${JSON.stringify(data)}`);
    },
    async submitScore(board, score) {
      log(`submitScore ${board} ${score}`);
      scores.set(board, [...(scores.get(board) ?? []), score].sort((a, b) => b - a));
    },
    async topScores(board, count): Promise<LeaderboardEntry[]> {
      return (scores.get(board) ?? []).slice(0, count).map((score, i) => ({ name: 'You', score, rank: i + 1 }));
    },
  };
}

function readQueryMode(): DevMockOptions['mode'] | null {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get('ad');
    return v === 'ok' || v === 'fail' || v === 'skip' || v === 'none' || v === 'slow' ? v : null;
  } catch {
    return null;
  }
}

function fakeAdOverlay(kind: AdKind, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const el = document.createElement('div');
    el.className = 'gk-fake-ad';
    el.textContent = `Quảng cáo giả (${kind}) — dev-mock`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, ms);
  });
}

/** Entry point used by the build (virtual:gk-adapter). */
export const createAdapter = (): PortalAdapter => createDevMock();
