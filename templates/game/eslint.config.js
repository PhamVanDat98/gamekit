import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const RENDER_LIBS = ['pixi.js', 'pixi.js/*', 'phaser', 'three', 'three/*', '@babylonjs/*', 'howler'];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'scripts/', '.gamekit/', 'reference/', 'decompiled/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // core/ = pure, deterministic game logic. Runs in Node, replays exactly, tested first.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['../view', '../view/*', '../platform', '../platform/*'], message: 'core/ không được import view/ hay platform/.' },
            { group: RENDER_LIBS, message: 'core/ không được dùng thư viện render/âm thanh.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ không đụng DOM.' },
        { name: 'document', message: 'core/ không đụng DOM.' },
        { name: 'performance', message: 'Thời gian lấy từ fixed step.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Dùng Rng có seed.' },
        { object: 'Date', property: 'now', message: 'Thời gian lấy từ fixed step.' },
      ],
      // Gameplay numbers live in params/*.json with a source in the original game.
      'no-magic-numbers': ['error', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true, enforceConst: true }],
    },
  },
);
