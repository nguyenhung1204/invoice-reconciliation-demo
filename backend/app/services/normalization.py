import re
import unicodedata


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value or "")
    return re.sub(r"\s+", " ", value).strip()


def normalize_tax_code(value: str) -> str:
    return re.sub(r"[^0-9-]", "", value or "")


def normalize_money(value: str) -> float | None:
    digits = re.sub(r"[^0-9,.-]", "", value or "").replace(".", "").replace(",", ".")
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def extract_fields(text: str) -> dict:
    normalized = normalize_text(text)
    tax_codes = re.findall(r"(?<!\d)(\d{10}(?:-\d{3})?)(?!\d)", normalized)
    date_match = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", normalized)
    amount_matches = re.findall(r"(?:Tổng thanh toán|Tổng cộng|Total amount)[^\d]{0,24}([\d.,]+)", normalized, re.I)
    amount = normalize_money(amount_matches[-1]) if amount_matches else None
    return {
        "seller_tax_code": normalize_tax_code(tax_codes[0]) if tax_codes else "",
        "buyer_tax_code": normalize_tax_code(tax_codes[1]) if len(tax_codes) > 1 else "",
        "invoice_date": date_match.group(1) if date_match else "",
        "total_amount": amount,
        "items": [],
    }
