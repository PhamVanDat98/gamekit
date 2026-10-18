# {{TITLE}} — hướng dẫn cho agent (Claude Code, Codex)

Game này được port bằng **GameKit**. Trạng thái nằm trong `game.yaml`; luôn chạy `npm run gk -- status` trước khi làm việc để biết đang ở pha nào và skill nào dùng tiếp.

## Game của ai
`source.ownership` trong `game.yaml`: **`own`** (mặc định) = game của người dùng, giữ nguyên hình, âm thanh, tên, text; **`third-party`** = làm lại game người khác, bắt buộc reskin. Không hỏi lại; luật dưới đây ghi rõ chỗ nào khác nhau.

## Luật cứng
1. **Dữ liệu và logic gameplay phải bám sát game gốc.** Mọi số gameplay nằm trong `params/*.json`, mỗi giá trị có `source` (file + hàm/offset, hoặc đo từ video). Không tự đặt số. Sai khác chỉ khi web bắt buộc, phải có mục `D-n` trong `DECISIONS.md` và được người dùng duyệt (`deviation.approved: true`).
2. **Code gốc.** `own`: được dịch logic từ code gốc sang TypeScript, viết lại cho hợp `core/`/`view/`. `third-party`: bám hành vi, không chép code; viết lại từ ghi chú RE trong `notes/`. Cả hai: không commit code gốc hay code decompile vào repo này.
3. **Asset.** `own`: asset gốc xuất sang định dạng web, đưa vào `assets/`/`public/` với nhãn `own`. `third-party`: asset gốc chỉ là tư liệu trong `reference/` (gitignored). Mọi file trong `assets/` và `public/` phải có nhãn trong `provenance.json` (`gamekit provenance add … --label …`).
4. **Không tự đánh dấu việc "(bạn)"** trong `gates/*.md` — đó là quyết định của người dùng.
5. **Popup Settings phải giữ footer bản quyền** (`platform.info.copyright`) — portal yêu cầu, không bỏ khi đổi giao diện.
6. **Mọi text hiển thị đi qua `t()`** và `Language/en.json` (+ các ngôn ngữ khác), không viết cứng trong `src/`.

## Cấu trúc
- `src/core/` logic thuần, deterministic: không DOM, không thư viện render, thời gian từ fixed step, ngẫu nhiên từ `Rng` có seed. **Viết test trước** (TDD).
- `src/view/` render và input thiết bị; chỉ đọc state. Kiểm tra bằng screenshot/checklist, không unit test.
- `src/platform/` interface chung cho mọi portal. Gameplay chỉ gọi `Platform`; adapter nằm trong `src/platform/adapters/`. Event analytics chỉ dùng tên trong `src/platform/events.ts`.
- `src/contracts/` type dùng chung giữa các module — chỉ agent chính sửa.
- `Language/` mỗi ngôn ngữ một file (`en.json` bắt buộc) · `public/Icons/` (`web.png`, `loading.webp`) · `builds/` đầu ra của pack (gitignored, không commit).
- `art/` (khi reskin): `styles.yaml` các hướng style, `concepts/` ảnh concept + bảng so `index.html`, `prompts/` prompt từng asset, `raw/` ảnh chưa đổi cỡ (gitignored).
- `params/` số liệu có nguồn và `confidence` · `spec/` gameplay spec, `obligations.yaml`, `oracles/` · `notes/` ghi chú RE, `QUESTIONS.md` · `gates/` checklist cổng · `DECISIONS.md` lý do và sai khác.

## Lệnh
| Việc | Lệnh |
| --- | --- |
| Trạng thái, việc tiếp theo | `npm run gk -- status` |
| Kiểm tra dữ liệu | `npm run gk -- validate` |
| Test / typecheck / lint | `npm test` · `npm run typecheck` · `npm run lint` |
| Parity với game gốc | `npm run gk -- parity` (nghĩa vụ trong `spec/obligations.yaml`, test gắn thẻ `[id:case]`) |
| Kiểm tra cổng, sang pha sau | `npm run gk -- gate` · `npm run gk -- gate --advance` |
| Dựng song song | `npm run gk -- fanout --wave N` → subagent làm theo `.gamekit/local/BRIEF.md` → `npm run gk -- integrate --wave N` |
| Đồ hoạ raster (Codex vẽ, P3) | `npm run gk -- art gen` (concept mỗi style trong `art/styles.yaml`) → xem từng ảnh → `art board` → người dùng chọn → `art lock <style>` → `art gen --assets` |
| Thông tin portal còn thiếu | `npm run gk -- config --portal <id>` |
| Đóng gói, kiểm tra phát hành | `npm run gk -- pack --all` → `builds/<v>/<portal>/` (`--zip`, `--compress`, `--version`) · `npm run gk -- release-check` |
| Chơi thử bản build | `npm run preview` → `http://localhost:4173/<v>/dev-mock/<v>/index.html` |

## Nếu bạn là subagent trong một worktree
Đọc `.gamekit/local/BRIEF.md`. Chỉ sửa trong thư mục được giao; cần đổi contract/params/package.json thì dừng và báo lại. Trước khi xong: test xanh, `npm run gk -- check-ownership` đạt, commit trên nhánh của module.
