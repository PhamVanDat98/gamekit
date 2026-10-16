/**
 * Text for view/ (core/ never touches text). Strings come from Language/<code>.json, loaded by the
 * portal loader — players download one language only. Missing key → the key itself, so gaps show.
 */
type Params = Record<string, string | number>;

export function translate(dict: Readonly<Record<string, unknown>>, code: string, key: string, params: Params = {}): string {
  let k = key;
  if (typeof params.count === 'number') {
    const form = `${key}.${new Intl.PluralRules(code).select(params.count)}`;
    k = typeof dict[form] === 'string' ? form : `${key}.other`;
  }
  const s = dict[k];
  if (typeof s !== 'string') return key;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : m));
}

export const t = (key: string, params?: Params): string => translate(window.GM_LANG?.dict ?? {}, window.GM_LANG?.code ?? 'en', key, params);
