# Kế hoạch hệ thống quản lý NE và dashboard tuyển sinh

**Nguồn khảo sát:** `1. THEO DÕI NE.xlsx`, `4. Report Daily.xlsx`  
**Thời điểm file ghi nhận:** 29/09/2026 (theo thời gian sửa file trên máy). Đây không nhất thiết là ngày cuối cùng có nghiệp vụ.

## 1. Tóm tắt đề xuất

Xây một CRM tuyển sinh có một hồ sơ NE duy nhất, gán rõ sales phụ trách và cộng tác viên giới thiệu, ghi lịch sử chăm sóc thành từng hoạt động, quản lý các bước từ lead đến nhập học và hồ sơ. Dashboard lấy dữ liệu từ các bản ghi này, có bộ lọc ngày, kỳ tuyển sinh, sales, cộng tác viên, ngành, nguồn và trạng thái. Phân quyền được kiểm tra ở máy chủ cho mọi truy vấn và thao tác.

Tệp HTML đi kèm là dashboard mẫu tương tác, dùng một số số liệu tổng hợp từ hai workbook. Nó minh họa bố cục và các cảnh báo dữ liệu; chưa phải ứng dụng CRM, chưa đăng nhập và không thể tự bảo vệ dữ liệu theo vai trò.

## 2. Những gì có trong hai workbook

### `1. THEO DÕI NE.xlsx`

Có 13 sheet, gồm danh sách NE theo các năm 2024–2026, bảng summary, bản nháp và sheet nghiệp vụ phụ. Các sheet chính:

- `NE 2026`: 1.072 hàng × 47 cột; khoảng 347 hàng có tên. Có thông tin cá nhân, ngành, điểm/xét tuyển, học phí, học bổng, nguồn, hồ sơ, đợt nhập học, MSSV, tình trạng hồ sơ online/giấy, tư vấn viên và trạng thái xếp lớp.
- `NE 2025`: 1.225 × 42; 268 hàng có tên; có thông tin tuyển sinh/hồ sơ tương tự, nhưng bố cục cột khác 2026.
- `NE 2024`: 1.027 × 38; 36 hàng có tên trong sheet này. Còn một sheet hỗ trợ NE 2024 khác có dữ liệu riêng.
- `SUMMARY 2026`, `SUMMARY 2025`, `SUMMARY ALL`: các bảng tổng hợp theo ngành và năm.
- Có thêm `NE Dương (Nháp)`, `NHÁPNHI`, `DS 2025 thanhtra`, sheet hỗ trợ và ghi chú/sản phẩm. Đây là các bản nháp/đối soát có nguy cơ trùng với danh sách chính.

Trường dữ liệu hữu ích để đưa vào CRM: họ tên, ngày sinh, giới tính, CCCD, điện thoại, ngành, phương thức/tổ hợp/điểm, trình độ và điểm trung bình, học phí, lệ phí, học bổng, nguồn lead, ghi chú thiếu hồ sơ, đợt nhập học, MSSV, hồ sơ mềm/cứng, tư vấn viên. Một số thông tin kiểm tra giấy tờ hiện chỉ nằm trong ghi chú tự do.

### `4. Report Daily.xlsx`

Có nhiều sheet vận hành, gồm KPI NE 2025/2026, danh sách CTV, lead do CTV giới thiệu, lead online, Zalo OA, Gmail, lead tự tạo, báo cáo công việc/tuần/ngày, trực page, gọi điện, NE ngày, báo cáo marketing và kiểm tra hồ sơ.

- `Report NE 2026`: mục tiêu và kết quả NE theo tháng và sales. Tổng KPI từng tháng cộng lại đến tháng 9 là 426; cột tổng tháng hiện cộng thành 220, còn các ô thực đạt cá nhân cộng thành 287. Dòng tháng 9 có thể chưa đủ tháng.
- `Data CTV`: 218 dòng có tên; có trạng thái, người xử lý, ngày tạo, tên CTV, đợt nhập học và trạng thái thanh toán.
- `LEAD ONLINE`: 616 dòng có tên; trạng thái và người phụ trách có nhiều giá trị trống.
- `Lead tự tạo`: 468 dòng có tên; có trạng thái và người phụ trách nhưng cách ghi tên/hoa thường chưa thống nhất.
- `Zalo OA`, `Web gmail Viện`: có cùng mô hình lead nhưng lượng dữ liệu hiện tại nhỏ hơn.
- `DANH SÁCH CTV`: 31 dòng có tên; lưu thông tin CTV/đại lý, chưa thể hiện quan hệ owner-sales một cách chuẩn hóa.
- Báo cáo cuộc gọi và ngày thường dùng ma trận cột theo ngày thay vì từng hoạt động một hàng; khó lọc, tổng hợp và truy vết thay đổi.

