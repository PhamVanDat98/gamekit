---
name: add-analytics
description: Dùng ở P4 khi gắn analytics cho game — chọn đúng điểm gọi platform.track với tên event trong src/platform/events.ts (game_load_*, level_start/complete/fail, ad_*, error), dữ liệu kèm theo, cách thêm tên event mới có chủ đích, và kiểm bằng dev-mock. Dùng cả khi portal yêu cầu event nào đó hoặc số liệu giữa các game không so được.
---

# Analytics (P4)

Gameplay chỉ gọi `platform.track(event, data)`. Tên event **chỉ** lấy từ `ANALYTICS_EVENTS` trong `src/platform/events.ts` — danh sách dùng chung mọi game trong mạng để số liệu so được giữa các game. `createPlatform()` bỏ event lạ (log cảnh báo) và nuốt lỗi của SDK, nên analytics không bao giờ làm game crash.

## 1. Event có sẵn và ai gọi
| Event | Ai gọi | Đã có trong template |
| --- | --- | --- |
| `game_load_start` | `bootPlatform()` (kèm `portal`, `build`) | có |
| `game_load_end` | `platform.loadingEnd()` tự gửi | có |
| `level_start` | game, khi vào màn chơi | có (`main.ts`, `{ round }`) |
| `level_complete` | game, khi thắng/qua màn | **game phải thêm** |
| `level_fail` | game, khi thua | có (`{ round, score }`) |
| `ad_requested`, `ad_shown`, `ad_rewarded`, `ad_failed` | `createPlatform()` khi gọi `interstitial`/`rewarded` | có — game không tự gửi |
| `error` | `bootPlatform()` khi SDK không tải được; game gửi khi bắt lỗi đáng kể | một phần |

## 2. Gắn vào game
- Gọi từ `src/main.ts`/`view/` dựa trên **event của core** (vd `stepWorld` trả `{ type: 'gameOver' }`), không gọi trong `core/` (core không biết platform).
- `data` là `Record<string, string | number | boolean>`, phẳng, ít khoá. Dùng chung tên khoá giữa các game: `level` (số màn), `round` (lượt trong phiên), `score`, `duration` (giây), `reason` (lý do thua).
- Không gửi dữ liệu cá nhân, không gửi chuỗi tự do dài (event `error`: cắt ≤ 150 ký tự như `bootPlatform`).
- Không gửi mỗi frame. Mỗi event gắn với một việc người chơi làm hoặc một mốc.
- Game gốc có analytics riêng (`notes/recon.md` → SDK analytics): đối chiếu event của bản gốc với danh sách trên; không mang SDK analytics của bản gốc sang web.

## 3. Cần event mới
Danh sách là chung cho cả mạng game, nên thêm có chủ đích:
1. Kiểm event có sẵn + `data` có diễn đạt được không (thường là được: `level_complete` với `{ level, stars }`).
2. Không được: ghi `D-n` trong `DECISIONS.md` (event gì, khi nào gửi, data gì, ai dùng số liệu), **hỏi người dùng duyệt**.
3. Thêm tên vào `ANALYTICS_EVENTS`; nhắc người dùng cập nhật cùng tên ở template GameKit để game khác dùng chung.
4. Adapter portal tự chuyển tiếp mọi event qua `track` (vd `azgames`: `GMGameSDK.trackEventParams`); portal cần tên khác thì map trong adapter, không đổi tên trong game.

## 4. Kiểm
- Unit test (template đã có trong `tests/platform/create-platform.test.ts`): event lạ bị bỏ. Thêm test cho logic quyết định gửi event nếu không tầm thường (vd chỉ gửi `level_complete` một lần mỗi màn).
- `npm run dev`: dev-mock in `[dev-mock] track <event> {…}` ra console; chơi một ván, đối chiếu thứ tự: `game_load_start` → `game_load_end` → `level_start` → `level_fail`/`level_complete`; thử `?ad=fail` để thấy `ad_failed`.
- `npm test`, `npm run lint`.

## 5. Báo cáo
Bảng event → chỗ gọi → data; event mới (nếu có) kèm `D-n`; event portal yêu cầu mà game chưa gửi.
