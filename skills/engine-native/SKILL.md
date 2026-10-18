---
name: engine-native
description: Dùng ở P1 khi game.yaml có source.engine là other (status gợi ý engine-other) hoặc game là chương trình native tự viết (C/C++, DOS, Win32, console cũ, engine riêng) — phân tích binary bằng REA và Ghidra/IDA — tìm vòng lặp game và nhịp thời gian, đọc hằng số, bảng tra, fixed-point, RNG kiểu LCG, định dạng file data riêng. Dùng cả khi recon báo engine unknown nhưng có exe/so.
---

# Phân tích game native / engine riêng (P1)

Dùng cùng skill **re-notes**. Không có engine quen để dựa vào: mọi thứ phải lần từ binary. Xem lại khả thi (skill **triage**, truy cập logic ×7) trước khi cam kết.

## 1. Công cụ
| Việc | Công cụ |
| --- | --- |
| Tổng quan binary, hàm, chuỗi | REA `binary_overview`, `open_binary` |
| Đọc một hàm (pseudocode + assembly) | REA `analyze_function` |
| Ai dùng chuỗi/hàm này | REA `find_xrefs_to_name`; lần theo tính năng: `trace_feature` |
| Giữ bằng chứng | REA `get_evidence_bundle`; id `ev_…` vào ghi chú và `params` |
| Thay thế / bổ sung | Ghidra (có hỗ trợ 16-bit DOS), IDA |
| Chạy để đo (chỉ `own`, hoặc có đồng ý + `D-n`) | DOSBox (bản có debugger), emulator của nền tảng gốc |

## 2. Danh mục cơ chế
Lập tay: mỗi hệ con tìm thấy (nhập liệu, di chuyển người chơi, kẻ địch, va chạm, điểm, level loader, RNG) một mục, `where` = địa chỉ/tên hàm. Bổ sung khi lần ra hàm mới.

## 3. Quy trình cho một câu hỏi
1. Bắt đầu từ thứ nhìn thấy được: chuỗi (thông báo, tên file data), import (API đồ hoạ/âm thanh/input), hằng đặc biệt. `find_xrefs_to_name` → hàm dùng chúng.
2. Tìm **vòng lặp chính** và nhịp thời gian (đọc input → cập nhật → vẽ → chờ). Nhịp quyết định đổi đơn vị.
3. `analyze_function`, đối chiếu pseudocode với assembly (skill re-notes mục 3: chữ ký sai, hằng float đọc tại địa chỉ, xem chỗ gọi).
4. `source` dạng `GAME.EXE 0x406400 (update_ball)`, kèm `evidence`. Oracle tốt nhất là chạy lại đúng hàm gốc trên lưới đầu vào: [oracle-harness](../parity-check/references/oracle-harness.md).

## 4. Bẫy khi chuyển sang web
- **Nhịp thời gian**: game DOS hay theo vsync (VGA mode 13h ~70 Hz) hoặc ngắt timer (mặc định ~18.2 Hz, thường được lập trình lại); game Windows cũ theo `GetTickCount`/`timeGetTime` hoặc chạy theo frame. Tốc độ phải đổi đúng theo nhịp này.
- **Fixed-point** (16.16, 8.8…) và **int 16-bit**: tràn số, chia nguyên, dịch bit có dấu — tái hiện bằng `Math.trunc`, `| 0`, `Math.imul`, mặt nạ bit; ghi rõ định dạng trong `params` (`unit`).
- **Bảng tra** sin/cos, đường bay, bảng level nằm trong vùng data — đọc nguyên bảng làm oracle (`confidence: observed`).
- **RNG kiểu LCG** của thư viện C: vd MSVC `rand` (x = x·214013 + 2531011, trả `(x >> 16) & 0x7FFF`), Borland (hệ số 22695477) — xác nhận bằng hằng số thật trong binary, không đoán.
- **File data riêng**: viết bộ đọc nhỏ trong `.gamekit/local/` (không commit nếu chứa dữ liệu gốc), xuất JSON cho `params/`/`spec/oracles/`.
- Đồ hoạ palette (256 màu), độ phân giải thấp (320×200 có pixel không vuông) — quyết cách hiển thị ở P3, ghi `D-n`.

## 5. Runtime web
Canvas thuần với độ phân giải logic gốc thường hợp nhất. Quyết ở **runtime-select**.