Không cộng các số lượng lead của các sheet nguồn với nhau thành tổng duy nhất: một khách hàng có thể xuất hiện ở nhiều kênh hoặc được nhập lại. Các số trên là số dòng có tên trong từng sheet, không phải số khách hàng đã khử trùng.

## 3. Chất lượng dữ liệu và điểm cần chốt

- **Chênh lệch NE 2026:** sheet `NE 2026` có 347 hàng có tên; `SUMMARY 2026` ghi 346 vì dòng 5 của `NE 2026` thiếu ngành, còn summary cộng theo ngành. `Report NE 2026` có tổng tháng 1–9 là 220 nhưng các ô cá nhân là 287 do công thức tổng bỏ sót dòng. Cần sửa dữ liệu và công thức trước khi chuyển số lịch sử.
- **KPI không tự đối chiếu:** `Report NE 2026` đặt cột M là “Tổng” nhưng một số công thức cộng thiếu nhân sự. Ví dụ tháng 9, `M12 = C87+C88+C93` nên bỏ qua dòng Dương có 30 trong C90. Tổng cá nhân tháng 1–9 là 287, tổng cột M là 220; mục tiêu là 426. Không dùng trực tiếp các tỷ lệ này để đánh giá sales trước khi đối soát.
- **Thiếu owner:** cột tư vấn viên chính là `AB` trên `NE 2026`, có 329/347 hồ sơ được gán tên và **18 chưa gán**. Cột `AH` là ghi chú phụ không có tiêu đề; không dùng làm owner. Tên người tư vấn ở AB có nhiều biến thể và một số giá trị không phải tài khoản sales hiện hành, nên cần bảng ánh xạ được duyệt.
- **Trùng tiềm năng:** so khớp điện thoại thô cho thấy các sheet chính có dòng trùng; định dạng số điện thoại cũng lẫn số dạng text, số dạng numeric, nhiều số trong một ô và khoảng trắng. Không dùng tên làm khóa duy nhất.
- **Từ điển không chuẩn:** trạng thái gồm `Will`, `Cold`, `Lost`, `NE`, `Convert`, `NB`, `Hồ sơ`…; trạng thái hồ sơ là văn bản tự do; tên sales có biến thể viết hoa/thường và tên rút gọn.
- **Mô hình quan hệ thiếu:** lead CTV có tên CTV, nhưng chưa có mã CTV, owner sales ổn định, và quy tắc chuyển giao/hoa hồng được biểu diễn nhất quán.
- **Báo cáo thủ công:** nhiều sheet được bố cục dạng ma trận; công thức có lỗi `#DIV/0!`; tổng hợp theo năm đặt công thức/miền dữ liệu khác nhau.
- **Dữ liệu cá nhân:** workbook chứa CCCD, ngày sinh, điện thoại và ghi chú hồ sơ. Chỉ nhập trường cần thiết; che/masking PII trong dashboard tổng quan; ghi log việc xem và xuất dữ liệu nhạy cảm.

## 4. Kế hoạch hệ thống

### Giai đoạn 1 — Chốt nghiệp vụ và chuẩn hóa dữ liệu

1. Chốt định nghĩa lead, NE, nhập học, chuyển đổi, Lost, NB; thời điểm ghi nhận theo ngày và kỳ tuyển sinh.
2. Chốt danh sách sales, leader, CTV; mỗi CTV có mã riêng, trạng thái và sales owner. Trong MVP sales nhập và quản lý lead thay CTV. Sales chỉ xem NE được giao cho mình hoặc thuộc CTV do mình quản lý.
3. Chuẩn hóa ngành, nguồn, trạng thái, đợt nhập học, tình trạng hồ sơ và lý do Lost thành danh mục chọn.
4. Đối soát bản ghi trùng bằng điện thoại chuẩn hóa, CCCD/MSSV (khi có quyền hợp lệ) và thao tác ghép bản ghi có audit trail. Không tự động xóa bản ghi nghi trùng.
5. Nhập dữ liệu theo đợt, lưu tên workbook/sheet/dòng gốc và kết quả đối soát để tra cứu.

