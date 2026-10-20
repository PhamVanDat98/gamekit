---
name: triage
description: Dùng ở P0 sau game-recon, để chấm độ khả thi của việc port một game sang web, ước lượng công theo từng pha (budget.plannedDays), nêu rủi ro và khuyến nghị làm hay bỏ trong notes/triage.md. Cũng dùng khi gamekit status báo vượt thời gian dự kiến (luật cắt lỗ).
---

# Triage: làm hay bỏ (P0)

Đầu vào: `spec/recon.json`, `notes/recon.md`, `spec/asset-inventory.json` (skill **game-recon**). Đầu ra: `notes/triage.md` + `budget.plannedDays` trong `game.yaml`. Quyết định cuối là của người dùng.

## 0. Game nhỏ: bỏ qua báo cáo triage
Được bỏ qua `notes/triage.md` (mục 1–4) khi **mọi** điều sau đúng, mỗi điều có bằng chứng từ recon:
- Game của người dùng (`own`). `third-party` luôn làm triage đủ: rủi ro clone phải được đánh giá.
- Đọc được logic: `flavour` là `unity-project`, `unity-mono`, hoặc bundle JS có source map.
- 2D, không server/tài khoản/multiplayer, không IAP, vật lý không có hoặc đơn giản.
- Ít nội dung: vài cơ chế, ít màn; ước lượng cả P0–P5 không quá khoảng 5 ngày.

Khi bỏ qua, vẫn phải làm hai việc:
1. Ghi một mục trong `DECISIONS.md`:
   ```markdown
   ## D-n Bỏ qua báo cáo triage (game nhỏ)
   - Bối cảnh: <engine/flavour, số cơ chế, số màn, dung lượng asset — trích spec/recon.json>
   - Quyết định: không viết notes/triage.md; ước lượng nhanh ghi trong budget.plannedDays
   - Sai khác game gốc: không
   ```
2. Ghi `budget.plannedDays` (ước lượng nhanh từng pha). Luật cắt lỗ (mục 6) dựa vào con số này.

Sau đó tick mục "Có báo cáo triage…" của cổng P0 (mục này cho phép thay bằng `D-n`). Báo người dùng là đã bỏ qua triage, kèm lý do và ước lượng. Mục "Đồng ý làm game này (bạn)" vẫn do người dùng tick. Chỉ cần một điều kiện trên sai là làm triage đủ.

## 1. Chấm từng yếu tố
Mỗi yếu tố ghi mức và **bằng chứng** (file, số liệu từ recon). Không có bằng chứng thì ghi "chưa biết", không chấm bừa.

| Yếu tố | Dễ | Khó |
| --- | --- | --- |
| Đọc được logic | có source; Unity Mono (IL gần như source); bundle JS có source map | Unity IL2CPP / WebGL (native, cần Il2CppDumper + Ghidra); native C/C++ |
| Engine → web | HTML5, Cocos, Construct (đã là web) | Unreal, 3D nặng, engine hiếm |
| Đồ hoạ | 2D sprite, ít hiệu ứng | 3D, shader riêng, particle nặng, video |
| Vật lý | không có, hoặc công thức đơn giản | phụ thuộc chi tiết Box2D/PhysX (tái hiện khó khớp) |
| Lượng nội dung | ít level, data dạng bảng | hàng trăm level thiết kế tay, cutscene, thoại |
| Asset | tổng nhỏ, PNG/WAV xuất được | bundle đóng gói, Spine/DragonBones, font bitmap nhiều |
| Phụ thuộc online | offline | server, tài khoản, multiplayer, live-ops |
| Kiếm tiền | ad giữa màn | IAP, gacha, kinh tế phụ thuộc server (phải thiết kế lại cho portal) |
| `third-party` | cơ chế đơn giản, dễ reskin | thương hiệu nhận diện bằng hình/nhân vật, portal không nhận game làm lại |

## 2. Ước lượng công
Cho từng pha P0–P5, theo **ngày làm việc của agent + người duyệt**, ghi khoảng (thấp–cao) và giả định:
- P1 phụ thuộc mạnh vào "đọc được logic"; P2 vào số cơ chế; P3 vào asset và bố cục; P4 thường ổn định (template có sẵn platform); P5 vào QA và ảnh store.
- Game lớn: dự kiến chia module (skill **module-plan**) và ghi vào giả định.

Ghi số dự kiến (mức giữa) vào `game.yaml` sau khi người dùng xem:
```yaml
budget:
  plannedDays: { P0: 0.5, P1: 2, P2: 4, P3: 2, P4: 1, P5: 1 }
```

## 3. Rủi ro
Liệt kê 3–7 rủi ro lớn nhất: mô tả, khả năng, ảnh hưởng, cách giảm, **điểm dừng** (dấu hiệu nên bỏ). Ví dụ: "IL2CPP không có global-metadata.dat → không lấy được tên hàm → dừng nếu sau 1 ngày P1 chưa tìm ra logic di chuyển."

## 4. Viết `notes/triage.md`
```markdown
# Triage — <tên game>
Khuyến nghị: LÀM | LÀM CÓ ĐIỀU KIỆN | BỎ — <một câu lý do>
## Điểm khả thi  (bảng mục 1)
## Ước lượng công (bảng P0–P5: thấp / giữa / cao, giả định)
## Rủi ro và điểm dừng
## Phạm vi đề xuất (giữ / cắt / đổi so với game gốc → sẽ thành D-n trong DECISIONS.md)
## Chưa biết
```
Phạm vi cắt hay đổi (bỏ multiplayer, IAP → rewarded ad) phải được người dùng duyệt và ghi `D-n` trong `DECISIONS.md` trước P2.

## 5. Người dùng quyết
Trình bày khuyến nghị, ước lượng, rủi ro. Mục "Đồng ý làm game này (bạn)" và "Đã đánh giá rủi ro clone" (`third-party`) **chỉ người dùng tick**. Họ đồng ý thì `gamekit gate`, và chỉ `gamekit gate --advance` khi họ bảo qua pha.

## 6. Luật cắt lỗ
`gamekit status` cảnh báo khi số ngày ở một pha vượt `budget.plannedDays`. Khi đó dừng lại, cập nhật `notes/triage.md` (đã tốn bao nhiêu, còn bao nhiêu, rủi ro nào đã xảy ra) và hỏi người dùng: tiếp tục với ước lượng mới, cắt phạm vi, hay bỏ. Không âm thầm tăng `plannedDays`.
