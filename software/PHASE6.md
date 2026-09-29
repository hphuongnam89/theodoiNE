# Phase 6 — Pilot, Bảo mật, Bàn giao nhân sự và Chuyển đổi vận hành (Cutover)

## 1. Đã hoàn thành

### 1.1. Quy trình bàn giao nhân sự và chuyển giao danh mục (Personnel Handoff & Transfer)
- **Giao diện & URL**: `/admin/users/transfer` (kèm nút truy cập nhanh tại `/admin/users`).
- **Nghiệp vụ**: Hỗ trợ Admin và Leader xử lý các tình huống nhân sự nghỉ việc, nghỉ thai sản, hoặc luân chuyển nhóm tuyển sinh.
- **Tính năng**:
  - Tự động thống kê khối lượng công việc hiện tại của nhân sự chuyển đi (Số Lead CRM, Số CTV phụ trách, Số lịch hẹn follow-up đang mở, Số dòng Excel đã gán).
  - Chọn nhân sự tiếp nhận bàn giao.
  - Cho phép chọn phạm vi chuyển giao linh hoạt: Toàn bộ Lead CRM, Toàn bộ CTV (cập nhật lịch sử hiệu lực), Các lịch hẹn follow-up đang mở, Các dòng Excel chưa kích hoạt.
  - Tùy chọn tự động khóa tài khoản nhân sự cũ (chuyển `status = 'REJECTED'`, xóa phiên đăng nhập đang hoạt động).
- **Quy tắc bảo toàn NE bất biến**:
  - Mọi NE phát sinh trước thời điểm bàn giao **vẫn giữ nguyên ghi nhận cho Sales cũ**.
  - Nếu sau này có hoàn toàn bộ học phí cho giao dịch cũ đó, −1 NE vẫn trừ vào chỉ số của Sales cũ tại ngày hoàn.
  - Toàn bộ lịch sử phân công được ghi nhận chi tiết vào `demo_lead_owner_assignments` và `demo_ctv_assignments`.
- **API backend**: `POST /api/demo/admin/users/transfer` (thực thi an toàn trong database transaction duy nhất, lưu audit log).

---

### 1.2. Trung tâm kiểm tra vận hành & Sao lưu dữ liệu (Operations & Backup Center)
- **Giao diện & URL**: `/admin/operations` (truy cập qua menu sidebar `Vận hành & Sao lưu`).
- **Chỉ số sẵn sàng vận hành (Cutover Readiness Score)**:
  - Tự động tính toán điểm sẵn sàng (thang 100) dựa trên 4 trụ cột:
    1. Tính toàn vẹn CSDL (Page Integrity & Foreign Keys).
    2. Cấu trúc tài khoản người dùng theo vai trò.
    3. Tình trạng đối soát học phí (giao dịch PENDING).
    4. Trạng thái giải quyết hàng chờ trùng lặp Excel.
- **Quản lý sao lưu dữ liệu (Snapshot Backups)**:
  - Nút **"Tạo bản sao lưu tức thì"**: Chạy `PRAGMA wal_checkpoint(TRUNCATE)` và tạo snapshot có timestamp tại `apps/web/data/backups/demo-backup-[TIMESTAMP].sqlite`.
  - Danh sách bảng các bản sao lưu với tên file, dung lượng, thời gian tạo.
  - Tính năng **"Khôi phục bản này"** dành riêng cho Admin (hệ thống tự động tạo bản sao lưu an toàn `pre-restore` trước khi ghi đè).
- **API backend**: `GET/POST /api/demo/admin/operations`.

---

### 1.3. Công cụ CLI độc lập phục vụ tự động hóa và DevOps
- **Sao lưu cơ sở dữ liệu**:
  ```powershell
  pnpm backup
  # Hoặc: node scripts/backup-db.mjs
  ```
- **Kiểm tra tính toàn vẹn CSDL (Integrity & Healthcheck)**:
  ```powershell
  pnpm integrity
  # Hoặc: node scripts/check-integrity.mjs
  ```

---

### 1.4. Bộ kiểm thử tự động ma trận phân quyền & bảo mật (RBAC & Security Test Suite)
- **Lệnh chạy**:
  ```powershell
  pnpm test:security
  # Hoặc: node scripts/test-rbac-security.mjs
  ```
- **Kết quả kiểm thử**: **13/13 test cases PASSED (100%)**:
  1. *Sales Isolation*: Sales A không thể xem, tìm kiếm hoặc đọc lead của Sales B.
  2. *Sales Isolation*: Sales B không thể đọc lead của Sales A.
  3. *Self Access*: Sales A xem được toàn bộ lead do mình phụ trách.
  4. *Admin/Leader Visibility*: Admin và Leader xem được toàn bộ dữ liệu.
  5. *Attribution Persistence*: NE lịch sử của Sales cũ bảo toàn 100% khi bàn giao CTV sang Sales mới.
  6. *CTV Attribution Persistence*: Manager CTV lịch sử vẫn ghi công Sales cũ.
  7. *SQL Injection*: Vector `' OR '1'='1` được tham số hóa an toàn.
  8. *SQL Injection*: Vector `'; DROP TABLE demo_leads;` không thể thực thi.
  9. *SQL Injection*: Vector `Robert'); DROP TABLE demo` bị triệt tiêu.
  10. *SQL Injection*: Vector `\%_test_escape` escaping an toàn.
  11. *SQL Injection*: Vector `' UNION SELECT * FROM demo_users` bị chặn.
  12. *Database Page Integrity*: Đạt chuẩn 100% không lỗi hỏng.
  13. *Foreign Keys*: 0 vi phạm khóa ngoại.

---

### 1.5. Kế hoạch chuyển đổi vận hành và Chạy song song (Cutover Runbook)
- Tài liệu chi tiết: `software/CUTOVER.md`.
- Hướng dẫn chạy song song 1–2 tuần giữa Excel và CRM.
- Danh mục kiểm tra ngày Go-live (Cutover Day Checklist).
- Kịch bản ứng phó sự cố và Rollback khẩn cấp.

---

## 2. Trạng thái kiểm tra và Biên dịch
- `pnpm build:web`: Thành công 100% (0 lỗi).
- `pnpm build:api`: Thành công 100% (0 lỗi).
- `pnpm test:security`: 13/13 tests passed.
- `pnpm integrity`: Database integrity OK, 0 foreign key violations.
- Next.js Web App đang chạy trực tiếp tại `http://127.0.0.1:3000`.
