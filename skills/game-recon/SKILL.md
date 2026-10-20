---
name: game-recon
description: Dùng ở P0 ngay khi có game gốc (thư mục project, bản build, APK/IPA/zip) — nhận diện engine, phiên bản, nơi chứa logic và data, kiểm kê asset bằng gamekit recon và gamekit assets scan, điền source.* trong game.yaml, ghi notes/recon.md trước khi triage.
---

# Nhận diện game gốc (P0)

Mục tiêu: biết mình đang cầm cái gì trước khi quyết định làm hay bỏ. Chỉ **đọc tĩnh**: `recon` liệt kê file và đọc vài byte đầu để lấy phiên bản, không chạy game.

## 1. Có gì trong tay?
Hỏi người dùng (nếu chưa rõ):
- Bản gốc là gì: project có source, bản build desktop/WebGL, APK/XAPK/IPA, hay chỉ có video.
- Game của ai: mặc định là game của người dùng (`own`). Chỉ khi họ nói là game người khác mới là `third-party` (`gamekit init … --third-party`). Không hỏi lại nếu `game.yaml` đã ghi.
- Đặt bản gốc ở thư mục **ngoài** thư mục game web. Không chép vào repo.

## 2. Chạy recon
```bash
gamekit recon <thư mục | file.apk | .ipa | .zip> --write
```
- Nhận diện Unity (project / Mono / IL2CPP / WebGL), Cocos, Godot, Unreal, Flash, Construct, Laya, GameMaker, Defold, HTML5 (Phaser, Pixi, RPG Maker). XAPK/APKS: các APK con được mở luôn.
- `--write` ghi `spec/recon.json` và điền `source.engine`, `source.engineVersion`, `source.path` trong `game.yaml` **khi còn trống**. Nếu `game.yaml` đã ghi engine khác, recon chỉ cảnh báo: kiểm tra lại, đừng tự sửa.
- Đã khai `source.path` thì chạy `gamekit recon --write` không cần đường dẫn.
- `--json` để đọc kết quả bằng máy.

Đọc kết quả, phân biệt rõ:
| Trường | Ý nghĩa | Độ tin cậy |
| --- | --- | --- |
| `engine`, `flavour`, `evidence` | file đặc trưng tìm thấy (vd `libil2cpp.so`) | observed |
| `version` | chuỗi phiên bản đọc trong file | observed; `null` = chưa đọc được, **không đoán** |
| `logic`, `tools` | gợi ý nơi chứa logic và công cụ hợp với dạng build | gợi ý, chưa kiểm |
| `assets.kinds`, `biggest` | số file và dung lượng theo loại | observed (chỉ file nhìn thấy; asset đóng gói trong bundle Unity không hiện riêng) |

`engine: unknown` → xem `evidence` rỗng, liệt kê thư mục gốc, hỏi người dùng, ghi vào `source.notes`.

## 3. Kiểm kê asset nhanh
```bash
gamekit assets scan --write      # → spec/asset-inventory.json
```
Đủ cho P0: tổng số ảnh/âm thanh, sprite sheet Unity, file lớn nhất. Kế hoạch xuất chi tiết để P1 (skill **asset-inventory**).

## 4. Ghi `notes/recon.md`
Ngắn, đủ để người khác tiếp tục:
- **Bản gốc**: dạng, nền tảng, đường dẫn, phiên bản engine (kèm nguồn: file nào).
- **Logic ở đâu**: file/thư mục, có đọc thẳng được không (source C#, IL, hay native/wasm).
- **Data và asset**: các nhóm chính, dung lượng, chỗ khó (asset đóng trong bundle, font bitmap, Spine, video).
- **Công cụ sẽ dùng** ở P1 (chưa cần cài).
- **Chưa biết**: những gì recon không trả lời được.

## 5. Ranh giới
- `own`: được mở project, chạy, debug game gốc ở các pha sau (để đo, ghi trace).
- `third-party`: chỉ phân tích file tĩnh của bản người dùng có; không chạy, không can thiệp game đang chạy, không đụng server. Asset gốc chỉ là tư liệu trong `reference/` (gitignored).
- Cả hai: không commit file của game gốc hay code decompile vào repo game (hook pre-commit chặn).

## 6. Đóng phần recon của cổng P0
Các mục trong `gates/P0.md` mà skill này lo:
- "Đã nhận diện engine, version và kiểm kê file game gốc": tick sau khi `notes/recon.md` xong.
- `{auto: field:source.engine}`, `{auto: field:source.path}`: tự đạt khi `recon --write` đã điền.
- `third-party`: điền `release.forbiddenTerms` bằng tên, thương hiệu game gốc.

Rồi chuyển sang skill **triage** (game nhỏ: xem mục 0 của skill đó, có thể bỏ qua báo cáo đầy đủ). Mục "Đồng ý làm game này (bạn)" chỉ người dùng tick.
