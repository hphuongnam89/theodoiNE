# Phase 4 — Học phí, NE và dashboard MVP

## Đã làm

- Checklist hồ sơ theo lead: thiếu, đã nhận, đã xác minh. Sales chỉ đánh dấu nhận; Admin/Leader xác minh.
- Sổ khoản thu/hoàn học phí: số tiền nguyên VND, thời điểm ngân hàng, mã đối soát, tham chiếu khoản thu gốc khi hoàn; trạng thái chờ, xác nhận, từ chối; audit.
- Chỉ Admin/Leader xác nhận. Tổng hoàn một khoản thu không vượt khoản gốc, và theo thứ tự ngân hàng tổng số dư học phí không âm.
- Projection NE theo giao dịch đã duyệt, sắp theo ngày ngân hàng. 0→dương: +1; dương→0: −1. Duyệt giao dịch nhập muộn sẽ tính lại lịch sử sự kiện NE của lead trong cùng transaction.
- Lịch sử owner lead và CTV lưu thời điểm hiệu lực. +1 ghi nhận theo người quản lý CTV tại thời điểm NE, hoặc owner lead khi không có CTV. −1 quay về Sales được ghi nhận cho +1 tương ứng, ngay cả nếu CTV đã chuyển sau đó.
- Dashboard vận hành lấy số NE đã xác nhận theo ngày/tháng/Sales, số đang chờ, follow-up và nhật ký biến động. Phạm vi Sales áp dụng ở truy vấn server.

## Cần chú ý khi người dùng thử

- Dòng Excel lịch sử vẫn chưa được công nhận NE, chỉ là dữ liệu nguồn cần đối chiếu.
- Ngày giờ ngân hàng cần nhập chính xác; không có tích hợp ngân hàng trong demo. Thời điểm được lưu UTC, nhóm ngày dashboard theo UTC+7.
- Với giao dịch có ngày trước khi lead/CTV được tạo trên demo, attribution dùng owner đầu tiên được ghi trong lịch sử; cần xác minh thủ công trước khi duyệt dữ liệu lịch sử.
- Phần API NestJS/PostgreSQL production chưa được nối với UI demo. Không dùng SQLite demo như hệ thống vận hành thật.
