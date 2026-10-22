USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS reconciliation_runs (
	reconciliation_run_id INTEGER NOT NULL AUTO_INCREMENT,
	invoice_id INTEGER NOT NULL,
	review_id INTEGER,
	po_id INTEGER,
	gr_id INTEGER,
	status VARCHAR(32) NOT NULL,
	result_json JSON NOT NULL,
	amount_tolerance NUMERIC(18, 2) NOT NULL,
	started_at DATETIME,
	finished_at DATETIME,
	run_by_user_id INTEGER,
	PRIMARY KEY (reconciliation_run_id),
	FOREIGN KEY(invoice_id) REFERENCES invoices (id),
	FOREIGN KEY(review_id) REFERENCES invoice_reviews (review_id),
	FOREIGN KEY(po_id) REFERENCES purchase_orders (id),
	FOREIGN KEY(gr_id) REFERENCES goods_receipts (id),
	FOREIGN KEY(run_by_user_id) REFERENCES users (id)
);
