# Gói build AZGAMES + `builds/{version}/` + hỏi thông tin khi `init` — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gamekit pack` ra gói đúng bố cục B.1 của AZGAMES trong `builds/<YYMMDDNN>/<portal>/`, vỏ portal dùng chung trong plugin, `init`/`config` hỏi thông tin portal kèm giải thích, game có đa ngôn ngữ tối ưu dung lượng và popup Settings có footer bản quyền.

**Architecture:** Plugin thêm `portals/<id>/` (portal.yaml + kit.mjs + shell.html + loader.entry.js + Icons) và `portals/shared/` (loader-core thuần, loader-runtime DOM, loading.html). `pack` = vite build (framework.js) → `assemblePortal()` ráp bố cục, bundle + làm rối loader bằng esbuild/javascript-obfuscator lấy từ `node_modules` của game. `release-check` kiểm bố cục B.1. Câu hỏi init là dữ liệu (`CORE_QUESTIONS` + `settings` của portal.yaml), ba cách trả lời: TTY, `--questions --json` + `--set`, để trống.

**Tech Stack:** Node ≥ 20 ESM (plugin: chỉ `yaml`, `ajv`), node:test; template game: TypeScript, Vite 7, Vitest 3, esbuild, javascript-obfuscator.

**Spec:** `docs/superpowers/specs/2026-10-16-azgames-build-design.md`

**Lệch nhỏ so với spec (có chủ ý):** loader viết bằng JS (`loader.entry.js`, `loader-core.js`, `loader-runtime.js`) thay vì `loader.ts`, để test của plugin (node:test, không TS) import được phần logic thuần. Mỗi bộ vỏ có thêm `kit.mjs` (điền `shell.html`, cấu hình loader riêng của portal) vì phần đó cần code, YAML không đủ.

## Global Constraints

- Plugin chỉ phụ thuộc `yaml` và `ajv`; esbuild và javascript-obfuscator là devDependency của **game** (template).
- Thông báo cho người dùng bằng tiếng Việt; comment code bằng tiếng Anh như code hiện có.
- Lệnh mới: thêm vào `COMMANDS` + `HELP` trong `scripts/gamekit.mjs`, có test trong `tests/cli.test.mjs`.
- Số phiên bản `YYMMDDNN`, 8 chữ số, `01`–`99` mỗi ngày, không ghi đè thư mục đã có.
- Đơn vị upload: `builds/<v>/<portal>/` gồm đúng `index.html`, `preview.html`, `version.txt`, `<v>/`.
- `version.txt` đúng 8 byte, không newline; `preview.html` giống `index.html` từng byte; `index.html` ngoài = `<v>/index.html` + `<base href="<v>/">`.
- `AZ_SETTINGS` đúng 4 khoá theo thứ tự `gameCode, language, gameId, portalGid`.
- Sitelock azgames: host `azgames.io` / `azgame.io` và subdomain; cửa sổ trên cùng thiếu referrer hoặc host lạ → `https://azgames.io/<portalGid>`; iframe có cha không xác định/không được phép → không nạp game.
- Bản quyền: `© {{YEAR}} Azgames.io`, `{{YEAR}}` = `20` + 2 chữ số đầu của số phiên bản; không qua bản dịch.
- Ngôn ngữ: `Language/<mã BCP 47 viết thường>.json`, key phẳng, `{tham số}`, số nhiều `.one/.other/…`, `_meta.name`, `_meta.dir`; `en` bắt buộc.
- Khi sửa template: tạo game thử, chạy test/typecheck/lint/pack/release-check của nó (AGENTS.md).

## Review Focus

1. **Portal chặn `blob:` bằng CSP** → `framework.js` không chạy. Người dùng mong game vẫn vào. `runScript` phải rơi về `<script src="framework.js">` (Task 6). Chưa có test tự động cho nhánh này — khi bàn giao phải nói rõ là chưa kiểm.
2. **localStorage ném lỗi** (Safari private, iframe chặn cookie bên thứ ba) → loader không được chết. `safeStorage()` trong `loader-core.js` có test với storage ném lỗi (Task 5).
3. **Giá trị chứa `</script>` hoặc dấu nháy** chui vào `<script>` inline → trang vỡ hoặc bị chèn mã. `jsString()` có test với `</script>`, `\u2028` (Task 2); test assemble kiểm title có `<>&"` (Task 10).
4. **Ngôn ngữ trình duyệt có vùng/biến thể** (`zh-Hans-CN`, `es-MX`) → phải khớp `zh-hans`, `es` thay vì rơi về `en`. Test `pickLanguage` (Task 5).
5. **File lạ trong `public/`** (vd `TemplateData/` của game cũ) lọt vào gói, sai B.1. `assemblePortal` từ chối (test Task 10), `release-check` bắt file lạ (Task 12).

---

## Cấu trúc file

| File | Trách nhiệm |
| --- | --- |
| `scripts/lib/version.mjs` (mới) | Số phiên bản YYMMDDNN: tính tiếp, kiểm `--version`, bản mới nhất, năm bản quyền |
| `scripts/lib/html.mjs` (mới) | `escapeHtml`, `jsString`, `fillTemplate`, `withBase` |
| `scripts/lib/portals.mjs` (mới) | Đọc bộ vỏ portal, kiểm từng setting (pattern, `gmsoft-signed`), setting còn thiếu, chuỗi bản quyền, chép checklist vào gate |
| `scripts/lib/questions.mjs` (mới) | Câu hỏi init/config, parse/kiểm câu trả lời, `--set`, hỏi trên TTY, điền mặc định, ghép `portalSettings` |
| `scripts/lib/languages.mjs` (mới) | Đọc `Language/*.json`, ráp file ngôn ngữ cho gói |
| `scripts/lib/assemble.mjs` (mới) | Ráp một gói portal (bố cục az-v1) từ đầu ra vite |
| `scripts/config.mjs` (mới) | Lệnh `gamekit config` |
| `portals/shared/loader-core.js` (mới) | Quyết định thuần của loader: sitelock, chọn ngôn ngữ, %, storage an toàn |
| `portals/shared/loader-runtime.js` (mới) | Loader chạy trong trang: tải song song, màn loading, giao cho game, thử lại |
| `portals/shared/loading.html` (mới) | HTML + CSS màn loading (dùng chung) |
| `portals/azgames/{portal.yaml, kit.mjs, shell.html, loader.entry.js, Icons/domain.webp}` (mới) | Vỏ AZGAMES |
| `portals/dev-mock/{…}` (mới) | Vỏ dev-mock (không sitelock, không SDK) |
| `scripts/init.mjs`, `scripts/pack.mjs`, `scripts/release-check.mjs`, `scripts/validate.mjs`, `scripts/status.mjs`, `scripts/gamekit.mjs`, `scripts/lib/png.mjs` | Sửa |
| `schemas/game.schema.json` | Thêm `portalSettings`, `language`, `languages` |
| `templates/game/…` | Language, i18n, Settings, Platform.info, adapter azgames, dev-loader, vite config, Icons, bỏ TemplateData, builds/ |
| `tests/helpers.mjs`, `tests/build.test.mjs` (mới), `tests/loader-core.test.mjs` (mới), `tests/cli.test.mjs` | Test |

---

### Task 0: Chuẩn bị nhánh

- [ ] **Step 1:** Đảm bảo phần parity của lần trước đã được commit theo quyết định của người dùng (`git status` sạch hoặc chỉ còn thay đổi mode của `templates/game/.githooks/pre-commit`).
- [ ] **Step 2:** `git checkout -b feat/azgames-build`
- [ ] **Step 3:** `npm ci` rồi `npm test` — ghi lại baseline (test symlink EPERM trên Windows là lỗi môi trường có sẵn).

---

### Task 1: Số phiên bản `YYMMDDNN`

**Files:**
- Create: `scripts/lib/version.mjs`
- Test: `tests/build.test.mjs`

**Interfaces:**
- Produces: `nextVersion(existing: string[], date?: Date): string`, `checkVersion(v: string, existing: string[]): string`, `latestVersion(existing: string[]): string|null`, `copyrightYear(v: string): string`, `VERSION_RE`.

- [ ] **Step 1: Viết test**

`tests/build.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion, checkVersion, latestVersion, copyrightYear } from '../scripts/lib/version.mjs';

test('version: YYMMDDNN from the build date, next number of the day, capped at 99', () => {
  const d = new Date(2026, 9, 16); // 16/10/2026, giờ máy
  assert.equal(nextVersion([], d), '26101601');
  assert.equal(nextVersion(['26101601', '26101602', '26101501', '.vite-x', 'manifest.json'], d), '26101603');
  assert.equal(nextVersion(['26101599'], d), '26101601');
  assert.throws(() => nextVersion(['26101699'], d), /99/);
  assert.equal(checkVersion('26101605', ['26101601']), '26101605');
  assert.throws(() => checkVersion('2610160', []), /8 chữ số/);
  assert.throws(() => checkVersion('26101601', ['26101601']), /đã có/);
  assert.equal(latestVersion(['26101601', '26101702', 'x']), '26101702');
  assert.equal(latestVersion([]), null);
  assert.equal(copyrightYear('26101601'), '2026');
});
```

- [ ] **Step 2: Chạy, thấy đỏ** — `node --test tests/build.test.mjs` → FAIL `Cannot find module '../scripts/lib/version.mjs'`.

- [ ] **Step 3: Viết code**

`scripts/lib/version.mjs`:
```js
// Build numbers: YYMMDDNN = build date (local time) + sequence within the day, e.g. 26101601.
import { GkError } from './log.mjs';

export const VERSION_RE = /^\d{8}$/;
const pad = (n) => String(n).padStart(2, '0');
const datePrefix = (d) => `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Next free build number for `date`, given the folder names already in builds/. */
export function nextVersion(existing, date = new Date()) {
  const prefix = datePrefix(date);
  const used = existing.filter((v) => VERSION_RE.test(v) && v.startsWith(prefix)).map((v) => Number(v.slice(6)));
  const n = used.length ? Math.max(...used) + 1 : 1;
  if (n > 99) throw new GkError(`Đã có 99 bản build trong ngày ${prefix} — dùng --version để chỉ định`);
  return `${prefix}${pad(n)}`;
}

/** A --version given by hand: 8 digits and never an existing build (builds are not overwritten). */
export function checkVersion(v, existing) {
  const s = String(v);
  if (!VERSION_RE.test(s)) throw new GkError(`--version phải là 8 chữ số YYMMDDNN, nhận "${s}"`);
  if (existing.includes(s)) throw new GkError(`builds/${s} đã có — không ghi đè bản build cũ`);
  return s;
}

export const latestVersion = (existing) => existing.filter((v) => VERSION_RE.test(v)).sort().at(-1) ?? null;

/** Copyright year of a build: 2026 for 26101601. */
export const copyrightYear = (v) => `20${String(v).slice(0, 2)}`;
```

- [ ] **Step 4: Chạy, thấy xanh** — `node --test tests/build.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `git add scripts/lib/version.mjs tests/build.test.mjs && git commit -m "feat(pack): số phiên bản YYMMDDNN"`

---

### Task 2: Escape HTML/JS và template

**Files:**
- Create: `scripts/lib/html.mjs`
- Test: `tests/build.test.mjs`

**Interfaces:**
- Produces: `escapeHtml(s)`, `jsString(s)` (chuỗi JS có ngoặc kép, an toàn trong `<script>`), `fillTemplate(text, vars)` (thiếu biến → `GkError`), `withBase(html, version)`.

- [ ] **Step 1: Viết test** (thêm vào `tests/build.test.mjs`, thêm import `import { escapeHtml, jsString, fillTemplate, withBase } from '../scripts/lib/html.mjs';`)
```js
test('html: values are escaped for where they land; unknown placeholders fail', () => {
  assert.equal(escapeHtml(`Zombie <Run> & "Co" 'x'`), 'Zombie &lt;Run&gt; &amp; &quot;Co&quot; &#39;x&#39;');
  const js = jsString('a</script><script>alert(1)\u2028"');
  assert.doesNotMatch(js, /<\/script>/i);
  assert.doesNotMatch(js, /\u2028/);
  assert.equal(JSON.parse(js.replace(/\\u003c/g, '<')), 'a</script><script>alert(1)\u2028"');
  assert.equal(fillTemplate('<b>{{A}}</b>{{B_C}}', { A: '1', B_C: '{{A}}' }), '<b>1</b>{{A}}', 'một lượt, không thay lại giá trị đã chèn');
  assert.throws(() => fillTemplate('{{MISSING}}', {}), /MISSING/);
  assert.equal(withBase('<html><head>\n<title>x</title>', '26101601'), '<html><head>\n    <base href="26101601/">\n<title>x</title>');
  assert.throws(() => withBase('<html>', '26101601'), /<head>/);
});
```
- [ ] **Step 2: Chạy, thấy đỏ** — FAIL không tìm thấy module.
- [ ] **Step 3: Viết code** `scripts/lib/html.mjs`:
```js
// Escaping and placeholder filling for the portal shell page.
import { GkError } from './log.mjs';

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A double-quoted JS string literal that is safe inside an inline <script>. */
export const jsString = (s) =>
  JSON.stringify(String(s)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Replace {{KEY}} in one pass; a placeholder without a value is an error so a typo never ships. */
export function fillTemplate(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new GkError(`Template thiếu giá trị cho {{${k}}}`);
    return vars[k];
  });
}

/** Root page of a package: the same page, resolved against the version folder. */
export function withBase(html, version) {
  if (!/<head>/i.test(html)) throw new GkError('shell.html không có <head>');
  return html.replace(/<head>/i, `<head>\n    <base href="${version}/">`);
}
```
- [ ] **Step 4: Chạy, thấy xanh.**
- [ ] **Step 5: Commit** — `git commit -am "feat(pack): escape và điền template cho trang vỏ portal"` (nhớ `git add scripts/lib/html.mjs`).

---

### Task 3: Bộ vỏ portal — cấu hình và kiểm setting

**Files:**
- Create: `portals/azgames/portal.yaml`, `portals/dev-mock/portal.yaml`, `portals/azgames/Icons/domain.webp`, `portals/dev-mock/Icons/domain.webp`, `scripts/lib/portals.mjs`
- Modify: `tests/helpers.mjs` (thêm `solidPng`, `tinyWebp`, `token`, `editYaml`)
- Test: `tests/build.test.mjs`

**Interfaces:**
- Consumes: `copyrightYear` (Task 1).
- Produces: `PORTALS_DIR`, `listPortals(): string[]`, `loadPortal(id): {id, dir, config}`, `checkSetting(kit, key, value): string|null`, `missingSettings(kit, values): string[]`, `copyrightFor(kit, version): string`, `applyPortalChecklists(root, portals): void`. Helpers test: `solidPng(w, h): Buffer`, `tinyWebp(): Buffer`, `token(obj): string`, `editYaml(dir, fn)`.

- [ ] **Step 1: Thêm helper test** — cuối `tests/helpers.mjs`:
```js
import zlib from 'node:zlib';
import YAML from 'yaml';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A valid RGBA PNG of one colour — test fixtures and template placeholders. */
export function solidPng(w, h, rgba = [79, 179, 255, 255]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgba)))]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** Smallest valid lossless WebP (1×1). */
export const tinyWebp = () => Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
/** A GMSOFT_SIGNED-shaped token. */
export const token = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
export const editYaml = (dir, fn) => {
  const f = path.join(dir, 'game.yaml');
  const data = YAML.parse(fs.readFileSync(f, 'utf8'));
  fn(data);
  fs.writeFileSync(f, YAML.stringify(data));
};
```

- [ ] **Step 2: Viết test** (thêm vào `tests/build.test.mjs`; import `{ listPortals, loadPortal, checkSetting, missingSettings, copyrightFor }` từ `../scripts/lib/portals.mjs` và `{ token }` từ `./helpers.mjs`)
```js
test('portal kits: azgames settings, patterns and the GMSOFT_SIGNED token', () => {
  assert.deepEqual(listPortals(), ['azgames', 'dev-mock']);
  const az = loadPortal('azgames');
  assert.deepEqual(missingSettings(az, { gameCode: 'g205' }), ['gameId', 'portalGid', 'signed']);
  assert.equal(checkSetting(az, 'gameId', 'ten-game-az'), null);
  assert.match(checkSetting(az, 'gameId', 'ten-game'), /sai định dạng/);
  assert.equal(checkSetting(az, 'portalGid', 'ten-game'), null);
  assert.match(checkSetting(az, 'portalGid', 'ten-game-az'), /sai định dạng/);
  assert.equal(checkSetting(az, 'signed', token({ signed: 'x', domain: 'azgame.io' })), null);
  assert.match(checkSetting(az, 'signed', '@@ không phải base64 @@'), /giải mã/);
  assert.match(checkSetting(az, 'signed', token({ signed: 'x' })), /domain/);
  assert.match(checkSetting(az, 'signed', token({ signed: 'x', domain: 'evil.com' })), /evil\.com/);
  assert.match(checkSetting(az, 'nope', 'x'), /khoá lạ/);
  assert.equal(checkSetting(az, 'gameCode', null), null, 'thiếu giá trị do missingSettings xử lý');
  assert.equal(copyrightFor(az, '26101601'), '© 2026 Azgames.io');
  const dev = loadPortal('dev-mock');
  assert.deepEqual(missingSettings(dev, {}), []);
  assert.equal(copyrightFor(dev, '27010101'), '© 2027 GameKit (dev)');
  assert.throws(() => loadPortal('../x'), /Không có bộ vỏ/);
});
```
- [ ] **Step 3: Chạy, thấy đỏ.**
- [ ] **Step 4: Tạo cấu hình portal**

