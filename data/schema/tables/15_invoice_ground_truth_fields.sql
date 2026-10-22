USE invoice_reconciliation_data;

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
