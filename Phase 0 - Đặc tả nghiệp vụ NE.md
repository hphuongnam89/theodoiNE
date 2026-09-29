# Phase 0 — Đặc tả nghiệp vụ CRM tuyển sinh (bản dự thảo 0.1)

**Ngày lập:** 29/09/2026  
**Nguồn:** `1. THEO DÕI NE.xlsx`, `4. Report Daily.xlsx`, và quyết định của chủ nghiệp vụ trong cuộc trao đổi này.  
**Trạng thái:** đang hoàn thiện; các mục “cần chốt” chưa được xem là quy tắc đã duyệt.

## 1. Mục tiêu của Phase 0

Thống nhất một quy trình và một cách tính số để đội triển khai có thể thiết kế cơ sở dữ liệu, màn hình, phân quyền và migration. Kết quả Phase 0 là tài liệu yêu cầu nghiệp vụ có thể ký duyệt, không phải phần mềm production.

## 2. Quyết định đã xác nhận

| ID | Quyết định | Hệ quả triển khai |
|---|---|---|
| D-01 | **NE chính thức khi đã đóng học phí.** | Việc có tên trong sheet NE hoặc được gắn status `NE` ở sheet lead chưa đủ để hệ thống tự tính NE/KPI. Cần một sự kiện thanh toán được xác nhận. |
| D-02 | **Trong giai đoạn đầu, sales nhập và quản lý lead thay CTV.** | CTV là đối tượng dữ liệu có mã và sales quản lý; chưa cần tài khoản đăng nhập CTV trong MVP. |
| D-03 | Sales chỉ xem NE do mình phụ trách và NE do CTV mình quản lý giới thiệu. Leader và Admin xem tất cả. | Mọi API danh sách, chi tiết, dashboard, tìm kiếm và export áp cùng phạm vi dữ liệu. |
| D-04 | **Bất kỳ khoản học phí dương nào đã được xác nhận đều tính NE/KPI, kể cả đóng một phần.** | Điều kiện số tiền học phí `> 0`; không đợi đủ học phí. Thanh toán nhiều lần của cùng hồ sơ không tạo thêm NE. |
| D-05 | **Ngày NE/KPI là ngày tiền vào tài khoản.** | Lưu riêng `received_at` và `confirmed_at`; khi xác nhận muộn, sự kiện NE được ghi vào kỳ của `received_at` và dashboard phải thể hiện thời điểm cập nhật dữ liệu. |
| D-06 | **Hoàn toàn bộ học phí thì trừ NE/KPI ở ngày hoàn.** | Ghi một sự kiện điều chỉnh `-1` tại `refunded_at`; giữ nguyên lịch sử NE ban đầu. Hoàn một phần mà số học phí ròng còn dương không tạo điều chỉnh NE. |
| D-07 | **CTV chuyển từ Sales A sang Sales B: Sales B chỉ xem NE phát sinh từ ngày chuyển; NE trước đó giữ trong phạm vi Sales A.** | Lưu lịch sử hiệu lực phân công CTV và snapshot sales quản lý CTV tại thời điểm NE; không dựa riêng vào owner CTV hiện tại khi truy vấn NE cũ. |

## 3. Phạm vi chức năng của MVP

1. Quản lý tài khoản Admin/Leader/Sales, CTV và quan hệ sales–CTV.
2. Quản lý khách hàng/lead, nguồn, ngành quan tâm, owner, trạng thái, lịch sử chăm sóc và việc tiếp theo.
3. Chuyển một hồ sơ tuyển sinh thành NE khi thanh toán học phí được xác nhận; lưu mốc thời gian và người xác nhận.
4. Quản lý tình trạng hồ sơ, đợt nhập học, học phí, học bổng và MSSV ở mức cần thiết cho vận hành tuyển sinh.
5. Dashboard theo vai trò và audit các thay đổi quan trọng.
6. Nhập dữ liệu Excel có xem trước, phát hiện trùng, báo cáo lỗi và truy vết về sheet/dòng gốc.