`portals/azgames/portal.yaml`:
```yaml
# Bộ vỏ AZGAMES — dùng chung cho mọi game. Spec: docs/superpowers/specs/2026-10-16-azgames-build-design.md
name: AZGAMES
layout: az-v1
# Host được phép trong gói (script SDK, canonical, chuyển hướng sitelock)
allowedHosts: [gm.azgame.io, api.azgame.io, azgames.io]
# Sitelock: game chỉ chạy trên các domain này và subdomain của chúng
sitelock: [azgames.io, azgame.io]
copyright: "© {{YEAR}} Azgames.io"
# File của bộ vỏ còn là placeholder — release-check cảnh báo. Xoá dòng khi đã có logo thật.
placeholders: [Icons/domain.webp]
checklist:
  - Popup Settings có footer "© <năm> Azgames.io", hiện ở mọi ngôn ngữ (bạn)
settings:
  gameCode:
    label: Mã game
    description: Mã game do bên vận hành portal cấp. Dùng làm key localStorage `azgames.<gameCode>` (tiến trình, ngôn ngữ đã chọn).
    example: g205
    required: true
    pattern: "^[a-z0-9]+$"
  gameId:
    label: Id game trên SDK
    description: Id game trên SDK, kết thúc bằng -az. GMGameSDK.init dùng cho analytics, leaderboard.
    example: ten-game-az
    default: "{{NAME}}-az"
    required: true
    pattern: "^[a-z0-9-]+-az$"
  portalGid:
    label: Slug trang game trên portal
    description: Slug trang game trên portal, không có -az. gmsdkv2 dùng cho More Games, quảng cáo; sitelock chuyển hướng về azgames.io/<portalGid>.
    example: ten-game
    default: "{{NAME}}"
    required: true
    pattern: "^[a-z0-9-]+(?<!-az)$"
  signed:
    label: Token ký của portal (GMSOFT_SIGNED)
    description: Token do bên vận hành portal cấp riêng cho từng game, chứa domain được phép; gmsdkv2 kiểm tra trước khi bật quảng cáo, More Games. Dán nguyên chuỗi base64.
    required: true
    check: gmsoft-signed
```

`portals/dev-mock/portal.yaml`:
```yaml
# Bộ vỏ dev-mock: cùng bố cục az-v1, không sitelock, SDK giả — để chạy thử gói ở máy (localhost, file://).
name: GameKit dev-mock
layout: az-v1
allowedHosts: []
sitelock: null
copyright: "© {{YEAR}} GameKit (dev)"
checklist: []
settings: {}
```

Icon placeholder (cả hai bộ vỏ):
```bash
node --input-type=module -e "import fs from 'node:fs'; import { tinyWebp } from './tests/helpers.mjs'; for (const p of ['azgames', 'dev-mock']) { fs.mkdirSync('portals/' + p + '/Icons', { recursive: true }); fs.writeFileSync('portals/' + p + '/Icons/domain.webp', tinyWebp()); }"
```

- [ ] **Step 5: Viết code** `scripts/lib/portals.mjs`:
```js
// Portal kits: gamekit/portals/<id>/ — the shell page, loader and settings every game shares for that portal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readYaml } from './io.mjs';
import { GkError } from './log.mjs';
import { copyrightYear } from './version.mjs';

export const PORTALS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../portals');

export const listPortals = () =>
  fs.readdirSync(PORTALS_DIR).filter((d) => exists(path.join(PORTALS_DIR, d, 'portal.yaml'))).sort();

export function loadPortal(id) {
  const dir = path.join(PORTALS_DIR, String(id));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id)) || !exists(path.join(dir, 'portal.yaml')))
    throw new GkError(`Không có bộ vỏ portal "${id}" (có: ${listPortals().join(', ')})`);
  return { id, dir, config: readYaml(path.join(dir, 'portal.yaml')) };
}

const CHECKS = {
  // GMSOFT_SIGNED: base64 of a JSON with `signed` and `domain`; the domain must be one the sitelock allows.
  'gmsoft-signed': (value, kit) => {
    let data;
    try {
      data = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
      return 'không giải mã được (cần chuỗi base64 của JSON)';
    }
    if (!data || typeof data !== 'object' || !data.signed || typeof data.domain !== 'string') return 'thiếu trường signed hoặc domain';
    const domains = kit.config.sitelock ?? [];
    if (!domains.some((d) => data.domain === d || data.domain.endsWith('.' + d))) return `domain "${data.domain}" không thuộc ${domains.join(', ')}`;
    return null;
  },
};

/** One setting value → why it is wrong, or null. Missing values are reported by missingSettings(). */
export function checkSetting(kit, key, value) {
  const def = kit.config.settings?.[key];
  if (!def) return `khoá lạ "${key}" (portal ${kit.id} có: ${Object.keys(kit.config.settings ?? {}).join(', ') || 'không có'})`;
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return 'phải là chuỗi';
  if (def.pattern && !new RegExp(def.pattern).test(value)) return `sai định dạng (cần khớp ${def.pattern}${def.example ? `, vd ${def.example}` : ''})`;
  if (def.check) return CHECKS[def.check] ? CHECKS[def.check](value, kit) : `kiểm tra lạ "${def.check}"`;
  return null;
}

export const missingSettings = (kit, values = {}) =>
  Object.entries(kit.config.settings ?? {})
    .filter(([k, d]) => d.required && (values?.[k] == null || values[k] === ''))
    .map(([k]) => k);

export const copyrightFor = (kit, version) => String(kit.config.copyright ?? '').replaceAll('{{YEAR}}', copyrightYear(version));

/** Append each portal's checklist to gates/P4.md once, tagged with the portal id. */
export function applyPortalChecklists(root, portals) {
  const file = path.join(root, 'gates', 'P4.md');
  if (!exists(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  for (const p of portals) {
    for (const item of loadPortal(p).config.checklist ?? []) {
      if (!text.includes(`[${p}] ${item}`)) text = `${text.trimEnd()}\n- [ ] [${p}] ${item}\n`;
    }
  }
  fs.writeFileSync(file, text);
}
```
- [ ] **Step 6: Chạy, thấy xanh** — `node --test tests/build.test.mjs`.
- [ ] **Step 7: Commit** — `git add portals scripts/lib/portals.mjs tests && git commit -m "feat(portals): bộ vỏ azgames/dev-mock và kiểm setting portal"`

---

### Task 4: Schema `game.yaml`, câu hỏi, `--set`, hỏi trên TTY

**Files:**
- Create: `scripts/lib/questions.mjs`
- Modify: `scripts/gamekit.mjs` (`parseArgs` gom khoá lặp thành mảng; BOOL thêm `questions`, `json`, `no-input`), `schemas/game.schema.json`, `scripts/init.mjs` (chuyển `ENGINES` sang questions.mjs)
- Test: `tests/build.test.mjs`, `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `listPortals`, `loadPortal`, `checkSetting` (Task 3).
- Produces: `ENGINES`, `LANGUAGE_NAMES`, `allQuestions({name, title}): Question[]` (`Question = {key, label, description, example?, default?, required, type?: 'list', pattern?, enum?, portal?, check?}`; câu portal có `key = '<portal>.<khoá>'`, `portal = '<id>'`), `parseAnswer(q, raw)`, `checkAnswer(q, value): string|null`, `parseSets(sets, questions): Record<string, value>`, `withDefaults(questions, preset)`, `ask(questions, {input, output, preset}): Promise<Record<string, value>>`, `settingsFor(portals, answers, questions, existing?)`.

- [ ] **Step 1: Viết test** (`tests/build.test.mjs`; import từ `../scripts/lib/questions.mjs` và `{ PassThrough }` từ `node:stream`)
```js
test('questions: core + portal questions with defaults filled from the game name', () => {
  const qs = allQuestions({ name: 'ten-game', title: 'Ten Game' });
  const by = Object.fromEntries(qs.map((q) => [q.key, q]));
  assert.equal(by.title.default, 'Ten Game');
  assert.equal(by['azgames.gameId'].default, 'ten-game-az');
  assert.equal(by['azgames.portalGid'].default, 'ten-game');
  assert.equal(by['azgames.gameCode'].portal, 'azgames');
  assert.ok(by['azgames.signed'].description.includes('GMSOFT_SIGNED') || by['azgames.signed'].label.includes('GMSOFT_SIGNED'));
  assert.ok(!qs.some((q) => q.portal === 'dev-mock'), 'dev-mock không có câu hỏi');
});

test('questions: answers are parsed and checked; --set rejects unknown keys and bad values', () => {
  const qs = allQuestions({ name: 'g', title: 'G' });
  const q = (k) => qs.find((x) => x.key === k);
  assert.deepEqual(parseAnswer(q('languages'), ' EN, es ,es'), ['en', 'es']);
  assert.match(checkAnswer(q('languages'), ['en', 'Tiếng Việt']), /sai định dạng/);
  assert.match(checkAnswer(q('engine'), 'gamemaker'), /một trong/);
  assert.match(checkAnswer(q('portals'), ['azgames', 'nope']), /nope/);
  assert.equal(checkAnswer(q('azgames.gameCode'), ''), null, 'câu portal được để trống');
  assert.match(checkAnswer(q('title'), ''), /bắt buộc/);
  assert.deepEqual(parseSets(['azgames.gameCode=g205', 'languages=en,es'], qs), { 'azgames.gameCode': 'g205', languages: ['en', 'es'] });
  assert.throws(() => parseSets(['azgames.nope=1'], qs), /không có câu hỏi/);
  assert.throws(() => parseSets(['azgames.gameId=sai'], qs), /azgames\.gameId/);
  assert.throws(() => parseSets(['khongcodau'], qs), /khoá=giá-trị/);
  assert.deepEqual(withDefaults(qs.filter((x) => !x.portal), { title: 'X' }), { title: 'X', engine: 'unknown', sourcePath: null, portals: ['azgames'], language: 'en', languages: ['en'] });
  assert.deepEqual(settingsFor(['dev-mock', 'azgames'], { 'azgames.gameCode': 'g205' }, qs), { azgames: { gameCode: 'g205', gameId: 'g-az', portalGid: 'g', signed: null } });
  assert.deepEqual(settingsFor(['azgames'], {}, qs, { azgames: { gameCode: 'old', signed: 's' } }).azgames.gameCode, 'old');
});

test('questions: terminal asks one by one, explains, re-asks a wrong answer, Enter takes the default', async () => {
  const qs = allQuestions({ name: 'g', title: 'G' });
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = '';
  output.on('data', (d) => (shown += d));
  // title=Enter, engine=sai→unity, sourcePath=Enter, portals=azgames, language=Enter, languages=en,es,
  // azgames: gameCode=g205, gameId=Enter, portalGid=Enter, signed=Enter (để trống)
  input.end(['', 'gamemaker', 'unity', '', 'azgames', '', 'en,es', 'g205', '', '', ''].join('\n') + '\n');
  const a = await ask(qs, { input, output });
  assert.equal(a.title, 'G');
  assert.equal(a.engine, 'unity');
  assert.deepEqual(a.languages, ['en', 'es']);
  assert.equal(a['azgames.gameCode'], 'g205');
  assert.equal(a['azgames.gameId'], 'g-az');
  assert.equal(a['azgames.signed'], null);
  assert.match(shown, /một trong/, 'giải thích vì sao sai rồi hỏi lại');
  assert.match(shown, /GMGameSDK\.init/, 'có mô tả từng câu');
  assert.match(shown, /\[g-az\]/, 'hiện giá trị mặc định');
});

test('questions: portal questions are skipped for portals not chosen', async () => {
  const qs = allQuestions({ name: 'g', title: 'G' });
  const input = new PassThrough();
  input.end(['', '', '', 'dev-mock', '', ''].join('\n') + '\n');
  const a = await ask(qs, { input, output: new PassThrough() });
  assert.deepEqual(a.portals, ['dev-mock']);
  assert.ok(!('azgames.gameCode' in a));
});
```
Trong `tests/cli.test.mjs` thêm vào test `cli args`:
```js
  assert.deepEqual(parseArgs(['init', 'g', '--set', 'a=1', '--set=b=2']), { _: ['init', 'g'], set: ['a=1', 'b=2'] });
  assert.deepEqual(parseArgs(['init', '--questions', '--json', 'g']), { _: ['init', 'g'], questions: true, json: true });
```
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Sửa `parseArgs`** trong `scripts/gamekit.mjs`:
```js
const BOOL = new Set(['all', 'advance', 'dry-run', 'cleanup', 'compress', 'zip', 'quiet', 'no-git', 'no-install', 'help', 'questions', 'json', 'no-input']);

export function parseArgs(argv) {
  const out = { _: [] };
  // A repeated flag (--set a=1 --set b=2) collects into an array.
  const put = (k, v) => (out[k] = k in out ? [].concat(out[k], v) : v);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) put(k, v);
      else if (!BOOL.has(k) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) put(k, argv[++i]);
      else put(k, true);
    } else out._.push(a);
  }
  return out;
}
```
- [ ] **Step 4: Viết `scripts/lib/questions.mjs`**
```js
// Project questions asked by `init` and `config`: GameKit's own plus each portal kit's settings.
// Answered three ways: on a terminal, as --set key=value (agents), or left empty and asked later.
import readline from 'node:readline';
import { GkError } from './log.mjs';
import { checkSetting, listPortals, loadPortal } from './portals.mjs';

export const ENGINES = ['unknown', 'unity', 'cocos', 'godot', 'unreal', 'flash', 'construct', 'laya', 'html5', 'other'];
export const LANGUAGE_NAMES = {
  en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', 'pt-br': 'Português (Brasil)',
  ru: 'Русский', tr: 'Türkçe', pl: 'Polski', vi: 'Tiếng Việt', id: 'Bahasa Indonesia', th: 'ไทย', ja: '日本語', ko: '한국어',
  'zh-hans': '简体中文', 'zh-hant': '繁體中文', ar: 'العربية', fa: 'فارسی', hi: 'हिन्दी',
};
const LANG_PATTERN = '^[a-z]{2,3}(-[a-z0-9]{2,8})*$';

const CORE_QUESTIONS = () => [
  { key: 'title', label: 'Tên game mới', description: 'Tên hiển thị của bản web. Không dùng tên game gốc (luật cứng: tên và text phải làm mới).', default: '{{TITLE}}', required: true },
  { key: 'engine', label: 'Engine của game gốc', description: `Engine game gốc dùng, để GameKit gợi ý skill phân tích. Một trong: ${ENGINES.join(', ')}.`, default: 'unknown', required: true, enum: ENGINES },
  { key: 'sourcePath', label: 'Đường dẫn game gốc', description: 'Thư mục bản game gốc trên máy — chỉ để phân tích, không bao giờ đóng gói. Để trống nếu chưa có.', required: false },
  { key: 'portals', label: 'Portal phát hành', description: `Các portal sẽ phát hành, cách nhau dấu phẩy. Có: ${listPortals().filter((p) => p !== 'dev-mock').join(', ')}. dev-mock luôn có sẵn để chạy thử.`, default: 'azgames', type: 'list', required: true },
  { key: 'language', label: 'Ngôn ngữ mặc định', description: 'Ngôn ngữ cho người chơi mới khi không đoán được từ trình duyệt. Mã BCP 47 viết thường (en, es, pt-br) — phải có file Language/<mã>.json.', default: 'en', required: true, pattern: LANG_PATTERN },
  { key: 'languages', label: 'Các ngôn ngữ hỗ trợ', description: 'Mã ngôn ngữ cách nhau dấu phẩy. en luôn có (bản gốc của mọi bản dịch). Mỗi mã một file Language/<mã>.json; người chơi chỉ tải một file.', default: 'en', type: 'list', required: true, pattern: LANG_PATTERN },
];

/** Every question for a game; portal questions carry `portal` so only the chosen portals are asked. */
export function allQuestions({ name, title }) {
  const fill = (v) => (typeof v === 'string' ? v.replaceAll('{{NAME}}', name).replaceAll('{{TITLE}}', title) : v);
  const core = CORE_QUESTIONS().map((q) => ({ ...q, default: fill(q.default) }));
  const portal = listPortals().flatMap((id) =>
    Object.entries(loadPortal(id).config.settings ?? {}).map(([k, d]) => ({ key: `${id}.${k}`, portal: id, ...d, default: fill(d.default) })),
  );
  return [...core, ...portal];
}

export function parseAnswer(q, raw) {
  const s = String(raw ?? '').trim();
  if (q.type === 'list') return s ? [...new Set(s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))] : [];
  return s;
}

