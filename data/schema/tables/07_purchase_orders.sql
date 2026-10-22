USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS purchase_orders (
	id INTEGER NOT NULL AUTO_INCREMENT,
	po_number VARCHAR(80) NOT NULL,
	supplier_id INTEGER NOT NULL,
	supplier_tax_code VARCHAR(32) NOT NULL,
	total_amount NUMERIC(18, 2) NOT NULL,
	status VARCHAR(32) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT fk_purchase_orders_supplier FOREIGN KEY(supplier_id) REFERENCES suppliers (id)
);
