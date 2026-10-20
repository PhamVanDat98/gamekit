---
name: platform-sdk
description: Dùng ở pha P4 khi gắn game vào một portal hoặc SDK quảng cáo (SDK riêng của người dùng như gmsdkv2.js, Google H5 Games Ads, CrazyGames, GameDistribution, Weegoo…) — viết adapter mỏng theo interface platform chung, test với dev-mock, đóng gói mỗi portal một bản.
---

# Gắn SDK portal

Gameplay chỉ gọi `Platform` (`src/platform/types.ts`). Mỗi portal là một **adapter mỏng** trong `src/platform/adapters/<portal>.ts`. Các luật bắt buộc trên mọi portal đã nằm sẵn trong `createPlatform()` — adapter không cần (và không được) tự làm lại:
- pause + tắt tiếng khi ad chạy (PauseBus), resume khi ad đóng, kể cả khi SDK ném lỗi hoặc không bao giờ báo lại (hết `adTimeoutMs`, mặc định 60 giây → `error`);
- SDK tải lỗi hoặc `init()` quá 10 giây → game vẫn chạy với adapter offline (không ad), ghi event `error`;
- gameplay start/stop theo đúng ý game: ad buộc dừng, ad đóng thì theo trạng thái game muốn lúc đó (game thoát ra menu giữa ad thì không bật lại);
- không chồng hai ad; ad không hỗ trợ → `unavailable` mà không pause;
- chỉ nhận tên event trong `src/platform/events.ts`;
- save fallback localStorage có namespace.

## Bản quyền, vỏ portal
- `Platform.info = { portal, copyright }`. `bootPlatform()` lấy `copyright` từ `GM_LOADER.copyright`, mà loader lấy từ `copyright:` trong `portals/<id>/portal.yaml` (azgames: "© <năm> Azgames.io"; dev-mock: "© <năm> GameKit (dev)").
- Popup Settings (`src/view/settings.ts`) **bắt buộc giữ footer** `platform.info.copyright`, hiện ở mọi ngôn ngữ, không qua bản dịch. Reskin không được bỏ; `release-check` bắt nếu `framework.js` không có footer `gk-settings-footer`.
- Vỏ portal (trang HTML, loader, sitelock, khởi tạo SDK) nằm trong plugin: `portals/<id>/{portal.yaml, kit.mjs, shell.html, loader.entry.js}` (+ `Icons/domain.webp`). Adapter trong game không làm lại phần này.
- Adapter `azgames` hiện chỉ có thông tin portal và analytics (`GMGameSDK.trackEventParams`); quảng cáo báo `unavailable`, leaderboard chưa làm.

## Không đoán API
Chỉ viết adapter từ **tài liệu chính thức hoặc tài liệu/tiêu chuẩn người dùng cung cấp**. Thiếu thông tin (vd Weegoo, SDK riêng) → hỏi người dùng, ghi câu hỏi vào DECISIONS.md, không bịa tên hàm.

## Thêm một portal
0. Portal chưa có bộ vỏ trong plugin (`portals/<id>/`: `portal.yaml` với copyright, allowedHosts, sitelock, settings, checklist, store; `kit.mjs`; `shell.html`; `loader.entry.js`; `Icons/domain.webp`) → đây là việc của người bảo trì GameKit, làm theo `portals/azgames/` và tài liệu đóng gói của portal. Thiếu bộ vỏ thì `config`, `pack`, `validate` báo "Không có bộ vỏ portal".
1. Đọc tài liệu SDK; tóm tắt vào `references/portals/<portal>.md` của plugin (API, chính sách ad, yêu cầu nộp game, giới hạn dung lượng, cấm link ngoài…).
2. Tạo `src/platform/adapters/<portal>.ts` từ `references/adapter-template.ts`: export `createAdapter(): PortalAdapter`. Tải script SDK (nếu cần) trong `init()`.
3. Khai báo `capabilities` đúng sự thật (banner, rewarded, leaderboard, cloud save…).
4. `gamekit config --portal <portal>`: thêm portal vào game.yaml, hỏi thông tin của portal và chép checklist vào `gates/P4.md`. Host CDN của SDK thuộc `allowedHosts` trong `portal.yaml` của bộ vỏ (dùng cho mọi game); `release.allowedHosts` của game chỉ cho host riêng của game.
5. Test: logic dịch thuần (map kết quả SDK → `AdResult`, map event) viết unit test với SDK giả; còn lại chạy `npm run dev` với build portal đó (`GK_PORTAL=<portal> npx vite`) và test trên môi trường thử của portal.
6. `gamekit pack --portal <portal>` → `gamekit release-check --portal <portal>`.

## Gọi quảng cáo trong game
- Interstitial chỉ ở điểm nghỉ: hết màn, quay lại menu, trước khi chơi lại. Không bao giờ giữa lúc người chơi đang thao tác.
- Rewarded chỉ khi người chơi chủ động bấm (hồi sinh, nhân thưởng); thưởng chỉ khi kết quả là `rewarded`.
- Gọi `loadingProgress`/`loadingEnd` khi tải, `gameplayStart`/`gameplayStop` khi vào/ra màn chơi.

Checklist đủ: `references/adapter-checklist.md`.