### Giai đoạn 2 — CRM vận hành

- **Lead/NE:** tạo nhanh từ form hoặc import; phát hiện trùng; một hồ sơ chuẩn có ID; lưu nguồn/kênh, owner sales, CTV giới thiệu, ngành và kỳ tuyển sinh.
- **Pipeline:** Mới → Đã liên hệ → Đang tư vấn → Chờ hồ sơ → Chờ thanh toán → NE/Đã nhập học; nhánh Lost/NB có lý do. Cho phép cấu hình quy trình và ngày chuyển trạng thái.
- **Lịch sử chăm sóc:** cuộc gọi, tin nhắn, hẹn gọi lại, ghi chú, người thực hiện, thời điểm, kết quả và việc tiếp theo thành các sự kiện riêng, không ghi nối tiếp vào một ô dài.
- **Checklist hồ sơ và tài chính:** từng loại giấy tờ có trạng thái/ngày nhận/người kiểm tra; học phí, lệ phí, học bổng và thanh toán là các trường có kiểu dữ liệu, có phân quyền sửa.
- **Quản lý CTV:** hồ sơ CTV, người quản lý, lead/NE giới thiệu, kết quả, thanh toán/hoa hồng theo chính sách và kỳ.
- **Import/export:** mẫu Excel chuẩn, xem trước lỗi, xử lý bản ghi trùng, lưu lịch sử import; xuất dữ liệu cần quyền và được ghi log.

### Giai đoạn 3 — Dashboard và giám sát

- Tổng quan: NE mới, tổng NE theo định nghĩa đã chốt, lead mở, tỷ lệ chuyển đổi, doanh thu/học phí đã nộp, tiến độ KPI, hồ sơ thiếu và việc quá hạn.
- Phân tích: theo ngày/tuần/tháng, kỳ, sales, leader, CTV, ngành, nguồn, kênh và trạng thái; drill-down đến hồ sơ nếu người dùng có quyền.
- Hoạt động: lần chăm sóc cuối, số lead chưa liên hệ, lịch hẹn hôm nay/quá hạn, chuyển trạng thái, giao/đổi owner, import và sửa dữ liệu quan trọng.
- Cảnh báo: lead không có owner, lead trùng tiềm năng, quá hạn follow-up, thiếu hồ sơ, NE không khớp KPI và thay đổi bất thường.
- Bộ lọc thời gian chuẩn theo ngày nghiệp vụ; phân biệt tháng đang diễn ra với tháng đã chốt; tải dashboard từ dữ liệu CRM thay vì công thức trong bảng tính.

### Giai đoạn 4 — Thử nghiệm và vận hành

1. Dùng nhóm nhỏ (admin, leader, 1–2 sales và một số CTV) để chạy song song một kỳ ngắn.
2. Đối soát số liệu CRM và workbook theo các quy tắc đã ký duyệt; sửa mapping/import trước khi chốt.
3. Đào tạo theo vai trò, chuyển sang nhập trên CRM, giữ workbook gốc ở chế độ lưu trữ chỉ đọc.
4. Theo dõi lỗi dữ liệu, quyền truy cập, tốc độ và độ chính xác dashboard; sao lưu, khôi phục và quy trình rời nhóm/đổi owner.

## 5. Ma trận phân quyền đề xuất

