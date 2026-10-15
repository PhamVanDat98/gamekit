import { loadAdapter } from './adapters';
import { createPlatform } from './create-platform';
import { PauseBus } from './pause-bus';
import type { Platform } from './types';

export type { Platform } from './types';
export { PauseBus } from './pause-bus';

declare const __GK_PORTAL__: string;
declare const __GK_BUILD__: string;
declare const __GK_GAME__: string;

export const PORTAL = typeof __GK_PORTAL__ === 'string' ? __GK_PORTAL__ : 'dev-mock';
export const BUILD_ID = typeof __GK_BUILD__ === 'string' ? __GK_BUILD__ : 'dev';
export const GAME_NAME = typeof __GK_GAME__ === 'string' ? __GK_GAME__ : 'game';

export async function bootPlatform(bus: PauseBus): Promise<Platform> {
  const adapter = await loadAdapter();
  await adapter.init();
  const platform = createPlatform(adapter, { bus, saveNamespace: GAME_NAME });
  platform.track('game_load_start', { portal: PORTAL, build: BUILD_ID });
  return platform;
}
