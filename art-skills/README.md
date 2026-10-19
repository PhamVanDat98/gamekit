# Skill vẽ art cho Codex và Claude Code

Skill độc lập, không thuộc pipeline 6 pha: cài vào thư mục skill của agent, dùng được cả trong lẫn ngoài game GameKit. Skill `replace-graphics` (P3) trỏ tới đây khi chọn `make: vector`.

| Skill | Làm gì |
| --- | --- |
| [`svg-game-art`](svg-game-art/SKILL.md) | Vẽ asset game 2D bằng SVG theo style `doodle`, `sticker`, `flat`, `neon`, `paper`; kiểm style, render PNG trong suốt đúng cỡ, ghép strip anim, contact sheet. Node ≥ 20 + Chrome/Chromium/Edge, không cần API key |

## Cài
Codex (thư mục skill là `$CODEX_HOME/skills`, mặc định `~/.codex/skills`):
```bash
cp -r art-skills/svg-game-art ~/.codex/skills/
```
Claude Code:
```bash
cp -r art-skills/svg-game-art ~/.claude/skills/
```
Windows (PowerShell): `Copy-Item -Recurse art-skills\svg-game-art $HOME\.codex\skills\`. Dùng symlink thay cho `cp` nếu muốn tự cập nhật theo repo. Mở session mới để agent nạp skill; Codex gọi rõ bằng `$svg-game-art`.

## Thử nhanh
```bash
node art-skills/svg-game-art/scripts/svgart.mjs styles
node art-skills/svg-game-art/scripts/svgart.mjs sheet art-skills/svg-game-art/examples/*.svg --out sheet.png
```