Tích hợp gọi điện/Zalo tự động, tài khoản cho CTV và tính hoa hồng phức tạp được xem xét sau MVP.

## 4. Quy trình nghiệp vụ đề xuất

```text
Tạo lead → Phân công sales/CTV → Liên hệ và chăm sóc → Hồ sơ/đăng ký
        → Ghi nhận thanh toán → Xác nhận thanh toán → NE chính thức
        → Hoàn thiện hồ sơ → Nhập học/xếp lớp

                         ↘ Không còn nhu cầu → Lost (có lý do)
```

### 4.1. Lead và chăm sóc

- Sales tạo lead trực tiếp hoặc ghi nhận lead CTV giới thiệu. Với nguồn CTV, bắt buộc chọn CTV đang thuộc phạm vi sales.
- Hồ sơ tối thiểu khi tạo: tên hoặc định danh liên hệ, ít nhất một kênh liên hệ, nguồn và sales owner. Điện thoại được chuẩn hóa trước khi dò trùng; không tự động xóa hoặc ghép hai bản ghi nghi trùng.
- Mỗi cuộc gọi/tin nhắn/cuộc hẹn là một activity có ngày giờ, người thực hiện, kết quả và bước tiếp theo. Ghi chú lịch sử không được nối vào một ô dài như workbook.
- Thay đổi stage, sales owner, CTV giới thiệu, ngành hoặc đợt nhập học tạo sự kiện lịch sử. Lead mất nhu cầu cần lý do Lost.

### 4.2. Thanh toán và công nhận NE

- Sales có thể khai báo khoản thanh toán ở trạng thái **chờ xác nhận**; vai trò được giao xác nhận kiểm tra bằng chứng và số tiền. Theo đề xuất tạm thời, Admin xác nhận; quyền này cần chốt ở mục 10.
- NE được tính **một lần** tại sự kiện thanh toán **học phí dương (`> 0`)** đầu tiên đã xác nhận, dù chỉ đóng một phần. `official_ne_at` lấy **ngày tiền vào tài khoản**, không lấy ngày nhân sự xác nhận; lưu riêng hai mốc. Ghi `credited_sales_id`, `referrer_ctv_id`, sales quản lý CTV tại thời điểm NE, `payment_id` và người xác nhận.
- Thanh toán tiếp theo không làm tăng số NE. Khi hoàn toàn bộ học phí, ghi sự kiện `NE_REVERSED` với giá trị `-1` tại **ngày hoàn tiền**. Hoàn một phần mà tổng học phí ròng vẫn dương không trừ NE. Giữ sự kiện gốc và chứng từ để truy vết; không sửa âm thầm số NE cũ.
- Đề xuất khi đã trừ NE rồi lại nhận học phí dương: tạo sự kiện khôi phục `+1` tại ngày tiền vào tài khoản mới, không tạo hồ sơ người học thứ hai. Cần xác nhận trong tình huống thực tế.
- Dữ liệu import từ Excel có số tại cột “Học phí nộp” chỉ là **dữ liệu lịch sử cần đối soát**. Không tự biến toàn bộ số đó thành thanh toán đã xác nhận vì sheet không có giao dịch/chứng từ nhất quán.
- Một người có thể có nhiều hồ sơ đăng ký theo chương trình/đợt; việc đếm NE theo người hay theo hồ sơ đăng ký là quyết định cần chốt.

### 4.3. CTV và quyền xem

