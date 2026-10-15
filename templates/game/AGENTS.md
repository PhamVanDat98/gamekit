# {{TITLE}} — hướng dẫn cho agent (Claude Code, Codex)

Game này được port bằng **GameKit**. Trạng thái nằm trong `game.yaml`; luôn chạy `npm run gk -- status` trước khi làm việc để biết đang ở pha nào và skill nào dùng tiếp.

## Luật cứng
1. **Dữ liệu và logic gameplay phải bám sát game gốc.** Mọi số gameplay nằm trong `params/*.json`, mỗi giá trị có `source` (file + hàm/offset, hoặc đo từ video). Không tự đặt số. Sai khác chỉ khi web bắt buộc, phải có mục `D-n` trong `DECISIONS.md` và được người dùng duyệt (`deviation.approved: true`).
2. **Bám hành vi, không chép code.** Logic viết lại từ ghi chú RE trong `notes/`. Không commit code decompile.
3. **Asset gốc chỉ là tư liệu.** Để trong `reference/` (gitignored). Mọi file trong `assets/` và `public/` phải có nhãn trong `provenance.json` (`gamekit provenance add … --label …`).
4. **Không tự đánh dấu việc "(bạn)"** trong `gates/*.md` — đó là quyết định của người dùng.

## Cấu trúc
- `src/core/` logic thuần, deterministic: không DOM, không thư viện render, thời gian từ fixed step, ngẫu nhiên từ `Rng` có seed. **Viết test trước** (TDD).
- `src/view/` render và input thiết bị; chỉ đọc state. Kiểm tra bằng screenshot/checklist, không unit test.
- `src/platform/` interface chung cho mọi portal. Gameplay chỉ gọi `Platform`; adapter nằm trong `src/platform/adapters/`. Event analytics chỉ dùng tên trong `src/platform/events.ts`.
- `src/contracts/` type dùng chung giữa các module — chỉ agent chính sửa.
- `params/` số liệu có nguồn · `spec/` gameplay spec · `notes/` ghi chú RE · `gates/` checklist cổng · `DECISIONS.md` lý do và sai khác.

## Lệnh
| Việc | Lệnh |
| --- | --- |
| Trạng thái, việc tiếp theo | `npm run gk -- status` |
| Kiểm tra dữ liệu | `npm run gk -- validate` |
| Test / typecheck / lint | `npm test` · `npm run typecheck` · `npm run lint` |
| Kiểm tra cổng, sang pha sau | `npm run gk -- gate` · `npm run gk -- gate --advance` |
| Dựng song song | `npm run gk -- fanout --wave N` → subagent làm theo `.gamekit/local/BRIEF.md` → `npm run gk -- integrate --wave N` |
| Đóng gói, kiểm tra phát hành | `npm run gk -- pack --all` · `npm run gk -- release-check` |

## Nếu bạn là subagent trong một worktree
Đọc `.gamekit/local/BRIEF.md`. Chỉ sửa trong thư mục được giao; cần đổi contract/params/package.json thì dừng và báo lại. Trước khi xong: test xanh, `npm run gk -- check-ownership` đạt, commit trên nhánh của module.
