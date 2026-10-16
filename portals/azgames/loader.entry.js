// loader.js for AZGAMES: sitelock → GMGameSDK → shared loader. __GK_LOADER__ is injected by `gamekit pack`.
/* global __GK_LOADER__ */
import { sitelockDecision } from '../shared/loader-core.js';
import { runLoader } from '../shared/loader-runtime.js';

const cfg = __GK_LOADER__;
const sent = {};
function postToParent(type, extra) {
  if (window.parent === window || sent[type]) return;
  sent[type] = true;
  const msg = Object.assign({ source: 'azgames', type, game: cfg.portalGid, version: cfg.version, host: location.hostname, time: Date.now() }, extra);
  try {
    window.parent.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
  try {
    if (window.top && window.top !== window.parent) window.top.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
}
function parentHost() {
  try {
    return window.top.location.hostname;
  } catch {
    return '';
  }
}

const isTop = window.top === window;
const decision = sitelockDecision({ isTop, host: location.hostname, referrer: document.referrer, parentHost: isTop ? '' : parentHost(), domains: cfg.sitelock });
if (decision === 'redirect') {
  location.href = `https://azgames.io/${cfg.portalGid}`;
} else if (decision === 'run') {
  try {
    window.GMGameSDK.init(cfg.gameId, 'https://gm.azgame.io').setVersion(cfg.version);
  } catch (e) {
    console.error("Can't init GMSDK", e);
  }
  postToParent('game_loaded');
  runLoader(cfg, {
    onReady(loadMs) {
      postToParent('game_started', { load_time_ms: loadMs });
      try {
        window.GMGameSDK.trackEventParams('loaded_game', { load_time_ms: loadMs });
      } catch {
        /* SDK missing */
      }
    },
  });
}
// 'block': stay on the loading screen; the game is never downloaded.
