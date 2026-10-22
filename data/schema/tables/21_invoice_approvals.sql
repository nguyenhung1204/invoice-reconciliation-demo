USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_approvals (
	approval_id INTEGER NOT NULL AUTO_INCREMENT,
	invoice_id INTEGER NOT NULL,
	review_id INTEGER NOT NULL,
	reconciliation_run_id INTEGER NOT NULL,
	approver_user_id INTEGER,
	status VARCHAR(32) NOT NULL,
	approved_amount NUMERIC(18, 2) NOT NULL,
	currency_code VARCHAR(3) NOT NULL,
	snapshot_json JSON NOT NULL,
	content_hash VARCHAR(64) NOT NULL,
	decided_at DATETIME NOT NULL,
	PRIMARY KEY (approval_id),
	FOREIGN KEY(invoice_id) REFERENCES invoices (id),
	FOREIGN KEY(review_id) REFERENCES invoice_reviews (review_id),
	FOREIGN KEY(reconciliation_run_id) REFERENCES reconciliation_runs (reconciliation_run_id),
	FOREIGN KEY(approver_user_id) REFERENCES users (id)
);
