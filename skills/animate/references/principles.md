# 12 nguyên lý hoạt hình — áp vào web game

Nguồn: Frank Thomas & Ollie Johnston, *The Illusion of Life: Disney Animation* (1981) — 12 nguyên lý gốc; Richard Williams, *The Animator's Survival Kit* (2001) — timing, spacing, chu kỳ đi/chạy; Steve Swink, *Game Feel* (2008); Martin Jonasson & Petri Purho, *Juice it or lose it* (GDC Europe 2012); Jan Willem Nijman, *The art of screenshake* (2013).

Đơn vị: **khung@60** (1/60 s). Sách hoạt hình đếm ở 24 fps: 1 khung@24 = 2.5 khung@60. "On twos" = giữ mỗi hình 2 khung@24 = 12 hình/giây → `"step": 12`.

---

## 1. Squash & stretch (co giãn)
Vật mềm bẹp khi chạm, giãn khi nhanh — nhưng **giữ khối**: cao ra thì gầy đi.
- Dùng `<phần>.stretch` (sy = s, sx = 1/s). Không dùng `sx`/`sy` riêng cho co giãn; `sx`/`sy` để phóng to/thu nhỏ (UI xuất hiện) hoặc lệch nhịp hai trục (thạch).
- Mức: nhẹ 0.95–1.05 (idle, UI, vật cứng) · vừa 0.8–1.2 (nhảy, đáp) · mạnh 0.65–1.35 (cartoon, va chạm mạnh).
- Pivot ở **điểm tiếp xúc**: chân khi đáp, mặt bị đánh khi trúng đòn. Pivot ở giữa làm nhân vật "lún" xuống đất.
- Giãn **theo hướng chuyển động**: bay chéo thì xoay phần theo hướng vận tốc rồi mới giãn. Theo tốc độ: `stretchFromSpeed(v, vMax, 1.2–1.3)`.
- Bẹp chỉ 1–3 khung lúc chạm, rồi nảy quá (1.05–1.1) và về.
- Phần có mesh: thêm `bulge` (phồng ở giữa, khớp và đầu mút giữ nguyên) — nén/chạm 0.1–0.2, giãn −0.05. Co giãn đều cả hình chữ nhật trông như giấy bị kéo; phồng giữa trông như thịt.
- Lỗi AI: `scale` cả hai trục cùng lúc (phồng như bóng bay, không phải co giãn).

## 2. Anticipation (chuẩn bị, lấy đà)
Trước một hành động là một chuyển động nhỏ **ngược hướng**: nhảy thì nén xuống, đấm thì rút tay về, chạy thì ngả ra sau.
- Diễn xuất (`action`): chuẩn bị dài hơn action. Nhảy: nén 8–12 khung, bật 3–10.
- Đáp lại input (`player-action`): ≤ 4 khung, hoặc bỏ — người chơi cảm thấy trễ từ ~80–100 ms. `core/` đổi state ngay; anticipation chỉ là squash 2–3 khung đè lên.
- Đòn của địch (`telegraph`): **≥ 18 khung** (~0.3 s), thường 24–40, có hold ở pose cực + tín hiệu hình (nháy màu, dấu "!"). Đây là chỗ anticipation là gameplay: thời gian phản ứng của người chơi.
- Bị đánh (`reaction`): không chuẩn bị — vào pose bị đánh ngay khung 1–2.
- Lỗi AI: action bắt đầu từ khung 0; hoặc "khởi động chậm" cùng hướng (đó là ease in, không phải anticipation).

## 3. Staging (dàn dựng)
Mỗi lúc chỉ một điều quan trọng, đọc được ngay.
- Pose chính phải rõ bằng **silhouette** (tô đen vẫn hiểu): tay tách khỏi thân, nghiêng rõ.
- Đừng để mọi thứ trên màn hình cùng nhún nhảy: idle của vật nền nhỏ và chậm hơn nhân vật; UI không chuyển động khi người chơi đang thao tác gameplay.
- Thông tin gameplay (sắp bị đánh, nhặt được) phải có tín hiệu hình, không chỉ âm thanh (cổng P3).

## 4. Straight ahead & pose to pose
- **Pose to pose** (key → breakdown → inbetween): cách viết `motion/*.json`. Dễ kiểm, dễ chỉnh timing.
- **Straight ahead** (từng bước, theo vật lý): tóc, đuôi, vải, lửa, particle → procedural (`Spring`, particle), không key tay.

## 5. Follow-through & overlapping action
Thân dừng nhưng phần phụ (tóc, tai, đuôi, áo, râu) **tiếp tục** rồi mới dừng; các phần không bắt đầu cùng lúc.
- Phần phụ trễ 2–4 khung so với phần kéo nó (drag), vượt quá 10–30% rồi dao động 1–3 lần tắt dần (biên độ mỗi lần ~½ lần trước).
- Thân cũng không dừng đứng: tới đích thì vượt nhẹ (overshoot) rồi settle 4–10 khung.
- **Moving hold**: pose đứng yên vẫn "thở" 1–3% — đứng im tuyệt đối trông như đơ.
- `Spring`: frequency 2–5 Hz (phần dài/nặng thấp hơn), damping 0.3–0.6 (thấp = lắc nhiều, cartoon hơn).
- **Drag tự động** (`drag` trên part có mesh, `src/view/anim/drag.ts`): phần phụ uốn ngược hướng khung chứa nó di chuyển (`vel`) và xoay (`rot`), spring đưa về. Một lần cấu hình, mọi chuyển động đều có overlap — đây là chỗ "mượt" đến nhiều nhất. Đuôi: vel 0.09, rot 0.07, 2.6 Hz, damping 0.3; tai: 0.05, 0.05, 4 Hz, 0.32; tay: 0.035, 0.025, 4.5 Hz, 0.45.
- **Successive breaking of joints** (Williams): khớp gãy lần lượt từ gốc ra ngọn — với mesh, `bend` của lưng đi trước, tay trễ 2 khung, đuôi trễ nữa.

