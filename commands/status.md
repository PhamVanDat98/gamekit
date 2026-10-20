---
description: Game đang ở pha nào, cổng còn gì, skill nào dùng tiếp
---

Chạy `node "${CLAUDE_PLUGIN_ROOT}/scripts/gamekit.mjs" status` trong thư mục game (hoặc `npm run gk -- status`). Tóm tắt cho người dùng bằng tiếng Việt trong vài dòng: pha hiện tại, việc còn mở ở cổng (nêu rõ việc nào người dùng phải quyết), và skill nên dùng tiếp. Nếu chưa có game.yaml, đề nghị tạo game mới theo mục "Tạo game mới" của skill using-gamekit (rồi skill game-recon).