/** Why an answer is not acceptable, or null. Portal settings may stay empty (asked again by `config`). */
export function checkAnswer(q, value) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  if (q.portal) {
    const [id, ...rest] = q.key.split('.');
    return empty ? null : checkSetting(loadPortal(id), rest.join('.'), value);
  }
  if (empty) return q.required ? 'bắt buộc' : null;
  const items = Array.isArray(value) ? value : [value];
  for (const v of items) {
    if (q.enum && !q.enum.includes(v)) return `phải là một trong: ${q.enum.join(', ')}`;
    if (q.pattern && !new RegExp(q.pattern).test(v)) return `"${v}" sai định dạng (${q.pattern})`;
  }
  if (q.key === 'portals') {
    const unknown = items.filter((p) => !listPortals().includes(p));
    if (unknown.length) return `không có bộ vỏ portal: ${unknown.join(', ')}`;
  }
  return null;
}

/** --set key=value (repeatable). Unknown keys are an error so a typo never passes silently. */
export function parseSets(sets, questions) {
  const out = {};
  for (const s of [].concat(sets ?? []).map(String)) {
    const i = s.indexOf('=');
    if (i < 1) throw new GkError(`--set cần dạng khoá=giá-trị, nhận "${s}"`);
    const key = s.slice(0, i).trim();
    const q = questions.find((x) => x.key === key);
    if (!q) throw new GkError(`--set: không có câu hỏi "${key}" (xem: gamekit init <tên> --questions --json)`);
    const v = parseAnswer(q, s.slice(i + 1));
    const err = checkAnswer(q, v);
    if (err) throw new GkError(`--set ${key}: ${err}`);
    out[key] = v;
  }
  return out;
}

/** Fill unanswered GameKit questions with their defaults (no terminal: agents, CI). */
export function withDefaults(questions, preset) {
  const out = { ...preset };
  for (const q of questions) {
    if (q.portal || q.key in out) continue;
    const v = q.default != null ? parseAnswer(q, q.default) : null;
    out[q.key] = Array.isArray(v) ? v : v || null;
  }
  return out;
}

/** portalSettings for `portals`: answer → existing value → default → null. */
export function settingsFor(portals, answers, questions, existing = {}) {
  const out = structuredClone(existing ?? {});
  for (const q of questions) {
    if (!q.portal || !portals.includes(q.portal)) continue;
    const key = q.key.slice(q.portal.length + 1);
    const cur = out[q.portal]?.[key];
    const v = q.key in answers ? answers[q.key] : cur ?? (q.default || null);
    (out[q.portal] ??= {})[key] = v === '' ? null : v ?? null;
  }
  return out;
}

/**
 * Ask on a terminal, one question at a time: label, description, example, [default].
 * Enter takes the default; a wrong answer is explained and asked again.
 * Portal questions are asked only for the portals chosen in this session (or preset.portals).
 */
export async function ask(questions, { input = process.stdin, output = process.stdout, preset = {} } = {}) {
  const rl = readline.createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const say = (s) => output.write(`${s}\n`);
  const answers = {};
  try {
    for (const q of questions) {
      if (q.key in preset) {
        answers[q.key] = preset[q.key];
        continue;
      }
      if (q.portal && !(answers.portals ?? preset.portals ?? []).includes(q.portal)) continue;
      say(`\n${q.label}${q.required && !q.portal ? '' : ' (có thể để trống)'}`);
      say(`  ${q.description}`);
      if (q.example) say(`  Ví dụ: ${q.example}`);
      for (;;) {
        output.write(`> ${q.default ? `[${q.default}] ` : ''}`);
        const { value: line, done } = await lines.next();
        const v = parseAnswer(q, done || !String(line).trim() ? q.default ?? '' : line);
        const err = checkAnswer(q, v);
        if (!err) {
          answers[q.key] = Array.isArray(v) ? v : v || null;
          break;
        }
        say(`  ✘ ${err}`);
        if (done) throw new GkError(`Hết input khi đang hỏi "${q.label}"`);
      }
    }
  } finally {
    rl.close();
  }
  return answers;
}
```
- [ ] **Step 5: Schema** — trong `schemas/game.schema.json`, sau `"portals": {…},` thêm:
```json
    "portalSettings": {
      "type": "object",
      "description": "Thông tin từng portal cần khi đóng gói (gamekit config). Khoá hợp lệ khai báo trong portals/<id>/portal.yaml của plugin",
      "propertyNames": { "pattern": "^[a-z0-9][a-z0-9-]*$" },
      "additionalProperties": { "type": "object", "additionalProperties": { "type": ["string", "null"] } }
    },
    "language": {
      "type": "string",
      "pattern": "^[a-z]{2,3}(-[a-z0-9]{2,8})*$",
      "description": "Ngôn ngữ mặc định cho người chơi mới; phải nằm trong languages"
    },
    "languages": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[a-z]{2,3}(-[a-z0-9]{2,8})*$" },
      "minItems": 1,
      "uniqueItems": true,
      "description": "Ngôn ngữ phát hành, mỗi mã một file Language/<mã>.json; en bắt buộc"
    },
```
Trong `scripts/init.mjs`: xoá hằng `ENGINES` cục bộ, `import { ENGINES } from './lib/questions.mjs';`.
- [ ] **Step 6: Chạy, thấy xanh** — `npm test` (mọi test cũ vẫn xanh trừ symlink EPERM).
- [ ] **Step 7: Commit** — `git add -A scripts schemas tests && git commit -m "feat(init): câu hỏi dự án dạng dữ liệu, --set, hỏi trên terminal"`

---

### Task 5: Loader — phần quyết định thuần

**Files:**
- Create: `portals/shared/loader-core.js`
- Test: `tests/loader-core.test.mjs`

**Interfaces:**
- Produces: `isAllowedHost(host, domains)`, `hostOf(url)`, `sitelockDecision({isTop, host, referrer, parentHost, domains}): 'run'|'redirect'|'block'`, `pickLanguage({saved, query, browser, fallback, available}): string`, `progressPercent(received, total): number`, `safeStorage(getStorage): {get(k), set(k, v)}`.

- [ ] **Step 1: Viết test** `tests/loader-core.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitelockDecision, pickLanguage, progressPercent, safeStorage, isAllowedHost } from '../portals/shared/loader-core.js';

const domains = ['azgames.io', 'azgame.io'];

test('sitelock: top window needs an allowed host and a referrer', () => {
  const top = (host, referrer) => sitelockDecision({ isTop: true, host, referrer, parentHost: '', domains });
  assert.equal(top('azgames.io', 'https://azgames.io/x'), 'run');
  assert.equal(top('gamea.azgame.io', 'https://www.google.com/'), 'run');
  assert.equal(top('azgames.io', ''), 'redirect');
  assert.equal(top('evil.com', 'https://azgames.io/'), 'redirect');
  assert.equal(top('notazgames.io', 'https://azgames.io/'), 'redirect');
  assert.equal(isAllowedHost('AZGAMES.IO', domains), true);
});

test('sitelock: an iframe needs a known, allowed parent', () => {
  const frame = (parentHost, referrer) => sitelockDecision({ isTop: false, host: 'gamea.azgame.io', referrer, parentHost, domains });
  assert.equal(frame('azgames.io', ''), 'run');
  assert.equal(frame('', 'https://www.azgames.io/game'), 'run');
  assert.equal(frame('', 'https://evil.com/'), 'block');
  assert.equal(frame('', ''), 'block');
  assert.equal(frame('', 'không phải url'), 'block');
});

test('language: saved → ?lang → browser → default → en, region variants match', () => {
  const available = ['en', 'es', 'pt-br', 'zh-hans'];
  const pick = (o) => pickLanguage({ available, fallback: 'en', browser: [], ...o });
  assert.equal(pick({ saved: 'es', query: 'pt-br' }), 'es');
  assert.equal(pick({ saved: 'fr', query: 'PT-BR' }), 'pt-br');
  assert.equal(pick({ browser: ['fr-FR', 'pt-BR'] }), 'pt-br');
  assert.equal(pick({ browser: ['zh-Hans-CN'] }), 'zh-hans');
  assert.equal(pick({ browser: ['es-MX'] }), 'es');
  assert.equal(pick({ browser: ['de'], fallback: 'es' }), 'es');
  assert.equal(pick({}), 'en');
  assert.equal(pickLanguage({ available: ['es'], browser: [], fallback: 'de' }), 'es', 'không có en thì lấy mã đầu tiên');
});

test('progress and storage never throw', () => {
  assert.equal(progressPercent(50, 200), 25);
  assert.equal(progressPercent(500, 200), 100);
  assert.equal(progressPercent(5, 0), 0);
  const broken = safeStorage(() => {
    throw new Error('SecurityError');
  });
  assert.equal(broken.get('k'), null);
  broken.set('k', 'v');
  const throwing = safeStorage(() => ({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('quota'); } }));
  assert.equal(throwing.get('k'), null);
  throwing.set('k', 'v');
  const m = new Map();
  const ok = safeStorage(() => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }));
  ok.set('a', 'b');
  assert.equal(ok.get('a'), 'b');
});
```
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Viết code** `portals/shared/loader-core.js`:
```js
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
```
- [ ] **Step 4: Chạy, thấy xanh.**
- [ ] **Step 5: Commit** — `git add portals/shared tests/loader-core.test.mjs && git commit -m "feat(portals): logic thuần của loader (sitelock, ngôn ngữ, tiến trình)"`

---

### Task 6: Loader chạy trong trang, trang vỏ và `kit.mjs`

Không có test tự động cho phần DOM (giống luật `view/` của GameKit); kiểm qua test assemble (Task 10) và chạy thật (Task 13).

**Files:**
- Create: `portals/shared/loader-runtime.js`, `portals/shared/loading.html`, `portals/azgames/shell.html`, `portals/azgames/kit.mjs`, `portals/azgames/loader.entry.js`, `portals/dev-mock/shell.html`, `portals/dev-mock/kit.mjs`, `portals/dev-mock/loader.entry.js`

**Interfaces:**
- Consumes: `pickLanguage`, `progressPercent`, `safeStorage`, `sitelockDecision` (Task 5); `escapeHtml`, `jsString`, `fillTemplate` (Task 2).
- Produces: mỗi `kit.mjs` export `renderShell({game, settings, version}): string` và `loaderConfig({game, settings, version}): {storageKey, …}`. Cấu hình loader (`__GK_LOADER__`, do Task 10 ghép): `{ version, languages: [{code, name}], defaultLanguage, sizes: { framework, lang: {code: bytes} }, copyright, sitelock: string[]|null, storageKey, gameId?, portalGid? }`. Trong trang: `window.GM_LANG = {code, dict, available}`, `window.GM_LOADER = {copyright, version, setLanguage(code), ready()}`.

- [ ] **Step 1:** `portals/shared/loader-runtime.js`:
```js
// Page loader shared by every portal kit: choose the language, download framework.js + Language/<code>.json
// in parallel with real byte progress, hand over to the game, offer a retry on failure.
// Portal entries add sitelock and SDK hooks around runLoader().
import { pickLanguage, progressPercent, safeStorage } from './loader-core.js';

const ALMOST = 99;

export function runLoader(cfg, hooks = {}) {
  const root = document.getElementById('gmLoader');
  const fill = document.getElementById('gmLoaderFill');
  const info = root && root.querySelector('.gmLoaderInfo');
  const start = typeof window.GM_LOAD_START === 'number' ? window.GM_LOAD_START : performance.now();
  const storage = safeStorage(() => window.localStorage);

  const setProgress = (p) => {
    if (!root) return;
    root.classList.add('gmIsLoading');
    if (fill) fill.style.width = `${p}%`;
    if (p >= ALMOST) {
      root.classList.add('gmAlmost');
      if (info) info.textContent = 'Almost there...';
    } else if (info) info.textContent = `${p}%`;
  };

  const code = pickLanguage({
    saved: storage.get(cfg.storageKey),
    query: new URLSearchParams(location.search).get('lang'),
    browser: navigator.languages || [navigator.language],
    fallback: cfg.defaultLanguage,
    available: cfg.languages.map((l) => l.code),
  });

  let readyDone = false;
  window.GM_LOADER = {
    copyright: cfg.copyright,
    version: cfg.version,
    setLanguage(next) {
      storage.set(cfg.storageKey, next);
      location.reload();
    },
    ready() {
      if (readyDone) return;
      readyDone = true;
      if (root) root.style.display = 'none';
      window.focus();
      if (hooks.onReady) hooks.onReady(Math.round(performance.now() - start));
    },
  };

  const total = cfg.sizes.framework + (cfg.sizes.lang[code] || 0);
  let received = 0;
  const onChunk = (n) => {
    received += n;
    setProgress(progressPercent(received, total));
  };

  const load = async () => {
    if (root) root.classList.remove('gmHasError');
    received = 0;
    const [frameworkCode, dictText] = await Promise.all([fetchText('framework.js', onChunk), fetchText(`Language/${code}.json`, onChunk)]);
    window.GM_LANG = { code, dict: JSON.parse(dictText), available: cfg.languages };
    setProgress(ALMOST);
    await runScript(frameworkCode);
  };
  const attempt = () =>
    load().catch((e) => {
      console.error('[loader]', e);
      if (root) root.classList.add('gmHasError');
    });
  const retry = document.getElementById('gmLoaderRetry');
  if (retry) retry.onclick = attempt;

  const art = root && root.querySelector('.gmLoaderThumb');
  if (art) {
    if (art.complete && art.naturalWidth) tintFromArt(art, root);
    else art.addEventListener('load', () => tintFromArt(art, root));
  }
  attempt();
}

async function fetchText(url, onChunk) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!res.body || !res.body.getReader) {
    const t = await res.text();
    onChunk(t.length);
    return t;
  }
  const reader = res.body.getReader();
  const parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onChunk(value.byteLength);
  }
  return new Blob(parts).text();
}

/**
 * Run the downloaded framework.js from memory (no second download). If the portal's CSP forbids
 * blob: scripts, fall back to a normal <script src> — served from the HTTP cache in most setups.
 */
function runScript(code) {
  const inject = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`không chạy được ${src}`));
      document.body.appendChild(s);
    });
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  return inject(url)
    .catch(() => inject('framework.js'))
    .finally(() => URL.revokeObjectURL(url));
}