- CTV có `ctv_id` và `owner_sales_id`. Lead/NE được giới thiệu phải tham chiếu CTV bằng ID, không chỉ lưu tên gõ tự do.
- Sales xem hồ sơ nếu `sales_owner_id` là mình **hoặc** CTV giới thiệu thuộc phạm vi lịch sử của mình tại thời điểm NE. Với lead chưa thành NE, dùng sales owner và CTV owner hiện tại. Điều này thực hiện đúng yêu cầu xem NE của mình và NE của CTV mình quản lý.
- Đề xuất tạm thời: sales chỉ được **sửa** hồ sơ mà mình là sales owner; với NE của CTV mình quản lý nhưng do sales khác xử lý, sales được xem. Leader/Admin xem tất cả; quyền sửa/chuyển owner của leader cần chốt.
- Khi chuyển CTV sang sales khác, tạo bản ghi phân công có ngày hiệu lực; NE phát sinh **trước** ngày chuyển vẫn thuộc phạm vi CTV của sales cũ, NE phát sinh **từ** ngày chuyển thuộc phạm vi CTV của sales mới. Không đổi quyền xem NE cũ chỉ vì trường owner hiện tại của CTV thay đổi.

## 5. Trạng thái chuẩn cần duyệt

| Nhóm | Giá trị đề xuất | Nguồn/ghi chú |
|---|---|---|
| Lead | Mới; Đã liên hệ; Đang tư vấn; Chờ hồ sơ; Chờ thanh toán; Lost | Các sheet lead đang dùng `Cold`, `Will`, `Convert`, `Hồ sơ`, `Lost`… Tên và thứ tự cần chủ nghiệp vụ duyệt. |
| Tuyển sinh | Đã đóng học phí (NE); Đã nhập học; Đã xếp lớp | NE phụ thuộc xác nhận thanh toán, không phụ thuộc nhãn text trong sheet. |
| Thanh toán | Chưa ghi nhận; Chờ xác nhận; Đã xác nhận; Từ chối; Hoàn/hủy | Lưu số tiền, ngày giao dịch, chứng từ và actor xác nhận. |
| Hồ sơ | Chưa có; Thiếu; Đủ bản mềm; Đủ bản cứng; Đã kiểm tra | Sheet hiện ghi tự do ở “Hồ sơ thiếu”, hồ sơ online và giấy. |
| Việc chăm sóc | Cần làm; Quá hạn; Đã hoàn tất; Hủy | Một việc có hạn xử lý và người phụ trách. |

Không tự ánh xạ `Convert` hay `NB` thành NE trong migration khi chưa được giải thích bởi chủ nghiệp vụ. Bản gốc của trạng thái luôn được giữ để đối soát.

## 6. Từ điển dữ liệu tối thiểu

| Đối tượng | Trường chính | Bắt buộc/kiểm soát |
|---|---|---|
| Khách hàng | `person_id`, họ tên, điện thoại chuẩn hóa, điện thoại gốc, email, ngày sinh, CCCD | Chỉ yêu cầu thông tin liên hệ tối thiểu ở lead; CCCD chỉ khi nghiệp vụ tuyển sinh cần, giới hạn quyền xem. |
| Hồ sơ tuyển sinh | `application_id`, `person_id`, chương trình/ngành, đợt nhập học, nguồn, stage, `sales_owner_id`, `referrer_ctv_id`, ngày tạo | Có thể có nhiều hồ sơ cho một người nếu khác chương trình/đợt theo quy tắc được duyệt. |
| CTV | `ctv_id`, tên, điện thoại, loại CTV/đại lý, `owner_sales_id`, ngày gia nhập, trạng thái; bảng lịch sử phân công với `effective_from/effective_to` | `owner_sales_id` hiện tại bắt buộc cho CTV đang hoạt động; lịch sử phân công giữ quyền xem NE cũ. |
| Hoạt động | `activity_id`, `application_id`, loại, thời điểm, người thực hiện, kết quả, ghi chú | Không ghi đè activity cũ; sửa/xóa phải có audit. |
| Việc cần làm | `task_id`, `application_id`, người được giao, hạn xử lý, trạng thái | Dashboard quá hạn dựa vào hạn xử lý có kiểu ngày giờ. |
| Thanh toán | `payment_id`, `application_id`, số tiền, loại khoản, `received_at`, trạng thái, `confirmed_at`, `refunded_at`, người xác nhận, chứng từ | Tiền dùng kiểu decimal; không dùng một ô trộn số tiền và ghi chú. Ngày NE lấy `received_at`; ngày hoàn lấy `refunded_at`. |
| NE chính thức | `application_id`, `official_ne_at`, `credited_sales_id`, `referrer_ctv_id`, `ctv_manager_at_ne_id`, `trigger_payment_id`, các sự kiện NE `+1/-1` | Ghi nhận một lần theo khoản học phí dương đầu tiên; lưu snapshot quyền CTV và lịch sử điều chỉnh. |
| Hồ sơ giấy tờ | loại giấy tờ, trạng thái, ngày nhận, người kiểm tra, file metadata | File riêng tư; dashboard tổng quan chỉ hiển thị tình trạng. |
| Audit/import | actor, hành động, thời điểm, trước/sau; tên file, sheet, dòng, kết quả | Truy vết mọi bản ghi nhập từ Excel và đổi owner/stage/payment. |

