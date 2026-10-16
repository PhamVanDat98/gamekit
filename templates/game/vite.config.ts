import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const game = /^name:\s*(\S+)/m.exec(readFileSync('game.yaml', 'utf8'))?.[1] ?? 'game';
const portal = process.env.GK_PORTAL ?? 'dev-mock';

/** `virtual:gk-adapter` → src/platform/adapters/<portal>.ts, so each package bundles only its own SDK. */
function portalAdapter(): Plugin {
  const id = 'virtual:gk-adapter';
  return {
    name: 'gamekit-portal-adapter',
    resolveId(source) {
      if (source !== id) return null;
      const file = resolve('src/platform/adapters', `${portal}.ts`);
      if (!existsSync(file)) throw new Error(`GameKit: chưa có adapter cho portal "${portal}" (src/platform/adapters/${portal}.ts)`);
      return file;
    },
  };
}

const ASSET_KINDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.(png|jpe?g|webp|gif|svg|avif)$/i, 'img'],
  [/\.(mp3|ogg|m4a|aac|wav)$/i, 'audio'],
  [/\.(woff2?|ttf|otf)$/i, 'fonts'],
];

// `gamekit pack` (GK_PACK=1) builds what goes into builds/<v>/<portal>/<v>/: framework.js (one file),
// css/style.css and assets/{img,audio,fonts,art}/. The page and loader.js come from the portal kit in the
// plugin. public/Icons and public/StreamingAssets are copied as-is.
export default defineConfig({
  base: './',
  plugins: [portalAdapter()],
  publicDir: 'public',
  define: {
    __GK_PORTAL__: JSON.stringify(process.env.GK_PORTAL ?? 'dev-mock'),
    __GK_BUILD__: JSON.stringify(process.env.GK_BUILD ?? 'dev'),
    __GK_GAME__: JSON.stringify(game),
  },
  // framework.js runs from a blob: URL (the loader downloads it with progress), so asset URLs are
  // resolved against the page (document.baseURI = the version folder), not against the script.
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      return hostType === 'js' ? { runtime: `new URL(${JSON.stringify(filename)}, document.baseURI).href` } : { relative: true };
    },
  },
  build: {
    sourcemap: false,
    target: 'es2020',
    modulePreload: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: process.env.GK_PACK ? 'src/main.ts' : undefined,
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'framework.js',
        assetFileNames: (info) => {
          const name = info.names[0] ?? '';
          if (name.endsWith('.css')) return 'css/style.css';
          const kind = ASSET_KINDS.find(([re]) => re.test(name))?.[1] ?? 'art';
          return `assets/${kind}/[name]-[hash][extname]`;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
