#!/usr/bin/env python3
"""Evaluate real backend OCR against manually labeled invoice fields."""
import argparse
import csv
import math
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
sys.path.insert(0, str(ROOT / "backend"))

FIELDS = ("seller_tax_code", "buyer_tax_code", "invoice_number", "invoice_date", "total_amount", "po_number")


def normalize(field, value):
    value = str(value or "").strip()
    if field in {"seller_tax_code", "buyer_tax_code"}:
        return "".join(ch for ch in value if ch.isdigit())
    if field == "invoice_date":
        from datetime import datetime
        for pattern in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value, pattern).strftime("%d/%m/%Y")
            except ValueError:
                continue
        return value
    if field == "total_amount":
        return "".join(ch for ch in value if ch.isdigit())
    return " ".join(value.split())


def cer(expected, actual):
    previous = list(range(len(actual) + 1))
    for i, left in enumerate(expected, start=1):
        current = [i]
        for j, right in enumerate(actual, start=1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (left != right)))
        previous = current
    return previous[-1] / max(1, len(expected))


def percentile(values, pct):
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * pct
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def run(args):
    truth_path = Path(args.ground_truth)
    invoice_dir = Path(args.invoices)
    with truth_path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    labeled = {row.get("file_name", "").strip(): row for row in rows
               if row.get("file_name", "").strip() and any(str(row.get(field, "")).strip() for field in FIELDS)}
    if not labeled:
        print("Chưa có dữ liệu: ground_truth.csv chưa có nhãn thật.")
        return 0
    from app.services.normalization import extract_fields
    from app.services.ocr import OCRUnavailable, recognize_file

    result_rows = []
    durations = []
    try:
        for filename, expected_row in labeled.items():
            file_path = invoice_dir / filename
            if not file_path.is_file():
                print(f"Thiếu file hóa đơn: {file_path}", file=sys.stderr)
                return 2
            started = time.perf_counter()
            recognized = recognize_file(str(file_path))
            extracted = extract_fields(recognized["text"])
            elapsed = time.perf_counter() - started
            durations.append(elapsed)
            record = {"file_name": filename, "processing_seconds": f"{elapsed:.6f}",
                      "ocr_confidence": recognized.get("confidence")}
            for field in FIELDS:
                record[f"expected_{field}"] = expected_row.get(field, "")
                record[f"predicted_{field}"] = extracted.get(field, "")
                if str(expected_row.get(field, "")).strip():
                    expected_norm = normalize(field, expected_row[field])
                    actual_norm = normalize(field, extracted.get(field, ""))
                    record[f"exact_{field}"] = int(expected_norm == actual_norm)
                    record[f"cer_{field}"] = f"{cer(expected_norm, actual_norm):.6f}"
                else:
                    record[f"exact_{field}"] = ""
                    record[f"cer_{field}"] = ""
            labeled_fields = [field for field in FIELDS if str(expected_row.get(field, "")).strip()]
            record["all_labeled_fields_exact"] = int(all(record[f"exact_{field}"] for field in labeled_fields))
            result_rows.append(record)
    except OCRUnavailable as exc:
        print(f"OCR không khả dụng; không tạo số liệu: {exc}", file=sys.stderr)
        return 3

    args.output.mkdir(parents=True, exist_ok=True)
    detail_path = args.output / "ocr_results.csv"
    columns = ["file_name", "processing_seconds", "ocr_confidence"]
    for field in FIELDS:
        columns.extend((f"expected_{field}", f"predicted_{field}", f"exact_{field}", f"cer_{field}"))
    columns.append("all_labeled_fields_exact")
    with detail_path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=columns)
        writer.writeheader(); writer.writerows(result_rows)

    field_stats = {}
    all_exact, all_cer = [], []
    for field in FIELDS:
        valid = [r for r in result_rows if r[f"exact_{field}"] != ""]
        exact_scores = [int(r[f"exact_{field}"]) for r in valid]
        cer_scores = [float(r[f"cer_{field}"]) for r in valid]
        field_stats[field] = (sum(exact_scores) / len(exact_scores) if valid else None,
                              sum(cer_scores) / len(cer_scores) if valid else None,
                              len(valid))
        all_exact.extend(exact_scores); all_cer.extend(cer_scores)
    exact_docs = sum(r["all_labeled_fields_exact"] for r in result_rows)
    summary_lines = ["# Kết quả đánh giá OCR", "", f"Số hóa đơn có nhãn: {len(result_rows)}", "",
                     "| Trường | Exact match | CER | Số nhãn |", "|---|---:|---:|---:|"]
    for field, (accuracy, error_rate, count) in field_stats.items():
        summary_lines.append(f"| {field} | {accuracy:.4f} | {error_rate:.4f} | {count} |" if count else f"| {field} | Chưa có nhãn | Chưa có nhãn | 0 |")
    summary_lines.extend(["", f"Độ chính xác trung bình theo trường: {sum(all_exact) / len(all_exact):.4f}" if all_exact else "Độ chính xác trung bình: chưa có nhãn",
                          f"CER trung bình theo trường: {sum(all_cer) / len(all_cer):.4f}" if all_cer else "CER trung bình: chưa có nhãn",
                          f"Hóa đơn đúng toàn bộ trường đã gán nhãn: {exact_docs}/{len(result_rows)} ({exact_docs / len(result_rows):.4f})", "",
                          "## Thời gian xử lý mỗi hóa đơn (giây)", "",
                          f"| Trung bình | Trung vị | P95 | Min | Max |", "|---:|---:|---:|---:|---:|",
                          f"| {statistics.mean(durations):.4f} | {statistics.median(durations):.4f} | {percentile(durations, .95):.4f} | {min(durations):.4f} | {max(durations):.4f} |", ""])
    (args.output / "ocr_summary.md").write_text("\n".join(summary_lines), encoding="utf-8")
    print(f"Đã ghi {detail_path} và {args.output / 'ocr_summary.md'}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ground-truth", type=Path, default=ROOT / "evaluation/ground_truth.csv")
    parser.add_argument("--invoices", type=Path, default=ROOT / "evaluation/invoices")
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation/results")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