/** Progress bar colours from the loading art (GM Loader v1): up to 3 vivid, distinct colours. */
function tintFromArt(img, root) {
  try {
    const n = 32;
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (d[i + 3] < 200 || mx < 50 || mx - mn < 40) continue;
      const k = `${r >> 5},${g >> 5},${b >> 5}`;
      const e = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      bins.set(k, e);
    }
    const order = [...bins.values()]
      .map((e) => {
        const v = [e.r / e.n, e.g / e.n, e.b / e.n];
        const m = Math.max(...v);
        return { v, n: e.n, s: e.n * Math.pow((m - Math.min(...v)) / m, 1.5) };
      })
      .sort((a, b) => b.s - a.s);
    const bright = (v) => {
      const m = Math.max(...v) || 1, f = m < 225 ? 225 / m : 1, avg = (v[0] + v[1] + v[2]) / 3;
      return v.map((x) => Math.max(0, Math.min(255, Math.round((avg + (x - avg) * 1.3) * f))));
    };
    const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 90;
    const pick = [];
    for (const e of order) {
      if (pick.length === 3 || e.n < 3) break;
      const col = bright(e.v);
      if (pick.every((p) => far(p, col))) pick.push(col);
    }
    if (!pick.length) return;
    while (pick.length < 3) pick.push(pick[0].map((x) => Math.round(x + (255 - x) * pick.length * 0.22)));
    pick.forEach((col, i) => root.style.setProperty(`--gm-c${i + 1}`, col.join(',')));
  } catch {
    /* CORS or broken image: keep the default colours */
  }
}
```

- [ ] **Step 2:** `portals/shared/loading.html` (điền `{{TITLE}}`, `{{VERSION}}`; chữ trên màn loading bằng tiếng Anh vì người chơi quốc tế):
```html
    <style>
      html, body { margin: 0; height: 100%; background: #0d0f12; overflow: hidden; }
      #gmLoader { --gm-c1: 167,139,250; --gm-c2: 129,140,248; --gm-c3: 236,72,153; position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; color: #fff; font: 600 16px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0d0f12; }
      .gmLoaderBackdrop { position: absolute; inset: -24px; background: center / cover no-repeat; filter: blur(18px) brightness(.35); }
      .gmLoaderStage { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; width: min(80vw, 360px); }
      .gmLoaderThumb { width: min(40vw, 180px); aspect-ratio: 1; object-fit: cover; border-radius: 22px; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
      .gmLoaderTitle { margin: 0; font-size: 22px; font-weight: 800; text-align: center; }
      .gmLoaderProgress { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
      .gmLoaderSpinner { width: 28px; height: 28px; border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; border-radius: 50%; animation: gmSpin .9s linear infinite; }
      .gmLoaderBar { display: none; width: 100%; height: 10px; border-radius: 5px; background: rgba(255,255,255,.15); overflow: hidden; }
      #gmLoaderFill { width: 0; height: 100%; background: linear-gradient(90deg, rgb(var(--gm-c1)), rgb(var(--gm-c2)), rgb(var(--gm-c3))); transition: width .2s; }
      #gmLoader.gmIsLoading .gmLoaderSpinner { display: none; }
      #gmLoader.gmIsLoading .gmLoaderBar { display: block; }
      #gmLoaderError { display: none; text-align: center; }
      #gmLoader.gmHasError #gmLoaderError { display: block; }
      #gmLoader.gmHasError .gmLoaderProgress { display: none; }
      #gmLoaderRetry { margin-top: 8px; padding: 8px 18px; border: 0; border-radius: 8px; font: inherit; cursor: pointer; }
      .gmLoaderBrand { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); height: 28px; opacity: .85; }
      .gmLoaderVersion { position: absolute; right: 10px; bottom: 6px; font-size: 11px; opacity: .5; }
      @keyframes gmSpin { to { transform: rotate(360deg); } }
    </style>
    <div id="gmLoader">
      <div class="gmLoaderBackdrop" style="background-image: url('Icons/loading.webp')"></div>
      <div class="gmLoaderStage">
        <img class="gmLoaderThumb" src="Icons/loading.webp" alt="{{TITLE}}">
        <h1 class="gmLoaderTitle">{{TITLE}}</h1>
        <div class="gmLoaderProgress">
          <div class="gmLoaderSpinner" aria-hidden="true"></div>
          <div class="gmLoaderBar"><div id="gmLoaderFill"></div></div>
          <div class="gmLoaderInfo">Loading...</div>
        </div>
        <div id="gmLoaderError" role="alert">
          <div>Could not load the game.</div>
          <button id="gmLoaderRetry" type="button">Retry</button>
        </div>
      </div>
      <img class="gmLoaderBrand" src="Icons/domain.webp" alt="" aria-hidden="true">
      <div class="gmLoaderVersion">{{VERSION}}</div>
      <!--PRODUCT_VERSION:{{VERSION}}END-->
    </div>
```

- [ ] **Step 3:** `portals/azgames/shell.html`:
```html
<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="https://azgames.io/{{PORTAL_GID}}">
    <link rel="icon" href="Icons/web.png">
    <title>{{TITLE}}</title>
</head>
<body>
{{LOADING}}
    <script>
{{SETTINGS_SCRIPT}}
    </script>
    <script src="https://gm.azgame.io/sdk/v3/gm-sdk.js"></script>
    <script src="https://gm.azgame.io/sdk/v3/gm-iframe.js"></script>
    <script id="gmsoft-jssdk" src="https://api.azgame.io/static/lib/azgames/gmsdkv2.js"></script>
    <link rel="stylesheet" href="css/style.css">
    <script src="loader.js" defer></script>
</body>
</html>
```

- [ ] **Step 4:** `portals/azgames/kit.mjs`:
```js
// AZGAMES kit: fills shell.html and the portal-specific part of the loader config for one build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fillTemplate, jsString } from '../../scripts/lib/html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, rel), 'utf8');

export function renderShell({ game, settings, version }) {
  const title = escapeHtml(game.title);
  const lang = game.language ?? 'en';
  // The AZGAMES settings block, exactly the four keys and comments the portal documents.
  const settingsScript = [
    '        /* ===== AZGAMES SETTINGS ===== */',
    '        window.AZ_SETTINGS = {',
    '          // Game code from the portal operator. Used as the localStorage key: azgames.<gameCode>',
    `          gameCode:  ${jsString(settings.gameCode)},`,
    '          // Default language for new players. Must match a file in Language/ (en -> Language/en.json)',
    `          language:  ${jsString(lang)},`,
    '          // SDK game id (ends with -az). Used by GMGameSDK.init: analytics events, leaderboard',
    `          gameId:    ${jsString(settings.gameId)},`,
    '          // Portal slug (no -az). Used by gmsdkv2.js: More Games, ads, portal redirect',
    `          portalGid: ${jsString(settings.portalGid)}`,
    '        };',
    '        /* =========================== */',
    `        window.GM_GAME = { id: ${jsString(settings.gameId)}, version: ${jsString(version)} };`,
    '        window.GM_LOAD_START = performance.now();',
    '        window["GMSOFT_SDKTYPE"] = "gm";',
    `        window["GMSOFT_SIGNED"] = ${jsString(settings.signed)};`,
  ].join('\n');
  return fillTemplate(read('shell.html'), {
    LANG: escapeHtml(lang),
    TITLE: title,
    PORTAL_GID: escapeHtml(settings.portalGid),
    SETTINGS_SCRIPT: settingsScript,
    LOADING: fillTemplate(read('../shared/loading.html'), { TITLE: title, VERSION: escapeHtml(version) }),
  });
}

export const loaderConfig = ({ settings }) => ({
  storageKey: `azgames.${settings.gameCode}.lang`,
  gameId: settings.gameId,
  portalGid: settings.portalGid,
});
```

- [ ] **Step 5:** `portals/azgames/loader.entry.js`:
```js
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
```

- [ ] **Step 6:** `portals/dev-mock/shell.html` — như azgames nhưng không canonical, không script SDK:
```html
<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="robots" content="noindex, nofollow">
    <link rel="icon" href="Icons/web.png">
    <title>{{TITLE}}</title>
</head>
<body>
{{LOADING}}
    <script>
{{SETTINGS_SCRIPT}}
    </script>
    <link rel="stylesheet" href="css/style.css">
    <script src="loader.js" defer></script>
</body>
</html>
```
`portals/dev-mock/kit.mjs`:
```js
// dev-mock kit: same az-v1 layout, no sitelock, no portal SDK — runs on localhost / file://.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fillTemplate, jsString } from '../../scripts/lib/html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, rel), 'utf8');

export function renderShell({ game, version }) {
  const title = escapeHtml(game.title);
  const settingsScript = [
    `        window.GM_GAME = { id: ${jsString(game.name)}, version: ${jsString(version)} };`,
    '        window.GM_LOAD_START = performance.now();',
  ].join('\n');
  return fillTemplate(read('shell.html'), {
    LANG: escapeHtml(game.language ?? 'en'),
    TITLE: title,
    SETTINGS_SCRIPT: settingsScript,
    LOADING: fillTemplate(read('../shared/loading.html'), { TITLE: title, VERSION: escapeHtml(version) }),
  });
}

export const loaderConfig = ({ game }) => ({ storageKey: `gamekit.${game.name}.lang` });
```
`portals/dev-mock/loader.entry.js`:
```js
// loader.js for dev-mock: the shared loader, no sitelock and no SDK. __GK_LOADER__ is injected by `gamekit pack`.
/* global __GK_LOADER__ */
import { runLoader } from '../shared/loader-runtime.js';

const cfg = __GK_LOADER__;
console.info(`[dev-mock] loader ${cfg.version}`);
runLoader(cfg, { onReady: (ms) => console.info(`[dev-mock] game_started ${ms} ms`) });
```
- [ ] **Step 7:** `npm test` vẫn xanh (chưa có test mới cho task này).
- [ ] **Step 8: Commit** — `git add portals && git commit -m "feat(portals): trang vỏ, màn loading và loader chạy trong trang"`

---

### Task 7: `init` hỏi thông tin, lệnh `config`, `status` báo thiếu

**Files:**
- Create: `scripts/config.mjs`
- Modify: `scripts/init.mjs`, `scripts/status.mjs`, `scripts/gamekit.mjs` (COMMANDS + HELP), `templates/game/game.yaml`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `allQuestions`, `parseSets`, `withDefaults`, `ask`, `settingsFor`, `LANGUAGE_NAMES` (Task 4); `loadPortal`, `missingSettings`, `applyPortalChecklists` (Task 3); `updateGame` (`scripts/lib/game.mjs`).
- Produces: `game.yaml` có `portals` (luôn có `dev-mock` đầu tiên), `portalSettings`, `language`, `languages`; `Language/<mã>.json` cho mã khác `en`; `gates/P4.md` có checklist portal. Lệnh `gamekit config [--portal p] [--set k=v…] [--questions --json] [--no-input]`.

- [ ] **Step 1: Viết test** (`tests/cli.test.mjs`; import `token` từ `./helpers.mjs`)
```js
test('init: --questions --json lists every question with its explanation', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-'));
  const r = gk(parent, 'init', 'qg', '--questions', '--json');
  assert.equal(r.code, 0, r.out);
  const qs = JSON.parse(r.out);
  const gameCode = qs.find((q) => q.key === 'azgames.gameCode');
  assert.ok(gameCode.description.length > 20);
  assert.equal(qs.find((q) => q.key === 'azgames.gameId').default, 'qg-az');
  assert.ok(!fs.existsSync(path.join(parent, 'qg')), 'chỉ in câu hỏi, không tạo game');
});

test('init: --set answers go to game.yaml; missing portal settings are reported, not fatal', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-'));
  const r = gk(parent, 'init', 'sg', '--no-install', '--set', 'title=Sao Băng', '--set', 'portals=azgames', '--set', 'languages=en,es', '--set', 'language=es', '--set', 'azgames.gameCode=g205');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /signed/);
  assert.match(r.out, /gamekit config --portal azgames/);
  const dir = path.join(parent, 'sg');
  const g = YAML.parse(read(dir, 'game.yaml'));
  assert.equal(g.title, 'Sao Băng');
  assert.deepEqual(g.portals, ['dev-mock', 'azgames']);
  assert.deepEqual(g.portalSettings.azgames, { gameCode: 'g205', gameId: 'sg-az', portalGid: 'sg', signed: null });
  assert.equal(g.language, 'es');
  assert.deepEqual(g.languages, ['en', 'es']);
  assert.equal(JSON.parse(read(dir, 'Language/es.json'))._meta.name, 'Español');
  assert.match(read(dir, 'gates/P4.md'), /\[azgames\] Popup Settings có footer/);
  assert.equal(gk(dir, 'validate').code, 0, 'thiếu setting chỉ là cảnh báo trước P4');
  assert.equal(gk(parent, 'init', 'bad', '--no-install', '--set', 'azgames.gameId=sai').code, 1);
});

test('config: fills missing settings with --set, adds a portal and its checklist, lists what is still open', () => {
  const dir = newGame('cfg');
  let r = gk(dir, 'config', '--questions', '--json');
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out).map((q) => q.key), ['azgames.gameCode', 'azgames.signed']);
  r = gk(dir, 'config', '--set', 'azgames.gameCode=g9', '--set', `azgames.signed=${token({ signed: 'x', domain: 'azgame.io' })}`);
  assert.equal(r.code, 0, r.out);
  assert.equal(YAML.parse(read(dir, 'game.yaml')).portalSettings.azgames.gameCode, 'g9');
  assert.doesNotMatch(r.out, /còn thiếu/i);
  assert.equal(gk(dir, 'validate', '--stage', 'P4').code, 0);
  assert.equal(gk(dir, 'config', '--set', 'azgames.gameId=sai').code, 1);
  assert.equal(gk(dir, 'config', '--portal', 'nope').code, 1);
});

test('status lists portal settings still missing', () => {
  const dir = newGame('st2');
  assert.match(gk(dir, 'status').out, /azgames.*gameCode/);
});
```
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Template `game.yaml`** — thay khối `portals:` bằng:
```yaml
portals:
  - dev-mock
portalSettings: {}           # thông tin từng portal — gamekit config --portal <id>
language: en                 # ngôn ngữ mặc định cho người chơi mới
languages:                   # mỗi mã một file Language/<mã>.json; en bắt buộc
  - en
```
- [ ] **Step 4: Sửa `scripts/init.mjs`** — thay đoạn đầu `run()` tới trước `copyDir` và thêm phần ghi `game.yaml` sau khi chép template:
```js
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copyDir, exists, readYaml, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { git } from './lib/git.mjs';
import { nowIso, updateGame } from './lib/game.mjs';
import { SCHEMA_DIR, check } from './lib/schema.mjs';
import { LANGUAGE_NAMES, allQuestions, ask, parseSets, settingsFor, withDefaults } from './lib/questions.mjs';
import { applyPortalChecklists, loadPortal, missingSettings } from './lib/portals.mjs';

export const GAMEKIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(GAMEKIT_ROOT, 'templates', 'game');

const defaultTitle = (name) => name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Answers from --title/--engine/--set, then the terminal (when there is one) or defaults. */
async function collectAnswers(args, questions) {
  const preset = parseSets(args.set, questions);
  if (args.title) preset.title = String(args.title);
  if (args.engine) preset.engine = parseSets([`engine=${args.engine}`], questions).engine;
  const interactive = process.stdin.isTTY && !args['no-input'];
  const core = questions.filter((q) => !q.portal);
  return interactive ? ask(questions, { preset }) : { ...withDefaults(core, preset), ...preset };
}

export async function run(args) {
  const name = args._[0];
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new GkError('Dùng: gamekit init <ten-game> [--title "Tên"] [--engine unity] [--dir <thư mục cha>] [--set khoá=giá-trị…]. Tên: chữ thường, số, gạch ngang.');
  const questions = allQuestions({ name, title: args.title ? String(args.title) : defaultTitle(name) });
  if (args.questions) {
    log.info(JSON.stringify(questions, null, 2));
    return 0;
  }
  const dest = path.resolve(args.dir ?? args.cwd ?? process.cwd(), name);
  if (exists(dest) && fs.readdirSync(dest).length) throw new GkError(`${dest} đã có và không rỗng`);
  const answers = await collectAnswers(args, questions);
  const title = answers.title;
  const engine = answers.engine;
  const portals = ['dev-mock', ...(answers.portals ?? []).filter((p) => p !== 'dev-mock')];
  const languages = [...new Set(['en', ...(answers.languages ?? []), answers.language ?? 'en'])];
  const language = answers.language ?? 'en';
  const portalSettings = settingsFor(portals, answers, questions);

  const vars = { NAME: name, TITLE: title, ENGINE: engine, CREATED: nowIso() };
```
(giữ nguyên hàm `esc`, `copyDir`, kiểm `game.yaml` như cũ), rồi ngay sau dòng kiểm `gameErrors` thêm:
```js
  updateGame(dest, [
    [['source', 'path'], answers.sourcePath ?? null],
    [['portals'], portals],
    [['portalSettings'], portalSettings],
    [['language'], language],
    [['languages'], languages],
  ]);
  for (const code of languages.filter((c) => c !== 'en')) {
    writeJson(path.join(dest, 'Language', `${code}.json`), { _meta: { name: LANGUAGE_NAMES[code] ?? code } });
  }
  applyPortalChecklists(dest, portals);
```
và trước `log.ok(\`Đã tạo …\`)` thêm:
```js
  for (const p of portals) {
    const miss = missingSettings(loadPortal(p), portalSettings[p]);
    if (miss.length) log.warn(`Portal ${p} còn thiếu: ${miss.join(', ')} — điền sau bằng \`gamekit config --portal ${p}\` (cần trước khi pack)`);
  }
```
(`writeJson` đã được import; `ENGINES` không còn dùng ở init.)
- [ ] **Step 5: Viết `scripts/config.mjs`**
```js
// gamekit config — answer portal questions later (missing settings, a newly added portal).
import { log } from './lib/log.mjs';
import { requireGameRoot, loadGame, updateGame } from './lib/game.mjs';
import { allQuestions, ask, parseSets, settingsFor } from './lib/questions.mjs';
import { applyPortalChecklists, loadPortal, missingSettings } from './lib/portals.mjs';

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const questions = allQuestions({ name: game.name, title: game.title }).filter((q) => q.portal);
  let portals = [...(game.portals ?? [])];
  if (args.portal) {
    for (const p of String(args.portal).split(',')) {
      loadPortal(p); // unknown portal → error listing the kits
      if (!portals.includes(p)) portals.push(p);
    }
  }
  const current = game.portalSettings ?? {};
  const isOpen = (q) => portals.includes(q.portal) && (current[q.portal]?.[q.key.slice(q.portal.length + 1)] ?? null) === null;
  if (args.questions) {
    log.info(JSON.stringify(questions.filter(isOpen), null, 2));
    return 0;
  }
  const preset = parseSets(args.set, questions);
  const toAsk = process.stdin.isTTY && !args['no-input'] ? questions.filter((q) => isOpen(q) && !(q.key in preset)) : [];
  const answers = { ...preset, ...(toAsk.length ? await ask(toAsk, { preset: { portals } }) : {}) };
  const portalSettings = settingsFor(portals, answers, questions, current);
  updateGame(root, [
    [['portals'], portals],
    [['portalSettings'], portalSettings],
  ]);
  applyPortalChecklists(root, portals);
  let open = 0;
  for (const p of portals) {
    const miss = missingSettings(loadPortal(p), portalSettings[p]);
    open += miss.length;
    if (miss.length) log.warn(`Portal ${p} còn thiếu: ${miss.join(', ')}`);
  }
  if (!open) log.ok('Thông tin portal đã đủ');
  return 0;
}
```
Lưu ý: `ask` với `preset: { portals }` — khoá `portals` không nằm trong `toAsk` nên chỉ dùng để lọc câu portal. Portal lạ: `loadPortal` tự ném `GkError`.
- [ ] **Step 6: `scripts/gamekit.mjs`** — `COMMANDS` thêm `config: () => import('./config.mjs').then((m) => m.run),`; `HELP` thay dòng `init` và thêm `config`:
```
  init <tên> [--title] [--engine] [--dir] [--set k=v…] [--no-input]   Tạo game mới; hỏi thông tin dự án (terminal) hoặc nhận --set
  init <tên> --questions --json             In danh sách câu hỏi kèm giải thích (cho agent hỏi người dùng)
  config [--portal p] [--set k=v…] [--questions --json]   Điền thông tin portal còn thiếu, thêm portal
