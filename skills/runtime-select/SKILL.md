---
name: runtime-select
description: Dùng ở đầu P2, trước khi viết view/ và core/, để chọn runtime web cho bản dựng lại — canvas 2D thuần, Pixi, Phaser, Three.js, Babylon và thư viện vật lý (none, custom, planck, matter, rapier) — theo số sprite, hiệu ứng, 3D, vật lý của game gốc, kích thước bundle và yêu cầu deterministic. Cũng dùng khi đổi runtime giữa chừng.
---

# Chọn runtime (P2)

Runtime quyết định hai thứ khó đổi về sau: kích thước tải đầu và cách giữ `core/` deterministic. Chọn một lần, ghi lý do, thử ngay trên trình duyệt.

## 1. Đọc trước
- `spec/recon.json` (engine gốc, 2D/3D), `spec/gameplay-spec.md`, `notes/ui/`, `spec/asset-inventory.json` (số sprite, sprite sheet, Spine, model 3D).
- `budget` trong `game.yaml`: `initialLoadMB`, `minFpsMobile`.

## 2. Render (chỉ nằm trong `src/view/`)
| Lựa chọn | Hợp khi | Bundle (min+gzip, xấp xỉ) |
| --- | --- | --- |
| Canvas 2D thuần (template sẵn) | Ít sprite (vài trăm), hình khối, puzzle, UI đơn giản | 0 |
| Pixi | Nhiều sprite, particle, filter, atlas, Spine (pixi-spine); cần WebGL batching | ~100–150 KB |
| Phaser | Cần sẵn scene, tilemap (Tiled), tween, camera, input, arcade physics | ~300 KB+ |
| Three.js | 3D, model glTF | ~150 KB+ |
| Babylon | 3D nặng, cần editor/inspector, vật lý tích hợp | ~500 KB+ |

Ưu tiên cái nhỏ nhất đủ dùng. `framework.js` (code game + thư viện) nằm trong **tải đầu**, nên thư viện to ăn trực tiếp vào `budget.initialLoadMB` và thời gian vào game trên máy yếu (skill **perf-budget**).

## 3. Vật lý (logic, nằm trong `src/core/`)
| Game gốc | Chọn |
| --- | --- |
| Tự viết di chuyển/va chạm (AABB, lưới, tốc độ cố định) | `custom`: viết lại đúng công thức gốc |
| Box2D: Unity 2D (Rigidbody2D), Cocos (Box2D/Chipmunk), LibGDX | `planck` (cổng JS của Box2D): tái hiện sát nhất, deterministic với fixed step |
| Không cần khớp từng va chạm, chỉ cần cảm giác | `matter` |
| 3D, PhysX (Unity 3D), Bullet | `rapier` (wasm, có chế độ deterministic); ghi rõ sai khác với PhysX |
| Không có vật lý | `none` |

**Tái hiện đúng công thức gốc quan trọng hơn dùng engine vật lý xịn.** Đổi sang engine khác làm hành vi lệch: ghi `D-n` trong `DECISIONS.md` và để parity bắt (skill **parity-check**).

## 4. Deterministic
- `core/` không import thư viện render; lint chặn. Thư viện vật lý được phép trong `core/` chỉ khi chạy bằng bước cố định (`fixedStepHz`) và không đọc thời gian thật hay `Math.random`.
- Replay test (`tests/replay/`) phải còn xanh: cùng seed + input → cùng `worldHash`. Vật lý wasm: kiểm tra replay trên cả Node (vitest) lẫn trình duyệt.
- Thư viện render chỉ đọc state để vẽ, không giữ state gameplay riêng (vị trí "thật" nằm trong `core/`).

## 5. Ghi lại
- `game.yaml` → `runtime`: `kind` (2d/3d), `renderer` (canvas, pixi, phaser, three…), `physics` (none, custom, planck, matter, rapier…), `fixedStepHz` (bằng tần số bước của game gốc nếu đo được, vd Unity `Time.fixedDeltaTime` 0.02 → 50).
- `DECISIONS.md`: mục `D-n` với lựa chọn, phương án bị loại, lý do (số sprite, bundle, vật lý gốc).

## 6. Thử khung ngay
Dựng khung tối thiểu với runtime mới (một sprite chuyển động, input), rồi:
1. `npm test`, `npm run typecheck`, `npm run lint`.
2. `gamekit smoke --quick`: mở bản dev-mock trong trình duyệt headless trên desktop. Mở `.gamekit/smoke/desktop.png` để xem thật sự có hình.
3. Bundle quá to hay FPS thấp từ khung: chọn lại bây giờ, trước khi viết view thật.

Sau đó quay lại **rebuild-game** để viết logic theo TDD.
