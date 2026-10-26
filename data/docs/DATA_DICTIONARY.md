# Từ điển cơ sở dữ liệu runtime

Schema này được sinh từ SQLAlchemy models và dùng trực tiếp trong database `invoice_reconciliation` của demo.
Mỗi bảng có một file DDL trong `data/schema/tables/`; model runtime là nguồn cấu trúc duy nhất.

## `datasets`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `dataset_code` | `VARCHAR(80)` | không | UNIQUE | — |
| `title` | `VARCHAR(255)` | không | — | — |
| `description` | `TEXT` | có | — | — |
| `source_file` | `VARCHAR(255)` | có | — | — |
| `source_sheet` | `VARCHAR(255)` | có | — | — |
| `created_at` | `DATETIME` | không | — | application default |

## `products`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `sku` | `VARCHAR(80)` | có | UNIQUE | — |
| `product_name` | `VARCHAR(500)` | không | — | — |
| `unit` | `VARCHAR(80)` | có | — | — |
| `active` | `BOOLEAN` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

Ràng buộc: `UNIQUE`: `sku`.

## `schema_migrations`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `revision` | `VARCHAR(100)` | không | PK | — |
| `applied_at` | `DATETIME` | không | — | application default |

## `suppliers`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `tax_code` | `VARCHAR(32)` | không | UNIQUE | — |
| `name` | `VARCHAR(255)` | không | — | — |
| `email` | `VARCHAR(255)` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

## `users`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `email` | `VARCHAR(255)` | không | UNIQUE | — |
| `password_hash` | `VARCHAR(255)` | không | — | — |
| `role` | `VARCHAR(40)` | không | — | application default |
| `active` | `BOOLEAN` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

## `audit_events`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `actor_user_id` | `INTEGER` | có | FK → `users.id` | — |
| `actor_email` | `VARCHAR(255)` | không | — | — |
| `action` | `VARCHAR(80)` | không | — | — |
| `entity_type` | `VARCHAR(80)` | không | — | — |
| `entity_id` | `VARCHAR(80)` | không | — | — |
| `detail` | `TEXT` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

## `purchase_orders`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `po_number` | `VARCHAR(80)` | không | UNIQUE | — |
| `supplier_id` | `INTEGER` | không | FK → `suppliers.id` | — |
| `supplier_tax_code` | `VARCHAR(32)` | không | — | — |
| `total_amount` | `NUMERIC(18, 2)` | không | — | application default |
| `status` | `VARCHAR(32)` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

## `goods_receipts`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `receipt_number` | `VARCHAR(80)` | không | UNIQUE | — |
| `po_id` | `INTEGER` | không | FK → `purchase_orders.id` | — |
| `po_number` | `VARCHAR(80)` | không | — | — |
| `received_at` | `DATETIME` | không | — | application default |

## `invoices`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `original_name` | `VARCHAR(255)` | không | — | — |
| `stored_path` | `VARCHAR(500)` | không | — | — |
| `mime_type` | `VARCHAR(100)` | không | — | application default |
| `sha256` | `VARCHAR(64)` | có | UNIQUE | — |
| `status` | `VARCHAR(32)` | không | — | application default |
| `seller_supplier_id` | `INTEGER` | có | FK → `suppliers.id` | — |
| `po_id` | `INTEGER` | có | FK → `purchase_orders.id` | — |
| `po_reference_text` | `VARCHAR(80)` | không | — | application default |
| `seller_tax_code` | `VARCHAR(32)` | không | — | application default |
| `buyer_tax_code` | `VARCHAR(32)` | không | — | application default |
| `invoice_number` | `VARCHAR(80)` | không | — | application default |
| `invoice_date` | `VARCHAR(32)` | không | — | application default |
| `total_amount` | `NUMERIC(18, 2)` | có | — | — |
| `currency_code` | `VARCHAR(3)` | không | — | application default |
| `subtotal_amount` | `NUMERIC(18, 2)` | có | — | — |
| `tax_amount` | `NUMERIC(18, 2)` | có | — | — |
| `ocr_text` | `TEXT` | không | — | application default |
| `ocr_blocks` | `JSON` | không | — | application default |
| `ocr_confidence` | `FLOAT` | có | — | — |
| `warnings` | `JSON` | không | — | application default |
| `po_number` | `VARCHAR(80)` | không | — | application default |
| `review_note` | `TEXT` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |
| `updated_at` | `DATETIME` | không | — | application default |

## `purchase_order_items`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `po_id` | `INTEGER` | không | FK → `purchase_orders.id` | — |
| `line_number` | `INTEGER` | không | — | — |
| `product_id` | `INTEGER` | có | FK → `products.id` | — |
| `item_description` | `TEXT` | không | — | — |
| `unit` | `VARCHAR(80)` | có | — | — |
| `quantity` | `NUMERIC(18, 4)` | không | — | — |
| `unit_price` | `NUMERIC(18, 2)` | không | — | — |
| `line_total` | `NUMERIC(18, 2)` | có | — | — |

Ràng buộc: `uq_purchase_order_item_line`: `po_id`, `line_number`.

