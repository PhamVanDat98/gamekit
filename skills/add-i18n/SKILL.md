---
name: add-i18n
description: Dùng ở P4 (và bất cứ khi nào thêm text) để đưa mọi chữ hiển thị qua t() và Language/<mã>.json — đặt key, tham số {param}, dạng số nhiều theo ngôn ngữ, thêm ngôn ngữ mới vào game.yaml, dịch, ngôn ngữ viết phải sang trái, rồi kiểm bằng gamekit validate và Settings. Dùng cả khi validate báo key thiếu/tham số khác en, hoặc người dùng muốn thêm ngôn ngữ.
---

# Đa ngôn ngữ (P4)

Luật cứng: **mọi text hiển thị đi qua `t()`** (`src/view/i18n.ts`), không viết cứng trong `src/`. `core/` không bao giờ đụng text — nó trả mã/sự kiện, view dịch.

Cách chạy: loader của portal chỉ tải **một** file `Language/<mã>.json` cho người chơi (chọn theo lựa chọn đã lưu, rồi trình duyệt, rồi `language` mặc định). `pack` điền key còn thiếu từ `en.json`. Đổi ngôn ngữ trong Settings gọi `GM_LOADER.setLanguage` → **tải lại trang** (lưu tiến trình trước — skill add-save).

## 1. Key và text
- Key phẳng, có nhóm: `menu.play`, `hud.score`, `over.best`. Thêm vào `Language/en.json` trước (en là bản gốc của mọi bản dịch).
- Tham số: `"hud.score": "Score: {score}"` → `t('hud.score', { score })`. Không ghép chuỗi (`t('a') + n`), vì thứ tự từ khác nhau giữa các ngôn ngữ.
- Số nhiều: tham số tên `count` + key theo dạng của `Intl.PluralRules`: `"hud.coins.one": "{count} coin"`, `"hud.coins.other": "{count} coins"` → `t('hud.coins', { count })`. Ngôn ngữ khác thêm dạng nó cần (`ru`: `one`, `few`, `many`, `other`). Thiếu dạng → dùng `.other`.
- Không cần số nhiều: một key, `"{count} coins"` vẫn được.
- Tên riêng của game, footer bản quyền (`platform.info.copyright`) **không** dịch.
- Game làm lại của người khác: text mới (P3 rename-and-text), không dùng text gốc.

## 2. Gom text từ game
- Danh sách text theo màn trong `ui-kit/` (skill ui-extract) → key.
- Tìm chuỗi còn viết cứng: `grep -rn "['\"][A-Z][a-z]" src/view src/main.ts` rồi xem từng chỗ.
- Text trong ảnh của bản gốc: tách ra text vẽ bằng code, hoặc ảnh riêng cho từng ngôn ngữ (ghi `D-n` — tốn dung lượng).

## 3. Thêm ngôn ngữ
1. Mã BCP 47 viết thường (`es`, `pt-br`, `zh-hans`). Thêm vào `languages` trong `game.yaml` (sửa tay; `en` luôn có), đổi `language` nếu muốn mặc định khác.
2. Tạo `Language/<mã>.json` với `"_meta": { "name": "<tên ngôn ngữ bằng chính nó>" }` (vd `"Español"`); ngôn ngữ viết phải sang trái thêm `"dir": "rtl"` (loader đặt `dir="rtl"` cho trang).
3. Dịch từng key của `en.json`. Giữ đúng tên `{param}`; dạng số nhiều theo ngôn ngữ đích. Key chưa dịch để thiếu (validate cảnh báo, pack lấy en) — đừng chép nguyên văn tiếng Anh vào.
4. Font: ngôn ngữ có bộ chữ khác (CJK, Ả Rập, Thái, Devanagari) cần font có glyph — kiểm dung lượng (`gamekit assets`) và ngân sách tải.
5. Bố cục: chuỗi dài hơn tiếng Anh (de, ru) không được tràn nút; RTL: HUD có cần lật không.

## 4. Kiểm
- `gamekit validate`: lỗi khi `t('…')` trong `src/` không có trong `en.json`, khi `{param}` của bản dịch khác `en.json`, khi `languages` có mã mà thiếu file; cảnh báo key chưa dịch.
- `npm test` (template có `tests/view/i18n.test.ts`); thêm test cho chuỗi số nhiều mới nếu dạng phức tạp.
- `npm run dev`, mở Settings, đổi từng ngôn ngữ: chữ đúng, không tràn, footer bản quyền vẫn hiện; với RTL trang lật đúng.
- `gamekit pack --all` rồi `gamekit smoke`, xem ảnh chụp.

## 5. Báo cáo
Ngôn ngữ đã có, số key, key còn chưa dịch theo từng ngôn ngữ, font đã thêm và dung lượng, chỗ còn text trong ảnh.
