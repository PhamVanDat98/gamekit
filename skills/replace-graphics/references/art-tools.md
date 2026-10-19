# Công cụ tạo art (rà soát 10/2026)

## Luật
1. **Không API key.** Ảnh tạo bằng `image_gen` của Codex trên tài khoản ChatGPT: trong Codex gọi thẳng; ngoài Codex (Claude Code, script) qua Codex CLI (`gameart.py gen` → `codex exec`). Không dùng dịch vụ cần key/token.
2. **Agent chỉ tự vẽ bằng code khi là pixel art hoặc voxel.** Mọi style khác (cartoon, anime, vẽ tay, 3D, phẳng, neon…) tạo bằng `image_gen`. UI dựng bằng CSS (nút, khung, thanh) là code giao diện, vẫn được; logo, icon, minh hoạ thì tạo bằng `image_gen`.

Mọi asset tạo ra gắn nhãn `generated`, `--source` ghi công cụ và file nguồn/prompt.

## Dùng
| `make` | Công cụ | Ai vẽ | Cần |
| --- | --- | --- | --- |
| `image-gen` | **`game-raster-art`** (GameKit, `art-skills/`): khung hình concept → rút asset → tách nền, đúng cỡ, strip anim, khớp màu, ghép thử và so với concept | Codex `image_gen` / Codex CLI | Codex (đăng nhập ChatGPT), Python + Pillow |
| `pixel-code` | **[pxl](pxl.md)** ([claude-pxl](https://github.com/crsolver/claude-pxl), MIT) | agent viết `.px.js` | Node ≥ 22.18 |
| `voxel-code` | **`voxel-art`** (GameKit, `art-skills/`): model voxel bằng Python → sprite isometric, strip anim, `.vox` cho MagicaVoxel | agent viết `.vox.py` | Python + Pillow |
| `vector` | CSS/SVG cho UI dựng trong DOM | agent viết code UI | — |

Cài cho Codex: `cp -r art-skills/game-raster-art art-skills/voxel-art ~/.codex/skills/`, `git clone https://github.com/crsolver/claude-pxl.git ~/.codex/skills/pxl-pixel-art`. Claude Code: cùng các thư mục đó trong `~/.claude/skills/`.

## Rà soát API key
| Công cụ | Cần API key? | Xử lý |
| --- | --- | --- |
| Codex `imagegen` (skill hệ thống) | Công cụ `image_gen`: **không**. Script dự phòng `scripts/image_gen.py`: **có** (`OPENAI_API_KEY`) | Chỉ dùng `image_gen`; ngoài Codex dùng `gameart.py gen` (Codex CLI). Không chạy `image_gen.py` |
| [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) | Mặc định thử API trước nếu có key (OpenAI, Gemini, xAI, BytePlus, fal) | Luôn chạy `route_media.py … --route codex-cli` (hoặc `"providers": {"order": ["codex-cli"]}` trong config) và không cấu hình key. `gameart.py gen` dùng lại đúng cách gọi Codex CLI của nó |
| [codex-visual-asset-skills](https://github.com/DwDestiny/codex-visual-asset-skills) | Không (dùng `image_gen`) | Dùng được; `game-raster-art` đã thay phần tách nền và ghép frame (bản ghép frame của nó làm mất chuyển động) |
| Game Studio `sprite-pipeline` ([openai/plugins](https://github.com/openai/plugins)) | Không (dùng `imagegen`) | Dùng được |
| [claude-illustrate-skill](https://github.com/code-katz/claude-illustrate-skill) | Phần SVG không; backend Recraft/Hugging Face/Canva: có | **Bỏ**: agent tự vẽ logo/icon bằng SVG trái luật 2 |
| [claudedraw](https://github.com/Griffin2/claudedraw) | Không | **Bỏ**: agent tự vẽ, không phải pixel/voxel |
| [aseprite-mcp](https://github.com/diivi/aseprite-mcp), game-creator `game-assets` | Không | Pixel art, được dùng nếu người dùng có sẵn; mặc định là pxl |
| Retro Diffusion, PixelLab, Scenario MCP | Có (token/tài khoản trả phí) | **Bỏ** |
| nano-banana-mcp (Gemini), fal-mcp-server, Replicate | Có | **Bỏ** |
