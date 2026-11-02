---
name: physics-assess
description: Dùng cuối P1, trước khi chọn runtime, để đánh giá game gốc phụ thuộc engine vật lý tới đâu (Unity 2D dùng Box2D, Unity 3D dùng PhysX, không có bản web tương đương 1-1) và đề xuất thư viện vật lý — kiểm kê cách dùng, chấm mức ảnh hưởng từng cơ chế, chọn thư viện, chạy thử cơ chế rủi ro, ghi spec/physics-assessment.yaml. Cũng dùng khi gate P1 báo mục vật lý đỏ, hoặc khi bản web bị lệch cảm giác vật lý so với game gốc.
---

# Đánh giá ảnh hưởng của engine vật lý (P1)

Không engine web nào cho kết quả trùng số với Unity: solver, cách tính drag và ma sát, thứ tự callback đều khác. Vì vậy GameKit không ánh xạ engine sang engine, mà ánh xạ **từng hành vi** và đo độ lệch so với game gốc. Bước này bắt buộc với mọi game, nhưng rút gọn được: game không dùng vật lý chỉ cần kiểm kê rồi khai `library: none`, không phải chạy thử.

Kết quả là `spec/physics-assessment.yaml`. Cổng P1 chấm bằng `{auto: physics}`, và người dùng tự duyệt mục `(bạn)`.

## 1. Kiểm kê
Ghi lại đã xem những gì vào `scope`. Tìm không thấy chỉ có nghĩa là không thấy trong phạm vi đó.

| Nguồn | Tìm gì |
| --- | --- |
| Code | `AddForce`, `AddTorque`, gán `velocity`, `Physics*.Raycast`/`Overlap*`, `OnCollision*`, `OnTrigger*`, `CharacterController`, `WheelCollider`, `*Joint*`, `Cloth` |
| Scene, prefab | Số Rigidbody dạng dynamic/kinematic/static, loại collider, vật liệu vật lý |
| Thiết lập Unity | `TimeManager.asset` (fixed timestep), `DynamicsManager.asset` hoặc `Physics2DSettings.asset` (trọng lực, số vòng lặp solver, ma trận layer) |

Số liệu vật lý đưa vào `params/` kèm `source`. Engine khác Unity: tra tương đương theo skill **re-notes**.

Game `third-party`: chỉ dùng file tĩnh và video. Chạy game gốc để ghi dữ liệu chỉ khi người dùng đồng ý và ghi thành `D-n`.

## 2. Chấm từng cơ chế
Mỗi hành vi người chơi cảm nhận được là một cơ chế, chia giống nghĩa vụ parity vì từ P2 chúng dùng chung `id`.

- `solver`: `false` nếu chỉ gán vận tốc, raycast/overlap, trigger. Nhiều game Unity dùng Rigidbody chỉ để di chuyển và bắt va chạm, nên phần lớn cơ chế có thể rơi vào đây.
- `outcome`: `decisive` (quyết định thắng/thua, điểm số) · `feel` (chỉ ảnh hưởng cảm giác) · `cosmetic` (chỉ để trang trí).
- `sensitivity`: `high` nếu lệch một chút thì kết quả đổi hẳn (level căn đúng quỹ đạo, puzzle, xếp chồng), ngược lại `low`.
- `impact`: tra bảng dưới, `validate` đối chiếu.

| `sensitivity` | `decisive` | `feel` | `cosmetic` |
| --- | --- | --- | --- |
| `high` | high | medium | low |
| `low` | medium | low | low |

- `fidelity`: cách chứng minh giống bản gốc.

| Mức | Dấu hiệu | Cách port | Chứng minh |
| --- | --- | --- | --- |
| `exact` | Không phụ thuộc solver | Viết lại công thức trong `core/` | Oracle sai số rất nhỏ |
| `calibrated` | Lực, xung lực, bật nảy, joint đơn giản | Dùng thư viện rồi tinh chỉnh | Quỹ đạo trong ngưỡng, có bộ chấm riêng |
| `emergent` | Xếp chồng, ragdoll, phá huỷ, nhiều vật va chạm | Chấp nhận không trùng từng khung hình | Chỉ số thống kê qua nhiều lần chạy |

## 3. Đề xuất thư viện
Áp dụng từ trên xuống, dừng ở dòng đầu tiên khớp:

| Tình huống | Đề xuất |
| --- | --- |
| Không có cơ chế phụ thuộc solver | `none`, viết trong `core/` |
| Vật lý chỉ để trang trí | `none`, hiệu ứng đơn giản trong `view/`, không ảnh hưởng `core/` |
| Cần tất định nghiêm ngặt giữa các thiết bị (replay, ghost, kiểm tra điểm) | `@dimforge/rapier2d-deterministic-compat` hoặc `@dimforge/rapier3d-deterministic-compat` |
| 2D có vật thể dynamic | `planck` |
| 3D có vật thể dynamic | `@dimforge/rapier3d-compat` |
| 3D phụ thuộc hành vi riêng của PhysX (`CharacterController`, `WheelCollider`…) | `physx-js-webidl`, xem kỹ dung lượng |
| Công thức gốc đơn giản, thư viện làm lệch hoặc quá nặng | `custom` |

