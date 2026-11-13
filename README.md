# Đua Xe LIVE

Game đua xe tương tác cho TikTok LIVE. Người xem bình luận để vào đua và tặng quà để tăng tốc; xe tự chạy.

## Chạy game

1. Cài [Node.js](https://nodejs.org) bản LTS.
2. Windows: bấm đúp `start.bat`. Máy khác: chạy `npm install` một lần, rồi `node server.js`.
3. Màn hình game: http://localhost:3000 — bảng điều khiển: http://localhost:3000/admin

## Thử khi chưa LIVE

Trong bảng điều khiển, mục "Giả lập người xem": bình luận "1", thả tim, follow, tặng quà, hoặc bật ô tự tạo người xem ngẫu nhiên.

## Kết nối TikTok LIVE

1. Bắt đầu phiên LIVE trước.
2. Trong bảng điều khiển, nhập tên tài khoản đang LIVE rồi bấm Kết nối.
3. Dòng trạng thái báo "Đã kết nối" là xong. Tên tài khoản được nhớ cho lần sau.

Phần kết nối dùng thư viện `tiktok-live-connector`, không phải của TikTok phát hành. Nó dựa vào dịch vụ Euler Stream, bản miễn phí có giới hạn số lần kết nối. Nếu bị từ chối vì giới hạn, tạo khóa tại eulerstream.com và điền vào `eulerApiKey` trong `config.json`. Khi TikTok đổi hệ thống, chạy `npm update tiktok-live-connector`.

## Phát bằng TikTok LIVE Studio

1. Mở màn hình game trong một cửa sổ trình duyệt riêng, kéo cho cửa sổ cao và hẹp (khổ dọc).
2. Trong LIVE Studio chọn bố cục dọc, thêm nguồn quay cửa sổ và chọn cửa sổ đó.
3. Cắt bỏ thanh địa chỉ của trình duyệt, kéo cho game phủ kín khung hình.
4. Không quay cửa sổ bảng điều khiển.

## Luật chơi

| Người xem làm | Kết quả |
|---|---|
| Bình luận `1` | Vào đua, hoặc xếp hàng nếu đang đua |
| Thả tim | Tăng tốc rất nhẹ |
| Follow | Một lần Tăng tốc |
| Rose (1 xu) | Tăng tốc |
| Perfume (20 xu) | Siêu tốc |
| Doughnut (30 xu) | Tên lửa |
| Money Gun (500 xu) | Giông bão: làm chậm các xe phía trước |

Quà không có trong bảng được xếp theo giá xu. Người đua xong mà còn tương tác thì được giữ lại vòng sau.

## Chỉnh game

Mọi con số nằm trong `config.json`: giá quà và hiệu ứng, số vòng, tốc độ, số xe, thời gian chờ, từ cấm. Sửa xong thì chạy lại game.

## Cấu trúc

- `server.js` — luật chơi, trạng thái, lưu thành tích
- `tiktok.js` — cầu nối TikTok
- `public/index.html` — màn hình game 3D
- `public/admin.html` — bảng điều khiển
- `data/` — thành tích và cài đặt (tự tạo khi chạy)
