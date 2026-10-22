USE invoice_reconciliation_data;

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
