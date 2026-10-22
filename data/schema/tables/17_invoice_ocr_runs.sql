USE invoice_reconciliation_data;

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
