USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS products (
	id INTEGER NOT NULL AUTO_INCREMENT,
	sku VARCHAR(80),
	product_name VARCHAR(500) NOT NULL,
	unit VARCHAR(80),
	active BOOL NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (sku)
);
