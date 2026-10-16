import type { AnalyticsEvent, EventData } from './events';

export type AdKind = 'interstitial' | 'rewarded';
export type AdResult = 'shown' | 'rewarded' | 'skipped' | 'unavailable' | 'error';

export interface LeaderboardEntry {
  readonly name: string;
  readonly score: number;
  readonly rank: number;
}

export interface PlatformUser {
  readonly id: string;
  readonly name: string;
}

export interface Capabilities {
  readonly interstitial: boolean;
  readonly rewarded: boolean;
  readonly banner: boolean;
  readonly leaderboard: boolean;
  readonly cloudSave: boolean;
  readonly user: boolean;
}

/**
 * What an adapter for one portal SDK implements. Keep it thin: just translate
 * to the SDK. Pausing, muting, event tracking and error handling for ads are
 * done once in createPlatform(), not in every adapter.
 */
export interface PortalAdapter {
  readonly name: string;
  readonly capabilities: Capabilities;
  init(): Promise<void>;
  loadingProgress?(progress: number): void;
  loadingEnd?(): void;
  gameplayStart?(): void;
  gameplayStop?(): void;
  /** Resolve when the ad is fully closed. */
  showAd(kind: AdKind, placement: string): Promise<AdResult>;
  showBanner?(slot: string): void;
  hideBanner?(slot: string): void;
  track?(event: AnalyticsEvent, data: EventData): void;
  submitScore?(board: string, score: number): Promise<void>;
  topScores?(board: string, count: number): Promise<LeaderboardEntry[]>;
  /** Cloud save; fall back to localStorage when absent. */
  saveGet?(key: string): Promise<string | null>;
  saveSet?(key: string, value: string): Promise<void>;
  user?(): Promise<PlatformUser | null>;
}

export interface PlatformInfo {
  readonly portal: string;
  /** Portal copyright line for the Settings footer (AZGAMES: "© <year> Azgames.io"). Never translated. */
  readonly copyright: string;
}

/** What the game calls. Gameplay never knows which portal it runs on. */
export interface Platform {
  readonly info: PlatformInfo;
  readonly name: string;
  readonly capabilities: Capabilities;
  loadingProgress(progress: number): void;
  loadingEnd(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Never call while the player is mid-action: between rounds, on menus. */
  interstitial(placement: string): Promise<AdResult>;
  rewarded(placement: string): Promise<AdResult>;
  showBanner(slot: string): void;
  hideBanner(slot: string): void;
  track(event: AnalyticsEvent, data?: EventData): void;
  submitScore(board: string, score: number): Promise<void>;
  topScores(board: string, count: number): Promise<LeaderboardEntry[]>;
  save: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };
  user(): Promise<PlatformUser | null>;
}
