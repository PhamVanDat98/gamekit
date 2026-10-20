#!/usr/bin/env bash
# Game GameKit ở P0, recon đã xong: game nhỏ của người dùng (Unity project, 2D, 3 màn, offline).
set -euo pipefail
OWNERSHIP="${OWNERSHIP:-own}"
mkdir -p gates notes spec orig/TapJump/ProjectSettings orig/TapJump/Assets/Scripts
printf 'm_EditorVersion: 2021.3.5f1\n' > orig/TapJump/ProjectSettings/ProjectVersion.txt
printf 'public class Jumper : UnityEngine.MonoBehaviour { public float jump = 7f; }\n' > orig/TapJump/Assets/Scripts/Jumper.cs
cat > game.yaml <<YAML
name: tap-jump
title: Tap Jump
version: 0.1.0
phase: P0
source:
  ownership: ${OWNERSHIP}
  engine: unity
  engineVersion: 2021.3.5f1
  path: orig/TapJump
portals:
  - dev-mock
budget:
  plannedDays: {}
release:
  forbiddenTerms: [TapJump]
gates: {}
timings:
  P0:
    start: 2026-10-01T00:00:00Z
    end: null
YAML
cat > gates/P0.md <<'MD'
# Cổng ra khỏi P0 Intake

- [x] Đã nhận diện engine, version và kiểm kê file game gốc (`game-recon`)
- [ ] Có báo cáo triage: điểm khả thi, ước lượng công (game nhỏ của bạn: hoặc mục D-n trong DECISIONS.md nói vì sao bỏ qua, kèm budget.plannedDays)
- [ ] Đã đánh giá rủi ro clone: portal có duyệt game làm lại không {only: third-party}
- [ ] Đã ghi engine gốc trong game.yaml {auto: field:source.engine}
- [ ] Đã ghi đường dẫn game gốc {auto: field:source.path}
- [ ] Đồng ý làm game này (bạn)
MD
cat > DECISIONS.md <<'MD'
# Quyết định

Ghi lý do cho mọi lựa chọn quan trọng và mọi sai khác so với game gốc.
MD
cat > spec/recon.json <<'JSON'
{ "kind": "dir", "platform": "source", "engine": "unity", "flavour": "unity-project", "version": "2021.3.5f1",
  "files": 2, "evidence": ["ProjectSettings/ProjectVersion.txt"], "logic": ["Assets/**/*.cs (source C#)"],
  "assets": { "kinds": { "image": { "files": 6, "bytes": 90000 }, "audio": { "files": 2, "bytes": 120000 } }, "totalBytes": 210000 } }
JSON
cat > notes/recon.md <<'MD'
# Recon — Tap Jump
- Bản gốc: Unity 2021.3.5f1, project có source (ProjectSettings/ProjectVersion.txt).
- Logic: một script Assets/Scripts/Jumper.cs; một cơ chế (chạm để nhảy qua chướng ngại).
- Màn: bắt đầu, chơi, game over. 2D, offline, không IAP, không vật lý Rigidbody (nhảy theo công thức).
- Asset: 6 ảnh PNG, 2 file âm thanh, ~0.2 MB.
MD
