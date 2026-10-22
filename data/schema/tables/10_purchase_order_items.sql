USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS purchase_order_items (
	id INTEGER NOT NULL AUTO_INCREMENT,
	po_id INTEGER NOT NULL,
	line_number INTEGER NOT NULL,
	product_id INTEGER,
	item_description TEXT NOT NULL,
	unit VARCHAR(80),
	quantity NUMERIC(18, 4) NOT NULL,
	unit_price NUMERIC(18, 2) NOT NULL,
	line_total NUMERIC(18, 2),
	PRIMARY KEY (id),
	CONSTRAINT uq_purchase_order_item_line UNIQUE (po_id, line_number),
	FOREIGN KEY(po_id) REFERENCES purchase_orders (id),
	FOREIGN KEY(product_id) REFERENCES products (id)
);
