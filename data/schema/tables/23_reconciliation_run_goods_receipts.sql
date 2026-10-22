USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS reconciliation_run_goods_receipts (
	id INTEGER NOT NULL AUTO_INCREMENT,
	reconciliation_run_id INTEGER NOT NULL,
	gr_id INTEGER NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_reconciliation_run_gr UNIQUE (reconciliation_run_id, gr_id),
	FOREIGN KEY(reconciliation_run_id) REFERENCES reconciliation_runs (reconciliation_run_id),
	FOREIGN KEY(gr_id) REFERENCES goods_receipts (id)
);
