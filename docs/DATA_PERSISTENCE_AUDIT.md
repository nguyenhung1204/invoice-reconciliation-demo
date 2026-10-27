# Kiểm tra giao diện và luồng dữ liệu MySQL

Ngày kiểm tra: 2026-10-28

Project: `E:\KhoaLuanTotNghiep\invoice_reconciliation_mvp`
Môi trường kiểm chứng: Docker Compose local, FastAPI, MySQL 8.4, React build tại `/`.

## Kết luận

Các màn hình nghiệp vụ của React lấy dữ liệu qua API FastAPI và lưu bản ghi nghiệp vụ trong MySQL. Store ở trình duyệt chỉ làm bộ nhớ tạm để chia sẻ dữ liệu giữa các màn hình; sau đăng nhập ứng dụng đồng bộ từ backend trước khi hiển thị. Khi đồng bộ thất bại, ứng dụng báo lỗi và không đăng nhập bằng dữ liệu mẫu cục bộ.

Tệp PDF được lưu trong named volume `invoice_uploads`; MySQL lưu metadata, hash và đường dẫn tệp trong `invoice_files`. Đây là dữ liệu bền vững qua lần khởi động, nhưng bytes của PDF không nằm trong MySQL.

## Kiểm kê giao diện và luồng

| Trang / chức năng | Đọc / ghi và API | Bảng MySQL chính | Trạng thái sau rà soát |
|---|---|---|---|
| Đăng nhập / phiên | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` | `users`, `audit_events` | Đã nối. Không còn đăng nhập dự phòng bằng user mẫu khi API lỗi. |
| Dashboard | Đồng bộ `GET /api/invoices`, `/api/ledger/suppliers`, `/api/ledger/purchase-orders`, `/api/ledger/goods-receipts`, `/api/reports/worker`, `/api/reports/settings`, `/api/reports/audit` | `invoices`, `suppliers`, `purchase_orders`, `goods_receipts`, `reconciliation_settings`, `audit_events` | Đã nối với MySQL qua API; KPI/chart hiện tính từ danh sách hóa đơn trên client. API tổng hợp `/api/reports/dashboard` có sẵn nhưng chưa được gọi bởi trang này. |
| Tiếp nhận / hàng đợi | `GET /api/invoices`, `POST /api/invoices/upload`, `POST /api/invoices/{id}/ocr`, `DELETE /api/invoices/{id}` | `invoices`, `invoice_files`, `invoice_ocr_runs`, `invoice_ocr_fields`, `invoice_items`, `audit_events` | Đã nối. Upload/OCR chỉ báo thành công theo phản hồi server. Danh sách lấy tối đa 300 hồ sơ mới nhất. PDF lưu trong volume, đường dẫn/hash lưu MySQL. |
| Rà soát OCR | `GET /api/invoices/{id}`, `GET /api/invoices/{id}/file`, `PATCH /api/invoices/{id}/review` | `invoices`, `invoice_items`, `invoice_reviews`, `invoice_approvals`, `reconciliation_runs`, `audit_events` | Đã nối. Sửa phần đầu và dòng hàng được gửi lên server; không dùng giá trị giả để thay kết quả OCR. |
| Đối soát / phê duyệt | `POST /api/invoices/{id}/reconcile`, `/approve`, `/reject` | `invoices`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `reconciliation_runs`, `reconciliation_findings`, `reconciliation_line_allocations`, `invoice_approvals`, `audit_events` | Đã nối. Các luồng kiểm tra điều kiện, lưu snapshot và đọc lại trạng thái từ backend. |
| Đơn đặt hàng PO | `/api/ledger/purchase-orders` GET/POST/PATCH/DELETE; import CSV qua `/api/ledger/import/purchase-orders` | `purchase_orders`, `purchase_order_items`, `suppliers`, `users`, `audit_events` | Đã nối. Từ chối xóa PO đang được GR/hóa đơn tham chiếu. |
| Phiếu nhập kho GR | `/api/ledger/goods-receipts` GET/POST/PATCH/DELETE; import CSV qua `/api/ledger/import/goods-receipts` | `goods_receipts`, `goods_receipt_items`, `purchase_orders`, `audit_events` | Đã nối. Lưu người nhận, kho và ghi chú dòng; xóa có kiểm tra quan hệ. |
| Nhà cung cấp | `/api/ledger/suppliers` GET/POST/PATCH/DELETE; import CSV qua `/api/ledger/import/suppliers` | `suppliers`, `purchase_orders`, `invoices`, `audit_events` | Đã nối. MST và mã NCC được kiểm tra trùng; mã NCC cũ còn NULL vẫn đọc được. |
| Khách hàng | `/api/master-data/customers` GET/POST/PATCH/DELETE; import CSV | `customers`, `audit_events` | Đã nối. CRUD và import dùng API; bản ghi còn sau khi tải lại. |
| Nhân viên | `/api/master-data/employees` GET/POST/PATCH/DELETE; import CSV | `employees`, `audit_events` | Đã nối. CRUD và import dùng API. |
| Loại sản phẩm | `/api/master-data/product-categories` GET/POST/PATCH/DELETE; import CSV | `product_categories`, `products`, `audit_events` | Đã nối. Không xóa danh mục đang được sản phẩm tham chiếu. |
| Sản phẩm | `/api/master-data/products` GET/POST/PATCH/DELETE; import CSV | `products`, `product_categories`, `invoice_items`, `purchase_order_items`, `goods_receipt_items`, `audit_events` | Đã nối. Kiểm tra danh mục, giá và lượng tồn; không xóa sản phẩm đang được chứng từ tham chiếu. |
| Kế toán thu chi | `/api/accounting/vouchers` GET/POST/PATCH/DELETE | `accounting_vouchers`, `invoices`, `users`, `audit_events` | Đã nối. Phiếu tự động sinh là chỉ đọc; kiểm tra hóa đơn tham chiếu trước khi lưu. |
| Báo cáo | `/api/reports/export.csv`, `/export.xlsx`, `/reconciliation.csv` | `invoices`, `reconciliation_runs` | Đã nối với dữ liệu server. XML hiển thị trong UI là bản tham khảo tạo từ dữ liệu đã tải, không khẳng định là định dạng nhập MISA/ERP. |
| Cấu hình / nhật ký | `GET/PUT /api/reports/settings`, `GET /api/reports/audit` | `reconciliation_settings`, `users`, `audit_events` | Đã nối. Lỗi lưu không báo thành công. Email/Telegram hiện chỉ lưu cờ cấu hình; chức năng gửi thông báo chưa tích hợp. |
| Header / quét thư mục | `GET /api/reports/worker`, `POST /api/reports/scan-now` | `reconciliation_settings`, các bảng hóa đơn sau khi quét | Đã nối. Chỉ quét khi thư mục inbox được cấu hình; không có inbox thì API báo rõ chưa cấu hình. |

Các bộ lọc, ô tìm kiếm, lựa chọn tab, phân trang hiển thị và bản nháp form giữ ở React vì chỉ là state giao diện. Danh sách mà chúng lọc được tải từ API; thao tác lưu vẫn đi qua backend. Mẫu CSV tải xuống là tệp mẫu phía client, còn import dữ liệu gọi API và tải lại danh sách từ server.

## Các sửa đổi đáng chú ý

- Tạo API/model/migration cho khách hàng, nhân viên, loại sản phẩm, thuộc tính sản phẩm và phiếu thu chi; chuyển CRUD khỏi local-only state.
- Sửa lưu PO/GR, cài đặt đối soát, rà soát hóa đơn và các luồng approve/reject để chờ xác nhận từ backend rồi mới thông báo thành công. Ngưỡng tin cậy OCR và ngưỡng ghép dòng PO/GR đều đọc cấu hình đang lưu trong MySQL.
- Sửa migration MySQL cho ghi chú dòng GR: MySQL không cho `TEXT DEFAULT ''`; migration thêm cột nullable, backfill dòng cũ rồi đặt NOT NULL. Có thể chạy lại sau lần migration bị dừng giữa chừng.
- Gỡ API `POST /api/ledger/clear-all` và client tương ứng vì thao tác xóa toàn bộ hóa đơn/PO/NCC không có chức năng giao diện hợp lệ.
- `/mock` và `/new` nay phục vụ cùng React app với `/`; `/old` trả 404. API không tồn tại trả JSON 404 thay vì HTML của legacy app.
- Giữ trang `/change-password.html` hoạt động riêng và đồng bộ token với phiên React trong `sessionStorage`.
- Gỡ hóa đơn giả được tạo ngẫu nhiên bởi `addUploadedInvoice()`; hàm này không có nơi gọi.

## Dữ liệu và bằng chứng runtime

- `docker compose ps`: app và MySQL đều `healthy`; `GET http://127.0.0.1:8000/health` trả `200`, trang `/` trả `200`.
- Schema MySQL có 30 bảng; `schema_migrations` đã chạy từ `0001` đến `0006`.
- Row count sau migration/seed: `users` 3, `suppliers` 1, `purchase_orders` 1, `purchase_order_items` 2, `goods_receipts` 1, `goods_receipt_items` 2, `invoices` 2, `invoice_items` 2, `reconciliation_settings` 1, `product_categories` 1, `products` 1, `customers` 1, `employees` 1, `accounting_vouchers` 1.
- Seed chạy lại lần thứ hai trả `0` bản ghi tạo mới ở tất cả nhóm; dữ liệu hiện hữu được giữ nguyên.
- Migrations `0001`–`0006` hiện có trong MySQL; số bảng: 30. Sau rebuild app, `app` và `db` đều `healthy`, `/health` trả `200`.
- Live smoke test chạy trong container app với chính MySQL đang hoạt động. Đã đọc hóa đơn, dashboard, worker, settings, audit, CSV/XLSX, NCC, PO, GR, danh mục, sản phẩm, khách hàng, nhân viên và phiếu thu chi; chạy CRUD trên các nhóm danh mục, sản phẩm, khách hàng, nhân viên, NCC, PO, GR và phiếu. Các request ghi dùng transaction có rollback; truy vấn sau đó xác nhận không còn bản ghi `VERIFY-*`.
- Kiểm tra đường dẫn `/`, `/mock`, `/new`, `/index.html`, trang đổi mật khẩu và phản hồi JSON 404 cho API lạ. OpenAPI không còn công khai `/api/ledger/clear-all`.
- Xác minh tự động cuối: backend `62 passed, 1 skipped`; frontend `31 passed`; `tsc --noEmit` thành công; Vite build thành công. Build còn cảnh báo từ `pdfjs-dist` dùng `eval` và bundle JS lớn hơn 500 kB; không làm build thất bại.
- Smoke test qua API trong browser client của FastAPI, không mô phỏng thao tác chuột trên mọi form. Các contract frontend tương ứng được kiểm bằng Node test.

## Giới hạn còn lại

- Email/Telegram chưa gửi thông báo; giao diện hiện chỉ lưu cấu hình bật/tắt.
- Quét inbox cần thư mục local được cấu hình và có quyền đọc; mặc định không có nguồn inbox.
- `/api/invoices` hiện trả tối đa 300 hóa đơn mới nhất. Dashboard và hàng đợi tính/lọc trên danh sách này, nên số liệu không bao phủ hóa đơn cũ hơn nếu database vượt 300 hồ sơ. Chưa có phân trang phía server.
- PDF được giữ ở named volume. Sao lưu MySQL riêng không bao gồm bytes PDF; cần sao lưu volume `invoice_uploads` cùng database.
