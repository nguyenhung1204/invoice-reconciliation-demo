USE invoice_reconciliation_data;

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
