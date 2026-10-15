# GameKit trên Claude Code

- Cài: `/plugin marketplace add <đường dẫn hoặc repo gamekit>` rồi `/plugin install gamekit@gamekit-dev`.
- Hook `SessionStart` nạp using-gamekit và `gamekit status` của game hiện tại.
- Slash command: `/gamekit:status`, `/gamekit:next`.
- Gọi CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gamekit.mjs" …` hoặc `npm run gk -- …` trong game.
- Dựng song song: sau `gamekit fanout --wave N`, gọi mỗi module một subagent (Agent tool), chạy cùng lúc trong một lượt, prompt: "Làm việc trong thư mục <worktree>. Đọc .gamekit/local/BRIEF.md và làm theo." Worktree đã do fanout tạo, không cần chế độ isolation của Agent tool.
