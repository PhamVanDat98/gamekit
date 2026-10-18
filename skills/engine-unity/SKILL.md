---
name: engine-unity
description: Dùng khi game gốc làm bằng Unity, nhất là khi có source project (Assets/, ProjectSettings/) — ở P1 để quét project bằng `gamekit unity scan` và lấy số liệu đúng (giá trị inspector, không phải mặc định trong code), ở P2 khi chuyển từng script C# sang TypeScript theo spec/port-map.yaml. Liệt kê chỗ port hay sai (Random.Range, Mathf.Round, coroutine, FixedUpdate, toạ độ y-up, AnimationCurve, Animator, vật lý) và cách lấy oracle thật từ Unity Editor.
---

# Port game Unity sang web

## Vì sao có source rồi mà vẫn port sai
1. **Số trong code không phải số game chạy.** `public float speed = 5f;` nhưng prefab ghi 8, scene ghi đè 10. Unity dùng giá trị serialized (prefab, scene, ScriptableObject, override trong scene); giá trị trong code chỉ là mặc định lúc tạo component.
2. **Hàm cùng tên, khác nghĩa.** `Random.Range(0, 3)` không ra 3; `Mathf.Round(2.5)` = 2; `Mathf.Sign(0)` = 1; `(int)-1.5` = -1; `7 / 2` = 3 khi là int.
3. **Thứ tự và nhịp chạy.** Awake → OnEnable → Start; FixedUpdate chạy 50 Hz (không phải 60); coroutine chạy phần đầu ngay lập tức; `Destroy` chỉ xoá ở cuối frame; `Time.timeScale`.
4. **Toạ độ.** Unity: world unit, y hướng lên, góc độ ngược chiều kim đồng hồ, camera `orthographicSize`, sprite theo Pixels Per Unit + pivot. Canvas: pixel, y hướng xuống, radian xuôi chiều.
5. **Hành vi nằm ngoài code.** Transition và exit time của Animator, animation event, AnimationCurve, gravity / gravityScale / drag / collider, ma trận va chạm layer, `Input.GetAxis` làm mượt, CanvasScaler.
6. **Port cả game một lần theo cảm giác**, không đối chiếu từng script → sót cơ chế, không ai biết sót.

GameKit xử lý từng điểm: (1) `gamekit unity scan` đọc giá trị serialized; (2) `src/core/unity/` có sẵn ngữ nghĩa Unity; (3) `Scheduler`; (4) `src/view/unity-space.ts`; (5) REPORT.md liệt kê; (6) `spec/port-map.yaml` + cổng `{auto: port-map}`; và oracle ghi thẳng từ Unity để kiểm.

## P1: quét trước, đọc sau
1. `source.path` trong `game.yaml` trỏ tới **thư mục project** (có `Assets/`, `ProjectSettings/`). Chỉ có bản build (APK, WebGL, `_Data`): dùng skill **re-notes**. Bản IL2CPP: xuất project bằng AssetRipper rồi vẫn `gamekit unity scan` trên bản xuất để lấy giá trị inspector; logic lấy bằng Ghidra theo `re-notes/references/ghidra-headless.md`.
2. `gamekit unity scan` (hoặc `--src <thư mục>`). Ra:
   - `notes/unity/REPORT.md` — settings, scene, camera/CanvasScaler, **Inspector ghi đè**, script và bẫy từng dòng, Animator, animation event, PPU, input axes.
   - `notes/unity/params-draft.json` — giá trị serialized ở dạng params, `source` = `file › object › Class.field`.
   - `notes/unity/data/*.json` — đầy đủ: mọi component, PrefabInstance và override, sprite rect/pivot, clip.
   - `spec/port-map.yaml` — mỗi script một dòng `todo` (Editor, thư viện: `skip` sẵn).
   Scan báo "dạng nhị phân" → trong Unity: Project Settings › Editor › Asset Serialization = **Force Text**, rồi quét lại. Quét lại bất cứ khi nào project Unity đổi (giữ nguyên status/target/note đã điền).
3. Đọc **hết** REPORT.md. Chỗ chưa rõ → `notes/QUESTIONS.md`.
4. **Params từ params-draft.json**, không từ code. Chép mục cần dùng sang `params/*.json`, điền `unit` (world unit, s, độ, unit/s…), giữ `source` và `confidence: observed`. Một class có nhiều bản (`PlayerController@…`) nghĩa là mỗi prefab/scene một giá trị khác — giữ đủ, đừng chọn đại một.
5. AnimationCurve: chép nguyên object `{ m_Curve, m_PreInfinity, m_PostInfinity }` làm `value`; core gọi `evaluateCurve`.
6. `spec/gameplay-spec.md` + `spec/obligations.yaml`: mỗi script gameplay ít nhất một nghĩa vụ (skill **parity-check**). Animation event và transition có điều kiện cũng là hành vi.
7. Oracle `observed` từ Unity (mục dưới) cho các cơ chế có số liệu: di chuyển, nhảy, sinh quái, điểm.

## P2: chuyển từng script
**Nhịp mô phỏng.** REPORT ghi Fixed Timestep. Game dùng Rigidbody/FixedUpdate: đặt `runtime.fixedStepHz` = nhịp đó (thường 50) và chạy cả logic Update trong bước cố định; ghi `D-n` nếu cảm nhận khác. Game chỉ dùng Update + `Time.deltaTime`: để 60.