## 7. Ánh xạ nguồn Excel sang mô hình mới

| Nguồn | Cột gốc quan trọng | Đích dự kiến | Lưu ý |
|---|---|---|---|
| `1. THEO DÕI NE.xlsx` → `NE 2026` | C tên, D ngành, E ngày sinh, F giới tính, G CCCD, H điện thoại | Khách hàng + hồ sơ tuyển sinh | 347 hàng có tên; có thể có hồ sơ trùng. |
| Cùng sheet | S học phí nộp, V học bổng, W nguồn, X hồ sơ thiếu, Y đợt, AB tư vấn viên, AC MSSV, AD/AE hồ sơ | Hồ sơ tuyển sinh + đối soát thanh toán/hồ sơ | **AB là tư vấn viên chính:** 329 có giá trị, 18 trống. S là giá trị lịch sử, chưa xác minh giao dịch. |
| `NE 2025` | B tên, C ngành, F CCCD, G điện thoại, P học phí, R học bổng, S nguồn, T/U hồ sơ/ghi chú, X MSSV | Dữ liệu lịch sử | Bố cục khác 2026; owner không có cột có tên rõ như AB của 2026. |
| `4. Report Daily.xlsx` → `Data CTV` | B tên, C ngành, D điện thoại, E ghi chú, F trạng thái, G người xử lý, H ngày tạo, I CTV, J đợt, K thanh toán | Lead + nguồn CTV + trạng thái | 218 hàng có tên; cần ghép tên CTV với mã CTV đã duyệt. |
| `LEAD ONLINE` | B tên, C điện thoại, E nội dung, F sales, G trạng thái, H cách chạy, I ngày tạo | Lead + nguồn/campaign | 616 hàng có tên; có thể trùng với các nguồn khác. |
| `Lead tự tạo` | D tên, F ngành, G điện thoại, H lịch sử dạng text, I trạng thái, J sales, K ngày tạo, L người giới thiệu | Lead + activity lịch sử | 468 hàng có tên; activity trong một ô chỉ nhập dạng ghi chú gốc, không tự tách thành sự kiện chắc chắn. |
| `DANH SÁCH CTV` | B tên, D phân loại, E điện thoại, F ngày gia nhập, G hợp đồng, H ghi chú | CTV | 31 dòng có tên; cần xác nhận CTV còn hoạt động và sales owner. |
| `Report NE 2026` | B–F mục tiêu cá nhân, G mục tiêu tổng; H–L thực đạt cá nhân, M tổng công thức | Mục tiêu/KPI lịch sử | Không import M làm số chính thức khi chưa đối soát công thức. |

## 8. Mốc chất lượng dữ liệu đã đo