| Thao tác | Sales | Leader | Admin |
|---|---|---|---|
| Xem NE | NE owner là mình; NE phát sinh khi CTV thuộc mình theo lịch sử phân công | Tất cả NE | Tất cả NE |
| Xem lead/hoạt động | Phạm vi của mình và CTV thuộc mình | Toàn nhóm/toàn hệ thống theo cấu hình | Tất cả |
| Tạo/cập nhật lead | Trong phạm vi được giao; ghi lịch sử | Có thể phân công/chuyển owner | Có thể phân công/chuyển owner |
| Quản lý CTV | CTV được giao quản lý | Toàn bộ CTV | Tạo/sửa/khóa CTV và quan hệ owner |
| Dashboard | Chỉ số và bảng trong phạm vi | Dashboard nhóm/toàn tổ chức | Dashboard toàn hệ thống và cấu hình |
| Tài khoản, danh mục, audit, import/export nhạy cảm | Không | Được cấp có giới hạn | Quản trị |

Leader có thể được cấu hình theo nhóm; mặc định yêu cầu này hiểu leader xem tất cả. Quyền phải áp dụng ở API/cơ sở dữ liệu, không chỉ ẩn menu trên giao diện. Mọi lần đổi owner, trạng thái, thông tin học phí/hồ sơ và quyền đều lưu người sửa, thời gian, giá trị trước/sau.

## 6. Dữ liệu lõi đề xuất

- `users`, `roles`, `teams`, `user_team_memberships`
- `leads`/`students` với `id`, thông tin liên hệ chuẩn hóa, `sales_owner_id`, `referrer_ctv_id`, `source_id`, `program_id`, `intake_id`, `stage`, `created_at`, `updated_at`, `converted_at`, `lost_reason`
- `ctv` với `id`, thông tin liên hệ, `owner_sales_id` hiện tại, loại/đối tác, trạng thái; `ctv_assignment_history` với thời gian hiệu lực để giữ đúng phạm vi NE cũ khi chuyển CTV
- `activities` (call/message/meeting/note/task), `tasks` (due date, assignee, hoàn tất)
- `documents` và `document_checklist_items`
- `payments`/`fees`/`scholarships` với trạng thái và lịch sử điều chỉnh
- `lead_stage_history`, `ownership_history`, `audit_logs`, `imports`
- Danh mục chuẩn `programs`, `sources`, `channels`, `intakes`, `loss_reasons`

Một người có thể đi từ lead sang NE trên cùng ID; không tạo hồ sơ thứ hai khi chuyển đổi. Tách thông tin xác thực/CCCD khỏi bảng dashboard khi có thể, mã hóa và chỉ cấp cho vai trò cần xử lý hồ sơ.

## 7. Thứ tự ưu tiên triển khai

1. Định nghĩa KPI, danh mục trạng thái, quan hệ sales–CTV và luật owner.
2. Làm sạch, đối soát và nhập thử dữ liệu 2026, giữ nguồn gốc từng dòng.
3. Xây đăng nhập, RBAC, hồ sơ lead/NE, lịch sử hoạt động, giao việc và CTV.
4. Xây dashboard admin/leader/sales trên cùng nguồn dữ liệu.
5. Kiểm tra phạm vi truy cập theo vai trò, số liệu KPI, import/export và audit trước khi chuyển vận hành.

**Đã chốt cho MVP:** NE chính thức khi có khoản **học phí dương (`> 0`) được xác nhận**, kể cả đóng một phần; ghi NE/KPI theo **ngày tiền vào tài khoản**; hoàn toàn bộ học phí trừ NE/KPI vào **ngày hoàn**; sales nhập và quản lý lead thay CTV; khi chuyển CTV, sales mới chỉ xem NE phát sinh sau ngày chuyển. **Cần chốt chi tiết:** ai xác nhận khoản thu/chứng từ; xử lý xác nhận muộn hoặc nộp lại sau hoàn tiền; quyền sửa tới giai đoạn nào; chính sách lưu CCCD/hồ sơ và hoa hồng CTV. Theo yêu cầu hiện tại, leader và admin xem toàn hệ thống.

## 8. Kế hoạch triển khai chi tiết theo phase

### Giả định để lập lịch

Ước lượng ban đầu cho nhóm 4–5 người: một product owner/BA bán thời gian, một frontend, một backend, QA bán thời gian và DevOps dùng chung. Mỗi phase kết thúc bằng demo và chủ nghiệp vụ xác nhận tiêu chí. Với nhóm này, MVP nội bộ khoảng **11–14 tuần**; tiến độ thay đổi theo mức độ sạch dữ liệu, số lượng tích hợp và thời gian duyệt nghiệp vụ. Đây là ước lượng lập kế hoạch, chưa phải cam kết hợp đồng.

