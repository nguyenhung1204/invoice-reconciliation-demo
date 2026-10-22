USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS reconciliation_findings (
  finding_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_run_id BIGINT UNSIGNED NOT NULL,
  finding_type VARCHAR(80) NOT NULL,
  severity VARCHAR(24) NOT NULL,
  invoice_item_id BIGINT UNSIGNED NULL,
  po_item_id BIGINT UNSIGNED NULL,
  gr_item_id BIGINT UNSIGNED NULL,
  expected_value DECIMAL(18,4) NULL,
  actual_value DECIMAL(18,4) NULL,
  difference_value DECIMAL(18,4) NULL,
  details TEXT NULL,
  PRIMARY KEY (finding_id),
  KEY ix_reconciliation_findings_run (reconciliation_run_id),
  CONSTRAINT fk_reconciliation_findings_run FOREIGN KEY (reconciliation_run_id)
    REFERENCES reconciliation_runs (reconciliation_run_id),
  CONSTRAINT fk_reconciliation_findings_invoice_item FOREIGN KEY (invoice_item_id)
    REFERENCES invoice_items (invoice_item_id),
  CONSTRAINT fk_reconciliation_findings_po_item FOREIGN KEY (po_item_id)
    REFERENCES purchase_order_items (po_item_id),
  CONSTRAINT fk_reconciliation_findings_gr_item FOREIGN KEY (gr_item_id)
    REFERENCES goods_receipt_items (gr_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
