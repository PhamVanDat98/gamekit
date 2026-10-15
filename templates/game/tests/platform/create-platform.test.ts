import { describe, expect, it } from 'vitest';
import { createDevMock } from '../../src/platform/adapters/dev-mock';
import { createPlatform } from '../../src/platform/create-platform';
import { PauseBus } from '../../src/platform/pause-bus';
import type { PortalAdapter } from '../../src/platform/types';

const quiet = () => {};
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

function setup(adapter: PortalAdapter = createDevMock({ adMs: 0, log: quiet })) {
  const bus = new PauseBus();
  const states: boolean[] = [];
  bus.subscribe((s) => states.push(s.paused));
  const platform = createPlatform(adapter, { bus, saveNamespace: 'test', storage: memory(), log: quiet });
  return { bus, states, platform, adapter };
}

describe('ads', () => {
  it('pause + mute during the ad, resume after', async () => {
    const { bus, states, platform } = setup();
    const p = platform.interstitial('round_end');
    expect(bus.paused).toBe(true);
    expect(bus.muted).toBe(true);
    expect(await p).toBe('shown');
    expect(bus.paused).toBe(false);
    expect(states).toEqual([false, true, false]);
  });

  it('stops gameplay for the ad and restarts it after', async () => {
    const mock = createDevMock({ adMs: 0, log: quiet });
    const { platform } = setup(mock);
    platform.gameplayStart();
    await platform.interstitial('x');
    expect(mock.calls.filter((c) => c.startsWith('gameplay'))).toEqual(['gameplayStart', 'gameplayStop', 'gameplayStart']);
  });

  it('a failing SDK never crashes the game and still resumes', async () => {
    const { bus, platform } = setup(createDevMock({ mode: 'fail', log: quiet }));
    expect(await platform.rewarded('revive')).toBe('error');
    expect(bus.paused).toBe(false);
  });

  it('no stacked ads', async () => {
    const { platform } = setup(createDevMock({ adMs: 5, log: quiet }));
    const [a, b] = await Promise.all([platform.interstitial('a'), platform.interstitial('b')]);
    expect([a, b].sort()).toEqual(['shown', 'skipped']);
  });

  it('unsupported ads report unavailable without pausing', async () => {
    const { bus, platform } = setup(createDevMock({ mode: 'none', log: quiet }));
    expect(await platform.interstitial('x')).toBe('unavailable');
    expect(bus.paused).toBe(false);
  });

  it('rewarded tracks ad_rewarded', async () => {
    const mock = createDevMock({ adMs: 0, log: quiet });
    const { platform } = setup(mock);
    expect(await platform.rewarded('revive')).toBe('rewarded');
    expect(mock.calls.some((c) => c.startsWith('track ad_rewarded'))).toBe(true);
  });
});

describe('gameplay events', () => {
  it('start/stop are balanced and idempotent', () => {
    const mock = createDevMock({ log: quiet });
    const { platform } = setup(mock);
    platform.gameplayStart();
    platform.gameplayStart();
    platform.gameplayStop();
    platform.gameplayStop();
    expect(mock.calls.filter((c) => c.startsWith('gameplay'))).toEqual(['gameplayStart', 'gameplayStop']);
  });

  it('unknown analytics events are dropped', () => {
    const mock = createDevMock({ log: quiet });
    const { platform } = setup(mock);
    // @ts-expect-error — not in ANALYTICS_EVENTS
    platform.track('made_up_event');
    expect(mock.calls.some((c) => c.includes('made_up_event'))).toBe(false);
  });
});

describe('save', () => {
  it('falls back to namespaced local storage', async () => {
    const { platform } = setup();
    await platform.save.set('best', '42');
    expect(await platform.save.get('best')).toBe('42');
  });
});

describe('pause bus', () => {
  it('resumes only when every reason is gone', () => {
    const bus = new PauseBus();
    bus.pause('ad');
    bus.pause('hidden');
    bus.resume('ad');
    expect(bus.paused).toBe(true);
    bus.resume('hidden');
    expect(bus.paused).toBe(false);
  });

  it('user mute keeps sound off while running', () => {
    const bus = new PauseBus();
    bus.setUserMuted(true);
    expect(bus.paused).toBe(false);
    expect(bus.muted).toBe(true);
  });
});
