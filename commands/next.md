---
description: Làm bước tiếp theo của pipeline GameKit cho game hiện tại
---

1. Chạy `node "${CLAUDE_PLUGIN_ROOT}/scripts/gamekit.mjs" status` trong thư mục game (hoặc `npm run gk -- status` nếu biến CLAUDE_PLUGIN_ROOT không có).
2. Chọn việc đầu tiên còn mở ở cổng của pha hiện tại mà agent được phép làm (bỏ qua việc ghi "(bạn)" — đó là quyết định của người dùng, hỏi họ).
3. Nếu có skill GameKit cho việc đó, dùng skill đó. Skill chưa có trong bản này thì làm theo hướng dẫn chung trong using-gamekit và luật cứng.
4. Xong thì chạy `gamekit gate` và báo kết quả. Chỉ chạy `gamekit gate --advance` khi người dùng đồng ý sang pha sau.

$ARGUMENTS