- `NE 2026`: 347 hàng có tên; 329 có tư vấn viên ở AB; 18 trống. Có 13 chuỗi tên tư vấn viên khác nhau, gồm các biến thể của cùng người và các nhãn như `ĐÀO TẠO`; cần bảng ánh xạ sang `user_id`.
- Cột S “Học phí nộp” trên 347 hàng: 345 ô có dữ liệu, 339 ô là số dương; 6 ô còn lại là text/0. Đây **không phải** 339 NE đã xác nhận theo định nghĩa mới.
- `SUMMARY 2026` ghi 346 vì bảng tổng hợp đếm theo ngành, còn `NE 2026` có 347 hàng có tên. **Dòng 5 của `NE 2026` thiếu ngành ở cột D**; các nhóm ngành trong summary cộng đúng 346. Cần bổ sung ngành cho dòng này sau khi đối chiếu hồ sơ gốc, rồi cập nhật summary.
- `Report NE 2026`, tháng 1–9: KPI mục tiêu cộng 426; cột M “Tổng” cộng 220; các ô thực đạt cá nhân H–L cộng 287. Ví dụ M của tháng 9 cộng `C87+C88+C93`, bỏ qua dòng Dương C90. Cần rà soát công thức và điều kiện chốt số.
- `Data CTV`, `LEAD ONLINE`, `Lead tự tạo` có lần lượt 218, 616, 468 hàng có tên. Không cộng thành số lead duy nhất vì cùng người có thể nằm nhiều sheet.
- Trong 218 hàng có tên của `Data CTV`, có 208 ô CTV không trống, gồm 42 chuỗi tên CTV khác nhau; danh sách CTV/đại lý có 31 tên. Chỉ 14/208 hàng khớp trực tiếp với tên trong danh sách sau khi bỏ dấu và chuẩn hóa chữ/khoảng trắng. Có thể nhiều tên viết tắt hoặc người giới thiệu chưa có trong roster; phải đối chiếu thủ công theo người/điện thoại trước khi gán `ctv_id`. Có 157 hàng mang nhãn `NE`, nhưng nhãn này chưa chứng minh đã có thanh toán học phí được xác nhận.

## 9. KPI và dashboard: công thức dự thảo

| Chỉ số | Công thức dự thảo | Bộ lọc/thời điểm |
|---|---|---|
| NE mới | Đếm sự kiện `NE_RECOGNIZED` (+1) và `NE_REINSTATED` (+1) có ngày tiền vào tài khoản trong kỳ, sau khi khoản học phí được xác nhận | Theo ngày tiền vào tài khoản; ngành, kỳ tuyển sinh, sales được ghi công, CTV, nguồn. |
| NE ròng/KPI đạt | Tổng sự kiện NE `+1` và `NE_REVERSED` (`-1`) trong kỳ | Sự kiện hoàn toàn bộ học phí ghi `-1` tại ngày hoàn. Chỉ số ngày có thể âm; tổng lũy kế phản ánh số NE còn hiệu lực. |
| Tiến độ KPI | `NE ròng được ghi công / mục tiêu NE` | Mục tiêu theo sales, kỳ và tháng; KPI = 0 hiển thị “không có mục tiêu”, không chia 0. |
| Tỷ lệ chuyển đổi | `số hồ sơ đạt NE / số lead hợp lệ được tạo` trong cùng cohort | Cần chốt cửa sổ quan sát và có loại bỏ trùng hay không. Không chia tùy tiện NE tháng này cho lead tháng này nếu lead có chu kỳ dài. |
| Lead chưa liên hệ | Lead hợp lệ không có activity liên hệ thành công/không thành công | Theo `created_at` và owner hiện tại. |
| Follow-up quá hạn | Task chưa hoàn tất có `due_at < now` | Tính theo múi giờ Asia/Bangkok, lọc owner và CTV. |
| Hồ sơ thiếu | NE có ít nhất một mục checklist bắt buộc chưa đủ | Theo ngành/phương thức xét tuyển; checklist cần được duyệt. |
| Biến động | Số lần tạo, đổi stage/owner, chốt/hoàn tiền, sửa thông tin chính và import | Có liên kết từ dashboard tới audit event và hồ sơ có quyền xem. |

Dashboard sales chỉ nhận dữ liệu thuộc phạm vi D-03. Dashboard leader/admin hiển thị toàn bộ và có drill-down đến danh sách. Tổng số và danh sách chi tiết phải dùng cùng điều kiện lọc và quyền; không tính riêng trong trình duyệt.