```
- [ ] **Step 7: `scripts/status.mjs`** — trong `summarize()` trước `return { game, lines, … }` cuối:
```js
  const missing = [];
  for (const p of game.portals ?? []) {
    try {
      const miss = missingSettings(loadPortal(p), game.portalSettings?.[p]);
      if (miss.length) missing.push(`${p}: ${miss.join(', ')}`);
    } catch (e) {
      missing.push(`${p}: ${e.message}`);
    }
  }
```
trả thêm `missing` trong object; trong `print()` sau khối "Việc còn mở ở cổng":
```js
  if (s.missing?.length) {
    log.info('\nThông tin portal còn thiếu (cần trước khi pack) — `gamekit config --portal <id>`:');
    for (const m of s.missing) log.info(`  - ${m}`);
  }
```
(import `loadPortal`, `missingSettings` từ `./lib/portals.mjs`.)
- [ ] **Step 8: Chạy, thấy xanh** — `npm test`.
- [ ] **Step 9: Commit** — `git add -A && git commit -m "feat(init): hỏi thông tin portal kèm giải thích, lệnh config"`

---

### Task 8: Template game — ngôn ngữ, Settings, Platform.info, vite cho gói

**Files:**
- Create: `templates/game/Language/en.json`, `templates/game/src/view/i18n.ts`, `templates/game/src/view/settings.ts`, `templates/game/src/view/style.css` (chuyển từ `public/TemplateData/style.css` + thêm CSS Settings), `templates/game/src/platform/gm-globals.d.ts`, `templates/game/src/platform/dev-loader.ts`, `templates/game/src/platform/adapters/azgames.ts`, `templates/game/public/Icons/web.png`, `templates/game/public/Icons/loading.webp`, `templates/game/public/StreamingAssets/data/.gitkeep`, `templates/game/tests/view/i18n.test.ts`
- Delete: `templates/game/public/TemplateData/`, `templates/game/public/StreamingAssets/.gitkeep`
- Modify: `templates/game/src/main.ts`, `templates/game/src/view/renderer.ts`, `templates/game/src/platform/types.ts`, `templates/game/src/platform/create-platform.ts`, `templates/game/src/platform/index.ts`, `templates/game/tests/platform/create-platform.test.ts`, `templates/game/vite.config.ts`, `templates/game/index.html`, `templates/game/package.json`, `templates/game/provenance.json`, `templates/game/_gitignore`, `templates/game/eslint.config.js`, `templates/game/.vscode/settings.json`

**Interfaces:**
- Consumes: hợp đồng loader (Task 6): `window.GM_LANG`, `window.GM_LOADER`.
- Produces: `translate(dict, code, key, params?)`, `t(key, params?)`; `Platform.info: {portal, copyright}`; `PlatformOptions.info?`; `mountSettings(parent, {copyright, sound, onSound, onOpen?, onClose?})`; build `GK_PACK=1` ra `framework.js`, `css/style.css`, `assets/{img,audio,fonts,art}/`.

- [ ] **Step 1: Viết test template** `templates/game/tests/view/i18n.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { translate } from '../../src/view/i18n';

const dict = { 'hud.score': 'Score: {score}', 'coins.one': '{count} coin', 'coins.other': '{count} coins', 'only.other': '{count} x' };

describe('i18n', () => {
  it('fills {params}', () => {
    expect(translate(dict, 'en', 'hud.score', { score: 42 })).toBe('Score: 42');
  });
  it('picks the plural form by the language rules, falling back to .other', () => {
    expect(translate(dict, 'en', 'coins', { count: 1 })).toBe('1 coin');
    expect(translate(dict, 'en', 'coins', { count: 3 })).toBe('3 coins');
    expect(translate(dict, 'en', 'only', { count: 1 })).toBe('1 x');
  });
  it('shows the key when missing so gaps are visible', () => {
    expect(translate(dict, 'en', 'nope')).toBe('nope');
  });
  it('leaves unknown placeholders untouched', () => {
    expect(translate(dict, 'en', 'hud.score')).toBe('Score: {score}');
  });
});
```
Trong `templates/game/tests/platform/create-platform.test.ts` thêm:
```ts
describe('info', () => {
  it('exposes the portal copyright given at boot, for the Settings footer', () => {
    const platform = createPlatform(createDevMock({ adMs: 0, log: quiet }), { bus: new PauseBus(), saveNamespace: 't', storage: memory(), log: quiet, info: { portal: 'azgames', copyright: '© 2026 Azgames.io' } });
    expect(platform.info).toEqual({ portal: 'azgames', copyright: '© 2026 Azgames.io' });
  });
  it('defaults to the adapter name and no copyright', () => {
    expect(setup().platform.info).toEqual({ portal: 'dev-mock', copyright: '' });
  });
});
```
- [ ] **Step 2: Tạo game thử, thấy đỏ** — `node scripts/gamekit.mjs init t1 --dir <scratchpad> --set portals=dev-mock` (có `npm install`), trong game: `npm test` → FAIL (`src/view/i18n` không có, `info` không có). (Chép hai file test vào game thử nếu tạo game trước khi sửa template.)
- [ ] **Step 3: `Language/en.json`**
```json
{
  "_meta": { "name": "English" },
  "game.start": "Tap or press Space to play",
  "game.controls": "← → or tap either side of the screen",
  "game.paused": "Paused",
  "game.score": "Score: {score}",
  "settings.title": "Settings",
  "settings.sound": "Sound",
  "settings.on": "On",
  "settings.off": "Off",
  "settings.language": "Language",
  "settings.close": "Close"
}
```
- [ ] **Step 4: `src/platform/gm-globals.d.ts`**
```ts
/** Globals set by the portal loader (loader.js) or, under `npm run dev`, by dev-loader.ts. */
export {};

declare global {
  interface GmLanguage {
    code: string;
    name: string;
  }
  interface Window {
    GM_LANG?: { code: string; dict: Record<string, unknown>; available: GmLanguage[] };
    GM_LOADER?: { copyright: string; version: string; setLanguage(code: string): void; ready(): void };
    GMGameSDK?: { trackEventParams?(event: string, data: Record<string, unknown>): void };
  }
}
```
- [ ] **Step 5: `src/view/i18n.ts`**
```ts
/**
 * Text for view/ (core/ never touches text). Strings come from Language/<code>.json, loaded by the
 * portal loader — players download one language only. Missing key → the key itself, so gaps show.
 */
type Params = Record<string, string | number>;

