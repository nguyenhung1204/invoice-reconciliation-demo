USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS datasets (
	id INTEGER NOT NULL AUTO_INCREMENT,
	dataset_code VARCHAR(80) NOT NULL,
	title VARCHAR(255) NOT NULL,
	description TEXT,
	source_file VARCHAR(255),
	source_sheet VARCHAR(255),
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);
