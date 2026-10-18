/**
 * `npm run dev` has no portal loader.js: build the same window.GM_LANG / GM_LOADER from Language/*.json
 * so the game behaves as it does inside a package. main.ts imports this only when import.meta.env.DEV,
 * so production builds never contain every language.
 */
const files = import.meta.glob<Record<string, unknown>>('/Language/*.json', { eager: true, import: 'default' });
const KEY = 'gamekit.dev.lang';

export function installDevLoader(): void {
  if (window.GM_LANG) return;
  const dicts = new Map(Object.entries(files).map(([p, d]) => [p.replace(/^.*\/(.+)\.json$/, '$1'), d]));
  const en = dicts.get('en') ?? {};
  const available = [...dicts.entries()].map(([code, d]) => ({ code, name: String((d._meta as { name?: string } | undefined)?.name ?? code) }));
  const wanted = new URLSearchParams(location.search).get('lang') ?? read(KEY) ?? 'en';
  const code = dicts.has(wanted) ? wanted : 'en';
  // Right-to-left languages (ar, fa…) flip the page as the portal loader does.
  if ((dicts.get(code)?._meta as { dir?: string } | undefined)?.dir === 'rtl') document.documentElement.dir = 'rtl';
  document.documentElement.lang = code;
  window.GM_LANG = { code, dict: withEnFallback(en, dicts.get(code) ?? {}), available };
  window.GM_LOADER = {
    copyright: `© ${new Date().getFullYear()} GameKit (dev)`,
    version: 'dev',
    setLanguage(next) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode */
      }
      location.reload();
    },
    ready() {},
  };
}

const PLURAL = /^(.+)\.(zero|one|two|few|many|other)$/;
const pluralBase = (k: string) => PLURAL.exec(k)?.[1];

/**
 * Keys missing from a translation come from en — except plural forms of a key the translation already
 * pluralises: ru with only `coins.other` must not get en's `coins.one` ("1 coin" in a Russian game).
 * Same rule as `gamekit pack` (scripts/lib/languages.mjs in the plugin).
 */
export function withEnFallback(en: Record<string, unknown>, dict: Record<string, unknown>): Record<string, unknown> {
  const own = new Set(Object.keys(dict).map(pluralBase).filter(Boolean));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(en)) if (!own.has(pluralBase(k))) out[k] = v;
  return Object.assign(out, dict);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
