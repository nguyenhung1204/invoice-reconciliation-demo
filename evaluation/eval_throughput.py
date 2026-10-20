#!/usr/bin/env python3
"""Measure concurrent uploads to a running AutoInvoice API."""
import argparse
import csv
import hashlib
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def run(args):
    files = sorted(path for path in args.invoices.iterdir() if path.is_file()) if args.invoices.is_dir() else []
    unique = {}
    for path in files:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        unique.setdefault(digest, path)
    selected = list(unique.values())[:args.n]
    if len(selected) < args.n:
        print(f"Cần {args.n} file hóa đơn có nội dung SHA-256 khác nhau; hiện có {len(selected)}. Không gửi dữ liệu.", file=sys.stderr)
        return 2
    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}

    def upload(path):
        started = time.perf_counter()
        try:
            with httpx.Client(timeout=args.timeout) as client, path.open("rb") as source:
                response = client.post(f"{args.base_url.rstrip('/')}/api/invoices/upload", headers=headers,
                                       files={"file": (path.name, source, "application/pdf" if path.suffix.lower() == ".pdf" else "image/jpeg")})
                return {"file_name": path.name, "http_status": response.status_code,
                        "success": response.is_success, "seconds": time.perf_counter() - started,
                        "error": "" if response.is_success else response.text[:500]}
        except Exception as exc:
            return {"file_name": path.name, "http_status": "ERROR", "success": False,
                    "seconds": time.perf_counter() - started, "error": str(exc)}

    started = time.perf_counter()
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(upload, path) for path in selected]
        for future in as_completed(futures):
            results.append(future.result())
    elapsed = time.perf_counter() - started
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["file_name", "http_status", "success", "seconds", "error"])
        writer.writeheader(); writer.writerows(sorted(results, key=lambda row: row["file_name"]))
    errors = sum(not row["success"] for row in results)
    print(f"Gửi {len(results)} hóa đơn trong {elapsed:.3f} giây; throughput={len(results) / elapsed * 60:.2f} hóa đơn/phút; lỗi={errors}")
    print("Mã HTTP: " + ", ".join(f"{code}={sum(str(row['http_status']) == code for row in results)}" for code in sorted({str(row['http_status']) for row in results})))
    print(f"Chi tiết: {args.output}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--token", default="", help="JWT access token; may be omitted to measure expected auth failures")
    parser.add_argument("--n", type=int, default=20)
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=300)
    parser.add_argument("--invoices", type=Path, default=ROOT / "evaluation/invoices")
    parser.add_argument("--output", type=Path, default=ROOT / "evaluation/results/throughput_results.csv")
    args = parser.parse_args()
    if args.n < 1 or args.workers < 1:
        parser.error("--n và --workers phải lớn hơn 0")
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
