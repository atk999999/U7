# PK LOẠN CHIẾN — VÒNG 1 · 0.1.43

Avatar Diệp Tu xuất hiện khi chọn nhân vật; avatar Huyết Dự xuất hiện khi giáng lâm và cạnh thanh máu boss. Ảnh WebP gốc nằm trong `public/assets/avatars/`. Chọn Diệp Tu, sau 5 giây Huyết Dự · Kim Đan cảnh giáng lâm; boss có AI, kỹ năng, thắng/thua và chơi lại. Chạy dưới dạng React 19 + Vite trong Google AI Studio.

# PK LOẠN CHIẾN — AI Studio 0.1.40

Bản sửa kỹ năng Huyết Dự; Huyết Bạo dùng phần HP đã mất khi kích hoạt làm sát thương và giữ 1% HP sau khi nổ, chỉ dùng một lần mỗi lượt. Đã sửa trừ mana, chồng chiêu, vùng hoạt động Huyết Thủ, mana mục tiêu, hiệu ứng trúng đòn và bại trận.

# PK LOẠN CHIẾN — AI Studio 0.1.33

Chuyển nguyên bản game HTML offline `LoanChien_0_1_32_AutoTarget900_TrackingNhe_OFFLINE.html` sang **React 19 + Vite + TypeScript**, dùng cho **Google AI Studio Build**.

## Sử dụng

1. Giải nén toàn bộ project, đưa source vào dự án Google AI Studio (hoặc đưa lên GitHub và nạp source). Không chỉ sao chép `index.html`: cần cả `src/`, `public/`, `package.json`, `vite.config.ts`.
2. Nếu chạy trên PC: `npm install`, sau đó `npm run dev`.
3. Build: `npm run build` → `dist/` là web tĩnh, không cần API key hay máy chủ backend.

## Chỉnh sửa game bằng AI Studio

- `src/App.tsx` — JSX giao diện chính, bảng Cài đặt / Giới thiệu / thanh HP-MP / nút cảm ứng.
- `src/game/game.css` — mọi kiểu hiển thị, joystick, giao diện dọc/ngang.
- `src/game/engine.js` — **logic nguyên bản**: Diệp Tu, 17 bộ hoạt ảnh, va chạm, địa tầng, Hỏa Cầu, tìm mục tiêu 900 đơn vị, đạn truy đuổi 70°/giây và âm thanh.
- `src/game/pixelfx.js` — thư viện PixelFX v0.3.0 và hiệu ứng gốc, **không thay kỹ năng bằng Canvas tự vẽ**.
- `public/assets/sprites/` — 17 dải WebP của Diệp Tu gốc (20 sprite keys bao gồm các khung tăng cường), giữ nguyên nhịp.
- `public/assets/backgrounds/` — 3 phông nền WebP.

> Quan trọng: Khi nâng cấp kỹ năng, tiếp tục dùng PixelFX. Giữ Diệp Tu WebP gốc và cập nhật mục Giới thiệu phiên bản trong `src/App.tsx` mỗi lần sửa.

## Lưu ý

- Nguồn HTML gốc nhúng ảnh dạng Base64. Bản AI Studio tách ảnh thành WebP thực để chỉnh sửa/đổi nhân vật dễ hơn; không thay đổi dữ liệu hình ảnh.
- Engine được nạp **sau khi** React dựng giao diện; không bật React `StrictMode` vì engine quản lý animation loop.
- Asset là đường dẫn tương đối nên deploy vào thư mục con (GitHub Pages) được. Ảnh tải từ chính bản build, không cần Internet sau khi tải trang.
- Đây là dự án React/Vite thực sự, không phải iframe bao HTML gốc.


## Va chạm kỹ năng 0.1.42

- Hỏa Cầu va chạm Huyết Thủ và từng sợi Huyết Kim Tuyến; từng Thủy Kiếm va chạm Huyết Thủ.
- Lực va chạm hiện tại: Hỏa Cầu dùng sát thương gốc theo mức tụ, Thủy Kiếm 110/130/180, Huyết Thủ 150, mỗi sợi Huyết Kim Tuyến 12. Đây là các giá trị có thể cân chỉnh.
- Chiêu mạnh hơn giữ phần lực còn lại và sát thương được giảm theo tỷ lệ này. Bằng lực thì cả hai tan.
- Ngũ Hành, Thôn Linh và Huyết Bạo không phải đường đạn; Huyết Bạo vẫn có thể bị ngắt khi đang thi triển và khiên vẫn hoạt động theo cơ chế sẵn có.
- Kiểm tra quy tắc va chạm: `node tests/va-cham-ky-nang.test.mjs`.