## `dataset_invoices`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `dataset_id` | `INTEGER` | không | FK → `datasets.id` | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `source_record_id` | `VARCHAR(100)` | không | — | — |
| `source_image` | `VARCHAR(255)` | có | — | — |
| `source_workbook` | `VARCHAR(255)` | không | — | — |
| `source_sheet` | `VARCHAR(255)` | không | — | — |
| `source_row` | `INTEGER` | không | — | — |
| `created_at` | `DATETIME` | không | — | application default |

Ràng buộc: `uq_dataset_invoice`: `dataset_id`, `invoice_id`; `uq_dataset_source_record`: `dataset_id`, `source_record_id`.

## `goods_receipt_items`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `gr_id` | `INTEGER` | không | FK → `goods_receipts.id` | — |
| `po_item_id` | `INTEGER` | có | FK → `purchase_order_items.id` | — |
| `line_number` | `INTEGER` | không | — | — |
| `product_id` | `INTEGER` | có | FK → `products.id` | — |
| `item_description` | `TEXT` | không | — | — |
| `unit` | `VARCHAR(80)` | có | — | — |
| `quantity_received` | `NUMERIC(18, 4)` | không | — | — |

Ràng buộc: `uq_goods_receipt_item_line`: `gr_id`, `line_number`.

## `invoice_files`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `invoice_file_id` | `INTEGER` | không | PK | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `original_name` | `VARCHAR(255)` | không | — | — |
| `relative_path` | `VARCHAR(700)` | không | — | — |
| `mime_type` | `VARCHAR(100)` | không | — | — |
| `size_bytes` | `INTEGER` | không | — | — |
| `sha256` | `VARCHAR(64)` | có | UNIQUE | — |
| `is_primary` | `BOOLEAN` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

Ràng buộc: `UNIQUE`: `sha256`.

## `invoice_items`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `line_number` | `INTEGER` | không | — | — |
| `product_id` | `INTEGER` | có | FK → `products.id` | — |
| `item_description` | `TEXT` | không | — | — |
| `unit` | `VARCHAR(80)` | có | — | — |
| `quantity` | `NUMERIC(18, 4)` | có | — | — |
| `unit_price` | `NUMERIC(18, 2)` | có | — | — |
| `tax_rate` | `NUMERIC(7, 4)` | có | — | — |
| `line_total` | `NUMERIC(18, 2)` | có | — | — |
| `data_source` | `VARCHAR(32)` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

Ràng buộc: `uq_invoice_item_line`: `invoice_id`, `line_number`.

## `invoice_ocr_runs`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `ocr_run_id` | `INTEGER` | không | PK | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `engine` | `VARCHAR(80)` | không | — | — |
| `model_name` | `VARCHAR(160)` | có | — | — |
| `model_version` | `VARCHAR(100)` | có | — | — |
| `status` | `VARCHAR(32)` | không | — | — |
| `started_at` | `DATETIME` | có | — | — |
| `finished_at` | `DATETIME` | có | — | — |
| `duration_seconds` | `NUMERIC(12, 4)` | có | — | — |
| `config_json` | `JSON` | có | — | — |

## `invoice_reviews`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `review_id` | `INTEGER` | không | PK | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `reviewer_user_id` | `INTEGER` | có | FK → `users.id` | — |
| `revision_number` | `INTEGER` | không | — | — |
| `status` | `VARCHAR(32)` | không | — | — |
| `reviewed_at` | `DATETIME` | có | — | — |
| `review_note` | `TEXT` | không | — | application default |
| `snapshot_json` | `JSON` | không | — | application default |
| `content_hash` | `VARCHAR(64)` | có | — | — |
| `invalidated_at` | `DATETIME` | có | — | — |

Ràng buộc: `uq_invoice_review_revision`: `invoice_id`, `revision_number`.

## `dataset_invoice_item_labels`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `dataset_invoice_id` | `INTEGER` | không | FK → `dataset_invoices.id` | — |
| `line_number` | `INTEGER` | không | — | — |
| `item_description` | `TEXT` | không | — | — |
| `unit` | `VARCHAR(80)` | có | — | — |
| `quantity` | `NUMERIC(18, 4)` | có | — | — |
| `unit_price` | `NUMERIC(18, 2)` | có | — | — |
| `annotation_status` | `VARCHAR(32)` | không | — | application default |
| `source_column` | `VARCHAR(255)` | không | — | — |
| `created_at` | `DATETIME` | không | — | application default |

Ràng buộc: `uq_dataset_invoice_item_label`: `dataset_invoice_id`, `line_number`.

## `invoice_ground_truth_fields`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `dataset_invoice_id` | `INTEGER` | không | FK → `dataset_invoices.id` | — |
| `field_key` | `VARCHAR(80)` | không | — | — |
| `raw_value` | `TEXT` | không | — | — |
| `normalized_value` | `TEXT` | có | — | — |
| `source_column` | `VARCHAR(255)` | không | — | — |
| `annotation_status` | `VARCHAR(32)` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

Ràng buộc: `uq_invoice_ground_truth_field`: `dataset_invoice_id`, `field_key`.

