USE invoice_reconciliation_data;

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
