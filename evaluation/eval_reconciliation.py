#!/usr/bin/env python3
"""Run the backend reconciliation engine against labeled synthetic cases."""
import argparse
import csv
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
sys.path.insert(0, str(ROOT / "backend"))


def object_or_none(data):
    return SimpleNamespace(**data) if data is not None else None


def score(tp, fp, fn):
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    return precision, recall, f1


def run(args):
    from app.services.reconciliation import reconcile

    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    results = []
    warning_codes = set()
    for case in cases:
        predicted = {item["code"] for item in reconcile(
            object_or_none(case["invoice"]), object_or_none(case.get("purchase_order")),
            object_or_none(case.get("goods_receipt")))}
        expected = set(case["expected_codes"])
        warning_codes.update(predicted | expected)
        results.append({"case_id": case["case_id"], "description": case.get("description", ""),
                        "expected_codes": sorted(expected), "predicted_codes": sorted(predicted),
                        "exact_match": expected == predicted})

    counts = {}
    for code in sorted(warning_codes):
        tp = sum(code in row["expected_codes"] and code in row["predicted_codes"] for row in results)
        fp = sum(code not in row["expected_codes"] and code in row["predicted_codes"] for row in results)
        fn = sum(code in row["expected_codes"] and code not in row["predicted_codes"] for row in results)
        precision, recall, f1 = score(tp, fp, fn)
        counts[code] = {"tp": tp, "fp": fp, "fn": fn, "precision": precision, "recall": recall, "f1": f1}
    total_tp = sum(x["tp"] for x in counts.values())
    total_fp = sum(x["fp"] for x in counts.values())
    total_fn = sum(x["fn"] for x in counts.values())
    micro = score(total_tp, total_fp, total_fn)
    macro_f1 = sum(x["f1"] for x in counts.values()) / len(counts) if counts else 0.0

    args.output.mkdir(parents=True, exist_ok=True)
    result_path = args.output / "recon_results.csv"
    with result_path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["case_id", "description", "expected_codes", "predicted_codes", "exact_match"])
        writer.writeheader()
        for row in results:
            writer.writerow({**row, "expected_codes": ";".join(row["expected_codes"]),
                             "predicted_codes": ";".join(row["predicted_codes"])})
    lines = ["# Kết quả đánh giá đối soát", "", "Bộ ca là dữ liệu tổng hợp; chỉ số dưới đây đo độ khớp trên các ca này, không đại diện cho hóa đơn thực tế.", "", f"Số ca: {len(results)}",
             f"Ca khớp chính xác toàn bộ mã: {sum(row['exact_match'] for row in results)}/{len(results)}", "",
             f"Macro F1: {macro_f1:.4f}", f"Micro Precision: {micro[0]:.4f}",
             f"Micro Recall: {micro[1]:.4f}", f"Micro F1: {micro[2]:.4f}", "",
             "| Mã cảnh báo | TP | FP | FN | Precision | Recall | F1 |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    for code, item in counts.items():
        lines.append(f"| {code} | {item['tp']} | {item['fp']} | {item['fn']} | {item['precision']:.4f} | {item['recall']:.4f} | {item['f1']:.4f} |")
    (args.output / "recon_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Đã đánh giá {len(results)} ca; ghi {result_path} và {args.output / 'recon_summary.md'}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=ROOT / "evaluation/recon_cases.json")
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation/results")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
