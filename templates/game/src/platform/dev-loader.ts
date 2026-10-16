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
  window.GM_LANG = { code, dict: { ...en, ...(dicts.get(code) ?? {}) }, available };
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

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
