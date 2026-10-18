# Invoice Reconciliation MVP

MVP for Vietnamese VAT invoice intake, OCR review, PO/GR reconciliation, and reporting. The code is split into `frontend`, `backend`, and `data` so each project layer can evolve independently.

## Chạy demo trên Windows

1. Cài và mở Docker Desktop; đợi đến khi hiện **Engine running**.
2. Tải mã nguồn bằng **Code → Download ZIP** trên GitHub rồi giải nén, hoặc chạy `git clone https://github.com/nguyenhung1204/invoice-reconciliation-demo.git`.
3. Mở thư mục dự án vừa giải nén và nhấp đúp `start-demo.bat`. Lần đầu Docker cần tải MySQL, thư viện OCR và mô hình nhận dạng nên có thể mất vài phút.
4. Truy cập [http://localhost:8000](http://localhost:8000). Đăng nhập bằng `admin@gmail.com` / `admin`, `ketoan@gmail.com` / `admin`, hoặc `ketoantruong@gmail.com` / `admin`.

Nếu không dùng file `.bat`, mở PowerShell trong thư mục dự án và chạy:

```powershell
Copy-Item .env.docker.example .env
docker compose up --build -d
```

Xem trạng thái bằng `docker compose ps`; nếu Docker chưa khởi động, mở Docker Desktop rồi chạy lại. Dừng demo bằng `docker compose down`. Dữ liệu MySQL và hóa đơn đã tải vẫn được giữ trong Docker volumes. Mỗi máy có địa chỉ `localhost:8000` riêng; liên kết GitHub chỉ chứa mã nguồn, không phải trang demo chạy sẵn trên Internet.

Các tài khoản và mật khẩu trên chỉ dùng để thử nghiệm cục bộ. Trước khi cho người khác truy cập qua mạng, hãy sửa mật khẩu và `SECRET_KEY` trong `.env`. Bản GitHub không chứa `.env`, cơ sở dữ liệu, hóa đơn đã tải lên hoặc trọng số mô hình fine-tune 40/40; OCR dùng PaddleOCR mặc định.

## Included modules

1. Authentication and role-based access: Admin, Accountant, Chief Accountant.
2. Supplier, purchase-order, and goods-receipt ledgers, including CSV/XLSX import.
3. Invoice upload and processing state management for PDF/JPEG/PNG.
4. Image preprocessing, PaddleOCR adapter, field normalization, and confidence review.
5. Rule-based reconciliation, human review/approval, and audit events.
6. Dashboard, CSV/XLSX export, processing logs, and a scheduled inbox-folder scan hook.

## Run with Docker (MySQL)

This is the easiest way to share and run the complete demo. Docker Compose starts MySQL and the FastAPI app; invoice uploads and the MySQL database are kept in named Docker volumes.

Requirements: Docker Desktop installed and running.

```powershell
Copy-Item .env.docker.example .env
# For a private or shared environment, edit .env and replace the sample passwords and SECRET_KEY.
docker compose up --build -d
docker compose ps
```

Open `http://localhost:8000` (API docs: `/docs`). Demo accounts are `admin@gmail.com`, `ketoan@gmail.com`, and `ketoantruong@gmail.com`; each starts with password `admin`. Change these credentials before exposing the app to a network.

Stop the app with `docker compose down`; persistent database and invoice files remain in Docker volumes. `docker compose down -v` also deletes those volumes and all data stored in them.

The Docker package starts with a clean MySQL database. It does not include the current local SQLite database or uploaded invoice files. PaddleOCR CPU support is enabled by default and model downloads are kept in a named volume; first OCR use may download pretrained weights. Set `INSTALL_OCR=0` in `.env` for a smaller manual-review-only image. The fine-tuned model weights from Google Drive are not part of this source package, so this image uses PaddleOCR's default pretrained model unless those weights are separately added and configured.

## Run locally (SQLite)

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`. The API is documented at `/docs`. The first admin is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`; replace the example password before using real data.

The default local database is a SQLite file under `backend/data/`. Docker uses MySQL. OCR dependencies are separated because PaddlePaddle wheels depend on the target OS/CUDA runtime: install a compatible PaddlePaddle wheel, then `pip install -r requirements-ocr.txt`. Without OCR installed, upload still succeeds and the invoice stays in `needs_review` for manual entry. Set `INBOX_SCAN_DIR` to an approved local folder to poll it once per minute; files are copied into private storage and queued, while originals remain in place.

## Project layout

```text
frontend/                 browser UI (served by FastAPI in development)
backend/app/api/          HTTP routes grouped by module
backend/app/core/         settings, database, authentication, permissions
backend/app/services/     OCR, normalization, reconciliation, reporting
backend/app/models/       SQLAlchemy entities
backend/tests/            focused unit tests
data/                     empty runtime data area; no source invoices included
docker-compose.yml        MySQL + app services and persistent volumes
backend/Dockerfile        application image
```

## Security and scope

- Passwords are hashed; API access uses expiring JWTs and server-side role checks.
- Uploaded invoice files are stored under the backend's private data folder with generated names.
- The application does not connect to email, Telegram, tax authority services, or any external API in this first scope.
- OCR is a pluggable adapter and defaults to the original PaddleOCR recognizer strategy. Do not treat OCR output as approved accounting data until a user reviews it.
- `data/` is intentionally empty. Use synthetic or explicitly approved sample data during development.

## Tests

```powershell
python -m pytest
```
