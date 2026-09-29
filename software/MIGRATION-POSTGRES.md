# Hướng dẫn Migration từ SQLite sang PostgreSQL (Production)

Tài liệu này hướng dẫn quy trình chuyển đổi toàn bộ dữ liệu tuyển sinh từ cơ sở dữ liệu SQLite demo (`apps/web/data/demo.sqlite`) sang PostgreSQL production theo đúng đặc tả nghiệp vụ `Phase 0` và schema `phase1/schema.sql`.

---

## 1. Kiến trúc ánh xạ dữ liệu (Data Mapping)

| Bảng nguồn SQLite | Bảng đích PostgreSQL | Ghi chú chuyển đổi |
|---|---|---|
| `demo_users` | `app_users` | Trạng thái `ACTIVE` -> `is_active = true`, băm mật khẩu bảo toàn |
| `demo_ctv` | `ctv` | Danh mục cộng tác viên, liên kết sales quản lý |
| `demo_ctv_assignments` | `ctv_sales_assignments` | Lịch sử phân công CTV theo thời gian hiệu lực (`effective_from/to`) |
| `demo_leads` | `people` + `person_phones` + `applications` | Tách định danh người và hồ sơ tuyển sinh chuẩn 3NF |
| `demo_lead_owner_assignments` | `application_owner_events` | Lịch sử bàn giao Sales phụ trách |
| `demo_lead_stage_events` | `application_stage_events` | Lịch sử chuyển phễu tư vấn |
| `demo_lead_activities` | `activities` | Cuộc gọi, tin nhắn, cuộc hẹn, ghi chú |
| `demo_followups` | `follow_up_tasks` | Lịch hẹn liên hệ lại và trạng thái xử lý |
| `demo_lead_documents` | `document_items` | Checklist hồ sơ giấy tờ tuyển sinh |
| `demo_payments` | `payment_transactions` | Giao dịch học phí, chứng từ đính kèm, đối soát |
| `demo_ne_events` | `ne_events` | Biến động NE chính thức (+1 / -1), snapshot sales/CTV |
| `demo_crm_audit` | `audit_events` | Nhật ký truy vết toàn hệ thống |

---

## 2. Chuẩn bị môi trường

1. **Yêu cầu PostgreSQL:**
   - PostgreSQL 15 trở lên.
   - Extension `btree_gist` (đã có trong `phase1/schema.sql`).
2. **Biến môi trường:**
   Thiết lập chuỗi kết nối:
   ```bash
   # Linux / macOS
   export DATABASE_URL="postgresql://postgres:matkhau@localhost:5432/ne_crm"

   # Windows PowerShell
   $env:DATABASE_URL="postgresql://postgres:matkhau@localhost:5432/ne_crm"
   ```

---

## 3. Quy trình thực hiện Migration

### Bước 1: Khởi tạo cơ sở dữ liệu PostgreSQL
```bash
createdb ne_crm
psql $DATABASE_URL -f ../phase1/schema.sql
```

### Bước 2: Chạy kiểm tra không ghi (Dry-Run)
Lệnh này đọc dữ liệu SQLite, kiểm tra tính toàn vẹn khóa ngoại, định dạng UUID và cấu trúc quan hệ mà **không ghi** vào PostgreSQL:
```bash
cd software
node scripts/migrate-sqlite-to-postgres.mjs --dry-run
```
Kiểm tra bảng kết quả in ra màn hình. Đảm bảo:
- `Toàn bộ khóa ngoại và quan hệ dữ liệu hợp lệ 100%!`.
- Không có lỗi orphan record hoặc ID sai định dạng.

### Bước 3: Thực thi Migration chính thức
Khi chạy có `DATABASE_URL` và không có `--dry-run`:
```bash
node scripts/migrate-sqlite-to-postgres.mjs
```
- Quá trình chạy diễn ra hoàn toàn trong một **Database Transaction** (`BEGIN` ... `COMMIT`).
- Nếu phát sinh bất kỳ lỗi nào, script sẽ tự động thực hiện `ROLLBACK`, đảm bảo database đích không bị bẩn hoặc mất dữ liệu dở dang.

---

## 4. Đối soát số liệu sau Migration (Reconciliation)

Chạy truy vấn SQL trên PostgreSQL để đối chiếu khớp 100% với SQLite:
```sql
SELECT 
  (SELECT COUNT(*) FROM app_users) AS users_count,
  (SELECT COUNT(*) FROM ctv) AS ctv_count,
  (SELECT COUNT(*) FROM applications) AS applications_count,
  (SELECT COUNT(*) FROM payment_transactions) AS payments_count,
  (SELECT COALESCE(SUM(delta), 0) FROM ne_events) AS net_ne_count;
```

---

## 5. Kế hoạch Cutover và Rollback

1. **Thời điểm Cutover:** Thực hiện ngoài giờ hành chính (sau 19:00).
2. **Khóa ghi SQLite:** Chuyển ứng dụng demo SQLite sang trạng thái Read-only.
3. **Chạy Migration:** Chạy script và kiểm tra kết quả đối soát.
4. **Đổi cấu hình API:** Cập nhật `DATABASE_URL` trong NestJS API (`apps/api`).
5. **Kịch bản Rollback:** Nếu quá trình gặp sự cố không thể khắc phục trong 30 phút:
   - Giữ nguyên database SQLite hiện tại.
   - Revert biến môi trường về chạy demo SQLite.
   - Tiếp tục phục vụ người dùng trong khi phân tích log.
