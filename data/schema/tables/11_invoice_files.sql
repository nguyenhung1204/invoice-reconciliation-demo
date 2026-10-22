USE invoice_reconciliation_data;

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