## 10. Ma trận quyền dự thảo

| Nghiệp vụ | Sales | Leader | Admin |
|---|---|---|---|
| Xem lead/NE | Owner là mình hoặc CTV giới thiệu thuộc mình | Tất cả | Tất cả |
| Tạo lead và activity | Tạo trong phạm vi mình; nhập thay CTV mình quản lý | Tạo/giao theo quyền được duyệt | Tất cả |
| Sửa lead/NE | Tạm đề xuất: hồ sơ owner là mình | Cần chốt | Tất cả, có audit |
| Chuyển owner sales/CTV | Đề xuất yêu cầu leader/admin | Cần chốt | Có |
| Ghi nhận thanh toán | Đề xuất: khai báo chờ xác nhận | Cần chốt | Có |
| Xác nhận/hoàn thanh toán | Chưa cấp trong MVP | Cần chốt | Đề xuất: có |
| Import/export dữ liệu nhạy cảm | Không mặc định | Theo quyền được cấp | Có, có audit |
| Quản lý tài khoản/danh mục | Không | Không mặc định | Có |

## 11. Các quyết định còn cần chủ nghiệp vụ chốt

1. Đã chốt: đóng một phần học phí với số tiền dương được tính NE. Cần xác nhận **lệ phí xét tuyển/đặt cọc được hạch toán ngoài học phí** có tính hay không; đề xuất không tính cho đến khi được ghi nhận là học phí.
2. Đã chốt: NE/KPI theo ngày tiền vào tài khoản, hoàn toàn bộ học phí trừ vào ngày hoàn. Cần chốt **đóng kỳ báo cáo**: xác nhận muộn có được cập nhật lại tháng đã chốt hay cần phiên bản báo cáo điều chỉnh? Nếu trả lại sau hoàn tiền, có ghi NE mới lần nữa không?
3. Một người ghi NE nhiều lần khi đăng ký ngành/đợt khác nhau được không? Nếu được, phạm vi duy nhất là người + chương trình + đợt hay theo hồ sơ tuyển sinh riêng?
4. Duyệt bảng ánh xạ tên tư vấn viên ở AB sang tài khoản sales; xử lý 18 hồ sơ trống và các nhãn không phải sales hiện hành.
5. Đã chốt: sales mới chỉ thấy NE từ ngày chuyển; sales cũ giữ quyền xem NE trước ngày chuyển theo quan hệ CTV. Cần chốt lead đang chăm dở ở ngày chuyển thuộc sales nào.
6. Ai được xác nhận thanh toán, sửa học phí, chuyển owner, sửa stage sau NE và xuất CCCD/hồ sơ?
7. Ánh xạ chính thức các trạng thái `Cold`, `Will`, `Convert`, `NB`, `Hồ sơ`, `NE`, `Lost` và nguồn lead; quy tắc bỏ/giữ các sheet nháp.
8. Danh sách giấy tờ bắt buộc theo ngành và phương thức xét tuyển; thời hạn lưu/ẩn CCCD, hồ sơ và ghi chú cuộc gọi.

## 12. Điều kiện nghiệm thu Phase 0

- Chủ nghiệp vụ ký duyệt D-01–D-07 và trả lời các quyết định ở mục 11, hoặc ghi rõ quyết định được hoãn và ảnh hưởng đến MVP.
- Có bảng ánh xạ owner/CTV và từ điển trạng thái/nguồn/đợt nhập học đã duyệt.
- Có công thức NE/KPI với ví dụ thanh toán một phần, thanh toán nhiều lần, hoàn tiền, chuyển owner, lead do CTV giới thiệu.
- Chênh lệch 347/346 được xử lý tại dòng 5 của `NE 2026`; chênh lệch 220/287 có danh sách công thức cần sửa, người chịu trách nhiệm và hạn xử lý.

## Phụ lục A — Ánh xạ tên tư vấn viên cần duyệt

