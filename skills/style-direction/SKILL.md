---
name: style-direction
description: Dùng ở pha P3 khi làm lại game người khác (third-party) và cần hướng hình ảnh mới — tạo 2–4 phương án style/options/<id>.json (bảng màu, font OFL trong assets/fonts/, hình khối, prompt ảnh và âm thanh) suy từ thể loại và người chơi, không dựa trên game gốc; validate kiểm tương phản.
---

# Đề xuất hướng style (P3, third-party)

Chỉ cho `source.ownership: third-party`. Game `own` giữ hình gốc, không cần style. Kết quả là 2–4 file `style/options/<id>.json` để người dùng so (**style-preview**) và chọn. Agent đề xuất, **không chọn**.

## 1. Đầu vào
Đọc `spec/gameplay-spec.md`, `game.yaml` (`title`, `languages`, `portals`, `release.forbiddenTerms`). Viết vài dòng cho mỗi phương án: thể loại, người chơi (tuổi, máy), cảm giác, thứ gameplay cần đọc nhanh (đạn, vật nguy hiểm, nút chính). Không lấy màu, font, nhân vật hay bố cục từ `reference/`; không viết "giống bản gốc" hay tên game gốc ở bất cứ đâu.

## 2. Cấu trúc file (schema `.gamekit/schemas/style.schema.json`)
| Trường | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `id` | có | `a-z0-9-`, **trùng tên file** (validate báo lỗi nếu khác) |
| `name`, `mood` | `name` có | `mood`: cảm giác, người chơi, từ khoá |
| `palette` | có | `bg surface primary secondary text muted` (`#rrggbb`); tuỳ chọn `onPrimary` (thiếu thì tự chọn đen/trắng), `danger`, `success` |
| `fonts.display`, `fonts.body` | có | `{ family, file?, weight? }` |
| `shape` | không | `radius` 0–64, `stroke` 0–12 px, `shadow`: `none` / `soft` / `hard` |
| `art` | không | `prompt` (phong cách vẽ, ghép vào mọi prompt `gamekit gen image`), `negative`, `references` (ảnh mẫu người dùng đưa, không phải ảnh game gốc) |
| `audio` | không | `prompt` (phong cách nhạc/SFX), `voice` (giọng cho `gamekit gen voice`, vd `alloy`, `nova`) |

## 3. Bảng màu
- Các phương án phải khác nhau thật (tông, độ sáng, độ tương phản), không phải biến thể một màu.
- `validate` cảnh báo khi tương phản thấp: `text`/`bg` và `text`/`surface` ≥ 4.5:1, `muted`/`surface` ≥ 3:1, `onPrimary`/`primary` ≥ 3:1 (chỉ khi có `onPrimary`). Sửa cho hết cảnh báo, không để người dùng chọn giữa các bảng màu khó đọc.
- Vật nguy hiểm, phe ta/phe địch không chỉ phân biệt bằng màu: thêm hình dạng hoặc viền (người mù màu).

## 4. Font
- Chỉ font có giấy phép cho phép nhúng vào game, ưu tiên SIL OFL. Tải file về `assets/fonts/<tên>.woff2` (cũng nhận `woff`, `ttf`, `otf`). **Không** link CDN (Google Fonts…): portal cấm, `release-check` chặn link ngoài.
- Font phải có đủ glyph cho mọi ngôn ngữ trong `languages` (dấu tiếng Việt, Cyrillic, CJK, Ả Rập…). Thiếu thì đổi font hoặc để `body` là font hệ thống (bỏ `file`).
- Gắn nhãn: `npm run gk -- provenance add assets/fonts/<tên>.woff2 --label licensed --source <URL tải> --license OFL-1.1`. Giữ file giấy phép đi kèm font (cũng phải có nhãn nếu đặt trong `assets/`).
- Ở phương án, file font thiếu chỉ là cảnh báo; khi đã chọn (`style/style.json`) thì là lỗi.

## 5. Prompt ảnh và âm thanh
`art.prompt` mô tả phong cách mới bằng lời chung: chất liệu, nét, ánh sáng, mức chi tiết, góc nhìn. `art.negative` nên gồm "text, letters, logos, watermark" và những gì không hợp người chơi. Không có tên, nhân vật, thương hiệu game gốc: `gamekit gen` dừng nếu prompt chứa từ trong `release.forbiddenTerms`.

Ví dụ rút gọn:
```json
{ "$schema": "../../.gamekit/schemas/style.schema.json", "id": "paper-pop", "name": "Paper Pop", "mood": "giấy cắt, vui, 8–14 tuổi",
  "palette": { "bg": "#fdf6e3", "surface": "#ffffff", "primary": "#e4572e", "secondary": "#29335c", "text": "#1f1f1f", "muted": "#6b6b6b" },
  "fonts": { "display": { "family": "Baloo 2", "file": "assets/fonts/baloo2-bold.woff2", "weight": 700 }, "body": { "family": "Nunito", "file": "assets/fonts/nunito.woff2" } },
  "shape": { "radius": 16, "stroke": 3, "shadow": "hard" },
  "art": { "prompt": "flat cut-paper collage, soft paper texture, bold silhouettes", "negative": "text, letters, logos, watermark, photorealism" },
  "audio": { "prompt": "light ukulele and marimba, short bouncy SFX", "voice": "nova" } }
```

## 6. Kết thúc
1. `npm run gk -- style list` (liệt kê phương án) và `npm run gk -- validate` sạch lỗi, không còn cảnh báo tương phản.
2. Báo người dùng: mỗi phương án một dòng (tên, cảm giác, người chơi, font), font nào cần tải/đã gắn nhãn.
3. Tiếp theo: **style-preview** để người dùng xem và chọn. Không chạy `style choose`.
