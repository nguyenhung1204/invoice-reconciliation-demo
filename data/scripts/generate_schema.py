#!/usr/bin/env python3
"""Write one MySQL DDL file per normalized table."""

from pathlib import Path


DATA = Path(__file__).resolve().parents[1]
SCHEMA = DATA / "schema" / "tables"

TABLES = [
    ("01_organizations.sql", """
CREATE TABLE IF NOT EXISTS organizations (
  organization_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tax_code VARCHAR(32) NOT NULL,
  legal_name VARCHAR(255) NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'VN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id),
  UNIQUE KEY uq_organizations_tax_code (tax_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("02_supplier_profiles.sql", """
CREATE TABLE IF NOT EXISTS supplier_profiles (
  supplier_id BIGINT UNSIGNED NOT NULL,
  supplier_code VARCHAR(40) NOT NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (supplier_id),
  UNIQUE KEY uq_supplier_profiles_code (supplier_code),
  CONSTRAINT fk_supplier_profiles_organization FOREIGN KEY (supplier_id)
    REFERENCES organizations (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("03_customer_profiles.sql", """
CREATE TABLE IF NOT EXISTS customer_profiles (
  customer_id BIGINT UNSIGNED NOT NULL,
  customer_code VARCHAR(40) NOT NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (customer_id),
  UNIQUE KEY uq_customer_profiles_code (customer_code),
  CONSTRAINT fk_customer_profiles_organization FOREIGN KEY (customer_id)
    REFERENCES organizations (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("04_users.sql", """
CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("05_products.sql", """
CREATE TABLE IF NOT EXISTS products (
  product_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(80) NULL,
  product_name VARCHAR(500) NOT NULL,
  unit VARCHAR(80) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  UNIQUE KEY uq_products_sku (sku),
  KEY ix_products_name (product_name(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("06_purchase_orders.sql", """
CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_number VARCHAR(80) NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  ordered_at DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  currency_code CHAR(3) NOT NULL DEFAULT 'VND',
  subtotal_amount DECIMAL(18,2) NULL,
  tax_amount DECIMAL(18,2) NULL,
  total_amount DECIMAL(18,2) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (po_id),
  UNIQUE KEY uq_purchase_orders_number (po_number),
  KEY ix_purchase_orders_supplier (supplier_id),
  CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY (supplier_id)
    REFERENCES supplier_profiles (supplier_id),
  CONSTRAINT fk_purchase_orders_creator FOREIGN KEY (created_by_user_id)
    REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("07_purchase_order_items.sql", """
CREATE TABLE IF NOT EXISTS purchase_order_items (
  po_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_id BIGINT UNSIGNED NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  item_description TEXT NOT NULL,
  unit VARCHAR(80) NULL,
  quantity DECIMAL(18,4) NOT NULL,
  unit_price DECIMAL(18,2) NOT NULL,
  line_total DECIMAL(18,2) NULL,
  PRIMARY KEY (po_item_id),
  UNIQUE KEY uq_po_items_line (po_id, line_number),
  CONSTRAINT fk_po_items_order FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
  CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES products (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("08_goods_receipts.sql", """
CREATE TABLE IF NOT EXISTS goods_receipts (
  gr_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  gr_number VARCHAR(80) NOT NULL,
  po_id BIGINT UNSIGNED NULL,
  received_at DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  received_by_user_id BIGINT UNSIGNED NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (gr_id),
  UNIQUE KEY uq_goods_receipts_number (gr_number),
  KEY ix_goods_receipts_po (po_id),
  CONSTRAINT fk_goods_receipts_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
  CONSTRAINT fk_goods_receipts_receiver FOREIGN KEY (received_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("09_goods_receipt_items.sql", """
CREATE TABLE IF NOT EXISTS goods_receipt_items (
  gr_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  gr_id BIGINT UNSIGNED NOT NULL,
  po_item_id BIGINT UNSIGNED NULL,
  line_number INT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  item_description TEXT NOT NULL,
  unit VARCHAR(80) NULL,
  quantity_received DECIMAL(18,4) NOT NULL,
  PRIMARY KEY (gr_item_id),
  UNIQUE KEY uq_gr_items_line (gr_id, line_number),
  CONSTRAINT fk_gr_items_receipt FOREIGN KEY (gr_id) REFERENCES goods_receipts (gr_id),
  CONSTRAINT fk_gr_items_po_item FOREIGN KEY (po_item_id) REFERENCES purchase_order_items (po_item_id),
  CONSTRAINT fk_gr_items_product FOREIGN KEY (product_id) REFERENCES products (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("10_invoices.sql", """
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference_code VARCHAR(80) NOT NULL,
  invoice_number VARCHAR(80) NULL,
  invoice_series VARCHAR(80) NULL,
  seller_org_id BIGINT UNSIGNED NULL,
  buyer_org_id BIGINT UNSIGNED NULL,
  po_id BIGINT UNSIGNED NULL,
  invoice_date DATE NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'VND',
  subtotal_amount DECIMAL(18,2) NULL,
  tax_amount DECIMAL(18,2) NULL,
  total_amount DECIMAL(18,2) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_id),
  UNIQUE KEY uq_invoices_reference_code (reference_code),
  KEY ix_invoices_seller (seller_org_id),
  KEY ix_invoices_buyer (buyer_org_id),
  KEY ix_invoices_po (po_id),
  CONSTRAINT fk_invoices_seller FOREIGN KEY (seller_org_id) REFERENCES organizations (organization_id),
  CONSTRAINT fk_invoices_buyer FOREIGN KEY (buyer_org_id) REFERENCES organizations (organization_id),
  CONSTRAINT fk_invoices_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("11_invoice_files.sql", """
CREATE TABLE IF NOT EXISTS invoice_files (
  invoice_file_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(700) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_file_id),
  UNIQUE KEY uq_invoice_files_sha256 (sha256),
  KEY ix_invoice_files_invoice (invoice_id),
  CONSTRAINT fk_invoice_files_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("12_invoice_items.sql", """
CREATE TABLE IF NOT EXISTS invoice_items (
  invoice_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  item_description TEXT NOT NULL,
  unit VARCHAR(80) NULL,
  quantity DECIMAL(18,4) NULL,
  unit_price DECIMAL(18,2) NULL,
  tax_rate DECIMAL(7,4) NULL,
  line_total DECIMAL(18,2) NULL,
  data_source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_item_id),
  UNIQUE KEY uq_invoice_items_line (invoice_id, line_number),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id),
  CONSTRAINT fk_invoice_items_product FOREIGN KEY (product_id) REFERENCES products (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("13_datasets.sql", """
CREATE TABLE IF NOT EXISTS datasets (
  dataset_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_code VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  source_file VARCHAR(255) NULL,
  source_sheet VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset_id),
  UNIQUE KEY uq_datasets_code (dataset_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("14_dataset_invoices.sql", """
CREATE TABLE IF NOT EXISTS dataset_invoices (
  dataset_invoice_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  source_record_id VARCHAR(100) NOT NULL,
  source_image VARCHAR(255) NULL,
  source_workbook VARCHAR(255) NOT NULL,
  source_sheet VARCHAR(255) NOT NULL,
  source_row INT UNSIGNED NOT NULL,
  PRIMARY KEY (dataset_invoice_id),
  UNIQUE KEY uq_dataset_invoice (dataset_id, invoice_id),
  UNIQUE KEY uq_dataset_source_record (dataset_id, source_record_id),
  CONSTRAINT fk_dataset_invoices_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (dataset_id),
  CONSTRAINT fk_dataset_invoices_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("15_invoice_ground_truth_fields.sql", """
CREATE TABLE IF NOT EXISTS invoice_ground_truth_fields (
  ground_truth_field_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_invoice_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(80) NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NULL,
  source_column VARCHAR(255) NOT NULL,
  annotation_status VARCHAR(32) NOT NULL DEFAULT 'labeled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ground_truth_field_id),
  UNIQUE KEY uq_ground_truth_field (dataset_invoice_id, field_key),
  CONSTRAINT fk_ground_truth_dataset_invoice FOREIGN KEY (dataset_invoice_id)
    REFERENCES dataset_invoices (dataset_invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("16_dataset_invoice_item_labels.sql", """
CREATE TABLE IF NOT EXISTS dataset_invoice_item_labels (
  item_label_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset_invoice_id BIGINT UNSIGNED NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  item_description TEXT NOT NULL,
  unit VARCHAR(80) NULL,
  quantity DECIMAL(18,4) NULL,
  unit_price DECIMAL(18,2) NULL,
  annotation_status VARCHAR(32) NOT NULL DEFAULT 'description_only',
  source_column VARCHAR(255) NOT NULL,
  PRIMARY KEY (item_label_id),
  UNIQUE KEY uq_dataset_item_label_line (dataset_invoice_id, line_number),
  CONSTRAINT fk_dataset_item_labels_invoice FOREIGN KEY (dataset_invoice_id)
    REFERENCES dataset_invoices (dataset_invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("17_invoice_ocr_runs.sql", """
CREATE TABLE IF NOT EXISTS invoice_ocr_runs (
  ocr_run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  engine VARCHAR(80) NOT NULL,
  model_name VARCHAR(160) NULL,
  model_version VARCHAR(100) NULL,
  status VARCHAR(32) NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  duration_seconds DECIMAL(12,4) NULL,
  config_json JSON NULL,
  PRIMARY KEY (ocr_run_id),
  KEY ix_ocr_runs_invoice (invoice_id),
  CONSTRAINT fk_ocr_runs_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("18_invoice_ocr_fields.sql", """
CREATE TABLE IF NOT EXISTS invoice_ocr_fields (
  ocr_field_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ocr_run_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(80) NOT NULL,
  value_text TEXT NULL,
  normalized_value TEXT NULL,
  confidence DECIMAL(7,6) NULL,
  page_number INT UNSIGNED NULL,
  bbox_json JSON NULL,
  warning TEXT NULL,
  PRIMARY KEY (ocr_field_id),
  KEY ix_ocr_fields_run_field (ocr_run_id, field_key),
  CONSTRAINT fk_ocr_fields_run FOREIGN KEY (ocr_run_id) REFERENCES invoice_ocr_runs (ocr_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("19_invoice_reviews.sql", """
CREATE TABLE IF NOT EXISTS invoice_reviews (
  review_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  reviewer_user_id BIGINT UNSIGNED NULL,
  revision_number INT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  reviewed_at DATETIME NULL,
  review_note TEXT NULL,
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_invoice_review_revision (invoice_id, revision_number),
  CONSTRAINT fk_invoice_reviews_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id),
  CONSTRAINT fk_invoice_reviews_user FOREIGN KEY (reviewer_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("20_reconciliation_runs.sql", """
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  reconciliation_run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  po_id BIGINT UNSIGNED NULL,
  gr_id BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL,
  amount_tolerance DECIMAL(18,2) NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  run_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (reconciliation_run_id),
  KEY ix_reconciliation_runs_invoice (invoice_id),
  CONSTRAINT fk_reconciliation_runs_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id),
  CONSTRAINT fk_reconciliation_runs_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
  CONSTRAINT fk_reconciliation_runs_gr FOREIGN KEY (gr_id) REFERENCES goods_receipts (gr_id),
  CONSTRAINT fk_reconciliation_runs_user FOREIGN KEY (run_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("21_reconciliation_findings.sql", """
CREATE TABLE IF NOT EXISTS reconciliation_findings (
  finding_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_run_id BIGINT UNSIGNED NOT NULL,
  finding_type VARCHAR(80) NOT NULL,
  severity VARCHAR(24) NOT NULL,
  invoice_item_id BIGINT UNSIGNED NULL,
  po_item_id BIGINT UNSIGNED NULL,
  gr_item_id BIGINT UNSIGNED NULL,
  expected_value DECIMAL(18,4) NULL,
  actual_value DECIMAL(18,4) NULL,
  difference_value DECIMAL(18,4) NULL,
  details TEXT NULL,
  PRIMARY KEY (finding_id),
  KEY ix_reconciliation_findings_run (reconciliation_run_id),
  CONSTRAINT fk_reconciliation_findings_run FOREIGN KEY (reconciliation_run_id)
    REFERENCES reconciliation_runs (reconciliation_run_id),
  CONSTRAINT fk_reconciliation_findings_invoice_item FOREIGN KEY (invoice_item_id)
    REFERENCES invoice_items (invoice_item_id),
  CONSTRAINT fk_reconciliation_findings_po_item FOREIGN KEY (po_item_id)
    REFERENCES purchase_order_items (po_item_id),
  CONSTRAINT fk_reconciliation_findings_gr_item FOREIGN KEY (gr_item_id)
    REFERENCES goods_receipt_items (gr_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
    ("22_audit_events.sql", """
CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_email_snapshot VARCHAR(255) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_event_id),
  KEY ix_audit_events_entity (entity_type, entity_id),
  KEY ix_audit_events_created_at (created_at),
  CONSTRAINT fk_audit_events_user FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""),
]


def main() -> None:
    SCHEMA.mkdir(parents=True, exist_ok=True)
    database_sql = """CREATE DATABASE IF NOT EXISTS invoice_reconciliation_data
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE invoice_reconciliation_data;
"""
    (SCHEMA / "00_create_database.sql").write_text(database_sql, encoding="utf-8")
    for filename, ddl in TABLES:
        content = "USE invoice_reconciliation_data;\n\n" + ddl.strip() + "\n"
        (SCHEMA / filename).write_text(content, encoding="utf-8")
    print(f"Created {len(TABLES)} table DDL files in {SCHEMA}")


if __name__ == "__main__":
    main()
