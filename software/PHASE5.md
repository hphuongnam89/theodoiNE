# Phase 5 — Hàng chờ xử lý trùng lặp, Phễu chuyển đổi và Dashboard phân tích chuyên sâu

## 1. Đã hoàn thành

### 1.1. Hàng chờ xử lý trùng lặp và kích hoạt dữ liệu Excel (Deduplication Queue & Staging Activation)
- **Giao diện & URL**: `/admin/import/duplicates` (kèm banner truy cập nhanh tại `/admin/import` và menu sidebar).
- **Phát hiện trùng lặp**:
  - Tự động gom cụm theo số điện thoại chuẩn hóa (`phone_normalized`).
  - Hệ thống ghi nhận **340 nhóm SĐT trùng** liên quan tới **729 dòng nguồn Excel**.
  - Đối chiếu chéo realtime với danh bạ lead đang vận hành trong CRM (`demo_leads`).
- **Thao tác xử lý an toàn (Admin / Leader)**:
  - Xem đối chiếu chi tiết từng bản ghi trong nhóm: Tên học viên, File nguồn, Sheet nguồn, Dòng nguồn, Ngành đào tạo, Trạng thái nguồn, Người phụ trách/CTV nguồn.
  - Phân công Sales phụ trách trực tiếp trên từng bản ghi.
  - **Kích hoạt vào CRM**: Chuyển bản ghi được chọn thành Lead chính thức (`demo_leads`) với trạng thái ban đầu `NEW`, nguồn `EXCEL_IMPORT`. Có tùy chọn tự động đánh dấu bỏ qua các dòng trùng còn lại trong cùng nhóm.
  - **Bỏ qua dòng trùng / Bỏ qua cả nhóm**: Gắn cờ `SKIPPED_DUPLICATE` và lưu audit log.
  - **Nguyên tắc cốt lõi**: Tuyệt đối không tự động công nhận NE từ Excel lịch sử khi kích hoạt. Mọi NE chỉ được sinh ra từ giao dịch học phí dương đã được Admin/Leader đối soát và phê duyệt.

### 1.2. Phễu chuyển đổi tuyển sinh (Conversion Funnel)
- Tích hợp trên Dashboard tổng quan `/` cho cả Admin, Leader và Sales (tự động phân quyền scope).
- 5 giai đoạn phễu chuẩn hóa:
  1. **Tiếp nhận lead**: Tổng số hồ sơ được đưa vào quy trình chăm sóc.
  2. **Đã liên hệ**: Đã kết nối, gọi điện hoặc nhắn tin trao đổi ban đầu.
  3. **Đang tư vấn**: Đang cung cấp thông tin ngành học, lộ trình đào tạo và học phí.
  4. **Chờ hồ sơ & học phí**: Đã đồng ý tham gia, đang hoàn tất thủ tục và học phí.
  5. **Đạt NE chính thức**: Học viên đã nộp học phí dương được Admin/Leader duyệt.
- Trực quan hóa tỷ lệ chuyển đổi lũy kế (`conversionPercent`) và tỷ lệ rơi rớt qua từng chặng (`dropPercent`).
- Các chip trạng thái thực tế: Mới, Đã liên hệ, Đang tư vấn, Chờ hồ sơ, Chờ học phí, Đạt NE, Dừng chăm sóc.

### 1.3. Phân tích đa chiều (Ngành đào tạo & Kênh nguồn)
- **Bảng phân tích theo Ngành học (Program Breakdown)**: Thống kê số lượng lead, số NE đạt được và tỷ lệ chuyển đổi % cho từng ngành đào tạo.
- **Bảng phân tích theo Kênh nguồn (Source Breakdown)**: Thống kê hiệu quả tuyển sinh theo từng kênh (Cộng tác viên, Dữ liệu Excel, Facebook, Google, Website, Trực tiếp/Hotline...).

### 1.4. Tính năng Drill-Down tương tác
- Nhấp vào bất kỳ chặng phễu, chip trạng thái, ngành học hoặc kênh nguồn sẽ chuyển hướng trực tiếp sang danh sách lead `/crm/leads` với bộ lọc tương ứng (`?stage=...`, `?program=...`, `?source=...`, `?filter=...`).
- Thanh lọc tìm kiếm thông minh tại `/crm/leads`: Hiển thị chip các tiêu chí đang lọc và nút một chạm "Xóa hết lọc".
- Xuất file CSV/Excel UTF-8 BOM (`/api/demo/crm/export?type=leads`) kế thừa đầy đủ tất cả các điều kiện lọc drill-down.

### 1.5. Trung tâm cảnh báo vận hành (Operational Alerts Hub)
- Thay thế các cảnh báo tĩnh bằng thẻ cảnh báo tương tác phân loại theo mức độ ưu tiên:
  - **Học phí chờ đối soát** (Ưu tiên cao): Dẫn trực tiếp tới `/finance?status=PENDING`.
  - **Lịch hẹn follow-up quá hạn** (Ưu tiên cao): Dẫn trực tiếp tới `/crm/leads?filter=overdue`.
  - **Hồ sơ thiếu chứng từ/giấy tờ** (Cần xử lý): Dẫn trực tiếp tới `/crm/leads?filter=missing_docs`.
  - **Hàng chờ SĐT trùng từ Excel** (Dành cho Admin/Leader): Dẫn trực tiếp tới `/admin/import/duplicates`.
  - **Dòng Excel chưa gán Sales** (Dành cho Admin/Leader): Dẫn trực tiếp tới `/admin/import`.

---

## 2. Kiểm thử và Xác minh
- **Biên dịch TypeScript Web**: `pnpm build:web` thành công 100% (0 lỗi).
- **Biên dịch NestJS API**: `pnpm build:api` thành công 100% (0 lỗi).
- **Kiểm thử logic giao dịch & deduplication**: Script `verify-phase5.js` kiểm tra transaction an toàn, gán Sales và phát hiện trùng khớp CRM.
- **Hệ thống đang chạy**: Next.js App Router tại `http://127.0.0.1:3000`.
