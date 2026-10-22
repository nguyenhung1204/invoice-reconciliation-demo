USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS users (
	id INTEGER NOT NULL AUTO_INCREMENT,
	email VARCHAR(255) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	`role` VARCHAR(40) NOT NULL,
	active BOOL NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);
