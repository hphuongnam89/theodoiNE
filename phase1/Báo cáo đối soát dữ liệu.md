# Phase 1 — Báo cáo đối soát dữ liệu ban đầu

**Nguồn:** `1. THEO DÕI NE.xlsx`, `4. Report Daily.xlsx`  
**Cách đo:** chạy `phase1/audit_workbooks.py` trên bản Excel hiện có, chỉ đọc; bản ghi được tính khi cột tên của sheet có dữ liệu. Kết quả chi tiết theo dòng nằm trong `reports/`. Các con số là **số dòng Excel**, trừ khi ghi rõ là nhóm ứng viên.

## 1. Quy mô và mức đầy đủ

| Sheet | Dòng có tên | Có điện thoại chuẩn hóa | Ghi chú |
|---|---:|---:|---|
| `NE 2026` | 347 | 346 | 329 có tư vấn viên ở cột AB; 18 trống. |
| `NE 2025` | 268 | 267 | Cấu trúc cột khác 2026. |
| `NE 2024` | 36 | — | Sheet này không có cột điện thoại trong cấu trúc chính đã khảo sát. |
| `Data CTV` | 218 | 206 | 157 dòng mang nhãn `NE`, chưa xác minh theo thanh toán. |
| `LEAD ONLINE` | 616 | 488 | 101 dòng không có người phụ trách theo cột F. |
| `Lead tự tạo` | 468 | 439 | Lịch sử chăm sóc nằm trong một ô text. |
| `Zalo OA` | 2 | 2 | Nguồn lead riêng. |
| `Web gmail Viện` | 5 | 5 | Nguồn lead riêng. |
| `DANH SÁCH CTV` | 31 | 21 | Chưa có mã CTV và sales owner ổn định. |

Điện thoại chuẩn hóa là số được script nhận diện ở cột điện thoại; khác với số ô không trống vì có thể chứa text hoặc định dạng khó đọc. Một người có thể có nhiều dòng/số điện thoại.

## 2. Hàng chờ xử lý: 334 mục

| Mã vấn đề | Số dòng | Hành động |
|---|---:|---|
| `CTV_NAME_NOT_IN_ROSTER` | 194 | Đối chiếu tên viết tắt/người giới thiệu với roster và gán `ctv_id`, hoặc phân loại không phải CTV. |
| `MISSING_CTV` | 10 | Xác định CTV của các dòng `Data CTV` thiếu tên. |
| `MISSING_SALES_OWNER` | 121 | Gán sales owner: 18 dòng NE 2026 và 103 dòng ở các sheet lead. |
| `TUITION_NOT_POSITIVE_NUMBER` | 8 | Đối chiếu ô học phí trống, 0 hoặc text; không suy luận đã/không đóng tiền từ text. |
| `MISSING_PROGRAM` | 1 | Bổ sung ngành cho dòng 5 của `NE 2026`; đây là nguyên nhân summary 346 so với 347 hồ sơ có tên. |

`NE 2026` có 345 ô “Học phí nộp” không trống; 339 ô là số dương. Những ô này **chưa được coi là giao dịch thanh toán xác nhận** theo quy tắc NE mới.

## 3. Trùng tiềm năng theo điện thoại

Script nhận diện **340 nhóm** có cùng số điện thoại chuẩn hóa ở ít nhất hai dòng; **326 nhóm** xuất hiện qua nhiều sheet; tổng **731 dòng tham gia** các nhóm. Đây là hàng chờ soát trùng, không phải số khách hàng trùng đã xác nhận. Tệp `duplicate_candidates.csv` ghi tọa độ sheet/dòng, số điện thoại che bớt và cờ tên có khớp sau chuẩn hóa hay không. Không ghép tự động vì một số điện thoại có thể là của phụ huynh/người giới thiệu hoặc được dùng chung.

Ưu tiên rà soát các nhóm có cả lead và `NE 2026` trước khi import lead: nếu là cùng người, gắn vào cùng `person_id`/`application_id` và giữ mọi nguồn, activity lịch sử. Nếu không cùng người, đánh dấu “số dùng chung” để không nhắc trùng lại.

## 4. Chênh lệch KPI 2026

| Tháng | Mục tiêu G | Tổng hiển thị M | Cộng ô cá nhân H–L | M trừ cá nhân |
|---:|---:|---:|---:|---:|
| 1 | 16 | 15 | 8 | +7 |
| 2 | 16 | 11 | 8 | +3 |
| 3 | 20 | 37 | 23 | +14 |
| 4 | 20 | 20 | 17 | +3 |
| 5 | 35 | 9 | 6 | +3 |
| 6 | 59 | 31 | 39 | −8 |
| 7 | 70 | 48 | 63 | −15 |
| 8 | 95 | 37 | 81 | −44 |
| 9 | 95 | 12 | 42 | −30 |
| **T1–T9** | **426** | **220** | **287** | **−67** |

Cột M có công thức tham chiếu các dòng báo cáo ngày phía dưới, nhưng không cộng cùng một danh sách nhân sự qua mọi tháng. Ví dụ tháng 9: `M12 = C87+C88+C93` bỏ qua dòng Dương (`C90 = 30`). Cần xác nhận kỳ, phạm vi nhân sự và sửa công thức gốc hoặc chốt lại số từ giao dịch học phí trước khi migration KPI. Không dùng 220 hoặc 287 làm NE chính thức theo định nghĩa mới.

## 5. CTV và quyền sở hữu

