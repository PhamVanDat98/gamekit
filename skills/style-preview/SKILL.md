---
name: style-preview
description: Dùng ở P3 sau style-direction — gọi Codex (gamekit art gen) vẽ concept raster cho từng hướng style, tự kiểm tra bằng script và bằng mắt từng ảnh, cho vẽ lại ảnh hỏng, dựng bảng so art/concepts/index.html để người dùng chọn, rồi chốt style bằng gamekit art lock.
---

# Vẽ concept, kiểm chứng, cho người dùng chọn (P3)

Bên vẽ ảnh (mặc định Codex) sinh ảnh. Agent chính **không tin kết quả cho tới khi đã kiểm**: script kiểm phần đo được, agent xem bằng mắt phần còn lại. Người dùng là người chốt.

## 1. Chuẩn bị bên vẽ ảnh
- Mặc định `art gen` chạy `codex exec --full-auto --skip-git-repo-check "<yêu cầu>"` trong thư mục game. Cần Codex CLI đã cài và đăng nhập (`npm i -g @openai/codex`, `codex login`).
- Codex phải tạo được ảnh raster: bằng công cụ tạo ảnh có sẵn (nếu bản Codex có), hoặc bằng skill/script gọi API ảnh. Nếu cách đó cần mạng, sandbox `--full-auto` mặc định chặn mạng: thêm `-c sandbox_workspace_write.network_access=true` vào lệnh.
- Đổi lệnh (thêm cờ, chọn model, dùng công cụ khác): `art.command` trong `game.yaml`, `{prompt}` là chỗ đặt yêu cầu. Ví dụ: `[codex, exec, --full-auto, -c, sandbox_workspace_write.network_access=true, '{prompt}']`.
- Chạy thử một style trước (`--style <id>`) để chắc lệnh hoạt động, rồi mới vẽ hết.

## 2. Vẽ
`npm run gk -- art gen [--style a,b] [--jobs 3] [--timeout 30]`
- Viết `art/concepts/<style>/BRIEF.md` (style lock, bảng màu, hướng UI, bảng ảnh, luật). Mỗi style một việc, chạy song song. Log ở `.gamekit/local/art/<việc>.log`.
- Claude Code: việc vẽ mất vài phút. Chạy bằng Bash `run_in_background`, chờ thông báo xong, không ngồi đợi trong lệnh có timeout 2 phút.
- Xong, lệnh tự chạy kiểm tra và dựng bảng so.

## 3. Kiểm tra tự động (`art check`)
Script bắt được: thiếu ảnh, không phải PNG/WebP, sai tỉ lệ hay quá nhỏ, cần nền trong suốt mà không có alpha, mép không trong suốt (nền ca-rô giả, nền trắng), ảnh gần như một màu (thường là hình vẽ bằng code thay vì model ảnh), thiếu file JSON ghi prompt và model. Lỗi nào cũng phải sửa trước khi chốt: `art lock` từ chối style có concept chưa đạt.

## 4. Xem bằng mắt từng ảnh
Mở từng PNG (Claude Code: Read tool hiện được ảnh). Với mỗi ảnh, kiểm:
1. Đúng nội dung `brief` của concept.
2. Khớp style lock và bảng màu. Các ảnh của cùng một style trông như cùng một hoạ sĩ.
3. Đọc rõ khi thu nhỏ về cỡ hiển thị thật: hình khối, tương phản nhân vật/nền, vật nguy hiểm khác hẳn vật nhặt được.
4. Không có lỗi model: chữ lạ, watermark, chữ ký, tay chân dị dạng, vật thể dính nhau, nhân vật bị cắt mép.
5. Mockup UI: HUD không che vùng chơi, nút đủ to cho ngón tay, bố cục dùng được cả màn ngang và dọc.
6. `third-party`: không giống game gốc. Được so với ảnh trong `reference/` để chắc chắn, nhưng **không** đưa ảnh đó cho Codex.

Ghi `art/concepts/<style>/REVIEW.md`: mỗi concept một dòng `✔/✘ — lý do`, thêm điểm mạnh và rủi ro của style khi làm hàng chục asset. Bảng so hiện nội dung này cho người dùng.

## 5. Vẽ lại ảnh hỏng
`npm run gk -- art gen --style <id> --only <concept> --note "<góp ý cụ thể>"`
- Góp ý nói rõ cần đổi gì ("nền trong suốt thật, không ô ca-rô", "nhân vật nhìn nghiêng, viền dày hơn"), không chỉ "vẽ lại".
- Mỗi ảnh vẽ lại tối đa 2 lần. Vẫn hỏng: ghi vào REVIEW.md và báo người dùng, có thể là style này khó với model.
- Nếu ảnh luôn lệch style, sửa `lock` trong `art/styles.yaml` (cụ thể hơn, thêm `avoid`) rồi vẽ lại cả style.

## 6. Người dùng chọn
- `npm run gk -- art board` → `art/concepts/index.html`: mỗi cột một style, mỗi hàng cùng một nội dung, kèm bảng màu, hướng UI, kết quả kiểm tra và nhận xét. Đưa đường dẫn cho người dùng mở.
- Tóm tắt trong chat mỗi style 2–3 dòng (điểm mạnh, rủi ro), rồi hỏi người dùng chọn (Claude Code: AskUserQuestion, mỗi style một lựa chọn).
- Người dùng muốn trộn ("style A, bảng màu của B", "UI của C"): thêm một style mới vào `art/styles.yaml`, vẽ concept cho nó, cho xem lại.
- **Chỉ khi người dùng đã chọn**: `npm run gk -- art lock <style>`. Lệnh ghi `art.style` vào `game.yaml` và thêm mục `D-n` vào `DECISIONS.md`. Mục cổng "Đã chọn style từ bảng concept (bạn)" do người dùng tick, agent không tự tick.
- Commit `art/styles.yaml` và `art/concepts/` (ảnh, prompt, REVIEW, bảng so) làm hồ sơ của quyết định.

Tiếp theo: lập `asset-manifest.json` (asset-spec), rồi skill **replace-graphics**. Bố cục UI mới làm theo `ui` của style đã chốt.
