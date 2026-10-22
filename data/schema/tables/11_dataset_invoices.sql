USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS dataset_invoices (
	id INTEGER NOT NULL AUTO_INCREMENT,
	dataset_id INTEGER NOT NULL,
	invoice_id INTEGER NOT NULL,
	source_record_id VARCHAR(100) NOT NULL,
	source_image VARCHAR(255),
	source_workbook VARCHAR(255) NOT NULL,
	source_sheet VARCHAR(255) NOT NULL,
	source_row INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_dataset_invoice UNIQUE (dataset_id, invoice_id),
	CONSTRAINT uq_dataset_source_record UNIQUE (dataset_id, source_record_id),
	FOREIGN KEY(dataset_id) REFERENCES datasets (id) ON DELETE CASCADE,
	FOREIGN KEY(invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
);
