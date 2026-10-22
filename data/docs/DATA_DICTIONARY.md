# Từ điển dữ liệu

Tất cả bảng dùng InnoDB và utf8mb4. Khóa chính là số nguyên tăng tự động trừ các bảng hồ sơ vai trò nhà cung cấp/bên mua, vốn dùng chung ID với organizations. Tiền dùng DECIMAL(18,2); số lượng dùng DECIMAL(18,4); ngày giao dịch dùng DATE/DATETIME.

| Nhóm | Bảng | Mục đích và quan hệ chính |
|---|---|---|
| Danh mục | organizations | Pháp nhân định danh bằng mã số thuế; tên có thể NULL nếu nguồn chưa có. |
| Danh mục | supplier_profiles | Vai trò nhà cung cấp của một tổ chức; PK/FK là supplier_id. |
| Danh mục | customer_profiles | Vai trò bên mua/khách hàng của một tổ chức; PK/FK là customer_id. |
| Danh mục | products | Danh mục SKU chuẩn; không tạo SKU từ tên hàng chưa chuẩn hóa. |
| Tài khoản | users | Tài khoản và vai trò người dùng; lưu hash mật khẩu, không lưu mật khẩu thô. |
| Mua hàng | purchase_orders | Đầu đơn PO, liên kết nhà cung cấp và người tạo. |
| Mua hàng | purchase_order_items | Dòng hàng PO; mỗi dòng thuộc một PO, có thể liên kết mã hàng. |
| Nhập kho | goods_receipts | Đầu phiếu GR, có thể tham chiếu PO và người nhận. |
| Nhập kho | goods_receipt_items | Dòng hàng thực nhận; có thể liên kết dòng PO để so sánh số lượng. |
| Hóa đơn | invoices | Hồ sơ nghiệp vụ hóa đơn, PO và hai bên là tham chiếu nullable. |
| Hóa đơn | invoice_files | Metadata tệp gốc, đường dẫn tương đối, SHA-256 và hóa đơn sở hữu tệp. |
| Hóa đơn | invoice_items | Dòng hàng nghiệp vụ đã được chấp nhận/ghi nhận, tách khỏi nhãn nghiên cứu. |
| Nhãn tham chiếu | datasets | Thông tin nguồn của một bộ nhãn tùy chọn. |
| Nhãn tham chiếu | dataset_invoices | Liên kết hóa đơn với nguồn tham chiếu và vị trí bản ghi nguồn. |
| Nhãn tham chiếu | invoice_ground_truth_fields | Nhãn từng trường, lưu riêng giá trị gốc, giá trị chuẩn hóa và nguồn cột. |
| Nhãn tham chiếu | dataset_invoice_item_labels | Nhãn theo dòng mặt hàng; số lượng/đơn giá có thể để trống. |
| OCR | invoice_ocr_runs | Mỗi lần chạy OCR, mô hình, trạng thái và thời gian xử lý. |
| OCR | invoice_ocr_fields | Trường OCR theo lần chạy, độ tin cậy, trang và hộp tọa độ nếu có. |
| Rà soát | invoice_reviews | Lịch sử từng phiên bản rà soát của kế toán cho hóa đơn. |
| Đối soát | reconciliation_runs | Một lần so sánh hóa đơn với PO/GR và dung sai áp dụng. |
| Đối soát | reconciliation_findings | Từng phát hiện sai lệch, có thể tham chiếu các dòng hóa đơn/PO/GR. |
| Nhật ký | audit_events | Ai thực hiện thao tác gì trên đối tượng nào và thời điểm nào. |

## Ranh giới dữ liệu

- invoices/invoice_items là dữ liệu vận hành. OCR, người dùng hoặc kế toán mới cập nhật chúng.
- invoice_ground_truth_fields/dataset_invoice_item_labels là nhãn tham chiếu dùng cho nghiên cứu và đánh giá. Chúng không được nhập nhầm vào trường kết quả OCR.
- dataset_invoices lưu mã tham chiếu của nguồn và vị trí dòng trong file gốc; mã nội bộ không đồng nghĩa số hóa đơn pháp lý.
- Mối liên hệ PO/GR là tùy chọn ở đầu hóa đơn vì có thể chưa tạo PO/GR hoặc nguồn không cung cấp; khi đối soát thì ghi lại PO/GR đã chọn trong reconciliation_runs.
- Không nối nhãn chuẩn trực tiếp với bản ghi OCR; mỗi lần OCR là một kết quả riêng, cho phép so sánh nhiều mô hình mà không sửa nhãn chuẩn.

## Tệp DDL

Mỗi bảng có đúng một file trong schema/tables/. Chạy 00_create_database.sql trước, sau đó các bảng 01 đến 22 theo thứ tự tên để bảo đảm khóa ngoại.
