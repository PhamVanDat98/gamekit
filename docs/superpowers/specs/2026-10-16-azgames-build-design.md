# Gói build AZGAMES, `builds/{version}/` và hỏi thông tin khi `init`

Ngày: 2026-10-16 · Trạng thái: chờ duyệt

## 1. Mục tiêu

- `gamekit pack` ra gói đúng bố cục B.1 của AZGAMES, mỗi lần build một thư mục phiên bản `builds/<v>/`, mỗi portal một thư mục con.
- Phần vỏ portal (trang HTML, `loader.js`, màn loading, sitelock, khởi tạo SDK) nằm **một chỗ trong plugin**, mọi game dùng chung.
- `init` hỏi các thông tin portal cần (kèm giải thích từng mục); thiếu thì vẫn tạo game, nhưng `pack` cho portal đó dừng lại.
- Đa ngôn ngữ ưu tiên dung lượng: người chơi chỉ tải một file ngôn ngữ.
- Popup Settings trong game có footer `© <năm> Azgames.io`.

### Ngoài phạm vi spec này

- Cắt font theo ngôn ngữ (font subset) — làm sau, cùng phần i18n mở rộng.
- Bộ câu hỏi thiết kế game kiểu BMAD (thể loại, người chơi, mục tiêu) — dùng lại cơ chế câu hỏi ở §5, làm sau.
- Quảng cáo, leaderboard thật qua gmsdkv2 trong adapter `azgames` — adapter bản này chỉ có thông tin portal, analytics và báo `unavailable` cho quảng cáo.
- Firebase (có trong bản Unity mẫu) — bỏ; analytics đi qua `GMGameSDK.trackEvent` trong adapter.

## 2. Bố cục đầu ra

```
builds/
  26101601/                       ← một lần pack
    manifest.json                 ← commit, dirty, hash, kích thước — KHÔNG upload
    ten-game-azgames-26101601.zip ← (--zip) nội dung = thư mục azgames/
    azgames/                      ← đơn vị upload lên portal
      index.html                  ← = <v>/index.html + <base href="26101601/">
      preview.html                ← giống index.html từng byte
      version.txt                 ← "26101601", đúng 8 byte, không newline
      26101601/
        index.html                ← cùng trang, không <base> (mở trực tiếp)
        loader.js                 ← JS #1, đã làm rối, file JS duy nhất trang nạp
        framework.js              ← JS #2, toàn bộ game, minify, một file
        css/style.css
        Icons/web.png             ← favicon (từ game)
        Icons/loading.webp        ← key art màn loading (từ game)
        Icons/domain.webp         ← logo AZGAMES (từ bộ vỏ portal)
        Language/en.json          ← bắt buộc; mỗi ngôn ngữ một file, đã minify, đủ key
        Language/<lang>.json
        assets/img/ art/ audio/ fonts/
        StreamingAssets/data/     ← chỉ dữ liệu loader/game nạp lúc chạy
    dev-mock/                     ← cùng bố cục, vỏ dev-mock (không sitelock, SDK giả)
```

- `dist/` bị bỏ. `builds/` được gitignore. Bản cũ giữ lại, không tự xoá.
- Test local: mở `builds/<v>/dev-mock/<v>/index.html` (qua `npx vite preview` hoặc server tĩnh). Bản `azgames` có sitelock nên không chạy local — đúng chủ ý.

## 3. Số phiên bản

- `YYMMDDNN`: ngày build (giờ máy) + số thứ tự trong ngày `01`–`99`, tính từ các thư mục đã có trong `builds/`.
- `--version 26101605` để chỉ định; phải là 8 chữ số và chưa tồn tại (không ghi đè).
- Hết `99` trong một ngày → báo lỗi.
- `game.yaml` `version` (semver) giữ nguyên ý nghĩa bản phát hành, ghi trong `manifest.json`. `YYMMDDNN` là `productVersion` gửi SDK, `GM_GAME.version`, `version.txt`.
- Năm bản quyền = `20` + `YY` của số phiên bản.

## 4. Bộ vỏ portal trong plugin

