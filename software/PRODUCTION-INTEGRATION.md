# Hướng dẫn Kết nối Production: NestJS API & OIDC

Tài liệu này hướng dẫn cách kết nối giao diện Next.js Web (`apps/web`) với backend NestJS API (`apps/api`), cơ sở dữ liệu PostgreSQL và hệ thống xác thực OpenID Connect (OIDC) cho môi trường triển khai Production.

---

## 1. Kiến trúc hệ thống Production

```text
               ┌────────────────────────────────────────────────────────┐
               │         IdP Doanh nghiệp (Microsoft Entra / Keycloak)  │
               └───────────────────────────┬────────────────────────────┘
                                           │ OIDC Access Token (JWT)
                                           ▼
┌───────────────────────────┐      Bearer Token      ┌───────────────────────────┐
│     Next.js Web (UI)      │ ─────────────────────► │     NestJS API (Backend)  │
│      Port: 3000           │                        │      Port: 4000           │
└───────────────────────────┘                        └─────────────┬─────────────┘
                                                                   │ PostgreSQL
                                                                   ▼
                                                     ┌───────────────────────────┐
                                                     │    PostgreSQL Database    │
                                                     └───────────────────────────┘
```

---

## 2. Chuẩn bị IdP (OpenID Connect Provider)

### Trường hợp 1: Microsoft Entra ID (Khuyến nghị cho doanh nghiệp dùng M365)
1. Truy cập Azure Portal -> Microsoft Entra ID -> **App registrations** -> Tạo mới `NBS-CRM-Production`.
2. Tạo API scope: `api://<client-id>/access_as_user`.
3. Lấy các thông số cấu hình:
   - `OIDC_ISSUER`: `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
   - `OIDC_AUDIENCE`: `api://<client-id>` hoặc `<client-id>`
   - `OIDC_JWKS_URI`: `https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys`

### Trường hợp 2: Keycloak (Tự vận hành)
1. Tạo Realm `nbs-crm`.
2. Tạo Client `nbs-crm-api` với chế độ Access Type: `confidential` hoặc `public`.
3. Lấy các thông số:
   - `OIDC_ISSUER`: `https://<keycloak-host>/realms/nbs-crm`
   - `OIDC_AUDIENCE`: `nbs-crm-api`
   - `OIDC_JWKS_URI`: `https://<keycloak-host>/realms/nbs-crm/protocol/openid-connect/certs`

---

## 3. Cấu hình biến môi trường

### A. Cho NestJS API (`software/apps/api/.env`)
Tạo tệp `.env` tại `software/apps/api/.env`:
```env
PORT=4000
DATABASE_URL=postgresql://postgres:matkhau@localhost:5432/ne_crm
WEB_ORIGIN=http://127.0.0.1:3000

# OIDC Identity Provider
OIDC_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
OIDC_AUDIENCE=api://<CLIENT_ID>
OIDC_JWKS_URI=https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys
```

### B. Cho Next.js Web (`software/apps/web/.env.local` hoặc `.env.production`)
Tạo tệp `.env.production` tại `software/apps/web/.env.production`:
```env
# Kích hoạt chế độ Production API
USE_PRODUCTION_API=true
NESTJS_API_URL=http://127.0.0.1:4000/api
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api
```

---

## 4. Danh sách API Endpoints trên NestJS Production

| Nhóm | Endpoint | Method | Vai trò | Chức năng |
|---|---|---|---|---|
| **Hệ thống** | `/api/health` | GET | Public | Healthcheck tình trạng DB và service |
| **Xác thực** | `/api/me` | GET | Tất cả | Lấy thông tin user hiện tại và role từ token |
| **Dashboard** | `/api/dashboard/summary` | GET | Tất cả | Thống kê số lượng lead, NE ròng theo scope |
| **Hồ sơ lead** | `/api/applications` | GET | Tất cả | Danh sách hồ sơ tuyển sinh (áp dụng RBAC scope) |
| **Hồ sơ lead** | `/api/applications/:id` | GET | Tất cả | Chi tiết hồ sơ tuyển sinh và liên hệ |
| **Học phí** | `/api/payments` | GET | Tất cả | Danh sách giao dịch học phí (áp dụng scope) |
| **Đối soát** | `/api/payments/:id/review` | POST | Admin/Leader | Duyệt/Từ chối giao dịch và tự động tính `ne_events` |
| **Biến động NE**| `/api/ne-events` | GET | Tất cả | Danh sách sự kiện +1/-1 NE chính thức theo ngày tiền vào |
| **Cộng tác viên**| `/api/ctv` | GET | Tất cả | Danh sách CTV thuộc phạm vi |
| **Cộng tác viên**| `/api/ctv` | POST | Tất cả | Tạo CTV mới |
| **Cộng tác viên**| `/api/ctv/:id/transfer`| PATCH | Admin/Leader | Bàn giao CTV sang Sales mới, lưu lịch sử hiệu lực |
| **Quản trị user**| `/api/admin/users` | GET, POST, PATCH | Admin | Phê duyệt, phân quyền vai trò người dùng |
| **Audit log** | `/api/admin/audit` | GET | Admin/Leader | Truy vết thay đổi nhạy cảm trong hệ thống |

---

## 5. Khởi động và Kiểm thử

1. **Build toàn bộ Workspace:**
   ```powershell
   cd software
   pnpm build:api
   pnpm build:web
   ```

2. **Khởi chạy NestJS API:**
   ```powershell
   pnpm start:api
   ```
   Kiểm tra log: `Nest application successfully started on port 4000`.

3. **Khởi chạy Next.js Web:**
   ```powershell
   pnpm --filter @ne-crm/web start
   ```

4. **Kiểm tra luồng xác thực:**
   Gửi request kèm token từ IdP:
   ```powershell
   curl -H "Authorization: Bearer <IDP_ACCESS_TOKEN>" http://127.0.0.1:4000/api/me
   ```
   API trả về JSON:
   ```json
   {
     "id": "uuid-cua-user",
     "email": "sales@company.com",
     "displayName": "Nguyễn Văn A",
     "role": "SALES"
   }
   ```