export function translate(dict: Readonly<Record<string, unknown>>, code: string, key: string, params: Params = {}): string {
  let k = key;
  if (typeof params.count === 'number') {
    const form = `${key}.${new Intl.PluralRules(code).select(params.count)}`;
    k = typeof dict[form] === 'string' ? form : `${key}.other`;
  }
  const s = dict[k];
  if (typeof s !== 'string') return key;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export const t = (key: string, params?: Params): string => translate(window.GM_LANG?.dict ?? {}, window.GM_LANG?.code ?? 'en', key, params);
```
- [ ] **Step 6: `src/platform/dev-loader.ts`**
```ts
/**
 * `npm run dev` has no portal loader.js: build the same window.GM_LANG / GM_LOADER from Language/*.json
 * so the game behaves as it does inside a package. main.ts imports this only when import.meta.env.DEV,
 * so production builds never contain every language.
 */
const files = import.meta.glob<Record<string, unknown>>('/Language/*.json', { eager: true, import: 'default' });
const KEY = 'gamekit.dev.lang';

export function installDevLoader(): void {
  if (window.GM_LANG) return;
  const dicts = new Map(Object.entries(files).map(([p, d]) => [p.replace(/^.*\/(.+)\.json$/, '$1'), d]));
  const en = dicts.get('en') ?? {};
  const available = [...dicts.entries()].map(([code, d]) => ({ code, name: String((d._meta as { name?: string } | undefined)?.name ?? code) }));
  const wanted = new URLSearchParams(location.search).get('lang') ?? read(KEY) ?? 'en';
  const code = dicts.has(wanted) ? wanted : 'en';
  window.GM_LANG = { code, dict: { ...en, ...(dicts.get(code) ?? {}) }, available };
  window.GM_LOADER = {
    copyright: `© ${new Date().getFullYear()} GameKit (dev)`,
    version: 'dev',
    setLanguage(next) {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode */
      }
      location.reload();
    },
    ready() {},
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
```
- [ ] **Step 7: Platform.info** — `src/platform/types.ts`: thêm
```ts
export interface PlatformInfo {
  readonly portal: string;
  /** Portal copyright line for the Settings footer (AZGAMES: "© <year> Azgames.io"). Never translated. */
  readonly copyright: string;
}
```
và trong `Platform` thêm `readonly info: PlatformInfo;`. `src/platform/create-platform.ts`: import `PlatformInfo`; `PlatformOptions` thêm `info?: PlatformInfo;`; trong object `platform` thêm `info: opts.info ?? { portal: adapter.name, copyright: '' },`. `src/platform/index.ts` trong `bootPlatform`: `createPlatform(adapter, { bus, saveNamespace: GAME_NAME, info: { portal: PORTAL, copyright: window.GM_LOADER?.copyright ?? '' } })`.
- [ ] **Step 8: Adapter `src/platform/adapters/azgames.ts`**
```ts
import type { AnalyticsEvent, EventData } from '../events';
import type { PortalAdapter } from '../types';

/**
 * AZGAMES: loader.js already ran the sitelock, initialised GMGameSDK and reports game_loaded/game_started.
 * This adapter forwards analytics; ads and leaderboard through gmsdkv2 come in a later version.
 */
export function createAzgames(): PortalAdapter {
  return {
    name: 'azgames',
    capabilities: { interstitial: false, rewarded: false, banner: false, leaderboard: false, cloudSave: false, user: false },
    async init() {},
    async showAd() {
      return 'unavailable';
    },
    track(event: AnalyticsEvent, data: EventData) {
      window.GMGameSDK?.trackEventParams?.(event, { ...data });
    },
  };
}

/** Entry point used by the build (virtual:gk-adapter). */
export const createAdapter = (): PortalAdapter => createAzgames();
```
- [ ] **Step 9: `src/view/settings.ts`**
```ts
import { t } from './i18n';

export interface SettingsOptions {
  /** platform.info.copyright — shown as-is in every language. */
  copyright: string;
  sound: boolean;
  onSound(on: boolean): void;
  onOpen?(): void;
  onClose?(): void;
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

  let sound = opts.sound;
  const soundBtn = el('button', 'gk-settings-toggle');
  soundBtn.type = 'button';
  const paintSound = () => (soundBtn.textContent = `${t('settings.sound')}: ${t(sound ? 'settings.on' : 'settings.off')}`);
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
  panel.append(el('h2', 'gk-settings-title', t('settings.title')), soundBtn, langRow, closeBtn, footer);
  overlay.append(panel);
  parent.append(gear, overlay);

  const api = {
    open() {
      overlay.hidden = false;
      opts.onOpen?.();
    },
    close() {
      overlay.hidden = true;
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
```
- [ ] **Step 10: Style** — `git mv templates/game/public/TemplateData/style.css templates/game/src/view/style.css`, xoá `public/TemplateData/favicon.svg`, rồi nối vào cuối `src/view/style.css`:
```css
.gk-gear {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
}
.gk-settings {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.gk-settings[hidden],
.gk-settings-row[hidden] {
  display: none;
}
.gk-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: min(80vw, 280px);
  padding: 20px;
  border-radius: 14px;
  background: #1c1f25;
  color: #f2f2f2;
  font: 16px system-ui, sans-serif;
}
.gk-settings-title {
  margin: 0;
  font-size: 20px;
}
.gk-settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.gk-settings-toggle,
.gk-settings-close {
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}
.gk-settings-footer {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid #333;
  font-size: 12px;
  opacity: 0.7;
  text-align: center;
}
```
- [ ] **Step 11: `src/view/renderer.ts`** — `import { t } from './i18n';` và thay `'← → hoặc chạm hai bên màn hình'` bằng `t('game.controls')`.
- [ ] **Step 12: `src/main.ts`** — thay toàn bộ:
```ts
import './view/style.css';
import { InputState } from './core/input';
import { advance, createFixedStep } from './core/loop';
import { PARAMS } from './core/params';
import { createWorld, stepWorld } from './core/world';
import { t } from './view/i18n';
import { bindInput } from './view/input-dom';
import { Renderer } from './view/renderer';
import { mountSettings } from './view/settings';
import { BUILD_ID, PauseBus, bootPlatform } from './platform';
import { installWebGuard } from './platform/web-guard';

const FIXED_HZ = 60;
const MS = 1000;

/** The portal shell page has no game markup (npm run dev's index.html does): create it when missing. */
function ensureStage(): { stage: HTMLElement; canvas: HTMLCanvasElement } {
  let canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) {
    const stage = document.createElement('main');
    stage.id = 'stage';
    canvas = document.createElement('canvas');
    canvas.id = 'game';
    canvas.tabIndex = 0;
    stage.append(canvas);
    document.body.append(stage);
  }
  return { stage: canvas.parentElement ?? document.body, canvas };
}

async function main(): Promise<void> {
  // npm run dev has no portal loader.js; dropped from builds (import.meta.env.DEV is false there).
  if (import.meta.env.DEV) (await import('./platform/dev-loader')).installDevLoader();
  const { stage, canvas } = ensureStage();
  const devLoader = document.getElementById('loader'); // only in index.html for npm run dev

  const bus = new PauseBus();
  const platform = await bootPlatform(bus);
  platform.loadingProgress(0.5);
  installWebGuard({ bus, platform, focusEl: canvas, buildId: BUILD_ID });
  mountSettings(stage, {
    copyright: platform.info.copyright,
    sound: true,
    onSound: (on) => bus.setUserMuted(!on),
    onOpen: () => bus.pause('menu'),
    onClose: () => bus.resume('menu'),
  });

  const renderer = new Renderer(canvas, PARAMS);
  const input = new InputState();
  const step = createFixedStep(FIXED_HZ);
  let world = createWorld(PARAMS, Date.now() >>> 0);
  let state: 'ready' | 'playing' | 'over' = 'ready';
  let round = 0;

  const start = async () => {
    if (state === 'playing' || bus.has('ad') || bus.has('menu')) return;
    if (state === 'over') {
      // Ads only between rounds, never while the player is acting.
      await platform.interstitial('round_end');
    }
    world = createWorld(PARAMS, Date.now() >>> 0);
    state = 'playing';
    round++;
    input.clear();
    platform.track('level_start', { round });
    platform.gameplayStart();
  };
  bindInput(canvas, input, () => void start());

  platform.loadingProgress(1);
  devLoader?.remove();
  platform.loadingEnd();
  canvas.focus();

  let last = performance.now();
  let shown = false;
  const frame = (now: number) => {
    const elapsed = (now - last) / MS;
    last = now;
    if (state === 'playing' && !bus.paused) {
      const { steps } = advance(step, elapsed);
      for (let i = 0; i < steps; i++) {
        const events = stepWorld(world, PARAMS, input.frame(world.tick), step.stepSec);
        for (const e of events) {
          if (e.type === 'gameOver') {
            state = 'over';
            platform.gameplayStop();
            platform.track('level_fail', { round, score: e.score });
            void platform.submitScore('main', e.score);
          }
        }
        if (state !== 'playing') break;
      }
    } else {
      step.accumulator = 0;
    }
    const overlay =
      state === 'ready' ? t('game.start') : state === 'over' ? t('game.score', { score: Math.floor(world.score) }) : bus.paused ? t('game.paused') : null;
    renderer.draw(world, overlay);
    if (!shown) {
      shown = true;
      window.GM_LOADER?.ready(); // first frame on screen: the portal hides its loading screen
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
```
- [ ] **Step 13: `vite.config.ts`** — thay khối comment layout + `build:` bằng:
```ts
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
```
- [ ] **Step 14: Phần còn lại của template**
  - `index.html`: thay `<link rel="icon" href="./TemplateData/favicon.svg" />` bằng `<link rel="icon" href="./Icons/web.png" />`, xoá dòng `<link rel="stylesheet" href="./TemplateData/style.css" />`.
  - Icon placeholder:
    ```bash
    node --input-type=module -e "import fs from 'node:fs'; import { solidPng, tinyWebp } from './tests/helpers.mjs'; fs.mkdirSync('templates/game/public/Icons', { recursive: true }); fs.writeFileSync('templates/game/public/Icons/web.png', solidPng(64, 64)); fs.writeFileSync('templates/game/public/Icons/loading.webp', tinyWebp());"
    git mv templates/game/public/StreamingAssets/.gitkeep templates/game/public/StreamingAssets/data/.gitkeep
    ```
  - `provenance.json`: thay hai mục `TemplateData` bằng:
    ```json
    { "path": "public/Icons/web.png", "label": "placeholder", "source": "GameKit template", "license": null, "note": "Favicon — thay bằng icon thật ở P3", "at": null },
    { "path": "public/Icons/loading.webp", "label": "placeholder", "source": "GameKit template", "license": null, "note": "Key art màn loading — thay ở P3", "at": null }
    ```
  - `package.json`: `devDependencies` thêm `"esbuild": "^0.25.0"`, `"javascript-obfuscator": "^4.1.1"`; `"preview": "vite preview --outDir builds"`.
  - `_gitignore`: `dist/` → `builds/`. `eslint.config.js`: ignores `'dist/'` → `'builds/'`. `.vscode/settings.json`: `search.exclude` `"dist"` → `"builds"`.
- [ ] **Step 15: Chạy, thấy xanh** — plugin: `npm test` xanh (trừ test symlink EPERM của môi trường). Game thử mới tạo từ template: `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 16: Commit** — `git add -A templates tests && git commit -m "feat(template): đa ngôn ngữ, popup Settings có bản quyền, build cho gói az-v1"`

---

### Task 9: `validate` — setting portal, ngôn ngữ, icon

**Files:**
- Create: `scripts/lib/languages.mjs`
- Modify: `scripts/validate.mjs`, `scripts/lib/png.mjs` (thêm `isWebp`)
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `loadPortal`, `checkSetting`, `missingSettings` (Task 3).
- Produces: `loadLanguages(root): Record<code, object>` (ném `Error` nếu JSON hỏng), `placeholders(s): string`, `isWebp(file): boolean`. `FORBIDDEN_DIRS` thêm `builds`.

- [ ] **Step 1: Viết test** (`tests/cli.test.mjs`; import `editYaml`, `token` từ helpers)
```js
test('validate: portal settings — bad format always fails, missing warns before P4 and fails from P4', () => {
  const dir = newGame('vps');
  let r = gk(dir, 'validate');
  assert.equal(r.code, 0);
  assert.match(r.out, /portalSettings\.azgames\.gameCode chưa điền/);
  assert.equal(gk(dir, 'validate', '--stage', 'P4').code, 1);
  editYaml(dir, (g) => {
    g.portalSettings.azgames.gameCode = 'g205';
    g.portalSettings.azgames.signed = token({ signed: 'x', domain: 'azgame.io' });
  });
  assert.equal(gk(dir, 'validate', '--stage', 'P4').code, 0);
  editYaml(dir, (g) => {
    g.portalSettings.azgames.gameId = 'demo';
  });
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /azgames\.gameId/);
  editYaml(dir, (g) => {
    g.portals.push('nope');
  });
  assert.match(gk(dir, 'validate').out, /Không có bộ vỏ portal "nope"/);
});

test('validate: Language — en required, extra keys and {param} mismatches fail, missing keys warn, t() keys exist', () => {
  const dir = newGame('vlang');
  editJson(dir, 'Language/en.json', (d) => {
    d['hud.score'] = 'Score: {score}';
    d['menu.play'] = 'Play';
  });
  editYaml(dir, (g) => {
    g.languages = ['en', 'es'];
  });
  let r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /es\.json/);
  write(dir, 'Language/es.json', JSON.stringify({ 'hud.score': 'Puntos: {score}' }));
  r = gk(dir, 'validate');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /menu\.play/, 'thiếu key chỉ cảnh báo');
  write(dir, 'Language/es.json', JSON.stringify({ 'hud.score': 'Puntos: {puntos}', extra: 'x' }));
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /tham số/);
  assert.match(r.out, /extra/);
  write(dir, 'Language/es.json', '{}');
  write(dir, 'src/view/x.ts', "export const a = (t: (k: string) => string) => t('menu.nope');\n");
  r = gk(dir, 'validate');
  assert.equal(r.code, 1);
  assert.match(r.out, /menu\.nope/);
  fs.rmSync(path.join(dir, 'src/view/x.ts'));
  editYaml(dir, (g) => {
    g.language = 'fr';
  });
  assert.match(gk(dir, 'validate').out, /language fr/);
});

test('validate: Icons/web.png must be PNG, loading.webp must be WebP; builds/ must be gitignored', () => {
  const dir = newGame('vicon');
  assert.equal(gk(dir, 'validate').code, 0);
  fs.writeFileSync(path.join(dir, 'public/Icons/loading.webp'), 'not webp');
  assert.match(gk(dir, 'validate').out, /WebP/);
  fs.rmSync(path.join(dir, 'public/Icons/web.png'));
  assert.match(gk(dir, 'validate').out, /web\.png/);
});
```
- [ ] **Step 2: Chạy, thấy đỏ** — cả ba test đỏ vì validate chưa có các luật này.
- [ ] **Step 3: `scripts/lib/png.mjs`** thêm:
```js
/** RIFF....WEBP header. */
export function isWebp(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    return n === 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  } finally {
    fs.closeSync(fd);
  }
}
```
- [ ] **Step 4: `scripts/lib/languages.mjs`**
```js
// Language/<code>.json: flat keys, {param} placeholders, plural keys (.one/.other/…), _meta { name, dir }.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './io.mjs';

export function loadLanguages(root) {
  const dir = path.join(root, 'Language');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) out[f.slice(0, -5)] = readJson(path.join(dir, f));
  return out;
}

/** Sorted placeholder names, to compare a translation with en. */
export const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
```
- [ ] **Step 5: `scripts/validate.mjs`** — import:
```js
import { pngInfo, isWebp } from './lib/png.mjs';
import { loadLanguages, placeholders } from './lib/languages.mjs';
import { checkSetting, loadPortal, missingSettings } from './lib/portals.mjs';
```
`FORBIDDEN_DIRS` thành `['reference', 'decompiled', 'builds', '.gamekit/ghidra', '.gamekit/local']`. Trong `validateGame` sau `validateOracles(root, pr);`:
```js
  validatePortalSettings(game, st, pr);
  validateLanguages(root, game, pr);
  validateIcons(root, pr);
```
Thêm các hàm:
```js
// ---------- portalSettings: answers to each portal kit's questions ----------
function validatePortalSettings(game, st, pr) {
  const strict = st >= PHASES.indexOf('P4'); // needed to package for the portal
  for (const p of game.portals ?? []) {
    let kit;
    try {
      kit = loadPortal(p);
    } catch (e) {
      pr.error('game.yaml', e.message);
      continue;
    }
    const values = game.portalSettings?.[p] ?? {};
    for (const [k, v] of Object.entries(values)) {
      const err = checkSetting(kit, k, v);
      if (err) pr.error('game.yaml', `portalSettings.${p}.${k}: ${err}`);
    }
    for (const k of missingSettings(kit, values))
      (strict ? pr.error : pr.warn).call(pr, 'game.yaml', `portalSettings.${p}.${k} chưa điền (${kit.config.settings[k].label}) — gamekit config --portal ${p}`);
  }
}

// ---------- Language/: en is the source of every translation ----------
function validateLanguages(root, game, pr) {
  let langs;
  try {
    langs = loadLanguages(root);
  } catch (e) {
    pr.error('Language', e.message);
    return;
  }
  const en = langs.en;
  if (!en) {
    pr.error('Language', 'thiếu Language/en.json (bản gốc của mọi bản dịch)');
    return;
  }
  const codes = game.languages ?? ['en'];
  if (game.language && !codes.includes(game.language)) pr.error('game.yaml', `language ${game.language} không có trong languages`);
  for (const c of codes) if (!langs[c]) pr.error('Language', `languages có ${c} nhưng thiếu Language/${c}.json`);
  for (const [c, dict] of Object.entries(langs)) {
    const where = `Language/${c}.json`;
    for (const [k, v] of Object.entries(dict)) {
      if (k === '_meta') continue;
      if (typeof v !== 'string') pr.error(where, `${k}: phải là chuỗi`);
      else if (c !== 'en' && !(k in en)) pr.error(where, `${k}: không có trong en.json`);
      else if (c !== 'en' && placeholders(v) !== placeholders(en[k])) pr.error(where, `${k}: tham số {…} khác en.json`);
    }
    if (c === 'en') continue;
    const miss = Object.keys(en).filter((k) => k !== '_meta' && !(k in dict));
    if (miss.length) pr.warn(where, `thiếu ${miss.length} key, pack sẽ lấy từ en: ${miss.slice(0, 5).join(', ')}${miss.length > 5 ? '…' : ''}`);
  }
  for (const rel of walk(path.join(root, 'src')).filter((f) => /\.tsx?$/.test(f))) {
    const text = fs.readFileSync(path.join(root, 'src', rel), 'utf8');
    for (const m of text.matchAll(/\bt\(\s*['"]([\w.-]+)['"]/g))
      if (!(m[1] in en) && !(`${m[1]}.other` in en)) pr.error(`src/${rel}`, `t('${m[1]}') không có trong Language/en.json`);
  }
}

// ---------- public/Icons: what the portal page shows before any JS runs ----------
function validateIcons(root, pr) {
  const dir = path.join(root, 'public', 'Icons');
  const web = path.join(dir, 'web.png');
  const loading = path.join(dir, 'loading.webp');
  if (!exists(web)) pr.error('public/Icons', 'thiếu web.png (favicon)');
  else if (!pngInfo(web)) pr.error('public/Icons/web.png', 'không phải PNG');
  if (!exists(loading)) pr.error('public/Icons', 'thiếu loading.webp (ảnh màn loading)');
  else if (!isWebp(loading)) pr.error('public/Icons/loading.webp', 'không phải WebP');
}
```
- [ ] **Step 6: Chạy, thấy xanh** — `npm test` (template đã có `Language/en.json` và `public/Icons/*` từ Task 8).
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(validate): kiểm setting portal, ngôn ngữ, icon"`

---

### Task 10: Ráp gói `assemblePortal`

**Files:**
- Modify: `scripts/lib/languages.mjs` (thêm `buildLanguages`)
- Create: `scripts/lib/assemble.mjs`
- Test: `tests/build.test.mjs`

**Interfaces:**
- Consumes: `withBase` (Task 2); `copyrightFor`, `loadPortal` (Task 3); `kit.mjs` `renderShell`/`loaderConfig` (Task 6).
- Produces: `buildLanguages(sources, codes): {files: Record<code, string>, list: [{code, name}]}`; `assemblePortal({game, kit, settings, version, viteOut, languages, outDir, buildLoader, obfuscate}): Promise<{cfg}>` với `buildLoader({entry, define}) → Promise<string>`, `obfuscate(code, seed:number) → Promise<string>`; `VITE_TOP` (các mục hợp lệ ở gốc đầu ra vite).

- [ ] **Step 1: Viết test** (`tests/build.test.mjs`; import `fs` (`node:fs`), `path` (`node:path`), `assemblePortal` (`../scripts/lib/assemble.mjs`), `loadPortal`, helpers `tmpDir, write, read, solidPng, tinyWebp, token`)
```js
function fakeVite(dir) {
  const vite = path.join(dir, 'vite');
  write(vite, 'framework.js', 'console.log("game");const c=platform.info.copyright;');
  write(vite, 'css/style.css', 'body{}');
  write(vite, 'assets/img/hero-abc.png', 'x');
  write(vite, 'assets/audio/hit-abc.mp3', 'x');
  write(vite, 'StreamingAssets/data/level1.json', '{}');
  write(vite, 'StreamingAssets/data/.gitkeep', '');
  fs.mkdirSync(path.join(vite, 'Icons'), { recursive: true });
  fs.writeFileSync(path.join(vite, 'Icons/web.png'), solidPng(8, 8));
  fs.writeFileSync(path.join(vite, 'Icons/loading.webp'), tinyWebp());
  return vite;
}
const GAME = { name: 'demo', title: 'Zombie <Run> & "Co"', language: 'es', languages: ['en', 'es'] };
const SETTINGS = { gameCode: 'g205', gameId: 'demo-az', portalGid: 'demo', signed: token({ signed: 'x', domain: 'azgame.io' }) };
const LANGS = { en: { _meta: { name: 'English' }, a: 'A', b: 'B {x}' }, es: { _meta: { name: 'Español' }, a: 'A-es' } };
const TOOLS = { buildLoader: async ({ define }) => `var cfg=${define.__GK_LOADER__};`, obfuscate: async (code) => code };
const assembleTo = (dir, portal = 'azgames', vite = fakeVite(dir)) =>
  assemblePortal({ game: GAME, kit: loadPortal(portal), settings: portal === 'azgames' ? SETTINGS : {}, version: '26101601', viteOut: vite, languages: LANGS, outDir: path.join(dir, 'out'), ...TOOLS });

test('assemble: az-v1 layout, <base>, byte-identical preview, 8-byte version.txt', async () => {
  const dir = tmpDir();
  const { cfg } = await assembleTo(dir);
  const out = path.join(dir, 'out');
  assert.deepEqual(fs.readdirSync(out).sort(), ['26101601', 'index.html', 'preview.html', 'version.txt']);
  assert.equal(fs.readFileSync(path.join(out, 'version.txt'), 'latin1'), '26101601');
  assert.ok(fs.readFileSync(path.join(out, 'index.html')).equals(fs.readFileSync(path.join(out, 'preview.html'))));
  const outer = read(out, 'index.html');
  const inner = read(out, '26101601/index.html');
  assert.match(outer, /<base href="26101601\/">/);
  assert.doesNotMatch(inner, /<base/);
  assert.equal(outer.replace(/\n\s*<base href="26101601\/">/, ''), inner);
  for (const f of ['loader.js', 'framework.js', 'css/style.css', 'Icons/web.png', 'Icons/loading.webp', 'Icons/domain.webp', 'Language/en.json', 'Language/es.json', 'assets/img/hero-abc.png', 'assets/audio/hit-abc.mp3', 'StreamingAssets/data/level1.json'])
    assert.ok(fs.existsSync(path.join(out, '26101601', f)), f);
  assert.ok(!fs.existsSync(path.join(out, '26101601/StreamingAssets/data/.gitkeep')));
  assert.equal(cfg.version, '26101601');
});

test('assemble: settings escaped, AZ_SETTINGS has exactly the portal keys, loader config baked in', async () => {
  const dir = tmpDir();
  const { cfg } = await assembleTo(dir);
  const inner = read(path.join(dir, 'out'), '26101601/index.html');
  assert.match(inner, /<title>Zombie &lt;Run&gt; &amp; &quot;Co&quot;<\/title>/);
  const az = inner.match(/window\.AZ_SETTINGS = \{([\s\S]*?)\};/)[1];
  assert.deepEqual([...az.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]), ['gameCode', 'language', 'gameId', 'portalGid']);
  assert.match(inner, /window\["GMSOFT_SIGNED"\] = "/);
  assert.match(inner, /<!--PRODUCT_VERSION:26101601END-->/);
  assert.match(inner, /canonical" href="https:\/\/azgames\.io\/demo"/);
  assert.deepEqual(cfg.languages, [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }]);
  assert.equal(cfg.defaultLanguage, 'es');
  assert.equal(cfg.sizes.framework, fs.statSync(path.join(dir, 'out/26101601/framework.js')).size);
  assert.equal(cfg.sizes.lang.es, fs.statSync(path.join(dir, 'out/26101601/Language/es.json')).size);
  assert.equal(cfg.copyright, '© 2026 Azgames.io');
  assert.equal(cfg.storageKey, 'azgames.g205.lang');
  assert.deepEqual(cfg.sitelock, ['azgames.io', 'azgame.io']);
  assert.match(read(path.join(dir, 'out'), '26101601/loader.js'), /"storageKey":"azgames\.g205\.lang"/);
});

test('assemble: translations get every key from en, minified, _meta.name moved to the loader', async () => {
  const dir = tmpDir();
  await assembleTo(dir);
  const out = path.join(dir, 'out/26101601/Language');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'es.json'), 'utf8')), { a: 'A-es', b: 'B {x}' });
  assert.equal(fs.readFileSync(path.join(out, 'en.json'), 'utf8'), '{"a":"A","b":"B {x}"}');
});

test('assemble: dev-mock has no sitelock and no SDK; stray files outside the layout are rejected', async () => {
  const dir = tmpDir();
  const { cfg } = await assembleTo(dir, 'dev-mock');
  const inner = read(path.join(dir, 'out'), '26101601/index.html');
  assert.doesNotMatch(inner, /azgame\.io/);
  assert.equal(cfg.sitelock, null);
  assert.equal(cfg.storageKey, 'gamekit.demo.lang');
  assert.equal(cfg.copyright, '© 2026 GameKit (dev)');
  const dir2 = tmpDir();
  const vite = fakeVite(dir2);
  write(vite, 'TemplateData/old.css', 'x');
  await assert.rejects(() => assembleTo(dir2, 'azgames', vite), /TemplateData/);
  const dir3 = tmpDir();
  const vite3 = fakeVite(dir3);
  write(vite3, 'assets/misc/a.bin', 'x');
  await assert.rejects(() => assembleTo(dir3, 'azgames', vite3), /assets\/misc/);
});
```
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: `buildLanguages`** — thêm vào `scripts/lib/languages.mjs`:
```js
import { GkError } from './log.mjs';

/**
 * Package files: every key present (missing ones from en, so players download exactly one file),
 * minified; `_meta.name` goes to the loader's list, `_meta.dir` stays only for right-to-left.
 */
export function buildLanguages(sources, codes) {
  if (!sources.en) throw new GkError('Thiếu Language/en.json');
  const { _meta: _enMeta, ...enKeys } = sources.en;
  const files = {};
  const list = [];
  for (const code of codes) {
    const src = sources[code];
    if (!src) throw new GkError(`Thiếu Language/${code}.json`);
    const { _meta: meta = {}, ...keys } = src;
    const out = { ...enKeys, ...keys };
    if (meta.dir === 'rtl') out._meta = { dir: 'rtl' };
    files[code] = JSON.stringify(out);
    list.push({ code, name: meta.name ?? code });
  }
  return { files, list };
}
```
- [ ] **Step 4: `scripts/lib/assemble.mjs`**
```js
// Assemble one portal package (layout az-v1) from a vite build:
//   <outDir>/{index.html, preview.html, version.txt, <v>/{index.html, loader.js, framework.js, css/, Icons/, Language/, assets/, StreamingAssets/}}
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exists, walk } from './io.mjs';
import { GkError } from './log.mjs';
import { withBase } from './html.mjs';
import { copyrightFor } from './portals.mjs';
import { buildLanguages } from './languages.mjs';

/** What a vite build for a package may contain at its root (public/ is copied there too). */
export const VITE_TOP = new Set(['framework.js', 'css', 'assets', 'Icons', 'StreamingAssets', 'index.html']);
export const ASSET_KINDS = new Set(['img', 'art', 'audio', 'fonts']);

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/**
 * buildLoader({ entry, define }) bundles the kit's loader.entry.js; obfuscate(code, seed) scrambles it.
 * Both are injected so tests run without esbuild/javascript-obfuscator (pack passes the game's own).
 */
export async function assemblePortal({ game, kit, settings = {}, version, viteOut, languages, outDir, buildLoader, obfuscate }) {
  for (const rel of walk(viteOut)) {
    const [top, kind] = rel.split('/');
    if (!VITE_TOP.has(top)) throw new GkError(`${rel}: không thuộc bố cục gói — public/ chỉ nên có Icons/ và StreamingAssets/`);
    if (top === 'assets' && !ASSET_KINDS.has(kind)) throw new GkError(`${rel}: asset phải nằm trong assets/{${[...ASSET_KINDS].join(',')}}`);
  }
  const need = (rel) => {
    const f = path.join(viteOut, rel);
    if (!exists(f)) throw new GkError(`Bản build thiếu ${rel}`);
    return f;
  };
  fs.rmSync(outDir, { recursive: true, force: true });
  const inner = path.join(outDir, version);

  copy(need('framework.js'), path.join(inner, 'framework.js'));
  copy(need('css/style.css'), path.join(inner, 'css', 'style.css'));
  for (const rel of walk(path.join(viteOut, 'assets'))) copy(path.join(viteOut, 'assets', rel), path.join(inner, 'assets', rel));
  for (const rel of walk(path.join(viteOut, 'StreamingAssets'))) {
    if (path.basename(rel) !== '.gitkeep') copy(path.join(viteOut, 'StreamingAssets', rel), path.join(inner, 'StreamingAssets', rel));
  }
  copy(need('Icons/web.png'), path.join(inner, 'Icons', 'web.png'));
  copy(need('Icons/loading.webp'), path.join(inner, 'Icons', 'loading.webp'));
  copy(path.join(kit.dir, 'Icons', 'domain.webp'), path.join(inner, 'Icons', 'domain.webp'));

  const langs = buildLanguages(languages, game.languages ?? ['en']);
  const sizes = { framework: fs.statSync(path.join(inner, 'framework.js')).size, lang: {} };
  fs.mkdirSync(path.join(inner, 'Language'), { recursive: true });
  for (const [code, text] of Object.entries(langs.files)) {
    fs.writeFileSync(path.join(inner, 'Language', `${code}.json`), text);
    sizes.lang[code] = Buffer.byteLength(text);
  }

  const mod = await import(pathToFileURL(path.join(kit.dir, 'kit.mjs')).href);
  const cfg = {
    ...mod.loaderConfig({ game, settings, version }),
    version,
    languages: langs.list,
    defaultLanguage: game.language ?? 'en',
    sizes,
    copyright: copyrightFor(kit, version),
    sitelock: kit.config.sitelock ?? null,
  };
  const bundled = await buildLoader({ entry: path.join(kit.dir, 'loader.entry.js'), define: { __GK_LOADER__: JSON.stringify(cfg) } });
  fs.writeFileSync(path.join(inner, 'loader.js'), await obfuscate(bundled, Number(version)));

  const html = mod.renderShell({ game, settings, version });
  fs.writeFileSync(path.join(inner, 'index.html'), html);
  const outer = withBase(html, version);
  fs.writeFileSync(path.join(outDir, 'index.html'), outer);
  fs.writeFileSync(path.join(outDir, 'preview.html'), outer);
  fs.writeFileSync(path.join(outDir, 'version.txt'), version);
  return { cfg };
}
```
- [ ] **Step 5: Chạy, thấy xanh** — `node --test tests/build.test.mjs`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(pack): ráp gói bố cục az-v1"`

---

### Task 11: `pack` ra `builds/<v>/<portal>/`

**Files:**
- Modify: `scripts/pack.mjs`, `scripts/gamekit.mjs` (HELP)
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: `nextVersion`, `checkVersion` (Task 1); `loadPortal`, `missingSettings`, `checkSetting` (Task 3); `loadLanguages` (Task 9); `assemblePortal` (Task 10).
- Produces: `gameTools(root): {buildLoader, obfuscate}`; `builds/<v>/manifest.json` = `{name, title, semver, version, commit, dirty, builtAt, portals: {<p>: {hash}}}`; zip `builds/<v>/<name>-<portal>-<v>.zip`.

- [ ] **Step 1: Viết test**
```js
test('pack: stops before building when a portal setting is missing, naming the fix; bad --version rejected', () => {
  const dir = newGame('pk');
  let r = gk(dir, 'pack', '--portal', 'azgames');
  assert.equal(r.code, 1);
  assert.match(r.out, /gameCode/);
  assert.match(r.out, /gamekit config --portal azgames/);
  assert.ok(!fs.existsSync(path.join(dir, 'builds')));
  r = gk(dir, 'pack', '--portal', 'dev-mock', '--version', '123');
  assert.equal(r.code, 1);
  assert.match(r.out, /8 chữ số/);
});
```
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Viết lại `scripts/pack.mjs`** (giữ `hashDir`, `zipDir`, `buildError`, `DOC_PATHS`):
```js
// gamekit pack — one build number per run, one package per portal: builds/<v>/<portal>/ (layout az-v1).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { exists, walk, writeJson } from './lib/io.mjs';
import { log, GkError } from './lib/log.mjs';
import { requireGameRoot, loadGame, nowIso } from './lib/game.mjs';
import { git } from './lib/git.mjs';
import { checkVersion, nextVersion } from './lib/version.mjs';
import { checkSetting, loadPortal, missingSettings } from './lib/portals.mjs';
import { loadLanguages } from './lib/languages.mjs';
import { assemblePortal } from './lib/assemble.mjs';

// hashDir, zipDir, buildError, DOC_PATHS: giữ nguyên như hiện tại.

function compress(dir) {
  for (const rel of walk(dir)) {
    if (!/\.(js|wasm|css|json)$/.test(rel)) continue;
    const f = path.join(dir, rel);
    const buf = fs.readFileSync(f);
    fs.writeFileSync(f + '.gz', zlib.gzipSync(buf, { level: 9 }));
    fs.writeFileSync(f + '.br', zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
  }
}

/** esbuild + javascript-obfuscator from the game's node_modules — the plugin itself depends only on yaml and ajv. */
export function gameTools(root) {
  const req = createRequire(path.join(root, 'package.json'));
  let esbuild;
  let obfuscator;
  try {
    esbuild = req('esbuild');
    obfuscator = req('javascript-obfuscator');
  } catch (e) {
    throw new GkError(`Game thiếu esbuild hoặc javascript-obfuscator — chạy npm install trong thư mục game (${String(e.message).split('\n')[0]})`);
  }
  return {
    buildLoader: async ({ entry, define }) =>
      (await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', target: 'es2017', minify: true, write: false, legalComments: 'none', define })).outputFiles[0].text,
    obfuscate: async (code, seed) =>
      obfuscator.obfuscate(code, { compact: true, seed, target: 'browser', stringArray: true, stringArrayEncoding: ['base64'], identifierNamesGenerator: 'hexadecimal' }).getObfuscatedCode(),
  };
}

/** Every setting a portal needs, checked before spending time on a build. */
function settingProblems(game, kits) {
  const out = [];
  for (const kit of kits) {
    const values = game.portalSettings?.[kit.id] ?? {};
    for (const k of missingSettings(kit, values)) out.push(`${kit.id}: thiếu ${k} (${kit.config.settings[k].label}) — gamekit config --portal ${kit.id}`);
    for (const [k, v] of Object.entries(values)) {
      const err = checkSetting(kit, k, v);
      if (err) out.push(`${kit.id}.${k}: ${err}`);
    }
  }
  return out;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const game = loadGame(root);
  const portals = args.all || !args.portal ? game.portals : String(args.portal).split(',');
  for (const p of portals) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p)) throw new GkError(`Tên portal không hợp lệ: "${p}"`);
    if (!game.portals.includes(p)) throw new GkError(`Portal ${p} chưa khai báo trong game.yaml (portals) — gamekit config --portal ${p}`);
  }
  const kits = portals.map((p) => loadPortal(p));
  const problems = settingProblems(game, kits);
  if (problems.length) throw new GkError(`Chưa đóng gói được:\n  ${problems.join('\n  ')}`);

  const buildsDir = path.join(root, 'builds');
  const existing = exists(buildsDir) ? fs.readdirSync(buildsDir) : [];
  const version = args.version ? checkVersion(args.version, existing) : nextVersion(existing);
  const tools = gameTools(root);
  const languages = loadLanguages(root);
  const commit = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true }) ?? 'nogit';
  const dirty = (git(root, ['status', '--porcelain', '--', '.', ...DOC_PATHS], { allowFail: true }) ?? '') !== '';
  const base = path.join(buildsDir, version);
  const manifest = { name: game.name, title: game.title, semver: game.version, version, commit, dirty, builtAt: nowIso(), portals: {} };

  try {
    for (const kit of kits) {
      log.head(`Đóng gói ${game.name} ${version} cho ${kit.id}`);
      const tmp = path.join(base, `.vite-${kit.id}`);
      const r = spawnSync('npx', ['vite', 'build', '--outDir', tmp, '--emptyOutDir'], {
        cwd: root,
        stdio: args.quiet ? 'pipe' : 'inherit',
        encoding: 'utf8',
        shell: process.platform === 'win32',
        env: { ...process.env, GK_PORTAL: kit.id, GK_BUILD: `${version}+${commit}${dirty ? '.dirty' : ''}`, GK_PACK: '1' },
      });
      if (r.status !== 0) throw new GkError(`vite build lỗi cho ${kit.id}${args.quiet ? `: ${buildError(`${r.stdout}\n${r.stderr}`)}` : ''}`);
      const outDir = path.join(base, kit.id);
      await assemblePortal({ game, kit, settings: game.portalSettings?.[kit.id] ?? {}, version, viteOut: tmp, languages, outDir, ...tools });
      fs.rmSync(tmp, { recursive: true, force: true });
      if (args.compress) compress(path.join(outDir, version));
      manifest.portals[kit.id] = { hash: hashDir(outDir) };
      log.ok(`builds/${version}/${kit.id}`);
      if (args.zip) {
        const z = path.join(base, `${game.name}-${kit.id}-${version}.zip`);
        if (zipDir(outDir, z)) log.ok(`zip: ${path.relative(root, z)}`);
        else log.warn('Không tìm thấy lệnh zip — bỏ qua bước nén zip.');
      }
    }
  } catch (e) {
    fs.rmSync(base, { recursive: true, force: true }); // a failed build never leaves a half package behind
    throw e;
  }
  writeJson(path.join(base, 'manifest.json'), manifest);
  if (dirty) log.warn('Đóng gói từ bản chưa commit — release-check sẽ chặn. Commit rồi pack lại để phát hành.');
  return 0;
}
```
HELP: `pack [--portal a,b | --all] [--version V] [--compress] [--zip]   builds/<YYMMDDNN>/<portal>/ theo bố cục portal`.
- [ ] **Step 4: Chạy, thấy xanh** — `npm test`.
- [ ] **Step 5: Kiểm thật** — game thử (Task 8) với `portals=dev-mock,azgames`: `npm run gk -- config --set azgames.gameCode=g205 --set azgames.signed=<token domain azgame.io>`; `npm run gk -- pack --all`. Kiểm:
  - `builds/<v>/{azgames,dev-mock}/` đúng bố cục; `builds/<v>/manifest.json` có.
  - `grep -c "gamekit.dev.lang" builds/<v>/dev-mock/<v>/framework.js` = 0 (dev-loader không lọt vào gói).
  - Thêm `Language/es.json` có chuỗi lạ `"zz.only": "ESPANOL-ONLY"` (và key đó trong en.json), pack lại: `framework.js` không chứa `ESPANOL-ONLY`.
  - `loader.js` không đọc được bằng mắt (đã làm rối); pack lại với `--version` khác ra `loader.js` khác, cùng version ra cùng nội dung (xoá thư mục rồi `--version` cũ).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(pack): builds/<YYMMDDNN>/<portal>/ theo bố cục portal"`

---

### Task 12: `release-check` cho bố cục mới

**Files:**
- Modify: `scripts/release-check.mjs`, `scripts/gamekit.mjs` (HELP)
- Test: `tests/build.test.mjs`, `tests/cli.test.mjs` (thay test `release-check: provenance, original names…` cũ)

**Interfaces:**
- Consumes: `latestVersion` (Task 1); `loadPortal` (Task 3); `ASSET_KINDS` (Task 10); `validateGame`, `loadProvenance`.
- Produces: `checkBuild(root, version, portal, game, prov): Problems`.

- [ ] **Step 1: Viết test** — `tests/build.test.mjs`, dùng `fakeVite`, `GAME`, `SETTINGS`, `LANGS`, `TOOLS` của Task 10; thêm import:
```js
import YAML from 'yaml';
import { newGame, gk, sh } from './helpers.mjs';
import { checkBuild } from '../scripts/release-check.mjs';
import { loadProvenance } from '../scripts/validate.mjs';
```
```js
async function packedGame(name) {
  const dir = newGame(name);
  // ship-ready labels for the files the package carries from public/
  write(dir, 'public/StreamingAssets/data/level1.json', '{}');
  gk(dir, 'provenance', 'add', 'public/Icons', 'public/StreamingAssets/data/level1.json', '--label', 'own');
  const out = path.join(dir, 'builds/26101601/azgames');
  await assemblePortal({ game: { ...GAME, title: 'Demo' }, kit: loadPortal('azgames'), settings: SETTINGS, version: '26101601', viteOut: fakeVite(tmpDir()), languages: LANGS, outDir: out, ...TOOLS });
  const head = sh(dir, 'git', 'rev-parse', '--short', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: head, dirty: false }));
  return { dir, out, game: { ...YAML.parse(read(dir, 'game.yaml')), release: { forbiddenTerms: ['OldName'], allowedHosts: [] } } };
}

test('release-check: a correct az-v1 package passes', async () => {
  const { dir, game } = await packedGame('rc-ok');
  const pr = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir));
  assert.ok(pr.ok, pr.errors.join('\n'));
  assert.match(pr.warnings.join('\n'), /domain\.webp/, 'logo portal còn là placeholder');
});

test('release-check: every layout fault is caught', async () => {
  const faults = [
    ['file lạ ở vỏ', (o) => write(o, 'notes.txt', 'x'), /notes\.txt/],
    ['version.txt có newline', (o) => fs.writeFileSync(path.join(o, 'version.txt'), '26101601\n'), /version\.txt/],
    ['preview khác index', (o) => fs.appendFileSync(path.join(o, 'preview.html'), ' '), /preview\.html/],
    ['thiếu <base>', (o) => {
      const inner = read(o, '26101601/index.html');
      fs.writeFileSync(path.join(o, 'index.html'), inner);
      fs.writeFileSync(path.join(o, 'preview.html'), inner);
    }, /<base/],
    ['script lạ', (o) => {
      const html = read(o, 'index.html').replace('</body>', '<script src="https://evil.example.com/x.js"></script></body>');
      fs.writeFileSync(path.join(o, 'index.html'), html);
      fs.writeFileSync(path.join(o, 'preview.html'), html);
    }, /evil\.example\.com/],
    ['thiếu bản quyền', (o) => fs.writeFileSync(path.join(o, '26101601/framework.js'), 'console.log(1) /* Copyright (c) lib */'), /copyright/i],
    ['JS trong StreamingAssets', (o) => write(o, '26101601/StreamingAssets/data/x.js', '1'), /StreamingAssets/],
    ['thiếu Language/en.json', (o) => fs.rmSync(path.join(o, '26101601/Language/en.json')), /en\.json/],
    ['asset sai thư mục', (o) => write(o, '26101601/assets/misc/a.bin', 'x'), /assets\/misc/],
    ['tên game gốc', (o) => write(o, '26101601/Language/fr.json', '{"a":"OldName"}'), /OldName/i],
    ['file lạ trong <v>/', (o) => write(o, '26101601/TemplateData/a.css', 'x'), /TemplateData/],
  ];
  for (const [what, mutate, expected] of faults) {
    const { dir, out, game } = await packedGame(`rc-${faults.findIndex((f) => f[0] === what)}`);
    mutate(out);
    const errors = checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n');
    assert.match(errors, expected, what);
  }
});

test('release-check: unbuilt, dirty or stale packages are refused', async () => {
  const { dir, game } = await packedGame('rc-fresh');
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: 'abc1234', dirty: true }));
  assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /chưa commit/);
  fs.writeFileSync(path.join(dir, 'builds/26101601/manifest.json'), JSON.stringify({ commit: 'abc1234', dirty: false }));
  assert.match(checkBuild(dir, '26101601', 'azgames', game, loadProvenance(dir)).errors.join('\n'), /HEAD/);
  assert.match(checkBuild(dir, '26101601', 'dev-mock', game, loadProvenance(dir)).errors.join('\n'), /chưa có gói/);
});
```
Trong `tests/cli.test.mjs`: xoá test `release-check: provenance, original names, foreign links, absolute paths, budget` và import `checkPackage`; thêm:
```js
test('release-check command: no build yet is an error', () => {
  const dir = newGame('rcn');
  const r = gk(dir, 'release-check');
  assert.equal(r.code, 1);
  assert.match(r.out, /chưa có bản build/);
});
```
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Viết lại `scripts/release-check.mjs`**
```js
// gamekit release-check — last gate before a package leaves: layout az-v1, provenance clean, no foreign links,
// no original names, copyright footer wired, within budget, built from the current commit.
import fs from 'node:fs';
import path from 'node:path';
import { exists, walk } from './lib/io.mjs';
import { Problems, log } from './lib/log.mjs';
import { git } from './lib/git.mjs';
import { requireGameRoot } from './lib/game.mjs';
import { PHASES } from './lib/phases.mjs';
import { latestVersion } from './lib/version.mjs';
import { loadPortal } from './lib/portals.mjs';
import { ASSET_KINDS } from './lib/assemble.mjs';
import { validateGame, loadProvenance } from './validate.mjs';

const ALWAYS_ALLOWED_HOSTS = ['www.w3.org', 'w3.org'];
const TEXT = /\.(html|js|mjs|css|json|svg|txt|xml)$/i;
const SHIP_OK = new Set(['own', 'generated', 'licensed']);
const INNER_TOP = new Set(['index.html', 'loader.js', 'framework.js', 'css', 'Icons', 'Language', 'assets', 'StreamingAssets']);
const REQUIRED = ['index.html', 'loader.js', 'framework.js', 'css/style.css', 'Icons/web.png', 'Icons/loading.webp', 'Icons/domain.webp', 'Language/en.json'];
const hostAllowed = (host, allowed) => allowed.some((a) => host === a || host.endsWith('.' + a));
const URL_RE = /(?:https?|wss?):\/\/((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})/gi;
const BINARY_SCAN_LIMIT = 64 * 1024 * 1024;
const COMPRESSED = /\.(gz|br)$/;

function checkLayout(dir, version, kit, where, pr) {
  const shell = ['index.html', 'preview.html', 'version.txt', version];
  for (const f of fs.readdirSync(dir)) if (!shell.includes(f)) pr.error(where, `${f}: file lạ ở vỏ gói (chỉ được có ${shell.join(', ')})`);
  for (const f of shell) if (!exists(path.join(dir, f))) pr.error(where, `thiếu ${f}`);
  if (exists(path.join(dir, 'version.txt')) && fs.readFileSync(path.join(dir, 'version.txt'), 'latin1') !== version)
    pr.error(where, `version.txt phải đúng "${version}" (8 byte, không xuống dòng)`);
  const outer = exists(path.join(dir, 'index.html')) ? fs.readFileSync(path.join(dir, 'index.html')) : Buffer.alloc(0);
  if (exists(path.join(dir, 'preview.html')) && !fs.readFileSync(path.join(dir, 'preview.html')).equals(outer))
    pr.error(where, 'preview.html phải giống index.html từng byte');
  const outerText = outer.toString('utf8');
  if (!outerText.includes(`<base href="${version}/">`)) pr.error(where, `index.html thiếu <base href="${version}/">`);
  const inner = path.join(dir, version);
  if (exists(path.join(inner, 'index.html')) && /<base\b/i.test(fs.readFileSync(path.join(inner, 'index.html'), 'utf8')))
    pr.error(where, `${version}/index.html không được có <base> (mở trực tiếp để test)`);
  for (const f of REQUIRED) if (!exists(path.join(inner, f))) pr.error(where, `thiếu ${version}/${f}`);
  for (const rel of walk(inner)) {
    const [top, kind] = rel.replace(COMPRESSED, '').split('/');
    if (!INNER_TOP.has(top)) pr.error(where, `${version}/${rel}: không thuộc bố cục gói`);
    if (top === 'assets' && !ASSET_KINDS.has(kind)) pr.error(where, `${version}/${rel}: asset phải nằm trong assets/{${[...ASSET_KINDS].join(',')}}`);
    if (top === 'StreamingAssets' && /\.(m?js|wasm|html?)$/i.test(rel)) pr.error(where, `${version}/${rel}: StreamingAssets chỉ chứa dữ liệu, không chứa code`);
  }
  let loaders = 0;
  for (const m of outerText.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1];
    if (src === 'loader.js') loaders++;
    else if (/^https:\/\//i.test(src)) {
      const host = new URL(src).hostname;
      if (!hostAllowed(host, kit.config.allowedHosts ?? [])) pr.error(where, `index.html nạp script từ ${host} — không thuộc allowedHosts của portal ${kit.id}`);
    } else pr.error(where, `index.html nạp script "${src}" — trang chỉ được nạp loader.js và SDK của portal`);
  }
  if (loaders !== 1) pr.error(where, `index.html phải nạp loader.js đúng một lần (đang ${loaders})`);
  for (const f of kit.config.placeholders ?? []) pr.warn(where, `${f} của bộ vỏ ${kit.id} còn là placeholder — thay bằng file thật trong plugin`);
}

function checkContent(root, dir, version, kit, game, prov, where, pr) {
  const labels = new Map((prov.entries ?? []).map((e) => [e.path, e.label]));
  const terms = (game.release?.forbiddenTerms ?? []).filter(Boolean).map((t) => t.toLowerCase());
  const allowed = [...ALWAYS_ALLOWED_HOSTS, ...(game.release?.allowedHosts ?? []), ...(kit.config.allowedHosts ?? [])];
  const inner = `${version}/`;
  let initialBytes = 0;
  let biggestLanguage = 0;
  for (const rel of walk(dir)) {
    if (COMPRESSED.test(rel)) continue;
    const abs = path.join(dir, rel);
    const size = fs.statSync(abs).size;
    const sub = rel.startsWith(inner) ? rel.slice(inner.length) : null;
    const lower = rel.toLowerCase();
    for (const t of terms) if (lower.includes(t)) pr.error(where, `${rel}: tên file còn tên game gốc "${t}"`);
    if (rel.endsWith('.map')) pr.warn(where, `${rel}: source map lộ mã nguồn`);

    if (rel === 'index.html' || ['loader.js', 'framework.js', 'css/style.css'].includes(sub) || sub?.startsWith('Icons/')) initialBytes += size;
    if (sub?.startsWith('Language/')) biggestLanguage = Math.max(biggestLanguage, size);

    // Files copied from public/ keep their path and must carry a shippable label.
    const fromPublic = sub && (sub === 'Icons/web.png' || sub === 'Icons/loading.webp' || sub.startsWith('StreamingAssets/')) ? `public/${sub}` : null;
    if (fromPublic) {
      const label = labels.get(fromPublic);
      if (!label) pr.error(where, `${rel}: không có nhãn provenance (${fromPublic})`);
      else if (!SHIP_OK.has(label)) pr.error(where, `${rel}: nhãn ${label} không được phát hành (${fromPublic})`);
    }

    if (TEXT.test(rel)) {
      const text = fs.readFileSync(abs, 'utf8');
      const low = text.toLowerCase();
      for (const t of terms) if (low.includes(t)) pr.error(where, `${rel}: còn tên/thương hiệu game gốc "${t}"`);
      if (sub !== 'loader.js') {
        // loader.js is generated by the plugin's portal kit (obfuscated); its hosts come from portal.yaml.
        for (const m of text.matchAll(URL_RE))
          if (!hostAllowed(m[1].toLowerCase(), allowed)) pr.error(where, `${rel}: link ngoài tới ${m[1]} (thêm vào release.allowedHosts nếu là SDK portal)`);
      }
      if (rel.endsWith('index.html')) {
        for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["'](\/\/?[^"']*)["']/gi)) {
          if (m[1].startsWith('//')) pr.error(where, `${rel}: link ngoài dạng ${m[1]}`);
          else pr.error(where, `${rel}: đường dẫn tuyệt đối ${m[1]} — phải là đường dẫn tương đối`);
        }
      }
      if (sub === 'framework.js' && !/\.copyright\b/.test(text))
        pr.error(where, 'framework.js không đọc platform.info.copyright — popup Settings phải có footer bản quyền của portal');
    } else if (terms.length && size <= BINARY_SCAN_LIMIT) {
      const bin = fs.readFileSync(abs).toString('latin1').toLowerCase();
      for (const t of terms) if (/^[\x20-\x7e]+$/.test(t) && bin.includes(t)) pr.error(where, `${rel}: file nhị phân còn chuỗi "${t}"`);
    }
  }
  const mb = (initialBytes + biggestLanguage) / 1024 / 1024;
  const budget = game.budget?.initialLoadMB;
  if (budget && mb > budget) pr.error(where, `tải đầu ${mb.toFixed(2)}MB vượt ngân sách ${budget}MB`);
  else log.dim(`${where}: tải đầu ${mb.toFixed(2)}MB${budget ? ` / ${budget}MB` : ''}`);
}

/** The package must come from the current commit with no pending code/asset changes. */
function checkFreshness(root, version, where, pr) {
  const f = path.join(root, 'builds', version, 'manifest.json');
  if (!exists(f)) {
    pr.error(where, `thiếu builds/${version}/manifest.json — đóng gói bằng \`gamekit pack\``);
    return;
  }
  const man = JSON.parse(fs.readFileSync(f, 'utf8'));
  const head = git(root, ['rev-parse', '--short', 'HEAD'], { allowFail: true });
  if (man.dirty) pr.error(where, `đóng gói từ bản chưa commit — commit rồi pack lại`);
  else if (head && man.commit && man.commit !== head) pr.error(where, `gói build từ commit ${man.commit}, HEAD là ${head} — pack lại`);
}

export function checkBuild(root, version, portal, game, prov) {
  const pr = new Problems();
  const where = `builds/${version}/${portal}`;
  const dir = path.join(root, 'builds', version, portal);
  if (!exists(path.join(dir, 'index.html'))) {
    pr.error(where, 'chưa có gói — chạy `gamekit pack`');
    return pr;
  }
  let kit;
  try {
    kit = loadPortal(portal);
  } catch (e) {
    pr.error(where, e.message);
    return pr;
  }
  checkLayout(dir, version, kit, where, pr);
  checkFreshness(root, version, where, pr);
  checkContent(root, dir, version, kit, game, prov, where, pr);
  return pr;
}

export async function run(args) {
  const root = requireGameRoot(args.cwd);
  const { problems, game } = validateGame(root, { stage: PHASES.indexOf('P5') });
  const all = new Problems().merge(problems);
  const buildsDir = path.join(root, 'builds');
  const version = args.version ? String(args.version) : latestVersion(exists(buildsDir) ? fs.readdirSync(buildsDir) : []);
  if (!version) all.error('builds', 'chưa có bản build — chạy `gamekit pack`');
  else {
    const prov = loadProvenance(root);
    const portals = args.portal ? String(args.portal).split(',') : game.portals ?? [];
    log.info(`Kiểm builds/${version}`);
    for (const p of portals) all.merge(checkBuild(root, version, p, game, prov));
  }
  return all.report('release-check') ? 0 : 1;
}
```
HELP: `release-check [--version V] [--portal p]   Cổng phát hành cho builds/<V> (mặc định bản mới nhất)`.
- [ ] **Step 4: Chạy, thấy xanh** — `npm test`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(release-check): kiểm bố cục az-v1 trong builds/<v>/"`

---

### Task 13: Tài liệu, skill, hook và kiểm thật toàn bộ

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `skills/package-web-build/SKILL.md`, `skills/release-check/SKILL.md`, `skills/platform-sdk/SKILL.md`, `skills/using-gamekit/SKILL.md`, `skills/using-gamekit/references/claude-code.md`, `templates/game/AGENTS.md`, `templates/game/gates/P5.md`
- Test: `tests/cli.test.mjs`

- [ ] **Step 1: Viết test** — pre-commit chặn `builds/`:
```js
test('pre-commit blocks build output even when force-added', () => {
  const dir = newGame('pcb');
  write(dir, 'builds/26101601/dev-mock/index.html', 'x');
  sh(dir, 'git', 'add', '-f', 'builds/26101601/dev-mock/index.html');
  assert.throws(() => sh(dir, 'git', 'commit', '-qm', 'x'), /thư mục cấm/);
});
```
- [ ] **Step 2: Chạy** — xanh nhờ `FORBIDDEN_DIRS` có `builds` (Task 9); nếu đỏ, sửa `scripts/precommit.mjs` cho dùng `FORBIDDEN_DIRS`.
- [ ] **Step 3: Tài liệu**
  - `skills/package-web-build/SKILL.md`: viết lại theo bố cục `builds/<v>/<portal>/` (cây thư mục §2 của spec), số phiên bản, `--version`, `--compress`, `--zip` ra `builds/<v>/<name>-<portal>-<v>.zip`, cần `portalSettings` đủ (`gamekit config`), test local bằng `npm run preview` → `http://localhost:4173/<v>/dev-mock/<v>/index.html`.
  - `skills/release-check/SKILL.md`: thêm các luật bố cục (§10 spec), mặc định bản mới nhất, `--version`.
  - `skills/platform-sdk/SKILL.md`: `Platform.info.copyright`, popup Settings bắt buộc giữ footer, vỏ portal nằm trong `portals/<id>/` của plugin (portal.yaml, kit.mjs, shell.html, loader.entry.js), adapter `azgames` hiện chỉ có analytics.
  - `skills/using-gamekit/SKILL.md` + `references/claude-code.md`: quy trình tạo game cho agent — `gamekit init <tên> --questions --json` → hỏi người dùng **từng câu, kèm `description`** (AskUserQuestion trong Claude Code; câu portal chỉ hỏi cho portal đã chọn) → `gamekit init <tên> --set …`; thiếu thì `gamekit config --portal <id>`.
  - `templates/game/AGENTS.md`: bảng lệnh — `pack` ra `builds/<v>/<portal>/`, `npm run preview`; cấu trúc thêm `Language/`, `public/Icons/`; luật: popup Settings giữ footer bản quyền, text qua `t()` và `Language/en.json`.
  - `templates/game/gates/P5.md`: thêm `- [ ] Mở builds/<v>/dev-mock/<v>/index.html: màn loading → game → Settings đổi ngôn ngữ được`.
  - `README.md`: bảng lệnh (`init` hỏi thông tin, `config`, `pack` → `builds/`, `release-check --version`), cấu trúc plugin thêm `portals/`.
  - `CHANGELOG.md` mục "Chưa phát hành": gói AZGAMES bố cục B.1, `builds/<YYMMDDNN>/<portal>/`, vỏ portal trong plugin, `init`/`config` hỏi thông tin kèm giải thích, đa ngôn ngữ một file/người chơi, popup Settings có bản quyền.
- [ ] **Step 4: Kiểm toàn bộ plugin** — `npm test`: chỉ còn test symlink EPERM (môi trường).
- [ ] **Step 5: Kiểm thật trên game thử** (thư mục scratchpad, có `npm install`):
  1. `node <plugin>/scripts/gamekit.mjs init trial --dir <scratch> --set portals=azgames --set languages=en,es --set azgames.gameCode=g205 --set azgames.signed=<token domain azgame.io>`
  2. Trong game: `npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- validate` → đạt.
  3. `git add -A && git commit -m wip` (để gói không bị đánh dấu dirty), `npm run gk -- pack --all --zip` → `builds/<v>/{azgames,dev-mock}`, 2 file zip, `manifest.json`.
  4. `npm run gk -- provenance add public/Icons --label own && git commit -am icons && npm run gk -- pack --all` rồi `npm run gk -- release-check` → đạt (chỉ cảnh báo `domain.webp` placeholder).
  5. `npm run preview` (nền) → `curl -s -o /dev/null -w "%{http_code}"` cho `/<v>/dev-mock/index.html`, `/<v>/dev-mock/<v>/loader.js`, `/<v>/dev-mock/<v>/Language/es.json` → `200`.
  6. **Người dùng mở trình duyệt** `http://localhost:4173/<v>/dev-mock/index.html` và `…/<v>/dev-mock/<v>/index.html`: thấy màn loading có % → game chạy → nút ⚙ mở Settings, footer `© 20YY GameKit (dev)`, đổi sang Español thì trang tải lại và chữ đổi; `?lang=es` cũng đổi. Ghi lại kết quả người dùng báo, không tự khẳng định.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "docs: gói AZGAMES, builds/<v>/, hỏi thông tin portal"`