```
gamekit/portals/
  azgames/
    portal.yaml     ← khai báo: settings (câu hỏi), allowedHosts, copyright, checklist, icon bắt buộc
    shell.html      ← trang có placeholder
    loader.ts       ← nguồn loader.js
    Icons/domain.webp
  dev-mock/
    portal.yaml  shell.html  loader.ts  Icons/domain.webp (logo GameKit)
```

`portal.yaml` (azgames):

```yaml
name: AZGAMES
layout: az-v1
allowedHosts: [gm.azgame.io, api.azgame.io, azgames.io]
sitelock: [azgames.io, azgame.io]      # host và mọi subdomain
copyright: "© {{YEAR}} Azgames.io"
checklist:                              # thêm vào gates/P4.md khi game có portal này
  - Popup Settings có footer "© <năm> Azgames.io", hiện ở mọi ngôn ngữ (bạn)
settings:
  gameCode:  { label, description, example: g205, required: true, pattern: "^[a-z0-9]+$" }
  gameId:    { label, description, default: "{{NAME}}-az", required: true, pattern: "^[a-z0-9-]+-az$" }
  portalGid: { label, description, default: "{{NAME}}", required: true, pattern: "^[a-z0-9-]+(?<!-az)$" }
  signed:    { label, description, required: true, check: gmsoft-signed }
```

`label` / `description` của từng khoá lấy đúng nội dung bảng dưới (hiện khi hỏi):

| Khoá | Giải thích |
| --- | --- |
| `gameCode` | Mã game do bên vận hành portal cấp. Dùng làm key localStorage `azgames.<gameCode>` (tiến trình, ngôn ngữ đã chọn). |
| `gameId` | Id game trên SDK, kết thúc bằng `-az`. `GMGameSDK.init` dùng cho analytics, leaderboard. |
| `portalGid` | Slug trang game trên portal, không có `-az`. gmsdkv2 dùng cho More Games, quảng cáo; sitelock chuyển hướng về `azgames.io/<portalGid>`. |
| `signed` | Token `GMSOFT_SIGNED` do bên vận hành portal cấp riêng cho từng game, chứa domain được phép; gmsdkv2 kiểm tra trước khi bật quảng cáo, More Games. Dán nguyên chuỗi base64. |

Kiểm tra `gmsoft-signed`: base64 giải ra JSON có `signed` và `domain`; `domain` thuộc `sitelock`.

### `shell.html`

Giữ từ bản mẫu: `<meta name="robots" content="noindex, nofollow">`, `<link rel="canonical" href="https://azgames.io/<portalGid>">`, `<link rel="icon" href="Icons/web.png">`.

Thứ tự trong trang:

1. CSS màn loading **inline** + HTML màn loading (`Icons/loading.webp` làm nền mờ và ảnh giữa, tên game, spinner/thanh %, `Icons/domain.webp`, số phiên bản) — hiện trước khi JS chạy.
2. `<script>` inline:
   ```html
   /* ===== AZGAMES SETTINGS ===== */
   window.AZ_SETTINGS = { gameCode, language, gameId, portalGid };   // đúng 4 khoá, kèm chú thích như mẫu
   /* =========================== */
   window.GM_GAME = { id: '<gameId>', version: '<v>' };
   window.GM_LOAD_START = performance.now();
   window["GMSOFT_SDKTYPE"] = "gm";
   window["GMSOFT_SIGNED"] = "<signed>";
   ```
3. `gm-sdk.js`, `gm-iframe.js` (gm.azgame.io/sdk/v3), `gmsdkv2.js` (`id="gmsoft-jssdk"`).
4. `<script src="loader.js" defer>`.
5. `<link rel="stylesheet" href="css/style.css">` và `<canvas>`/container của game.

Placeholder: `{{TITLE}}`, `{{VERSION}}`, `{{LANG}}`, `{{SETTINGS_SCRIPT}}`, `{{CANONICAL}}`. Giá trị được escape theo ngữ cảnh (HTML / JS string).

## 5. Hỏi thông tin khi `init` và `config`

Câu hỏi là dữ liệu: phần chung của GameKit (tên mới, engine gốc, đường dẫn game gốc, portal phát hành, ngôn ngữ mặc định, các ngôn ngữ hỗ trợ) + `settings` của từng portal được chọn. Mỗi câu: `label`, `description`, `example`, `default`, `required`, `pattern`/`check`.

