# Dữ liệu demo và schema tham chiếu

Demo Docker dùng PDF thật `demo/public/HD_001.pdf` và manifest tối thiểu bên cạnh. Hóa đơn được nạp ở trạng thái cần kế toán rà soát. PO/GR trong manifest là chứng từ minh họa được dựng để chạy thử đối chiếu; chúng không phải chứng từ gốc.

## Nội dung thư mục

- `demo/public/`: PDF HD_001 được chia sẻ cho demo và metadata cần để nạp hóa đơn/PO/GR.
- `schema/`: DDL tham chiếu, tách mỗi bảng một file trong `schema/tables/`.
- `docs/DATA_DICTIONARY.md`: từ điển bảng và trường của schema tham chiếu.
- `scripts/generate_schema.py`: tạo lại các file DDL tham chiếu.

Các PDF nguồn khác, bộ nhãn nghiên cứu, thông tin liên lạc riêng, và database local không được nạp vào demo hoặc đưa lên Git.

## Tạo lại DDL tham chiếu

Chạy từ thư mục gốc dự án:

```powershell
python .\data\scripts\generate_schema.py
```

DDL trong `schema/tables/` là tài liệu schema tham chiếu riêng, không phải migration của database demo. Runtime Docker hiện dùng model SQLAlchemy trong `backend/app/models/`; không nạp các file DDL tham chiếu vào `invoice_reconciliation`.

## Quy ước

- Trường hiển thị hóa đơn HD_001 lấy từ PDF nguồn; trạng thái seed là `needs_review` để kế toán có thể rà soát.
- PO và GR mẫu dùng cùng nhà cung cấp, mã PO, mặt hàng và số lượng; note trên hồ sơ nhắc rõ hai chứng từ này là minh họa.
- Các bảng nhãn nghiên cứu không phải dữ liệu kế toán đã duyệt và không được dùng làm kết quả OCR.

Xem từ điển tại `data/docs/DATA_DICTIONARY.md` và DDL tham chiếu tại `data/schema/tables/`.
