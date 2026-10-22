USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_reviews (
	review_id INTEGER NOT NULL AUTO_INCREMENT,
	invoice_id INTEGER NOT NULL,
	reviewer_user_id INTEGER,
	revision_number INTEGER NOT NULL,
	status VARCHAR(32) NOT NULL,
	reviewed_at DATETIME,
	review_note TEXT NOT NULL,
	snapshot_json JSON NOT NULL,
	content_hash VARCHAR(64),
	invalidated_at DATETIME,
	PRIMARY KEY (review_id),
	CONSTRAINT uq_invoice_review_revision UNIQUE (invoice_id, revision_number),
	FOREIGN KEY(invoice_id) REFERENCES invoices (id),
	FOREIGN KEY(reviewer_user_id) REFERENCES users (id)
);
