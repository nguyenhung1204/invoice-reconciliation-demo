import re
import unicodedata
from datetime import date


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value or "")
    return re.sub(r"\s+", " ", value).strip()


def _fold_accents(value: str) -> str:
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return value.replace("đ", "d").replace("Đ", "D")


def normalize_tax_code(value: str) -> str:
    return re.sub(r"[^0-9-]", "", value or "")


def normalize_money(value: str) -> float | None:
    """Parse common Vietnamese and international invoice number formats."""
    token = re.sub(r"[^0-9,.-]", "", value or "")
    if not token or token in {"-", ".", ","}:
        return None

    negative = token.startswith("-")
    token = token.lstrip("-")
    separators = [index for index, char in enumerate(token) if char in ",."]
    if separators:
        last = separators[-1]
        trailing = len(token) - last - 1
        if trailing in (1, 2):
            # The last separator is a decimal point (e.g. 1.234,50 or 1,234.50).
            integer_part = re.sub(r"[,.]", "", token[:last])
            decimal_part = re.sub(r"[,.]", "", token[last + 1 :])
            token = f"{integer_part}.{decimal_part}"
        else:
            # Three trailing digits indicate a thousands separator (e.g. 29,350,000).
            token = re.sub(r"[,.]", "", token)
    try:
        amount = float(token)
        return -amount if negative else amount
    except ValueError:
        return None


def _extract_invoice_number(header: str) -> str:
    folded = _fold_accents(header)
    number_match = re.search(
        r"\b(?:so|s)\s*(?:\(\s*no\.?\s*\)\s*)?\.?\s*[:：]\s*(?:\n\s*)?([A-Z0-9][A-Z0-9/-]*)",
        folded,
        re.IGNORECASE,
    )
    number = number_match.group(1).upper() if number_match else ""
    if number in {"TAI", "NHA", "SERI"}:
        number = ""
    if "/" in number:
        parts = [p.strip() for p in number.split("/") if p.strip()]
        if parts:
            number = parts[-1]
    return number


