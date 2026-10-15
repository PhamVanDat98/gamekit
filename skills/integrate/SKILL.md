---
name: integrate
description: Dùng sau khi các subagent làm xong một đợt module trên worktree — merge các nhánh mod/* vào main theo thứ tự phụ thuộc, chạy test sau mỗi lần merge, xử lý vi phạm sở hữu, xung đột và test đỏ.
---

# Tích hợp một đợt

## Trước khi chạy
- Đứng ở `main`, working tree sạch.
- Mỗi subagent báo xong; kiểm tra nhanh từng worktree: `npm run gk -- check-ownership` đạt, test của module xanh, đã commit.

## Chạy
`gamekit integrate --wave N [--test "npm test --silent"] [--cleanup]`
- Merge `--no-ff` theo thứ tự phụ thuộc trong đợt.
- Trước mỗi merge: kiểm tra sở hữu trên toàn nhánh. Sau mỗi merge: chạy test; đỏ thì **tự hoàn tác merge đó** và dừng (module trước vẫn giữ).
- `--cleanup` gỡ worktree của module đã merge và sạch; worktree còn thay đổi được giữ lại.
- Module được coi là đã merge khi có commit `merge: <id> (đợt N)` trên main — xoá nhánh `mod/*` sau đó không ảnh hưởng đợt sau.

## Khi dừng giữa chừng
| Báo lỗi | Làm gì |
| --- | --- |
| Worktree còn thay đổi chưa commit / nhánh chưa có commit | Subagent chưa xong: commit hoặc làm tiếp. Integrate không bao giờ xoá việc chưa commit |
| Sửa ngoài phạm vi / vùng shared (kể cả đổi tên, chuyển file shared) | Trả lại subagent: bỏ thay đổi đó. Nếu thật sự cần đổi contract/params, agent chính sửa trên main rồi giao lại |
| Xung đột merge | Thường do contract chưa đủ. Sửa contract trên main, subagent rebase nhánh lên main rồi làm lại phần lệch |
| Test đỏ sau merge | Đọc output, xác định module gây lỗi (thường là giả định khác nhau về contract). Giao lại kèm test đỏ làm bằng chứng |

Chạy lại `integrate` — module đã merge được bỏ qua.

## Sau đợt
- `gamekit fanout --wave N+1` nếu còn đợt.
- Hết đợt: chạy toàn bộ `npm test`, `typecheck`, `lint`, `gamekit validate`, chơi thử → `gamekit gate`.
