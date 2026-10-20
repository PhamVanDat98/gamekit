---
name: add-analytics
description: Dùng ở pha P4 khi gắn analytics cho game — chọn event trong src/platform/events.ts, gọi platform.track ở đúng điểm chuyển trạng thái (vào màn, thắng, thua), giữ tham số nhỏ và ẩn danh, không gửi mỗi frame, kiểm bằng dev-mock và test. Cũng dùng khi cần thêm một tên event mới.
---

# Analytics (P4)

Game chỉ gọi `platform.track(event, data?)`. `createPlatform()` bỏ mọi tên không có trong `ANALYTICS_EVENTS` (`src/platform/events.ts`) và ghi cảnh báo; TypeScript cũng báo lỗi vì `event` có kiểu `AnalyticsEvent`. Adapter chuyển sang SDK của portal (`azgames`: `GMGameSDK.trackEventParams`; `dev-mock`: in ra console).

## 1. Event nào đã tự gửi, event nào game phải gửi
| Event | Ai gửi | Khi nào |
| --- | --- | --- |
| `game_load_start` | `bootPlatform()` | platform sẵn sàng, `{ portal, build }` |
| `game_load_end` | `platform.loadingEnd()` | một lần, khi tải xong |
| `ad_requested`, `ad_shown`, `ad_rewarded`, `ad_failed` | `createPlatform()` | quanh mỗi lần gọi `interstitial`/`rewarded` |
| `error` | `web-guard.ts`, `bootPlatform()` | lỗi JS, promise bị từ chối, SDK không khởi tạo được |
| `level_start` | **game** | bắt đầu một màn/ván |
| `level_complete` | **game** | thắng màn |
| `level_fail` | **game** | thua, hết giờ, ván vô tận kết thúc |

Không gọi lại các event tự gửi. Game chỉ cần ba event `level_*`.

## 2. Đặt ở đâu trong vòng lặp
Làm như `src/main.ts` của template:
- `level_start` ngay khi ván bắt đầu, cạnh `platform.gameplayStart()`: `platform.track('level_start', { round })`.
- `level_fail` / `level_complete` khi `stepWorld` trả event kết thúc (`gameOver`…), cạnh `platform.gameplayStop()`, sau khi đã đổi `state` để chỉ gửi một lần.
- `core/` không biết platform: core trả event (`{ type: 'gameOver', score }`), `main.ts` hoặc `view/` đổi event đó thành `track`.
- **Không gửi trong mỗi frame hay mỗi bước fixed step**, không gửi theo input. Chỉ ở điểm chuyển trạng thái; tối đa vài event mỗi ván.

## 3. Tham số
- `EventData = Record<string, string | number | boolean>`: phẳng, vài trường. Ví dụ `{ level: 3 }`, `{ round, score }`, `{ level, seconds: Math.round(t) }`.
- Ẩn danh: không id người chơi, không tên, không email, không chữ người chơi gõ, không URL đầy đủ. Chuỗi dài thì cắt (như `web-guard.ts` cắt `message` còn 200 ký tự).
- Giá trị là key/số, không phải câu đã dịch (không truyền kết quả của `t()`).
- Dùng cùng tên trường cho cùng ý nghĩa ở mọi game (`level`, `round`, `score`) để số liệu so được giữa các game.

## 4. Cần một event mới
`ANALYTICS_EVENTS` là danh sách chung cho mọi game trong mạng, thêm tên là quyết định có chủ ý:
1. Kiểm tra event có sẵn đã đủ chưa (thường thêm trường vào `data` là đủ).
2. Hỏi người dùng; ghi lý do vào `DECISIONS.md` (`D-n`). Nếu portal giới hạn tên event, chỉ dùng tên có trong tài liệu portal hoặc người dùng cung cấp — không đoán.
3. Thêm tên vào `ANALYTICS_EVENTS` trong `src/platform/events.ts` của game, `snake_case`. Báo người dùng nên thêm cùng tên vào template GameKit để game khác dùng chung.

## 5. Kiểm tra với dev-mock
- `npm run dev`, chơi một ván: console có `[dev-mock] track level_start {"round":1}`, rồi `track level_fail {…}` đúng một lần khi thua. Không có dòng `unknown analytics event`.
- Unit test (`tests/platform/`): `createDevMock({ adMs: 0, log: () => {} })` + `createPlatform(...)` như `create-platform.test.ts`, kiểm `mock.calls.filter((c) => c.startsWith('track'))`. Nếu logic map event của game nằm trong một hàm thuần, test hàm đó.
- `own` và `third-party` giống nhau ở đây; với `third-party`, giá trị chuỗi trong `data` không được chứa tên game gốc.

## 6. Kết thúc
`npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- validate`, rồi `npm run gk -- gate` (P4: mục "Event analytics chỉ dùng tên trong `src/platform/events.ts`" là mục tay — báo người dùng kết quả kiểm tra để tick). Báo người dùng: event game gửi, ở đâu, tham số gì, event mới (nếu có) kèm `D-n`. Tiếp theo: **add-leaderboard**, **add-save**.
