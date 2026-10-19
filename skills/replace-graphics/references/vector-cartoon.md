# Nhân vật, đạo cụ bằng SVG (`make: vector`)

Dùng skill **`svg-game-art`** của GameKit (`art-skills/svg-game-art/`, cài theo `art-skills/README.md` cho Codex hoặc Claude Code). Skill có 5 style hợp với game, mỗi style có palette và độ dày nét cố định để cả bộ asset đồng bộ:

| Style | Hợp với |
| --- | --- |
| `doodle` | Cartoon phẳng viền đen dày: casual, party, trẻ em |
| `sticker` | Tô 2 tông + viền trắng kiểu sticker: platformer, puzzle, casual mobile |
| `flat` | Khối hình học không viền: hypercasual, idle |
| `neon` | Nét phát sáng trên nền tối: shooter, arcade |
| `paper` | Giấy cắt chồng lớp: puzzle, cốt truyện, giáo dục |

Lệnh (`ART` = `node <svg-game-art>/scripts/svgart.mjs`):
- `ART lint art/hero.svg --style doodle` — kiểm palette, nét, phần tử cấm.
- `ART sheet art/*.svg --out .gamekit/local/sheet.png` — xem cả bộ ở 32/64/128 px, nền sáng và tối.
- `ART render art/hero.svg --out assets/gfx/hero.png --size 96x96` — PNG trong suốt đúng `width × height` của spec.
- Anim: `ART render art/hero-idle-0.svg art/hero-idle-1.svg art/hero-idle-2.svg --out assets/gfx/hero-idle.png --size 64x64` — strip ngang khớp `frames`, giữ điểm neo.

SVG nguồn commit trong `art/`; `gamekit provenance add <png> --label generated --source art/<tên>.svg`.

Không hợp: nền vẽ tay có chất liệu (mây loang, màu nước, ánh sáng mềm), nhân vật tô bóng nhiều lớp — dùng `image-gen` với ảnh mẫu style, rồi tách nền.
