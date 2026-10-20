---
name: replace-audio
description: Dùng ở pha P3 khi làm lại game người khác (third-party) để thay toàn bộ hiệu ứng âm thanh, nhạc và lời thoại — lấy từ thư viện có license hoặc công cụ tạo âm thanh khác rồi gamekit gen import, lời thoại bằng gamekit gen voice (mỗi ngôn ngữ một file); chọn định dạng, cân âm lượng, gắn nhãn provenance.
---

# Thay âm thanh (P3)

Đầu vào: các mục `kind: audio` trong `asset-manifest.json` (skill asset-spec), mỗi mục một `brief` mô tả âm thanh mới (độ dài, cảm giác, lúc nào phát). Đầu ra: file trong `assets/` đúng `path`, có nhãn, người dùng đã nghe duyệt.

**Game của ai.** `third-party`: mọi âm thanh phải mới; file gốc chỉ nằm trong `reference/` (gitignored), dùng để đo độ dài, nhịp, lúc phát — không chỉnh sửa file gốc rồi dùng lại. Brief không viết "giống tiếng X của game gốc". `own` (mặc định): giữ âm thanh gốc (nhãn `own`); skill này chỉ dùng phần định dạng và âm lượng ở bước 4.

## 1. Nguồn cho từng loại
| Loại | Nguồn | Đưa vào |
| --- | --- | --- |
| Hiệu ứng (SFX), nhạc | OpenAI không có model SFX/nhạc. Thư viện có license, hoặc công cụ tạo âm thanh khác do người dùng chọn | `gen import` |
| Lời thoại | `gamekit gen voice` (OpenAI speech) hoặc người lồng tiếng | `gen voice` / `gen import --lang` |

Thư viện/công cụ: đọc điều khoản — được dùng thương mại trong game web, có cần ghi tên tác giả không. Không rõ thì hỏi người dùng, không đoán.

## 2. Đưa file vào
- `gamekit gen import <id> <file> [--lang <mã>] --label licensed --license "<loại license, URL>" --source "<thư viện, tác giả, mã file>"`. Đuôi file phải giống đuôi `path` trong manifest (đổi định dạng trước khi import).
- Từ công cụ tạo âm thanh: `--label generated --source "<công cụ, prompt>"`. Người dùng tự làm/thuê làm: `--label own`.
- `licensed` mà thiếu `license` thì `validate` báo lỗi. Ghi công tác giả nếu license yêu cầu (vào màn credits qua `t()`, hoặc mô tả store).

## 3. Lời thoại
1. Manifest: `kind: audio`, `voice: true`, `textKey` (câu thoại trong `Language/en.json`), `path` trong `assets/i18n/en/`. Code lấy URL bằng `tAsset()`; người chơi chỉ tải file của ngôn ngữ mình.
2. Chốt text trước (skill rename-and-text): mỗi file đọc đúng chuỗi trong `Language/<mã>.json`. Ở P3 sinh bản `en` (`--lang en`); các ngôn ngữ khác sinh sau khi có bản dịch (skill add-i18n, P4).
3. `gen voice --dry-run` liệt kê câu sẽ đọc. `gen voice [--id a,b] [--lang vi] [--voice <tên>]`: giọng lấy từ `--voice`, rồi `style.audio.voice` trong `style/style.json`, mặc định `alloy`; cách đọc lấy từ `prompt` của asset hoặc `style.audio.prompt`. Model mặc định `gpt-4o-mini-tts` (`--model`, `GAMEKIT_SPEECH_MODEL`).
4. Chỉ sinh file chưa có (trừ khi `--id`); quá 5 lần gọi API cần `--yes`. Đuôi được hỗ trợ: `.mp3`, `.ogg`, `.aac`, `.wav`. File được gắn nhãn `generated`.
5. Nghe từng ngôn ngữ: đọc sai tên riêng, nhấn sai, dài hơn chỗ dành cho nó.

## 4. Định dạng và âm lượng
- `mp3` phát được trên mọi trình duyệt; `ogg` nhỏ hơn nhưng Safari/iOS cũ không phát. Dùng `ogg` thì phải có bản `mp3`/`m4a` dự phòng và code chọn bằng `canPlayType` — mỗi file dự phòng cũng cần nhãn. Không chắc thì một định dạng `mp3`.
- SFX ngắn, cắt hết khoảng lặng đầu (tiếng phát trễ là lỗi cảm nhận được), mono là đủ. Nhạc nền lặp: điểm nối không vấp, bitrate vừa phải vì nằm trong gói tải.
- Cân âm lượng mọi file về một mức (vd ffmpeg `loudnorm`), ghi mức đã chọn vào `DECISIONS.md`. Mọi thông tin gameplay phải có tín hiệu hình ảnh — người chơi tắt tiếng vẫn chơi được (mục cổng P3).

## 5. Tắt tiếng, pause
`PauseBus` (`src/platform/pause-bus.ts`) đã quyết định khi nào im lặng: `muted` đúng khi game pause vì bất kỳ lý do nào (`ad`, `hidden`, `blur`, `menu`) hoặc người chơi tắt tiếng trong Settings. Module âm thanh trong `src/view/` chỉ `bus.subscribe(...)` và làm theo `muted` (vd master gain về 0), không tự đặt luật riêng. Trình duyệt chặn âm thanh tới lần chạm/bấm đầu tiên: mở khoá audio trong handler input đầu tiên.

## 6. Hoàn tất
- `gamekit review` → người dùng nghe từng file, đánh dấu OK / Cần sửa → `gamekit review --apply review.json`; làm lại mục "cần sửa".
- `gamekit validate` (nhãn, `textKey`, không còn `reference` trong `assets/`), `npm test`, `npm run lint`, chạy `npm run dev`: ad giả (`?ad=…`), đổi tab, mở Settings đều im lặng.
- Báo người dùng: nguồn và license từng nhóm file, số lần gọi API, mục còn thiếu. Tiếp theo: skill rename-and-text (nếu chưa), rồi `gamekit gate`.