`Data CTV` có 218 dòng tên, 208 dòng có tên CTV và 42 chuỗi tên CTV khác nhau. Roster có 31 tên. Sau khi bỏ dấu, chuẩn chữ/khoảng trắng, chỉ 14/208 dòng khớp tên roster trực tiếp. Kết quả này không có nghĩa 194 dòng là CTV mới: tên rút gọn, alias hoặc người giới thiệu không nằm trong roster đều có thể tạo lệch. Cần bảng ánh xạ do người quản lý CTV duyệt.

Theo lựa chọn dùng Excel làm dự thảo, `sales_roster_draft.csv` lấy 5 tên từ hàng tiêu đề KPI 2026; `sales_alias_review.csv` có **26 chuỗi tên người xử lý** từ các sheet NE/lead. `ctv_alias_review.csv` đề xuất sales dựa trên tần suất cột `TELE` trong lead CTV: cả 42 chuỗi CTV có gợi ý, nhưng chỉ **8 chuỗi** có ít nhất 3 lead và một sales chiếm từ 70% các lead có `TELE`. Ngay cả gợi ý mạnh vẫn cần xác nhận vì người xử lý lead có thể khác người quản lý CTV. Không có tài khoản hoặc quyền nào được tạo từ bảng này.

`NE 2026` có 329/347 owner ở AB với 13 chuỗi tên gốc. Nhóm alias dự thảo nằm ở Phụ lục A của [đặc tả Phase 0](../Phase%200%20-%20Đặc%20tả%20nghiệp%20vụ%20NE.md). Không dùng tên chuỗi để phân quyền sản phẩm; phải ánh xạ sang ID tài khoản.

## 6. Thứ tự xử lý đề xuất

1. Chủ dữ liệu xác nhận danh sách sales/CTV, alias và quyền owner; xử lý 18 NE thiếu owner, 194 dòng CTV chưa khớp roster và 10 dòng CTV trống.
2. Bổ sung ngành cho `NE 2026!D5` sau khi tra hồ sơ gốc; tính lại summary.
3. Định nghĩa chứng từ học phí và phân loại 8 ô tiền không phải số dương; đối chiếu 339 giá trị số dương với giao dịch thật khi có nguồn ngân hàng.
4. Rà công thức KPI từng tháng, giải thích “khác” và các dòng nhân sự bị bỏ qua; chốt tập lịch sử có thể tin cậy.
5. Duyệt từng nhóm trùng ưu tiên theo quy trình, ghi quyết định ghép/không ghép, rồi mới chạy import thử có dữ liệu chuẩn hóa.

## 7. Giới hạn của vòng audit này

Audit dùng tên cột và vị trí đã khảo sát, không xác minh chứng từ ngân hàng, CCCD hay hợp đồng CTV. Phát hiện trùng dựa trên điện thoại chuẩn hóa, có thể có dương tính giả hoặc bỏ sót số viết theo định dạng lạ. Kết quả cần người phụ trách dữ liệu đối chiếu trước khi sửa workbook hoặc nhập vào CRM. Hai file Excel gốc chưa bị thay đổi.

## 8. Trạng thái Phase 1

**Đã thực hiện:** công cụ audit chạy lại được; profile 9 sheet liên quan; hàng chờ chất lượng dữ liệu; danh sách trùng tiềm năng; đối soát KPI từng tháng; bảng duyệt roster/alias sales và CTV lấy từ Excel; import thử trong bộ nhớ; sơ đồ dữ liệu và schema SQL dự thảo. `source_profile.json` lưu hash SHA-256 của hai workbook để nhận biết khi nguồn thay đổi.

**Chưa commit dữ liệu vào database:** cần duyệt alias nhân sự/CTV, quyết định cách xác nhận thanh toán lịch sử, rà lại công thức KPI và xử lý các mục review. Sau các bước này có thể chạy import thử trên staging theo thứ tự trong tài liệu thiết kế, đối chiếu từng batch rồi mới chuyển production.

## 9. Kết quả import thử trong bộ nhớ

`dry_run_import.py` đọc **1.960 dòng** từ 8 sheet khách hàng/lead (không gồm roster CTV). Khi chỉ ghép ứng viên theo **cùng tên chuẩn hóa và ít nhất một số điện thoại trùng**, có **1.673 nhóm người ứng viên**, trong đó **258 nhóm** gồm nhiều dòng nguồn. Có **206 nhóm** có cả lead lẫn dòng NE (440 dòng tham gia), được xuất sang `lead_ne_link_candidates.csv` để người phụ trách soát trước khi gắn chung hồ sơ. Cùng số điện thoại nhưng tên khác vẫn được giữ tách biệt.

| Kết quả preview | Số dòng | Ý nghĩa |
|---|---:|---|
| `REVIEW_STRUCTURE` | 228 | Thiếu kênh liên hệ hợp lệ, ngành, owner, CTV hoặc thông tin cấu trúc cần thiết. Một dòng có thể có nhiều cờ lỗi. |
| `MAPPING_OR_PAYMENT_APPROVAL_PENDING` | 1.732 | Đủ cấu trúc tối thiểu nhưng alias nhân sự/CTV và/hoặc thanh toán lịch sử chưa được duyệt. |
| Sẵn sàng commit tự động | 0 | Không cấp quyền hoặc công nhận NE dựa trên gợi ý chưa duyệt. |

Riêng `LEAD ONLINE`, **112 dòng** không có điện thoại chuẩn hóa nhưng có link Facebook, nên vẫn có kênh liên hệ. **95 dòng** trong toàn bộ nguồn không có số điện thoại hợp lệ hoặc kênh thay thế đã nhận diện. `NE 2025/2024` có **304 dòng** không có cột owner rõ ràng, cần phân công khi chuyển hệ thống. Dữ liệu này vẫn là preview: không tạo database, không xác nhận thanh toán và không ghép application tự động.
