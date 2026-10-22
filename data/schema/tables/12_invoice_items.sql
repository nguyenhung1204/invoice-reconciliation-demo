USE invoice_reconciliation_data;

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
