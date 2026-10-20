import type { Motion } from './motion';

export * from './animator';
export * from './ease';
export * from './frames';
export * from './motion';
export * from './rig';
export * from './spring';

/** Every motion/*.json by name. Run `npm run gk -- motion` after editing one. */
export const MOTIONS: Record<string, Motion> = Object.fromEntries(
  Object.values(import.meta.glob<Motion>('../../../motion/*.json', { eager: true, import: 'default' })).map((m) => [m.name, m]),
);

export function motion(name: string): Motion {
  const m = MOTIONS[name];
  if (!m) throw new Error(`Không có motion/${name}.json`);
  return m;
}
