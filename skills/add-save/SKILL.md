---
name: add-save
description: Dùng ở pha P4 khi game cần nhớ tiến trình hoặc cài đặt giữa các lần chơi — lưu qua platform.save (localStorage có namespace, cloud save nếu portal có), save có version và hàm migrate, lưu ở điểm chuyển trạng thái chứ không mỗi frame, có đường reset; core/ vẫn thuần.
---

# Lưu tiến trình (P4)

Chỉ lưu qua `platform.save.get(key)` / `platform.save.set(key, value)` (chuỗi, Promise). Lint chặn `localStorage` trong `core/`; ở chỗ khác cũng không gọi thẳng. `createPlatform()` đã lo:
- key thật = `<name trong game.yaml>:<key>` (namespace, game cùng domain không đè nhau);
- `capabilities.cloudSave` + adapter có `saveGet`/`saveSet` → đọc cloud trước, lỗi thì đọc local; ghi local trước rồi cloud. Hiện chưa adapter nào có cloud save;
- localStorage lỗi (chế độ riêng tư, iframe chặn storage, đầy) → `get` trả `null`, `set` bỏ qua, game vẫn chạy.

Không có hàm xoá: reset = ghi lại bản mặc định.

## 1. Lưu gì
| Lưu | Không lưu |
| --- | --- |
| Tiến trình: màn đã mở, sao, điểm cao, tiền, vật phẩm | State giữa ván mỗi frame, vị trí từng vật |
| Cài đặt của game: âm thanh (template hiện truyền `sound: true` vào `mountSettings` — đọc từ save, ghi lại trong `onSound`) | **Ngôn ngữ**: loader đã lưu (`GM_LOADER.setLanguage`, key `storageKey` của vỏ portal) |
| Cờ tutorial đã xem | Dữ liệu cá nhân, chữ đã dịch |

- `own`: lưu đúng những gì game gốc lưu (PlayerPrefs, file save…) — xem `notes/`; giá trị khởi đầu (tiền ban đầu, màn mở sẵn) lấy từ `params/`. `third-party`: bám hành vi lưu của game gốc, đặt key mới, không dùng tên game gốc trong key.
- Giữ nhỏ (vài KB). Một key chính (`progress`) thường đủ; cài đặt có thể là key riêng (`settings`).

## 2. Save có version
```ts
interface SaveV2 { v: 2; unlocked: number; best: number; sound: boolean }
const DEFAULT: SaveV2 = { v: 2, unlocked: 1, best: 0, sound: true };
function migrate(raw: unknown): SaveV2  // v1 → v2 …; hỏng / version lạ → DEFAULT
```
- Mọi bản lưu có trường `v`. Đổi cấu trúc → tăng `v`, thêm một bước migrate từ bản cũ; không bao giờ đọc thẳng dữ liệu cũ bằng kiểu mới.
- `JSON.parse` lỗi, thiếu trường, sai kiểu, `v` lớn hơn bản hiện tại → trả `DEFAULT` (hoặc giữ phần đọc được), không ném lỗi, không crash.
- Dữ liệu giữ key/số (`unlocked: 3`, `skin: "blue"`), không giữ câu chữ.

## 3. Đặt code ở đâu
- `core/` không biết save: nhận state khởi đầu qua tham số (vd màn bắt đầu, vật phẩm đã mở), trả event khi tiến trình đổi.
- Một lớp mỏng ngoài core (vd `src/save/` hoặc `src/view/save.ts`): `snapshot(state) → SaveV2`, `migrate()`, `load(platform)`, `store(platform, data)`. `snapshot` và `migrate` là hàm thuần → có unit test trong `tests/`.
- Nếu `spec/obligations.yaml` có nghĩa vụ về save (game gốc giữ tiến trình), thêm case `invalid` (save hỏng) — skill **parity-check**.

## 4. Khi nào ghi
- Ở điểm chuyển trạng thái: hết màn, mở khoá, điểm cao mới, đổi cài đặt, mua vật phẩm. **Không bao giờ trong vòng lặp frame**; nếu một thao tác ghi liên tục (kéo thanh âm lượng) thì gom lại và ghi khi thả.
- Đọc một lần lúc khởi động, sau `bootPlatform()` và trước khi tạo world / `mountSettings`.

## 5. Reset
Thêm "Xoá tiến trình" (vd trong popup Settings, chữ qua `t()`, có bước xác nhận) → `platform.save.set('progress', JSON.stringify(DEFAULT))` rồi đưa game về menu. Popup Settings vẫn giữ footer `gk-settings-footer`.

## 6. Kiểm tra
- Unit test: `migrate` cho từng version cũ, JSON hỏng, `null`, version tương lai; vòng `snapshot` → `JSON.stringify` → `migrate` giữ nguyên dữ liệu. Với platform: `createPlatform(createDevMock(...), { bus, saveNamespace: 'test', storage: memory() })` như `create-platform.test.ts`.
- `npm run dev`: chơi, tải lại trang → tiến trình và âm thanh còn; DevTools → Application → Local Storage thấy key `<name>:progress`; sửa tay thành chuỗi rác → game vẫn vào với bản mặc định; thử cửa sổ ẩn danh.

## 7. Kết thúc
`npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- validate`, `npm run gk -- gate`. Báo người dùng: lưu những gì, version hiện tại, cách reset, portal nào có cloud save (hiện: chưa có). Tiếp theo: **add-i18n** (nếu còn ngôn ngữ cần thêm), rồi P5 (**package-web-build**).
