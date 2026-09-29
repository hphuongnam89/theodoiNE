# Phase 3 — CRM lead và chăm sóc (bản demo)

## Đã xây dựng

- Sales tạo lead trong phạm vi của mình. Admin/Leader chọn tài khoản Sales đã duyệt làm owner.
- Bắt buộc có điện thoại chuẩn hóa hoặc kênh liên hệ khác; cảnh báo trùng số điện thoại trong CRM và hai workbook trước khi lưu.
- Danh sách và chi tiết lead có phạm vi ở server. Sales chỉ đọc/sửa lead mình phụ trách; Admin/Leader xem tất cả và có thể chuyển owner.
- Pipeline Mới → Đã liên hệ → Đang tư vấn → Chờ hồ sơ → Chờ học phí; nhánh Lost cần lý do. Không cho đổi trạng thái thủ công thành NE.
- Lưu từng cuộc gọi, tin nhắn, cuộc hẹn, ghi chú và lịch follow-up; việc quá hạn và hoạt động 24 giờ hiện trên dashboard theo phạm vi.
- Sales tạo CTV của mình; Admin/Leader có thể chuyển CTV, giữ lịch sử thời điểm chuyển. Lead cũ không tự đổi owner khi CTV chuyển.
- Admin có thể duyệt từng CTV trong roster Excel và chọn Sales quản lý. Tên CTV trong lead Excel chỉ nối khi khớp duy nhất với CTV đã được duyệt.
- Dòng lead Excel đã được gán có thể chuyển vào CRM từng dòng sau khi chọn điện thoại, kiểm tra CTV và cảnh báo trùng. Nhãn nguồn `NE`, `Lost`, `NB`, `Convert` cần đối chiếu riêng; không tự kích hoạt. Vẫn giữ liên kết tới file/sheet/dòng gốc.
- Ghi audit cho tạo/chuyển trạng thái/chuyển owner lead, hoạt động, follow-up và CTV.

## Phạm vi demo và việc còn lại

- Dữ liệu Excel vẫn ở vùng chờ. Roster CTV và tên sales nguồn cần người quản trị duyệt. Không tự ghép các ứng viên trùng.
- NE lịch sử không được đưa thành NE chính thức. Phase sau cần quy trình ghi và xác nhận học phí, ngày tiền vào/hoàn, sự kiện NE +1/−1 và kiểm tra KPI.
- Chưa có chức năng sửa thông tin liên hệ lead, đính kèm hồ sơ, gửi nhắc lịch tự động, xuất dữ liệu hay phân trang toàn bộ lead vận hành. Danh sách demo hiện giới hạn 100 dòng mới nhất.
- Xác thực email/mật khẩu và SQLite chỉ phục vụ demo cục bộ; production cần IdP và PostgreSQL.

## Trạng thái hiện tại

Phase 3 đã được gộp vào MVP tại `http://127.0.0.1:3000`. Luồng học phí, NE và dashboard được mô tả trong `PHASE4-MVP.md`. Phần “việc còn lại” ở trên phản ánh mốc kết thúc Phase 3; một số mục đã hoàn thành ở Phase 4.