## `invoice_ocr_fields`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `ocr_field_id` | `INTEGER` | không | PK | — |
| `ocr_run_id` | `INTEGER` | không | FK → `invoice_ocr_runs.ocr_run_id` | — |
| `field_key` | `VARCHAR(80)` | không | — | — |
| `value_text` | `TEXT` | có | — | — |
| `normalized_value` | `TEXT` | có | — | — |
| `confidence` | `NUMERIC(7, 6)` | có | — | — |
| `page_number` | `INTEGER` | có | — | — |
| `bbox_json` | `JSON` | có | — | — |
| `warning` | `TEXT` | có | — | — |

## `reconciliation_runs`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `reconciliation_run_id` | `INTEGER` | không | PK | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `review_id` | `INTEGER` | có | FK → `invoice_reviews.review_id` | — |
| `po_id` | `INTEGER` | có | FK → `purchase_orders.id` | — |
| `gr_id` | `INTEGER` | có | FK → `goods_receipts.id` | — |
| `status` | `VARCHAR(32)` | không | — | — |
| `result_json` | `JSON` | không | — | application default |
| `amount_tolerance` | `NUMERIC(18, 2)` | không | — | application default |
| `started_at` | `DATETIME` | có | — | — |
| `finished_at` | `DATETIME` | có | — | — |
| `run_by_user_id` | `INTEGER` | có | FK → `users.id` | — |

## `invoice_approvals`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `approval_id` | `INTEGER` | không | PK | — |
| `invoice_id` | `INTEGER` | không | FK → `invoices.id` | — |
| `review_id` | `INTEGER` | không | FK → `invoice_reviews.review_id` | — |
| `reconciliation_run_id` | `INTEGER` | không | FK → `reconciliation_runs.reconciliation_run_id` | — |
| `approver_user_id` | `INTEGER` | có | FK → `users.id` | — |
| `status` | `VARCHAR(32)` | không | — | — |
| `approved_amount` | `NUMERIC(18, 2)` | không | — | — |
| `currency_code` | `VARCHAR(3)` | không | — | application default |
| `snapshot_json` | `JSON` | không | — | application default |
| `content_hash` | `VARCHAR(64)` | không | — | — |
| `decided_at` | `DATETIME` | không | — | application default |

## `reconciliation_line_allocations`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `allocation_id` | `INTEGER` | không | PK | — |
| `reconciliation_run_id` | `INTEGER` | không | FK → `reconciliation_runs.reconciliation_run_id` | — |
| `invoice_item_id` | `INTEGER` | có | FK → `invoice_items.id` | — |
| `po_item_id` | `INTEGER` | có | FK → `purchase_order_items.id` | — |
| `gr_item_id` | `INTEGER` | có | FK → `goods_receipt_items.id` | — |
| `allocated_quantity` | `NUMERIC(18, 4)` | có | — | — |
| `allocated_amount` | `NUMERIC(18, 2)` | có | — | — |
| `invoice_snapshot_json` | `JSON` | không | — | application default |
| `po_snapshot_json` | `JSON` | không | — | application default |
| `gr_snapshot_json` | `JSON` | không | — | application default |

## `reconciliation_run_goods_receipts`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `id` | `INTEGER` | không | PK | — |
| `reconciliation_run_id` | `INTEGER` | không | FK → `reconciliation_runs.reconciliation_run_id` | — |
| `gr_id` | `INTEGER` | không | FK → `goods_receipts.id` | — |

Ràng buộc: `uq_reconciliation_run_gr`: `reconciliation_run_id`, `gr_id`.

## `invoice_payments`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `payment_id` | `INTEGER` | không | PK | — |
| `approval_id` | `INTEGER` | không | FK → `invoice_approvals.approval_id` | — |
| `recorded_by_user_id` | `INTEGER` | có | FK → `users.id` | — |
| `amount` | `NUMERIC(18, 2)` | không | — | — |
| `currency_code` | `VARCHAR(3)` | không | — | application default |
| `paid_at` | `DATETIME` | không | — | — |
| `method` | `VARCHAR(40)` | có | — | — |
| `reference` | `VARCHAR(160)` | có | — | — |
| `note` | `TEXT` | không | — | application default |
| `created_at` | `DATETIME` | không | — | application default |

## `reconciliation_findings`

| Cột | Kiểu | Null | Khóa | Mặc định |
|---|---|---:|---|---|
| `finding_id` | `INTEGER` | không | PK | — |
| `reconciliation_run_id` | `INTEGER` | không | FK → `reconciliation_runs.reconciliation_run_id` | — |
| `allocation_id` | `INTEGER` | có | FK → `reconciliation_line_allocations.allocation_id` | — |
| `finding_type` | `VARCHAR(80)` | không | — | — |
| `severity` | `VARCHAR(24)` | không | — | — |
| `expected_value` | `NUMERIC(18, 4)` | có | — | — |
| `actual_value` | `NUMERIC(18, 4)` | có | — | — |
| `difference_value` | `NUMERIC(18, 4)` | có | — | — |
| `details` | `TEXT` | không | — | application default |
