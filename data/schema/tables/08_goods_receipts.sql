USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS goods_receipts (
	id INTEGER NOT NULL AUTO_INCREMENT,
	receipt_number VARCHAR(80) NOT NULL,
	po_id INTEGER NOT NULL,
	po_number VARCHAR(80) NOT NULL,
	received_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT fk_goods_receipts_po FOREIGN KEY(po_id) REFERENCES purchase_orders (id)
);
