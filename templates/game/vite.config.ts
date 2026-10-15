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

// Output layout matches GameKit packages: index.html, Build/, StreamingAssets/, TemplateData/.
// public/StreamingAssets and public/TemplateData are copied as-is; code and imported assets go to Build/.
export default defineConfig({
  base: './',
  plugins: [portalAdapter()],
  publicDir: 'public',
  define: {
    __GK_PORTAL__: JSON.stringify(process.env.GK_PORTAL ?? 'dev-mock'),
    __GK_BUILD__: JSON.stringify(process.env.GK_BUILD ?? 'dev'),
    __GK_GAME__: JSON.stringify(game),
  },
  build: {
    assetsDir: 'Build',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 2048,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
