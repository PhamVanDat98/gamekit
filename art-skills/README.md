# Skill vẽ art cho Codex (và Claude Code)

Skill độc lập, không thuộc pipeline 6 pha: cài vào thư mục skill của agent, dùng được trong lẫn ngoài game GameKit. Skill `replace-graphics` (P3) dùng nó cho `make: image-gen`.

| Skill | Làm gì |
| --- | --- |
| [`game-raster-art`](game-raster-art/SKILL.md) | Asset game raster bằng `image_gen` của Codex: chốt style bằng ảnh neo, mẫu prompt theo loại asset, 9 style game; `gameart.py` tách nền trong suốt, đặt đúng cỡ cùng tỉ lệ và điểm neo, cắt strip animation (báo khi model vẽ sai số tư thế), pixel art đúng lưới, tile liền mạch, nền parallax, contact sheet để duyệt. Cần Python 3.9+ và Pillow |

## Cài
Codex (thư mục skill là `$CODEX_HOME/skills`, mặc định `~/.codex/skills`):
```bash
cp -r art-skills/game-raster-art ~/.codex/skills/
python3 -m pip install pillow
```
Windows (PowerShell): `Copy-Item -Recurse art-skills\game-raster-art $HOME\.codex\skills\`. Dùng symlink thay cho `cp` nếu muốn tự cập nhật theo repo. Mở session Codex mới, gọi `$game-raster-art`.

Claude Code: chép vào `~/.claude/skills/`. Claude Code không có `image_gen`; phần hậu xử lý (`gameart.py`) dùng được với ảnh từ bất kỳ nguồn nào (MCP tạo ảnh, ảnh người dùng đưa).

## Thử nhanh phần hậu xử lý
```bash
python3 art-skills/game-raster-art/scripts/gameart.py key raw.png --out sprite.png
python3 art-skills/game-raster-art/scripts/gameart.py anim walk-raw.png --frames 6 --size 64x64 --out walk.png --gif walk.gif
```
