import { t } from './i18n';

export interface SettingsOptions {
  /** platform.info.copyright — shown as-is in every language. */
  copyright: string;
  sound: boolean;
  onSound(on: boolean): void;
  onOpen?(): void;
  onClose?(): void;
  /** Gets focus when the popup closes (the game canvas). */
  returnFocus?: HTMLElement;
}

/**
 * Gear button + Settings popup: sound, language, and the portal copyright in the footer.
 * Portals require the footer (AZGAMES: "© <year> Azgames.io") — reskin may restyle it, never remove it.
 */
export function mountSettings(parent: HTMLElement, opts: SettingsOptions): { open(): void; close(): void } {
  const gear = el('button', 'gk-gear', '⚙');
  gear.type = 'button';
  gear.setAttribute('aria-label', t('settings.title'));
  const overlay = el('div', 'gk-settings');
  overlay.hidden = true;
  const panel = el('div', 'gk-settings-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'gk-settings-title');

  let sound = opts.sound;
  const soundBtn = el('button', 'gk-settings-toggle');
  soundBtn.type = 'button';
  const paintSound = () => {
    soundBtn.textContent = `${t('settings.sound')}: ${t(sound ? 'settings.on' : 'settings.off')}`;
    soundBtn.setAttribute('aria-pressed', String(sound));
  };
  paintSound();
  soundBtn.onclick = () => {
    sound = !sound;
    paintSound();
    opts.onSound(sound);
  };

  const langs = window.GM_LANG?.available ?? [];
  const langRow = el('label', 'gk-settings-row', t('settings.language'));
  const select = document.createElement('select');
  for (const l of langs) {
    const o = document.createElement('option');
    o.value = l.code;
    o.textContent = l.name;
    o.selected = l.code === window.GM_LANG?.code;
    select.append(o);
  }
  select.onchange = () => window.GM_LOADER?.setLanguage(select.value);
  langRow.append(select);
  langRow.hidden = langs.length < 2;

  const closeBtn = el('button', 'gk-settings-close', t('settings.close'));
  closeBtn.type = 'button';
  const footer = el('footer', 'gk-settings-footer', opts.copyright);
  const title = el('h2', 'gk-settings-title', t('settings.title'));
  title.id = 'gk-settings-title';
  panel.append(title, soundBtn, langRow, closeBtn, footer);
  overlay.append(panel);
  parent.append(gear, overlay);

  // Modal while open: Escape closes from anywhere, Tab cycles inside the panel.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      api.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [soundBtn, select, closeBtn].filter((x) => !x.closest('[hidden]'));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (!panel.contains(active) || active === (e.shiftKey ? first : last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };
  const api = {
    open() {
      if (!overlay.hidden) return;
      overlay.hidden = false;
      document.addEventListener('keydown', onKey);
      soundBtn.focus();
      opts.onOpen?.();
    },
    close() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.removeEventListener('keydown', onKey);
      opts.returnFocus?.focus();
      opts.onClose?.();
    },
  };
  gear.onclick = (e) => {
    e.stopPropagation();
    api.open();
  };
  closeBtn.onclick = () => api.close();
  overlay.onclick = (e) => {
    if (e.target === overlay) api.close();
  };
  return api;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}
