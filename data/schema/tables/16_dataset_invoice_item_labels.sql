USE invoice_reconciliation_data;

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
