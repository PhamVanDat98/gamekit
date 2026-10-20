---
name: runtime-select
description: Dùng ở pha P2 khi bắt đầu dựng lại (trước module-plan, rebuild-game) và cần chọn renderer (canvas có sẵn trong template, Pixi, Phaser, Three, PlayCanvas), cách làm vật lý (tái hiện công thức gốc hay dùng matter/planck/rapier) và âm thanh (WebAudio/howler) cho bản web — cân với dung lượng tải budget.initialLoadMB và yêu cầu parity, ghi vào runtime trong game.yaml và một mục D-n trong DECISIONS.md.
---

# Chọn runtime cho bản web (P2)

Chọn một lần, trước khi chia module: renderer, vật lý và âm thanh nằm trong `package.json` và `src/contracts/`, là vùng shared mà subagent không được sửa.

## 1. Đầu vào
`spec/gameplay-spec.md` (cơ chế, RNG, vật lý), `notes/assets.md` (atlas, animation xương, shader, video), `notes/ui.md`, `notes/recon.md` (engine gốc), `budget` trong `game.yaml`.

## 2. Renderer (chỉ dùng trong `src/view/`)
| Lựa chọn | Hợp khi | Lưu ý |
| --- | --- | --- |
| `canvas` (Canvas 2D, template có sẵn `src/view/renderer.ts`) | 2D, ít sprite, UI đơn giản | không thêm thư viện; nhiều sprite + hiệu ứng thì chậm |
| `pixi` | 2D nhiều sprite, atlas, filter/shader, animation xương | chỉ là renderer: không scene, không vật lý |
| `phaser` | 2D cần scene, tween, loader, camera có sẵn | nặng hơn Pixi; Phaser chỉ vẽ và nhận input, logic vẫn ở `core/` với fixed step của template, không dùng vật lý/vòng lặp của Phaser cho gameplay |
| `three` | 3D, port scene Unity/Godot (xuất glTF) | tự dựng UI 2D phía trên (DOM hoặc lớp riêng) |
| `playcanvas` | 3D cần editor/hệ material đầy đủ | không có trong `RENDER_LIBS` của lint: thêm vào |

Không đoán dung lượng thư viện: thử trên nhánh nháp, `gamekit pack --portal dev-mock`, đọc `portals.dev-mock.initialBytes` trong `builds/<v>/manifest.json` (cùng cách tính với `release-check`: trang + `loader.js` + `framework.js` + css + `Icons/` + file ngôn ngữ lớn nhất) rồi so với `budget.initialLoadMB`. Thư viện nằm trong `framework.js` nên tính trọn vào tải đầu.

## 3. Vật lý (nằm trong `src/core/`)
- `none`: không có vật lý.
- `custom` (ưu tiên): game gốc tự tính chuyển động/va chạm, hoặc chỉ dùng engine vật lý cho việc đơn giản (AABB, raycast, trọng lực một trục). Viết lại đúng công thức gốc trong `core/`, số trong `params/`.
- Thư viện chỉ khi game gốc dùng engine tương đương **và** parity đạt được: Box2D (Cocos, Unity 2D Physics) → `planck` (bản port Box2D); `matter` có solver khác Box2D, chỉ khi kết quả vẫn trong `tolerance`; 3D (PhysX, Bullet) → `rapier`, hành vi sẽ khác. Kiểm trước bằng vài nghĩa vụ `oracle` (quỹ đạo, nảy, ma sát) trên nhánh nháp.
- Thư viện vật lý phải bước theo `dt` của fixed step, không dùng ngẫu nhiên hay đồng hồ riêng; replay test (`worldHash`) phải cho cùng kết quả mỗi lần chạy. Rapier có bản `-deterministic` và `-compat` (wasm nhúng trong JS, tăng `framework.js`).
- Không đạt parity: nghĩa vụ đó `blocked` + `D-n`, chờ người dùng duyệt (skill parity-check), không lặng lẽ chấp nhận sai khác.

## 4. Âm thanh (chỉ trong `src/view/`)
- WebAudio trực tiếp (không thêm dung lượng) hoặc `howler` (lint đã chặn `howler` trong `core/`).
- `core/` chỉ phát tín hiệu (sự kiện trong state), `view/` phát âm. Tắt tiếng theo `PauseBus`: `bus.subscribe(({ muted }) => …)` — ad, tab ẩn, menu và nút Sound của Settings đều đi qua đây.
- Lời thoại có chữ theo ngôn ngữ: URL lấy bằng `tAsset()`.

## 5. Bước thời gian
`runtime.fixedStepHz` = nhịp logic của game gốc (Unity `FixedUpdate` mặc định 50 Hz; game tính theo frame thì 30/60), có nguồn trong `notes/`. `src/main.ts` của template đặt `FIXED_HZ = 60` riêng: sửa cho khớp.

## 6. Ghi lại
1. `game.yaml`: `runtime: { kind: 2d|3d, renderer: <tên>, physics: none|custom|planck|matter|rapier…, fixedStepHz: <10–240> }` (`.gamekit/schemas/game.schema.json`).
2. `DECISIONS.md`: mục `## D-n Chọn runtime` — các phương án đã xét, `initialBytes` đo được so với ngân sách, rủi ro parity, sai khác game gốc (nếu có, chờ duyệt).
3. `npm install <thư viện>`; thêm tên gói renderer/âm thanh mới (vd `playcanvas`, `@pixi/*`) vào `RENDER_LIBS` trong `eslint.config.js` của game để `core/` không import được.
4. Thay renderer placeholder trong `src/view/`; `view/` chỉ đọc state. Chữ vẫn qua `t()` (lint bắt `fillText`, Pixi `Text`, Phaser `add.text` viết cứng).

## 7. Kết thúc
`npm run typecheck`, `npm run lint`, `npm test`, `gamekit validate` sạch; `gamekit pack --portal dev-mock` để xác nhận tải đầu trong ngân sách. Báo người dùng lựa chọn, con số đã đo và rủi ro parity; chỉ báo lệnh đã chạy. Tiếp: module-plan (game lớn) hoặc rebuild-game, cùng parity-check.
