# Công thức chuyển động (khung@60)

Điểm xuất phát, không phải luật: chỉnh theo style và cảm giác người dùng duyệt. Mỗi khối JSON dưới đây đạt `gamekit motion` không cảnh báo (test của plugin chạy lại chúng); chép vào `motion/<name>.json`, thêm `"$schema": "../.gamekit/schemas/motion.schema.json"`. Bốn file mẫu có sẵn trong template: `idle`, `hop`, `hit`, `pop-in`.

Ký hiệu: `s` = `stretch` (giữ khối), pivot thân ở chân trừ khi ghi khác.

## Nhân vật

### Nhảy (player-action — lớp nhìn đè lên nhảy của core)
`core/` đổi vận tốc ngay khi bấm; animation chỉ co giãn. Rơi: `stretchFromSpeed(vy, vMax, 1.2)`. Chạm đất: dùng **Đáp đất**.
```json
{
  "name": "jump-takeoff",
  "role": "player-action",
  "brief": "Nén 2 khung (không làm trễ input), bật giãn 1.22, tròn lại khi lên đỉnh.",
  "tracks": {
    "body.stretch": [
      { "f": 0, "v": 1 },
      { "f": 2, "v": 0.8, "ease": "out" },
      { "f": 6, "v": 1.22, "ease": "out", "beat": "action" },
      { "f": 14, "v": 1, "ease": "inOut" }
    ]
  }
}
```

### Đáp đất (reaction)
Bẹp ngay khung chạm, nảy quá, settle. Thêm bụi 2 bên chân (particle 6–10 hạt, 12–20 khung) và mắt nheo — secondary.
```json
{
  "name": "land",
  "role": "reaction",
  "brief": "Bẹp 0.7 trong 2 khung, nảy 1.08, về 1. Mắt nheo trễ 1 khung.",
  "tracks": {
    "body.stretch": [
      { "f": 0, "v": 1 },
      { "f": 2, "v": 0.7, "ease": "out", "beat": "action" },
      { "f": 8, "v": 1.08, "ease": "out" },
      { "f": 14, "v": 1, "ease": "inOut" }
    ],
    "eyes.sy": [
      { "f": 0, "v": 1 },
      { "f": 3, "v": 0.5, "ease": "out" },
      { "f": 10, "v": 1, "ease": "out" }
    ]
  }
}
```
Mức theo độ cao rơi: thấp 0.85 · vừa 0.7 · rất cao 0.6 + hold 2 khung. Vật nặng: nảy ít (1.03), settle nhanh.

### Hop / nhảy diễn (action) — xem `motion/hop.json`
Nén 9 khung + giữ 3 → bật 10 khung (`out`) → rơi 12 khung (`in`) → bẹp 2 khung → nảy → settle. Râu trễ rồi quất khi chạm.

### Đi bộ, chạy (vòng lặp, rig cắt rời)
Một chu kỳ = 2 bước. Bốn pose mỗi bước (Williams): **contact** (gót chạm) → **down** (thấp nhất, ngay sau contact) → **passing** (chân sau vượt qua) → **up** (cao nhất) → contact.

| Kiểu | Khung/bước | Nhún thân (% chiều cao) | Chân xoay | Tay xoay |
| --- | --- | --- | --- | --- |
| Đi chậm, mệt | 30–36 | 2–3 | ±20° | ±10° |
| Đi thường | 20–24 | 3–5 | ±25° | ±18° |
| Chạy | 10–14 | 8–12 (có pha bay) | ±45–60° | ±40° |
| Chạy cartoon | 6–8 | 10–15 + giãn khi bay | ±60° | tay quay tròn / mờ |

