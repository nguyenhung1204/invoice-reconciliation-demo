#!/usr/bin/env python3
"""Compare measured manual time with real OCR evaluation timings."""
import argparse
import csv
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manual-seconds", type=float, required=True, help="Measured manual processing time per invoice, in seconds")
    parser.add_argument("--results", type=Path, default=ROOT / "evaluation/results/ocr_results.csv")
    args = parser.parse_args()
    if args.manual_seconds <= 0:
        parser.error("--manual-seconds phải lớn hơn 0")
    if not args.results.is_file():
        print(f"Chưa có dữ liệu OCR: không tìm thấy {args.results}", file=sys.stderr)
        return 2
    with args.results.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    durations = [float(row["processing_seconds"]) for row in rows if row.get("processing_seconds")]
    if not durations:
        print("Chưa có dữ liệu OCR để so sánh.", file=sys.stderr)
        return 2
    automatic = statistics.mean(durations)
    saving = (args.manual_seconds - automatic) / args.manual_seconds * 100
    print(f"Thủ công: {args.manual_seconds:.3f} giây/hóa đơn")
    print(f"Tự động (trung bình {len(durations)} hóa đơn): {automatic:.3f} giây/hóa đơn")
    print(f"Thời gian tiết kiệm: {saving:.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
