// Pure decisions of the page loader (no DOM). Unit-tested in the plugin, bundled into every portal's loader.js.

/** `host` is one of `domains` or a subdomain of one. */
export function isAllowedHost(host, domains) {
  const h = String(host || '').toLowerCase();
  return domains.some((d) => h === d || h.endsWith('.' + d));
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Sitelock — the portal's Unity template rules plus a host whitelist:
 *   top window:  own host not allowed, or no referrer → 'redirect' to the portal page
 *   in an iframe: parent host unknown or not allowed → 'block' (the game is never fetched)
 */
export function sitelockDecision({ isTop, host, referrer, parentHost, domains }) {
  if (isTop) return !isAllowedHost(host, domains) || !referrer ? 'redirect' : 'run';
  const parent = parentHost || hostOf(referrer);
  return parent && isAllowedHost(parent, domains) ? 'run' : 'block';
}

/** Saved choice → ?lang= → browser languages → default → en; only codes the package ships. */
export function pickLanguage({ saved, query, browser = [], fallback, available }) {
  const have = new Set(available);
  const match = (c) => {
    const parts = String(c || '').toLowerCase().split('-').filter(Boolean);
    for (let n = parts.length; n > 0; n--) {
      const code = parts.slice(0, n).join('-');
      if (have.has(code)) return code;
    }
    return null;
  };
  for (const c of [saved, query, ...browser, fallback, 'en']) {
    const m = match(c);
    if (m) return m;
  }
  return available[0];
}

export const progressPercent = (received, total) => (total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0);

/** localStorage that never throws (private mode, blocked third-party storage in iframes). */
export function safeStorage(getStorage) {
  const store = () => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };
  return {
    get(k) {
      try {
        return store()?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        store()?.setItem(k, v);
      } catch {
        /* quota or blocked: the choice just isn't remembered */
      }
    },
  };
}