| Phase | Thời lượng | Mục tiêu và công việc chính | Bàn giao / tiêu chí hoàn tất |
|---|---:|---|---|
| 0. Khảo sát và chốt nghiệp vụ | 1 tuần | Workshop với admin, leader, sales; chốt funnel, định nghĩa NE/KPI và thời điểm ghi nhận, quyền xem/sửa/chuyển owner, quan hệ CTV–sales, checklist hồ sơ, chính sách dữ liệu; lập từ điển trạng thái/ngành/nguồn/kỳ. | Tài liệu yêu cầu, ma trận quyền, từ điển dữ liệu, công thức KPI có ví dụ đã đối chiếu và danh sách quyết định nghiệp vụ được ký duyệt. Không bắt đầu migration chính thức khi KPI còn mơ hồ. |
| 1. Đối soát và thiết kế dữ liệu | 1–2 tuần | Lập profile/import thử hai workbook; lập quy tắc chuẩn hóa điện thoại, tên, ngày, tiền và giá trị trống; phát hiện trùng theo nhiều tín hiệu; xác định bản ghi chuẩn và quy trình xử lý thủ công; thiết kế ERD, luồng import và bản đồ dữ liệu nguồn→đích. | Báo cáo đối soát có số dòng hợp lệ/lỗi/trùng/nghi vấn; mẫu import có thể chạy lại; ERD và prototype UX; quyết định giữ, ghép hoặc bỏ dữ liệu được ghi nhận. Bản ghi nghi trùng được đưa vào hàng chờ duyệt, không tự xóa. |
| 2. Nền tảng, đăng nhập và phân quyền | 1–2 tuần | Dựng repo, local/dev/staging, CI/CD và logging; đăng nhập, khôi phục tài khoản, MFA nếu IdP hỗ trợ; CRUD tài khoản/role/team; backend guard và phạm vi dữ liệu; audit log cho thao tác nhạy cảm. | Người dùng đăng nhập được; demo ba vai trò; kiểm tra API trực tiếp cho thấy sales không thể đọc hồ sơ ngoài phạm vi dù sửa URL/query; leader/admin có đúng phạm vi đã chốt; audit ghi được actor, thời gian, record và before/after. |
| 3. CRM lõi: lead, NE, chăm sóc, giao việc | 2–3 tuần | Danh sách/tìm kiếm/chi tiết lead; nhập lead và phát hiện trùng; owner sales, nguồn, CTV giới thiệu; pipeline và lý do Lost/NB; activity timeline; việc cần làm và nhắc follow-up; chuyển lead thành NE trên cùng ID; bộ lọc và phân trang. | Sales tạo/sửa lead trong phạm vi; activity được ghi thành sự kiện riêng; chuyển stage/owner có lịch sử; một hồ sơ không nhân đôi khi đổi trạng thái thành NE; leader/admin xem dashboard danh sách trong phạm vi quyền. |
| 4. CTV, hồ sơ và tài chính cơ bản | 1–2 tuần | Hồ sơ CTV và quan hệ sales owner; danh sách lead/NE được giới thiệu; checklist giấy tờ từng loại; trạng thái học phí/lệ phí/học bổng; ghi nhận khoản thu/điều chỉnh; chính sách thanh toán/hoa hồng chỉ cấu hình sau khi được duyệt. | Sales chỉ thấy CTV được giao; admin quản lý và chuyển owner; NE hiển thị đầy đủ giấy tờ còn thiếu và trạng thái tài chính; sửa tiền/chính sách để lại audit trail. Tài liệu tải lên là private, không có URL công khai. |
| 5. Import dữ liệu và dashboard | 2 tuần | Import preview/validate/commit; ánh xạ sheet/cột từng workbook; báo cáo lỗi và khả năng chạy lại; hàng chờ ghép trùng; dashboard vai trò theo ngày/tuần/tháng/kỳ/sales/CTV/ngành/nguồn; KPI, pipeline, follow-up quá hạn, hồ sơ thiếu, owner trống, biến động và drill-down được phân quyền. | Import thử cho ra cùng số liệu với bộ đối soát đã duyệt; dashboard tính KPI theo một định nghĩa dùng chung; mọi số liệu tổng có thể drill-down; người không có quyền không thể lấy dữ liệu chi tiết qua API/export. |
| 6. Pilot, bảo mật và chuyển vận hành | 2–3 tuần | Chạy staging với tập dữ liệu giới hạn; đào tạo Admin/Leader/Sales; pilot một nhóm; chạy song song Excel và CRM; xử lý sai lệch; kiểm tra sao lưu/khôi phục, hiệu năng, lỗi phân quyền, upload/download và quy trình nhân sự nghỉ/chuyển nhóm; chốt cutover và hỗ trợ sau go-live. | UAT ký duyệt; số liệu đối chiếu trong ngưỡng đã thống nhất; không còn lỗi chặn quyền; backup/restore diễn tập thành công; tài liệu hướng dẫn, đầu mối hỗ trợ, kế hoạch cutover và rollback có sẵn. Sau cutover Excel thành nguồn lưu trữ chỉ đọc. |

