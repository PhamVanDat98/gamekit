# GameKit trên Claude Code

- Cài: `/plugin marketplace add <đường dẫn hoặc repo gamekit>` rồi `/plugin install gamekit@gamekit-dev`.
- Hook `SessionStart` nạp using-gamekit và `gamekit status` của game hiện tại.
- Slash command: `/gamekit:status`, `/gamekit:next`.
- Gọi CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gamekit.mjs" …` hoặc `npm run gk -- …` trong game.
- Dựng song song: sau `gamekit fanout --wave N`, gọi mỗi module một subagent (Agent tool), chạy cùng lúc trong một lượt, prompt: "Làm việc trong thư mục <worktree>. Đọc .gamekit/local/BRIEF.md và làm theo." Worktree đã do fanout tạo, không cần chế độ isolation của Agent tool.
- Tạo game mới: chạy `init <tên> --questions --json`, rồi dùng AskUserQuestion hỏi người dùng từng câu (đưa `description` và `example` vào nội dung câu hỏi, `default` làm lựa chọn đầu; câu portal chỉ hỏi cho portal đã chọn), sau đó `init <tên> --set key=value …`. Thiếu thông tin portal thì `gamekit config --portal <id>` về sau.
