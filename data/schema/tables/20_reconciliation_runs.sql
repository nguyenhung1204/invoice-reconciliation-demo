USE invoice_reconciliation_data;

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  reconciliation_run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  po_id BIGINT UNSIGNED NULL,
  gr_id BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL,
  amount_tolerance DECIMAL(18,2) NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  run_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (reconciliation_run_id),
  KEY ix_reconciliation_runs_invoice (invoice_id),
  CONSTRAINT fk_reconciliation_runs_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (invoice_id),
  CONSTRAINT fk_reconciliation_runs_po FOREIGN KEY (po_id) REFERENCES purchase_orders (po_id),
  CONSTRAINT fk_reconciliation_runs_gr FOREIGN KEY (gr_id) REFERENCES goods_receipts (gr_id),
  CONSTRAINT fk_reconciliation_runs_user FOREIGN KEY (run_by_user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
