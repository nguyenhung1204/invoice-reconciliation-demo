USE invoice_reconciliation_data;

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
