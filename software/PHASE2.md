# Phase 2 — Nền tảng, đăng nhập và phân quyền

## Đã thực hiện

- Monorepo Next.js/NestJS/TypeScript; dashboard khảo sát chỉ chứa số liệu tổng hợp.
- Bản demo cục bộ có đăng ký email + mật khẩu, trạng thái chờ duyệt, trang Admin duyệt/từ chối và cookie phiên sau khi được duyệt. Tài khoản demo lưu riêng trong SQLite, không đọc hai workbook.
- Hai workbook đã được nhập vào vùng chờ duyệt: 1.960 dòng chuẩn hóa, 31 tên và 21 số điện thoại CTV roster dự thảo. Admin có thể duyệt ánh xạ tên sales nguồn; Sales chỉ xem hồ sơ đã gán.
- API OIDC JWT xác minh chữ ký RS256 bằng JWKS, issuer và audience; tài khoản phải hoạt động trong `app_users`.
- Guard vai trò cho Admin/Leader/Sales. Admin có API tạo, xem, cập nhật/khóa tài khoản; bootstrap Admin đầu tiên chỉ khi chưa có Admin hoạt động.
- Scope đọc hồ sơ và KPI theo sales/CTV. NE cũ giữ người được ghi nhận trên sự kiện, không chạy theo owner CTV hiện tại.
- Ghi audit cùng giao dịch khi tạo hoặc cập nhật tài khoản. Chặn tự bỏ quyền Admin và bỏ Admin hoạt động cuối cùng.
- Mỗi response có `X-Request-Id`; log chỉ ghi mã request, mẫu route, trạng thái và thời gian xử lý.
- API chỉ lắng nghe trên `127.0.0.1` ở môi trường hiện tại.

## Chưa đủ điều kiện nghiệm thu Phase 2

1. Chọn IdP của tổ chức, nhận issuer/audience/JWKS và cấu hình một ứng dụng đăng nhập web theo Authorization Code + PKCE. Đăng nhập SQLite hiện chỉ phục vụ demo, không thay thế luồng này.
2. Có PostgreSQL dev/staging, review `../phase1/schema.sql` thành migration versioned và chạy migration. Môi trường hiện tại chưa có PostgreSQL hoặc Docker.
3. Duyệt tài khoản Admin đầu tiên và ánh xạ sales/leader từ Excel. Danh sách Excel hiện là dự thảo; không tự cấp quyền cho các tên chưa xác minh.
4. Khi có IdP và database, nghiệm thu ba vai trò bằng truy cập trực tiếp API, chuyển CTV A→B, thay owner, khóa tài khoản và đọc audit. Chưa tuyên bố hoàn tất phân quyền khi chưa kiểm chứng với dữ liệu thật.
5. Cấu hình staging và CI/CD sau khi nơi lưu mã nguồn/triển khai được chọn.

## Công việc tiếp theo có thể làm độc lập

- Xây form và API lead/CTV với dữ liệu mẫu không chứa PII thật.
- Chuẩn hóa danh mục ngành, nguồn, đợt tuyển sinh từ bảng đối soát đã duyệt.
- Dựng giao diện quản trị tài khoản sử dụng các endpoint Phase 2 sau khi có đăng nhập.
