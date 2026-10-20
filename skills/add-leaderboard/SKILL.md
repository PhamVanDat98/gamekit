---
name: add-leaderboard
description: Dùng ở pha P4 khi game có điểm số cần đưa lên bảng xếp hạng của portal — gọi platform.submitScore cuối ván, đọc platform.topScores, ẩn UI khi portal không hỗ trợ (capabilities.leaderboard), không dựng server riêng; kiểm bằng dev-mock.
---

# Bảng xếp hạng (P4)

Leaderboard chỉ đi qua portal: `platform.submitScore(board, score)` và `platform.topScores(board, count)` (`src/platform/types.ts`). **Không dựng server điểm riêng**, không `fetch` tới API của mình — `release-check` chặn link ngoài, và portal thường cấm.

## 1. Portal nào hỗ trợ
`createPlatform()` đã lo phần khác nhau giữa các portal:
- `capabilities.leaderboard === false` hoặc adapter không có `submitScore` → `submitScore` không làm gì, `topScores` trả `[]`.
- SDK ném lỗi → ghi log, không ném ra game.
- Adapter offline (SDK không tải được, `bootPlatform()`) có `leaderboard: false`.

Hiện tại: `dev-mock` có leaderboard giả trong bộ nhớ (mất khi tải lại trang); `azgames` báo `leaderboard: false` (adapter chưa làm). Muốn có leaderboard thật trên một portal là việc của adapter (skill **platform-sdk**): chỉ viết từ tài liệu chính thức hoặc tài liệu người dùng đưa, chỉ đặt `leaderboard: true` khi đã nối thật. Không bịa hàm SDK.

## 2. Khi nào gửi điểm
- **Một lần, cuối ván**: khi core trả event kết thúc (`gameOver`, thắng màn cuối…). Như `src/main.ts`: `void platform.submitScore('main', e.score)` cạnh `gameplayStop()` và `track('level_fail', …)`.
- Không gửi trong mỗi frame, không gửi mỗi lần điểm đổi, không gửi khi người chơi thoát giữa ván (trừ khi game gốc tính điểm như vậy — ghi trong `spec/`).
- `void` hoặc `await` không chặn màn kết thúc: điểm hiện ngay, gửi chạy nền.

## 3. Board và điểm
- `board`: id cố định, ngắn (`main`, `level-3`, `daily` nếu portal có). Đây là key, không phải chữ hiển thị. Tên board hiện cho người chơi đi qua `t()`.
- `score`: số nguyên, cùng con số người chơi thấy (template hiện `Math.floor(world.score)` — gửi cùng giá trị đã làm tròn). Cách tính điểm lấy từ game gốc (`params/`, `spec/`), không tự đặt.
- Chiều xếp hạng (cao hơn là tốt, hay thời gian thấp hơn là tốt) do portal cấu hình; ghi vào `DECISIONS.md` nếu khác mặc định của portal.

## 4. Hiện bảng
- Chỉ hiện nút/màn leaderboard khi `platform.capabilities.leaderboard` là `true`; không thì ẩn hẳn, không hiện bảng rỗng.
- `topScores(board, 10)` trả `{ name, score, rank }[]`. Tên người chơi là dữ liệu từ portal: hiện nguyên văn, không dịch; chữ khác (tiêu đề, "Hạng", "Điểm") qua `t()` + `Language/*.json`.
- Danh sách rỗng hoặc lỗi mạng → hiện thông báo qua `t()`, game không treo.
- Màn leaderboard mở lúc đang chơi thì `bus.pause('menu')` như popup Settings.

## 5. Kiểm tra
- `npm run dev`, chơi hết ván: console có `[dev-mock] submitScore main <điểm>` đúng một lần mỗi ván.
- Unit test với `createDevMock({ adMs: 0, log: () => {} })`: sau một ván, `mock.calls` có `submitScore …`; với adapter `leaderboard: false` (vd `offlineAdapter`), `topScores` trả `[]` và không có lời gọi nào tới SDK.
- `own` và `third-party` giống nhau; với `third-party`, tên board và chữ trên bảng không dùng tên game gốc.

## 6. Kết thúc
`npm test`, `npm run typecheck`, `npm run lint`, `npm run gk -- pack --all`, `npm run gk -- gate`. Báo người dùng: board nào, gửi lúc nào, portal nào thật sự có leaderboard và portal nào chỉ bỏ qua. Tiếp theo: **add-save**, hoặc **package-web-build** nếu P4 đã đủ.
