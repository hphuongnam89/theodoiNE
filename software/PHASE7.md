# Phase 7 — Tự động hóa vận hành nâng cao: Hoa hồng CTV, Chấm điểm Lead và SLA

## 1. Mục tiêu

Phase 7 bổ sung các cơ chế tự động hóa giúp đội tuyển sinh ưu tiên đúng lead, theo dõi cam kết phản hồi và quản lý khoản phải trả cho cộng tác viên (CTV). Các nghiệp vụ vẫn tuân thủ nguyên tắc: chỉ phát sinh NE sau khi giao dịch học phí dương được Admin/Leader đối soát và duyệt.

## 2. Tính năng đã triển khai

### 2.1. Vòng đời hoa hồng CTV (Phase 7A)

- Quản lý chính sách tại bảng `demo_commission_policies`, có thể áp dụng theo ngành hoặc khóa tuyển sinh.
- Khi một NE hợp lệ phát sinh từ lead có CTV, hệ thống tạo khoản hoa hồng ở trạng thái `ACCRUED`.
- Vòng đời khoản chi: `ACCRUED` → `APPROVED` → `PAID`; có trạng thái `CANCELLED` khi giao dịch bị hoàn toàn bộ.
- Lưu người duyệt, người chi, thời điểm, mã UNC và audit log.
- Giao diện: `/crm/commissions`.
- API: `/api/demo/crm/commissions`, `/api/demo/crm/commissions/policies`, `/api/demo/crm/commissions/export`.

### 2.2. Chấm điểm tiềm năng Lead (Phase 7B)

- Tính điểm theo dữ liệu hồ sơ, chương trình học, hoạt động tư vấn, chứng từ và lịch follow-up.
- Phân tầng tự động:
  - `COLD`: dưới 45 điểm.
  - `WARM`: từ 45 đến dưới 70 điểm.
  - `HOT`: từ 70 điểm trở lên.
- Khoản phạt follow-up quá hạn được hiển thị cùng các yếu tố tạo điểm để Sales biết lý do và hành động tiếp theo.
- Điểm và tier hiển thị tại danh sách lead, trang chi tiết lead và dashboard.

### 2.3. Giám sát SLA chăm sóc (Phase 7B)

- Phát hiện lead mới chưa được liên hệ sau 24 giờ.
- Phát hiện lead đang chăm sóc nhưng không có hoạt động mới trong hơn 5 ngày.
- Phát hiện lịch hẹn follow-up mở đã quá hạn.
- Bỏ qua SLA chăm sóc đối với lead đã đạt NE chính thức.
- Giao diện: `/crm/sla`, kèm cảnh báo và bộ lọc tại `/crm/leads`.
- Dashboard hiển thị tỷ lệ tuân thủ và số lead đang vi phạm theo phạm vi quyền của người dùng.

### 2.4. Kiểm thử Phase 7C

Script `scripts/test-phase7c-features.mjs` kiểm tra trong dữ liệu test cô lập:

- Tạo chính sách và khoản hoa hồng khi có NE.
- Duyệt, chi và ghi nhận mã tham chiếu thanh toán.
- Hủy hoa hồng khi hoàn tiền toàn bộ.
- Các tier điểm `COLD`, `WARM`, `HOT` và điểm phạt follow-up.
- Phát hiện vi phạm SLA lead mới và follow-up quá hạn.
- `PRAGMA integrity_check` và `PRAGMA foreign_key_check`.

Chạy từ thư mục `software`:

```powershell
pnpm test:phase7c
```

## 3. Quy trình vận hành đề xuất

1. Admin tạo hoặc cập nhật chính sách hoa hồng trước mỗi khóa tuyển sinh.
2. Sales xử lý các lead `HOT` trước, sau đó đến `WARM`; các lead vi phạm SLA phải được xử lý trong ngày.
3. Admin/Leader đối soát giao dịch học phí và duyệt NE.
4. Người có quyền duyệt hoa hồng kiểm tra khoản `ACCRUED`, sau đó chuyển `APPROVED` và `PAID` khi có chứng từ chi.
5. Chạy backup và integrity check theo lịch vận hành trong `CUTOVER.md`.

## 4. Tiêu chí hoàn thành Phase 7

- Không có khoản hoa hồng không gắn với NE hợp lệ.
- Khoản đã `PAID` có người chi, thời điểm chi và mã tham chiếu.
- Dashboard hiển thị điểm lead và SLA đúng phạm vi quyền.
- Kiểm thử Phase 7C không có lỗi; không phát sinh lỗi toàn vẹn hoặc khóa ngoại.
- Các thay đổi quan trọng có audit log và có thể truy xuất theo lead, CTV, Sales và chính sách.

## 5. Việc tiếp theo

- Kết nối cổng chi hoặc file thanh toán ngân hàng nếu cần tự động hóa bước `PAID`.
- Thêm thông báo email hoặc Slack cho SLA nghiêm trọng.
- Đưa chính sách hoa hồng và ngưỡng SLA thành cấu hình theo từng khóa thay vì giá trị mặc định.
- Bổ sung báo cáo xu hướng điểm lead, tỷ lệ vi phạm SLA và chi phí hoa hồng theo tháng.
