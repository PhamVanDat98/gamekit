# Dùng thử GameKit 0.2.0

GameKit là plugin cho Claude Code giúp **chuyển game di động (Unity, Cocos…) thành web game viết bằng TypeScript** rồi đóng gói lên portal. AI làm phần lớn việc; GameKit giữ trạng thái, đặt cổng kiểm tra giữa các bước và chặn những lỗi hay gặp khi phát hành.

Đây là bản dùng thử. Mục đích là tìm chỗ vướng, nên gặp gì lạ cứ ghi lại và gửi về (cuối trang).

## Bản này làm được gì, chưa làm được gì

| Đã chạy | Chưa có |
| --- | --- |
| Tạo project game web, theo dõi 6 pha, chấm cổng | Hướng dẫn đầy đủ cho AI ở P1 (phân tích game gốc) theo từng engine, P3 (chuyển sang web) — AI tự làm theo checklist, chất lượng chưa đều |
| Nhận diện game gốc ở P0 từ APK, XAPK, AAB, IPA, thư mục Steam, exe, .app, Electron, thư mục web… (`gamekit recon`) |
| Hướng dẫn cho AI ở P2 (dựng lại, test đối chiếu với game gốc), P4 (SDK portal), P5 (đóng gói) | Quảng cáo, leaderboard thật trên azgames |
| Đóng gói cho azgames và bản chạy thử ở máy (`dev-mock`), kiểm tra trước khi phát hành | Game 3D: chưa thử với game thật |

## Cần có

- Claude Code (bản CLI hoặc trong VS Code)
- Node.js 20 trở lên — kiểm tra: `node --version`
- git — kiểm tra: `git --version`

## Cài

**Từ GitHub** (repo https://github.com/PhamVanDat98/gamekit):
```
/plugin marketplace add PhamVanDat98/gamekit
/plugin install gamekit@gamekit-dev
```

**Từ thư mục hoặc file zip** (giải nén ra trước):
```
/plugin marketplace add D:\duong\dan\toi\gamekit
/plugin install gamekit@gamekit-dev
```

Khởi động lại Claude Code. Lần đầu GameKit tự cài thư viện của nó, mất khoảng một phút.

**Cập nhật** khi có bản mới: `/plugin marketplace update gamekit-dev`, rồi khởi động lại Claude Code.

## Bắt đầu với một game

1. Đặt project (hoặc bản build: APK/XAPK, thư mục Steam, thư mục web…) của game gốc ở một thư mục riêng, ví dụ `D:\games-src\ten-game`. Đừng đặt bên trong thư mục game web sắp tạo.
2. Mở Claude Code ở thư mục sẽ chứa game web (ví dụ `D:\games`) và nói:
   > Tạo game GameKit mới tên `ten-game` cho game Unity ở `D:\games-src\ten-game`.

   Claude sẽ hỏi từng thông tin kèm giải thích. Chưa có mã game hoặc token của portal thì bỏ qua, điền sau.
3. Mở thư mục `D:\games\ten-game` trong Claude Code (hoặc VS Code). Từ giờ Claude tự nạp hướng dẫn GameKit và trạng thái game mỗi lần mở.
4. Nói "làm tiếp" để Claude bắt đầu P0.

**Game của bạn hay của người khác?** Mặc định GameKit hiểu đây là game của bạn: giữ nguyên hình, âm thanh, tên, và đưa asset gốc vào bản web. Nếu bạn làm lại game của người khác, nói rõ với Claude ngay từ đầu. Khi đó GameKit bắt làm mới hình, âm thanh, tên và chặn tên game gốc khi phát hành.

## Đi qua từng pha

Mỗi pha: Claude làm → Claude chạy kiểm tra cổng → **bạn** tick các mục ghi "(bạn)" trong `gates/Px.md` → bạn bảo Claude "qua pha".

| Pha | Claude làm | Bạn làm |
| --- | --- | --- |
| P0 Intake | Đọc game gốc, kiểm kê, đánh giá khả thi | Quyết làm hay không |
| P1 Phân tích | Trích luật chơi, số liệu, asset, UI | Trả lời câu hỏi trong `notes/QUESTIONS.md` |
| P2 Dựng lại | Viết lại bằng TypeScript, test đối chiếu với game gốc | Chơi thử: `npm run dev` |
| P3 Chuyển sang web | Điều khiển chuột/bàn phím/cảm ứng, bố cục màn hình, nén asset | Duyệt |
| P4 Tích hợp | Gắn SDK portal | Đưa mã game, token của portal |
| P5 Phát hành | Đóng gói, kiểm tra | Chơi thử bản cuối |

Lúc nào cũng có thể gõ `/gamekit:status` (đang ở đâu, còn gì) hoặc `/gamekit:next` (việc tiếp theo).

## Chơi thử và đóng gói

```bash
npm run dev                          # chơi thử trong trình duyệt, có portal giả
npm run gk -- pack --all --zip       # đóng gói vào builds/<số phiên bản>/
npm run gk -- release-check          # kiểm tra trước khi phát hành
```

Gói `azgames` có khóa tên miền, chỉ chạy trên azgames.io. Muốn chạy thử gói ở máy, mở gói `dev-mock` nằm cùng thư mục: `npm run preview` rồi vào địa chỉ nó in ra. Không có mã game và token azgames thì vẫn thử được hết, chỉ không đóng gói được cho azgames.

## Đã biết

- `release-check` cảnh báo `Icons/domain.webp của bộ vỏ azgames còn là placeholder`. Đây là lỗi của bản thử, bỏ qua được.
- Icon `public/Icons/web.png` và `loading.webp` của game mới là ảnh tạm. Trước khi phát hành phải thay bằng icon thật, rồi gắn nhãn: `npm run gk -- provenance add public/Icons/web.png public/Icons/loading.webp --label own`.

## Gửi phản hồi

Tạo issue tại https://github.com/PhamVanDat98/gamekit/issues — mỗi vấn đề một issue.

Mỗi lần gặp vấn đề, gửi kèm:
1. Kết quả của `npm run gk -- status` trong thư mục game.
2. Đang ở pha nào, bạn đã nói gì với Claude, Claude đã làm gì.
3. Nguyên văn thông báo lỗi (nếu có).
4. Loại game: engine, 2D hay 3D, có source hay chỉ có bản build.

Chỗ nào Claude làm tốt cũng gửi, để biết cái gì nên giữ.
