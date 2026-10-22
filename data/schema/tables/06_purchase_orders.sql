USE invoice_reconciliation_data;

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
