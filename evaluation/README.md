# Bộ đánh giá AutoInvoice

Các lệnh chạy từ thư mục gốc dự án. Mỗi script có `--help`.

## Đánh giá OCR trên hóa đơn có nhãn thật

Đặt bản scan/PDF vào `evaluation/invoices/` và điền nhãn thật tương ứng trong `ground_truth.csv`. Script chỉ tính số liệu với các trường nhãn không rỗng. Nếu chưa có nhãn, nó dừng và báo chưa có dữ liệu thay vì tạo kết quả giả.

```powershell
python evaluation/eval_ocr.py
```

Kết quả chi tiết và tổng hợp được ghi vào `evaluation/results/ocr_results.csv` và `ocr_summary.md`. Pipeline gọi bộ nhận dạng PaddleOCR của backend (gồm tiền xử lý OpenCV nếu cài) rồi `normalization.extract_fields`.

## Đánh giá đối soát

```powershell
python evaluation/eval_reconciliation.py
```

Ca tổng hợp trong `recon_cases.json` được truyền vào `reconcile()` thật. Script ghi độ chính xác mã cảnh báo và macro/micro F1 vào `evaluation/results/`.

Các chỉ số đối soát hiện được tính trên 30 ca tổng hợp đã ghi nhãn trong JSON; chúng kiểm tra sự phù hợp giữa engine và bộ ca này, không phải kết quả trên hóa đơn thực tế.

## Đo thông lượng API

Khởi động server trước, đặt tối thiểu N file hóa đơn khác nhau trong `evaluation/invoices/`, rồi chạy:

```powershell
python evaluation/eval_throughput.py --base-url http://localhost:8000 --token JWT --n 20 --workers 5
```

Mỗi file chỉ được gửi một lần; script kiểm tra SHA-256 khác nhau để tránh trùng hóa đơn. Nó không tự tạo dữ liệu scan.

## So sánh thủ công và tự động

```powershell
python evaluation/eval_manual_vs_auto.py --manual-seconds 300
```

Thời gian tự động lấy từ `ocr_results.csv`. Thời gian thủ công là số giây/hóa đơn bạn đo và truyền vào lệnh.
