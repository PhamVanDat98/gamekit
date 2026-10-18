---
name: add-save
description: Dùng ở P4 khi game cần lưu tiến trình, kỷ lục, cài đặt hoặc tiền — thiết kế dữ liệu lưu có version, serialize từ state của core/, đọc/ghi qua platform.save (cloud save của portal nếu có, localStorage có namespace nếu không), xử lý save hỏng và nâng cấp version; test bằng TDD. Dùng cả khi bản gốc có save/PlayerPrefs, khi đổi ngôn ngữ làm mất tiến trình, hoặc người chơi báo mất dữ liệu.
---

# Lưu tiến trình (P4)

API: `platform.save.get(key): Promise<string | null>` và `platform.save.set(key, value): Promise<void>` (`src/platform/types.ts`). `createPlatform()` đã lo:
- khoá có namespace `<tên game>:<key>` để các game cùng domain không đè nhau;
- luôn ghi localStorage; portal có `capabilities.cloudSave` + `saveGet`/`saveSet` thì đọc từ cloud trước, ghi cả cloud;
- lỗi (chế độ riêng tư, hết quota, SDK lỗi) không làm game crash: `get` trả `null`, `set` bỏ qua.

Hiện trạng: template chưa lưu gì; `dev-mock` và `azgames` không có cloud save. Đổi ngôn ngữ trong Settings **tải lại trang** (`GM_LOADER.setLanguage`), nên mọi thứ chưa lưu sẽ mất.

## 1. Đầu vào
- Bản gốc lưu gì (Unity `PlayerPrefs`, file save, server): đọc ở P1 (`notes/`), liệt kê từng trường, kiểu, giá trị mặc định.
- Cái gì phải sống qua tải lại trang: level đã mở, kỷ lục, tiền, vật phẩm, cài đặt âm thanh.
- Không lưu state giữa ván (vị trí từng viên đạn) trừ khi bản gốc có "chơi tiếp".

## 2. Thiết kế dữ liệu
Một khoá chính (vd `progress`) chứa JSON có version:
```ts
// src/core/save.ts — thuần, không đụng platform hay localStorage
export interface SaveV1 { v: 1; unlocked: number; best: Record<string, number>; coins: number }
export const DEFAULT_SAVE: SaveV1 = { v: 1, unlocked: 1, best: {}, coins: 0 };
export function parseSave(raw: string | null): SaveV1 { /* JSON hỏng/thiếu trường → mặc định; v cũ → nâng cấp */ }
export function serializeSave(s: SaveV1): string { return JSON.stringify(s); }
```
- Logic dữ liệu (parse, kiểm, nâng cấp version, gộp) nằm trong `src/core/` → TDD.
- Giá trị mặc định là số gameplay → lấy từ `params/` (có `source`), không gõ số trong code.
- Cài đặt thuần UI (âm thanh) có thể là khoá riêng `settings`.

## 3. Đọc, ghi
- Đọc **một lần** khi khởi động, trước `platform.loadingEnd()`, trong `src/main.ts`: `parseSave(await platform.save.get('progress'))`.
- Ghi ở mốc: hết màn, mua xong, đổi cài đặt, trước khi đổi ngôn ngữ — không ghi mỗi frame. `void platform.save.set(...)`, không chặn gameplay.
- Ẩn tab (`visibilitychange`) có thể ghi thêm một lần để không mất dữ liệu khi trình duyệt đóng tab.

## 4. Không bao giờ mất dữ liệu
- JSON hỏng, trường sai kiểu, số âm/NaN → dùng mặc định cho trường đó, không ném lỗi, không xoá cả save.
- Đổi cấu trúc → tăng `v`, viết hàm nâng cấp v1 → v2; giữ test cho save v1 cũ.
- Cloud và local khác nhau (portal có cloud save): chọn rõ một luật (vd lấy bản có tiến trình cao hơn), ghi `D-n`.

## 5. Kiểm
- Unit test `tests/core/save.test.ts`: mặc định khi `null`; JSON hỏng; trường thiếu; số không hợp lệ; nâng cấp version; vòng serialize → parse giữ nguyên.
- Template đã test fallback localStorage có namespace (`tests/platform/create-platform.test.ts`, mục save).
- `npm run dev`: chơi, tải lại trang, tiến trình còn; đổi ngôn ngữ trong Settings, tiến trình còn; tab ẩn danh vẫn chạy (không lưu được nhưng không lỗi).
- `npm test`, `npm run lint`, `npm run typecheck`.

## 6. Báo cáo
Trường lưu và nguồn (bản gốc), khoá dùng, khi nào ghi, luật cloud/local, thứ của bản gốc không lưu trên web (save server) kèm `D-n`.