### Công nghệ đề xuất

Chọn **TypeScript cho cả frontend và backend**, triển khai dưới dạng **modular monolith** trước: một ứng dụng web và một API có module rõ ràng, một cơ sở dữ liệu. Quy mô và yêu cầu hiện tại chưa cần chia microservices; cách này giảm số thành phần cần vận hành nhưng vẫn giữ ranh giới module để mở rộng.

| Lớp | Công nghệ đề xuất | Cách dùng trong hệ thống |
|---|---|---|
| Web app | Next.js App Router + React + TypeScript | Trang CRM, dashboard, giao diện riêng theo vai trò; component server cho màn đọc và component client cho bộ lọc/tương tác. Next.js hỗ trợ triển khai Node.js hoặc container với đầy đủ tính năng. |
| UI | Tailwind CSS + bộ component accessible (ví dụ shadcn/ui) | Thiết kế nhanh, nhất quán, responsive; kiểm tra tương phản và thao tác bàn phím cho form/bảng. |
| API/backend | NestJS + TypeScript, REST/JSON, OpenAPI | Modular monolith chia module Auth, Users, Leads, CTV, Activities, Documents, Payments, Reports, Import và Audit. Guards kiểm tra xác thực/vai trò; service/repository thêm phạm vi record cho từng truy vấn. |
| Đăng nhập | OIDC với Microsoft Entra ID nếu tổ chức đã dùng Microsoft 365; nếu không, chọn IdP managed hoặc Keycloak vận hành riêng | Không tự viết hệ thống lưu mật khẩu nếu có thể dùng IdP; áp dụng MFA, khóa tài khoản và quy trình thu hồi phiên theo chính sách. Tách đăng nhập khỏi quyền xem record. |
| Cơ sở dữ liệu | PostgreSQL | Dữ liệu quan hệ, ràng buộc khóa ngoại/unique, giao dịch cho chuyển trạng thái và thanh toán; index cho owner, kỳ, stage, ngày hoạt động. Row-Level Security có thể làm lớp phòng thủ bổ sung, nhưng không thay kiểm tra quyền trong API. |
| ORM/migration | Prisma ORM + migration SQL có review | Truy vấn có kiểu dữ liệu và migration theo version; dùng transaction khi một thao tác ghi nhiều bảng. Với policy RLS hoặc truy vấn báo cáo chuyên biệt, dùng migration/SQL có review và kiểm tra rõ hành vi connection pooling/context. |
| Phân quyền | RBAC + phạm vi quan hệ trong backend; PostgreSQL RLS cho defense-in-depth ở các bảng nhạy cảm khi thiết kế/kiểm chứng xong | Role quyết định chức năng; phạm vi NE dựa `sales_owner_id` hoặc snapshot sales quản lý CTV tại thời điểm NE. Giữ lịch sử chuyển CTV; định nghĩa hàm kiểm tra quyền thống nhất cho API, export và dashboard. Không chỉ ẩn nút trên UI. |
| Tệp hồ sơ | Object storage private tương thích S3 hoặc Azure Blob, mã hóa, signed URL ngắn hạn | Database chỉ lưu metadata và quyền sở hữu; kiểm tra quyền trước khi phát URL; giới hạn loại/kích thước file, scan malware và log tải/xóa. |
| Import Excel | ExcelJS (đọc workbook) + worker/job có trạng thái | Preview, map sheet/cột, validate, lỗi từng hàng, chạy lại idempotent và lưu workbook/sheet/row nguồn. Chạy đồng bộ cho file nhỏ; thêm worker queue khi import hoặc báo cáo mất nhiều thời gian. |
| Biểu đồ | Recharts hoặc ECharts | Dùng biểu đồ cùng nguồn dữ liệu API; drill-down chuyển sang danh sách đã áp scope. Không tính chỉ tiêu độc lập trong trình duyệt. |
| Kiểm tra chất lượng | Jest cho unit/API, Playwright cho luồng trình duyệt và ma trận phân quyền | Viết kiểm thử chặn truy cập chéo Sales A/Sales B, CTV thuộc sales, leader/admin; kiểm tra KPI và import bằng fixture đã khử PII. |
| Triển khai | Docker; staging và production tách biệt; dịch vụ container + PostgreSQL managed; object storage; secrets manager | Chọn cloud sau khi xem xét nơi lưu dữ liệu, ngân sách, backup, đội ngũ hiện hữu và yêu cầu hợp đồng. Có HTTPS, private network, backup mã hóa, PITR nếu dịch vụ hỗ trợ và lịch diễn tập khôi phục. |
| CI/CD và quan sát | GitHub Actions hoặc hệ CI sẵn có; OpenTelemetry-compatible logs/metrics/traces + error monitoring | Pipeline build, lint, kiểm tra migration và triển khai staging; production theo approval của tổ chức; cảnh báo lỗi API, import, login, backup và truy vấn dashboard chậm. |

