# Bẫy khi chuyển C# Unity sang JS/TS

Mã (`id`) khớp cột "Bẫy" trong `notes/unity/REPORT.md` và `pitfalls` trong `spec/port-map.yaml`.

| id | Unity làm gì | Dịch thẳng sang JS sẽ sai thế nào | Port đúng |
| --- | --- | --- | --- |
| random-range | `Random.Range(int a, int b)` trả về a..b-1; `Random.Range(float a, float b)` trả về a..b (có b) | `Math.floor(Math.random() * (b - a + 1)) + a` ra cả b → thêm một làn, một loại quái | `UnityRandom.rangeInt(rng, a, b)` / `rangeFloat`; xem kiểu tham số (có `f` hay biến float không) |
| round | `Mathf.Round(2.5)` = 2, `(3.5)` = 4 (về số chẵn) | `Math.round(2.5)` = 3 → lệch ô lưới, điểm | `Mathf.round` |
| sign | `Mathf.Sign(0)` = 1 | `Math.sign(0)` = 0 → đứng yên khi lẽ ra hướng phải | `Mathf.sign` |
| int-cast | `(int)-1.7` = -1 (cắt về 0) | `Math.floor(-1.7)` = -2 | `Mathf.toInt` (= `Math.trunc`) |
| int-math | `int a = 7 / 2` = 3; `%` giữ dấu số bị chia (giống JS) | `7 / 2` = 3.5 | `Mathf.intDiv(a, b)`; xem kiểu của từng biến, kể cả `int` ẩn trong `var` |
| coroutine | `StartCoroutine` chạy ngay tới `yield` đầu; `yield return null` = frame sau; `WaitForSeconds` theo `timeScale`, tiếp tục ở frame đầu tiên đã đủ thời gian | `setTimeout` (đồng hồ thật, không pause, phá replay), hoặc chờ trước khi chạy phần đầu | `Scheduler.start(function* () { …; yield wait(s); … })` |
| invoke | `Invoke("F", t)`, `InvokeRepeating("F", t, r)` theo thời gian game | `setInterval` | `scheduler.after(t, f)`, `scheduler.every(r, f, t)` |
| timescale | `Time.timeScale = 0` dừng `deltaTime`, `FixedUpdate`, `WaitForSeconds`; không dừng `unscaledDeltaTime`, `WaitForSecondsRealtime` | pause bằng cờ riêng nhưng timer vẫn chạy | nhân dt gameplay với timeScale trong state; UI dùng dt riêng |
| unscaled | thời gian không theo timeScale | gộp chung với dt gameplay | tách hai dòng thời gian |
| deltatime | `Time.deltaTime` trong `Update` = dt frame; trong `FixedUpdate` = `fixedDeltaTime` | dùng 1/60 cố định khi game gốc chạy FixedUpdate 50 Hz → nhanh hơn 20% | `runtime.fixedStepHz` = Fixed Timestep trong REPORT |
| physics2d | Box2D: `velocity` đơn vị/s; mỗi bước `v += gravity·gravityScale·dt`, damping theo `drag`; `AddForce(Impulse)` = `Δv = F / mass`; `ForceMode2D.Force` nhân dt | quên gravityScale, mass, drag; đặt gravity theo px | đọc Rigidbody2D trong `data/serialized.json`; tự viết (chuyển động đơn giản) hoặc planck.js |
| physics3d | PhysX | — | Three.js + cannon-es/rapier; ghi D-n |
| collision | `OnTriggerEnter2D` gọi sau bước vật lý, một lần khi bắt đầu chạm; chỉ khi một bên có Rigidbody2D; theo ma trận layer | kiểm tra chồng lấn mỗi frame → gọi lặp mỗi frame | lưu cặp đang chạm, chỉ phát sự kiện khi cặp mới xuất hiện; lọc theo layer |
| destroy | `Destroy(go)` xoá ở cuối frame; `Destroy(go, t)` sau t giây | xoá ngay giữa vòng lặp → bỏ qua phần tử, lỗi chỉ số | đánh dấu `dead`, dọn cuối bước |
| animator | state machine trong `.controller`: transition theo tham số, `exit time` (tỉ lệ clip), `duration` | đổi hình ngay khi đổi trạng thái | state machine nhỏ đọc bảng trong REPORT |
| tween | DOTween: `Ease.OutQuad` mặc định, `SetDelay`, `SetLoops`, `OnComplete` | tuyến tính, quên delay | hàm ease chuẩn (Penner), cùng duration/ease |
| curve | AnimationCurve Hermite theo tangent; ngoài khoảng theo PreInfinity/PostInfinity | nội suy tuyến tính giữa các key | `evaluateCurve(params.x.curve, t)` |
| rotation | góc độ, dương = ngược chiều kim đồng hồ; `transform.up` theo góc; `Quaternion.Euler(0,0,z)` | đưa thẳng vào `ctx.rotate` (radian, xuôi chiều) | giữ độ trong core; view dùng `space.rotation(z)` |
| screen-space | `Camera.main.ScreenToWorldPoint`, `orthographicSize`, `Screen.width` | dùng px canvas trong core | core theo world unit; view `createSpace(...).toWorld()` cho input chạm |
| input-axis | `GetAxis` tăng dần theo `sensitivity`, về 0 theo `gravity`, `snap` | đặt ngay -1/0/1 | mô phỏng: `v = moveTowards(v, target, sensitivity·dt)` (về 0 theo gravity; snap: đổi hướng thì về 0 trước) |
| input | `GetKeyDown` đúng một frame; `GetKey` khi giữ; `GetMouseButtonDown`; touch | đọc trạng thái giữ cho mọi thứ → nhảy liên tục | phân biệt pressed/held/released trong `InputFrame` |
| playerprefs | khoá/giá trị kiểu int/float/string, mặc định khi chưa có | localStorage trong core | `platform.save`, giữ khoá và mặc định |
| scene-load | thứ tự scene, object `DontDestroyOnLoad` sống qua scene, static giữ giá trị | reset hết hoặc giữ hết | state màn trong core; liệt kê thứ gì sống qua màn |
| find | `GameObject.Find`, `FindWithTag` theo tên/tag (chậm, phụ thuộc thứ tự) | — | tham chiếu rõ trong state |
| static-state | biến static sống qua cả lần chơi lại | quên reset → lần chơi thứ hai sai | đưa vào world state |