## 6. Slow in & slow out (ease)
Vật sống tăng tốc và giảm tốc. Spacing (khoảng cách giữa các khung) dày ở hai đầu, thưa ở giữa.
| Ease | Dùng khi |
| --- | --- |
| `out` | Tới đích, bật lên (nhanh lúc đầu, êm lúc cuối), đi lên tới đỉnh |
| `in` | Rơi, rời màn hình, lấy đà sắp bùng (chậm rồi nhanh) |
| `inOut` | Từ nghỉ tới nghỉ: thở, nghiêng đầu, chuyển pose |
| `hold` | Snap: mắt nhắm sập, đổi hình, giật mình |
| `outBack` | UI tới đích có vượt quá; nhân vật: viết overshoot bằng key thì dễ chỉnh hơn |
| `outElastic`, `outBounce` | UI vui, vật nảy; tránh cho nhân vật (trông như lò xo) |
| `linear` | Chỉ vật quay đều (bánh xe, đồng xu) trong vòng lặp, hoặc `fx` |

Đi lên `out` + rơi `in` = treo ở đỉnh (hang time) — hiệu ứng cartoon có sẵn.

## 7. Arcs (đường cung)
Tay, đầu, cả thân đi theo đường cong, không đường thẳng.
- x và y cùng key, cùng ease → đường thẳng. Cho x `inOut` còn y `out`/`in`, hoặc lệch key 2–3 khung.
- Xoay (`rot`) phần quanh khớp tự cho cung — chuyển động tay chân nên là xoay, không phải dời x/y.
- Kiểm: bật "đường đi" ở lab — các chấm phải cong, và dày ở hai đầu.

## 8. Secondary action
Hành động phụ làm rõ cảm xúc, không lấn át: chớp mắt khi idle, nheo mắt khi chạm đất, bụi khi đáp, mồ hôi khi hoảng, bóng dưới chân co lại khi nhảy lên.
- Bắt đầu lệch so với action chính; biên độ nhỏ hơn.

## 9. Timing
Số khung quyết định trọng lượng và cảm xúc: nhanh = nhẹ/hăng, chậm = nặng/mệt.
- Pose quan trọng đứng ≥ 4–6 khung để mắt kịp đọc; hold ở pose cực của telegraph 6–12 khung.
- Tương phản: nhanh–chậm–nhanh. Mọi đoạn bằng nhau = máy.
- Vật nặng: chuẩn bị lâu, rơi nhanh, settle ngắn ít nảy. Vật nhẹ: nảy nhiều, settle dài.
- Cảm giác vẽ tay: `"step": 12` (hoặc 8 cho rất "giật" kiểu stop-motion). Gameplay vẫn 60 fps; chỉ pose bị giữ.

## 10. Exaggeration (phóng đại)
Cartoon đẩy pose 1.5–2× mức thật: nén sâu hơn, giãn dài hơn, nghiêng nhiều hơn. Thử: nếu nhìn 0.25× mà pose cực không "lố" một chút thì 1× sẽ nhạt. Giữ cùng mức phóng đại trong cả game (style).

## 11. Solid drawing (khối, thể tích)
Với rig cắt rời:
- Khớp có phần chồng (overlap) 10–20% dưới phần kia, đầu khớp tròn → xoay ±30° không lộ hở.
- Xoay phần 2D quá ±30–40° sẽ lộ "giấy": đổi hình (mặt nghiêng, tay co) bằng swap ảnh, hoặc **uốn** (`bend`) thay vì xoay — tay chân cong theo cung giữ được cảm giác có thể tích mà rig cứng không có.
- Thứ tự lớp (`z`) đúng: tay xa sau thân, tay gần trước thân.
- Squash giữ khối (nguyên lý 1).

## 12. Appeal (cuốn hút)
Hình đơn giản, silhouette rõ, tỉ lệ đầu–thân cartoon (đầu to), mắt lớn đọc được cảm xúc; đường cong đối lập đường thẳng; tránh đối xứng cứng (hai tay cùng làm một việc cùng lúc — lệch 2–3 khung).

---

## Game feel ("juice") đi kèm
Những thứ này không thay nguyên lý nhưng làm phản hồi rõ hơn. Ghi rõ cái nào chạm gameplay.
| Hiệu ứng | Cách làm | Chạm gameplay? |
| --- | --- | --- |
| Nháy trắng khi trúng | 2–3 khung, vẽ đè màu trắng/alpha | Không |
| Hit-stop | Đứng hình 3–6 khung khi trúng | **Có** nếu dừng `core/` — chỉ khi game gốc có (params). Không thì chỉ dừng animation |
| Rung màn hình | "trauma" 0..1, độ lệch = trauma² × max (8–16 px, 2–4°), giảm 1–2/s, nhiễu mượt | Không (camera của view) |
| Bụi, tia, sao | Particle 6–20 hạt, sống 10–30 khung, `out` | Không |
| Số điểm bay lên | Xem recipes | Không |
| Phóng to HUD khi đổi số | 1.2 → 1 trong 8–10 khung `outBack` | Không |
