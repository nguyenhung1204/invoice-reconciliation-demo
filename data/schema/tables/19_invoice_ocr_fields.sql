USE `invoice_reconciliation`;

CREATE TABLE IF NOT EXISTS invoice_ocr_fields (
	ocr_field_id INTEGER NOT NULL AUTO_INCREMENT,
	ocr_run_id INTEGER NOT NULL,
	field_key VARCHAR(80) NOT NULL,
	value_text TEXT,
	normalized_value TEXT,
	confidence NUMERIC(7, 6),
	page_number INTEGER,
	bbox_json JSON,
	warning TEXT,
	PRIMARY KEY (ocr_field_id),
	FOREIGN KEY(ocr_run_id) REFERENCES invoice_ocr_runs (ocr_run_id)
);
