# AZGAMES (`azgames`)

Bộ vỏ: `portals/azgames/` của plugin. Spec bố cục: `docs/superpowers/specs/2026-10-16-azgames-build-design.md` (az-v1).

## Thông tin cần (`gamekit config --portal azgames`)
| Khoá | Là gì | Ví dụ |
| --- | --- | --- |
| `gameCode` | Mã game portal cấp; key localStorage `azgames.<gameCode>` | `g205` |
| `gameId` | Id trên SDK, kết thúc `-az` (analytics, leaderboard) | `ten-game-az` |
| `portalGid` | Slug trang game, không có `-az` (More Games, ad, chuyển hướng) | `ten-game` |
| `signed` | `GMSOFT_SIGNED`: base64 của JSON `{ signed, domain }`, domain thuộc sitelock | portal cấp riêng mỗi game |

Thiếu mục nào thì `pack` bỏ qua azgames và liệt kê mục còn thiếu.

## Vỏ làm gì (game không làm lại)
- `shell.html` nạp `gm.azgame.io/sdk/v3/gm-sdk.js`, `gm-iframe.js`, `api.azgame.io/static/lib/azgames/gmsdkv2.js`; đặt `AZ_SETTINGS`, `GM_GAME = { id: gameId, version }`, `GMSOFT_SIGNED`; canonical `https://azgames.io/<portalGid>`.
- `loader.js` — sitelock (`azgames.io`, `azgame.io` và subdomain): mở trực tiếp ngoài domain hoặc không có referrer → chuyển về `azgames.io/<portalGid>`; nhúng iframe trên domain lạ → đứng ở màn loading, không tải game. Chạy được thì `GMGameSDK.init(gameId, 'https://gm.azgame.io').setVersion(<v>)`, gửi `postMessage` `game_loaded` / `game_started` (kèm `load_time_ms`) cho trang cha, `trackEventParams('loaded_game')`.
- Bản quyền: "© <năm build> Azgames.io" → `platform.info.copyright`, popup Settings phải hiện.
- `allowedHosts`: `gm.azgame.io`, `api.azgame.io`, `azgames.io`.

## Adapter (`src/platform/adapters/azgames.ts`)
- Chỉ chuyển analytics: `track()` → `GMGameSDK.trackEventParams(event, data)`.
- `capabilities` đều `false`; `showAd()` trả `unavailable`. Quảng cáo, leaderboard qua gmsdkv2 chưa làm — cần tài liệu API của portal, không đoán.

## Đã biết
- `Icons/domain.webp` còn là placeholder (`placeholders` trong `portal.yaml`) — `release-check` cảnh báo.
- Gói có sitelock nên không chạy ở localhost; thử ở máy bằng gói `dev-mock`.
