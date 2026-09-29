# Phase 1 — Đối soát và thiết kế dữ liệu

Hai file Excel gốc nằm ở thư mục cha. Các script chỉ đọc Excel và ghi kết quả vào `reports/`.

## Chạy lại

```powershell
python -m pip install -r phase1/requirements.txt
python phase1/audit_workbooks.py
python phase1/prepare_mapping_review.py
python phase1/dry_run_import.py
```

Trong môi trường Codex hiện tại, `openpyxl 3.1.5` đã có sẵn. Không cần cài đặt để xem các báo cáo đã tạo.

## Tệp bàn giao

- `Báo cáo đối soát dữ liệu.md`: số liệu, lỗi và thứ tự xử lý.
- `Thiết kế dữ liệu và import.md`: ERD, quyền xem, thanh toán/NE và luồng import.
- `schema.sql`: lược đồ PostgreSQL dự thảo, chưa chạy vào database.
- `audit_workbooks.py`: audit nguồn, tạo `source_profile.json`, `review_queue.csv`, `duplicate_candidates.csv`, `kpi_reconciliation.csv`.
- `prepare_mapping_review.py`: tạo `sales_roster_draft.csv`, `sales_alias_review.csv`, `ctv_alias_review.csv`, `ctv_roster_review.csv`.
- `dry_run_import.py`: import thử trong bộ nhớ, tạo `import_preview.csv`, `lead_ne_link_candidates.csv`, `import_dry_run_summary.json`; không ghi database hoặc file Excel gốc.
- `import_demo_sqlite.py`: đọc lại hai workbook đã audit, nhập 1.960 dòng đã chuẩn hóa và 31 tên roster CTV vào SQLite demo tại `software/apps/web/data/demo.sqlite`. Script idempotent theo SHA-256, không tạo NE chính thức, không gán sales tự động và không ghi workbook gốc.

Tệp audit tổng hợp không chứa họ tên/số điện thoại đầy đủ của khách hàng. Các bảng duyệt alias có tên nhân sự/CTV để người phụ trách đối chiếu. Mọi cột `decision`, `approved_user_id`, `approved_ctv_id` đang để trống hoặc `CHƯA_DUYỆT`; không dùng gợi ý làm quyền truy cập chính thức.
