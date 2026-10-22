USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_items (
	id INTEGER NOT NULL AUTO_INCREMENT,
	invoice_id INTEGER NOT NULL,
	line_number INTEGER NOT NULL,
	product_id INTEGER,
	item_description TEXT NOT NULL,
	unit VARCHAR(80),
	quantity NUMERIC(18, 4),
	unit_price NUMERIC(18, 2),
	tax_rate NUMERIC(7, 4),
	line_total NUMERIC(18, 2),
	data_source VARCHAR(32) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_invoice_item_line UNIQUE (invoice_id, line_number),
	FOREIGN KEY(invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
	FOREIGN KEY(product_id) REFERENCES products (id)
);
