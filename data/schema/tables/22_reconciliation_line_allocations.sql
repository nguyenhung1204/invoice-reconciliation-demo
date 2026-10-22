USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS reconciliation_line_allocations (
	allocation_id INTEGER NOT NULL AUTO_INCREMENT,
	reconciliation_run_id INTEGER NOT NULL,
	invoice_item_id INTEGER NOT NULL,
	po_item_id INTEGER,
	gr_item_id INTEGER,
	allocated_quantity NUMERIC(18, 4),
	allocated_amount NUMERIC(18, 2),
	invoice_snapshot_json JSON NOT NULL,
	po_snapshot_json JSON NOT NULL,
	gr_snapshot_json JSON NOT NULL,
	PRIMARY KEY (allocation_id),
	FOREIGN KEY(reconciliation_run_id) REFERENCES reconciliation_runs (reconciliation_run_id),
	FOREIGN KEY(invoice_item_id) REFERENCES invoice_items (id),
	FOREIGN KEY(po_item_id) REFERENCES purchase_order_items (id),
	FOREIGN KEY(gr_item_id) REFERENCES goods_receipt_items (id)
);
