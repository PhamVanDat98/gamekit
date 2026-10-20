/**
 * Text for view/ (core/ never touches text). Strings come from Language/<code>.json, loaded by the
 * portal loader — players download one language only. Missing key → the key itself, so gaps show.
 */
type Params = Record<string, string | number>;

export function translate(dict: Readonly<Record<string, unknown>>, code: string, key: string, params: Params = {}): string {
  let k = key;
  if (typeof params.count === 'number') {
    const form = `${key}.${new Intl.PluralRules(code).select(params.count)}`;
    const other = `${key}.other`;
    // "hud.coins": "{count} coins" has no plural forms: keep the key itself.
    k = typeof dict[form] === 'string' ? form : typeof dict[other] === 'string' ? other : key;
  }
  const s = dict[k];
  if (typeof s !== 'string') return key;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : m));
}

export const t = (key: string, params?: Params): string => translate(window.GM_LANG?.dict ?? {}, window.GM_LANG?.code ?? 'en', key, params);

/**
 * Images (or voice clips) with words in them: assets/i18n/<code>/<name>, en is the source and the
 * fallback. Every language's file ships as its own URL — never inlined into framework.js — so the
 * player downloads only the one for their language.
 */
const LOCALIZED = import.meta.glob<string>('/assets/i18n/*/**/*', { eager: true, query: '?url&no-inline', import: 'default' });

export function localizedUrl(files: Readonly<Record<string, string>>, code: string, name: string): string {
  const url = files[`/assets/i18n/${code}/${name}`] ?? files[`/assets/i18n/en/${name}`];
  if (url === undefined) throw new Error(`assets/i18n/en/${name} not found`);
  return url;
}

export const tAsset = (name: string): string => localizedUrl(LOCALIZED, window.GM_LANG?.code ?? 'en', name);
