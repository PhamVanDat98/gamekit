# Cartoon phẳng viền đen bằng SVG (`make: vector`)

Style "doodle": mảng màu phẳng, viền đen dày đều, góc bo tròn, mắt to, không đổ bóng mềm. Agent viết thẳng SVG ra được, không cần model tạo ảnh hay API key, sửa từng chi tiết được.

## Quy tắc style (chép vào `DECISIONS.md` khi người dùng chọn)
- Mảng màu: `fill` phẳng, không gradient, không blur. Mỗi vật 1 màu chính + tối đa 1 màu sáng/tối (vd má, bụng).
- Viền: `stroke` gần đen (vd `#151515`), `stroke-linejoin="round"`, `stroke-linecap="round"`, độ dày **cùng một giá trị cho cả bộ** tính theo cỡ hiển thị (khoảng 3–4% cạnh asset; chi tiết bên trong mảnh hơn khoảng 60%).
- Hình: đường cong (`C`/`Q`), tránh cạnh thẳng tuyệt đối; vật hơi lệch, không đối xứng hoàn toàn cho tự nhiên.
- Palette: 8–12 màu tươi, ghi hex vào `DECISIONS.md`; mọi asset dùng đúng các hex đó.
- Mặt: mắt trắng + đồng tử đen, miệng mảng tối + lưỡi hồng/răng trắng; biểu cảm rõ ở `minDisplayPx`.

## Ra PNG đúng spec
Game dùng SVG trực tiếp được (UI, DOM). Cần PNG cho canvas/atlas: render bằng Chromium (Playwright có sẵn ở `/opt/pw-browsers` hoặc `npx playwright`), nền trong suốt, đúng `width × height`:

```bash
printf '<html><body style="margin:0;background:transparent"><img src="hero.svg" style="width:96px;height:96px;display:block"></body></html>' > .gamekit/local/r.html
chrome --headless --no-sandbox --hide-scrollbars --default-background-color=00000000 \
  --window-size=96,96 --screenshot=assets/gfx/hero.png "file://$PWD/.gamekit/local/r.html"
```

- Bọc SVG trong HTML và đặt cỡ bằng CSS; chụp thẳng file `.svg` có `width`/`height` sẽ bị cắt chứ không co.
- Anim: mỗi frame một SVG (cùng `viewBox`, cùng điểm đặt chân), render từng frame rồi ghép strip ngang theo `frames`.
- SVG nguồn commit trong `art/`; `provenance add … --label generated --source art/hero.svg`.

## Khi nào không hợp
Nền vẽ tay có chất liệu (mây loang, màu nước, ánh sáng mềm), nhân vật tô bóng nhiều lớp: dùng `image-gen` với ảnh mẫu style, rồi tách nền.
