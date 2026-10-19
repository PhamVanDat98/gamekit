---
name: store-assets
description: Dùng khi cần banner, thumbnail, icon, logo để nộp game lên portal (cổng P5, hoặc khi người dùng xin "banner", "thumbnail", "ảnh store") — chuẩn bị key art + logo trong store/art/, chạy gamekit banners ra đủ 15 kích thước chuẩn + Logo.png, xem lại từng ảnh, gamekit banners --check.
---

# Banner store

Mỗi game nộp portal cần một bộ banner cố định. `gamekit banners` cắt (cover, không méo) và thu phóng ảnh nguồn sang từng kích thước, dán logo đúng chỗ, ghi PNG vào `store/banners/`. Script chỉ cắt và dán — **bố cục đẹp hay không là do ảnh nguồn**.

## Bộ chuẩn (`gamekit banners --list`)

| File | Kích thước | Logo | Ảnh nguồn (ưu tiên trước) |
| --- | --- | --- | --- |
| `64x64.png` | 64×64 | không | icon > square > wide |
| `200x120.png` | 200×120 | không | wide |
| `342x270.png` | 342×270 | trên, giữa | wide > square |
| `512x384.png` | 512×384 | trên, giữa | wide |
| `512x512.png` | 512×512 | không | icon > square > wide |
| `512x512_logo.png` | 512×512 | dưới, giữa, to | icon > square > wide |
| `800x470.png` | 800×470 | trên, giữa | wide |
| `960x1200.png` | 960×1200 | trên, giữa | tall > square > wide |
| `1024x768.png` | 1024×768 | trên, giữa | wide |
| `1200x628.png` | 1200×628 | trên, giữa | wide |
| `1200x1200.png` | 1200×1200 | trên, giữa | square > wide |
| `1280x550.png` | 1280×550 | trên, giữa | wide |
| `1280x720.png` | 1280×720 | trên, giữa | wide |
| `1280x2560.png` | 1280×2560 | trên, giữa | tall > square > wide |
| `1920x1080.png` | 1920×1080 | trên, giữa | wide |
| `Logo.png` | theo logo | — | logo nền trong suốt, cắt sát mép |

## 1. Ảnh nguồn — `store/art/` (PNG)

| File | Bắt buộc | Kích thước tối thiểu | Nội dung |
| --- | --- | --- | --- |
| `wide.png` | có | 1920×1080 (nên 2560×1440) | Key art ngang 16:9, **không chữ**. Nhân vật chính ở giữa–dưới; **khoảng 30% phía trên, ở giữa, để trống** (trời, nền đơn giản) cho logo. Chi tiết quan trọng nằm trong **56% bề ngang ở giữa** để các bản vuông/4:3 cắt ra vẫn giữ được |
| `square.png` | nên có | 1200×1200 | Cùng cảnh, bố cục vuông; trên ~25% để trống cho logo |
| `tall.png` | nên có | 1280×2560 (1:2) | Bản dọc: trên ~20% trống cho logo, nhân vật ở giữa, phần dưới mở rộng cảnh (đường, nền) |
| `icon.png` | nên có | 512×512 | Cận cảnh nhân vật chính, nền đơn giản, **nhìn rõ ở 64px**; ~35% phía dưới không có chi tiết quan trọng (bản `512x512_logo` đặt logo ở đó) |
| `logo.png` | có | ngang ≥ 1200px | Tên game, **nền trong suốt**, có viền/bóng để đọc được trên mọi nền |

Thiếu `square`/`tall`/`icon` thì script cắt từ ảnh kế tiếp trong danh sách ưu tiên và cảnh báo khi phải cắt nhiều (bản dọc 1280×2560 cắt từ ảnh ngang chỉ còn ~28% — gần như luôn xấu). Ảnh JPG/WebP: đổi sang PNG trước. Đường dẫn khác: `--wide f --square f --tall f --icon f --logo f`; thư mục ra khác: `--out dir`.