**Đơn vị.** `core/` giữ toạ độ và đơn vị Unity (y lên, world unit, độ) để số khớp params. Chỉ `view/` đổi sang pixel qua `createSpace(camera, w, h)`; cỡ sprite = pixel texture / PPU.

**Lifecycle → core**
| Unity | Trong core |
| --- | --- |
| Awake, OnEnable, Start | `createWorld`: Awake của mọi object trước, rồi mới Start |
| FixedUpdate (+ vật lý, OnTrigger/OnCollision) | đầu `stepWorld`; callback va chạm chạy sau bước vật lý |
| Update | sau FixedUpdate, sau khi đọc input của bước |
| coroutine, Invoke, InvokeRepeating | `Scheduler.update(dt)` ngay sau phần Update |
| LateUpdate | cuối `stepWorld` (camera follow) |
| Destroy | đánh dấu; xoá ở cuối bước |
| Instantiate(prefab) | hàm tạo đọc params của prefab đó |
| biến `static`, DontDestroyOnLoad | nằm trong state; reset khi chơi lại |
| SceneManager.LoadScene | state máy màn chơi trong core; thứ tự theo "Scene trong build" |
| PlayerPrefs | `platform.save` (giữ khoá và giá trị mặc định) |
| Script Execution Order, `[DefaultExecutionOrder]` | thứ tự gọi trong `stepWorld` — kiểm `ProjectSettings` và attribute |

**Ngữ nghĩa Unity có sẵn** (`src/core/unity/`, có test): `Mathf.round/sign/toInt/intDiv/repeat/pingPong/deltaAngle/moveTowards/smoothDamp/approximately/f32`, `UnityRandom.rangeInt/rangeFloat` (trên `Rng` có seed), `evaluateCurve`, `Scheduler` (`start(function*…)`, `wait(s)`, `until(fn)`, `after`, `every`). Dùng chúng thay vì `Math.*`; đừng viết lại.

**Vòng làm một script**
1. `spec/port-map.yaml`: đặt `status: doing`.
2. Đọc script + mục của nó trong REPORT (cột Bẫy chỉ dòng) + `references/pitfalls.md` cho từng bẫy.
3. Viết test trước, giá trị kỳ vọng từ params/oracle, gắn thẻ `[id:case]`.
4. Port vào `core/` (logic) hoặc `view/` (hiển thị). Dịch theo hành vi, giữ đúng thứ tự phép tính và kiểu (int vs float).
5. `status: done`, `target: [src/core/…]` (file thật). Không port: `status: skip` + `note` lý do (hiệu ứng thuần hình ảnh đã thay bằng CSS…).

**Vật lý.** Chỉ đặt `velocity` + trigger: tự viết trong core, cộng `gravity × gravityScale` mỗi bước, tích phân giống Box2D (`v += g·dt; x += v·dt`, damping `v *= 1 / (1 + dt·drag)`). Va chạm, bật nảy, joint thật sự: dùng `planck.js` (Box2D bản JS — cùng engine với Physics2D của Unity) trong core, cùng gravity, gravityScale, linearDamping = drag, mass, 8/3 iterations, bước = Fixed Timestep. Ghi lựa chọn vào DECISIONS.md.

**Animator.** Mỗi controller trong REPORT: tham số, state, transition (điều kiện, exit time, duration). Chuyển thành state machine nhỏ trong `view/` (hoặc `core/` nếu state ảnh hưởng gameplay — ví dụ chỉ được nhảy khi ở Idle/Run). Animation event gọi hàm gameplay → đưa vào core theo thời điểm trong clip.

**Tween (DOTween, LeanTween).** Giữ duration, delay, ease, loop. DOTween mặc định `Ease.OutQuad`; `SetLoops(-1, LoopType.Yoyo)`. Tween ảnh hưởng gameplay (vị trí va chạm) → core; thuần hình ảnh → view.

## Oracle từ Unity: cách chắc nhất để hết sai
Có source thì chạy được trong Editor — ghi trạng thái thật thay vì đoán.
1. Chép [references/GameKitRecorder.cs](references/GameKitRecorder.cs) vào `Assets/` **của project Unity** (không vào repo web).
2. Thêm component vào một GameObject trong scene: `oracleName`, `tracks` (Transform + field cần ghi, vd `PlayerController.speed`, `Rigidbody2D.velocity`), `everyNSteps`, `maxSteps`, `keys` (phím ghi lại để phát lại trên web).
3. Play, thao tác (hoặc không chạm để có kịch bản tất định) → `gamekit-oracle-<tên>.json` cạnh `Assets/`, đúng định dạng `spec/oracles/`.
4. Chép vào `spec/oracles/`, điền `tolerance`, test `it.each(oracle.cases)`: chạy core đủ `in.step` bước với cùng input, so `out`.
Ngẫu nhiên: chuỗi `Random` của Unity khác `Rng` của web — ghi kịch bản không ngẫu nhiên, hoặc chỉ so phần không phụ thuộc ngẫu nhiên; phần ngẫu nhiên kiểm bằng biên và phân bố.

## Trước cổng P2
- `gamekit gate`: `{auto: port-map}` đòi mọi script `done` (target tồn tại) hoặc `skip` (có note).
- Chạy thử web cạnh bản Unity: cùng màn, cùng thao tác; ghi khác biệt vào QUESTIONS.md hoặc sửa. Báo người dùng những gì **chưa** đối chiếu.
