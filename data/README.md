# Dữ liệu demo và cơ sở dữ liệu

Demo Docker dùng PDF thật `demo/public/HD_001.pdf` và manifest tối thiểu bên cạnh. Hóa đơn được nạp ở trạng thái cần kế toán rà soát. PO/GR trong manifest là chứng từ minh họa được dựng để chạy thử đối chiếu; chúng không phải chứng từ gốc.

## Nội dung thư mục

- `demo/public/`: PDF HD_001 được chia sẻ cho demo và metadata cần để nạp hóa đơn/PO/GR.
- `schema/tables/`: DDL MySQL tách từng bảng, sinh trực tiếp từ model SQLAlchemy của ứng dụng.
- `docs/DATA_DICTIONARY.md`: từ điển cột và khóa ngoại đúng với schema runtime.
- `scripts/generate_schema.py`: tạo lại DDL và từ điển từ model runtime.

Các PDF nguồn khác, bộ nhãn nghiên cứu, thông tin liên lạc riêng, và database local không được nạp vào demo hoặc đưa lên Git.

## Tạo lại DDL runtime

Chạy từ thư mục gốc dự án:

```powershell
python .\data\scripts\generate_schema.py
```

Demo và dữ liệu dùng chung một schema `invoice_reconciliation`. Ứng dụng tự chạy migration có phiên bản trên database đang dùng, giữ dữ liệu HD_001 và chuẩn hóa các dòng PO/GR/hóa đơn vào bảng quan hệ. Không tạo database thứ hai và không cần nạp DDL thủ công vào MySQL Workbench.

Các file trong `schema/tables/` chỉ dùng để xem hoặc dựng một database mới độc lập. Chúng được sinh từ cùng các model mà API sử dụng:

```powershell
python .\data\scripts\generate_schema.py
```

## Quy ước

- Trường hiển thị hóa đơn HD_001 lấy từ PDF nguồn; trạng thái seed là `needs_review` để kế toán có thể rà soát.
- PO và GR mẫu dùng cùng nhà cung cấp, mã PO, mặt hàng và số lượng; note trên hồ sơ nhắc rõ hai chứng từ này là minh họa.
- Các bảng nhãn nghiên cứu không phải dữ liệu kế toán đã duyệt và không được dùng làm kết quả OCR.

Xem từ điển tại `data/docs/DATA_DICTIONARY.md` và DDL runtime tại `data/schema/tables/`.
