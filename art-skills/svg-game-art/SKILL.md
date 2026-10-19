---
name: svg-game-art
description: Vẽ asset game 2D (nhân vật, kẻ địch, vật phẩm, icon, đạo cụ, tile) bằng SVG viết tay theo một style có sẵn — doodle (cartoon phẳng viền đen), sticker (tô 2 tông, viền trắng kiểu sticker), flat (hypercasual), neon (arcade phát sáng), paper (giấy cắt) — rồi kiểm style, render PNG nền trong suốt đúng cỡ, ghép strip animation giữ điểm neo. Dùng khi cần art game đồng bộ, sửa được từng chi tiết, không cần model tạo ảnh hay API key; hoặc khi người dùng đưa ảnh mẫu thuộc một trong các style này.
---

# Art game bằng SVG

`ART` dưới đây = `node <thư mục skill này>/scripts/svgart.mjs`. Cần Node ≥ 20 và Chrome/Chromium/Edge (tự tìm; Playwright Chromium cũng được; hoặc đặt `CHROME_PATH`).

## Quy trình
1. **Chọn style**: `ART styles`. Người dùng đưa ảnh mẫu → so với bảng dưới. Ảnh mẫu là tranh vẽ tay có chất liệu, ảnh chụp, 3D render: SVG không làm giống được — nói thẳng với người dùng và đề nghị dùng model tạo ảnh.
2. **Đọc luật của style** trong [styles.md](references/styles.md) và mở file mẫu trong `examples/`. Một game dùng một style; palette của style là palette của cả game. Cần màu khác: chép `styles/<tên>.json` vào dự án, sửa, dùng `--style <đường dẫn>.json`.
3. **Viết SVG**: `viewBox="0 0 100 100"`; vật đứng trên đường y = 94, giữa theo x = 50 (điểm neo giữa-đáy), chừa lề ≥ 4 cho viền. Mọi asset cùng thang này để đặt cạnh nhau vẫn đúng tỉ lệ.
4. **Kiểm**: `ART lint a.svg --style <tên>` (palette, độ dày nét, phần tử bị cấm). Sửa tới khi sạch.
5. **Nhìn**: `ART sheet a.svg b.svg --out <thư mục tạm>/sheet.png` rồi mở ảnh. Mỗi asset ở 32/64/128 px trên nền sáng và tối. Hỏi: cỡ nhỏ nhất còn nhận ra không? bóng đen có đọc được không? cả bộ có như một người vẽ không? Sửa **lỗi nặng nhất** rồi xem lại; tối đa 3 lượt — vẫn dở thì concept sai, vẽ lại từ hình khối.
6. **Xuất**: `ART render a.svg --out a.png --size 96x96`. Animation: mỗi frame một SVG → `ART render f0.svg f1.svg f2.svg --out strip.png --size 64x64` ra strip ngang; frame giữ nguyên toạ độ nên chuyển động và điểm neo không bị mất.

## Ảnh mẫu → style
| Ảnh mẫu trông như | Style |
| --- | --- |
| Mảng màu phẳng tươi, viền đen dày đều, quái vật/nhân vật ngộ nghĩnh | `doodle` |
| Tô 2 tông (sáng + bóng), viền tối, thêm viền trắng ngoài như sticker; đạo cụ khối 3/4 | `sticker` |
| Khối hình học không viền, màu rực, mặt tối lệch xuống làm độ dày | `flat` |
| Nét sáng phát quang trên nền tối, tàu/đạn/vũ khí | `neon` |
| Lớp giấy chồng nhau, bóng đổ lệch mềm, màu pastel | `paper` |

## Luật chung cho mọi style
- Không chữ trong ảnh (chữ đi qua UI của game) trừ khi người dùng muốn biển hiệu trang trí.
- Bóng đen (silhouette) phải nhận ra được: địch/bạn, nhặt được/nguy hiểm khác nhau bằng hình **và** màu, không chỉ màu.
- Chi tiết nhỏ hơn ~1/12 cạnh sẽ mất ở 48 px: phóng to mắt, miệng, gai; bỏ chi tiết vụn.
- Ánh sáng từ trên-trái cho cả bộ: mặt tối/bóng ở phải-dưới, điểm sáng ở trên-trái.
- Cả bộ dùng đúng các độ dày nét của style (lint kiểm), cùng tỉ lệ đầu/thân, cùng mức chi tiết.
- Animation: các frame cùng `viewBox` và cùng điểm neo; idle 2–4 frame (nhún, nháy mắt), chỉ đổi vài điểm giữa các frame; chép frame 0 rồi sửa, đừng vẽ lại. Nhún giữ chân tại chỗ: bọc cả hình trong `<g transform="translate(0 {94·(1−s)}) scale(1 s)">` với s = 0.94 (nén) / 1.04 (vươn).
- Màu nằm trong palette của style; muốn sáng/tối hơn thì dùng màu `-shade`/`-dark` có sẵn, không tự pha.

## Trong game GameKit (thư mục có `game.yaml`)
- Ghi style đã chọn vào `DECISIONS.md`; SVG nguồn để trong `art/` và commit; sheet, ảnh tạm để trong `.gamekit/local/`.
- Cỡ xuất lấy từ `asset-manifest.json`: `--size <width>x<height>`; anim: `--size <frames.width>x<frames.height>` với đúng `frames.count` file. Ghi vào `path` của spec.
- `gamekit provenance add <png> --label generated --source art/<tên>.svg`, rồi `gamekit validate`.
