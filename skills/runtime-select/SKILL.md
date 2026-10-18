---
name: runtime-select
description: Dùng ở đầu P2, trước khi viết view/, để chọn thư viện render, vật lý và tần số bước cố định cho bản web dựa trên game gốc (2D/3D, số sprite, hiệu ứng, vật lý, animation Spine…) — ghi vào runtime trong game.yaml và DECISIONS.md, cài và kiểm lint/bundle. Dùng cả khi game chạy chậm vì runtime chọn sai hoặc cần đổi runtime.
---

# Chọn runtime (P2)

Runtime chỉ nằm trong `src/view/`. `src/core/` không bao giờ import thư viện render/âm thanh (ESLint chặn `pixi.js`, `phaser`, `three`, `@babylonjs/*`, `howler` trong core). Vì vậy đổi runtime sau này chỉ phải viết lại view.

## 1. Đầu vào
`notes/recon.md` (engine, SDK thư viện như Spine/DOTween), `spec/gameplay-spec.md`, `notes/assets.md`, `ui-kit/`, `game.yaml` (`budget`).

## 2. Chọn
| Game gốc | Render (`runtime.renderer`) | Ghi chú |
| --- | --- | --- |
| 2D ít sprite (< ~200), UI đơn giản | `canvas` (template sẵn) | không thêm dependency, bundle nhỏ nhất |
| 2D nhiều sprite, particle, filter, atlas lớn | `pixi` | WebGL, batching; Spine có runtime chính thức của Esoteric cho pixi (chọn đúng bản theo phiên bản Spine của game gốc) |
| 2D cần scene/tween/input/camera có sẵn | `phaser` | nặng hơn pixi; dùng phần render, giữ logic trong core/ |
| 3D | `three` | glb (skill asset-inventory chuyển fbx/obj) |

| Vật lý (`runtime.physics`) | Khi nào |
| --- | --- |
| `none` | không va chạm hoặc va chạm hình hộp/tròn đơn giản |
| `custom` | **mặc định khi game gốc có công thức riêng**: viết lại đúng công thức trong core/ — parity dễ hơn mọi engine vật lý |
| `planck` / `matter` / `rapier` | game gốc dùng engine vật lý thật (Box2D, Unity Physics2D/3D) và hành vi phụ thuộc nó; chọn bản gần nhất (Box2D → planck; 3D → rapier). Kết quả sẽ không khớp từng frame — ghi `D-n`, nghĩa vụ dùng `tolerance` |

Engine vật lý chạy mô phỏng nên phải deterministic và gọi từ core/ theo `dt` cố định; kiểm replay test. Không thể deterministic → ghi rõ trong `DECISIONS.md`, nghĩa vụ `replay` chuyển sang so có `tolerance`.

`runtime.fixedStepHz`: tần số cập nhật của bản gốc (Unity `Time.fixedDeltaTime` 0.02 = 50 Hz; game tính theo frame ở 30/60 fps → 30/60). Sai tần số làm lệch mọi số theo frame (re-notes §3).

Âm thanh: Web Audio trực tiếp là đủ cho đa số game; `howler` khi cần sprite âm thanh/nhiều định dạng — vẫn chỉ trong view/.

## 3. Ghi lại
- `game.yaml`: `runtime: { kind: 2d|3d, renderer, physics, fixedStepHz }` (schema kiểm).
- `DECISIONS.md`: một mục `D-n` — lựa chọn, lý do (đối chiếu game gốc), thứ đã loại và vì sao, ảnh hưởng tới dung lượng tải.

## 4. Cài và kiểm
1. `npm i <thư viện>` (dependency thường, không phải dev).
2. Viết `src/view/renderer.ts` (hoặc file mới trong view/) theo thư viện; `src/main.ts` chỉ nối view với core và platform.
3. Thư viện mới không có trong danh sách chặn của ESLint (vd `matter-js`, `planck`): thêm vào `RENDER_LIBS` trong `eslint.config.js` nếu là render/âm thanh. Thư viện vật lý dùng trong core thì không chặn.
4. `npm run typecheck`, `npm run lint`, `npm test` (replay test phải còn xanh).
5. `gamekit pack --all` rồi `gamekit release-check`: dung lượng tải đầu so với `budget.initialLoadMB`. `gamekit smoke` cho FPS trên điện thoại.

## 5. Báo cáo
Runtime đã chọn, lý do, dung lượng thêm vào bản build, thứ phải viết lại thủ công (animation, shader), rủi ro parity nếu dùng engine vật lý.
