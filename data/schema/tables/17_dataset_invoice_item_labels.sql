USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS dataset_invoice_item_labels (
	id INTEGER NOT NULL AUTO_INCREMENT,
	dataset_invoice_id INTEGER NOT NULL,
	line_number INTEGER NOT NULL,
	item_description TEXT NOT NULL,
	unit VARCHAR(80),
	quantity NUMERIC(18, 4),
	unit_price NUMERIC(18, 2),
	annotation_status VARCHAR(32) NOT NULL,
	source_column VARCHAR(255) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_dataset_invoice_item_label UNIQUE (dataset_invoice_id, line_number),
	FOREIGN KEY(dataset_invoice_id) REFERENCES dataset_invoices (id) ON DELETE CASCADE
);
