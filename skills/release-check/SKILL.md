---
name: release-check
description: Dùng trước khi phát hành hoặc nộp game lên portal (cổng P5) — chạy gamekit release-check để chặn asset gốc/placeholder, tên game gốc, link ngoài, đường dẫn tuyệt đối, vượt ngân sách tải, rồi sửa từng lỗi.
---

# Kiểm tra phát hành

1. Commit hết, tăng `version` trong game.yaml (semver), ghi changelog.
2. `gamekit pack --all` → `gamekit release-check` (mặc định kiểm bản mới nhất trong `builds/`; `--version <v>` chọn bản khác, `--portal <id>` chỉ một portal).

## Luật bố cục (`builds/<v>/<portal>/`)
- Vỏ có đúng `index.html`, `preview.html`, `version.txt`, `<v>/` — không file khác.
- `version.txt` = tên thư mục, 8 byte, không newline; `preview.html` giống `index.html` từng byte; `index.html` ngoài có `<base href="<v>/">`, `<v>/index.html` không có `<base>`.
- `<v>/` có `index.html, loader.js, framework.js, css/style.css, Icons/{web.png, loading.webp, domain.webp}, Language/en.json`; `assets/` chỉ có `img art audio fonts`; `StreamingAssets/` không chứa `.js/.mjs/.wasm/.html`.
- Script trong trang: chỉ `loader.js` (tương đối) và script trên host thuộc `allowedHosts` của portal.
- `framework.js` phải đọc `info.copyright` (popup Settings giữ footer bản quyền); thiếu là lỗi.
- Ngân sách tải đầu = HTML + loader + framework + css + một file ngôn ngữ lớn nhất + Icons. `domain.webp` còn là placeholder chỉ bị cảnh báo.

## Lỗi và cách sửa
| Lỗi | Sửa |
| --- | --- |
| asset `reference` / `placeholder` | Thay bằng asset mới (P3), gắn nhãn `generated`/`own`/`licensed` |
| lỗi bố cục (file lạ, `version.txt`, `preview.html`, `<base>`, thiếu file bắt buộc) | Không sửa tay trong `builds/`; sửa nguồn rồi `gamekit pack` lại |
| thiếu copyright trong `framework.js` | Popup Settings phải đọc `platform.info.copyright`; khôi phục footer |
| đóng gói từ bản chưa commit / commit khác HEAD | Commit code và asset, `gamekit pack` lại (sửa gates/notes/spec/game.yaml không tính) |
| file không có nhãn provenance | `gamekit provenance add <file> --label … --source …` (licensed cần `--license`) |
| còn tên/thương hiệu game gốc (text, tên file, chuỗi trong file nhị phân) | Đổi text, tên file, metadata; kiểm tra `release.forbiddenTerms` đủ chưa |
| link ngoài tới host X (kể cả localhost, IP, ws://, `//host` trong index.html) | Bỏ link; nếu là CDN SDK portal thì thêm vào `release.allowedHosts`. URL tài liệu nằm trong thư viện minified cũng bị báo — kiểm tra rồi thêm host vào allowedHosts nếu vô hại |
| đường dẫn tuyệt đối | `<base href="<v>/">` ở index.html ngoài là đúng chủ ý, không phải lỗi. Lỗi là `src`/`href` bắt đầu bằng `/` trong trang hoặc code game: dùng đường dẫn tương đối, `base: './'` trong vite.config.ts |
| tải đầu vượt ngân sách | Chuyển asset lớn sang `StreamingAssets/` tải sau, nén texture/audio, tách code |
| source map | Tắt `build.sourcemap` |
| `params`: source TODO / sai khác chưa duyệt | Hoàn tất nguồn hoặc xin người dùng duyệt `D-n` |

3. Checklist tay trong `gates/P5.md`: ngân sách hiệu năng trên máy yếu, smoke test, ảnh store. Mục **playtest bản cuối (bạn)** do người dùng tick.
4. `gamekit gate` → khi người dùng đồng ý, `gamekit gate --advance` (phase = released).
