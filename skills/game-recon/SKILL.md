---
name: game-recon
description: Dùng ở P0 khi bắt đầu với một game gốc (thư mục build, APK/IPA/ZIP, bản WebGL) — chạy gamekit recon để nhận diện engine, kiểu build, phiên bản và kiểm kê file, rồi chấm khả thi và ước lượng công (triage) để người dùng quyết định làm hay bỏ. Dùng cả khi chưa rõ game làm bằng engine gì.
---

# Nhận diện và chấm khả thi game gốc (P0)

Mục tiêu cổng P0: biết game làm bằng gì, có những gì, port tốn bao nhiêu công — đủ để người dùng quyết làm hay bỏ. P0 chỉ đọc file tĩnh: không chạy, không decompile, không đụng server.

## 1. Có project chưa?
Chưa có `game.yaml`: tạo bằng `gamekit init` (skill using-gamekit, mục Tạo game mới). Chưa biết engine thì để `--engine unknown`; recon sẽ điền.

Bản gốc để **ngoài** repo game (hoặc trong `reference/` đã gitignore). Không chép build gốc vào `assets/`, `public/`, `src/`.

## 2. Chạy recon
```
gamekit recon <thư mục build | game.apk | game.ipa | game.zip>
```
- Ghi `notes/inventory.json`: mọi file (cỡ, sha256 — mục trong APK/IPA dùng crc32 của zip — loại `code | data | asset | package | other`), engine, `flavor`, ứng viên khác kèm bằng chứng.
- Điền `source.engine`, `source.path`, `source.engineVersion` nếu còn trống; engine đã ghi khác kết quả thì chỉ cảnh báo — hỏi người dùng rồi sửa tay.
- Build lớn: `--no-hash` để quét nhanh lần đầu; `--no-write --json` để xem mà không ghi.

Đọc kết quả, đừng tin mù: xem `evidence` có hợp lý không, có ứng viên thứ hai không (vd game Cocos đóng trong vỏ Unity), engine `unknown` thì tra bảng trong skill re-notes và ghi `source.engine` bằng tay.

## 3. Logic và data nằm ở đâu — mức khó
| Kiểu build (`engine` / `flavor`) | Logic đọc từ | Mức khó |
| --- | --- | --- |
| unity / mono | `Managed/Assembly-CSharp.dll` (IL, gần như source) | dễ |
| unity / il2cpp | `libil2cpp.so` / `GameAssembly.dll` + `global-metadata.dat` | khó: cần Il2CppDumper/Cpp2IL rồi Ghidra |
| unity / webgl | `Build/*.wasm` | khó như il2cpp; data trong `Build/*.data` |
| html5, cocos, construct, laya | bundle JS (có thể có source map) | vừa: dễ đọc nếu chưa minify/obfuscate |
| godot | `.pck` → `.gd` | dễ (GDRE Tools) |
| flash | `.swf` (ActionScript) | dễ (JPEXS FFDec) |
| unreal | `.pak` + native | khó |
| other / gamemaker | `data.win` / `game.droid` | vừa |

Game của người dùng (`own`) có source thì logic đọc thẳng từ source — mức khó thấp hơn bảng.

## 4. Báo cáo triage
Viết `notes/triage.md`:
- **Nhận diện**: engine, flavor, phiên bản, số file / dung lượng theo loại (từ `notes/inventory.json`), có source không.
- **Khả thi** (điểm 1–5, kèm lý do): đọc được logic · trích được data/số liệu · tái dùng asset (`own`) hoặc khối lượng asset phải làm mới (`third-party`) · cơ chế khó trên web (vật lý, đa luồng, mạng, shader).
- **Phạm vi**: số màn/level, chế độ chơi, hệ thống (kinh tế, save, IAP, online) — cái gì port, cái gì bỏ (bỏ thì sẽ thành `D-n`).
- **Ước lượng công** từng pha → ghi `budget.plannedDays` trong `game.yaml` (vd `{P1: 3, P2: 5, P3: 2, P4: 1, P5: 1}`); `status` cảnh báo khi một pha vượt dự kiến (luật cắt lỗ).
- **Có nên chia song song**: nhiều cơ chế độc lập, logic lớn → P1 dùng skill **re-plan**; game nhỏ → làm tuần tự.
- **Rủi ro**, và với `third-party`: portal có nhận game làm lại không, tên/thương hiệu cần chặn (`release.forbiddenTerms`).

Nói đúng mức chắc chắn: kết luận từ tên file là `inferred` cho tới khi mở file ra xem.

## 5. Đóng pha
`gamekit validate` → `gamekit gate`. Cổng P0 tự kiểm `notes/inventory.json`, `source.engine`, `source.path` (và `forbiddenTerms` với `third-party`). Mục "Đồng ý làm game này (bạn)": trình bày triage, **hỏi người dùng**, không tự tick; chỉ `gate --advance` khi họ đồng ý.
