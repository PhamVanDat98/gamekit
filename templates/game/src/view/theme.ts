/**
 * Style tokens for view/: colours, fonts, shapes. `gamekit style choose <id>` rewrites this file from
 * style/options/<id>.json — change the style there. CSS reads the tokens as --gk-* variables.
 */
export const THEME = {
  palette: { bg: '#14161a', surface: '#1c1f25', primary: '#4fb3ff', secondary: '#ff6b5a', text: '#f2f2f2', muted: '#9aa0a6', onPrimary: '#0d0f12' },
  fonts: { display: 'system-ui, sans-serif', body: 'system-ui, sans-serif' },
  shape: { radius: 12, stroke: 0, shadow: 'soft' },
} as const;

/** Font files shipped with the game (assets/fonts/ — portals forbid font CDNs). */
const FONT_FILES: ReadonlyArray<{ family: string; url: string; weight?: number }> = [];

const SHADOWS = { none: 'none', soft: '0 6px 18px rgba(0, 0, 0, 0.35)', hard: '0 4px 0 rgba(0, 0, 0, 0.55)' };

/** Set the --gk-* variables and load the font files; resolves even if a font fails (falls back). */
export async function applyTheme(root: HTMLElement = document.documentElement): Promise<void> {
  const { palette, fonts, shape } = THEME;
  for (const [k, v] of Object.entries(palette)) root.style.setProperty(`--gk-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
  root.style.setProperty('--gk-font-display', fonts.display);
  root.style.setProperty('--gk-font-body', fonts.body);
  root.style.setProperty('--gk-radius', `${shape.radius}px`);
  root.style.setProperty('--gk-stroke', `${shape.stroke}px`);
  root.style.setProperty('--gk-shadow', SHADOWS[shape.shadow]);
  await Promise.all(
    FONT_FILES.map(async (f) => {
      try {
        document.fonts.add(await new FontFace(f.family, `url(${f.url})`, f.weight ? { weight: String(f.weight) } : {}).load());
      } catch {
        /* keep the fallback font */
      }
    }),
  );
}
