USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_files (
	invoice_file_id INTEGER NOT NULL AUTO_INCREMENT,
	invoice_id INTEGER NOT NULL,
	original_name VARCHAR(255) NOT NULL,
	relative_path VARCHAR(700) NOT NULL,
	mime_type VARCHAR(100) NOT NULL,
	size_bytes INTEGER NOT NULL,
	sha256 VARCHAR(64),
	is_primary BOOL NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (invoice_file_id),
	FOREIGN KEY(invoice_id) REFERENCES invoices (id),
	UNIQUE (sha256)
);
