import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const RENDER_LIBS = ['pixi.js', 'pixi.js/*', 'phaser', 'three', 'three/*', '@babylonjs/*', 'howler'];

export default tseslint.config(
  { ignores: ['builds/', 'node_modules/', 'scripts/', '.gamekit/', 'reference/', 'decompiled/'] },
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
            { group: ['**/view', '**/view/**', '**/platform', '**/platform/**'], message: 'core/ không được import view/ hay platform/.' },
            { group: RENDER_LIBS, message: 'core/ không được dùng thư viện render/âm thanh.' },
          ],
        },
      ],
      // A second tsc pass (tsconfig.core.json, no DOM lib) also rejects every browser API in core/.
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ không đụng DOM.' },
        { name: 'document', message: 'core/ không đụng DOM.' },
        { name: 'performance', message: 'Thời gian lấy từ fixed step.' },
        { name: 'Date', message: 'core/ không đọc đồng hồ thật; thời gian lấy từ fixed step.' },
        { name: 'globalThis', message: 'core/ không đụng môi trường chạy.' },
        { name: 'self', message: 'core/ không đụng môi trường chạy.' },
        { name: 'process', message: 'core/ không đụng môi trường chạy.' },
        { name: 'navigator', message: 'core/ không đụng DOM.' },
        { name: 'location', message: 'core/ không đụng DOM.' },
        { name: 'addEventListener', message: 'core/ không đụng DOM.' },
        { name: 'removeEventListener', message: 'core/ không đụng DOM.' },
        { name: 'crypto', message: 'Dùng Rng có seed.' },
        { name: 'Intl', message: 'Định dạng số/chữ theo ngôn ngữ thuộc view/ (i18n).' },
        { name: 'fetch', message: 'Mạng/tải dữ liệu nằm ngoài core/.' },
        { name: 'XMLHttpRequest', message: 'Mạng/tải dữ liệu nằm ngoài core/.' },
        { name: 'WebSocket', message: 'Mạng/tải dữ liệu nằm ngoài core/.' },
        { name: 'localStorage', message: 'Lưu qua platform.save, không trong core/.' },
        { name: 'sessionStorage', message: 'Lưu qua platform.save, không trong core/.' },
        { name: 'requestAnimationFrame', message: 'Vòng lặp nằm ngoài core/; core chỉ nhận dt.' },
        { name: 'setTimeout', message: 'Hẹn giờ bằng thời gian mô phỏng (dt), không dùng đồng hồ thật.' },
        { name: 'setInterval', message: 'Hẹn giờ bằng thời gian mô phỏng (dt), không dùng đồng hồ thật.' },
        { name: 'queueMicrotask', message: 'core/ chạy đồng bộ, từng bước cố định.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'core/ không import động (import()).' },
        {
          // `const M = Math; M.random()` or `const { random } = Math` would slip past no-restricted-properties.
          selector: "Identifier[name='Math']:not(MemberExpression[computed=false] > Identifier.object)",
          message: 'Chỉ gọi Math.xxx trực tiếp (không gán/destructure Math); ngẫu nhiên dùng Rng có seed.',
        },
        {
          // A named constant is still a gameplay number typed in code; it belongs in params/.
          // Matches 5, 1e3, 0x10, 1_000 and -5; 0, 1, 2 and 0.5 are allowed.
          selector:
            'VariableDeclarator > Literal[raw=/^[0-9.]/]:not([value=0]):not([value=1]):not([value=2]):not([value=0.5]), VariableDeclarator > UnaryExpression > Literal[raw=/^[0-9.]/]:not([value=0]):not([value=1]):not([value=2]):not([value=0.5])',
          message: 'Số gameplay phải nằm trong params/*.json (có source). Hằng số toán học/kỹ thuật: thêm // eslint-disable-next-line kèm lý do.',
        },
      ],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Dùng Rng có seed.' }],
      // Gameplay numbers live in params/*.json with a source in the original game.
      'no-magic-numbers': ['error', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true, enforceConst: true, detectObjects: true }],
    },
  },
);
