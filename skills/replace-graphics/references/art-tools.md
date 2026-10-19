# Công cụ tạo art cho agent (khảo sát 10/2026)

Chỉ là gợi ý; dùng cái người dùng đã có hoặc đồng ý trả phí. Mọi asset tạo ra gắn nhãn `generated`, `--source` ghi tên công cụ (và file nguồn nếu có). Dịch vụ trả phí: kiểm điều khoản dùng thương mại trước khi phát hành.

## `vector`: SVG/CSS viết tay, không cần API
| Công cụ | Làm gì | Cần | Agent |
| --- | --- | --- | --- |
| [claude-illustrate-skill](https://github.com/code-katz/claude-illustrate-skill) (MIT), skill `illustrate` | Logo, icon, bộ icon UI, favicon viết thẳng bằng SVG; 3–5 concept khác nhau; render cả dãy cỡ (16→512) trên nền sáng/tối thành một contact sheet, tự xem rồi sửa (tối đa 3 lượt); bộ icon được duyệt chung một sheet để đồng bộ | Chromium hoặc `rsvg-convert` để render (Playwright Chromium dùng được). Ảnh raster mới cần backend (Recraft, Hugging Face…) | Claude Code: `git clone https://github.com/code-katz/claude-illustrate-skill.git ~/.claude/skills/illustrate`. Codex: clone vào `~/.codex/skills/illustrate` |

| [claudedraw](https://github.com/Griffin2/claudedraw) (MIT), skill `draw` | Agent viết SVG đơn giản, `draw.py` (Python thuần) biến thành **một style cố định**: tô gạch chéo 45° kiểu bút sáp, viền run tay, hạt nhiễu, 21 màu cố định, tối đa 15 mảng | Python 3 | Claude Code: `/plugin marketplace add Griffin2/claudedraw` → `/plugin install draw@claudedraw`. Codex: chép `draw/skills/draw` vào `~/.codex/skills/draw` |

claudedraw không vẽ được cartoon phẳng viền đen hay nền vẽ tay: renderer luôn thay mảng tô bằng nét gạch chéo. Muốn kiểu doodle phẳng: `game-raster-art` style `doodle-monster`. Viền run tay của nó dùng riêng được (mảng không gắn class giữ phẳng, viền gắn `class="stroke-sil"` + `stroke="…"`) nhưng trái luật của skill; chỉ thử khi người dùng muốn nét run.

Dùng `illustrate` trong game GameKit:
- Hợp với: icon UI (`kind: icon`/`ui`), logo game, icon portal `public/Icons/web.png`, ảnh cửa hàng. Brief lấy từ `asset-manifest.json`: `minDisplayPx` là cỡ nhỏ nhất phải đọc được, palette hex từ style đã chốt.
- File nguồn `.svg` và contact sheet để ngoài thư mục phát hành (`art/` commit, sheet trong `.gamekit/local/`); chỉ đưa vào `assets/`/`public/` file game dùng (SVG hoặc PNG đúng cỡ spec).
- Skill tự ghi nguồn gốc vào `assets/MANIFEST.md`: trong game GameKit **không** tạo file đó (mọi file trong `assets/` phải có nhãn). Ghi bằng `gamekit provenance add <file> --label generated --source "illustrate: SVG viết tay"` (ảnh từ backend: ghi tên model và giấy phép vào `--source`/`--license`).
- Không in chữ vào icon gameplay (`noText`); wordmark tên game chỉ dùng ở logo, và với game `third-party` không dùng tên gốc.

## `pixel-code`: art bằng code, không cần API
| Công cụ | Làm gì | Cần | Agent |
| --- | --- | --- | --- |
| [claude-pxl](https://github.com/crsolver/claude-pxl) (MIT) | DSL `.px.js` → PNG, strip anim, sheet + JSON, preview. **Mặc định** — xem [pxl](pxl.md) | Node ≥ 22.18 | Claude Code, Codex |
| [aseprite-mcp](https://github.com/diivi/aseprite-mcp) (MIT) | MCP điều khiển Aseprite: layer, palette, tag anim, tilemap, xuất sheet + JSON | Aseprite (trả phí hoặc tự build), Python 3.13 + `uv` | Mọi MCP client |
| [game-creator](https://github.com/opusgamelabs/game-creator) (MIT), skill `game-assets` | Vẽ pixel sprite từ mảng 2D trong code, hướng Phaser | — | Claude Code, Codex |

## `image-gen`: model tạo ảnh
| Công cụ | Làm gì | Cần | Agent |
| --- | --- | --- | --- |
| **`game-raster-art`** (của GameKit, `art-skills/`) | Quy trình đầy đủ trên `image_gen` của Codex: ảnh neo style, mẫu prompt, tách nền, đúng cỡ, strip anim, pixel, tile, parallax, duyệt | Codex + Python/Pillow | Codex; hậu xử lý dùng được với ảnh từ nguồn khác |
| Codex `imagegen` (skill hệ thống của Codex) | Tạo/sửa ảnh bằng công cụ `image_gen` sẵn có; nền trong suốt qua chroma-key rồi tách | Đăng nhập Codex; chế độ script cần `OPENAI_API_KEY` | Codex (Claude Code chỉ qua `codex exec`) |
| [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) (MIT phần code) | Pipeline sprite đủ nhất: frame trong suốt, atlas, JSON kiểu Aseprite; dùng API key, hoặc Codex `image_gen`, hoặc vẽ bằng code | Python (Pillow, NumPy) + một nguồn ảnh | Codex trước; Claude Code qua plugin marketplace |
| [Retro Diffusion MCP](https://github.com/Retro-Diffusion/retro-diffusion-mcp) | Pixel art bằng model chuyên dụng, 90+ style, style riêng của người dùng (giữ đồng nhất), anim, tileset, `fix_pixel_art` | Tài khoản, trả theo lượt | Claude Code (plugin); MCP chung |
| [PixelLab MCP](https://github.com/pixellab-code/pixellab-mcp) | Nhân vật 4/8 hướng, animate, tileset Wang, tile isometric | Token PixelLab trả phí | MCP HTTP |
| Scenario MCP (`https://mcp.scenario.com/mcp`) | Nhiều model, có model style tự train | Tài khoản trả phí | MCP HTTP |
| [nano-banana-mcp](https://github.com/conechoai/nano-banana-mcp) (MIT) | Tạo/sửa ảnh bằng Gemini Flash Image | Gemini API key | MCP |
| [fal-mcp-server](https://github.com/raveenb/fal-mcp-server) (MIT, cộng đồng) | Flux/SDXL, img2img, `remove_background`, upscale | `FAL_KEY` | MCP |

## Skill có sẵn hoặc chính thức cho Codex
Codex đọc skill trong `$CODEX_HOME/skills` (mặc định `~/.codex/skills`); plugin chính thức cài từ `/plugins` trong Codex (marketplace "Codex official", nguồn [openai/plugins](https://github.com/openai/plugins)). Cài xong mở session mới.

| Skill | Nguồn | Dùng cho | Ghi chú |
| --- | --- | --- | --- |
| `imagegen` | Có sẵn (skill hệ thống) | Tạo/sửa ảnh, nền trong suốt, biến thể từ ảnh tham chiếu | Công cụ `image_gen` không cần API key. Ảnh nằm ở `$CODEX_HOME/generated_images/…`, chép sang `.gamekit/local/` rồi hậu xử lý |
| `sprite-pipeline` | Plugin **Game Studio** (OpenAI, MIT) | Anim 2D: từ một frame đã duyệt → tạo cả strip một lần qua `imagegen` → chuẩn hoá cùng tỉ lệ, cùng điểm neo | Script Python cần Pillow. `normalize_sprite_strip.py` ra từng frame riêng: ghép lại thành strip ngang theo `frames` của spec |
| `game-ui-frontend` | Game Studio | HUD, menu, overlay không che vùng chơi | Hợp với `make: vector` |
| `game-playtest` | Game Studio | Chạy game trên trình duyệt, chụp màn hình, soát HUD | Duyệt art trong game thật |
| `screenshot`, `playwright` | Curated (`$skill-installer screenshot`) | Chụp màn hình để so style giữa các màn | |
| `hatch-pet` | Curated | Đóng atlas pet của Codex | Không dùng cho asset game; tham khảo cách giữ một nhân vật đồng nhất qua nhiều trạng thái |
| **`game-raster-art`** | GameKit: `cp -r art-skills/game-raster-art ~/.codex/skills/` + `pip install pillow` | `make: image-gen`: mọi asset raster, chốt style bằng ảnh neo, 9 style game, hậu xử lý đúng spec | Gọi `$game-raster-art`. Đã thử trên ảnh `image_gen` thật: tách nền sạch, strip giữ chân trên một đường |
| `pxl-pixel-art` | `git clone https://github.com/crsolver/claude-pxl.git ~/.codex/skills/pxl-pixel-art` | `make: pixel-code` | Xem [pxl](pxl.md) |
| `illustrate` | `git clone https://github.com/code-katz/claude-illustrate-skill.git ~/.codex/skills/illustrate` | `make: vector`: logo, icon, bộ icon UI | Viết cho Claude Code nhưng chỉ là `SKILL.md` + file tham khảo, Codex đọc được; cần Chromium để render |
| `transparent-visual-assets` | [codex-visual-asset-skills](https://github.com/DwDestiny/codex-visual-asset-skills) (MIT): `npx skills add DwDestiny/codex-visual-asset-skills --skill '*' -g -a codex -y` | Tách nền: tạo ảnh trên nền `#FF00FF` qua `imagegen`, script xoá màu nền ra PNG trong suốt + báo cáo | Cần Pillow. Đã thử: nền trong suốt sạch, viền tối có thể ám màu nền một chút; tăng `--feather-threshold` hoặc đổi màu nền |
| `sprite-animation-assets` | cùng repo | Ghép frame trong suốt thành atlas + GIF xem thử | **Cẩn thận**: mỗi frame bị cắt sát rồi đặt giữa ô và co riêng (LANCZOS) → mất chuyển động lên/xuống, dáng cao bị co nhỏ, pixel art bị nhoè. Chỉ dùng cho anim tại chỗ không phải pixel art; anim có chuyển động dùng `sprite-pipeline` (cùng tỉ lệ, cùng điểm neo). Một trạng thái, `columns` = số frame → ra strip ngang đúng spec GameKit |
| agent-sprite-forge | `git clone` repo → `pip install -r requirements.txt` → `python tools/install_skills.py --apply --host codex` | Sprite, map, tile; dùng `image_gen` của Codex khi không có API key | Asset từ model theo điều khoản của nhà cung cấp, không theo MIT |

Không hợp làm asset game: skill `algorithmic-art`, `canvas-design` của [anthropics/skills](https://github.com/anthropics/skills) (hướng tranh/poster, không có nền trong suốt hay sheet).

## Hậu xử lý
- [rembg](https://github.com/danielgatis/rembg) (MIT): tách nền offline, `rembg i in.png out.png`. Chọn model `u2net`/`isnet` nếu cần dùng thương mại (một số model có giới hạn).
- `free-tex-packer-cli` (npm): đóng atlas cho Phaser/Pixi.
- Kiểm cuối luôn bằng `gamekit validate`.
