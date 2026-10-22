USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  gr_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  gr_id BIGINT UNSIGNED NOT NULL,
  po_item_id BIGINT UNSIGNED NULL,
  line_number INT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  item_description TEXT NOT NULL,
  unit VARCHAR(80) NULL,
  quantity_received DECIMAL(18,4) NOT NULL,
  PRIMARY KEY (gr_item_id),
  UNIQUE KEY uq_gr_items_line (gr_id, line_number),
  CONSTRAINT fk_gr_items_receipt FOREIGN KEY (gr_id) REFERENCES goods_receipts (gr_id),
  CONSTRAINT fk_gr_items_po_item FOREIGN KEY (po_item_id) REFERENCES purchase_order_items (po_item_id),
  CONSTRAINT fk_gr_items_product FOREIGN KEY (product_id) REFERENCES products (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
