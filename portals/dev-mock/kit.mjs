// dev-mock kit: same az-v1 layout, no sitelock, no portal SDK — runs on localhost / file://.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fillTemplate, jsString } from '../../scripts/lib/html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, rel), 'utf8');

export function renderShell({ game, version }) {
  const title = escapeHtml(game.title);
  const settingsScript = [
    `        window.GM_GAME = { id: ${jsString(game.name)}, version: ${jsString(version)} };`,
    '        window.GM_LOAD_START = performance.now();',
  ].join('\n');
  return fillTemplate(read('shell.html'), {
    LANG: escapeHtml(game.language ?? 'en'),
    TITLE: title,
    SETTINGS_SCRIPT: settingsScript,
    LOADING: fillTemplate(read('../shared/loading.html'), { TITLE: title, VERSION: escapeHtml(version) }),
  });
}

export const loaderConfig = ({ game }) => ({ storageKey: `gamekit.${game.name}.lang` });
