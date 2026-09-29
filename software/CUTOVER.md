# Kế hoạch chuyển đổi vận hành và Chạy song song (Cutover & Parallel Run Runbook)

Tài liệu này hướng dẫn chi tiết quy trình chuyển đổi từ theo dõi thủ công qua các file Excel sang hệ thống CRM tuyển sinh tập trung NBS CRM, kèm quy trình chạy song song, bàn giao nhân sự và kịch bản ứng phó sự cố/rollback.

---

## 1. Mục tiêu và Nguyên tắc chuyển đổi

1. **Một nguồn sự thật duy nhất (Single Source of Truth)**:
   - Số liệu KPI và NE chính thức chỉ được công nhận thông qua giao dịch học phí dương đã được Admin/Leader đối soát và phê duyệt trên CRM.
   - Sau thời điểm Cutover, hai file Excel gốc (`1. THEO DÕI NE.xlsx` và `2. KHONG THEO DOI NE.xlsx`) chuyển sang trạng thái **lưu trữ chỉ đọc (Archive / Read-Only)**.
2. **Bảo toàn dữ liệu lịch sử**:
   - Mọi dòng trong Excel nguồn đều được bảo lưu nguyên vẹn tham chiếu nguồn (File, Sheet, Dòng).
   - Dữ liệu lịch sử không tự biến thành NE chính thức; chỉ trở thành Lead khi được kích hoạt hoặc giải quyết trùng lặp.
3. **Phân quyền tuyệt đối (Zero Trust RBAC)**:
   - Sales chỉ xem và xử lý các hồ sơ trong phạm vi được giao (Lead do mình phụ trách, CTV do mình quản lý, NE được ghi nhận).
   - Leader và Admin xem toàn bộ dữ liệu.

---

## 2. Chiến lược chạy song song (Parallel Run)

Trong giai đoạn chuyển tiếp (thời lượng khuyến nghị: **1 đến 2 tuần**):

1. **Nhập liệu**:
   - Mọi lead mới phát sinh từ ngày chạy song song bắt buộc phải tạo trực tiếp trên CRM (`/crm/leads`).
   - Mọi khoản thu hoặc hoàn học phí phải được nhập trên CRM kèm mã giao dịch ngân hàng và chứng từ thanh toán.
2. **Đối soát hàng ngày (Daily Reconciliation)**:
   - Cuối mỗi ngày làm việc (17:30 - 18:00), Leader/Admin đối chiếu:
     - Biến động NE trên Dashboard (`/ne-events`) với biến động số dư thực tế tại tài khoản ngân hàng nhà trường.
     - Số liệu báo cáo ngày của các nhóm Sales với số liệu trên CRM.
3. **Xử lý sai lệch**:
   - Nếu có giao dịch trên ngân hàng chưa có trên CRM: Yêu cầu Sales phụ trách tạo khoản thu và đính kèm chứng từ ngay.
   - Nếu có khoản thanh toán bị từ chối: Nêu rõ lý do trên CRM để Sales nắm thông tin và đối chiếu lại với học viên.

---

## 3. Các cổng nghiệm thu bắt buộc (Acceptance Gates)

| Cổng nghiệm thu | Tiêu chí đánh giá | Trạng thái kỹ thuật |
|---|---|---|
| **1. Nghiệm thu Nghiệp vụ** | Công thức tính NE (+1 khi số dư học phí > 0, −1 khi hoàn toàn bộ tại ngày hoàn) hoạt động chính xác. | Đã hoàn thành (Phase 4 & 5) |
| **2. Nghiệm thu Phân quyền** | Bộ test tự động ma trận RBAC (`pnpm test:security`) đạt 100% PASS (13/13 tests). Sales không thể xem chéo hoặc duyệt tiền. | Đã hoàn thành (Phase 6) |
| **3. Nghiệm thu Dữ liệu** | 1.960 dòng Excel đã vào vùng chờ; 340 nhóm SĐT trùng có hàng chờ duyệt `/admin/import/duplicates`. | Đã hoàn thành (Phase 5) |
| **4. Nghiệm thu Vận hành** | Cơ chế sao lưu tự động và kiểm tra tính toàn vẹn CSDL (`PRAGMA integrity_check`) đạt OK 100%. | Đã hoàn thành (Phase 6) |

