import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const RENDER_LIBS = ['pixi.js', 'pixi.js/*', 'phaser', 'three', 'three/*', '@babylonjs/*', 'howler'];

// Text typed into view code: a string literal with letters in any script ("Play", "Chơi", "プレイ") at
// a place that puts it on screen. `%` in each selector stands for that literal.
const NO_HARDCODED_TEXT = 'Text hiển thị phải qua t() (Language/*.json). Ảnh có chữ: assets/i18n/<mã>/ + tAsset().';
const hardcoded = (...places) =>
  places.flatMap((p) => [p.replace('%', 'Literal[value=/\\p{L}/u]'), p.replace('%', 'TemplateLiteral:has(TemplateElement[value.raw=/\\p{L}/u])')]).map((selector) => ({ selector, message: NO_HARDCODED_TEXT }));

export default tseslint.config(
  { ignores: ['builds/', 'node_modules/', 'scripts/', '.gamekit/', 'reference/', 'decompiled/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Text on screen comes from Language/*.json through t(), so every language gets it.
    files: ['src/view/**/*.ts', 'src/main.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...hardcoded(
          'CallExpression[callee.property.name=/^(fillText|strokeText|setText|createTextNode)$/] > %.arguments:first-child',
          'CallExpression[callee.property.name="text"] > %.arguments', // Phaser this.add.text(x, y, '…')
          'CallExpression[callee.property.name="setAttribute"][arguments.0.value=/^(aria-label|title|alt|placeholder)$/] > %.arguments:nth-child(2)',
          'AssignmentExpression[left.property.name=/^(textContent|innerText|innerHTML|title|placeholder|alt)$/] > %.right',
          'NewExpression[callee.name=/^(Text|BitmapText|HTMLText)$/] > %.arguments:first-child', // Pixi v7
          'NewExpression[callee.name=/^(Text|BitmapText|HTMLText)$/] Property[key.name="text"] > %.value', // Pixi v8
        ),
      ],
    },
  },
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
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ không đụng DOM.' },
        { name: 'document', message: 'core/ không đụng DOM.' },
        { name: 'performance', message: 'Thời gian lấy từ fixed step.' },
        { name: 'globalThis', message: 'core/ không đụng môi trường chạy.' },
        { name: 'self', message: 'core/ không đụng môi trường chạy.' },
        { name: 'navigator', message: 'core/ không đụng DOM.' },
        { name: 'location', message: 'core/ không đụng DOM.' },
        { name: 'localStorage', message: 'Lưu qua platform.save, không trong core/.' },
        { name: 'sessionStorage', message: 'Lưu qua platform.save, không trong core/.' },
        { name: 'requestAnimationFrame', message: 'Vòng lặp nằm ngoài core/; core chỉ nhận dt.' },
        { name: 'setTimeout', message: 'Hẹn giờ bằng thời gian mô phỏng (dt), không dùng đồng hồ thật.' },
        { name: 'setInterval', message: 'Hẹn giờ bằng thời gian mô phỏng (dt), không dùng đồng hồ thật.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'core/ không đọc đồng hồ thật.' },
        {
          // A named constant is still a gameplay number typed in code; it belongs in params/.
          selector: 'VariableDeclarator > Literal[raw=/^[0-9.]+$/]:not([value=0]):not([value=1]):not([value=2]):not([value=0.5])',
          message: 'Số gameplay phải nằm trong params/*.json (có source). Hằng số toán học/kỹ thuật: thêm // eslint-disable-next-line kèm lý do.',
        },
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
