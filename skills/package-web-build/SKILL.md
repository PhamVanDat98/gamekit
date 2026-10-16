---
name: package-web-build
description: Dùng ở pha P5 (hoặc bất cứ khi nào cần bản build) để đóng gói game thành gói cho từng portal theo bố cục builds/<phiên bản>/<portal>/ (az-v1 của AZGAMES) — số phiên bản YYMMDDNN, nén và zip.
---

# Đóng gói

`gamekit pack [--portal a,b | --all] [--version V] [--compress] [--zip]`

- Mỗi lần pack tạo một thư mục phiên bản `builds/<v>/`, mỗi portal trong `portals` (game.yaml) một thư mục con. Bản cũ giữ lại, không tự xoá. `builds/` bị gitignore và hook chặn commit.
- `<v>` = `YYMMDDNN` (ngày build + số thứ tự trong ngày 01–99). `--version 26101605` để chỉ định: phải 8 chữ số và chưa tồn tại. Đây là `productVersion` gửi SDK, `GM_GAME.version` và nội dung `version.txt`; `version` semver trong game.yaml chỉ ghi vào `manifest.json`.
- **Cần `portalSettings` đủ** cho portal được pack (gameCode, gameId, portalGid, signed với azgames). Thiếu thì pack dừng portal đó và liệt kê từng mục kèm lệnh `gamekit config --portal <id>`.
- Vỏ portal (trang HTML, `loader.js`, màn loading, sitelock, khởi tạo SDK) nằm trong plugin (`portals/<id>/`), game không tự viết.

## Bố cục

```
builds/<v>/
  manifest.json                     name, title, semver, version, commit, dirty, builtAt,
                                    portals.<id>.{hash, initialBytes} — KHÔNG upload
  <name>-<portal>-<v>.zip           (--zip) nội dung = thư mục portal, đường dẫn dùng "/"
  azgames/                          đơn vị upload
    index.html                      = <v>/index.html + <base href="<v>/">
    preview.html                    giống index.html từng byte
    version.txt                     "<v>", 8 byte, không newline
    <v>/
      index.html  loader.js  framework.js  css/style.css
      Icons/{web.png, loading.webp, domain.webp}
      Language/en.json (+ <lang>.json)   mỗi ngôn ngữ một file
      assets/{img,art,audio,fonts}/
      StreamingAssets/data/
  dev-mock/                         cùng bố cục, vỏ dev-mock (không sitelock, SDK giả)
```

- `--compress` tạo `.gz`/`.br` cho js/css/json/wasm trong `<v>/` (cho server tự host). Portal ngoài thường tự nén.
- `initialBytes` = số byte tải trước khi vào game: `index.html` ngoài + `<v>/loader.js`, `framework.js`, `css/style.css`, `Icons/*` + file `Language/*.json` lớn nhất (chưa nén). `release-check` so cùng con số này với `budget.initialLoadMB`.
- `--zip` tạo `builds/<v>/<name>-<portal>-<v>.zip` để nộp portal. GameKit tự viết zip (không cần lệnh `zip`/PowerShell), tên file trong zip luôn dùng `/`, cùng nội dung thì cùng file zip.
- Không bật source map khi phát hành.
- Phiên bản có `dirty` nếu còn thay đổi chưa commit — phát hành thật thì commit hết trước khi pack.

## Test local
`npm run preview` (= `vite preview --outDir builds`) rồi mở `http://localhost:4173/<v>/dev-mock/<v>/index.html`. Bản `azgames` có sitelock nên không chạy local — đúng chủ ý.

Sau khi pack: skill **release-check**.