Không đề xuất `box2d-wasm` (bản cuối 11/2021) và `cannon-es` (bản cuối 8/2022) vì đã lâu không cập nhật; `matter-js` có solver khác họ Box2D. `box2d3-wasm` và `jolt-physics` chỉ cân nhắc khi có lý do rõ.

Các đề xuất trên tra ngày 2026-11-02 và chưa được đo trên game thật. Chạy `npm view <gói> version time.modified` để kiểm tra lại. Cùng họ Box2D hay PhysX cũng không đảm bảo trùng hành vi; phiên bản Box2D phụ thuộc `source.engineVersion` của game, nên cần xác nhận cho từng game.

## 4. Chạy thử
Bắt buộc khi có cơ chế `impact: high` và `solver: true`. Chọn 1–2 cơ chế rủi ro nhất làm đại diện (`validate` yêu cầu ít nhất một), thử trên tối đa 2 thư viện, ghi vào `spec/spikes/physics.md`:

1. Dựng cảnh tối thiểu: chỉ cơ chế đó, không đồ hoạ.
2. So với oracle quỹ đạo từ game gốc (skill **parity-check**). Oracle đo từ video là `inferred`: ghi `confidence` đúng như vậy và nói rõ trong báo cáo.
3. Đo dung lượng thư viện trong bản build sau gzip (`gzipKB`) và thời gian một bước trên điện thoại tầm trung (`stepMs`, `device`). Dung lượng hiển thị trên npm không phải dung lượng người chơi tải.

**Không thư viện nào đạt ngưỡng:** dừng và hỏi người dùng chọn nới ngưỡng, tự viết solver cho cơ chế đó, hay đổi phạm vi port. Không tự nới ngưỡng để qua cổng. Ghi `passed: false` đúng thực tế; `validate` sẽ chặn cho tới khi có quyết định.

## 5. Ghi kết quả
```yaml
original:
  kind: 2d
  fixedStepHz: 50
  source: ProjectSettings/TimeManager.asset
scope: Assembly-CSharp, 12 scene, 30 prefab, ProjectSettings
mechanics:
  - id: ball.bounce
    title: Bóng bật khỏi tường, mất dần vận tốc
    usage: [AddForce, OnCollisionEnter2D, PhysicsMaterial2D]
    solver: true
    outcome: decisive
    sensitivity: high
    impact: high
    fidelity: calibrated
    source: notes/ball.md
recommendation:
  library: planck
  rationale: 2D, có bóng dynamic, không cần tất định giữa thiết bị
  alternatives: ['@dimforge/rapier2d-deterministic-compat']
  decision: D-3
  spike:
    mechanics: [ball.bounce]
    result: spec/spikes/physics.md
    confidence: observed
    candidates:
      - { library: planck, passed: true, deviation: 'lệch tối đa 0.04 m sau 120 tick', gzipKB: 60, stepMs: 0.8, device: Android tầm trung }
```

Các số trong ví dụ chỉ để minh hoạ. Game không dùng vật lý:

```yaml
original: { kind: 2d, fixedStepHz: null, source: 'Không có Rigidbody; ProjectSettings/TimeManager.asset không được dùng' }
scope: Assembly-CSharp, toàn bộ scene và prefab, tìm Rigidbody, AddForce, OnCollision
mechanics: []
recommendation: { library: none, rationale: Không tìm thấy cơ chế dùng vật lý trong phạm vi đã kiểm kê }
```

Sau đó:
- Đặt `runtime.physics` trong `game.yaml` bằng `recommendation.library`, và `runtime.kind` theo `original.kind`.
- Đặt tần số bước bản web: `sim.fixedStepHz` trong `params/game.json` (giá trị game thật sự chạy) và `runtime.fixedStepHz` trong `game.yaml`. Giữ tần số khác game gốc thì phải ghi `original.fixedStepDecision`.
- Ghi lựa chọn vào `DECISIONS.md` (trừ `none`).
- Chạy `gamekit validate`, `gamekit gate`, rồi hỏi người dùng duyệt mục `(bạn)`. Không tự tick.

## 6. Bẫy khi port
Skill **rebuild-game** xử lý các điểm này ở P2. Ghi sẵn vào ghi chú nếu game gốc có dính:

- **Bước mô phỏng:** Unity mặc định 50 Hz, template mặc định 60 Hz. Lệch chỗ này thì mọi quỹ đạo đều lệch.
- **Đơn vị:** `core/` giữ đơn vị Unity (mét), `view/` đổi sang pixel. Box2D hoạt động kém nếu đưa pixel vào trực tiếp.
- **Hệ trục 3D:** Unity dùng hệ tay trái, Y hướng lên; Three.js dùng hệ tay phải. Đổi trục và quaternion ở một chỗ duy nhất.
- **Thứ tự trong một bước:** giữ đúng `FixedUpdate → physics step → OnCollision/OnTrigger`, nếu không logic có thể lệch một tick.
- **Công thức khác nhau:** drag, cách kết hợp ma sát và độ nảy, ngưỡng nảy, ngưỡng ngủ. Đo bằng cảnh hiệu chuẩn, không chép tham số 1-1.
