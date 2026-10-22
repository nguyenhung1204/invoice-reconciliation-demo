# Invoice Reconciliation MVP

Demo for Vietnamese VAT invoice intake, accountant review, PO/GR reconciliation, and reporting. Docker Compose starts one FastAPI app and one MySQL database; the app seeds one ready-to-review invoice scenario on a fresh database.

## Chạy demo trên Windows

1. Cài và mở Docker Desktop; đợi đến khi hiện **Engine running**.
2. Clone repo hoặc tải ZIP từ GitHub rồi giải nén.
3. Nhấp đúp `start-demo.bat`. Lần đầu Docker build image và khởi tạo MySQL, có thể mất vài phút.
4. Mở [http://localhost:8000](http://localhost:8000). Đăng nhập bằng `admin@gmail.com` / `admin`, `ketoan@gmail.com` / `admin`, hoặc `ketoantruong@gmail.com` / `admin`.

Demo nạp đúng một hóa đơn `HD_001.pdf`, thông tin hóa đơn lấy từ PDF, cùng nhà cung cấp và hai dòng hàng tương ứng. PO `PO-DEMO-HD001` và GR `GR-DEMO-HD001` được dựng để minh họa phần trước khi nhận hóa đơn; chúng **không phải chứng từ PO/GR gốc**. Hóa đơn ở trạng thái cần kế toán rà soát. File PDF được đưa vào repo theo yêu cầu chia sẻ demo của nhóm. PO, GR, dòng hóa đơn, hồ sơ OCR, bản rà soát, kết quả đối soát và quyết định duyệt dùng các bảng quan hệ trong cùng database `invoice_reconciliation`.

Nếu không dùng file `.bat`, mở PowerShell ở thư mục repo và chạy:

```powershell
Copy-Item .env.docker.example .env
docker compose up --build --wait -d
```

Mở `/docs` để xem API. Dùng `docker compose ps` để xem trạng thái; dừng app bằng `docker compose down`. Dữ liệu trong các Docker volume được giữ lại. Khi app khởi động, migration có phiên bản cập nhật schema ngay trong database đang cấu hình, giữ nguyên ID và dữ liệu hóa đơn hiện có; HD_001 vẫn là dữ liệu seed duy nhất của demo mới. Không chạy `docker compose down -v` nếu muốn giữ dữ liệu.

Các tài khoản/mật khẩu mẫu chỉ dùng thử cục bộ. Trước khi chia sẻ app qua mạng, hãy sửa mật khẩu và `SECRET_KEY` trong `.env`. OCR dùng PaddleOCR CPU; lần chạy OCR đầu có thể cần tải model. Trọng số fine-tune không nằm trong repo.

## Included modules

1. Authentication and role-based access: Admin, Accountant, Chief Accountant.
2. Supplier, purchase-order, and goods-receipt ledgers, including CSV/XLSX import.
3. Invoice upload and processing state management for PDF/JPEG/PNG.
4. Image preprocessing, PaddleOCR adapter, field normalization, and confidence review.
5. Rule-based reconciliation, human review/approval, and audit events.
6. Dashboard, CSV/XLSX export, processing logs, and a scheduled inbox-folder scan hook.

## Run with Docker (MySQL)

Requirements: Docker Desktop installed and running.

```powershell
Copy-Item .env.docker.example .env
docker compose up --build --wait -d
docker compose ps
```

Open `http://localhost:8000` (API docs: `/docs`). Demo accounts are `admin@gmail.com`, `ketoan@gmail.com`, and `ketoantruong@gmail.com`; each starts with password `admin`. Change these credentials before exposing the app to a network.

Stop with `docker compose down`; named volumes are preserved. `docker compose down -v` deletes the current demo database and uploaded files. OCR CPU support is enabled by default; set `INSTALL_OCR=0` in `.env` for a smaller manual-review image.

## Run locally (SQLite)

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`. Docker uses MySQL; local development uses SQLite. Without OCR dependencies, uploaded invoices remain in `needs_review` for manual entry.

## Project layout

```text
frontend/                 browser UI
backend/app/api/          HTTP routes grouped by module
backend/app/core/         settings, database, authentication, permissions
backend/app/services/     OCR, normalization, reconciliation, reporting
backend/app/models/       SQLAlchemy entities
backend/tests/            backend tests
data/demo/public/         HD_001.pdf and its minimal demo manifest
data/schema/              DDL generated from runtime models, one file per table
data/docs/                database dictionary
data/scripts/              schema generator
docker-compose.yml        MySQL + app services and persistent volumes
backend/Dockerfile        application image
```

## Data notes

- The included public invoice is the real `HD_001.pdf`, shared intentionally for this team demo. The manifest contains only fields needed to seed the UI and matching scenario; it omits the source file's address, phone, lookup code, and tax-authority code.
- The PO/GR rows are illustrative data derived from the invoice and are clearly labeled as such in the invoice review note.
- `data/schema/tables/` is generated from the same SQLAlchemy metadata the API uses. The startup migration updates the configured demo database in place; there is no second demo schema to import manually.
- Other real invoices, `.env`, local database files, upload history, and research labels remain excluded from Git.

## Tests

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest tests -q
cd ..
node --test frontend/tests/invoice_preview.test.mjs
```