## Ngoài code
- **Float 32-bit.** `float` của C# là 32-bit. Phép cộng dồn nhiều lần (bộ đếm thời gian, vị trí) có thể lệch nhỏ so với JS (64-bit). Thường không cảm nhận được; khi oracle lệch ở chữ số cuối, dùng `Mathf.f32` ở chỗ cộng dồn hoặc đặt `tolerance`.
- **Script Execution Order.** `ProjectSettings/ScriptExecutionOrder` hoặc `[DefaultExecutionOrder(n)]` quyết định ai Update trước. Không có thì thứ tự không xác định — nếu kết quả phụ thuộc thứ tự, ghi câu hỏi và đối chiếu với oracle.
- **Prefab override.** Một prefab dùng ở nhiều scene với giá trị khác nhau (bảng "Inspector ghi đè"). Mỗi màn đọc đúng giá trị của màn đó.
- **Object tắt sẵn** (`active: false` trong serialized.json) chỉ bật lên bằng code/animation — đừng vẽ ngay từ đầu.
- **Sorting.** Thứ tự vẽ: sorting layer (thứ tự trong REPORT) → order in layer → (cùng thứ tự) z/khoảng cách camera.
- **UI.** CanvasScaler `Scale With Screen Size`: reference resolution + match width/height. Anchor/pivot của RectTransform quyết định chỗ bám khi đổi tỉ lệ màn hình web.
- **Âm thanh.** AudioSource `volume`, `pitch`, `loop`, `playOnAwake` trong serialized.json.
