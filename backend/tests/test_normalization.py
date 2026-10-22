import unittest

from app.services.normalization import extract_fields, normalize_money, normalize_tax_code, normalize_text


class NormalizationTests(unittest.TestCase):
    def test_money_vietnamese_grouping(self):
        self.assertEqual(normalize_money("1.234.500"), 1234500)

    def test_money_handles_grouping_and_decimal_separator_variants(self):
        self.assertEqual(normalize_money("29,350,000"), 29350000)
        self.assertEqual(normalize_money("26,681,818.18"), 26681818.18)
        self.assertEqual(normalize_money("1.234,50"), 1234.5)

    def test_tax_code_removes_noise(self):
        self.assertEqual(normalize_tax_code("MST: 010.123.4567"), "0101234567")

    def test_text_normalization_keeps_vietnamese(self):
        self.assertEqual(normalize_text("  Công ty   Ánh Dương "), "Công ty Ánh Dương")

    def test_extract_common_invoice_fields(self):
        fields = extract_fields("MST 0101234567 MST 0201234567 Ngày 05/10/2026 Tổng cộng: 1.234.500")
        self.assertEqual(fields["seller_tax_code"], "0101234567")
        self.assertEqual(fields["buyer_tax_code"], "0201234567")
        self.assertEqual(fields["invoice_date"], "2026-10-05")
        self.assertEqual(fields["total_amount"], 1234500)

    def test_extracts_hd003_number_header_date_and_total(self):
        text = """FPT Shop
Ký hiu : 1K23THN
Số: 00446845
Ngày 16 tháng 4 năm 2023
Mã số thuế: 0311609355-001
Tên người mua hàng: đào anh tuấn
Mã số thuế:
iPhone 14 Pro Max 256GB Den; Hạn bảo hành: 15/04/2024
Tồng cng tin thanh toán
1 一
1 1
29,350,000
29,350,000
S tin bng ch : Hai muoi chín triu ba trăm năm mưoi nghìn đồng
Mã nhân hóa đơn: 4427393900446845"""

        fields = extract_fields(text)

        self.assertEqual(fields["invoice_number"], "1K23THN / 00446845")
        self.assertEqual(fields["invoice_date"], "2023-04-16")
        self.assertEqual(fields["total_amount"], 29350000)
        self.assertEqual(fields["seller_tax_code"], "0311609355-001")
        self.assertEqual(fields["buyer_tax_code"], "")

    def test_extracts_hd001_total_after_multiple_summary_amounts(self):
        text = """Ký hiệu (Serial): 1C22THT
S (No.): 506572
Ngày(Date) 09 tháng(month) 10 năm(year) 2022
Cng tin hàng (Total amount):
709.091
70.909
780.000
S tin vit bng ch (Amount in words): By trăm tám mưoi nghìn đng"""

        fields = extract_fields(text)

        self.assertEqual(fields["invoice_number"], "1C22THT / 506572")
        self.assertEqual(fields["invoice_date"], "2022-10-09")
        self.assertEqual(fields["total_amount"], 780000)


if __name__ == "__main__":
    unittest.main()
