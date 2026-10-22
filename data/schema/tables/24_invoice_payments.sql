USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_payments (
	payment_id INTEGER NOT NULL AUTO_INCREMENT,
	approval_id INTEGER NOT NULL,
	recorded_by_user_id INTEGER,
	amount NUMERIC(18, 2) NOT NULL,
	currency_code VARCHAR(3) NOT NULL,
	paid_at DATETIME NOT NULL,
	method VARCHAR(40),
	reference VARCHAR(160),
	note TEXT NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (payment_id),
	FOREIGN KEY(approval_id) REFERENCES invoice_approvals (approval_id),
	FOREIGN KEY(recorded_by_user_id) REFERENCES users (id)
);
