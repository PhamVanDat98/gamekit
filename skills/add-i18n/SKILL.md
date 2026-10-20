---
name: add-i18n
description: Dùng ở pha P4 khi thêm ngôn ngữ cho game — khai báo languages trong game.yaml, tạo Language/<mã>.json (_meta, dạng số nhiều theo CLDR, tham số khớp en), ảnh có chữ và lời thoại cho từng ngôn ngữ, kiểm tra chuỗi dài, RTL, smoke mọi ngôn ngữ và store/listing.yaml mỗi ngôn ngữ một bản.
---

# Thêm ngôn ngữ (P4)

`en` là bản gốc của mọi bản dịch. Người chơi chỉ tải một ngôn ngữ: loader chọn mã (đã lưu → `?lang=` → ngôn ngữ trình duyệt → `language` → `en`), tải `Language/<mã>.json`; ảnh có chữ và lời thoại là file riêng theo ngôn ngữ. Key thiếu được `pack` lấy từ en — người chơi thấy tiếng Anh.

**Game của ai.** `own`: game gốc đã có bản dịch thì dùng lại (của người dùng), ảnh có chữ bản địa xuất từ game gốc gắn nhãn `own`. `third-party`: dịch từ `Language/en.json` đã viết lại (skill rename-and-text), không dùng bản dịch của game gốc; tên riêng dịch hay giữ theo `notes/naming.md`, không đưa tên gốc vào.

## 1. Khai báo
- Hỏi người dùng danh sách ngôn ngữ và ngôn ngữ mặc định. Mã chữ thường: `vi`, `pt-br`, `zh-cn` (schema `^[a-z]{2,3}(-[a-z0-9]{2,8})*$`); trình duyệt báo `pt-BR` vẫn khớp `pt-br`, rồi `pt`.
- `game.yaml`: thêm mã vào `languages` (phải có `en`); `language` phải nằm trong `languages`.
- `Language/<mã>.json`: `"_meta": { "name": "<tên ngôn ngữ bằng chính ngôn ngữ đó>" }` (hiện trong ô chọn ở Settings); ngôn ngữ viết phải sang trái (ar, fa, he, ur) thêm `"dir": "rtl"`.

## 2. Dịch
- Đủ mọi key của en. Giữ nguyên `{tham số}` — `validate` báo lỗi nếu khác en hoặc có key en không có; thiếu key chỉ là cảnh báo.
- Số nhiều: `translate()` (`src/view/i18n.ts`) chọn `key.<dạng>` theo `Intl.PluralRules(mã)`, thiếu thì `key.other`, rồi `key`. Chuỗi có số đếm phải ở dạng số nhiều ngay trong en (`coins.one`, `coins.other`), gọi `t('coins', { count })` với `count` là số.
- Dạng cần cho mỗi ngôn ngữ: `node -e "console.log(new Intl.PluralRules('ru').resolvedOptions().pluralCategories)"`. Ví dụ: en/de `one, other`; fr/es/pt `one, many, other`; ru/pl `one, few, many, other`; ar `zero, one, two, few, many, other`; vi/ja/zh/ko chỉ `other`.
- Luôn có `key.other`: validate không cảnh báo khi một ngôn ngữ có `.one` mà thiếu `.other`, lúc đó game hiện bản `.other` tiếng Anh.
- Dịch theo ngữ cảnh (nút ngắn, thoại, hướng dẫn), không dịch máy rồi để nguyên. Có người bản ngữ thì nhờ duyệt; không có thì báo rõ trong báo cáo.

## 3. Ảnh có chữ và lời thoại
- Ảnh có chữ (`text: true`) cùng đường dẫn trong `assets/i18n/<mã>/`; thiếu thì game dùng bản en và `validate` cảnh báo. Làm: `gamekit gen image --lang <mã>` (chữ lấy đúng từ `Language/<mã>.json` theo `textKey` — dịch xong mới sinh) hoặc `gamekit gen import <id> <file> --lang <mã>`. Xem kỹ chính tả từng bản (skill replace-graphics).
- Lời thoại (`voice: true`): `gamekit gen voice --lang <mã>` hoặc `gen import … --lang <mã>` (skill replace-audio).
- Font: style phải có glyph cho chữ mới (dấu tiếng Việt, Cyrillic, Ả Rập, CJK…). Font CJK rất nặng: dùng font hệ thống làm dự phòng, ghi lựa chọn vào `DECISIONS.md`.

## 4. Kiểm tra
- `gamekit validate`; `npm run lint` (chặn chữ viết cứng trong `src/view/`, `src/main.ts` — mọi chữ qua `t()`).
- `npm run dev` rồi mở `?lang=<mã>`: chữ tràn nút/HUD, xuống dòng, ô chọn ngôn ngữ trong Settings. RTL: trang có `dir="rtl"`, kiểm tra HUD, Settings, chữ vẽ trên canvas.
- Có style (`third-party`): `gamekit style preview`, bật "Chuỗi dài nhất mọi ngôn ngữ" để xem 5 chuỗi dài nhất trên UI kit. Game `own` không có style thì lệnh này dừng — xem bằng `npm run dev`.
- `gamekit pack --portal dev-mock` → `gamekit smoke`: mở gói với từng mã trong `languages`, báo ngôn ngữ không vào được game, chạy nhầm mã, lỗi console; ảnh `lang-<mã>.png` trong `.gamekit/local/smoke/<v>-dev-mock/` — mở xem, smoke không chấm bố cục RTL.

## 5. Trang store
`store/listing.yaml`: `title`, `short`, `description`, `controls` mỗi ngôn ngữ một bản (`en` bắt buộc). `gamekit store` cảnh báo ngôn ngữ còn thiếu (portal sẽ hiện bản en), lỗi khi còn `TODO` hoặc vượt giới hạn độ dài của portal.

## 6. Hoàn tất
`gamekit validate`, `npm test`, `npm run typecheck`, `npm run lint`, `gamekit gate`. Báo người dùng: ngôn ngữ đã thêm, key còn thiếu, ảnh/lời thoại còn dùng bản en, chuỗi bị tràn, bản dịch nào chưa có người bản ngữ duyệt. Tiếp theo: skill P4 còn lại (platform-sdk), rồi P5 (package-web-build, release-check).