**Lấy ảnh nguồn từ đâu**
- `own`: ảnh quảng bá/key art gốc của game, hoặc ghép từ asset gốc (nhân vật, nền) — giữ đúng tên và logo của game.
- `third-party`: ảnh **mới hoàn toàn** theo style đã chọn ở P3, logo theo tên mới; không dùng ảnh, nhân vật, tên, logo của game gốc (`release.forbiddenTerms`).
- Tạo bằng công cụ tạo ảnh (nếu phiên làm việc có): mô tả cảnh + style, ghi rõ "no text, no logo", "empty sky at the top center for a title", tỉ lệ 16:9 / 1:1 / 1:2. Logo tạo riêng, nền trong suốt. Không có công cụ thì nhờ người dùng cung cấp — **không tự vẽ placeholder rồi coi là xong**.
- Ghi nguồn: `gamekit provenance add store/art --label own|generated|licensed --source "…"` (`licensed` cần `--license`).

## 2. Tạo

```bash
npm run gk -- banners                        # tất cả
npm run gk -- banners --only 1280x720,Logo   # một vài file
```

Đọc từng cảnh báo và xử lý:

| Cảnh báo | Sửa |
| --- | --- |
| `store/art/tall.png` / `square.png` chưa có — … phải cắt nhiều | Thêm ảnh đúng tỉ lệ đó |
| `… nhỏ (W×H), phải phóng to … Cần ảnh ≥ …` | Xuất/tạo lại ảnh nguồn lớn hơn — banner phóng to sẽ mờ |
| logo không có nền trong suốt | Xuất lại logo PNG có alpha |
| chưa có logo | Đặt `store/art/logo.png`; banner không logo không nộp được |

## 3. Xem lại bằng mắt — bắt buộc

Mở **từng** file trong `store/banners/` (Claude Code: Read từng PNG). Kiểm:
- Logo không che mặt/nhân vật chính, đọc rõ, không sát mép.
- Không mất chi tiết quan trọng khi cắt (đầu nhân vật, vũ khí, tên game).
- `64x64.png` vẫn nhận ra nhân vật.

Lệch bố cục thì sửa theo thứ tự: (1) chỉnh `focus` — điểm cần giữ khi cắt; (2) chỉnh logo của kích thước đó; (3) làm lại ảnh nguồn. Tất cả trong `store/banners.yaml`:

```yaml
focus:                     # 0..1 theo ngang/dọc ảnh nguồn, mặc định giữa ảnh
  wide: { x: 0.55, y: 0.6 }
  tall: { x: 0.5, y: 0.4 }
sizes:                     # trùng name = sửa; name mới = thêm (cần width, height)
  - { name: 1280x550, logo: { at: top, w: 0.3, h: 0.25, margin: 0.03 } }
  - { name: 630x500, width: 630, height: 500, from: [wide, square], logo: { at: top, w: 0.5, h: 0.25 } }
skip: [1280x2560]          # portal không cần
```

`logo.w`/`logo.h`: khung tối đa của logo theo tỉ lệ bề ngang/cao banner (logo vừa khít khung, giữ tỉ lệ); `margin`: khoảng cách tới mép theo tỉ lệ chiều cao; `logo: null` = không logo. Chạy lại `banners` sau mỗi lần sửa.

Cho người dùng xem bộ banner (nêu file nào cắt từ nguồn nào) trước khi coi là xong.

## 4. Kiểm và commit

1. `npm run gk -- banners --check` — đủ file, đúng PNG, đúng kích thước (mục `{auto: banners}` trong `gates/P5.md` chạy lệnh này).
2. Commit `store/art/`, `store/banners/`, `store/banners.yaml` (nếu có). `store/` không vào gói build nên không tính vào ngân sách tải.
3. Tick mục "Đã xem lại từng banner" trong `gates/P5.md` sau khi người dùng đồng ý.
