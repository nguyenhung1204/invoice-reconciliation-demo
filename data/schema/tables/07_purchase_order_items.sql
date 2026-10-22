USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  po_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  po_id BIGINT UNSIGNED NOT NULL,
  line_number INT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  item_description TEXT NOT NULL,
  unit VARCHAR(80) NULL,
  quantity DECIMAL(18,4) NOT NULL,
  unit_price DECIMAL(18,2) NOT NULL,
  line_total DECIMAL(18,2) NULL,
  PRIMARY KEY (po_item_id),
  UNIQUE KEY uq_po_items_line (po_id, line_number),
  CONSTRAINT fk_po_items_order FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
  CONSTRAINT fk_po_items_product FOREIGN KEY (product_id) REFERENCES products (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
