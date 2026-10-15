/**
 * The one list of analytics event names, shared by every game in the network so
 * numbers compare across games. Add names here (and nowhere else) on purpose.
 */
export const ANALYTICS_EVENTS = [
  'game_load_start',
  'game_load_end',
  'level_start',
  'level_complete',
  'level_fail',
  'ad_requested',
  'ad_shown',
  'ad_rewarded',
  'ad_failed',
  'error',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type EventData = Record<string, string | number | boolean>;

export const isAnalyticsEvent = (name: string): name is AnalyticsEvent => (ANALYTICS_EVENTS as readonly string[]).includes(name);
