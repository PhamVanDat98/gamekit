# Checklist adapter portal

- [ ] API lấy từ tài liệu chính thức hoặc tài liệu người dùng đưa (ghi link/nguồn ở đầu file adapter)
- [ ] `capabilities` đúng với SDK
- [ ] `init()` tải SDK, chờ SDK sẵn sàng, ném lỗi rõ ràng nếu không tải được
- [ ] `showAd` chỉ resolve khi ad đã đóng hoàn toàn; map đủ shown / rewarded / skipped / unavailable / error
- [ ] Không tự pause/mute/gameplayStop trong adapter (createPlatform đã làm)
- [ ] Gọi đúng sự kiện loading và gameplay của SDK (nếu SDK có)
- [ ] Host CDN SDK có trong `release.allowedHosts`; không thêm link ngoài khác
- [ ] Tuân chính sách portal: tần suất ad, cấm quảng cáo bên ngoài, cấm link ra ngoài, giới hạn dung lượng
- [ ] Đã chạy thử trên môi trường test của portal: ad hiện, game dừng và tắt tiếng, resume đúng
- [ ] `gamekit pack --portal <portal>` và `release-check` sạch
