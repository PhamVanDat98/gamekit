---
name: release-check
description: Dùng trước khi phát hành hoặc nộp game lên portal (cổng P5) — chạy gamekit release-check để chặn asset gốc/placeholder, tên game gốc, link ngoài, đường dẫn tuyệt đối, vượt ngân sách tải, rồi sửa từng lỗi.
---

# Kiểm tra phát hành

1. Commit hết, tăng `version` trong game.yaml (semver), ghi changelog.
2. `gamekit pack --all` → `gamekit release-check`.

## Lỗi và cách sửa
| Lỗi | Sửa |
| --- | --- |
| asset `reference` / `placeholder` | Thay bằng asset mới (P3), gắn nhãn `generated`/`own`/`licensed` |
| file không có nhãn provenance | `gamekit provenance add <file> --label … --source …` (licensed cần `--license`) |
| còn tên/thương hiệu game gốc | Đổi text, tên file, metadata; kiểm tra `release.forbiddenTerms` đủ chưa |
| link ngoài tới host X | Bỏ link; nếu là CDN SDK portal thì thêm vào `release.allowedHosts` |
| đường dẫn tuyệt đối trong index.html | Dùng `./…`; `base: './'` trong vite.config.ts |
| tải đầu vượt ngân sách | Chuyển asset lớn sang `StreamingAssets/` tải sau, nén texture/audio, tách code |
| source map | Tắt `build.sourcemap` |
| `params`: source TODO / sai khác chưa duyệt | Hoàn tất nguồn hoặc xin người dùng duyệt `D-n` |

3. Checklist tay trong `gates/P5.md`: ngân sách hiệu năng trên máy yếu, smoke test, ảnh store. Mục **playtest bản cuối (bạn)** do người dùng tick.
4. `gamekit gate` → khi người dùng đồng ý, `gamekit gate --advance` (phase = released).
