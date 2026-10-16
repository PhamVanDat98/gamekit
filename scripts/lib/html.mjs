// Escaping and placeholder filling for the portal shell page.
import { GkError } from './log.mjs';

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A double-quoted JS string literal that is safe inside an inline <script>. */
export const jsString = (s) =>
  JSON.stringify(String(s)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Replace {{KEY}} in one pass; a placeholder without a value is an error so a typo never ships. */
export function fillTemplate(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new GkError(`Template thiếu giá trị cho {{${k}}}`);
    return vars[k];
  });
}

/** Root page of a package: the same page, resolved against the version folder. */
export function withBase(html, version) {
  if (!/<head>/i.test(html)) throw new GkError('shell.html không có <head>');
  return html.replace(/<head>/i, `<head>\n    <base href="${version}/">`);
}
