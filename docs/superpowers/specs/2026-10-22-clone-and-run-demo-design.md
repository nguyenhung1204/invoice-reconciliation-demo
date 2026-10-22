# Thiết kế gói demo HD_001 clone và chạy

Ngày: 2026-10-22
Trạng thái: Đã triển khai theo yêu cầu của người dùng

## Ý định và kết quả mong muốn

Giúp nhóm clone repo public trên Windows, chạy `start-demo.bat` và thấy hóa đơn HD_001 cùng PO/GR minh họa khớp để thử luồng.

## Phạm vi

- Dùng `start-demo.bat`, một Docker Compose project và schema runtime hiện tại.
- Đóng gói PDF HD_001 theo yêu cầu rõ ràng của người dùng cùng manifest tối thiểu để tạo dữ liệu hiển thị trên giao diện.
- Nạp nhà cung cấp, invoice, PO và GR theo model/API hiện hành. Trường invoice lấy từ PDF; PO/GR là chứng từ minh họa, không tuyên bố là chứng từ gốc.
- Seed idempotent; chỉ thêm dữ liệu còn thiếu, không ghi đè các trường người dùng sửa.
- Hướng dẫn clone → chạy `start-demo.bat` → mở localhost, và cách dừng vẫn giữ volumes.

## Chia sẻ dữ liệu

- Người dùng đã yêu cầu đưa đúng file HD_001.pdf vào Git để nhóm dùng demo.
- Manifest chỉ giữ MST hai bên, số/ngày hóa đơn, tổng tiền, các dòng hàng và dữ liệu cần thiết để tạo PO/GR minh họa. Không chép địa chỉ, điện thoại, mã tra cứu, mã cơ quan thuế hoặc database nghiên cứu.
- Các PDF khác, `.env`, nhãn Excel/CSV và database local không được đưa vào repo.

## Quyết định triển khai

- Tạo seed qua service Python sau `Base.metadata.create_all()`, theo model runtime; không dùng nhãn ground truth làm dữ liệu kế toán.
- Dùng tên fixture và SHA-256 để lưu đúng PDF, tránh nhân bản khi khởi động lại và giữ nguyên nội dung đã sửa.
- Database demo dùng volume MySQL mới có tên riêng để không trộn dữ liệu cũ; volume cũ vẫn được giữ.
- Xác minh cold start có đúng một invoice HD_001, một supplier, PO và GR; xác minh run lặp không nhân đôi, `/health`, đối chiếu không có findings, và byte của PDF giống fixture trong Git.
