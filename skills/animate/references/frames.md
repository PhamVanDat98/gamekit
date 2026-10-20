# Ảnh từng khung (frame-by-frame) với Codex — không cần Spine

Game chỉ phát **ảnh**: mỗi khung một PNG, `FrameAnim` (`src/view/anim/frames.ts`) chọn ảnh theo thời gian. Không có rig hay skeleton lúc chạy.

## Vì sao không xin Codex vẽ thẳng 20 khung
Mỗi lần sinh ảnh là một bản vẽ mới: tỉ lệ, nét, màu, vị trí lệch một chút → nhân vật "rung" (boiling), cung chuyển động gãy, timing không ai kiểm. Cách của GameKit: **timing và pose do motion quyết định, Codex chỉ vẽ**.

```
motion/<tên>.json ──(lab: Xuất frame)──► art/frames/<tên>/pose-NN.png   pose đúng nguyên lý, cùng anchor
                                         + meta.json (fps, anchor, kích thước, khung nguồn)
gamekit frames <tên> --codex ──────────► art/frames/<tên>/drawn/NN.png  Codex vẽ lại từng khung theo pose
gamekit frames <tên> --check ──────────► đủ khung, đúng kích thước, nền trong suốt
/lab.html?frames=<tên> ────────────────► xem chạy + contact sheet (người duyệt)
gamekit frames <tên> --install ────────► assets/img/anim/<tên>/NN.png + meta.json, nhãn generated
```
Pose có thể đến từ rig vẽ bằng code (nhân vật mẫu `SAMPLE_RIG`), từ phần ảnh do Codex tạo rồi ghép rig ([assets.md](assets.md)), hay từ bất kỳ thứ gì vẽ được lên canvas. Rig chỉ là **công cụ dựng pose** lúc làm, không vào game.

## Các bước
1. **Ảnh nhân vật tham chiếu** `art/character.png`: một ảnh, pose đứng trung tính, nền trong suốt, đúng style đã chọn ở P3. Tạo bằng Codex, ví dụ:
   `codex exec "Dùng công cụ tạo ảnh: nhân vật mèo chibi đứng nhìn sang phải, toàn thân, nét nâu đậm, màu phẳng, nền trong suốt, không bóng đổ, không chữ. Lưu art/character.png"`
   Muốn Codex bám sát nhân vật mẫu: đính kèm pose đứng yên `--image art/frames/idle/pose-00.png`.
2. **Chuyển động** `motion/<tên>.json` đạt `gamekit motion` (nguyên lý ở [principles.md](principles.md), số khung ở [recipes.md](recipes.md)).
3. **Xuất pose**: `npm run dev` → `/lab.html` → chọn motion → chọn fps → **Xuất frame**.
   - 12 fps (on twos): ít ảnh nhất, đúng chất vẽ tay, hợp cho đi bộ, idle, vòng lặp.
   - 24 fps: hành động nhanh (nhảy, đánh); có thể xuất 24 rồi xoá bớt khung ở đoạn hold và tăng `hold` trong meta.
   - 30 fps chỉ khi thật cần mượt; mỗi khung là một lần sinh ảnh (thời gian, chi phí) và dung lượng tải.
4. **Prompt**: `npm run gk -- frames <tên> [--style "…"]` → `art/frames/<tên>/prompts.md`. Mỗi khung nói rõ: giữ đúng pose, giữ anchor (điểm chân chạm đất), kích thước, nền trong suốt, và **nhịp** của khung (anticipation / action — được vẽ smear / follow-through) lấy từ phân tích motion.
5. **Vẽ**: `npm run gk -- frames <tên> --codex [--ref art/character.png] [--style "…"]`. Gọi `codex exec --sandbox workspace-write --image <ref> --image <pose> "<prompt>"` cho từng khung chưa có, lần lượt. Khung hỏng: xoá `drawn/NN.png` rồi chạy lại, chỉ khung đó được vẽ lại.
6. **Kiểm**: `--check` (tự chạy sau `--codex`) bắt khung thiếu, sai kích thước (anchor lệch → nhân vật rung), không trong suốt. Rồi **xem bằng mắt** ở `/lab.html?frames=<tên>`: contact sheet phía trên phải đều — cùng cỡ đầu, cùng màu, chân đứng cùng một chỗ. Khung "nhảy" màu hay mặt khác → xoá, vẽ lại.
7. **Cài**: `npm run gk -- frames <tên> --install` → `assets/img/anim/<tên>/` + nhãn provenance `generated`.

## Phát trong game
```ts
import { loadFrameAnim, type FrameMeta } from './anim';
const metas = import.meta.glob<FrameMeta>('../../assets/img/anim/*/meta.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../assets/img/anim/*/*.png', { eager: true, query: '?url', import: 'default' });
const hop = await loadFrameAnim(metas['../../assets/img/anim/hop/meta.json']!, (f) => urls[`../../assets/img/anim/hop/${f}`]);
// mỗi frame: hop.draw(ctx, player.x, player.y, secondsSinceStart, facing)
```
`draw` đặt anchor (chân) đúng vị trí nhân vật trong state. Vẫn cộng được lớp procedural lên trên ảnh: nghiêng/giãn theo tốc độ (`Spring`, `stretchFromSpeed`), nháy trắng, rung màn hình, bụi.

## Giảm số ảnh (limited animation)
- `hold` trong `meta.json`: một ảnh đứng nhiều tick (giữ pose cực của telegraph, đỉnh nhảy). Xoá các khung gần giống nhau ở đoạn hold, cộng `hold` cho khung còn lại.
- Vòng lặp đi bộ: 8 ảnh @12 fps là đủ.
- Tái dùng: idle 2–4 ảnh; mắt chớp có thể vẽ 1 ảnh riêng thay vì cả vòng.

## Khi nào vẫn nên giữ rig
Nhiều hành động × nhiều hướng × nhiều skin → số ảnh nhân lên nhanh (vd 8 chuyển động × 20 khung × 3 skin = 480 lần sinh ảnh). Khi đó rig cắt rời (không phải Spine — `rig.ts` của template) phát trực tiếp rẻ hơn; ảnh từng khung để dành cho nhân vật chính hoặc hiệu ứng biến hình.