| Cách | Hành vi |
| --- | --- |
| TTY | Hỏi từng câu: nhãn, giải thích, ví dụ, `[mặc định]`. Enter = mặc định. Sai định dạng → nói lý do, hỏi lại. |
| Agent / không TTY | Không hỏi. `gamekit init --questions --json` in danh sách câu hỏi (đã điền default theo tên). Agent hỏi người dùng từng câu kèm giải thích, rồi `gamekit init … --set azgames.gameCode=g205 --set …`. Skill `using-gamekit` ghi quy trình này. |
| Chưa biết | Câu bắt buộc chưa trả lời → `null`. Game vẫn tạo. `status` liệt kê thiếu gì; `pack` portal đó dừng với danh sách thiếu; `validate` báo lỗi từ P4. |

`gamekit config [--portal azgames] [--set k=v …] [--questions --json]`: hỏi lại các câu còn trống (hoặc của portal mới thêm). Thêm portal vào `portals` qua `config --portal <id>` cũng chép `checklist` của portal vào `gates/P4.md`.

Ghi vào `game.yaml`:

```yaml
portals: [dev-mock, azgames]
portalSettings:
  azgames: { gameCode: g205, gameId: ten-game-az, portalGid: ten-game, signed: "eyJ…" }
language: en
languages: [en, es]
```

`schemas/game.schema.json` thêm `portalSettings` (object theo portal, giá trị string|null), `language`, `languages`. Kiểm tra từng khoá theo `portal.yaml` nằm trong `validate`, không trong JSON schema (vì phụ thuộc portal).

## 6. `loader.js`

Nguồn `portals/<id>/loader.ts`, bundle bằng esbuild (từ `node_modules` của game, đi kèm vite), rồi làm rối bằng `javascript-obfuscator` (devDependency của template game; plugin vẫn chỉ phụ thuộc `yaml` + `ajv`). Seed làm rối = số phiên bản → cùng nguồn + cùng phiên bản ra cùng `loader.js`.

`pack` nhúng vào loader trước khi làm rối: danh sách ngôn ngữ `[{code, name}]`, kích thước (byte, chưa nén) của `framework.js` và từng file ngôn ngữ, chuỗi bản quyền đã điền năm.

Thứ tự:

1. **Sitelock** (chỉ azgames). `allowed(h)` = `h` là hoặc là subdomain của `azgames.io` / `azgame.io`.
   - Cửa sổ trên cùng: `!allowed(location.hostname)` hoặc `!document.referrer` → `location.href = "https://azgames.io/<portalGid>"`.
   - Trong iframe: host cha = `top.location.hostname`, nếu không đọc được thì host của `document.referrer`; không xác định được hoặc `!allowed` → không nạp game (dừng ở màn loading).
2. **SDK**: `GMGameSDK.init(gameId, "https://gm.azgame.io").setVersion(<v>)`; gửi `game_loaded` lên cha (`postMessage` `{source:"azgames", type, game, version, host, time}`, mỗi loại một lần — như `gmPostToParent` mẫu).
3. **Ngôn ngữ**: localStorage `azgames.<gameCode>.lang` → `?lang=` → `navigator.languages` (khớp `pt-BR` → `pt-br` → `pt`) → `AZ_SETTINGS.language` → `en`. Chỉ chọn mã có trong danh sách.
4. **Tải song song** `framework.js` và `Language/<lang>.json` bằng `fetch` stream; % = byte đã nhận / tổng kích thước nhúng sẵn. Màn loading: spinner → thanh % → "Almost there…" ở ≥ 99%; màu thanh lấy từ ảnh loading (như GM Loader v1).
5. **Giao cho game**: `window.GM_LANG = { code, dict, available }`, `window.GM_LOADER = { copyright, ready() }`; chạy `framework.js`. Game gọi `GM_LOADER.ready()` sau khung hình đầu → ẩn màn loading, `window.focus()`, gửi `game_started` kèm `load_time_ms`.
6. **Lỗi** tải: thông báo + nút "Thử lại" trên màn loading (không `alert`).

