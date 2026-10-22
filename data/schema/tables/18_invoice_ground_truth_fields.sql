USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_ground_truth_fields (
	id INTEGER NOT NULL AUTO_INCREMENT,
	dataset_invoice_id INTEGER NOT NULL,
	field_key VARCHAR(80) NOT NULL,
	raw_value TEXT NOT NULL,
	normalized_value TEXT,
	source_column VARCHAR(255) NOT NULL,
	annotation_status VARCHAR(32) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_invoice_ground_truth_field UNIQUE (dataset_invoice_id, field_key),
	FOREIGN KEY(dataset_invoice_id) REFERENCES dataset_invoices (id) ON DELETE CASCADE
);
