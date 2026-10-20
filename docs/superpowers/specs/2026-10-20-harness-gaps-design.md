# Lấp chỗ trống của harness GameKit (0.3.0)

## Vấn đề
Bản 0.2.0 kiểm chứng tự động được logic (`core/`, parity) và gói build (`release-check`), nhưng:
1. AI không nhìn thấy game chạy: mọi kiểm tra bố cục, smoke, quảng cáo, Settings là việc tay.
2. Oracle parity do AI/người trích tay; không có công cụ lấy số từ chính game gốc.
3. Hiệu năng chỉ đo dung lượng tải đầu.
4. Không có skill cho P0, P1 (trừ re-notes), P3, P5 QA/perf.
5. Không có công cụ đưa asset Unity sang web.
6. Không CI; không cách đo chính harness khi sửa skill.

## Thiết kế

### `gamekit smoke` (1, 3)
- Đối tượng: bản dev-mock dựng từ source (`buildPortal` tách ra từ `pack`, ghi vào `.gamekit/smoke/build`, số build `YYMMDD00` không đụng số của pack) hoặc gói đã pack (`--version`). Server tĩnh nội bộ trên 127.0.0.1.
- Trình duyệt: `playwright-core` nằm trong devDependencies của game (plugin vẫn chỉ phụ thuộc `yaml`, `ajv`). Thứ tự: `GK_BROWSER` → chromium của playwright → chromium bất kỳ trong cache playwright → Chrome → Edge. Không bắt buộc tải trình duyệt.
- Đo trong trang bằng init script: bọc `GM_LOADER.ready()` để lấy thời gian vào game, đếm rAF để lấy FPS. Sự kiện platform đọc từ log `[dev-mock]`.
- Kịch bản cố định (`SCENARIOS`), chơi bằng PRNG có seed theo `smoke.start/keys/playSec` trong `game.yaml`. Kịch bản ad chạy song song và chơi lâu hơn (quảng cáo chỉ có giữa các vòng). Máy yếu = cấu hình mobile của Lighthouse (CPU 4×, 1.6 Mbps, 150 ms).
- Chấm (`judge`, hàm thuần, test không cần trình duyệt): lỗi console/JS/tải, loading không tắt, cuộn trang, canvas tràn, màn một màu (giải mã PNG không phụ thuộc thư viện), hình không đổi qua 3 ảnh, thiếu `loadingEnd`/`gameplayStart` (cảnh báo trước P4, lỗi từ P4), footer Settings, đổi ngôn ngữ; perf: FPS < 90% ngân sách (rAF headless tối đa ~60), thời gian vào game trên máy yếu.
- Chromium báo `ERR_ABORTED` cho `framework.js` đọc bằng stream dù đã nhận đủ 200: chỉ bỏ qua đúng trường hợp có response OK.
- Cổng: `{auto: smoke}` (P3, P4, P5), `{auto: perf}` (P5); gate chạy smoke một lần bằng tiến trình con (`smoke --json`) cho cả hai mục. P3/P4 chạy bộ `basic` (desktop, mobile dọc/ngang, ad lỗi), P5 hoặc cổng có `{auto: perf}` chạy `full`. Chỉ kịch bản đo FPS/thời gian vào game (`desktop`, `weak-phone`) chạy riêng; còn lại song song.

### Bằng chứng từ game gốc (2, 5)
- `recon`: đọc tĩnh thư mục hoặc archive (zip reader riêng, mở cả APK con trong XAPK), luật nhận diện theo file đặc trưng, phiên bản từ vài KB đầu của file. Bỏ thư mục cache (`Library/`, `node_modules/`…).
- `oracle import`: trace → case. Không suy luận gì: chỉ chọn dòng (`--at` gần nhất, `--every`, trải đều `--max` giữ hai đầu), bắt buộc `--source`, kiểm schema oracle.
- Ghi trace: `GkTraceRecorder.cs` (reflection theo đường dẫn, C# 7 để chạy trên Unity cũ), `gk-trace.js` (getter tuỳ ý, tải JSONL). Chỉ dùng với game `own`; `third-party` cần người dùng đồng ý + `D-n`.
- `assets`: `scan` (+ `.meta` Unity), `unity-atlas` (TexturePacker hash, lật y, pivot → anchor, border → borders), `convert` (ffmpeg nếu có; `--label` gắn provenance qua `addProvenance` dùng chung).

### Skill (4)
game-recon, triage, engine-unity, gameplay-spec, asset-inventory, ui-extract, runtime-select, web-relayout, perf-budget, qa-smoke. `engine-<engine>` trong `phases.mjs` phủ mọi `engine-*`.

### Đo harness (6)
- CI plugin: test 3 OS × Node 20/22; job đầu-cuối `GK_E2E=1` (game thật, npm install, smoke, làm hỏng bố cục và gây crash phải đỏ, gate P3, pack + `smoke --version`).
- CI game (template): validate, test, typecheck, lint, parity từ P3, smoke, upload ảnh.
- `evals/` (`claude plugin eval`): recon đúng engine/phiên bản; không tự tick "(bạn)" hay tự sang pha; không kích hoạt skill GameKit cho yêu cầu không liên quan. Không đưa vào CI vì cần credential và tốn usage.

## Ngoài phạm vi
Skill engine khác Unity, reskin `third-party` (style-*, asset-spec), store assets, đo âm thanh và cảm giác điều khiển (vẫn là playtest của người dùng).