Tay ngược chân, trễ 2 khung (overlap); đầu trễ thân 2–3 khung; thân nghiêng về trước 5–15° khi chạy. Nhân vật đứng tại chỗ, nền/thế giới trôi theo tốc độ của `core/` — tốc độ chân phải khớp tốc độ trôi, không thì "trượt băng".
```json
{
  "name": "walk",
  "role": "action",
  "loop": true,
  "brief": "Đi thường, 20 khung/bước. Thân thấp nhất ngay sau contact (f4, f24), cao nhất sau passing (f15, f35). Tay ngược chân, trễ 2 khung. Đầu gật trễ thân.",
  "tracks": {
    "body.y": [
      { "f": 0, "v": 0 },
      { "f": 4, "v": 5 },
      { "f": 15, "v": -3 },
      { "f": 20, "v": 0 },
      { "f": 24, "v": 5 },
      { "f": 35, "v": -3 },
      { "f": 40, "v": 0 }
    ],
    "body.stretch": [
      { "f": 0, "v": 1 },
      { "f": 4, "v": 0.97 },
      { "f": 15, "v": 1.02 },
      { "f": 20, "v": 1 },
      { "f": 24, "v": 0.97 },
      { "f": 35, "v": 1.02 },
      { "f": 40, "v": 1 }
    ],
    "legL.rot": [
      { "f": 0, "v": 25 },
      { "f": 20, "v": -25 },
      { "f": 40, "v": 25 }
    ],
    "legR.rot": [
      { "f": 0, "v": -25 },
      { "f": 20, "v": 25 },
      { "f": 40, "v": -25 }
    ],
    "armL.rot": [
      { "f": 0, "v": -17 },
      { "f": 2, "v": -18 },
      { "f": 22, "v": 18 },
      { "f": 40, "v": -17 }
    ],
    "armR.rot": [
      { "f": 0, "v": 17 },
      { "f": 2, "v": 18 },
      { "f": 22, "v": -18 },
      { "f": 40, "v": 17 }
    ],
    "head.rot": [
      { "f": 0, "v": 0 },
      { "f": 6, "v": 2 },
      { "f": 17, "v": -1 },
      { "f": 26, "v": 2 },
      { "f": 37, "v": -1 },
      { "f": 40, "v": 0 }
    ]
  }
}
```

### Đứng thở (idle) — xem `motion/idle.json`
Vòng 90–150 khung, thân 1 → 1.02–1.04 `inOut`, phần phụ lệch pha 8–15 khung, chớp mắt mỗi 2–4 s (đóng 3 khung `in`, mở 5 khung `out`). Nhiều idle: đổi ngẫu nhiên giữa 2–3 biến thể ở **view** (không dùng `Rng` của core).

### Bị đánh (reaction) — xem `motion/hit.json`
Khung 1–2: văng + nghiêng + ép ngang (s 1.2), mắt nhắm sập (`hold`); trôi 6 khung; hồi 18 khung vượt chỗ cũ rồi settle. Kèm nháy trắng 2–3 khung, rung màn hình nhỏ (trauma 0.3). Đòn mạnh: thêm hit-stop chỉ khi game gốc có.

### Đòn báo trước của địch (telegraph)
Lấy đà dài và rõ (người chơi đọc được) → hold rung nhẹ → đánh 4 khung → follow-through → hồi. Nháy màu ở đầu pha lấy đà (tín hiệu hình, không chỉ âm thanh).
```json
{
  "name": "slam",
  "role": "telegraph",
  "brief": "Giơ tay 24 khung (inOut), rướn thêm 10 khung (moving hold), đập 4 khung, nảy ngược, hồi 14 khung. Thân giãn lên khi lấy đà, bẹp khi đập. Renderer: nháy đỏ f0–24.",
  "tracks": {
    "arm.rot": [
      { "f": 0, "v": 0 },
      { "f": 24, "v": -70, "ease": "inOut", "beat": "anticipation" },
      { "f": 34, "v": -78, "ease": "out", "beat": "hold" },
      { "f": 38, "v": 95, "ease": "out", "beat": "action" },
      { "f": 46, "v": 85, "ease": "inOut" },
      { "f": 60, "v": 0, "ease": "inOut", "beat": "settle" }
    ],
    "body.stretch": [
      { "f": 0, "v": 1 },
      { "f": 24, "v": 1.1, "ease": "inOut" },
      { "f": 36, "v": 1.12, "ease": "out" },
      { "f": 39, "v": 0.8, "ease": "out" },
      { "f": 48, "v": 1.04, "ease": "out" },
      { "f": 56, "v": 1, "ease": "inOut" }
    ],
    "body.rot": [
      { "f": 0, "v": 0 },
      { "f": 24, "v": -6, "ease": "inOut" },
      { "f": 38, "v": 8, "ease": "out" },
      { "f": 50, "v": 0, "ease": "inOut" }
    ]
  }
}
```
Nếu khung trúng đòn (f38) quyết định gameplay → số này nằm trong `params/` có `source`; hitbox lấy từ `core/`, không từ animation.

### Thua / chết (action, cartoon)
Giật mình: giãn 1.25 + mắt to 3 khung (`out`) → hold 10–14 khung → sụp: bẹp 0.6 trong 8 khung (`in`) → nảy nhỏ 2 lần (biên độ giảm ½) → nằm yên; hoặc bay lên xoay 360° (`out`) rồi rơi khỏi màn hình (`in`).

