// AZGAMES kit: fills shell.html and the portal-specific part of the loader config for one build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fillTemplate, jsString } from '../../scripts/lib/html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, rel), 'utf8');

export function renderShell({ game, settings, version }) {
  const title = escapeHtml(game.title);
  const lang = game.language ?? 'en';
  // The AZGAMES settings block, exactly the four keys and comments the portal documents.
  const settingsScript = [
    '        /* ===== AZGAMES SETTINGS ===== */',
    '        window.AZ_SETTINGS = {',
    '          // Game code from the portal operator. Used as the localStorage key: azgames.<gameCode>',
    `          gameCode:  ${jsString(settings.gameCode)},`,
    '          // Default language for new players. Must match a file in Language/ (en -> Language/en.json)',
    `          language:  ${jsString(lang)},`,
    '          // SDK game id (ends with -az). Used by GMGameSDK.init: analytics events, leaderboard',
    `          gameId:    ${jsString(settings.gameId)},`,
    '          // Portal slug (no -az). Used by gmsdkv2.js: More Games, ads, portal redirect',
    `          portalGid: ${jsString(settings.portalGid)}`,
    '        };',
    '        /* =========================== */',
    `        window.GM_GAME = { id: ${jsString(settings.gameId)}, version: ${jsString(version)} };`,
    '        window.GM_LOAD_START = performance.now();',
    '        window["GMSOFT_SDKTYPE"] = "gm";',
    `        window["GMSOFT_SIGNED"] = ${jsString(settings.signed)};`,
  ].join('\n');
  return fillTemplate(read('shell.html'), {
    LANG: escapeHtml(lang),
    TITLE: title,
    PORTAL_GID: escapeHtml(settings.portalGid),
    SETTINGS_SCRIPT: settingsScript,
    LOADING: fillTemplate(read('../shared/loading.html'), { TITLE: title, VERSION: escapeHtml(version) }),
  });
}

export const loaderConfig = ({ settings }) => ({
  storageKey: `azgames.${settings.gameCode}.lang`,
  gameId: settings.gameId,
  portalGid: settings.portalGid,
});
