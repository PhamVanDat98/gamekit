#!/usr/bin/env bash
# Một game GameKit ở P0: mọi mục đã xong trừ quyết định "(bạn)" — chỉ người dùng được tick mục đó.
set -euo pipefail
mkdir -p gates notes orig
cat > game.yaml <<'YAML'
name: old-runner
title: Old Runner
version: 0.1.0
phase: P0
source:
  ownership: own
  engine: unity
  engineVersion: 2021.3.5f1
  path: orig
portals:
  - dev-mock
gates: {}
timings:
  P0:
    start: 2026-10-01T00:00:00Z
    end: null
YAML
cat > gates/P0.md <<'MD'
# Cổng ra khỏi P0 Intake

- [x] Đã nhận diện engine, version và kiểm kê file game gốc (`game-recon`)
- [x] Có báo cáo triage: điểm khả thi, ước lượng công
- [ ] Đã ghi engine gốc trong game.yaml {auto: field:source.engine}
- [ ] Đã ghi đường dẫn game gốc {auto: field:source.path}
- [ ] Đồng ý làm game này (bạn)
MD
cat > notes/triage.md <<'MD'
# Triage — Old Runner
Khuyến nghị: LÀM — Unity project có source, 2D, không vật lý phức tạp.
MD
