# Luật từng style

Mọi style: `viewBox="0 0 100 100"`, neo giữa-đáy (50, 94), màu chỉ lấy từ `styles/<tên>.json`. File mẫu trong `examples/` — mở ra đọc trước khi vẽ asset đầu tiên.

## doodle — cartoon phẳng viền đen (`examples/doodle-monster.svg`)
- Mọi hình có viền mực `#151515`; đặt `stroke="#151515" stroke-linejoin="round" stroke-linecap="round"` trên `<g>` ngoài cùng.
- Độ dày: `3.2` bóng ngoài (thân, tay, mây) · `2` chi tiết trong (mắt, miệng) · `1.2` chi tiết rất nhỏ (răng, lưỡi). Đồng tử: hình tô đen, `stroke="none"`.
- Mảng phẳng, không bóng; tối đa một mảng điểm xuyết (đốm, má) cùng tông đậm hơn.
- Thân là blob đường cong `C`, hơi lệch, không đối xứng tuyệt đối. Tay "mì sợi" (một nét `3.2`, `fill="none"`) + 3 ngón nét `2`; vẽ tay **trước** thân để thân che gốc tay.
- Mắt to (≈ 1/5 chiều cao thân): lòng trắng + đồng tử lệch về một phía cho có hồn. Biến thể:
  - mắt chữ X: `<path d="M-4 -4 L4 4 M4 -4 L-4 4" transform="translate(40 36)" fill="none" stroke-width="2"/>` trên nền trắng
  - mắt cười: `<path d="M34 38 Q40 30 46 38" fill="none" stroke-width="2"/>`
- Miệng há: mảng `maroon`, lưỡi `tongue`, răng nanh tam giác trắng `1.2`. Miệng cười kín: một nét cong `2`.
- Đồ phụ: sao 5 cánh, chấm tròn, mây viền gợn (`C` nối nhiều cung) — cùng viền `3.2`.

## sticker — tô 2 tông, viền trắng ngoài (`examples/sticker-spike.svg`)
- Hình khối **không** đặt stroke, gom trong `<defs><g id="body">…</g></defs>`, rồi vẽ hai lần:
  ```svg
  <use href="#body" stroke="#ffffff" stroke-width="7"/>   <!-- viền trắng sticker -->
  <use href="#body" stroke="#3a2a33" stroke-width="2.6"/> <!-- viền tối -->
  ```
  `stroke-linejoin="round"` đặt trên `<svg>`.
- Mỗi vật 2 tông: mặt sáng `<màu>`, mặt khuất `<màu>-shade` (phải/dưới). Vật khối nhìn 3/4: mặt trước + mặt trên cùng tông sáng, mặt bên tông shade.
- Chi tiết trong (mặt, vết nứt, đường cỏ) vẽ sau, nét `1.5` màu mực; một vệt sáng trắng `1.5` ở góc trên-trái.
- Hợp làm đạo cụ, kẻ địch, khối nền platformer đặt trên nền vẽ tay.

## flat — hypercasual (`examples/flat-coin.svg`)
- Không viền. Mỗi vật: hình tông `-dark` lệch **xuống** 4–6 đơn vị làm độ dày, hình tông sáng đè lên trên.
- Khối hình học đơn giản (tròn, bo góc, đa giác đều); ≤ 5 hình mỗi asset.
- Một vệt sáng trắng ở trên-trái; biểu tượng bên trong màu trắng.
- Nhân vật: thân một khối, mắt hai chấm `night`, không tay chân hoặc tay chân là khối tròn.

## neon — arcade phát sáng (`examples/neon-ship.svg`)
- Nét sáng `3` trong một `<g filter="url(#glow)">`, filter chỉ gồm `feGaussianBlur` + `feMerge`:
  ```svg
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.4" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  ```
- Lõi trắng `1.2` vẽ lại cùng đường, ngoài filter, để nét có "dây tóc" sáng.
- Mảng tô (nếu có) màu `deep`/`void`; mỗi vật 1–2 màu neon. Đạn/hiệu ứng: màu khác tàu người chơi.
- Đẹp nhất trên nền tối của game; kiểm cả nền sáng trong sheet (glow vẫn phải thấy vật).

## paper — giấy cắt (`examples/paper-tree.svg`)
- Không viền. Gom hình bóng vào `<defs><g id="silhouette">` (không tô màu), vẽ bóng đổ trước:
  ```svg
  <use href="#silhouette" fill="#2e2a3a" opacity="0.22" transform="translate(2.5 3)"/>
  ```
- Mỗi lớp giấy một màu phẳng; lớp trên đổ bóng xuống lớp dưới bằng một dải `shadow` opacity `0.22` men theo mép.
- Mép giấy cong mềm (`Q`), hơi lệch; chi tiết khoét bằng màu `paper`.

## Đổi palette cho một game
Chép `styles/<tên>.json` thành `art/style.json` trong dự án, đổi `name`, sửa `colors` (giữ cặp sáng/tối nếu style dùng), rồi `--style art/style.json` ở mọi lệnh. Không đổi `stroke` giữa chừng — cả bộ sẽ lệch nét.
