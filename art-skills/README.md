# Skill vẽ art cho Codex và Claude Code

Skill độc lập, không thuộc pipeline 6 pha: cài vào thư mục skill của agent, dùng được trong lẫn ngoài game GameKit. Skill `replace-graphics` (P3) dùng chúng cho `make: image-gen` và `make: voxel-code`; animation của mọi loại đi qua `game-animation`.

Luật: **không API key** (ảnh tạo bằng `image_gen` của Codex trên tài khoản ChatGPT; ngoài Codex qua Codex CLI) và **agent chỉ tự vẽ bằng code khi là pixel art hoặc voxel**.

| Skill | Làm gì |
| --- | --- |
| [`game-raster-art`](game-raster-art/SKILL.md) | Asset game raster bằng `image_gen` của Codex: khung hình concept → rút asset từ nó, mẫu prompt theo loại asset, 8 style game; `gameart.py` tạo ảnh qua Codex CLI (`gen`), tách nền, đúng cỡ cùng tỉ lệ và điểm neo, ảnh cho animation (sprite, bộ phận cắt rời, Codex vẽ từng frame trên `canvas` có sẵn frame đã duyệt, `--lock-first`, `inspect`, `replace`), tách tấm nhiều asset, khớp màu với concept, ghép thử và so với concept, tile, nền parallax. Cần Python 3.9+ và Pillow |
| [`game-animation`](game-animation/SKILL.md) | Animation 2D bằng dữ liệu cho từng dự án: khung xương (`*.skeleton.json`) + animation (`*.anim.json`: keyframe có easing, sóng, IK hai khúc). Thư viện mẫu: người (idle, walk, run, jump, attack, hit; bản chibi), thú bốn chân, chim, cá, rắn, sprite một khối (nhún, nảy, lắc, xoay, đập, rung…). Ra: GIF người que để duyệt, dải tư thế cho model vẽ từng frame, rig từ ảnh bộ phận, tween một sprite, bake dữ liệu xương cho game. Cần Python 3.9+ và Pillow |
| [`voxel-art`](voxel-art/SKILL.md) | Voxel bằng code: model Python → sprite isometric pixel-perfect 1–4 hướng, strip animation, `.vox` cho MagicaVoxel. Cần Python 3.9+ và Pillow |

## Cài
Codex (thư mục skill là `$CODEX_HOME/skills`, mặc định `~/.codex/skills`):
```bash
cp -r art-skills/game-raster-art art-skills/game-animation art-skills/voxel-art ~/.codex/skills/
python3 -m pip install pillow
```
Windows (PowerShell): `Copy-Item -Recurse art-skills\game-raster-art, art-skills\game-animation, art-skills\voxel-art $HOME\.codex\skills\`. Dùng symlink thay cho `cp` nếu muốn tự cập nhật theo repo. Mở session Codex mới, gọi `$game-raster-art`, `$game-animation` hoặc `$voxel-art`.

Claude Code: chép vào `~/.claude/skills/`. Claude Code không có `image_gen`, nên tạo ảnh bằng `gameart.py gen` — chạy Codex CLI trên tài khoản ChatGPT (`npm i -g @openai/codex`, `codex login`), không cần API key.

## Thử nhanh phần hậu xử lý
```bash
python3 art-skills/game-raster-art/scripts/gameart.py key raw.png --out sprite.png
python3 art-skills/game-raster-art/scripts/gameart.py anim walk-raw.png --frames 6 --size 64x64 --out walk.png --gif walk.gif
python3 art-skills/game-animation/scripts/animate.py library
python3 art-skills/game-animation/scripts/animate.py preview art-skills/game-animation/library/quadruped/walk.anim.json --out dog.gif
python3 art-skills/voxel-art/scripts/voxel.py sheet art-skills/voxel-art/examples/*.vox.py --out voxel-sheet.png
```