Bộ `dev-mock`: bỏ bước 1, SDK giả (log ra console), còn lại giống.

Chế độ `npm run dev` (không qua loader): `src/platform/dev-loader.ts` dựng `GM_LANG` từ `Language/*.json` (`import.meta.glob`) và `GM_LOADER` giả, để game chạy giống lúc build.

## 7. Phía game (template)

- Nguồn ngôn ngữ: `Language/<lang>.json` ở gốc game (key phẳng, `{tham số}`, số nhiều `.one/.other/…`, `_meta.name`, `_meta.dir`).
- `src/core/` không đụng text. `src/view/i18n.ts`: `t(key, params)` đọc `GM_LANG.dict`, số nhiều qua `Intl.PluralRules`, thiếu key → hiện chính key.
- `Platform` thêm `info: { portal: string; copyright: string }`. Adapter `azgames` lấy từ `GM_LOADER.copyright`; `dev-mock` trả `© <năm> GameKit (dev)`.
- Popup Settings trong `src/view/`: bật/tắt âm thanh; chọn ngôn ngữ (`GM_LANG.available`, lưu `azgames.<gameCode>.lang` rồi tải lại trang); footer `platform.info.copyright`. Chuỗi bản quyền không qua bản dịch.
- `main.ts` gọi `GM_LOADER.ready()` sau khung hình đầu.
- Vite: một entry, không tách chunk → `framework.js`; css → `css/style.css`; asset theo đuôi → `assets/img` (png jpg jpeg webp gif svg avif), `assets/audio` (mp3 ogg m4a aac wav), `assets/fonts` (woff woff2 ttf otf), còn lại `assets/art`.
- `public/Icons/web.png`, `public/Icons/loading.webp` (placeholder trong template, có nhãn provenance `placeholder`); `public/StreamingAssets/data/`.
- `.gitignore`: `builds/` thay `dist/`.

## 8. `pack`

`gamekit pack [--portal a,b | --all] [--version V] [--compress] [--zip]`

Với mỗi portal:

1. Kiểm `portalSettings` đủ và đúng (như `validate`); thiếu → dừng portal này, báo từng câu thiếu kèm lệnh `gamekit config --portal <id>`.
2. `vite build` (GK_PORTAL) ra thư mục tạm.
3. `assemblePortal(...)` ráp bố cục §2: framework/css/assets từ đầu ra vite; Icons; Language (điền key thiếu từ `en`, minify; bỏ `_meta.name` vì đã nằm trong danh sách nhúng vào loader, chỉ giữ `_meta.dir` khi là `rtl`); StreamingAssets; loader (bundle → nhúng hằng → làm rối); `<v>/index.html` từ `shell.html`; `index.html` ngoài = chèn `<base href="<v>/">` ngay sau `<head>`; `preview.html` = chép; `version.txt`.
4. `--compress`: `.gz`/`.br` cho js/css/json/wasm trong `<v>/`.
5. Ghi `builds/<v>/manifest.json`: `name, title, semver, version, commit, dirty, builtAt, portals.<p>.{hash, initialBytes}`.
6. `--zip`: `builds/<v>/<name>-<portal>-<v>.zip`.

`assemblePortal` nhận bước làm rối và bước bundle loader qua tham số (test truyền hàm không làm rối).

## 9. `validate` (thêm)

- `portalSettings.<p>` theo `portal.yaml`: `required` (lỗi từ P4, cảnh báo trước đó), `pattern`, `check: gmsoft-signed`. Portal trong `portals` không có bộ vỏ trong plugin → lỗi.
- `Language/`: có `en.json`; `language` ∈ `languages`; mỗi mã trong `languages` có file; file khác thừa key hoặc `{tham số}` khác `en` → lỗi; thiếu key → cảnh báo; `t('…')` dạng chuỗi hằng trong `src/` phải có trong `en.json`.
- `public/Icons/web.png` là PNG, `loading.webp` là WebP (đọc header); có nhãn provenance.

## 10. `release-check` (viết lại phần gói)

`gamekit release-check [--version V] [--portal p]` — mặc định bản mới nhất trong `builds/`.

Mỗi `builds/<v>/<portal>/`:

