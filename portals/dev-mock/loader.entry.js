// loader.js for dev-mock: the shared loader, no sitelock and no SDK. __GK_LOADER__ is injected by `gamekit pack`.
/* global __GK_LOADER__ */
import { runLoader } from '../shared/loader-runtime.js';

const cfg = __GK_LOADER__;
console.info(`[dev-mock] loader ${cfg.version}`);
runLoader(cfg, { onReady: (ms) => console.info(`[dev-mock] game_started ${ms} ms`) });
