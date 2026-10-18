---
name: re-plan
description: Dùng ở đầu P1 khi game gốc đủ lớn để nhiều agent phân tích song song — chia phân tích thành mảng trong re-plan.yaml (mỗi mảng sở hữu câu hỏi, ghi chú, params, nghĩa vụ riêng), giao mỗi mảng cho một subagent trên worktree, tích hợp và đóng từng mảng bằng cổng mảng, rồi chuyển mảng xong sang dựng lại theo dây chuyền.
---

# Chia phân tích thành mảng chạy song song (P1)

Song song chỉ an toàn khi **phần dùng chung được chốt trước** và **mỗi file chỉ một chủ**. Agent chính làm bước 1–4 tuần tự trên `main`; subagent chỉ bắt đầu sau `fanout`. Từng mảng phân tích theo skill **re-notes**.

## Khi nào không chia
- Game nhỏ, ít cơ chế, logic gói trong vài file: phân tích tuần tự với `notes/QUESTIONS.md`. Ghi lý do vào `DECISIONS.md`.
- Mảng dự kiến nhỏ hơn chi phí viết brief + tích hợp.

## 1. Đầu vào
`notes/inventory.json` (`gamekit recon`, skill game-recon) và `notes/triage.md`. Liệt kê cơ chế người chơi cảm nhận được, nhóm thành **mảng** — mỗi mảng nên ứng với một module P2 sau này (`buildModule`).

## 2. Chốt phần dùng chung
- **Đơn vị chuẩn** (`units` trong `re-plan.yaml`): thời gian, khoảng cách, tốc độ… Game cũ tính theo frame: chốt luôn cách đổi (px/frame × fps). Mọi mảng ghi params theo đúng đơn vị này.
- **Tên mảng** không trùng nhóm có sẵn trong `params/game.json` (`params/<mảng>.json` nằm dưới `PARAMS.<mảng>`). Template có nhóm demo `world`, `player`, `obstacle`, `score`: xoá phần demo khi bắt đầu port thật.
- `src/contracts/` nếu đã biết; `spec/gameplay-spec.md` khung (core loop + mục lục trỏ tới `spec/<mảng>.md`).

## 3. Viết `re-plan.yaml`
Mẫu: `re-plan.example.yaml` trong game; schema `.gamekit/schemas/re-plan.schema.json`.
```yaml
kind: re
base: main
maxParallel: 4
shared: [DECISIONS.md, notes/inventory.json, spec/gameplay-spec.md, src/contracts/, game.yaml, re-plan.yaml, module-plan.yaml]
links: [decompiled/, reference/]        # tư liệu local, symlink vào worktree (chỉ đọc)
units: { time: s, distance: px, speed: px/s }
areas:
  - id: enemy
    owns: [notes/enemy/, params/enemy.json, spec/oracles/enemy/, spec/obligations/enemy.yaml, spec/enemy.md]
    targets: [Assembly-CSharp.dll:EnemySpawner, Assembly-CSharp.dll:BulletPattern]
    dependsOn: []                       # đồ thị, không theo đợt
    buildModule: core-enemy
    brief: Sinh địch, mẫu đạn, máu và sát thương theo level.
```
- `owns` bắt buộc gồm `notes/<id>/` (câu hỏi, ghi chú, quyết định `D-<id>-n`). Bố cục đầu ra chuẩn: `params/<id>.json`, `spec/oracles/<id>/`, `spec/obligations/<id>.yaml` (id nghĩa vụ `<id>.<tên>`), `spec/<id>.md`.
- `targets`: chọn từ file `code`/`data` trong `notes/inventory.json`.
- `dependsOn` chỉ khi mảng thật sự cần kết luận của mảng khác (vd điểm số cần trạng thái nhân vật).

## 4. Câu hỏi khung, kiểm, commit
Mỗi mảng một `notes/<id>/questions.yaml` (mẫu `notes/questions.example.yaml`) với vài câu bắt buộc đầu tiên — subagent thêm câu khi làm. `gamekit validate` sạch → commit lên `main`.

## 5. Giao việc
`gamekit fanout --plan re --ready` mở worktree `../<game>.worktrees/re-<id>` (nhánh `re/<id>`) cho mọi mảng không còn chờ phụ thuộc, tối đa `maxParallel`, kèm `.gamekit/local/BRIEF.md`.
- **Claude Code**: trong cùng một lượt, gọi Agent tool cho từng worktree: "Làm việc trong thư mục <worktree>. Đọc .gamekit/local/BRIEF.md và làm theo skill re-notes. Trả lời bằng tóm tắt kết luận, câu còn mở và đề xuất đổi phần dùng chung nếu có."
- **Codex**: mỗi worktree một session.
- Subagent cần đổi phần dùng chung (đơn vị, contract, `DECISIONS.md`) → đề xuất, agent chính quyết và sửa trên `main`.

## 6. Tích hợp và đóng mảng
- `gamekit status` cho biết mảng nào xong chờ integrate, đang làm, sẵn sàng, chờ phụ thuộc.
- `gamekit gate --area <id>` trong worktree trước khi báo xong: luật P2 trên file của mảng, câu bắt buộc đã trả lời hoặc có `openReason` + `impact`, nghĩa vụ có `source`.
- `gamekit integrate --plan re --ready --keep-going --cleanup`: merge mảng xong (mặc định kiểm bằng `validate`), mảng lỗi không chặn mảng khác. Rồi `fanout --plan re --ready` để mở mảng vừa hết chờ.
- Oracle `derived` do chính agent của mảng suy ra rồi dùng để test: nhờ một agent khác (hoặc agent chính) đọc lại trước khi đóng mảng.

## 7. Dây chuyền sang P2
Mảng qua cổng là module `buildModule` của nó dựng được ngay, không chờ mảng khác: agent chính nạp `params/<id>.json` vào `FILES` trong `src/core/params.ts`, thêm module vào `module-plan.yaml` (skill module-plan; brief tự kèm nghĩa vụ của mảng), `gamekit fanout --ready`.

Cổng P1 (`{auto: areas}`) qua khi mọi mảng đã merge và qua cổng mảng; agent chính hoàn tất `spec/gameplay-spec.md` và các mục còn lại của `gates/P1.md`.