def _extract_invoice_date(header: str) -> str:
    folded = _fold_accents(header)
    # Prefer the invoice's explicitly labelled issue date. Never use an arbitrary
    # date elsewhere on the page, since product warranty dates are common.
    vietnamese_date = re.search(
        r"\bngay\s*(?:\(date\))?\s*:?[ \t]*(\d{1,2})\s*thang"
        r"(?:\s*\(month\))?\s*:?[ \t]*(\d{1,2})\s*nam"
        r"(?:\s*\(year\))?\s*:?[ \t]*(\d{4})\b",
        folded,
        re.IGNORECASE,
    )
    if vietnamese_date:
        day, month, year = map(int, vietnamese_date.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return ""

    numeric_date = re.search(
        r"\bngay(?:\s*\(date\))?\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b",
        folded,
        re.IGNORECASE,
    )
    if numeric_date:
        day, month, year = map(int, numeric_date.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            return ""
    return ""


def _extract_total_amount(text: str) -> float | None:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    folded_lines = [_fold_accents(line) for line in lines]
    # Match payment totals first, then bilingual/shorter total labels. OCR often
    # drops accents or a few letters, so the Vietnamese labels allow small gaps.
    label_patterns = (
        r"tong.{0,18}ti.{0,2}n\s+thanh\s+toan",
        r"ti.{0,2}n\s+thanh\s+toan",
        r"tong\s+cong\s+tien\s+hang\s*\(\s*total\s+amount\s*\)",
        r"c.{0,2}ng\s+ti.{0,2}n\s+hang\s*\(\s*total\s+amount\s*\)",
        r"total\s+amount",
        r"tong\s+c.{0,2}ng",
    )
    matches = []
    for priority, pattern in enumerate(label_patterns):
        for line_index, line in enumerate(folded_lines):
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                matches.append((priority, line_index, match.end()))
    if not matches:
        return None

    _, line_index, label_end = min(matches, key=lambda found: (found[0], found[1]))
    candidate_lines = [folded_lines[line_index][label_end:]]
    # Some OCR engines separate the label from the amount. Look only a few lines
    # ahead so unrelated identifiers later in the invoice cannot become totals.
    candidate_lines.extend(folded_lines[line_index + 1 : line_index + 6])
    amounts = []
    for candidate in candidate_lines:
        if re.search(r"\b(?:s.{0,3}ti.{0,2}n.{0,8}b.{0,2}ng.{0,2}ch|amount\s+in\s+words)\b", candidate):
            break
        amounts.extend(re.findall(r"(?<![A-Z0-9])\d[\d.,]*(?![A-Z0-9])", candidate, re.IGNORECASE))
    for token in reversed(amounts):
        amount = normalize_money(token)
        if amount is not None:
            return amount
    return None




def _extract_invoice_series(header: str) -> str:
    folded = _fold_accents(header)
    serial_match = re.search(
        r"\bky\s+hi.{0,2}u(?:\s*\(serial\))?\s*[:?]\s*([A-Z0-9][A-Z0-9/-]*)",
        folded,
        re.IGNORECASE,
    )
    if serial_match:
        return serial_match.group(1).upper()
    model_match = re.search(
        r"\bm.{0,2}u\s+s.{0,2}\s*[:?]\s*([A-Z0-9][A-Z0-9/-]*)",
        folded,
        re.IGNORECASE,
    )
    return model_match.group(1).upper() if model_match else ""


def _extract_seller_name(text: str) -> str:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for idx, line in enumerate(lines[:25]):
        folded = _fold_accents(line).lower()
        if any(skip in folded for skip in ("nguoi mua", "khach hang", "ten don vi", "company", "ky boi")):
            continue
        m = re.search(r"don\s*v.?\s*ban\s*hang(?:\s*\(seller\))?\s*[:?]\s*(.+)", folded, re.IGNORECASE)
        if m:
            colon_idx = line.find(":")
            val = line[colon_idx + 1 :].strip() if colon_idx != -1 else line[m.start(1) :].strip()
            if idx + 1 < len(lines[:25]):
                next_line = lines[idx + 1].strip()
                next_folded = _fold_accents(next_line).lower()
                if not any(lbl in next_folded for lbl in ("dia chi", "da chi", "ma so", "ma s", "dien thoai", "din thoi", "tai khoan", "ten khach", "ten don", "ho ten", "hoa don", "gia tri")):
                    if len(next_line) < 45:
                        val = f"{val} {next_line}".strip()
            return val
    for line in lines[:18]:
        folded = _fold_accents(line).lower()
        if any(skip in folded for skip in ("nguoi mua", "khach hang", "ten don vi", "company", "ky boi", "phan mem", "m-invoice", "einvoice")):
            continue
        if "cong ty" in folded or "chi nhanh" in folded:
            return re.sub(r"^.*?[:?]\s*", "", line).strip()
    return ""


def _extract_subtotal_and_vat(text: str) -> tuple[float | None, float | None]:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    folded_lines = [_fold_accents(line).lower() for line in lines]
    subtotal = None
    vat = None
    for idx, fline in enumerate(folded_lines):
        if subtotal is None and any(p in fline for p in ("cong tien hang", "cng tin hang", "tien hang hoa", "tin hang hoa")):
            for cand in folded_lines[idx : idx + 6]:
                for tok in reversed(re.findall(r"(?<![A-Z0-9])\d[\d.,]*(?![A-Z0-9])", cand, re.IGNORECASE)):
                    val = normalize_money(tok)
                    if val is not None and val > 100:
                        subtotal = val
                        break
                if subtotal is not None:
                    break
        if vat is None and any(p in fline for p in ("tien thue", "tin thu")) and "thue suat" not in fline and "thu sut" not in fline:
            for cand in folded_lines[idx : idx + 6]:
                for tok in reversed(re.findall(r"(?<![A-Z0-9])\d[\d.,]*(?![A-Z0-9])", cand, re.IGNORECASE)):
                    val = normalize_money(tok)
                    if val is not None and val > 100:
                        vat = val
                        break
                if vat is not None:
                    break
    return subtotal, vat


def extract_fields(text: str) -> dict:
    normalized = normalize_text(text)
    header = normalized[:1800]
    tax_codes = re.findall(r"(?<!\d)(\d{10}(?:-\d{3})?)(?!\d)", normalized)
    subtotal_amount, tax_amount = _extract_subtotal_and_vat(text)
    return {
        "seller_tax_code": normalize_tax_code(tax_codes[0]) if tax_codes else "",
        "seller_name": _extract_seller_name(text),
        "invoice_series": _extract_invoice_series(header),
        "buyer_tax_code": normalize_tax_code(tax_codes[1]) if len(tax_codes) > 1 else "",
        "invoice_number": _extract_invoice_number(header),
        "invoice_date": _extract_invoice_date(header),
        "subtotal_amount": subtotal_amount,
        "tax_amount": tax_amount,
        "total_amount": _extract_total_amount(text),
        "items": [],
    }
