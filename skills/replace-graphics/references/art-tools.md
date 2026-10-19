# Công cụ tạo art cho agent (khảo sát 10/2026)

Chỉ là gợi ý; dùng cái người dùng đã có hoặc đồng ý trả phí. Mọi asset tạo ra gắn nhãn `generated`, `--source` ghi tên công cụ (và file nguồn nếu có). Dịch vụ trả phí: kiểm điều khoản dùng thương mại trước khi phát hành.

## `pixel-code`: art bằng code, không cần API
| Công cụ | Làm gì | Cần | Agent |
| --- | --- | --- | --- |
| [claude-pxl](https://github.com/crsolver/claude-pxl) (MIT) | DSL `.px.js` → PNG, strip anim, sheet + JSON, preview. **Mặc định** — xem [pxl](pxl.md) | Node ≥ 22.18 | Claude Code, Codex |
| [aseprite-mcp](https://github.com/diivi/aseprite-mcp) (MIT) | MCP điều khiển Aseprite: layer, palette, tag anim, tilemap, xuất sheet + JSON | Aseprite (trả phí hoặc tự build), Python 3.13 + `uv` | Mọi MCP client |
| [game-creator](https://github.com/opusgamelabs/game-creator) (MIT), skill `game-assets` | Vẽ pixel sprite từ mảng 2D trong code, hướng Phaser | — | Claude Code, Codex |

## `image-gen`: model tạo ảnh
| Công cụ | Làm gì | Cần | Agent |
| --- | --- | --- | --- |
| Codex `imagegen` (skill hệ thống của Codex) | Tạo/sửa ảnh bằng công cụ `image_gen` sẵn có; nền trong suốt qua chroma-key rồi tách | Đăng nhập Codex; chế độ script cần `OPENAI_API_KEY` | Codex (Claude Code chỉ qua `codex exec`) |
| [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) (MIT phần code) | Pipeline sprite đủ nhất: frame trong suốt, atlas, JSON kiểu Aseprite; dùng API key, hoặc Codex `image_gen`, hoặc vẽ bằng code | Python (Pillow, NumPy) + một nguồn ảnh | Codex trước; Claude Code qua plugin marketplace |
| [Retro Diffusion MCP](https://github.com/Retro-Diffusion/retro-diffusion-mcp) | Pixel art bằng model chuyên dụng, 90+ style, style riêng của người dùng (giữ đồng nhất), anim, tileset, `fix_pixel_art` | Tài khoản, trả theo lượt | Claude Code (plugin); MCP chung |
| [PixelLab MCP](https://github.com/pixellab-code/pixellab-mcp) | Nhân vật 4/8 hướng, animate, tileset Wang, tile isometric | Token PixelLab trả phí | MCP HTTP |
| Scenario MCP (`https://mcp.scenario.com/mcp`) | Nhiều model, có model style tự train | Tài khoản trả phí | MCP HTTP |
| [nano-banana-mcp](https://github.com/conechoai/nano-banana-mcp) (MIT) | Tạo/sửa ảnh bằng Gemini Flash Image | Gemini API key | MCP |
| [fal-mcp-server](https://github.com/raveenb/fal-mcp-server) (MIT, cộng đồng) | Flux/SDXL, img2img, `remove_background`, upscale | `FAL_KEY` | MCP |

Không hợp làm asset game: skill `algorithmic-art`, `canvas-design` của [anthropics/skills](https://github.com/anthropics/skills) (hướng tranh/poster, không có nền trong suốt hay sheet).

## Hậu xử lý
- [rembg](https://github.com/danielgatis/rembg) (MIT): tách nền offline, `rembg i in.png out.png`. Chọn model `u2net`/`isnet` nếu cần dùng thương mại (một số model có giới hạn).
- `free-tex-packer-cli` (npm): đóng atlas cho Phaser/Pixi.
- Kiểm cuối luôn bằng `gamekit validate`.
