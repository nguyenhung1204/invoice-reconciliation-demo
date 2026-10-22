USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS goods_receipt_items (
	id INTEGER NOT NULL AUTO_INCREMENT,
	gr_id INTEGER NOT NULL,
	po_item_id INTEGER,
	line_number INTEGER NOT NULL,
	product_id INTEGER,
	item_description TEXT NOT NULL,
	unit VARCHAR(80),
	quantity_received NUMERIC(18, 4) NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_goods_receipt_item_line UNIQUE (gr_id, line_number),
	FOREIGN KEY(gr_id) REFERENCES goods_receipts (id),
	FOREIGN KEY(po_item_id) REFERENCES purchase_order_items (id),
	FOREIGN KEY(product_id) REFERENCES products (id)
);
