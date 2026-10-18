---
name: replace-graphics
description: Dùng ở P3 khi làm lại game của người khác — làm hình mới theo asset-manifest.json (vẽ, tạo bằng công cụ tạo hình nếu phiên có, hoặc mua license), đưa vào assets/ đúng kích thước và gắn nhãn provenance generated/licensed/own, thay hết placeholder và mọi dấu vết đồ hoạ gốc trong bản phát hành. Dùng cả khi validate/release-check báo asset placeholder, reference hoặc sai kích thước.
---

# Thay đồ hoạ (P3, game làm lại)

Đầu vào: `asset-manifest.json` (skill **asset-spec**), style đã chọn. Đầu ra: file hình trong `assets/` (và `public/Icons/` cho icon), mỗi file có nhãn provenance. Gameplay không đổi.

## 1. Làm hình
| `make` | Cách | Nhãn provenance |
| --- | --- | --- |
| `vector` | SVG/CSS viết tay theo brief | `own` (người dùng sở hữu) |
| `image-gen` | công cụ tạo hình nếu phiên có, prompt = `brief` + bảng màu; xuất PNG đúng kích thước | `generated` (`--source` ghi công cụ + prompt) |
| `own` | người dùng/hoạ sĩ vẽ theo brief | `own` |
| `licensed` | thư viện/asset store, kiểm license cho phép dùng thương mại trên web | `licensed` + `--license "<tên, link>"` |

Luật:
- **Không** dùng ảnh gốc làm đầu vào (img2img, trace, tô lại), không đưa ảnh gốc vào prompt hay cho hoạ sĩ "làm giống". Chỉ đưa brief.
- Chữ không nằm trong ảnh (`noText`). Logo/tên game là chữ dựng bằng font + CSS/SVG, hoặc ảnh chỉ có hình.
- Kích thước đúng spec: `width × height` @1x (animation: dải ngang `frames.count × frames.width`), có `scales` thì làm thêm bản @2x cùng tên + hậu tố theo quy ước của `view/`.
- Hình gameplay khớp hitbox: phần nhìn thấy không vượt xa vùng `collider` (param), để va chạm "cảm thấy đúng".

## 2. Đưa vào game
```
gamekit provenance add assets/img/player.png --label generated --source "<công cụ>: <prompt rút gọn>"
gamekit provenance add assets/img/bg.png --label licensed --license "CC0, <link>"
```
Gắn nhãn cả thư mục được. Sửa `src/view/` để vẽ hình mới thay hình khối placeholder (`renderer.ts`), theo `pivot` trong spec. Icon portal: thay `public/Icons/web.png` (PNG) và `public/Icons/loading.webp` (WebP) bằng icon mới, đổi nhãn khỏi `placeholder`.

## 3. Dọn dấu vết đồ hoạ gốc
- Không file nào trong `assets/` hay `public/` còn nhãn `reference` (validate chặn từ P3) hay `placeholder` (chặn ở P5).
- Asset gốc chỉ nằm trong `reference/` (gitignored).
- Tên file không chứa tên game gốc (`release-check` quét tên file theo `forbiddenTerms`).

## 4. Kiểm
- `gamekit validate`: kích thước/alpha khớp `asset-manifest.json`, provenance đủ.
- `gamekit assets`: không còn ⚠ định dạng cần chuyển, không file quá nặng, provenance không còn "chưa có nhãn".
- Đọc được: chụp màn hình gameplay, chuyển thang xám — người chơi, kẻ địch, vật nhặt, nguy hiểm vẫn phân biệt được.
- `gamekit pack --all && gamekit smoke`, xem ảnh chụp; `gamekit release-check`.
- Đặt ảnh chụp cạnh ảnh game gốc: nhân vật, logo, bảng màu khác rõ.
