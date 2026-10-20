# Phong cách đồ hoạ: Mochi (mẫu)

> **Ví dụ đã điền** cho skill style-analysis: ảnh tham khảo là nhân vật mẫu Mochi của template.

> Phân tích từ 3 ảnh: `mochi-idle.png`, `mochi-hop.png`, `mochi-attack.png`. Số liệu đo: `analysis.json` (`gamekit style analyze`), bảng màu: `palette.png`.
> Mục **(đo)** do script viết, đừng sửa tay — chạy lại analyze. Mục **(nhìn)** do AI điền sau khi xem ảnh; người dùng duyệt cả tài liệu.
> Học **phong cách** (màu, nét, hình khối, cách tô), không chép nhân vật, logo, bố cục hay chi tiết nhận diện của ảnh tham khảo.

## 1. Tóm tắt (nhìn)
chibi tròn mềm, nét nâu đậm đều bao quanh mọi mảng, màu phẳng pastel ấm (kem, cam), không đổ bóng, mắt oval to có một đốm sáng

## 2. Bảng màu (đo)
| Màu | Diện tích | Vai trò (nhìn) |
| --- | --- | --- |
| `#fff1d6` | 44.4% | nền chính: lông |
| `#3b2a20` | 24% | nét viền và nét trong (mắt, miệng) |
| `#f5a25d` | 9.3% | điểm nhấn: đốm lông, đuôi |
| `#fffaf0` | 6.3% | bụng (sáng hơn lông một bậc) |
| `#ead6b6` | 5.2% | phần ở xa: tay, chân, tai phía sau (lông tối đi một bậc, cùng hue) |
| `#ffbcb6` | 1.7% | má hồng |
| `#ffa0ae` | 1.2% | trong tai |

- 6 màu phủ 90% diện tích. Độ sáng trung bình L* 70.9, tương phản 32.2. Độ bão hoà trung bình 17.7 (9.9% pixel rất rực), 100% màu nóng.
- Quy tắc màu (nhìn): không có bóng; chiều sâu chỉ bằng phần xa tối hơn phần gần một bậc cùng hue (#fff1d6 → #ead6b6); điểm nhấn cam cho mảng đốm và đuôi, < 10% diện tích

## 3. Nét (đo + nhìn)
- Có nét viền, màu `#3b2a20`, dày **2.52% chiều cao vật thể** (nhân vật cao 300 px → ~8 px). Nét trong (mắt, nếp, chi tiết): 10.5% diện tích bên trong.
- Chất nét (nhìn): nét đều, đầu tròn, khép kín, không hở; nét trong cùng màu và gần cùng độ dày với nét ngoài

## 4. Cách tô (đo + nhìn)
- phẳng (flat): 90.3% pixel là màu phẳng.
- không highlight trên mảng, chỉ đốm trắng trong mắt; không texture, không gradient

## 5. Hình khối và tỉ lệ (nhìn)
- Ngôn ngữ hình khối: tròn mềm: đầu oval rộng, thân hạt đậu, tay chân dạng ống bo tròn; không góc nhọn trừ đỉnh tai
- Tỉ lệ nhân vật: đầu : thân ≈ 1.2 : 1 (chibi); tay chân ngắn dạng ống, bàn tay tròn không ngón, bàn chân oval
- Khuôn mặt, mắt: mắt oval đen đặt thấp, lệch về phía mặt (góc 3/4), mắt xa nhỏ hơn mắt gần; một đốm sáng trắng mỗi mắt; miệng nhỏ hình chữ D; má hồng oval
- Mức chi tiết: ít chi tiết, đọc rõ ở cỡ 64 px; chi tiết nhỏ nhất (đốm sáng mắt) khoảng 3% chiều cao
- Silhouette: tỉ lệ khung 0.69, lấp đầy 58% khung (đo).

## 6. Ánh sáng và không khí (nhìn)
sáng đều, ấm, vui; không có hướng sáng rõ

## 7. Làm / Không làm (nhìn)
- Làm: nét nâu đậm đều quanh mọi mảng; màu phẳng; phần xa tối hơn một bậc cùng hue; đầu to, tay chân ống; mắt oval có đốm sáng
- Không làm: đổ bóng gradient; nét đen thuần hoặc nét mảnh dần; màu lạnh hoặc rực; ngón tay chi tiết; chép nhân vật hay đốm lông đặc trưng của ảnh tham khảo

## 8. Prompt style cho model ảnh (Codex)
Dán khối này vào mọi yêu cầu tạo ảnh, kèm 1–2 ảnh tham khảo (`--image`); phần chủ thể viết riêng cho từng asset:
```
Art style: chubby round chibi, even dark-brown outline around every shape, flat warm pastel colours, no cast shadows, big oval eyes with one white catchlight.
Palette: #fff1d6, #3b2a20, #f5a25d, #fffaf0, #ead6b6, #ffbcb6, #ffa0ae; outline #3b2a20.
Outline: solid #3b2a20, about 2.52% of the object's height, even width, round caps, closed.
Rendering: flat colours — no shading; far-side parts are one step darker in the same hue.
Shapes and proportions: 1.2:1 head-to-body, bean-shaped body, short tube limbs with round mitten hands, no fingers, soft rounded silhouettes, no sharp corners.
Transparent background, no text, no logo. Design a new subject; do not copy any character from the reference images.
```

## 9. Vẽ bằng code (vector)
```ts
export const STYLE = {
  c1: '#fff1d6', // 44.4% — đặt tên theo vai trò ở mục 2
  c2: '#3b2a20', // 24% — đặt tên theo vai trò ở mục 2
  c3: '#f5a25d', // 9.3% — đặt tên theo vai trò ở mục 2
  c4: '#fffaf0', // 6.3% — đặt tên theo vai trò ở mục 2
  c5: '#ead6b6', // 5.2% — đặt tên theo vai trò ở mục 2
  c6: '#ffbcb6', // 1.7% — đặt tên theo vai trò ở mục 2
  c7: '#ffa0ae', // 1.2% — đặt tên theo vai trò ở mục 2
  ink: '#3b2a20',
  inkWidth: (height: number) => Math.max(1, height * 0.0252),
};
```

## 10. Chuyển động hợp style (nhìn, cho skill animate)
khối tròn mềm → squash/stretch mạnh (0.7–1.3), nảy nhiều, đuôi và tai drag mạnh; mượt, không dùng step
