---
name: animate
description: Dùng khi làm chuyển động cho nhân vật, kẻ địch, UI hoặc hiệu ứng (nhất là kiểu cartoon) — ở P3 khi reskin cần asset chuyển động mới, hoặc khi game của người dùng thiếu animation. Áp 12 nguyên lý hoạt hình bằng key pose theo khung trong motion/*.json, rig cắt rời cho asset do AI tạo, spring cho follow-through; chấm bằng `gamekit motion` (biểu đồ nhịp) và xem onion skin ở /lab.html.
---

# Làm chuyển động theo nguyên lý hoạt hình

Chuyển động "AI làm" thường hỏng vì cùng vài lý do, không phải vì thiếu công cụ. Skill này biến từng nguyên lý thành **số khung, ease và kiểm tra** mà agent làm được và tự chấm được.

| Lỗi hay gặp | Nguyên lý | Bắt bằng |
| --- | --- | --- |
| Tween một phát A → B, `linear`, trông như máy | Slow in / slow out | `motion`: lỗi `slow-in-out` |
| Vào thẳng action, không lấy đà | Anticipation | `motion`: lỗi `anticipation` (action, telegraph) |
| Tới đích là đứng im | Follow-through | `motion`: lỗi `follow-through` |
| Phóng to cả hai chiều (scale 1.2) thay cho co giãn | Squash & stretch (giữ khối) | `motion`: cảnh báo `squash-stretch`; dùng `stretch` |
| Mọi phần bắt đầu và dừng cùng khung | Overlapping action | `motion`: cảnh báo `overlap` |
| x và y cùng ease → đi đường thẳng | Arcs | `motion`: cảnh báo `arcs`; đường đi trong lab |
| Mọi đoạn 0.3 s | Timing (tương phản) | `motion`: cảnh báo `timing` |
| Xin AI vẽ sprite sheet 8 khung → nhân vật "nhảy hình" mỗi khung | Solid drawing | Dùng rig cắt rời ([assets.md](references/assets.md)) |
| Không xem kết quả | — | Biểu đồ nhịp + screenshot onion skin ở `/lab.html` |

Nguyên lý đầy đủ, kèm số: [principles.md](references/principles.md). Công thức từng hành động (nhảy, đáp, đi, bị đánh, telegraph, nút, popup, nhặt xu…): [recipes.md](references/recipes.md). Làm asset để chuyển động được: [assets.md](references/assets.md).

## Khi nào dùng
- `third-party` (P3 reskin): mọi chuyển động của asset mới.
- `own`: **giữ animation gốc** (xuất clip/spritesheet gốc; clip có curve thì chuyển key sang `motion/*.json`, ease gần nhất). Chỉ làm mới khi bản gốc không có hoặc người dùng yêu cầu.
- Chuyển động chỉ nằm ở `src/view/` — không đổi state, không làm trễ `core/`. Nếu thời điểm của animation **quyết định gameplay** (đòn đánh trúng ở khung 18), con số đó là số gameplay: nằm trong `params/` có `source`, motion lấy theo, không ngược lại.

## Chọn kỹ thuật
| Cần | Dùng |
| --- | --- |
| Nhân vật, kẻ địch, vật có hình cố định | **Rig cắt rời** (`src/view/anim/rig.ts`) + `motion/*.json` — mặc định cho asset AI tạo |
| Phản hồi liên tục theo gameplay (nghiêng theo tốc độ, tóc/đuôi đung đưa, bám con trỏ) | **Procedural**: `Spring`, `stretchFromSpeed` |
| Biến hình (lửa, khói, nước, nổ) | Particle/procedural trước; ảnh từng khung chỉ khi bắt buộc (ít khung, `step: 12`) |
| Team đã có Spine/DragonBones | Dùng runtime đó trong `view/`; vẫn áp nguyên lý, chấm bằng mắt (lab, quay chậm) |
| UI bằng DOM | Cùng số khung/ease trong recipes, viết bằng CSS/Web Animations; UI trên canvas dùng `motion/*.json` |

## Quy trình (pose-to-pose)
1. **Brief** — mỗi chuyển động một file `motion/<tên>.json`. Ghi `brief` bằng lời: ý đồ, cảm xúc, ai kích hoạt, vào/ra từ pose nào. Chọn `role`:
   - `player-action` (đáp lại input): chuẩn bị ≤ 4 khung@60; `core/` xử lý input **ngay**, animation chỉ là lớp nhìn.
   - `telegraph` (đòn báo trước của địch): chuẩn bị ≥ 18 khung@60 để người chơi kịp phản ứng, kèm tín hiệu hình (nháy màu).
   - `reaction` (bị đánh, va chạm): vào ngay (≤ 2 khung), không chuẩn bị.
   - `action` (diễn xuất) · `ui` (≤ 36 khung, có overshoot) · `idle` (vòng lặp ≥ 1 s) · `fx`.
2. **Key pose** — viết các pose cực (extreme) trước: nén sâu nhất, cao nhất, bẹp nhất. Phóng đại 1.5–2× mức "thật" cho cartoon. Mỗi pose quan trọng phải đọc được bằng silhouette và đứng ≥ 4–6 khung (hold hoặc moving hold).
3. **Breakdown + arc** — key giữa quyết định đường đi: cho x và y ease khác nhau (hoặc lệch key) để đi theo cung.
4. **Timing** — đặt số khung theo [recipes.md](references/recipes.md). Cartoon: chuẩn bị lâu, action dứt khoát (2–6 khung), settle vừa. Tạo tương phản: không có hai đoạn liền nhau dài bằng nhau.
5. **Spacing (ease)** — `out` khi tới đích (dừng êm), `in` khi rời đi/rơi (tăng tốc), `inOut` từ nghỉ tới nghỉ, `hold` để snap, `outBack`/`outElastic` chủ yếu cho UI. Không `linear` (trừ vật quay đều trong vòng lặp).
6. **Overlap + secondary** — phần phụ (râu, tai, tóc, đuôi, mũ) trễ 2–4 khung so với thân rồi vượt quá và dao động tắt dần; chớp mắt, nheo mắt khi chạm, bụi khi đáp. Phần dài hoặc chạy theo gameplay: dùng `Spring` (frequency 2–5, damping 0.3–0.6).
7. **Squash & stretch** — dùng `<phần>.stretch` (giữ khối: sy = s, sx = 1/s), pivot đặt ở điểm tiếp xúc (chân khi đáp). Vật cứng co giãn ít (≤ 5%) hoặc chỉ phần mềm.
8. **Chấm** — `npm run gk -- motion`: đọc biểu đồ nhịp (dưới đây), sửa đến khi hết lỗi; cảnh báo nào cố ý thì ghi `"skip": { "<kiểm tra>": "lý do" }`.
9. **Xem** — `npm run dev` → `/lab.html?m=<tên>&onion=1&f=<khung>`: chụp màn hình vài khung (pose chuẩn bị, đỉnh action, chạm, settle) và tự xem: arc có cong, khoảng cách ghost có dày ở hai đầu (ease), khớp có lộ hở khi xoay, squash có giữ khối. Đổi `PLACEHOLDER_RIG` trong `src/view/anim/lab.ts` thành rig thật. Rồi chạy trong game ở 1× và 0.25×.
10. **Người dùng duyệt** — cảm giác là quyết định của người dùng (mục `(bạn)` ở cổng P3). Gửi screenshot onion skin + biểu đồ nhịp; không tự tick.

## Đọc biểu đồ nhịp (`gamekit motion`)
```
hop · action · 58 khung @60 = 0.97 s
khung         0         10        20        30        40        50
nhịp          ············━━━━━━━━━━━~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
key           |        |  | ||    | |           | | | | | |     | |   | |
body.y↑       ▁▁▁▁▁▁▁▁▁▁▁▁▁▃▄▆▆▇█████████▇▇▇▆▅▄▃▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
body.stretch  ▅▅▅▄▄▃▂▂▂▁▁▁▁▆████▇▆▅▅▅▅▅▅▅▅▅▅▆▆▆▇▇▂▁▃▄▅▅▆▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅
```
- Mỗi cột một khung (hoặc một nhóm khung). `nhịp`: `·` chuẩn bị, `━` action, `~` follow-through — tỉ lệ ba đoạn này chính là timing.
- Ease nhìn ở độ dốc: phẳng sát key = slow in/out; dốc đều một mạch = linear; vượt qua mức cuối rồi quay về = overshoot.
- `y↑` vẽ ngược (lên trên biểu đồ = lên trên màn hình). Ở ví dụ: nén (▁) → bật giãn (█) → tròn ở đỉnh → giãn khi rơi → bẹp khi chạm (▁) → nảy → settle.

## Ghép vào game
- `MOTIONS`/`motion(name)` từ `src/view/anim` nạp mọi `motion/*.json`. `Animator`: `loop(idle)` ở dưới, `play(hit)` một lần ở trên; `update(dt)` mỗi frame với thời gian thật (0 khi pause); `pose('body')` → `{x, y, rot, sx, sy, alpha}` cộng lên vị trí từ state.
- Kích hoạt từ `WorldEvent` hoặc so state trước/sau trong renderer (xem `src/view/renderer.ts`: nghiêng + giãn bằng spring theo tốc độ, `hit` khi thua, `pop-in` cho overlay).
- Vận tốc lấy theo thời gian mô phỏng (`w.time`), không theo thời gian frame — frame có 0 hoặc 2 fixed step sẽ làm giật.
- Hit-stop (đứng hình khi trúng) chỉ khi game gốc có (số trong `params/`); nếu chỉ để "cảm giác", dừng `Animator`/hiệu ứng, không dừng `core/`.

## Xong khi
- `npm run gk -- motion` đạt; cảnh báo còn lại có lý do trong `skip` hoặc đã nói với người dùng.
- Screenshot onion skin các pose chính đã xem; chạy trong game không giật ở chỗ nối vòng lặp, không trễ input.
- `npm test`, `npm run typecheck`, `npm run lint` xanh. Asset mới có provenance (`generated`/`licensed`…), part chưa thay còn là `placeholder` (P5 chặn).