---

## 4. Kế hoạch ngày Go-live (Cutover Day Checklist)

### Giai đoạn chuẩn bị (T - 1 ngày)
- [ ] Thông báo toàn bộ đội ngũ tuyển sinh và tài chính về thời điểm chính thức ngừng sửa file Excel.
- [ ] Chạy kiểm tra toàn vẹn CSDL:
  ```powershell
  pnpm integrity
  ```
- [ ] Chạy bộ kiểm thử phân quyền tự động:
  ```powershell
  pnpm test:security
  ```
- [ ] Phê duyệt toàn bộ các tài khoản người dùng đang ở trạng thái `PENDING` tại `/admin/users`.

### Ngày Go-live (T - Day)
- [ ] **Bước 1: Khóa file Excel nguồn**
  - Chuyển thuộc tính các file Excel sang Read-Only trên hệ thống tệp.
- [ ] **Bước 2: Tạo bản sao lưu cơ sở dữ liệu mốc Go-live**
  - Thực hiện trên giao diện `/admin/operations` hoặc chạy lệnh:
    ```powershell
    pnpm backup
    ```
- [ ] **Bước 3: Đối soát số dư học phí và hàng chờ trùng lặp**
  - Kiểm tra Trung tâm kiểm tra vận hành tại `/admin/operations` đảm bảo điểm Readiness đạt mức an toàn (≥ 85/100).
- [ ] **Bước 4: Phát lệnh chuyển vận hành chính thức**
  - Toàn bộ Sales đăng nhập vào hệ thống CRM tại `http://127.0.0.1:3000` (hoặc domain production).

---

## 5. Quy trình bàn giao nhân sự nghỉ việc / luân chuyển (Personnel Handoff)

Khi có nhân sự Sales nghỉ việc hoặc chuyển bộ phận:

1. **Truy cập**: Quản trị viên truy cập màn hình `/admin/users/transfer`.
2. **Chọn nhân sự**:
   - Chọn nhân sự chuyển đi (`Source Sales`). Hệ thống hiển thị đầy đủ thống kê Lead, CTV, việc cần làm và dòng Excel đang phụ trách.
   - Chọn nhân sự tiếp nhận (`Target Sales`).
3. **Chọn phạm vi chuyển giao**:
   - Chuyển giao toàn bộ Lead CRM.
   - Chuyển giao toàn bộ CTV do nhân sự quản lý (lưu lịch sử hiệu lực).
   - Chuyển giao lịch hẹn follow-up đang mở.
   - Tùy chọn khóa tài khoản nhân sự cũ (chuyển trạng thái sang `REJECTED`, xóa phiên đăng nhập).
4. **Quy tắc bất biến về NE**:
   - Mọi NE phát sinh trước thời điểm bàn giao **vẫn giữ nguyên ghi nhận cho Sales cũ**.
   - Nếu sau này có hoàn tiền cho giao dịch cũ đó, −1 NE vẫn trừ vào chỉ số của Sales cũ tại ngày hoàn.
   - Các chuyển đổi mới sau ngày bàn giao được ghi nhận cho Sales mới.

---

## 6. Kịch bản ứng phó sự cố và Rollback (Rollback Plan)

Trong trường hợp phát hiện sự cố nghiêm trọng trong vòng 24 giờ sau Cutover:

1. **Khôi phục từ bản sao lưu gần nhất**:
   - Truy cập `/admin/operations` -> chọn bản sao lưu an toàn -> bấm **Khôi phục bản này**.
   - Hoặc khôi phục thủ công qua tệp:
     ```powershell
     Copy-Item "apps/web/data/backups/demo-backup-[TIMESTAMP].sqlite" "apps/web/data/demo.sqlite" -Force
     ```
2. **Xuất dữ liệu dự phòng**:
   - Mọi dữ liệu Lead, Tài chính và Sự kiện NE đều có thể xuất ra file CSV UTF-8 BOM qua các endpoint `/api/demo/crm/export` để đối soát khẩn cấp.
3. **Liên hệ đầu mối hỗ trợ**:
   - Kỹ thuật / Quản trị hệ thống phụ trách CSDL và máy chủ web.
