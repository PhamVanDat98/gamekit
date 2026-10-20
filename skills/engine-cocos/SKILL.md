---
name: engine-cocos
description: Dùng ở pha P1 khi game gốc làm bằng Cocos Creator 2.x/3.x hoặc cocos2d-x (JS, Lua, C++) — tìm logic trong bundle JS, giải mã .jsc/.luac (XXTEA, key trong lib*.so), đọc asset theo thư mục uuid, scene/prefab JSON làm nguồn params, và map cc.Node/schedule/update(dt)/tween sang core loop của template.
---

# Phân tích game Cocos (P1)

Phương pháp chung (câu hỏi trước, đừng tin decompiler, cách ghi kết luận): skill **re-notes**. Skill này chỉ thêm phần riêng của Cocos. Script đã giải mã, bundle đã beautify, output Ghidra để trong `decompiled/`; asset xuất ra để trong `reference/` (cả hai gitignored, hook chặn commit).

`own` có project Creator (`assets/` + `project.json`/`settings/`): mở bằng Cocos Creator đúng version, đọc thẳng script `.ts`/`.js`, chạy preview để đo. Các bước dưới cho bản build.

## 1. Logic nằm ở đâu
| Dạng | Logic | Ghi chú |
| --- | --- | --- |
| Creator 2.0–2.3 | `src/project.js` (mọi script người dùng gộp lại) | `src/settings.js`: danh sách scene, uuid, gói asset |
| Creator 2.4+ | `assets/<bundle>/index.js` (`main`, `resources`, bundle riêng) | `assets/<bundle>/config.json`: uuid ↔ đường dẫn |
| Creator 3.x | `assets/<bundle>/index.js`, `src/chunks/` | engine trong `cocos-js/`; `src/settings*.json` |
| cocos2d-x JS | `src/*.js` hoặc `.jsc` | bản native Creator cũng dùng `.jsc` |
| cocos2d-x Lua | `src/**/*.lua` hoặc `.luac` | |
| cocos2d-x C++ | `lib/<abi>/libMyGame.so`, `libcocos2dcpp.so` | Ghidra (bước 2) |

Bundle JS: beautify, tách theo khối module (Creator gói mỗi script trong một hàm có tên class và uuid nén). Có source map thì dùng. Bỏ qua code engine (`cc.*`), chỉ đọc class của game.

## 2. Script mã hoá `.jsc` / `.luac`
1. Thường là XXTEA (có thể thêm nén zip/gzip sau khi giải). `.luac` mã hoá có **sign** ở đầu file: `xxd file.luac | head -1` thấy chuỗi đó. Lua bytecode thật bắt đầu bằng `\x1bLua` / `\x1bLJ` — khi đó không phải XXTEA mà cần decompiler Lua.
2. Key nằm trong `lib*.so` (đặt trong `AppDelegate` qua `jsb_set_xxtea_key` / `setXXTEAKeyAndSign`): `strings -n 8 lib<…>.so`, tìm quanh sign hoặc các chuỗi gần đó; không ra thì `npm run gk -- ghidra <apk> --entry lib/arm64-v8a/libcocos2djs.so --functions 'xxtea|XXTEA|AppDelegate'` rồi đọc tham số truyền vào ở chỗ gọi (`decompiled/ghidra/<lib>/c/`, `strings.tsv`).
3. GameKit không có lệnh giải XXTEA: viết script nhỏ ngoài repo game, ghi kết quả vào `decompiled/cocos/`. Ghi thuật toán, nơi tìm key (không ghi key vào file commit) vào `notes/cocos.md`.
4. Không tìm được key → ghi `notes/QUESTIONS.md`, báo lại triage (truy cập logic thành 0).

`third-party`: chỉ phân tích file tĩnh như trên; không hook/dump bộ nhớ game đang chạy để lấy key.

## 3. Asset, scene, prefab
- Creator 2.0–2.3: `res/import/<2 ký tự>/<uuid>.json` (dữ liệu), `res/raw-assets/` (file gốc). 2.4+ và 3.x: `assets/<bundle>/import/…`, `assets/<bundle>/native/…` (ảnh, âm thanh); tên file theo uuid, tra tên thật trong `config.json` (chỉ có với asset tải theo đường dẫn).
- Atlas: `.plist` (TexturePacker, frame + rect), `.atlas` + `.skel`/`.json` (Spine), `*_ske.json` + `*_tex.json` (DragonBones), `.fnt` (bitmap font). cocos2d-x: thường `res/` dạng file thường.
- Scene/prefab JSON: mảng object có `__type__` (`cc.Node`, `cc.Sprite`, hoặc uuid nén của class game). Property của component game trong scene/prefab **ghi đè** giá trị mặc định trong script — lấy giá trị đó vào `params/` với `source` = file JSON + node + component.property, `confidence: observed`. Một số bản 2.4+/3.x lưu JSON dạng nén (mảng lồng, không có tên trường): ghi rõ cách đọc trong notes.
- `own`: xuất asset cần dùng sang `assets/`/`public/`, nhãn `own`; `third-party`: chỉ là tư liệu trong `reference/`.

## 4. Map Cocos → template
| Cocos | Template |
| --- | --- |
| `update(dt)` của component | `stepWorld(…, dt)` fixed step trong `src/core/`; `dt` gốc theo frame (`cc.game.setFrameRate`, mặc định 60) |
| `schedule(cb, interval)`, `scheduleOnce`, `setTimeout` | timer trong state, đếm bằng thời gian mô phỏng |
| `cc.tween`, `runAction(cc.sequence/moveTo/…)` | ảnh hưởng gameplay (vị trí, hitbox, thời điểm) → hàm theo thời gian + easing trong core, thời lượng vào `params/`; chỉ trang trí → `view/` |
| cây `cc.Node` (vị trí cục bộ, anchor, scale) | toạ độ world phẳng trong state; Cocos y hướng lên, gốc dưới trái — canvas y hướng xuống |
| design resolution (`cc.view.setDesignResolutionSize`, Canvas) | `world.width/height` trong `params/` |
| collider (`cc.BoxCollider`, `collisionManager`), physics Box2D | va chạm tự viết trong core theo đúng hình dạng; Box2D chỉ khi bắt buộc, ghi `DECISIONS.md` |
| `Math.random` | `Rng` có seed |
| `cc.sys.localStorage` | `platform.save.get/set` |
| `cc.Label`, `cc.RichText`, chuỗi trong script | key trong `Language/en.json`, `t()`; ảnh có chữ → `assets/i18n/en/` + `tAsset()` |

## 5. Kết thúc
Ghi `notes/cocos.md`: version, dạng build, nơi chứa logic, cách giải mã, class/hàm cho từng cơ chế, chỗ khó chuyển sang web (`third-party`: bằng lời của mình). Số vào `params/` có `source` + `confidence`. `npm run gk -- validate`, `npm run gk -- gate`; báo người dùng câu nào trong `notes/QUESTIONS.md` còn mở. Tiếp: **re-notes**, rồi **gameplay-spec**, **asset-inventory**, **ui-extract**.
