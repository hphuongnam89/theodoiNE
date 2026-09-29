# NBS CRM tuyển sinh — MVP demo cục bộ

Mở **http://127.0.0.1:3000** trên máy này. Mã nguồn giao diện ở `apps/web`; dữ liệu demo SQLite ở `apps/web/data/demo.sqlite`. Hai workbook gốc chỉ được đọc, không bị sửa.

## Luồng sử dụng

1. Sales/Leader đăng ký email và mật khẩu tại `/register`, chờ Admin duyệt tài khoản ở `/admin/users`.
2. Admin ánh xạ tên Sales và CTV trong Excel tại `/admin/import`. Các dòng Excel chỉ là vùng chờ; cần kích hoạt từng lead đủ thông tin trước khi chăm sóc.
3. Sales tạo lead ở `/crm/leads`, gắn CTV mình quản lý, ghi cuộc gọi/tin nhắn/cuộc hẹn, đặt follow-up và cập nhật checklist hồ sơ.
4. Sales nhập khoản thu hoặc hoàn học phí trong chi tiết lead, kèm số tiền, thời điểm ngân hàng và mã đối soát.
5. Admin **hoặc Leader** đối chiếu và xác nhận/từ chối ở `/finance`. Khoản chờ duyệt không tính NE. Bất kỳ khoản thu dương đã duyệt tạo +1 NE; hoàn hết tổng số đã thu tạo −1 NE tại ngày hoàn. Hoàn một phần vẫn giữ NE. Khoản thu sau khi đã hoàn hết tạo +1 NE mới.
6. Dashboard `/` cho số NE chính thức, biến động ngày/tháng, theo Sales, giao dịch chờ duyệt, follow-up và chất lượng import. `/ne-events` cho từng sự kiện; `/audit` cho Admin/Leader xem thay đổi.

Sales chỉ xem lead mình đang phụ trách và NE theo snapshot người quản lý CTV tại thời điểm NE. Khi chuyển CTV, NE cũ vẫn thuộc Sales cũ; nếu hoàn toàn bộ NE cũ sau chuyển giao, −1 được ghi vào KPI Sales cũ trong ngày hoàn. Admin/Leader xem toàn bộ. Mật khẩu băm bằng scrypt, cookie phiên HttpOnly và kiểm tra quyền tại server.

## Dữ liệu nguồn

`phase1/import_demo_sqlite.py` đã chuẩn hóa **1.960 dòng** từ 8 sheet và **31 CTV roster** vào vùng chờ. Có **1.753 dòng** có điện thoại chuẩn hóa. Dữ liệu nhập giữ tham chiếu file/sheet/dòng, cờ chất lượng, owner/CTV trong nguồn. Không tự ghép trùng, không tin số tiền Excel là thanh toán đã xác minh, không tự tạo NE lịch sử. KPI 426/220/287 trong khu vực đối soát Excel là số nguồn chưa khớp, tách khỏi NE chính thức.

## Chạy lại MVP

Yêu cầu Node.js 24, pnpm 11. Từ thư mục `software`:

```powershell
pnpm install --frozen-lockfile
pnpm build:web
pnpm --filter @ne-crm/web start
```

Nếu chưa có Admin, từ `software/apps/web` chạy `node scripts/bootstrap-demo-admin.mjs`; script tạo mật khẩu ngẫu nhiên và in một lần. Database cục bộ và thư mục build bị loại khỏi Git. Lệnh import Excel có thể chạy lại từ thư mục gốc: `python phase1/import_demo_sqlite.py`; script chặn khi hash workbook thay đổi để tránh ghi đè quyết định đã duyệt.

## Giới hạn trước khi dùng thật

MVP dùng SQLite và email/mật khẩu cục bộ, chưa có gửi email xác minh, khôi phục mật khẩu, file đính kèm, sao lưu tự động hoặc tích hợp sao kê ngân hàng. Mã giao dịch và ngày ngân hàng do người dùng nhập, Admin/Leader phải đối chiếu chứng từ bên ngoài trước khi duyệt. Các trang danh sách giới hạn số dòng hiển thị gần nhất. Dữ liệu Excel thiếu/khác tên owner và CTV vẫn cần người quản trị rà soát thủ công.

`apps/api` là nền tảng NestJS/PostgreSQL/OIDC dành cho triển khai production, hiện tách khỏi demo SQLite. Trước triển khai thật cần chọn IdP, áp dụng migration PostgreSQL đã review, chuyển luồng nghiệp vụ demo sang API này, bổ sung sao lưu, email và quy trình chứng từ ngân hàng. Xem `PHASE4-MVP.md` cho luồng học phí, `PHASE5.md` cho phễu chuyển đổi và hàng chờ trùng lặp, `PHASE6.md` và `CUTOVER.md` cho quy trình bàn giao nhân sự, sao lưu và cutover vận hành chính thức.