**Lựa chọn đăng nhập:** xác nhận đội ngũ đang dùng Microsoft 365 hay Google Workspace trong Phase 0. Nếu Microsoft 365 đã có, ưu tiên Microsoft Entra ID để giảm quản lý mật khẩu. Nếu không có IdP doanh nghiệp, so sánh dịch vụ managed và Keycloak theo chi phí vận hành, MFA và người chịu trách nhiệm cập nhật. Không tự host Keycloak nếu chưa có người vận hành.

**Lựa chọn RLS:** API vẫn phải áp dụng scope từ danh tính đã xác thực. Nếu dùng RLS, mỗi request đặt user context an toàn trong transaction/connection và kiểm thử cùng connection pooling; tài khoản DB của ứng dụng không được là superuser, role có `BYPASSRLS`, hoặc chủ bảng có thể bỏ qua policy. Nếu chưa vận hành được điều kiện đó, bắt đầu bằng repository scope tập trung, integration test quyền đầy đủ, rồi bổ sung RLS sau.

### Phạm vi MVP nên giữ

MVP bao gồm: đăng nhập; Admin/Leader/Sales; sales owner và CTV owner; hồ sơ lead/NE; pipeline; lịch sử gọi/chăm sóc; follow-up; checklist hồ sơ; import 2026 có preview và đối soát; dashboard theo vai trò; audit cho đổi trạng thái/owner và trường tài chính; export có quyền. Để phase tiếp theo: tích hợp tổng đài/Zalo tự động, hoa hồng phức tạp, chấm điểm lead, automation marketing đa kênh, ứng dụng mobile native và microservices.

### Cổng nghiệm thu bắt buộc

1. **Nghiệm thu nghiệp vụ:** công thức NE/KPI và thời điểm chốt được chủ nghiệp vụ ký; dashboard và API dùng cùng định nghĩa.
2. **Nghiệm thu phân quyền:** kiểm tra quyền qua API, truy vấn dashboard và export; thử đổi ID trên URL/query không làm lộ bản ghi ngoài phạm vi.
3. **Nghiệm thu dữ liệu:** từng dòng import truy ngược được về file/sheet/row; trùng được ghép có lịch sử; tổng số trong báo cáo đối soát giải thích được.
4. **Nghiệm thu vận hành:** backup khôi phục được; quy trình cấp/thu hồi tài khoản, đổi owner và xử lý sự cố được diễn tập.