Các nhóm dưới đây chỉ là đề xuất gộp **chuỗi tên trong cột AB**; chưa phải ánh xạ tới tài khoản người dùng. Không tự gộp khi import production nếu chưa có người quản lý xác nhận.

| Nhóm đề xuất | Giá trị gốc trong AB | Số hồ sơ |
|---|---|---:|
| Thư | `ĐẶNG ANH THƯ` | 103 |
| Dương | `THUỲ DƯƠNG` | 100 |
| Bình | `NHƯ BÌNH` (67), `Như Bình` (1) | 68 |
| Trinh | `PHƯƠNG TRINH` | 27 |
| Tính | `NGUYỄN THỊ MINH TÍNH` (10), `MINH TÍNH` (7) | 17 |
| Nga | `THÙY NGA` (3), `THUỲ NGA` (2) | 5 |
| Chưa rõ tài khoản | `HỒNG NHI` (4), `NGUYỄN THÙY NGÂN` (3), `BẢO NHI (pxu)` (1), `ĐÀO TẠO` (1) | 9 |
| Trống | Không có giá trị | 18 |

**Tổng:** 347. Cần xác nhận các nhân sự đã nghỉ/chuyển nhóm và xử lý hồ sơ thuộc nhãn `ĐÀO TẠO` trước khi bật quyền xem theo sales.

## Phụ lục B — Tình huống nghiệm thu nghiệp vụ

| Tình huống | Kết quả mong đợi |
|---|---|
| Khách đóng 100.000đ học phí ngày 05/09, nhân sự xác nhận ngày 08/09 | NE/KPI +1 vào **05/09**; audit lưu người và ngày xác nhận 08/09. |
| Cùng hồ sơ đóng tiếp 1.000.000đ ngày 10/09 | NE/KPI không cộng lần hai; tổng học phí đã nhận tăng. |
| Hoàn 500.000đ nhưng tổng học phí ròng vẫn dương | NE/KPI giữ nguyên; ghi giao dịch hoàn một phần. |
| Hoàn hết học phí còn lại ngày 15/09 | NE/KPI -1 vào **15/09**; lịch sử +1 ngày 05/09 vẫn còn. |
| CTV chuyển từ Sales A sang B có hiệu lực 12/09; NE của CTV phát sinh ngày 10/09 và 14/09 | A xem NE ngày 10/09 theo quan hệ CTV; B xem NE ngày 14/09. Leader/Admin xem cả hai. |
| Sales B sửa URL để truy cập NE do Sales A trực tiếp phụ trách, không qua CTV của B | API từ chối truy cập; dashboard/export cũng không trả record này. |
| Lead có trạng thái text `NE` trong Excel nhưng không có chứng cứ học phí đã xác nhận | Import giữ trạng thái gốc và đưa vào hàng chờ đối soát; không cộng KPI chính thức. |

## 13. Tiến độ Phase 0

**Đã lập:** phạm vi MVP, quy trình dự thảo, ma trận quyền, từ điển dữ liệu tối thiểu, ánh xạ sheet/cột, số liệu chất lượng dữ liệu, công thức KPI dự thảo và tình huống nghiệm thu. Các quyết định D-01–D-07 đã được chủ nghiệp vụ trả lời trong cuộc trao đổi.

**Còn cần duyệt để đóng Phase 0:** bảng ánh xạ nhân sự/CTV, người được quyền xác nhận thanh toán, trạng thái chuẩn, xử lý báo cáo tháng đã chốt khi xác nhận muộn, xử lý đóng lại sau hoàn tiền, quyền sửa NE/hồ sơ và hồ sơ bắt buộc theo ngành. Cần người phụ trách Excel xác nhận sửa dòng 5 thiếu ngành và các công thức tổng KPI bỏ sót nhân sự.
- Ma trận quyền được kiểm tra bằng các tình huống Sales A, Sales B, CTV của A, Leader và Admin trước khi chuyển sang thiết kế kỹ thuật.
