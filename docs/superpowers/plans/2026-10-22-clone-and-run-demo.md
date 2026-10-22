# Kế hoạch hoàn thiện một bản demo HD_001

## Mục tiêu

Nhóm clone repo và chạy một ứng dụng Docker duy nhất. Database mới tự nạp HD_001, nhà cung cấp, PO minh họa và GR minh họa; hóa đơn mở được trên giao diện và dữ liệu đối chiếu khớp.

## Việc thực hiện

1. Dùng file HD_001.pdf do người dùng cung cấp; kiểm tra hash trước/sau khi sao chép để bảo đảm PDF không bị đổi.
2. Tạo manifest tối thiểu cho trường invoice, nhà cung cấp, PO và GR; ghi rõ PO/GR là minh họa.
3. Viết test cho seed một invoice, đúng hai dòng hàng, đối chiếu khớp, seed lặp không tạo bản sao và giữ nội dung kế toán đã sửa.
4. Cập nhật seed service, Docker image, Compose, hướng dẫn Windows và file môi trường mẫu.
5. Dùng volume MySQL mới dành cho HD_001; giữ nguyên volume database cũ để không trộn các hóa đơn trước.
6. Chạy unit/integration tests, build image và smoke test Compose: `/health`, số lượng bản ghi, đối chiếu và PDF mở được.
7. Rà soát file sẽ commit; push bản hoàn chỉnh lên nhánh nhóm đang dùng sau khi các kiểm tra đạt.

## Điều kiện hoàn tất

- Clone sạch chạy được bằng `start-demo.bat`.
- Chỉ có một PDF HD_001, một nhà cung cấp, một PO và một GR trong database demo sạch.
- Invoice và PO/GR khớp nhà cung cấp, hai mặt hàng, số lượng, đơn giá và tổng tiền.
- Khởi động lại không nhân đôi hoặc ghi đè trường đã sửa.
- PDF trong repo đúng byte với file HD_001 nguồn.