- Vỏ có đúng `index.html`, `preview.html`, `version.txt`, `<v>/` — không file khác.
- `version.txt` = tên thư mục, 8 byte, không newline. `preview.html` giống `index.html` từng byte. `index.html` ngoài có `<base href="<v>/">`; `<v>/index.html` không có `<base>`.
- `<v>/` có `index.html, loader.js, framework.js, css/style.css, Icons/{web.png, loading.webp, domain.webp}, Language/en.json`; `assets/` chỉ có `img art audio fonts`; `StreamingAssets/` không có `.js/.mjs/.wasm/.html`.
- Script trong trang: chỉ `loader.js` (tương đối) + script trên host thuộc `allowedHosts` của portal.
- `framework.js` chứa `gk-settings-footer` (class của footer bản quyền trong `src/view/settings.ts`, là chuỗi nên minify giữ nguyên; `.copyright` thì luôn có nhờ `src/platform/index.ts` nên không chứng minh được footer).
- Kiểm tra cũ áp vào bố cục mới: provenance của file phát hành, tên game gốc (`release.forbiddenTerms`, cả trong `Language/`), link ngoài (host: game.yaml + portal.yaml; bỏ qua `loader.js` vì do plugin sinh), đường dẫn tuyệt đối, `dirty` trong manifest.
- Ngân sách tải đầu = HTML + `loader.js` + `framework.js` + css + **một** file ngôn ngữ lớn nhất + Icons.

## 11. Test

Plugin (`npm test`, không cần vite):

- `nextVersion(dirs, date)`: `26101601`→`26101602`; ngày mới → `01`; đã có `99` → lỗi; `--version` trùng → lỗi.
- `assemblePortal` với đầu ra vite giả + bộ vỏ thật (`azgames`, `dev-mock`): bố cục §2, `<base>`, `preview.html` byte-equal, `version.txt`, settings được escape, `AZ_SETTINGS` đúng 4 khoá, key ngôn ngữ thiếu được điền, kích thước nhúng vào loader, asset vào đúng thư mục con.
- Câu hỏi: TTY giả (stdin script) hỏi lại khi sai `pattern`; Enter nhận default; `--questions --json`; `--set`; thiếu bắt buộc → game tạo được, `pack` báo thiếu; `config`; thêm portal chép checklist vào `gates/P4.md`; token `signed` hỏng → lỗi.
- `validate`: các luật §9.
- `release-check`: gói đúng B.1 đạt; từng lỗi bố cục bị bắt (file lạ ở vỏ, `version.txt` có newline, `preview.html` khác, thiếu `<base>`, script lạ, thiếu copyright, JS trong StreamingAssets).
- Skill/test đồng bộ hiện có vẫn xanh.

Kiểm thật: tạo game thử có `npm install`; `config` điền azgames (token mẫu); `pack --all --zip`; `release-check`; test/typecheck/lint; mở `builds/<v>/dev-mock/<v>/index.html` trong trình duyệt: màn loading → game → popup Settings có footer bản quyền, đổi ngôn ngữ được.

## 12. Thay đổi kèm theo

- `templates/game`: `vite.config.ts`, `package.json` (thêm `javascript-obfuscator`), `.vscode/tasks.json` (pack/preview trỏ `builds/`), `_gitignore`, `src/platform/*`, `src/view/*`, `Language/`, `public/Icons/`.
- Docs: README, CHANGELOG, skill `package-web-build`, `release-check`, `platform-sdk`, `using-gamekit` (quy trình hỏi thông tin).
- `scripts/precommit.mjs`, `status.mjs`: đường dẫn `builds/`, liệt kê settings còn thiếu.

## 13. Còn cần từ người dùng

1. File `Icons/domain.webp` (logo AZGAMES). Trong lúc chờ: chuyển từ `logo.png` của bản mẫu nếu đó là logo AZGAMES, hoặc dùng placeholder và `release-check` cảnh báo.
2. Kích thước yêu cầu của `web.png`, `loading.webp` (nếu portal có quy định) — hiện chỉ kiểm định dạng.
3. Danh sách `allowedHosts` đầy đủ của SDK AZGAMES (bản này lấy từ bản mẫu: `gm.azgame.io`, `api.azgame.io`).