### Double take (giật mình nhìn lại)
Nhìn → quay đi (12 khung) → **hold** 8–10 → snap quay lại 3 khung (`out`) → nén 0.85 (anticipation, 6 khung) → giãn 1.3 + mắt to (2 khung) → hold 12 → settle 10.

## UI

### Nút bấm (ui)
Theo input → không lấy đà. Hover: phóng 1.04 trong 8 khung `out`.
```json
{
  "name": "button-press",
  "role": "ui",
  "brief": "Ấn bẹp 0.88 trong 3 khung, thả nảy 1.06, về 1.",
  "tracks": {
    "root.stretch": [
      { "f": 0, "v": 1 },
      { "f": 3, "v": 0.88, "ease": "out", "beat": "action" },
      { "f": 9, "v": 1.06, "ease": "out" },
      { "f": 15, "v": 1, "ease": "inOut" }
    ]
  }
}
```

### Popup vào / ra
Vào: `motion/pop-in.json` (0 → 1.22 → 0.92 → 1, sy đi trước sx 2 khung). Ra: phồng nhẹ 1.05 trong 4 khung rồi 0 trong 6 khung `inBack` — ra nhanh hơn vào. Nền mờ: alpha 0 → 0.6 trong 8 khung `out`.

### Hiện lần lượt (sao, phần thưởng, danh sách)
Mỗi phần tử một `pop-in`, cách nhau 6–8 khung (stagger), thêm `rot` −15° → 0. Phần tử cuối (quan trọng nhất) to hơn và hold lâu hơn.

### Số điểm bay lên
Xuất hiện s 1.3 → 1 trong 6 khung `out`; bay y −40 trong 30 khung `out`; alpha giữ 1 rồi về 0 trong 10 khung cuối `in`.

### Nhặt xu (bay về HUD)
x và y khác ease → bay theo cung; y `inBack` tự có nhịp "nhún xuống" trước khi bay lên. HUD tự nảy khi xu tới (1.25 → 1 trong 10 khung `outBack`).
```json
{
  "name": "coin-collect",
  "role": "action",
  "brief": "Phồng 1.35 (4 khung) báo đã nhặt, rồi bay theo cung về HUD (x inOut, y inBack), mờ đi khi tới.",
  "skip": { "timing": "bay về HUD là quãng đường, không phải đòn dứt khoát; nhịp nằm ở cú phồng 4 khung" },
  "tracks": {
    "coin.sx": [
      { "f": 0, "v": 1 },
      { "f": 4, "v": 1.35, "ease": "out" },
      { "f": 12, "v": 1, "ease": "inOut" },
      { "f": 30, "v": 0.6, "ease": "in" }
    ],
    "coin.sy": [
      { "f": 0, "v": 1 },
      { "f": 4, "v": 1.35, "ease": "out" },
      { "f": 12, "v": 1, "ease": "inOut" },
      { "f": 30, "v": 0.6, "ease": "in" }
    ],
    "coin.x": [
      { "f": 0, "v": 0 },
      { "f": 4, "v": 0 },
      { "f": 30, "v": 160, "ease": "inOut" }
    ],
    "coin.y": [
      { "f": 0, "v": 0 },
      { "f": 4, "v": 0 },
      { "f": 30, "v": -300, "ease": "inBack", "beat": "action" }
    ],
    "coin.alpha": [
      { "f": 0, "v": 1 },
      { "f": 24, "v": 1 },
      { "f": 30, "v": 0, "ease": "in" }
    ]
  }
}
```

## Hiệu ứng, kẻ địch xuất hiện
- **Xuất hiện từ đất**: s 0.3 → 1.2 (6 khung `out`) → 0.92 → 1, alpha 0 → 1 trong 4 khung.
- **Rơi từ trên**: y `in`, giãn theo tốc độ, chạm đất dùng **Đáp đất**.
- **Rung tại chỗ** (sốt ruột, tích lực): x ±2 px đổi mỗi 2–3 khung bằng `inOut` (không `linear`), biên độ tăng dần khi gần bùng.
- **Vật quay đều** (xu, bánh xe): `rot` `linear` trong vòng lặp là hợp lệ; đồng xu "lật": `sx` 1 → 0.1 → 1 (`inOut`) cho cảm giác 3D.
