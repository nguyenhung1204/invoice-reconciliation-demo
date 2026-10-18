import unittest

from app.services.normalization import extract_fields, normalize_money, normalize_tax_code, normalize_text


class NormalizationTests(unittest.TestCase):
    def test_money_vietnamese_grouping(self):
        self.assertEqual(normalize_money("1.234.500"), 1234500)

    def test_tax_code_removes_noise(self):
        self.assertEqual(normalize_tax_code("MST: 010.123.4567"), "0101234567")

    def test_text_normalization_keeps_vietnamese(self):
        self.assertEqual(normalize_text("  Công ty   Ánh Dương "), "Công ty Ánh Dương")

    def test_extract_common_invoice_fields(self):
        fields = extract_fields("MST 0101234567 MST 0201234567 Ngày 05/10/2026 Tổng cộng: 1.234.500")
        self.assertEqual(fields["seller_tax_code"], "0101234567")
        self.assertEqual(fields["buyer_tax_code"], "0201234567")
        self.assertEqual(fields["invoice_date"], "05/10/2026")
        self.assertEqual(fields["total_amount"], 1234500)


if __name__ == "__main__":
    unittest.main()
