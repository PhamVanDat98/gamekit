---
name: add-leaderboard
description: Dùng ở P4 khi game có bảng xếp hạng hoặc kỷ lục — gửi điểm bằng platform.submitScore, đọc platform.topScores, hiển thị khi portal hỗ trợ (capabilities.leaderboard) và vẫn có kỷ lục cục bộ khi không hỗ trợ; kiểm bằng dev-mock. Dùng cả khi bản gốc có bảng xếp hạng online hoặc portal yêu cầu gửi điểm.
---

# Bảng xếp hạng (P4)

API trong `Platform` (`src/platform/types.ts`):
- `submitScore(board, score): Promise<void>` — bỏ qua im lặng khi portal không có leaderboard; lỗi SDK bị nuốt và log.
- `topScores(board, count): Promise<LeaderboardEntry[]>` — `[]` khi không hỗ trợ hoặc lỗi. `LeaderboardEntry = { name, score, rank }`.
- `capabilities.leaderboard` — portal có bảng xếp hạng không.

Hiện trạng: `dev-mock` có leaderboard (giữ điểm trong bộ nhớ, tên "You"); adapter `azgames` **chưa có** (`leaderboard: false`). Template đã gửi điểm ở `main.ts` khi thua: `platform.submitScore('main', e.score)`.

## 1. Đầu vào
- Bản gốc có bảng xếp hạng/kỷ lục gì (`ui-kit/`, `notes/recon.md` → SDK server như PlayFab, Firebase): mấy bảng, xếp theo gì (điểm cao, thời gian ngắn), theo level hay toàn game.
- Portal có leaderboard không (tài liệu portal, `skills/platform-sdk`). Không có thì chỉ làm kỷ lục cục bộ.

## 2. Đặt tên bảng và điểm
- `board`: chuỗi ổn định, chữ thường: `main`, `level-3`, `endless`. Ghi danh sách vào `spec/gameplay-spec.md` (mục Điểm).
- Điểm là **số nguyên, càng lớn càng tốt** (đa số SDK chỉ nhận vậy). Xếp theo thời gian ngắn nhất → gửi giá trị đổi được (vd `999999 - centiseconds`) và ghi cách đổi vào `D-n`; hiển thị đổi ngược trong view.
- Điểm do `core/` tính (parity với bản gốc); view/main chỉ lấy điểm cuối từ event của core.

## 3. Gửi điểm
- Gửi **một lần** khi ván/màn kết thúc (event của core, vd `gameOver`, `levelComplete`), không gửi mỗi frame hay mỗi lần điểm đổi.
- `void platform.submitScore(...)` — không chờ, không chặn màn kết thúc.
- Không gửi điểm khi người chơi chưa thật sự chơi (điểm 0 do thoát ngay) nếu portal chấm điểm spam.

## 4. Kỷ lục cục bộ (luôn có)
Người chơi vẫn thấy kỷ lục khi portal không có leaderboard hoặc offline: lưu bằng `platform.save` (skill add-save), khoá vd `best.main`. Hiện "Kỷ lục" trên màn kết thúc qua `t()`.

## 5. Hiển thị bảng
- Chỉ khi `platform.capabilities.leaderboard` là `true`: nút/khối "Bảng xếp hạng" trên màn kết thúc hoặc menu; khi `false` thì ẩn hẳn, không để nút chết.
- Gọi `topScores(board, 10)` khi mở màn đó (không gọi mỗi frame); `[]` → hiện "chưa có điểm" (text qua `t()`).
- Tên người chơi đến từ portal: hiển thị bằng `textContent`, cắt độ dài, không chèn HTML.
- Bảng là view/: chỉ đọc dữ liệu, không đổi state game.

## 6. Thêm vào adapter portal
Portal có leaderboard: trong `src/platform/adapters/<portal>.ts` bật `capabilities.leaderboard`, cài `submitScore`/`topScores` theo tài liệu SDK (skill platform-sdk, không đoán API), map dữ liệu SDK → `LeaderboardEntry`. Map này là logic thuần → unit test với SDK giả.

## 7. Kiểm
- `npm run dev` (dev-mock): kết thúc ván → console `[dev-mock] submitScore main <điểm>`; mở bảng → thấy điểm vừa gửi.
- Adapter offline (`capabilities.leaderboard: false`): nút bảng ẩn, kỷ lục cục bộ vẫn đúng sau khi tải lại trang.
- `npm test`, `npm run lint`, `gamekit validate` (key `t()` mới có trong `Language/en.json`).

## 8. Báo cáo
Các bảng (`board`) và cách tính điểm, portal nào có/không bảng xếp hạng, chỗ hiển thị, phần của bản gốc không làm (vd bảng theo bạn bè) kèm `D-n`.
